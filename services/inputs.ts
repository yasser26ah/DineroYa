// ============================================================================
// DineroYa — Contratos de entrada/salida de la capa de datos
// ============================================================================
import {
  AppNotification, AppSettings, AuditEvent, Client, CollectionActivity, CreditApplication,
  CreditApplicationStatus, CustomRole, Installment, Loan, NotificationStatus, NotificationTemplate, Payment,
  NotificationChannel, PaymentChannel, PaymentChannelKind, PaymentMethodOption, Profile, RestructureLoanInput, UserRole,
} from '../types';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  /** Cliente vinculado cuando el usuario tiene rol 'cliente'. */
  clientId?: string | null;
}

export interface CreateLoanInput {
  clientId: string;
  principal: number;
  interestRate: number;
  installmentsCount: number;
  frequency: Loan['frequency'];
  firstDueDate: string;
  notes?: string;
  assignedTo?: string | null;
}

export interface PayInput {
  loanId: string;
  amount: number;
  method: Payment['method'];
  notes?: string;
  date?: string;
  /** Misma clave en un reintento = se devuelve el pago ya registrado. */
  requestId?: string;
}

export interface ActivityInput {
  loanId: string;
  type: CollectionActivity['type'];
  result: CollectionActivity['result'];
  promiseDate?: string | null;
  notes?: string;
}

export interface NewClientInput {
  name: string;
  document?: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface NewNotificationInput {
  clientId?: string | null;
  loanId?: string | null;
  channel: NotificationChannel;
  templateId?: string | null;
  title: string;
  body: string;
}

export interface PaymentChannelInput {
  id?: string;
  name: string;
  kind: PaymentChannelKind;
  accountInfo?: string;
  instructions?: string;
  link?: string;
  active?: boolean;
}

export interface NewCreditApplicationInput {
  requestedAmount: number;
  purpose?: string;
  notes?: string;
  /** Solo se usa en modo local o cuando el staff registra la solicitud a nombre de un cliente. */
  clientId?: string | null;
  applicantName?: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface SignUpOptions {
  /** 'cliente' crea automáticamente la ficha de cliente vinculada al usuario. */
  role?: 'cliente' | 'cobrador' | 'gerente';
  phone?: string;
  document?: string;
}

export interface DataAdapter {
  readonly mode: 'local' | 'supabase' | 'api';

  // Auth
  getSession(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(email: string, password: string, fullName: string, options?: SignUpOptions): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  /** Inicia sesión con el proveedor de identidad (solo modo servidor/Freebuff). */
  startSignIn?(): void;

  // Lectura
  listProfiles(): Promise<Profile[]>;
  listRoles(): Promise<CustomRole[]>;
  saveRole(role: CustomRole): Promise<void>;
  deleteRole(roleId: string): Promise<void>;
  listClients(): Promise<Client[]>;
  listLoans(): Promise<Loan[]>;
  listInstallments(): Promise<Installment[]>;
  listPayments(): Promise<Payment[]>;
  listPaymentMethods(): Promise<PaymentMethodOption[]>;
  listActivities(): Promise<CollectionActivity[]>;
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  getSettings(): Promise<AppSettings>;
  getClientMora(clientId: string): Promise<number>;

  // Escritura
  createClient(input: NewClientInput): Promise<Client>;
  updateClient(id: string, patch: Partial<NewClientInput> & { active?: boolean }): Promise<void>;
  createLoan(input: CreateLoanInput): Promise<Loan>;
  restructureLoan(input: RestructureLoanInput): Promise<Loan>;
  cancelLoan(id: string, reason: string): Promise<void>;
  assignLoan(id: string, userId: string | null): Promise<void>;
  registerPayment(input: PayInput): Promise<Payment>;
  voidPayment(paymentId: string, reason: string): Promise<void>;
  logActivity(input: ActivityInput): Promise<CollectionActivity>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  updateProfileRole(userId: string, role: UserRole): Promise<void>;
  toggleProfileActive(userId: string, active: boolean): Promise<void>;
  savePaymentMethod(input: { id?: string; name: string; active?: boolean }): Promise<PaymentMethodOption>;

  // Notificaciones y canales de pago
  listNotificationTemplates(): Promise<NotificationTemplate[]>;
  saveNotificationTemplate(input: NotificationTemplate): Promise<NotificationTemplate>;
  listNotifications(): Promise<AppNotification[]>;
  createNotification(input: NewNotificationInput): Promise<AppNotification>;
  setNotificationStatus(id: string, status: NotificationStatus): Promise<void>;
  listPaymentChannels(): Promise<PaymentChannel[]>;
  savePaymentChannel(input: PaymentChannelInput): Promise<PaymentChannel>;

  // Portal del cliente / solicitudes de crédito
  listApplications(): Promise<CreditApplication[]>;
  createApplication(input: NewCreditApplicationInput): Promise<CreditApplication>;
  updateApplicationStatus(
    id: string,
    status: CreditApplicationStatus,
    reviewNotes?: string,
    approvedAmount?: number | null,
  ): Promise<void>;
  linkClientToProfile(userId: string, clientId: string | null): Promise<void>;

  /** Restaura un respaldo JSON (solo con la base vacía). */
  importBackup(data: Record<string, unknown>): Promise<void>;

  /** Errores del servidor registrados para diagnóstico (solo admin). */
  listServerErrors(): Promise<ServerError[]>;

  /** Copias automáticas guardadas en el servidor (solo admin y solo en la nube). */
  listBackups(): Promise<BackupInfo[]>;
  /** Vuelve el estado a una copia concreta. */
  restoreBackup(id: number): Promise<void>;
}

export interface BackupInfo {
  id: number;
  rev: number;
  size: number;
  kind: string;
  createdAt: string;
}

export interface ServerError {
  id: number;
  op: string;
  message: string;
  stack?: string | null;
  userId?: string | null;
  path?: string | null;
  createdAt: string;
}
