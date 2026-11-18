// ============================================================================
// DineroYa — Adaptador de producción (Worker de Freebuff + D1)
// El servidor ejecuta la misma lógica de negocio y guarda el estado en D1.
// ============================================================================
import {
  AppNotification, AppSettings, AuditEvent, Client, CollectionActivity, CreditApplication,
  CreditApplicationStatus, CustomRole, Installment, Loan, NotificationStatus, NotificationTemplate, Payment,
  PaymentChannel, PaymentMethodOption, Profile, RestructureLoanInput,
} from '../types';
import { DEFAULT_SETTINGS } from '../lib/format';
import { clientMoraAmount } from '../lib/engine';
import {
  ActivityInput, AuthUser, CreateLoanInput, DataAdapter, NewClientInput, NewCreditApplicationInput,
  NewNotificationInput, PaymentChannelInput, PayInput, SignUpOptions,
} from './inputs';

interface Snapshot {
  profiles: Profile[];
  roles: CustomRole[];
  clients: Client[];
  loans: Loan[];
  installments: Installment[];
  payments: Payment[];
  activities: CollectionActivity[];
  auditEvents: AuditEvent[];
  applications: CreditApplication[];
  paymentMethods: PaymentMethodOption[];
  notificationTemplates: NotificationTemplate[];
  notifications: AppNotification[];
  paymentChannels: PaymentChannel[];
  settings: AppSettings | null;
}

const EMPTY: Snapshot = {
  profiles: [], roles: [], clients: [], loans: [], installments: [], payments: [], activities: [],
  auditEvents: [], applications: [], paymentMethods: [], notificationTemplates: [], notifications: [],
  paymentChannels: [], settings: null,
};

export class ApiDataAdapter implements DataAdapter {
  readonly mode = 'api' as const;
  private cache: Snapshot | null = null;

