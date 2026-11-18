// ============================================================================
// DineroYa — Capa de datos: selección de adaptador
//  - LocalDataAdapter (services/localAdapter): navegador o servidor
//  - SupabaseAdapter: Postgres + Auth + RLS
//  - ApiDataAdapter: Worker de Freebuff + D1 (login con Freebuff/Google)
// ============================================================================
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AppNotification, AppSettings, AuditEvent, CashSession, Client, CollectionActivity, CreditApplication,
  CreditApplicationStatus, CustomRole, Installment, Loan, NotificationStatus, NotificationTemplate, Payment,
  PaymentChannel, PaymentChannelKind, PaymentMethodOption, Profile, RestructureLoanInput, UserRole,
} from '../types';
import { paymentMethodSlug, todayISO } from '../lib/format';
import { EMPTY_SETTINGS } from '../lib/engine';
import {
  ActivityInput, AuthUser, CreateLoanInput, DataAdapter, NewClientInput, NewCreditApplicationInput,
  NewNotificationInput, PaymentChannelInput, PayInput, SignUpOptions,
} from './inputs';
import { ApiDataAdapter } from './apiAdapter';
import { LocalDataAdapter } from './localAdapter';

export * from './inputs';
export { LocalDataAdapter } from './localAdapter';

// ============================================================================
// Adaptador SUPABASE
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let sb: SupabaseClient | null = null;
const sbClient = (): SupabaseClient => {
  if (!sb) {
    sb = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
  }
  return sb;
};

const mapProfile = (r: any): Profile => ({
  id: r.id, fullName: r.full_name, role: r.role, active: r.active,
  email: r.email ?? undefined,
  roleId: r.role_id ?? undefined,
  roleName: r.role_name ?? (r.role_id ? undefined : r.role),
  screens: r.screens ?? undefined,
  perms: r.perms ?? undefined,
  clientId: r.client_id ?? null,
});

