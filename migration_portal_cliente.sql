-- ============================================================================
-- DineroYa — Migración: Portal del cliente + solicitudes de crédito
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (proyecto existente).
-- Es idempotente: se puede volver a ejecutar sin romper datos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Nuevo rol de sistema
-- ---------------------------------------------------------------------------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cliente';

-- Ficha de cliente vinculada al usuario autenticado.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. Solicitudes de crédito
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS credit_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  applicant_name VARCHAR(255) NOT NULL,
  document VARCHAR(50),
  phone VARCHAR(50),
  email VARCHAR(255),
  address VARCHAR(500),
  requested_amount DECIMAL(15,2) NOT NULL CHECK (requested_amount > 0),
  purpose TEXT,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON credit_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_client ON credit_applications(client_id);
CREATE INDEX IF NOT EXISTS idx_applications_client_day ON credit_applications(client_id, created_at DESC);

-- Monto con el que finalmente se aprueba el crédito (puede diferir del solicitado).
ALTER TABLE credit_applications ADD COLUMN IF NOT EXISTS approved_amount DECIMAL(15,2) CHECK (approved_amount > 0);

ALTER TABLE credit_applications ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Helpers de rol / vínculo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_my_client_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION fn_is_client() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT role::text = 'cliente' FROM profiles WHERE id = auth.uid()), FALSE);
$$;

-- ---------------------------------------------------------------------------
-- 3b. Límites anti-saturación de solicitudes
--   · máximo 3 solicitudes por día hechas por el propio cliente
--   · se rechaza de inmediato una solicitud repetida (mismo cliente y monto)
--     mientras la anterior siga pendiente
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_application_limits()
RETURNS TRIGGER AS $$
DECLARE
  v_client UUID := NEW.client_id;
  v_today INTEGER;
  v_limit CONSTANT INTEGER := 3;
BEGIN
  -- Si el portal no trae la ficha vinculada, se intenta identificar por email.
  IF v_client IS NULL AND NEW.email IS NOT NULL THEN
    SELECT c.id INTO v_client FROM clients c
     WHERE lower(c.email) = lower(NEW.email) LIMIT 1;
    NEW.client_id := v_client;
  END IF;

  -- Repetida: misma persona, mismo monto y ya tiene una pendiente.
  IF EXISTS (
    SELECT 1 FROM credit_applications a
     WHERE a.status = 'pending'
       AND a.requested_amount = NEW.requested_amount
       AND ((v_client IS NOT NULL AND a.client_id = v_client)
            OR (v_client IS NULL AND NEW.email IS NOT NULL AND lower(a.email) = lower(NEW.email)))
  ) THEN
    RAISE EXCEPTION 'Ya tienes una solicitud pendiente por ese mismo monto. Espera la respuesta antes de enviar otra.';
  END IF;

  -- Tope diario: solo para solicitudes hechas por el propio cliente.
  IF (SELECT fn_is_client()) THEN
    SELECT COUNT(*) INTO v_today FROM credit_applications a
     WHERE (a.created_at AT TIME ZONE 'America/Bogota')::date = (NOW() AT TIME ZONE 'America/Bogota')::date
       AND a.status <> 'cancelled'
       AND ((v_client IS NOT NULL AND a.client_id = v_client)
            OR (v_client IS NULL AND NEW.email IS NOT NULL AND lower(a.email) = lower(NEW.email)));
    IF v_today >= v_limit THEN
      RAISE EXCEPTION 'Límite alcanzado: solo puedes enviar % solicitudes por día. Intenta mañana.', v_limit;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_application_limits ON credit_applications;
CREATE TRIGGER trg_application_limits
BEFORE INSERT ON credit_applications
FOR EACH ROW EXECUTE FUNCTION fn_check_application_limits();

-- Un cliente solo puede ver los préstamos de su propia ficha.
CREATE OR REPLACE FUNCTION fn_can_see_loan(p_loan UUID) RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN (SELECT fn_is_client()) THEN EXISTS (
      SELECT 1 FROM loans l WHERE l.id = p_loan AND l.client_id = (SELECT fn_my_client_id())
    )
    ELSE COALESCE((
      SELECT l.assigned_to = auth.uid() OR l.assigned_to IS NULL
      FROM loans l WHERE l.id = p_loan
    ), TRUE)
  END;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 4. RLS: aislar a los clientes de la cartera interna
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "clients_read" ON clients;
CREATE POLICY "clients_read" ON clients FOR SELECT TO authenticated
  USING (
    NOT (SELECT fn_is_client())
    OR id = (SELECT fn_my_client_id())
  );

DROP POLICY IF EXISTS "clients_write" ON clients;
CREATE POLICY "clients_write" ON clients FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_client()));