  private async request(path: string, init?: RequestInit): Promise<any> {
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : init?.headers,
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!res.ok) throw new Error(body?.error ?? `Error ${res.status} al comunicarse con el servidor`);
    return body;
  }

  private apply(body: any): void {
    if (!body) return;
    if (body.data) this.cache = { ...EMPTY, ...(body.data as Snapshot) };
  }

  private async ensure(): Promise<Snapshot> {
    if (!this.cache) this.apply(await this.request('/api/state'));
    return this.cache ?? EMPTY;
  }

  private async op<T>(name: string, args: unknown = {}): Promise<T> {
    const body = await this.request('/api/op', { method: 'POST', body: JSON.stringify({ name, args }) });
    this.apply(body);
    return body.result as T;
  }

  // --- Auth ------------------------------------------------------------------

  async getSession(): Promise<AuthUser | null> {
    const body = await this.request('/api/session');
    this.apply(body);
    return (body?.user ?? null) as AuthUser | null;
  }

  /** El login real lo resuelve Freebuff (Google/GitHub/Apple) en el servidor. */
  startSignIn(): void {
    window.location.href = '/auth/freebuff/signin?returnTo=/';
  }

  async signIn(): Promise<AuthUser> {
    throw new Error('Inicia sesión con tu cuenta de Google desde el botón "Entrar con Freebuff".');
  }

  async signUp(): Promise<void> {
    throw new Error('Las cuentas se crean con el botón "Entrar con Freebuff".');
  }

  async resetPassword(): Promise<void> {
    throw new Error('No hay contraseñas: el acceso es con tu cuenta de Google.');
  }

  async updatePassword(): Promise<void> {
    throw new Error('No hay contraseñas: el acceso es con tu cuenta de Google.');
  }

  async signOut(): Promise<void> {
    await fetch('/auth/freebuff/signout', { method: 'POST', credentials: 'same-origin' });
    this.cache = null;
    window.location.href = '/';
  }

  // --- Lectura ---------------------------------------------------------------

  async listProfiles(): Promise<Profile[]> { return [...(await this.ensure()).profiles]; }
  async listRoles(): Promise<CustomRole[]> { return [...(await this.ensure()).roles]; }
  async listClients(): Promise<Client[]> { return [...(await this.ensure()).clients]; }
  async listLoans(): Promise<Loan[]> { return [...(await this.ensure()).loans]; }
  async listInstallments(): Promise<Installment[]> { return [...(await this.ensure()).installments]; }
  async listPayments(): Promise<Payment[]> { return [...(await this.ensure()).payments]; }
  async listActivities(): Promise<CollectionActivity[]> { return [...(await this.ensure()).activities]; }
  async listApplications(): Promise<CreditApplication[]> { return [...(await this.ensure()).applications]; }
  async listPaymentMethods(): Promise<PaymentMethodOption[]> {
    return [...(await this.ensure()).paymentMethods].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async listNotificationTemplates(): Promise<NotificationTemplate[]> { return [...(await this.ensure()).notificationTemplates]; }
  async listNotifications(): Promise<AppNotification[]> {
    return [...(await this.ensure()).notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async listPaymentChannels(): Promise<PaymentChannel[]> {
    return [...(await this.ensure()).paymentChannels].sort((a, b) => a.sortOrder - b.sortOrder);
  }
  async listAuditEvents(limit = 200): Promise<AuditEvent[]> {
    return (await this.ensure()).auditEvents.slice(0, limit);
  }
  async getSettings(): Promise<AppSettings> {
    return (await this.ensure()).settings ?? { ...DEFAULT_SETTINGS };
  }
  async getClientMora(clientId: string): Promise<number> {
    const data = await this.ensure();
    return clientMoraAmount(clientId, data.loans, data.installments, data.settings?.moraRate ?? 5);
  }

  // --- Escritura -------------------------------------------------------------

  createClient(input: NewClientInput): Promise<Client> { return this.op('createClient', input); }
  updateClient(id: string, patch: Partial<NewClientInput> & { active?: boolean }): Promise<void> {
    return this.op('updateClient', { id, patch });
  }
  createLoan(input: CreateLoanInput): Promise<Loan> { return this.op('createLoan', input); }
  restructureLoan(input: RestructureLoanInput): Promise<Loan> { return this.op('restructureLoan', input); }
  cancelLoan(id: string, reason: string): Promise<void> { return this.op('cancelLoan', { id, reason }); }
  assignLoan(id: string, userId: string | null): Promise<void> { return this.op('assignLoan', { id, userId }); }
  registerPayment(input: PayInput): Promise<Payment> { return this.op('registerPayment', input); }
  voidPayment(paymentId: string, reason: string): Promise<void> { return this.op('voidPayment', { id: paymentId, reason }); }
  logActivity(input: ActivityInput): Promise<CollectionActivity> { return this.op('logActivity', input); }
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> { return this.op('updateSettings', patch); }
  updateProfileRole(userId: string, role: string): Promise<void> { return this.op('updateProfileRole', { userId, role }); }
  toggleProfileActive(userId: string, active: boolean): Promise<void> { return this.op('toggleProfileActive', { userId, active }); }
  savePaymentMethod(input: { id?: string; name: string; active?: boolean }): Promise<PaymentMethodOption> {
    return this.op('savePaymentMethod', input);
  }
  saveRole(role: CustomRole): Promise<void> { return this.op('saveRole', role); }
  deleteRole(roleId: string): Promise<void> { return this.op('deleteRole', { id: roleId }); }

  saveNotificationTemplate(input: NotificationTemplate): Promise<NotificationTemplate> {
    return this.op('saveNotificationTemplate', input);
  }
  createNotification(input: NewNotificationInput): Promise<AppNotification> { return this.op('createNotification', input); }
  setNotificationStatus(id: string, status: NotificationStatus): Promise<void> {
    return this.op('setNotificationStatus', { id, status });
  }
  savePaymentChannel(input: PaymentChannelInput): Promise<PaymentChannel> {
    return this.op('savePaymentChannel', input);
  }

  createApplication(input: NewCreditApplicationInput): Promise<CreditApplication> {
    return this.op('createApplication', input);
  }
  updateApplicationStatus(
    id: string,
    status: CreditApplicationStatus,
    reviewNotes?: string,
    approvedAmount?: number | null,
  ): Promise<void> {
    return this.op('updateApplicationStatus', { id, status, reviewNotes, approvedAmount });
  }
  linkClientToProfile(userId: string, clientId: string | null): Promise<void> {
    return this.op('linkClientToProfile', { userId, clientId });
  }

  importBackup(data: Record<string, unknown>): Promise<void> {
    return this.op('importBackup', data);
  }
}

export type { SignUpOptions };
