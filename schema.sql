
-- Extensión para generación de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Definición de Estados de Préstamo
CREATE TYPE loan_status AS ENUM ('active', 'paid', 'overdue');

-- Tabla de Clientes
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    registration_date DATE DEFAULT CURRENT_DATE,
    risk_score INTEGER DEFAULT 50 CHECK (risk_score >= 0 AND risk_score <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Préstamos
CREATE TABLE loans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    principal DECIMAL(15, 2) NOT NULL CHECK (principal > 0),
    interest_rate DECIMAL(5, 2) NOT NULL,
    total_interest DECIMAL(15, 2) NOT NULL,
    total_due DECIMAL(15, 2) NOT NULL,
    remaining_balance DECIMAL(15, 2) NOT NULL CHECK (remaining_balance >= 0),
    installments_count INTEGER NOT NULL DEFAULT 1 CHECK (installments_count > 0),
    start_date DATE DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    status loan_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_dates CHECK (due_date >= start_date)
);

-- Función para recalcular el Riesgo del Cliente
CREATE OR REPLACE FUNCTION fn_recalculate_client_risk()
RETURNS TRIGGER AS $$
DECLARE
    v_new_score INTEGER := 50; -- Puntaje base inicial
    v_paid_count INTEGER;
    v_overdue_count INTEGER;
BEGIN
    -- Contar préstamos liquidados (+15 pts cada uno)
    SELECT COUNT(*) INTO v_paid_count 
    FROM loans 
    WHERE client_id = NEW.client_id AND status = 'paid';
    
    -- Contar préstamos en mora o vencidos (-40 pts cada uno)
    SELECT COUNT(*) INTO v_overdue_count 
    FROM loans 
    WHERE client_id = NEW.client_id 
    AND (status = 'overdue' OR (status = 'active' AND due_date < CURRENT_DATE));

    -- Aplicar lógica de negocio
    v_new_score := v_new_score + (v_paid_count * 15) - (v_overdue_count * 40);
    
    -- Limitar entre 1 y 100
    IF v_new_score > 100 THEN v_new_score := 100; END IF;
    IF v_new_score < 1 THEN v_new_score := 1; END IF;

    -- Actualizar el score en la tabla de clientes
    UPDATE clients 
    SET risk_score = v_new_score 
    WHERE id = NEW.client_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Se dispara al insertar o actualizar un préstamo
CREATE TRIGGER trg_update_risk_on_loan_change
AFTER INSERT OR UPDATE OF status, due_date ON loans
FOR EACH ROW
EXECUTE FUNCTION fn_recalculate_client_risk();

-- Tabla de Pagos
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    installment_number INTEGER NOT NULL CHECK (installment_number > 0),
    payment_date DATE DEFAULT CURRENT_DATE,
    balance_after DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices optimizados
CREATE INDEX idx_clients_phone ON clients(phone);
CREATE INDEX idx_loans_client ON loans(client_id);
CREATE INDEX idx_payments_loan ON payments(loan_id);
CREATE INDEX idx_loans_status_date ON loans(status, due_date);

-- Vista de Cartera actualizada
CREATE OR REPLACE VIEW portfolio_summary AS
SELECT 
    COUNT(DISTINCT id) as total_clients,
    SUM(principal) as total_principal_lent,
    SUM(total_interest) as total_interest_expected,
    SUM(remaining_balance) as total_outstanding_balance,
    (SELECT SUM(amount) FROM payments) as total_collected
FROM loans;
