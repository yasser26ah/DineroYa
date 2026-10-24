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

  INSERT INTO public.profiles (id, full_name, role, client_id)
  VALUES (NEW.id, v_name, v_role::user_role, v_client);
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