const mapApplication = (r: any): CreditApplication => ({
  id: r.id,
  clientId: r.client_id ?? null,
  applicantName: r.applicant_name,
  document: r.document ?? undefined,
  phone: r.phone ?? '',
  email: r.email ?? undefined,
  address: r.address ?? undefined,
  requestedAmount: Number(r.requested_amount),
  approvedAmount: r.approved_amount !== undefined && r.approved_amount !== null ? Number(r.approved_amount) : null,
  purpose: r.purpose ?? undefined,
  notes: r.notes ?? undefined,
  status: r.status,
  reviewNotes: r.review_notes ?? undefined,
  reviewedBy: r.reviewed_by ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const mapClient = (r: any): Client => ({
  id: r.id, name: r.name, document: r.document ?? undefined, phone: r.phone,
  email: r.email ?? undefined, address: r.address ?? undefined, notes: r.notes ?? undefined,
  registrationDate: r.registration_date, riskScore: r.risk_score, active: r.active,
  createdAt: r.created_at,
});

const mapLoan = (r: any): Loan => ({
  id: r.id, clientId: r.client_id, principal: Number(r.principal),
  interestRate: Number(r.interest_rate), totalInterest: Number(r.total_interest),
  totalDue: Number(r.total_due), installmentsCount: r.installments_count,
  frequency: r.frequency, firstDueDate: r.first_due_date, status: r.status,
  notes: r.notes ?? undefined, assignedTo: r.assigned_to, createdAt: r.created_at,
});

const mapInstallment = (r: any): Installment => ({
  id: r.id, loanId: r.loan_id, installmentNumber: r.installment_number,
  dueDate: r.due_date, amountDue: Number(r.amount_due), amountPaid: Number(r.amount_paid),
  status: r.status, paidAt: r.paid_at,
});

const mapPayment = (r: any): Payment => ({
  id: r.id, loanId: r.loan_id, clientId: r.client_id, amount: Number(r.amount),
  method: r.method as Payment['method'], notes: r.notes ?? undefined,
  paymentDate: r.payment_date, balanceAfter: Number(r.balance_after),
  receivedBy: r.received_by, createdAt: r.created_at,
});

const mapPaymentMethod = (r: any): PaymentMethodOption => ({
  id: r.id, name: r.name, active: r.active, sortOrder: r.sort_order,
});

const mapNotificationTemplate = (r: any): NotificationTemplate => ({
  id: r.id, name: r.name, channel: r.channel, subject: r.subject ?? undefined, body: r.body, active: r.active,
});

const mapNotification = (r: any): AppNotification => ({
  id: r.id, clientId: r.client_id, loanId: r.loan_id, channel: r.channel, templateId: r.template_id,
  title: r.title, body: r.body, status: r.status, createdAt: r.created_at, sentAt: r.sent_at,
});

const mapCashSession = (r: any): CashSession => ({
  id: r.id, openedBy: r.opened_by, openedAt: r.opened_at, closedAt: r.closed_at,
  openingAmount: Number(r.opening_amount),
  countedAmount: r.counted_amount != null ? Number(r.counted_amount) : null,
  expectedAmount: r.expected_amount != null ? Number(r.expected_amount) : null,
  difference: r.difference != null ? Number(r.difference) : null,
  notes: r.notes ?? undefined, status: r.status,
});

const mapPaymentChannel = (r: any): PaymentChannel => ({
  id: r.id, name: r.name, kind: r.kind, accountInfo: r.account_info ?? undefined,
  instructions: r.instructions ?? undefined, link: r.link ?? undefined,
  active: r.active, sortOrder: r.sort_order,
});

const mapActivity = (r: any): CollectionActivity => ({
  id: r.id, loanId: r.loan_id, clientId: r.client_id, type: r.type, result: r.result,
  promiseDate: r.promise_date, notes: r.notes ?? undefined,
  activityDate: r.activity_date, createdBy: r.created_by,
});

export class SupabaseAdapter implements DataAdapter {
  readonly mode = 'supabase' as const;
  private db = sbClient();

  private toAuthUser(u: { id: string; email?: string }, profile: Profile | null): AuthUser {
    return {
      id: u.id,
      email: u.email ?? '',
      fullName: profile?.fullName ?? u.email ?? 'Usuario',
      role: profile?.role ?? 'cobrador',
      clientId: profile?.clientId ?? null,
    };
  }

  private fetchMyProfile = async (): Promise<Profile | null> => {
    const { data: auth } = await this.db.auth.getUser();
    if (!auth.user) return null;
    const { data } = await this.db.from('profiles').select('*').eq('id', auth.user.id).maybeSingle();
    const { data: roleData } = await this.db.from('roles').select('*').eq('id', data?.role_id ?? '').maybeSingle();
    return data ? mapProfile({
      ...data, email: auth.user.email,
      screens: roleData?.screens, perms: roleData?.perms, role_name: roleData?.name,
    }) : null;
  };

  // --- Auth ------------------------------------------------------------------

  async getSession(): Promise<AuthUser | null> {
    const { data } = await this.db.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const profile = await this.fetchMyProfile();
    return this.toAuthUser(user, profile);
  }

  async signIn(email: string, password: string): Promise<AuthUser> {
    const { data, error } = await this.db.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    const profile = await this.fetchMyProfile();
    return this.toAuthUser(data.user!, profile);
  }

  async signUp(email: string, password: string, fullName: string, options?: SignUpOptions): Promise<void> {
    const role = options?.role === 'cliente' ? 'cliente' : options?.role ?? 'cobrador';
    const { error } = await this.db.auth.signUp({
      email, password,
      options: {
        data: {
          full_name: fullName,
          role,
          phone: options?.phone ?? null,
          document: options?.document ?? null,
        },
      },
    });
    if (error) throw new Error(error.message);
  }

  async resetPassword(email: string): Promise<void> {
    const { error } = await this.db.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?reset=1`,
    });
    if (error) throw new Error(error.message);
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.db.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }

  // --- Lectura ----------------------------------------------------------------

  private async rows(table: string, select = '*'): Promise<any[]> {
    const { data, error } = await this.db.from(table).select(select);
    if (error) throw new Error(`${table}: ${error.message}`);
    return data ?? [];
  }

  async listProfiles(): Promise<Profile[]> {
    const auth = await this.db.auth.getUser();
    const profiles = await this.rows('profiles');
    const roles = await this.listRoles().catch(() => [] as CustomRole[]);
    return profiles.map((r: any) => {
      const roleData = roles.find(x => x.id === r.role_id);
      return mapProfile({
        ...r,
        email: r.id === auth.data.user?.id ? auth.data.user?.email : undefined,
        screens: roleData?.screens,
        perms: roleData?.perms,
        role_name: roleData?.name,
      });
    });
  }

  async listClients(): Promise<Client[]> {
    return (await this.rows('clients')).map(mapClient);
  }

  async listLoans(): Promise<Loan[]> {
    return (await this.rows('loans')).map(mapLoan);
  }

  async listInstallments(): Promise<Installment[]> {
    return (await this.rows('installments')).map(mapInstallment);
  }

  async listPayments(): Promise<Payment[]> {
    return (await this.rows('payments')).map(mapPayment);
  }

  async listPaymentMethods(): Promise<PaymentMethodOption[]> {
    const { data, error } = await this.db.from('payment_methods').select('*').order('sort_order');
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapPaymentMethod);
  }

  async listNotificationTemplates(): Promise<NotificationTemplate[]> {
    const { data, error } = await this.db.from('notification_templates').select('*').order('name');
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapNotificationTemplate);
  }

  async saveNotificationTemplate(input: NotificationTemplate): Promise<NotificationTemplate> {
    const row = {
      id: input.id || paymentMethodSlug(input.name), name: input.name, channel: input.channel,
      subject: input.subject ?? null, body: input.body, active: input.active,
    };
    const { data, error } = await this.db.from('notification_templates').upsert(row).select().single();
    if (error) throw new Error(error.message);
    return mapNotificationTemplate(data);
  }

  async listNotifications(): Promise<AppNotification[]> {
    const { data, error } = await this.db.from('notifications')
      .select('*').order('created_at', { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapNotification);
  }

  async createNotification(input: NewNotificationInput): Promise<AppNotification> {
    const { data: auth } = await this.db.auth.getUser();
    const { data, error } = await this.db.from('notifications').insert({
      client_id: input.clientId ?? null, loan_id: input.loanId ?? null, channel: input.channel,
      template_id: input.templateId ?? null, title: input.title, body: input.body,
      status: 'pending', created_by: auth.user?.id ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapNotification(data);
  }

  async setNotificationStatus(id: string, status: NotificationStatus): Promise<void> {
    const patch: any = { status };
    if (status === 'sent') patch.sent_at = new Date().toISOString();
    const { error } = await this.db.from('notifications').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listCashSessions(): Promise<CashSession[]> {
    const { data, error } = await this.db.from('cash_sessions')
      .select('*').order('opened_at', { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapCashSession);
  }

  async openCashSession(openingAmount: number): Promise<CashSession> {
    const { data: auth } = await this.db.auth.getUser();
    const { data, error } = await this.db.from('cash_sessions').insert({
      opening_amount: openingAmount, opened_by: auth.user?.id ?? null, status: 'open',
    }).select().single();
    if (error) throw new Error(error.message);
    return mapCashSession(data);
  }

  async closeCashSession(id: string, countedAmount: number, notes?: string): Promise<CashSession> {
    const { data: session, error: e0 } = await this.db.from('cash_sessions').select('*').eq('id', id).single();
    if (e0) throw new Error(e0.message);
    const { data: pays } = await this.db.from('payments')
      .select('amount, notes').gte('created_at', session.opened_at);
    const collected = (pays ?? [])
      .filter((p: any) => !(p.notes ?? '').includes('ANULADO'))
      .reduce((a: number, p: any) => a + Number(p.amount), 0);
    const expected = Number((Number(session.opening_amount) + collected).toFixed(2));
    const { data, error } = await this.db.from('cash_sessions').update({
      counted_amount: countedAmount, expected_amount: expected,
      difference: Number((countedAmount - expected).toFixed(2)),
      notes: notes ?? null, closed_at: new Date().toISOString(), status: 'closed',
    }).eq('id', id).select().single();
    if (error) throw new Error(error.message);
    return mapCashSession(data);
  }

  async listPaymentChannels(): Promise<PaymentChannel[]> {
    const { data, error } = await this.db.from('payment_channels').select('*').order('sort_order');
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapPaymentChannel);
  }

  async savePaymentChannel(input: PaymentChannelInput): Promise<PaymentChannel> {
    const name = input.name.trim();
    if (!name) throw new Error('El nombre del canal es obligatorio');
    const patch: any = {
      name, kind: input.kind,
      account_info: input.accountInfo ?? null, instructions: input.instructions ?? null, link: input.link ?? null,
    };
    if (input.id) patch.id = input.id;
    if (input.active !== undefined) patch.active = input.active;
    if (!input.id) {
      const { data: last } = await this.db
        .from('payment_channels').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      patch.sort_order = Number(last?.sort_order ?? 0) + 1;
    }
    const { data, error } = await this.db.from('payment_channels').upsert(patch).select().single();
    if (error) throw new Error(error.message);
    return mapPaymentChannel(data);
  }

  async savePaymentMethod(input: { id?: string; name: string; active?: boolean }): Promise<PaymentMethodOption> {
    const name = input.name.trim();
    if (!name) throw new Error('El nombre del método es obligatorio');
    const id = input.id ?? paymentMethodSlug(name);
    const patch: any = { id, name };
    if (input.active !== undefined) patch.active = input.active;
    if (!input.id) {
      const { data: last } = await this.db
        .from('payment_methods').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
      patch.sort_order = Number(last?.sort_order ?? 0) + 1;
    }
    const { data, error } = await this.db.from('payment_methods').upsert(patch).select().single();
    if (error) throw new Error(error.message);
    return mapPaymentMethod(data);
  }

  async listActivities(): Promise<CollectionActivity[]> {
    return (await this.rows('collection_activities')).map(mapActivity);
  }

  async listAuditEvents(limit = 200): Promise<AuditEvent[]> {
    const { data, error } = await this.db
      .from('audit_events').select('*').order('created_at', { ascending: false }).limit(limit);
    if (error) throw new Error(`audit_events: ${error.message}`);
    return (data ?? []).map((r: any) => ({
      id: r.id, entity: r.entity, entityId: r.entity_id, action: r.action,
      actor: r.actor, actorName: r.actor_name, details: r.details, createdAt: r.created_at,
    }));
  }

  async getSettings(): Promise<AppSettings> {
    const { data } = await this.db.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (!data) return { ...EMPTY_SETTINGS };
    return {
      currency: data.currency,
      defaultInterestRate: Number(data.default_interest_rate),
      companyName: data.company_name,
      moraRate: data.mora_rate !== undefined && data.mora_rate !== null ? Number(data.mora_rate) : 5,
    };
  }

  /** Interés de mora acumulado de un cliente (RPC fn_client_mora). */
  async getClientMora(clientId: string): Promise<number> {
    const { data, error } = await this.db.rpc('fn_client_mora', { p_client: clientId });
    if (error) return 0;
    return Number(data ?? 0);
  }

  // --- Escritura -----------------------------------------------------------------

  async createClient(input: NewClientInput): Promise<Client> {
    const { data, error } = await this.db.from('clients').insert({
      name: input.name, document: input.document ?? null, phone: input.phone,
      email: input.email ?? null, address: input.address ?? null, notes: input.notes ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapClient(data);
  }

  async updateClient(id: string, patch: Partial<NewClientInput> & { active?: boolean }): Promise<void> {
    const db: any = {};
    if (patch.name !== undefined) db.name = patch.name;
    if (patch.document !== undefined) db.document = patch.document;
    if (patch.phone !== undefined) db.phone = patch.phone;
    if (patch.email !== undefined) db.email = patch.email;
    if (patch.address !== undefined) db.address = patch.address;
    if (patch.notes !== undefined) db.notes = patch.notes;
    if (patch.active !== undefined) db.active = patch.active;
    const { error } = await this.db.from('clients').update(db).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async createLoan(input: CreateLoanInput): Promise<Loan> {
    const total = Number((input.principal * (1 + input.interestRate / 100)).toFixed(2));
    const { data, error } = await this.db.from('loans').insert({
      client_id: input.clientId,
      principal: input.principal,
      interest_rate: input.interestRate,
      total_interest: Number((total - input.principal).toFixed(2)),
      total_due: total,
      installments_count: input.installmentsCount,
      frequency: input.frequency,
      first_due_date: input.firstDueDate,
      notes: input.notes ?? null,
      assigned_to: input.assignedTo ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    const loan = mapLoan(data);

    // Generar el calendario con la función RPC (mantiene una única fuente de verdad)
    const { error: rpcError } = await this.db.rpc('fn_generate_schedule', {
      p_loan_id: loan.id, p_principal: input.principal, p_rate: input.interestRate,
      p_count: input.installmentsCount, p_frequency: input.frequency, p_first_due: input.firstDueDate,
    });
    if (rpcError) throw new Error(rpcError.message);
    return loan;
  }

  async restructureLoan(input: RestructureLoanInput): Promise<Loan> {
    const { error } = await this.db.rpc('fn_restructure_loan', {
      p_loan_id: input.loanId,
      p_count: input.newInstallmentsCount,
      p_frequency: input.frequency,
      p_first_due: input.firstDueDate,
    });
    if (error) throw new Error(error.message);
    const { data, error: e2 } = await this.db.from('loans').select('*').eq('id', input.loanId).single();
    if (e2) throw new Error(e2.message);
    return mapLoan(data);
  }

  async cancelLoan(id: string, reason: string): Promise<void> {
    const { error } = await this.db.from('loans').update({ status: 'cancelled', notes: reason }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async assignLoan(id: string, userId: string | null): Promise<void> {
    const { error } = await this.db.from('loans').update({ assigned_to: userId }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async registerPayment(input: PayInput): Promise<Payment> {
    const { data: pid, error } = await this.db.rpc('fn_apply_payment', {
      p_loan_id: input.loanId, p_amount: input.amount, p_method: input.method,
      p_notes: input.notes ?? null, p_payment_date: input.date ?? todayISO(),
    });
    if (error) throw new Error(error.message);
    const { data, error: e2 } = await this.db.from('payments').select('*').eq('id', pid).single();
    if (e2) throw new Error(e2.message);
    return mapPayment(data);
  }

  async voidPayment(paymentId: string, reason: string): Promise<void> {
    const { error } = await this.db.rpc('fn_void_payment', {
      p_payment_id: paymentId, p_reason: reason,
    });
    if (error) throw new Error(error.message);
  }

  async logActivity(input: ActivityInput): Promise<CollectionActivity> {
    // La tabla exige client_id (NOT NULL): se hereda del préstamo.
    const { data: loan, error: loanError } = await this.db
      .from('loans').select('client_id').eq('id', input.loanId).maybeSingle();
    if (loanError) throw new Error(loanError.message);
    if (!loan?.client_id) throw new Error('Préstamo no encontrado para registrar la gestión');

    const { data, error } = await this.db.from('collection_activities').insert({
      loan_id: input.loanId,
      client_id: loan.client_id,
      type: input.type,
      result: input.result,
      promise_date: input.promiseDate ?? null,
      notes: input.notes ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapActivity(data);
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const db: any = { updated_at: new Date().toISOString() };
    if (patch.currency !== undefined) db.currency = patch.currency;
    if (patch.defaultInterestRate !== undefined) db.default_interest_rate = patch.defaultInterestRate;
    if (patch.companyName !== undefined) db.company_name = patch.companyName;
    if (patch.moraRate !== undefined) db.mora_rate = patch.moraRate;
    const { error } = await this.db.from('app_settings').update(db).eq('id', 1);
    if (error) throw new Error(error.message);
    return this.getSettings();
  }

  async listRoles(): Promise<CustomRole[]> {
    const { data, error } = await this.db.from('roles').select('*').order('created_at');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id, name: r.name, screens: r.screens ?? [], perms: r.perms ?? {}, isSystem: r.is_system,
    }));
  }

  async saveRole(role: CustomRole): Promise<void> {
    const { error } = await this.db.from('roles').upsert({
      id: role.id, name: role.name, screens: role.screens, perms: role.perms, is_system: role.isSystem ?? false,
    });
    if (error) throw new Error(error.message);
  }

  async deleteRole(roleId: string): Promise<void> {
    const { error } = await this.db.from('roles').delete().eq('id', roleId);
    if (error) throw new Error(error.message);
  }

  async updateProfileRole(userId: string, role: UserRole): Promise<void> {
    // `role` puede ser un rol del sistema (admin/gerente/cobrador) o el id de un rol personalizado.
    const isSystemRole = ['admin', 'gerente', 'cobrador'].includes(role);
    const patch: any = { role_id: role };
    if (isSystemRole) patch.role = role;
    const { error } = await this.db.from('profiles').update(patch).eq('id', userId);
    if (error) throw new Error(error.message);
  }

  async toggleProfileActive(userId: string, active: boolean): Promise<void> {
    const { error } = await this.db.from('profiles').update({ active }).eq('id', userId);
    if (error) throw new Error(error.message);
  }

  // --- Portal del cliente / solicitudes ---------------------------------------

  private async myProfileRow(): Promise<{ id: string; client_id?: string | null } | null> {
    const { data: auth } = await this.db.auth.getUser();
    if (!auth.user) return null;
    const { data } = await this.db.from('profiles').select('id, client_id').eq('id', auth.user.id).maybeSingle();
    return data ?? null;
  }

  async listApplications(): Promise<CreditApplication[]> {
    const { data, error } = await this.db
      .from('credit_applications').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map(mapApplication);
  }

  async createApplication(input: NewCreditApplicationInput): Promise<CreditApplication> {
    const me = await this.myProfileRow();
    const clientId = input.clientId ?? me?.client_id ?? null;
    const { data, error } = await this.db.from('credit_applications').insert({
      client_id: clientId,
      applicant_name: input.applicantName ?? 'Cliente',
      document: input.document ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      requested_amount: input.requestedAmount,
      purpose: input.purpose ?? null,
      notes: input.notes ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    return mapApplication(data);
  }

  async updateApplicationStatus(
    id: string,
    status: CreditApplicationStatus,
    reviewNotes?: string,
    approvedAmount?: number | null,
  ): Promise<void> {
    const { data: auth } = await this.db.auth.getUser();
    const patch: any = {
      status,
      review_notes: reviewNotes ?? null,
      reviewed_by: auth.user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    // El monto aprobado es el que se usará para el nuevo préstamo.
    if (status === 'approved') patch.approved_amount = approvedAmount ?? null;
    const { error } = await this.db.from('credit_applications').update(patch).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async linkClientToProfile(userId: string, clientId: string | null): Promise<void> {
    const { error } = await this.db.from('profiles').update({ client_id: clientId }).eq('id', userId);
    if (error) throw new Error(error.message);
  }

  async importBackup(): Promise<void> {
    throw new Error('La importación de respaldos está disponible en la versión en la nube (Sites), no en el modo Supabase.');
  }
}

// ============================================================================
// Selección de adaptador
// ============================================================================

const API_MODE = import.meta.env.VITE_DATA_MODE === 'api';

let adapter: DataAdapter | null = null;

export const getAdapter = (): DataAdapter => {
  if (!adapter) {
    adapter = API_MODE
      ? new ApiDataAdapter()
      : isSupabaseConfigured
        ? new SupabaseAdapter()
        : new LocalDataAdapter({ seedDemo: true });
  }
  return adapter;
};

export const resetAdapter = () => { adapter = null; };

// Export tipo para contextos
export type { DataAdapter as IDataAdapter };
