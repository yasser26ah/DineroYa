-- ============================================================================
-- DineroYa — Cartera de Préstamos | Esquema completo para Supabase (Postgres)
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensiones y tipos
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'gerente', 'cobrador');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE loan_status AS ENUM ('active', 'overdue', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE installment_status AS ENUM ('pending', 'partial', 'paid', 'overdue', 'waived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE loan_frequency AS ENUM ('weekly', 'biweekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM ('call', 'whatsapp', 'visit', 'note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE activity_result AS ENUM (
    'contacted_promised', 'contacted_no_promise', 'no_answer',
    'refuses_to_pay', 'payment_received', 'message_sent', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1. Perfiles (equipo) — se crean automáticamente al registrarse
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'cobrador',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- El primer usuario de la organización queda como admin automáticamente.
CREATE OR REPLACE FUNCTION fn_first_user_becomes_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM profiles) = 0 THEN
    NEW.role := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_first_user_becomes_admin ON profiles;
CREATE TRIGGER trg_first_user_becomes_admin
BEFORE INSERT ON profiles
FOR EACH ROW EXECUTE FUNCTION fn_first_user_becomes_admin();

CREATE OR REPLACE FUNCTION fn_handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION fn_handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Clientes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  document VARCHAR(50),
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  address VARCHAR(500),
  notes TEXT,
  registration_date DATE NOT NULL DEFAULT CURRENT_DATE,
  risk_score INTEGER NOT NULL DEFAULT 50 CHECK (risk_score BETWEEN 1 AND 100),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

-- ---------------------------------------------------------------------------
-- 3. Préstamos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  principal DECIMAL(15,2) NOT NULL CHECK (principal > 0),
  interest_rate DECIMAL(5,2) NOT NULL CHECK (interest_rate >= 0),
  total_interest DECIMAL(15,2) NOT NULL,
  total_due DECIMAL(15,2) NOT NULL,
  installments_count INTEGER NOT NULL CHECK (installments_count > 0),
  frequency loan_frequency NOT NULL DEFAULT 'monthly',
  first_due_date DATE NOT NULL,
  status loan_status NOT NULL DEFAULT 'active',
  notes TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loans_client ON loans(client_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);
CREATE INDEX IF NOT EXISTS idx_loans_assigned ON loans(assigned_to);

-- ---------------------------------------------------------------------------
-- 4. Cuotas (calendario generado por la app o por fn_generate_schedule)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS installments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL CHECK (installment_number > 0),
  due_date DATE NOT NULL,
  amount_due DECIMAL(15,2) NOT NULL CHECK (amount_due > 0),
  amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status installment_status NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  UNIQUE (loan_id, installment_number)
);
CREATE INDEX IF NOT EXISTS idx_installments_loan ON installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_installments_due ON installments(due_date, status);

-- Generador de calendario: interés plano repartido en cuotas iguales,
-- primera cuota a 30 días (mensual) / 7 (semanal) / 15 (quincenal).
CREATE OR REPLACE FUNCTION fn_generate_schedule(
  p_loan_id UUID, p_principal DECIMAL, p_rate DECIMAL,
  p_count INTEGER, p_frequency loan_frequency, p_first_due DATE
) RETURNS VOID AS $$
DECLARE
  v_total DECIMAL := ROUND(p_principal * (1 + p_rate / 100), 2);
  v_each DECIMAL := ROUND(v_total / p_count, 2);
  v_last DECIMAL := v_total - v_each * (p_count - 1); -- ajusta centavos
  v_step INTERVAL := CASE p_frequency
    WHEN 'weekly' THEN INTERVAL '7 days'
    WHEN 'biweekly' THEN INTERVAL '15 days'
    ELSE INTERVAL '1 month' END;
  v_due DATE := p_first_due;
  i INTEGER;
BEGIN
  DELETE FROM installments WHERE loan_id = p_loan_id;
  FOR i IN 1..p_count LOOP
    INSERT INTO installments (loan_id, installment_number, due_date, amount_due)
    VALUES (p_loan_id, i, v_due, CASE WHEN i = p_count THEN v_last ELSE v_each END);
    v_due := CASE p_frequency
      WHEN 'monthly' THEN (v_due + v_step)::date
      ELSE (v_due + v_step)::date END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 5. Pagos y asignación a cuotas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  method VARCHAR(30) NOT NULL DEFAULT 'cash',
  notes TEXT,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  balance_after DECIMAL(15,2) NOT NULL,
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_loan ON payments(loan_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  installment_id UUID NOT NULL REFERENCES installments(id) ON DELETE CASCADE,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_alloc_payment ON payment_allocations(payment_id);

-- Aplica un pago FIFO a las cuotas más antiguas pendientes.
CREATE OR REPLACE FUNCTION fn_apply_payment(
  p_loan_id UUID, p_amount DECIMAL, p_method VARCHAR,
  p_notes TEXT, p_payment_date DATE
) RETURNS UUID AS $$
DECLARE
  v_payment_id UUID;
  v_remaining DECIMAL := p_amount;
  v_inst RECORD;
  v_apply DECIMAL;
  v_client UUID;
  v_outstanding DECIMAL;
BEGIN
  SELECT client_id INTO v_client FROM loans WHERE id = p_loan_id;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Préstamo % no existe', p_loan_id;
  END IF;

  SELECT COALESCE(SUM(amount_due - amount_paid), 0) INTO v_outstanding
  FROM installments
  WHERE loan_id = p_loan_id AND status NOT IN ('paid', 'waived');
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'El pago (%) excede el saldo pendiente (%)', p_amount, v_outstanding;
  END IF;

  INSERT INTO payments (loan_id, client_id, amount, method, notes, payment_date, balance_after, received_by)
  VALUES (p_loan_id, v_client, p_amount, p_method, p_notes, p_payment_date,
          v_outstanding - p_amount, auth.uid())
  RETURNING id INTO v_payment_id;

  FOR v_inst IN
    SELECT id, amount_due, amount_paid FROM installments
    WHERE loan_id = p_loan_id AND status NOT IN ('paid', 'waived')
    ORDER BY due_date, installment_number
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_apply := LEAST(v_remaining, v_inst.amount_due - v_inst.amount_paid);
    UPDATE installments
      SET amount_paid = amount_paid + v_apply,
          status = CASE WHEN amount_paid + v_apply >= amount_due THEN 'paid' ELSE 'partial' END,
          paid_at = CASE WHEN amount_paid + v_apply >= amount_due THEN NOW() ELSE paid_at END
    WHERE id = v_inst.id;
    INSERT INTO payment_allocations (payment_id, installment_id, amount)
    VALUES (v_payment_id, v_inst.id, v_apply);
    v_remaining := v_remaining - v_apply;
  END LOOP;

  -- ¿Préstamo liquidado?
  IF NOT EXISTS (
    SELECT 1 FROM installments
    WHERE loan_id = p_loan_id AND status NOT IN ('paid', 'waived')
  ) THEN
    UPDATE loans SET status = 'paid' WHERE id = p_loan_id;
  END IF;

  RETURN v_payment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Anulación de pago: revierte asignaciones y saldos, dejando traza.
CREATE OR REPLACE FUNCTION fn_void_payment(p_payment_id UUID, p_reason TEXT)
RETURNS VOID AS $$
DECLARE
  v_loan UUID;
  v_alloc RECORD;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Se requiere un motivo para anular un pago';
  END IF;

  SELECT loan_id INTO v_loan FROM payments WHERE id = p_payment_id;
  IF v_loan IS NULL THEN RAISE EXCEPTION 'Pago % no existe', p_payment_id; END IF;

  UPDATE payments SET notes = COALESCE(notes, '') || ' | ANULADO: ' || p_reason
  WHERE id = p_payment_id;

  FOR v_alloc IN
    SELECT a.installment_id, a.amount FROM payment_allocations a
    WHERE a.payment_id = p_payment_id
  LOOP
    UPDATE installments
      SET amount_paid = GREATEST(0, amount_paid - v_alloc.amount),
          status = CASE WHEN amount_paid - v_alloc.amount <= 0 THEN 'pending' ELSE 'partial' END,
          paid_at = NULL
    WHERE id = v_alloc.installment_id;
  END LOOP;

  DELETE FROM payment_allocations WHERE payment_id = p_payment_id;

  UPDATE loans SET status = 'active'
  WHERE id = v_loan AND status = 'paid'
    AND EXISTS (SELECT 1 FROM installments WHERE loan_id = v_loan AND status NOT IN ('paid','waived'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 6. Gestiones de cobranza
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collection_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  type activity_type NOT NULL,
  result activity_result NOT NULL,
  promise_date DATE, -- compromiso de pago ("prometió pagar el ...")
  notes TEXT,
  activity_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_activities_loan ON collection_activities(loan_id);
CREATE INDEX IF NOT EXISTS idx_activities_promise ON collection_activities(promise_date);

-- ---------------------------------------------------------------------------
-- 7. Bitácora de auditoría (automática por triggers)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  actor UUID REFERENCES auth.users(id),
  actor_name TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_events(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);

CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_action TEXT := TG_OP;
  v_actor UUID := auth.uid();
  v_actor_name TEXT;
  v_details JSONB;
BEGIN
  IF v_actor IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM profiles WHERE id = v_actor;
  END IF;
  v_details := CASE TG_OP
    WHEN 'INSERT' THEN to_jsonb(NEW)
    WHEN 'DELETE' THEN to_jsonb(OLD)
    ELSE jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW))
  END;
  INSERT INTO audit_events (entity, entity_id, action, actor, actor_name, details)
  VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_action, v_actor, v_actor_name, v_details);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_audit_clients ON clients;
CREATE TRIGGER trg_audit_clients AFTER INSERT OR DELETE OR UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_loans ON loans;
CREATE TRIGGER trg_audit_loans AFTER INSERT OR DELETE OR UPDATE ON loans
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_payments ON payments;
CREATE TRIGGER trg_audit_payments AFTER INSERT OR DELETE OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

DROP TRIGGER IF EXISTS trg_audit_activities ON collection_activities;
CREATE TRIGGER trg_audit_activities AFTER INSERT OR DELETE OR UPDATE ON collection_activities
FOR EACH ROW EXECUTE FUNCTION fn_audit_log();

-- ---------------------------------------------------------------------------
-- 8. Riesgo del cliente (recalculado al cambiar préstamos/pagos)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recalculate_client_risk()
RETURNS TRIGGER AS $$
DECLARE
  v_client UUID := COALESCE(NEW.client_id, OLD.client_id);
  v_paid INTEGER; v_overdue INTEGER; v_score INTEGER := 50;
BEGIN
  SELECT COUNT(*) INTO v_paid FROM loans
  WHERE client_id = v_client AND status = 'paid';
  SELECT COUNT(*) INTO v_overdue FROM loans
  WHERE client_id = v_client
    AND (status = 'overdue'
      OR (status = 'active' AND EXISTS (
        SELECT 1 FROM installments i
        WHERE i.loan_id = loans.id AND i.due_date < CURRENT_DATE
          AND i.status NOT IN ('paid','waived'))));
  v_score := v_score + (v_paid * 15) - (v_overdue * 40);
  v_score := GREATEST(1, LEAST(100, v_score));
  UPDATE clients SET risk_score = v_score WHERE id = v_client;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_risk_loans ON loans;
CREATE TRIGGER trg_risk_loans AFTER INSERT OR DELETE OR UPDATE ON loans
FOR EACH ROW EXECUTE FUNCTION fn_recalculate_client_risk();

-- Marcado diario de cuotas vencidas (llamar vía pg_cron o manualmente).
CREATE OR REPLACE FUNCTION fn_mark_overdue()
RETURNS INTEGER AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE installments
    SET status = 'overdue'
    WHERE due_date < CURRENT_DATE AND status IN ('pending', 'partial');
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE loans
    SET status = 'overdue'
    WHERE status = 'active' AND EXISTS (
      SELECT 1 FROM installments i
      WHERE i.loan_id = loans.id AND i.due_date < CURRENT_DATE
        AND i.status NOT IN ('paid','waived'));
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 9. Configuración de la app
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  currency VARCHAR(5) NOT NULL DEFAULT '$',
  default_interest_rate DECIMAL(5,2) NOT NULL DEFAULT 15,
  company_name VARCHAR(255) NOT NULL DEFAULT 'FinanzaPro',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. Vistas operativas
-- ---------------------------------------------------------------------------
-- Saldo pendiente por préstamo
CREATE OR REPLACE VIEW loan_balances AS
SELECT
  l.id AS loan_id,
  l.client_id,
  COALESCE(SUM(CASE WHEN i.status NOT IN ('paid','waived') THEN i.amount_due - i.amount_paid END), 0) AS outstanding
FROM loans l
LEFT JOIN installments i ON i.loan_id = l.id
GROUP BY l.id, l.client_id;

-- Cartera con envejecimiento de mora
CREATE OR REPLACE VIEW aging_report AS
SELECT
  l.id AS loan_id,
  l.client_id,
  c.name AS client_name,
  c.phone AS client_phone,
  l.status,
  l.assigned_to,
  COALESCE(b.outstanding, 0) AS outstanding,
  CASE
    WHEN b.outstanding = 0 THEN 'current'
    ELSE CASE
      WHEN CURRENT_DATE - MIN(i.due_date) FILTER (WHERE i.status IN ('pending','partial','overdue') AND i.due_date < CURRENT_DATE) <= 30 THEN '1-30'
      WHEN CURRENT_DATE - MIN(i.due_date) FILTER (WHERE i.status IN ('pending','partial','overdue') AND i.due_date < CURRENT_DATE) <= 60 THEN '31-60'
      WHEN CURRENT_DATE - MIN(i.due_date) FILTER (WHERE i.status IN ('pending','partial','overdue') AND i.due_date < CURRENT_DATE) <= 90 THEN '61-90'
      ELSE '90+'
    END
  END AS bucket,
  MAX(i.due_date) FILTER (WHERE i.status IN ('pending','partial','overdue')) AS next_due_date,
  CURRENT_DATE - MIN(i.due_date) FILTER (WHERE i.status IN ('pending','partial','overdue') AND i.due_date < CURRENT_DATE) AS days_overdue
FROM loans l
JOIN clients c ON c.id = l.client_id
LEFT JOIN loan_balances b ON b.loan_id = l.id
LEFT JOIN installments i ON i.loan_id = l.id
GROUP BY l.id, l.client_id, c.name, c.phone, l.status, l.assigned_to, b.outstanding;

-- Cola de cobranza del día: vencidas + vencen hoy, con su gestión más reciente
CREATE OR REPLACE VIEW daily_collection_queue AS
SELECT
  l.id AS loan_id,
  l.client_id,
  c.name AS client_name,
  c.phone AS client_phone,
  l.assigned_to,
  a.bucket,
  a.outstanding,
  a.days_overdue,
  a.next_due_date,
  la.last_activity_date,
  la.last_result,
  la.last_promise_date
FROM loans l
JOIN clients c ON c.id = l.client_id
JOIN aging_report a ON a.loan_id = l.id
LEFT JOIN LATERAL (
  SELECT ca.activity_date AS last_activity_date,
         ca.result AS last_result,
         ca.promise_date AS last_promise_date
  FROM collection_activities ca
  WHERE ca.loan_id = l.id
  ORDER BY ca.activity_date DESC LIMIT 1
) la ON TRUE
WHERE a.outstanding > 0
  AND l.status IN ('active', 'overdue')
  AND a.bucket IN ('1-30', '31-60', '61-90', '90+')
ORDER BY a.days_overdue DESC NULLS LAST;

-- Resumen global de cartera
CREATE OR REPLACE VIEW portfolio_summary AS
SELECT
  (SELECT COUNT(*) FROM clients WHERE active) AS total_clients,
  (SELECT COUNT(*) FROM loans WHERE status IN ('active','overdue')) AS active_loans,
  (SELECT COALESCE(SUM(principal), 0) FROM loans WHERE status IN ('active','overdue')) AS total_principal_lent,
  (SELECT COALESCE(SUM(outstanding), 0) FROM loan_balances) AS total_outstanding,
  (SELECT COALESCE(SUM(amount), 0) FROM payments) AS total_collected;

-- ---------------------------------------------------------------------------
-- 11. Row Level Security
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Perfiles: todos los autenticados ven el equipo; solo admin modifica.
CREATE POLICY "profiles_read" ON profiles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK (id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "profiles_admin_insert" ON profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Helper: rol del usuario actual (stable, se evalúa una vez por consulta)
CREATE OR REPLACE FUNCTION fn_my_role() RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: ¿el préstamo está asignado al usuario actual o es gestión libre?
CREATE OR REPLACE FUNCTION fn_can_see_loan(p_loan UUID) RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT l.assigned_to = auth.uid() OR l.assigned_to IS NULL
    FROM loans l WHERE l.id = p_loan
  ), TRUE);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Clientes: todos leen; escritura para todos los roles autenticados (operación diaria).