DROP POLICY IF EXISTS "clients_update" ON clients;
CREATE POLICY "clients_update" ON clients FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_client()))
  WITH CHECK (NOT (SELECT fn_is_client()));

DROP POLICY IF EXISTS "loans_read" ON loans;
CREATE POLICY "loans_read" ON loans FOR SELECT TO authenticated
  USING (
    ((SELECT fn_my_role()) IN ('admin','gerente') OR assigned_to = auth.uid() OR assigned_to IS NULL)
    AND (NOT (SELECT fn_is_client()) OR client_id = (SELECT fn_my_client_id()))
  );

DROP POLICY IF EXISTS "loans_insert" ON loans;
CREATE POLICY "loans_insert" ON loans FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_client()));

DROP POLICY IF EXISTS "loans_update" ON loans;
CREATE POLICY "loans_update" ON loans FOR UPDATE TO authenticated
  USING (
    NOT (SELECT fn_is_client())
    AND ((SELECT fn_my_role()) IN ('admin','gerente') OR assigned_to = auth.uid() OR assigned_to IS NULL)
  );

-- Lectura de cuotas/pagos/gestiones ya pasa por fn_can_see_loan (actualizado arriba).
DROP POLICY IF EXISTS "installments_read" ON installments;
CREATE POLICY "installments_read" ON installments FOR SELECT TO authenticated
  USING ((SELECT fn_can_see_loan(loan_id)));

DROP POLICY IF EXISTS "payments_read" ON payments;
CREATE POLICY "payments_read" ON payments FOR SELECT TO authenticated
  USING ((SELECT fn_can_see_loan(loan_id)));

DROP POLICY IF EXISTS "activities_read" ON collection_activities;
CREATE POLICY "activities_read" ON collection_activities FOR SELECT TO authenticated
  USING ((SELECT fn_can_see_loan(loan_id)));

DROP POLICY IF EXISTS "activities_write" ON collection_activities;
CREATE POLICY "activities_write" ON collection_activities FOR INSERT TO authenticated
  WITH CHECK (NOT (SELECT fn_is_client()));

-- Los clientes no deben escribir pagos ni auditoría directamente.
DROP POLICY IF EXISTS "allocations_read" ON payment_allocations;
CREATE POLICY "allocations_read" ON payment_allocations FOR SELECT TO authenticated
  USING ((SELECT fn_can_see_loan(
    (SELECT loan_id FROM payments WHERE payments.id = payment_allocations.payment_id))));

DROP POLICY IF EXISTS "audit_read" ON audit_events;
CREATE POLICY "audit_read" ON audit_events FOR SELECT TO authenticated
  USING ((SELECT fn_my_role()) IN ('admin','gerente'));

