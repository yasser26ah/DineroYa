-- ============================================================================
-- DineroYa — Cartera de Préstamos | Esquema completo para Supabase (Postgres)
-- Ejecutar completo en el SQL Editor de Supabase.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensiones y tipos
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'gerente', 'cobrador', 'cliente');
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
    NEW.role_id := 'admin';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
          status = (CASE WHEN amount_paid + v_apply >= amount_due THEN 'paid' ELSE 'partial' END)::installment_status,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
          status = (CASE WHEN amount_paid - v_alloc.amount <= 0 THEN 'pending' ELSE 'partial' END)::installment_status,
          paid_at = NULL
    WHERE id = v_alloc.installment_id;
  END LOOP;

  DELETE FROM payment_allocations WHERE payment_id = p_payment_id;

  UPDATE loans SET status = 'active'
  WHERE id = v_loan AND status = 'paid'
    AND EXISTS (SELECT 1 FROM installments WHERE loan_id = v_loan AND status NOT IN ('paid','waived'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

-- La gestión hereda el cliente del préstamo. La app solo conoce el préstamo y
-- client_id es NOT NULL: el trigger cubre cualquier ruta de inserción.
CREATE OR REPLACE FUNCTION fn_activity_client_from_loan()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.client_id IS NULL THEN
    SELECT l.client_id INTO NEW.client_id FROM loans l WHERE l.id = NEW.loan_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_activity_client_from_loan ON collection_activities;
CREATE TRIGGER trg_activity_client_from_loan
BEFORE INSERT ON collection_activities
FOR EACH ROW EXECUTE FUNCTION fn_activity_client_from_loan();

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
  VALUES (TG_TABLE_NAME, CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END, v_action, v_actor, v_actor_name, v_details);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
  v_client UUID := CASE TG_OP WHEN 'DELETE' THEN OLD.client_id ELSE NEW.client_id END;
  v_paid INTEGER; v_partials INTEGER; v_overdue INTEGER; v_score INTEGER := 50;
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
  -- Abonos: préstamos con pagos que dejaron cuotas parciales también mejoran el riesgo (tope +15).
  SELECT COUNT(*) INTO v_partials FROM payments p
  WHERE p.client_id = v_client
    AND EXISTS (
      SELECT 1 FROM installments i
      WHERE i.loan_id = p.loan_id AND i.amount_paid > 0 AND i.amount_paid < i.amount_due
    );
  v_score := v_score + (v_paid * 15) + (LEAST(v_partials, 3) * 5) - (v_overdue * 40);
  v_score := GREATEST(1, LEAST(100, v_score));
  UPDATE clients SET risk_score = v_score WHERE id = v_client;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------------
-- 9. Configuración de la app
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  currency VARCHAR(5) NOT NULL DEFAULT '$',
  default_interest_rate DECIMAL(5,2) NOT NULL DEFAULT 15,
  company_name VARCHAR(255) NOT NULL DEFAULT 'DineroYa',
  mora_rate DECIMAL(5,2) NOT NULL DEFAULT 5,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO app_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS mora_rate DECIMAL(5,2) NOT NULL DEFAULT 5;

-- Mora acumulada de un cliente: saldo vencido × mora_rate mensual × (días/30).
CREATE OR REPLACE FUNCTION fn_client_mora(p_client UUID)
RETURNS DECIMAL
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(
      GREATEST(i.amount_due - i.amount_paid, 0) *
      (SELECT s.mora_rate FROM app_settings s WHERE s.id = 1) / 100.0 *
      GREATEST((CURRENT_DATE - i.due_date), 0) / 30.0
    ), 0)
  FROM installments i
  JOIN loans l ON l.id = i.loan_id
  WHERE l.client_id = p_client
    AND i.status NOT IN ('paid','waived')
    AND l.status IN ('active','overdue')
    AND i.due_date < CURRENT_DATE;
$$;
GRANT EXECUTE ON FUNCTION fn_client_mora(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Vistas operativas
-- ---------------------------------------------------------------------------
-- Saldo pendiente por préstamo (security_invoked: respeta RLS del llamador)
CREATE OR REPLACE VIEW loan_balances WITH (security_invoker = true) AS
SELECT
  l.id AS loan_id,
  l.client_id,
  COALESCE(SUM(CASE WHEN i.status NOT IN ('paid','waived') THEN i.amount_due - i.amount_paid END), 0) AS outstanding
FROM loans l
LEFT JOIN installments i ON i.loan_id = l.id
GROUP BY l.id, l.client_id;

-- Cartera con envejecimiento de mora
CREATE OR REPLACE VIEW aging_report WITH (security_invoker = true) AS
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
CREATE OR REPLACE VIEW daily_collection_queue WITH (security_invoker = true) AS
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
CREATE OR REPLACE VIEW portfolio_summary WITH (security_invoker = true) AS
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

-- ---------------------------------------------------------------------------
-- 11b. Roles personalizados: pantallas visibles + permisos de movimientos.
-- El rol admin del sistema siempre tiene acceso total (fn_has_perm lo garantiza).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  screens TEXT[] NOT NULL DEFAULT '{}',
  perms JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

-- Vínculo de cada perfil con su rol (se necesita antes de fn_has_perm).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_id TEXT REFERENCES roles(id);

-- ¿Tiene el usuario actual el permiso dado? El rol 'admin' del sistema manda.
-- Se define aquí (antes de las políticas) porque las políticas la referencian.
CREATE OR REPLACE FUNCTION fn_has_perm(p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) OR COALESCE((
    SELECT (r.perms ->> p_perm)::boolean
    FROM profiles pf JOIN roles r ON r.id = pf.role_id
    WHERE pf.id = auth.uid()
  ), false);
$$;

CREATE POLICY "roles_read" ON roles FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "roles_write" ON roles;
CREATE POLICY "roles_write" ON roles FOR ALL TO authenticated
  USING (fn_has_perm('manageRoles'))
  WITH CHECK (fn_has_perm('manageRoles'));

INSERT INTO roles (id, name, screens, perms, is_system) VALUES
  ('admin','Administrador',
   ARRAY['dashboard','collections','loans','clients','applications','audit','team','settings'],
   '{"viewAll":true,"payments":true,"activities":true,"createLoan":true,"editClient":true,"cancelLoan":true,"assignLoan":true,"voidPayment":true,"manageRoles":true,"editSettings":true,"exportData":true}', TRUE),
  ('gerente','Gerente',
   ARRAY['dashboard','collections','loans','clients','applications','audit','settings'],
   '{"viewAll":true,"payments":true,"activities":true,"createLoan":true,"editClient":true,"assignLoan":true}', TRUE),
  ('cobrador','Cobrador',
   ARRAY['dashboard','collections','loans','clients'],
   '{"viewAll":false,"payments":true,"activities":true}', TRUE)
ON CONFLICT (id) DO UPDATE SET
  screens = EXCLUDED.screens, perms = EXCLUDED.perms, is_system = TRUE;

UPDATE profiles SET role_id = role::text WHERE role_id IS NULL;

GRANT SELECT ON roles TO authenticated;

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
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Helper: ¿el préstamo está asignado al usuario actual o es gestión libre?
CREATE OR REPLACE FUNCTION fn_can_see_loan(p_loan UUID) RETURNS BOOLEAN AS $$
  SELECT COALESCE((
    SELECT l.assigned_to = auth.uid() OR l.assigned_to IS NULL
    FROM loans l WHERE l.id = p_loan
  ), TRUE);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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
  USING (fn_has_perm('editSettings'));

-- ---------------------------------------------------------------------------
-- 12. Permisos de ejecución
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_generate_schedule(UUID, DECIMAL, DECIMAL, INTEGER, loan_frequency, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_apply_payment(UUID, DECIMAL, VARCHAR, TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_void_payment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_mark_overdue() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_has_perm(TEXT) TO authenticated;
GRANT SELECT ON aging_report, daily_collection_queue, portfolio_summary, loan_balances TO authenticated;


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