CREATE POLICY "clients_read" ON clients FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "clients_write" ON clients FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "clients_update" ON clients FOR UPDATE TO authenticated USING (TRUE);
CREATE POLICY "clients_delete" ON clients FOR DELETE TO authenticated
  USING ((SELECT fn_my_role()) = 'admin');

-- Préstamos: cobrador solo ve/crea los suyos (o sin asignar); admin y gerente ven todo.
CREATE POLICY "loans_read" ON loans FOR SELECT TO authenticated
  USING ((SELECT fn_my_role()) IN ('admin','gerente') OR assigned_to = auth.uid() OR assigned_to IS NULL);
CREATE POLICY "loans_insert" ON loans FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "loans_update" ON loans FOR UPDATE TO authenticated
  USING ((SELECT fn_my_role()) IN ('admin','gerente') OR assigned_to = auth.uid() OR assigned_to IS NULL);

-- Cuotas y asignaciones siguen al préstamo (lectura) y a la operación de pagos.
CREATE POLICY "installments_read" ON installments FOR SELECT TO authenticated
  USING ((SELECT fn_can_see_loan(loan_id)));
CREATE POLICY "payments_read" ON payments FOR SELECT TO authenticated
  USING ((SELECT fn_can_see_loan(loan_id)));
CREATE POLICY "allocations_read" ON payment_allocations FOR SELECT TO authenticated
  USING ((SELECT fn_can_see_loan(
    (SELECT loan_id FROM payments WHERE payments.id = payment_allocations.payment_id))));
