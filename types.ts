// ============================================================================
// DineroYa — Modelo de dominio
// ============================================================================

export type UserRole = 'admin' | 'gerente' | 'cobrador' | 'cliente';

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
  roleId?: string;
  roleName?: string;
  screens?: string[];
  perms?: Record<string, boolean>;
  /** Ficha de cliente vinculada (rol 'cliente'). */
  clientId?: string | null;
}

/** Rol personalizable: pantallas visibles + permisos de movimientos. */
export interface CustomRole {
  id: string;
  name: string;
  screens: string[];
  perms: Record<string, boolean>;
  isSystem: boolean;
}

/** Catálogo de permisos de movimiento (mostrados en Equipo). */
export const PERM_LABELS: Record<string, string> = {
  viewAll: 'Ver toda la cartera (no solo lo asignado)',
  payments: 'Registrar pagos y abonos',
  activities: 'Registrar gestiones de cobranza',
  createLoan: 'Crear préstamos',
  editClient: 'Crear y editar clientes',
  cancelLoan: 'Cancelar préstamos',
  assignLoan: 'Asignar préstamos a cobradores',
  voidPayment: 'Anular pagos',
  manageRoles: 'Gestionar roles y permisos',
  editSettings: 'Editar configuración del negocio',
  exportData: 'Exportar respaldos',
};

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
  /** Clave de idempotencia: evita duplicar el pago si se reintenta el envío. */
  requestId?: string | null;
}

/** Slug del catálogo editable de métodos de pago (tabla payment_methods). */
export type PaymentMethod = string;

export interface PaymentMethodOption {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

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

/** Datos para reestructurar un préstamo (cambiar cuotas/frecuencia sin alterar el total). */
export interface RestructureLoanInput {
  loanId: string;
  newInstallmentsCount: number;
  frequency: LoanFrequency;
  firstDueDate: string;
}

// --- Solicitudes de crédito (portal del cliente) ---

export type CreditApplicationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface CreditApplication {
  id: string;
  clientId?: string | null;
  applicantName: string;
  document?: string;
  phone: string;
  email?: string;
  address?: string;
  requestedAmount: number;
  /** Monto aprobado por el analista (puede diferir del solicitado). */
  approvedAmount?: number | null;
  purpose?: string;
  notes?: string;
  status: CreditApplicationStatus;
  reviewNotes?: string;
  reviewedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const CREDIT_APPLICATION_STATUS_LABELS: Record<CreditApplicationStatus, string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  cancelled: 'Cancelada',
};

// --- Centro de notificaciones y automatización ---

export type NotificationChannel = 'whatsapp' | 'email';
export type NotificationStatus = 'pending' | 'sent' | 'cancelled';

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  active: boolean;
}

export interface AppNotification {
  id: string;
  clientId?: string | null;
  loanId?: string | null;
  channel: NotificationChannel;
  templateId?: string | null;
  title: string;
  body: string;
  status: NotificationStatus;
  createdAt: string;
  sentAt?: string | null;
}

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Correo',
};

export const NOTIFICATION_STATUS_LABELS: Record<NotificationStatus, string> = {
  pending: 'Pendiente',
  sent: 'Enviada',
  cancelled: 'Descartada',
};



// --- Canales de pago y pasarelas ---

export type PaymentChannelKind = 'bank_account' | 'wallet' | 'card_gateway' | 'cash_office';

export interface PaymentChannel {
  id: string;
  name: string;
  kind: PaymentChannelKind;
  accountInfo?: string;
  instructions?: string;
  link?: string;
  active: boolean;
  sortOrder: number;
}

export const PAYMENT_CHANNEL_KIND_LABELS: Record<PaymentChannelKind, string> = {
  bank_account: 'Cuenta bancaria',
  wallet: 'Billetera digital',
  card_gateway: 'Pasarela de tarjetas',
  cash_office: 'Oficina / efectivo',
};

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

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  card: 'Tarjeta',
  other: 'Otro',
};

/** Nombre visible de un método: catálogo editable, o el de respaldo si aún no cargó. */
export const paymentMethodLabel = (id: string, options?: PaymentMethodOption[]): string =>
  options?.find(m => m.id === id)?.name ?? PAYMENT_METHOD_LABELS[id] ?? id;

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