-- Solicitudes: el cliente ve y crea las suyas; el staff ve y resuelve todas.
DROP POLICY IF EXISTS "applications_read" ON credit_applications;
CREATE POLICY "applications_read" ON credit_applications FOR SELECT TO authenticated
  USING (
    NOT (SELECT fn_is_client())
    OR client_id = (SELECT fn_my_client_id())
    OR (email IS NOT NULL AND lower(email) = lower(auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "applications_insert" ON credit_applications;
CREATE POLICY "applications_insert" ON credit_applications FOR INSERT TO authenticated
  WITH CHECK (
    NOT (SELECT fn_is_client())
    OR client_id IS NULL
    OR client_id = (SELECT fn_my_client_id())
  );

DROP POLICY IF EXISTS "applications_update" ON credit_applications;
CREATE POLICY "applications_update" ON credit_applications FOR UPDATE TO authenticated
  USING (NOT (SELECT fn_is_client()))
  WITH CHECK (NOT (SELECT fn_is_client()));

-- ---------------------------------------------------------------------------
-- 5. Alta automática: cliente se registra → se crea su ficha vinculada
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT;
  v_name TEXT;
  v_phone TEXT;
  v_doc TEXT;
  v_client UUID;
BEGIN
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'cobrador');
  -- Nunca permitir que el registro público se auto-asigne admin/gerente.
  IF v_role NOT IN ('cliente', 'cobrador', 'gerente') THEN
    v_role := 'cobrador';
  END IF;

  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);

  IF v_role = 'cliente' THEN
    v_phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
    v_doc := NEW.raw_user_meta_data->>'document';
    INSERT INTO public.clients (name, phone, email, document, created_by)
    VALUES (v_name, v_phone, NEW.email, v_doc, NEW.id)
    RETURNING id INTO v_client;
  END IF;

  INSERT INTO public.profiles (id, full_name, role, role_id, client_id)
  VALUES (NEW.id, v_name, v_role::user_role, v_role, v_client);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 6. Rol de sistema "cliente" (pantalla del portal)
-- ---------------------------------------------------------------------------
INSERT INTO roles (id, name, screens, perms, is_system) VALUES
  ('cliente', 'Cliente', ARRAY['portal'], '{}'::jsonb, TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, screens = EXCLUDED.screens, perms = EXCLUDED.perms, is_system = TRUE;

-- Añadir la pantalla de solicitudes a los roles internos existentes.
UPDATE roles
  SET screens = array_append(screens, 'applications')
  WHERE id IN ('admin','gerente') AND NOT ('applications' = ANY(screens));

-- ---------------------------------------------------------------------------
-- 7. Reestructuración de préstamos
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_restructure_loan(
  p_loan_id UUID,
  p_count INTEGER,
  p_frequency loan_frequency,
  p_first_due DATE
) RETURNS VOID AS $$
DECLARE
  v_kept INT;
  v_start INT;
  v_remaining DECIMAL;
  v_new_pending INT;
  v_each DECIMAL;
  v_last DECIMAL;
  v_step INTERVAL;
  v_due DATE;
  i INTEGER;
BEGIN
  IF (SELECT fn_my_role()) NOT IN ('admin','gerente') THEN
    RAISE EXCEPTION 'Sin permiso para reestructurar préstamos';
  END IF;
  IF p_count IS NULL OR p_count < 1 THEN
    RAISE EXCEPTION 'El número de cuotas debe ser mayor a cero';
  END IF;

  SELECT COUNT(*), COALESCE(MAX(installment_number), 0)
    INTO v_kept, v_start
    FROM installments
    WHERE loan_id = p_loan_id AND (status IN ('paid','waived') OR amount_paid > 0);

  SELECT COALESCE(SUM(amount_due - amount_paid), 0)
    INTO v_remaining
    FROM installments
    WHERE loan_id = p_loan_id AND NOT (status IN ('paid','waived') OR amount_paid > 0);

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'El préstamo no tiene saldo pendiente por reestructurar';
  END IF;

  v_new_pending := p_count - v_kept;
  IF v_new_pending < 1 THEN
    RAISE EXCEPTION 'El total de cuotas debe ser mayor a las % cuotas ya pagadas o abonadas', v_kept;
  END IF;

  DELETE FROM installments
    WHERE loan_id = p_loan_id AND NOT (status IN ('paid','waived') OR amount_paid > 0);

  v_each := ROUND(v_remaining / v_new_pending, 2);
  v_last := v_remaining - v_each * (v_new_pending - 1);
  v_step := CASE p_frequency
    WHEN 'weekly' THEN INTERVAL '7 days'
    WHEN 'biweekly' THEN INTERVAL '15 days'
    ELSE INTERVAL '1 month' END;
  v_due := p_first_due;

  FOR i IN 1..v_new_pending LOOP
    INSERT INTO installments (loan_id, installment_number, due_date, amount_due)
    VALUES (p_loan_id, v_start + i, v_due,
            CASE WHEN i = v_new_pending THEN v_last ELSE v_each END);
    v_due := (v_due + v_step)::date;
  END LOOP;

  UPDATE loans
    SET installments_count = p_count,
        frequency = p_frequency,
        first_due_date = p_first_due,
        status = CASE
          WHEN EXISTS (
            SELECT 1 FROM installments
            WHERE loan_id = p_loan_id AND due_date < CURRENT_DATE AND status NOT IN ('paid','waived')
          ) THEN 'overdue'::loan_status
          ELSE 'active'::loan_status
        END
    WHERE id = p_loan_id AND status NOT IN ('paid','cancelled');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION fn_restructure_loan(UUID, INTEGER, loan_frequency, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_my_client_id() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_is_client() TO authenticated;
GRANT SELECT, INSERT, UPDATE ON credit_applications TO authenticated;

-- ============================================================================
-- Fin de la migración
-- ============================================================================

-- ============================================================================
-- Recaudos: catálogo editable de métodos de pago + pantalla de recaudos
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO payment_methods (id, name, sort_order) VALUES
  ('cash', 'Efectivo', 1),
  ('transfer', 'Transferencia', 2),
  ('card', 'Tarjeta', 3),
  ('other', 'Otro', 4)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_methods_read" ON payment_methods;
CREATE POLICY "payment_methods_read" ON payment_methods FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "payment_methods_write" ON payment_methods;
CREATE POLICY "payment_methods_write" ON payment_methods FOR ALL TO authenticated
  USING (fn_has_perm('editSettings')) WITH CHECK (fn_has_perm('editSettings'));

GRANT SELECT, INSERT, UPDATE ON payment_methods TO authenticated;

-- Pantalla "Recaudos" para el equipo (el portal del cliente no la ve).
UPDATE roles
  SET screens = array_append(screens, 'payments')
  WHERE id IN ('admin', 'gerente', 'cobrador') AND NOT ('payments' = ANY(screens));

-- Módulos operativos: notificaciones, canales de pago y reportes

-- ----------------------------------------------------------------------------
-- 1. Centro de notificaciones y automatización
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  channel VARCHAR(10) NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email')),
  subject VARCHAR(160),
  body TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO notification_templates (id, name, channel, subject, body) VALUES
  ('recordatorio_cuota', 'Recordatorio de cuota por vencer', 'whatsapp', NULL,
   'Hola {{cliente}}, te recordamos que tu cuota #{{cuota}} por {{monto}} vence el {{fecha}}. Puedes pagar en efectivo, por transferencia o por los canales de pago de {{empresa}}. ¡Gracias!'),
  ('cuota_vencida', 'Cuota vencida', 'whatsapp', NULL,
   'Hola {{cliente}}, tu cuota #{{cuota}} por {{monto}} venció el {{fecha}} y sigue pendiente. Tu saldo total es {{saldo}}. Escríbenos para acordar el pago con {{empresa}}.'),
  ('promesa_incumplida', 'Promesa de pago incumplida', 'whatsapp', NULL,
   'Hola {{cliente}}, no registramos el pago que acordaste para el {{fecha}}. Tu saldo pendiente es {{saldo}}. ¿Podemos acordar una nueva fecha? — {{empresa}}.'),
  ('pago_recibido', 'Confirmación de pago', 'whatsapp', NULL,
   'Hola {{cliente}}, recibimos tu pago por {{monto}}. Tu nuevo saldo es {{saldo}}. ¡Gracias por cumplir! — {{empresa}}.'),
  ('recordatorio_correo', 'Recordatorio de cuota (correo)', 'email', 'Recordatorio de tu cuota en {{empresa}}',
   'Hola {{cliente}}:' || chr(10) || chr(10) ||
   'Tu cuota #{{cuota}} por {{monto}} vence el {{fecha}}. Tu saldo pendiente es {{saldo}}.' || chr(10) || chr(10) ||
   'Puedes pagar en efectivo, por transferencia o por nuestros canales de pago.' || chr(10) || chr(10) || '{{empresa}}')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  loan_id UUID REFERENCES loans(id) ON DELETE SET NULL,
  channel VARCHAR(10) NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','email')),
  template_id TEXT,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. Canales de pago y pasarelas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(80) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'bank_account'
    CHECK (kind IN ('bank_account','wallet','card_gateway','cash_office')),
  account_info VARCHAR(200),
  instructions TEXT,
  link TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO payment_channels (name, kind, account_info, instructions, sort_order)
SELECT 'Efectivo en oficina', 'cash_office', NULL, 'Acércate a la oficina en horario laboral.', 1
WHERE NOT EXISTS (SELECT 1 FROM payment_channels);

INSERT INTO payment_channels (name, kind, account_info, instructions, sort_order)
SELECT 'Transferencia bancaria', 'bank_account', NULL, 'Envía el comprobante por WhatsApp.', 2
WHERE (SELECT count(*) FROM payment_channels) = 1;

-- ----------------------------------------------------------------------------
-- 3. Seguridad (RLS) y permisos
-- ----------------------------------------------------------------------------
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_templates_staff" ON notification_templates;
CREATE POLICY "notification_templates_staff" ON notification_templates FOR ALL TO authenticated
  USING (NOT (SELECT fn_is_client())) WITH CHECK (NOT (SELECT fn_is_client()));

DROP POLICY IF EXISTS "notifications_staff" ON notifications;
CREATE POLICY "notifications_staff" ON notifications FOR ALL TO authenticated
  USING (NOT (SELECT fn_is_client())) WITH CHECK (NOT (SELECT fn_is_client()));

-- Los canales sí los ve el cliente en el portal; solo el admin los edita.
DROP POLICY IF EXISTS "payment_channels_read" ON payment_channels;
CREATE POLICY "payment_channels_read" ON payment_channels FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "payment_channels_write" ON payment_channels;
CREATE POLICY "payment_channels_write" ON payment_channels FOR ALL TO authenticated
  USING (fn_has_perm('editSettings')) WITH CHECK (fn_has_perm('editSettings'));

GRANT SELECT, INSERT, UPDATE ON notification_templates, notifications, payment_channels TO authenticated;

-- Pantallas nuevas por rol.
UPDATE roles SET screens = array_append(screens, 'notifications')
  WHERE id IN ('admin','gerente','cobrador') AND NOT ('notifications' = ANY(screens));
UPDATE roles SET screens = array_append(screens, 'channels')
  WHERE id IN ('admin','gerente') AND NOT ('channels' = ANY(screens));
UPDATE roles SET screens = array_append(screens, 'reports')
  WHERE id IN ('admin','gerente') AND NOT ('reports' = ANY(screens));