CREATE POLICY "activities_read" ON collection_activities FOR SELECT TO authenticated
  USING ((SELECT fn_can_see_loan(loan_id)));

-- Escrituras operativas: pagos y gestiones las registra cualquier rol autenticado
-- (las funciones SECURITY DEFINER hacen el trabajo multi-tabla).
CREATE POLICY "activities_write" ON collection_activities FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "activities_update" ON collection_activities FOR UPDATE TO authenticated USING (TRUE);

-- Auditoría: lectura para admin/gerente; escritura solo vía triggers (SECURITY DEFINER).
CREATE POLICY "audit_read" ON audit_events FOR SELECT TO authenticated
  USING ((SELECT fn_my_role()) IN ('admin','gerente'));

-- Configuración: todos leen; solo admin escribe.
CREATE POLICY "settings_read" ON app_settings FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "settings_write" ON app_settings FOR UPDATE TO authenticated
  USING ((SELECT fn_my_role()) = 'admin');

-- ---------------------------------------------------------------------------
-- 12. Permisos de ejecución
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_generate_schedule(UUID, DECIMAL, DECIMAL, INTEGER, loan_frequency, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_apply_payment(UUID, DECIMAL, VARCHAR, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_void_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_mark_overdue() TO authenticated;
GRANT SELECT ON aging_report, daily_collection_queue, portfolio_summary, loan_balances TO authenticated;
