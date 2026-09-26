// ============================================================================
// DineroYa — Modelo de dominio
// ============================================================================

export type UserRole = 'admin' | 'gerente' | 'cobrador';

export type LoanStatus = 'active' | 'overdue' | 'paid' | 'cancelled';
export type InstallmentStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'waived';
export type LoanFrequency = 'weekly' | 'biweekly' | 'monthly';
export type ActivityType = 'call' | 'whatsapp' | 'visit' | 'note';
export type ActivityResult =
  | 'contacted_promised' | 'contacted_no_promise' | 'no_answer'
  | 'refuses_to_pay' | 'payment_received' | 'message_sent' | 'other';

// --- Entidades ---

export interface Profile {
  id: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  email?: string;
}

export interface Client {
  id: string;
  name: string;
  document?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  registrationDate: string;   // YYYY-MM-DD
  riskScore: number;          // 1..100
  active: boolean;
  createdAt: string;
}

export interface Loan {
  id: string;
  clientId: string;
  principal: number;
  interestRate: number;
  totalInterest: number;
  totalDue: number;
  installmentsCount: number;
  frequency: LoanFrequency;
  firstDueDate: string;       // YYYY-MM-DD
  status: LoanStatus;
  notes?: string;
  assignedTo?: string | null;
  createdAt: string;
}

export interface Installment {
  id: string;
  loanId: string;
  installmentNumber: number;
  dueDate: string;            // YYYY-MM-DD
  amountDue: number;
  amountPaid: number;
  status: InstallmentStatus;
  paidAt?: string | null;
}

export interface Payment {
  id: string;
  loanId: string;
  clientId: string;
  amount: number;
  method: PaymentMethod;
  notes?: string;
  paymentDate: string;        // YYYY-MM-DD
  balanceAfter: number;
  receivedBy?: string | null;
  createdAt: string;
}

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other';

export interface CollectionActivity {
  id: string;
  loanId: string;
  clientId: string;
  type: ActivityType;
  result: ActivityResult;
  promiseDate?: string | null; // compromiso de pago
  notes?: string;
  activityDate: string;        // ISO timestamp
  createdBy?: string | null;
}

export interface AuditEvent {
  id: string;
  entity: string;
  entityId?: string | null;
  action: string;             // INSERT | UPDATE | DELETE
  actor?: string | null;
  actorName?: string | null;
  details?: any;
  createdAt: string;
}

export interface AppSettings {
  currency: string;
  defaultInterestRate: number;
  companyName: string;
  /** Tasa de mora mensual (%) aplicada sobre saldos vencidos. 0 = sin mora. */
  moraRate: number;
}

// --- Derivados / reportes ---

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export interface LoanBalance {
  loanId: string;
  clientId: string;
  outstanding: number;
}

export interface AgingRow {
  loanId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  status: LoanStatus;
  assignedTo?: string | null;
  outstanding: number;
  bucket: AgingBucket;
  nextDueDate?: string | null;
  daysOverdue?: number | null;
}

export interface QueueRow extends AgingRow {
  lastActivityDate?: string | null;
  lastResult?: ActivityResult | null;
  lastPromiseDate?: string | null;
}

export interface PortfolioSummary {
  totalClients: number;
  activeLoans: number;
  totalPrincipalLent: number;
  totalOutstanding: number;
  totalCollected: number;
}

export interface DashboardStats {
  totalPrincipal: number;
  totalCollected: number;
  outstanding: number;
  expectedInterest: number;
  recoveryRate: number;
  activeLoansCount: number;
  overdueLoansCount: number;
  portfolioByDay: { date: string; cobrado: number }[];
  agingByBucket: { bucket: string; monto: number; casos: number }[];
  dueToday: QueueRow[];
  brokenPromises: QueueRow[];
}

export const FREQUENCY_LABELS: Record<LoanFrequency, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call: 'Llamada',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  note: 'Nota',
};

export const ACTIVITY_RESULT_LABELS: Record<ActivityResult, string> = {
  contacted_promised: 'Contactado — prometió pagar',
  contacted_no_promise: 'Contactado — sin compromiso',
  no_answer: 'No contesta',
  refuses_to_pay: 'Se niega a pagar',
  payment_received: 'Pago recibido',
  message_sent: 'Mensaje enviado',
  other: 'Otro',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
};

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  active: 'Activo',
  overdue: 'En mora',
  paid: 'Pagado',
  cancelled: 'Cancelado',
};

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  pending: 'Pendiente',
  partial: 'Abonado',
  paid: 'Pagada',
  overdue: 'Vencida',
  waived: 'Condonada',
};
