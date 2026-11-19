// ============================================================================
// DineroYa — Adaptador local (navegador o estado en memoria del servidor)
// ============================================================================
import {
  AppNotification, AppSettings, AuditEvent, Client, CollectionActivity, CreditApplication,
  CreditApplicationStatus, CustomRole, Installment, Loan, NotificationStatus, NotificationTemplate, Payment,
  PaymentChannel, PaymentChannelKind, PaymentMethodOption, Profile, RestructureLoanInput, UserRole,
} from '../types';
import { DEFAULT_SETTINGS, paymentMethodSlug, todayISO } from '../lib/format';
import {
  EMPTY_SETTINGS, clientMoraAmount, computeRiskScore, generateSchedule, loanOutstanding,
  restructureSchedule, splitInstallmentsForRestructure,
} from '../lib/engine';
import {
  ActivityInput, AuthUser, BackupInfo, CreateLoanInput, DataAdapter, NewClientInput, NewCreditApplicationInput,
  NewNotificationInput, PaymentChannelInput, PayInput, SignUpOptions,
} from './inputs';

export interface LocalAdapterOptions {
  /** Genera datos de demostración la primera vez (solo navegador). */
  seedDemo?: boolean;
  /** Usuario responsable de las acciones registradas en auditoría. */
  actor?: AuthUser;
}

export interface SyncStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

const browserStorage = (): SyncStorage => ({
  get: key => localStorage.getItem(key),
  set: (key, value) => localStorage.setItem(key, value),
  remove: key => localStorage.removeItem(key),
});

/** Almacenamiento en memoria: lo usa el Worker para operar sobre el estado de D1. */
export const createMemoryStorage = (initial: Record<string, string> = {}): SyncStorage & { dump(): Record<string, string> } => {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get: key => map.get(key) ?? null,
    set: (key, value) => { map.set(key, value); },
    remove: key => { map.delete(key); },
    dump: () => Object.fromEntries(map),
  };
};

let activeStorage: SyncStorage | null = null;

/** Fija el almacenamiento activo (el servidor usa memoria por petición). */
export const setStorageBackend = (storage: SyncStorage | null): void => { activeStorage = storage; };

const resolvedStorage = (): SyncStorage => activeStorage ?? browserStorage();

const LS = {
  clients: 'db_clients',
  loans: 'db_loans',
  installments: 'db_installments',
  payments: 'db_payments',
  activities: 'db_activities',
  audit: 'db_audit',
  settings: 'db_settings',
  session: 'db_session',
  applications: 'db_applications',
  paymentMethods: 'db_payment_methods',
  notificationTemplates: 'db_notification_templates',
  notifications: 'db_notifications',
  paymentChannels: 'db_payment_channels',
  profiles: 'db_profiles',
  roles: 'db_roles',
  seeded: 'db_seeded_v3',
};

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = resolvedStorage().get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => resolvedStorage().set(key, JSON.stringify(value));

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const DEMO_USER: AuthUser = {
  id: 'demo-user',
  email: 'demo@dineroya.local',
  fullName: 'Operador Demo',
  role: 'admin',
  clientId: null,
};

const DEFAULT_PAYMENT_METHODS: PaymentMethodOption[] = [
  { id: 'cash', name: 'Efectivo', active: true, sortOrder: 1 },
  { id: 'transfer', name: 'Transferencia', active: true, sortOrder: 2 },
  { id: 'card', name: 'Tarjeta', active: true, sortOrder: 3 },
  { id: 'other', name: 'Otro', active: true, sortOrder: 4 },
];

const DEFAULT_NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    id: 'recordatorio_cuota', name: 'Recordatorio de cuota por vencer', channel: 'whatsapp', active: true,
    body: 'Hola {{cliente}}, te recordamos que tu cuota #{{cuota}} por {{monto}} vence el {{fecha}}. Puedes pagar en efectivo, por transferencia o por los canales de pago de {{empresa}}. ¡Gracias!',
  },
  {
    id: 'cuota_vencida', name: 'Cuota vencida', channel: 'whatsapp', active: true,
    body: 'Hola {{cliente}}, tu cuota #{{cuota}} por {{monto}} venció el {{fecha}} y sigue pendiente. Tu saldo total es {{saldo}}. Escríbenos para acordar el pago con {{empresa}}.',
  },
  {
    id: 'promesa_incumplida', name: 'Promesa de pago incumplida', channel: 'whatsapp', active: true,
    body: 'Hola {{cliente}}, no registramos el pago que acordaste para el {{fecha}}. Tu saldo pendiente es {{saldo}}. ¿Podemos acordar una nueva fecha? — {{empresa}}.',
  },
  {
    id: 'recordatorio_correo', name: 'Recordatorio de cuota (correo)', channel: 'email', active: true,
    subject: 'Recordatorio de tu cuota en {{empresa}}',
    body: 'Hola {{cliente}}:\n\nTu cuota #{{cuota}} por {{monto}} vence el {{fecha}}. Tu saldo pendiente es {{saldo}}.\n\n{{empresa}}',
  },
];

const DEFAULT_PAYMENT_CHANNELS: PaymentChannel[] = [
  { id: 'efectivo-oficina', name: 'Efectivo en oficina', kind: 'cash_office', instructions: 'Acércate a la oficina en horario laboral.', active: true, sortOrder: 1 },
  { id: 'transferencia', name: 'Transferencia bancaria', kind: 'bank_account', instructions: 'Envía el comprobante por WhatsApp.', active: true, sortOrder: 2 },
];

export class LocalDataAdapter implements DataAdapter {
  readonly mode = 'local' as const;

  private clients: Client[] = [];
  private loans: Loan[] = [];
  private installments: Installment[] = [];
  private payments: Payment[] = [];
  private activities: CollectionActivity[] = [];
  private audit: AuditEvent[] = [];
  private applications: CreditApplication[] = [];
  private paymentMethods: PaymentMethodOption[] = [];
  private notificationTemplates: NotificationTemplate[] = [];
  private notifications: AppNotification[] = [];
  private paymentChannels: PaymentChannel[] = [];
  private settings: AppSettings = { ...DEFAULT_SETTINGS };

  private actor: AuthUser = DEMO_USER;
  private profiles: Profile[] = [];
  private roles: CustomRole[] = [];

  constructor(options: LocalAdapterOptions | boolean = {}) {
    const seedDemo = typeof options === 'boolean' ? options : options.seedDemo ?? true;
    if (typeof options === 'object' && options.actor) this.actor = options.actor;
    this.clients = read<Client[]>(LS.clients, []);
    this.loans = read<Loan[]>(LS.loans, []);
    this.installments = read<Installment[]>(LS.installments, []);
    this.payments = read<Payment[]>(LS.payments, []);
    this.activities = read<CollectionActivity[]>(LS.activities, []);
    this.audit = read<AuditEvent[]>(LS.audit, []);
    this.applications = read<CreditApplication[]>(LS.applications, []);
    this.paymentMethods = read<PaymentMethodOption[]>(LS.paymentMethods, DEFAULT_PAYMENT_METHODS);
    this.notificationTemplates = read<NotificationTemplate[]>(LS.notificationTemplates, DEFAULT_NOTIFICATION_TEMPLATES);
    this.notifications = read<AppNotification[]>(LS.notifications, []);
    this.paymentChannels = read<PaymentChannel[]>(LS.paymentChannels, DEFAULT_PAYMENT_CHANNELS);
    this.settings = { ...EMPTY_SETTINGS, ...read<Partial<AppSettings>>(LS.settings, {}) };
    this.profiles = read<Profile[]>(LS.profiles, []);
    this.roles = read<CustomRole[]>(LS.roles, []);

    if (seedDemo && !read<boolean>(LS.seeded, false) && this.clients.length === 0) {
      this.seedDemoData();
      write(LS.seeded, true);
    }
  }

  private auditEvent(entity: string, entityId: string, action: string, details?: unknown) {
    this.audit.unshift({
      id: uid(),
      entity,
      entityId,
      action,
      actor: this.actor.id,
      actorName: this.actor.fullName,
      details: details ?? null,
      createdAt: new Date().toISOString(),
    });
    write(LS.audit, this.audit.slice(0, 500));
  }

  private persistAll() {
    write(LS.clients, this.clients);
    write(LS.loans, this.loans);
    write(LS.installments, this.installments);
    write(LS.payments, this.payments);
    write(LS.paymentMethods, this.paymentMethods);
    write(LS.notificationTemplates, this.notificationTemplates);
    write(LS.notifications, this.notifications);
    write(LS.paymentChannels, this.paymentChannels);
    write(LS.activities, this.activities);
    write(LS.profiles, this.profiles);
    write(LS.roles, this.roles);
  }

  private markOverdue() {
    const today = todayISO();
    this.installments.forEach(i => {
      if (i.dueDate < today && (i.status === 'pending' || i.status === 'partial')) {
        i.status = 'overdue';
      }
    });
    this.loans.forEach(l => {
      const li = this.installments.filter(i => i.loanId === l.id);
      const hasOverdue = li.some(i => i.dueDate < today && i.status !== 'paid' && i.status !== 'waived');
      if (hasOverdue && l.status === 'active') l.status = 'overdue';
      if (!hasOverdue && l.status === 'overdue' && li.every(i => i.dueDate >= today || i.status === 'paid' || i.status === 'waived')) {
        l.status = 'active';
      }
    });
  }

  // --- Demo data -----------------------------------------------------------

  private seedDemoData() {
    const today = todayISO();
    const mkClient = (name: string, phone: string, doc: string, addr: string): Client => ({
      id: uid(), name, document: doc, phone, email: '', address: addr, notes: '',
      registrationDate: today, riskScore: 50, active: true, createdAt: new Date().toISOString(),
    });
    const c1 = mkClient('María González', '573001112233', 'CC 1.023.456', 'Calle 10 #5-25');
    const c2 = mkClient('Carlos Rodríguez', '573014445566', 'CC 79.564.123', 'Carrera 45 #12-30');
    const c3 = mkClient('Ana Martínez', '573027778899', 'CC 52.987.341', 'Barrio Centro, Casa 8');
    const c4 = mkClient('Jorge López', '573033334455', 'CC 8.001.234', 'Vereda La Esperanza');
    this.clients = [c1, c2, c3, c4];

    const mkLoan = (
      client: Client, principal: number, rate: number, count: number,
      freq: Loan['frequency'], firstDueOffset: number, simPaid: number
    ): { loan: Loan; inst: Installment[]; pays: Payment[] } => {
      const loanId = uid();
      const total = Number((principal * (1 + rate / 100)).toFixed(2));
      const loan: Loan = {
        id: loanId, clientId: client.id, principal, interestRate: rate,
        totalInterest: Number((total - principal).toFixed(2)), totalDue: total,
        installmentsCount: count, frequency: freq,
        firstDueDate: addDaysISO(today, firstDueOffset),
        status: 'active', notes: '', assignedTo: null,
        createdAt: new Date().toISOString(),
      };
      const sched = generateSchedule(principal, rate, count, freq, loan.firstDueDate);
      const inst: Installment[] = sched.map(s => ({
        id: uid(), loanId, installmentNumber: s.installmentNumber,
        dueDate: s.dueDate, amountDue: s.amountDue, amountPaid: 0, status: 'pending', paidAt: null,
      }));
      const pays: Payment[] = [];
      // Simular pagos puntuales de las primeras cuotas (fecha = vencimiento)
      for (let n = 1; n <= simPaid; n++) {
        const instn = inst[n - 1];
        if (!instn || instn.dueDate > today) break;
        instn.amountPaid = instn.amountDue;
        instn.status = 'paid';
        instn.paidAt = new Date(`${instn.dueDate}T10:00:00`).toISOString();
        const remainingAfter = Math.max(0, total - inst.slice(0, n).reduce((a, x) => a + x.amountPaid, 0));
        pays.push({
          id: uid(), loanId, clientId: client.id, amount: instn.amountDue,
          method: 'cash', notes: '', paymentDate: instn.dueDate,
          balanceAfter: remainingAfter, receivedBy: DEMO_USER.id, createdAt: instn.paidAt,
        });
      }
      this.recomputeStatus(loan, inst);
      return { loan, inst, pays };
    };

    const a = mkLoan(c1, 500000, 15, 4, 'monthly', -60, 1);  // 1 cuota pagada, 2ª vencida → mora
    const b = mkLoan(c2, 800000, 10, 4, 'biweekly', -15, 1); // al día con 1 pagada
    const c = mkLoan(c3, 300000, 20, 3, 'weekly', 3, 0);     // próxima a vencer
    const d = mkLoan(c4, 1000000, 12, 6, 'monthly', -120, 4);// fuerte mora
    this.loans = [a.loan, b.loan, c.loan, d.loan];
    this.installments = [...a.inst, ...b.inst, ...c.inst, ...d.inst];
    this.payments = [...a.pays, ...b.pays, ...c.pays, ...d.pays];

    const act = (loanId: string, clientId: string, type: CollectionActivity['type'], result: CollectionActivity['result'], daysAgo: number, promise?: number, notes = ''): CollectionActivity => ({
      id: uid(), loanId, clientId, type, result,
      promiseDate: promise !== undefined ? addDaysISO(today, promise) : null,
      notes, activityDate: new Date(Date.now() - daysAgo * 86400000).toISOString(), createdBy: DEMO_USER.id,
    });
    this.activities = [
      act(d.loan.id, c4.id, 'call', 'contacted_promised', 6, 2, 'Prometió abonar la cuota 5.'),
      act(d.loan.id, c4.id, 'visit', 'no_answer', 3, undefined, 'No estaba en el domicilio.'),
      act(a.loan.id, c1.id, 'whatsapp', 'message_sent', 2, undefined, 'Recordatorio enviado.'),
    ];

    this.clients.forEach(cl => {
      cl.riskScore = computeRiskScore(cl.id, this.loans, this.installments);
    });

    this.audit.unshift({
      id: uid(), entity: 'system', entityId: null, action: 'SEED',
      actor: DEMO_USER.id, actorName: DEMO_USER.fullName,
      details: { message: 'Datos de demostración generados' },
      createdAt: new Date().toISOString(),
    });
    this.persistAll();
    write(LS.audit, this.audit);
  }

  private recomputeStatus(loan: Loan, li: Installment[]) {
    const today = todayISO();
    const allPaid = li.every(i => i.status === 'paid' || i.status === 'waived');
    if (allPaid && li.length > 0) {
      loan.status = 'paid';
      return;
    }
    const hasOverdue = li.some(i => i.dueDate < today && i.status !== 'paid' && i.status !== 'waived');
    loan.status = hasOverdue ? 'overdue' : 'active';
  }

  // --- Auth ------------------------------------------------------------------

  async getSession(): Promise<AuthUser | null> {
    return read<AuthUser | null>(LS.session, null);
  }

  async signIn(email: string): Promise<AuthUser> {
    const existing = read<AuthUser | null>(LS.session, null);
    if (existing && existing.email.toLowerCase() === email.toLowerCase()) return existing;

    const client = this.clients.find(c => c.email && c.email.toLowerCase() === email.toLowerCase());
    const user: AuthUser = client
      ? { id: `local-client-${client.id}`, email, fullName: client.name, role: 'cliente', clientId: client.id }
      : { ...DEMO_USER, email };
    write(LS.session, user);
    return user;
  }

  async signUp(email: string, _password: string, fullName: string, options?: SignUpOptions): Promise<void> {
    const role = options?.role ?? 'cobrador';
    let clientId: string | null = null;
    if (role === 'cliente') {
      let client = this.clients.find(c => c.email && c.email.toLowerCase() === email.toLowerCase());
      if (!client) {
        client = {
          id: uid(), name: fullName, document: options?.document, phone: options?.phone ?? '',
          email, address: undefined, notes: undefined, registrationDate: todayISO(),
          riskScore: 50, active: true, createdAt: new Date().toISOString(),
        };
        this.clients.push(client);
        this.persistAll();
      }
      clientId = client.id;
    }
    write(LS.session, { id: uid(), email, fullName, role, clientId });
  }

  async resetPassword(_email: string): Promise<void> {
    throw new Error('La recuperación de contraseña requiere el modo multiusuario (Supabase).');
  }

  async updatePassword(_newPassword: string): Promise<void> {
    throw new Error('Cambiar contraseña requiere el modo multiusuario (Supabase).');
  }

  async signOut(): Promise<void> {
    resolvedStorage().remove(LS.session);
  }

  // --- Lectura -----------------------------------------------------------------

  async listProfiles(): Promise<Profile[]> {
    this.ensureProfiles();
    return [...this.profiles];
  }

  /** En modo navegador sin usuarios reales se mantiene el operador demo. */
  private ensureProfiles() {
    if (this.profiles.length === 0) {
      this.profiles = [{ id: DEMO_USER.id, fullName: DEMO_USER.fullName, role: 'admin', active: true, email: DEMO_USER.email }];
    }
  }

  /** Alta o actualización del perfil tras el inicio de sesión (modo servidor). */
  upsertProfile(input: { id: string; fullName: string; email?: string }): Profile {
    let profile = this.profiles.find(p => p.id === input.id);
    if (!profile) {
      profile = {
        id: input.id,
        fullName: input.fullName,
        email: input.email,
        role: this.profiles.length === 0 ? 'admin' : 'cliente',
        active: true,
        clientId: null,
      };
      this.profiles.push(profile);
      write(LS.profiles, this.profiles);
      return { ...profile };
    }
    let changed = false;
    if (input.fullName && profile.fullName !== input.fullName) { profile.fullName = input.fullName; changed = true; }
    if (input.email && profile.email !== input.email) { profile.email = input.email; changed = true; }
    if (changed) write(LS.profiles, this.profiles);
    return { ...profile };
  }

  async listClients(): Promise<Client[]> {
    this.markOverdue();
    this.persistAll();
    return [...this.clients];
  }

  async listLoans(): Promise<Loan[]> {
    this.markOverdue();
    this.persistAll();
    return [...this.loans];
  }

  async listInstallments(): Promise<Installment[]> {
    return [...this.installments];
  }

  async listPayments(): Promise<Payment[]> {
    return [...this.payments];
  }

  async listPaymentMethods(): Promise<PaymentMethodOption[]> {
    return [...this.paymentMethods].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async savePaymentMethod(input: { id?: string; name: string; active?: boolean }): Promise<PaymentMethodOption> {
    const name = input.name.trim();
    if (!name) throw new Error('El nombre del método es obligatorio');
    const id = input.id ?? paymentMethodSlug(name);
    const existing = this.paymentMethods.find(m => m.id === id);
    if (existing) {
      existing.name = name;
      if (input.active !== undefined) existing.active = input.active;
    } else {
      if (this.paymentMethods.some(m => m.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Ya existe un método con ese nombre');
      }
      this.paymentMethods.push({
        id, name, active: input.active ?? true,
        sortOrder: Math.max(0, ...this.paymentMethods.map(m => m.sortOrder)) + 1,
      });
    }
    this.auditEvent('payment_methods', id, existing ? 'UPDATE' : 'INSERT', { name });
    write(LS.paymentMethods, this.paymentMethods);
    return { ...this.paymentMethods.find(m => m.id === id)! };
  }

  async listNotificationTemplates(): Promise<NotificationTemplate[]> {
    return [...this.notificationTemplates];
  }

  async saveNotificationTemplate(input: NotificationTemplate): Promise<NotificationTemplate> {
    if (!input.body.trim()) throw new Error('El mensaje no puede estar vacío');
    const saved = { ...input, id: input.id || paymentMethodSlug(input.name) };
    const idx = this.notificationTemplates.findIndex(t => t.id === saved.id);
    if (idx >= 0) this.notificationTemplates[idx] = saved;
    else this.notificationTemplates.push(saved);
    write(LS.notificationTemplates, this.notificationTemplates);
    this.auditEvent('notification_templates', saved.id, idx >= 0 ? 'UPDATE' : 'INSERT', { name: saved.name });
    return { ...saved };
  }

  async listNotifications(): Promise<AppNotification[]> {
    return [...this.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createNotification(input: NewNotificationInput): Promise<AppNotification> {
    const notif: AppNotification = {
      id: uid(), clientId: input.clientId ?? null, loanId: input.loanId ?? null,
      channel: input.channel, templateId: input.templateId ?? null,
      title: input.title, body: input.body, status: 'pending',
      createdAt: new Date().toISOString(), sentAt: null,
    };
    this.notifications.unshift(notif);
    write(LS.notifications, this.notifications);
    return { ...notif };
  }

  async setNotificationStatus(id: string, status: NotificationStatus): Promise<void> {
    const n = this.notifications.find(x => x.id === id);
    if (!n) throw new Error('Notificación no encontrada');
    n.status = status;
    if (status === 'sent') n.sentAt = new Date().toISOString();
    write(LS.notifications, this.notifications);
  }

  async listPaymentChannels(): Promise<PaymentChannel[]> {
    return [...this.paymentChannels].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async savePaymentChannel(input: PaymentChannelInput): Promise<PaymentChannel> {
    const name = input.name.trim();
    if (!name) throw new Error('El nombre del canal es obligatorio');
    const id = input.id ?? uid();
    const existing = this.paymentChannels.find(c => c.id === id);
    const channel: PaymentChannel = {
      id, name, kind: input.kind,
      accountInfo: input.accountInfo, instructions: input.instructions, link: input.link,
      active: input.active ?? existing?.active ?? true,
      sortOrder: existing?.sortOrder ?? Math.max(0, ...this.paymentChannels.map(c => c.sortOrder)) + 1,
    };
    const idx = this.paymentChannels.findIndex(c => c.id === id);
    if (idx >= 0) this.paymentChannels[idx] = channel;
    else this.paymentChannels.push(channel);
    write(LS.paymentChannels, this.paymentChannels);
    this.auditEvent('payment_channels', id, idx >= 0 ? 'UPDATE' : 'INSERT', { name });
    return { ...channel };
  }

  async listActivities(): Promise<CollectionActivity[]> {
    return [...this.activities];
  }

  async listAuditEvents(limit = 200): Promise<AuditEvent[]> {
    return this.audit.slice(0, limit);
  }

  async getSettings(): Promise<AppSettings> {
    return { ...this.settings };
  }

  async getClientMora(clientId: string): Promise<number> {
    return clientMoraAmount(clientId, this.loans, this.installments, this.settings.moraRate ?? 5);
  }

  // --- Escritura -----------------------------------------------------------------

  async createClient(input: NewClientInput): Promise<Client> {
    const client: Client = {
      id: uid(),
      name: input.name,
      document: input.document,
      phone: input.phone,
      email: input.email,
      address: input.address,
      notes: input.notes,
      registrationDate: todayISO(),
      riskScore: 50,
      active: true,
      createdAt: new Date().toISOString(),
    };
    this.clients.push(client);
    this.auditEvent('clients', client.id, 'INSERT', { name: client.name });
    this.persistAll();
    return client;
  }

  async updateClient(id: string, patch: Partial<NewClientInput> & { active?: boolean }): Promise<void> {
    const idx = this.clients.findIndex(c => c.id === id);
    if (idx < 0) throw new Error('Cliente no encontrado');
    this.clients[idx] = { ...this.clients[idx], ...patch };
    this.auditEvent('clients', id, 'UPDATE', patch);
    this.persistAll();
  }

  async createLoan(input: CreateLoanInput): Promise<Loan> {
    const client = this.clients.find(c => c.id === input.clientId);
    if (!client) throw new Error('Cliente no encontrado');

    const total = Number((input.principal * (1 + input.interestRate / 100)).toFixed(2));
    const loan: Loan = {
      id: uid(),
      clientId: input.clientId,
      principal: input.principal,
      interestRate: input.interestRate,
      totalInterest: Number((total - input.principal).toFixed(2)),
      totalDue: total,
      installmentsCount: input.installmentsCount,
      frequency: input.frequency,
      firstDueDate: input.firstDueDate,
      status: 'active',
      notes: input.notes,
      assignedTo: input.assignedTo ?? null,
      createdAt: new Date().toISOString(),
    };
    const sched = generateSchedule(input.principal, input.interestRate, input.installmentsCount, input.frequency, input.firstDueDate);
    const inst: Installment[] = sched.map(s => ({
      id: uid(), loanId: loan.id, installmentNumber: s.installmentNumber,
      dueDate: s.dueDate, amountDue: s.amountDue, amountPaid: 0, status: 'pending', paidAt: null,
    }));

    this.loans.push(loan);
    this.installments.push(...inst);
    this.recomputeStatus(loan, inst);
    client.riskScore = computeRiskScore(client.id, this.loans, this.installments);
    this.auditEvent('loans', loan.id, 'INSERT', {
      principal: loan.principal, rate: loan.interestRate, cuotas: loan.installmentsCount,
    });
    this.persistAll();
    return loan;
  }

  async restructureLoan(input: RestructureLoanInput): Promise<Loan> {
    const loan = this.loans.find(l => l.id === input.loanId);
    if (!loan) throw new Error('Préstamo no encontrado');

    const current = this.installments
      .filter(i => i.loanId === loan.id)
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    const { keep, pendingRemaining } = splitInstallmentsForRestructure(current);
    if (pendingRemaining <= 0) throw new Error('El préstamo no tiene saldo pendiente por reestructurar');

    const newPendingCount = input.newInstallmentsCount - keep.length;
    if (newPendingCount < 1) {
      throw new Error(`El total de cuotas debe ser mayor a las ${keep.length} cuotas ya pagadas o abonadas.`);
    }

    const startNumber = keep.reduce((max, i) => Math.max(max, i.installmentNumber), 0) + 1;
    const rows = restructureSchedule(pendingRemaining, newPendingCount, input.frequency, input.firstDueDate, startNumber);
    const keepIds = new Set(keep.map(i => i.id));
    this.installments = this.installments.filter(i => i.loanId !== loan.id || keepIds.has(i.id));
    rows.forEach(r => this.installments.push({
      id: uid(), loanId: loan.id, installmentNumber: r.installmentNumber,
      dueDate: r.dueDate, amountDue: r.amountDue, amountPaid: 0, status: 'pending', paidAt: null,
    }));

    loan.installmentsCount = input.newInstallmentsCount;
    loan.frequency = input.frequency;
    loan.firstDueDate = input.firstDueDate;
    this.recomputeStatus(loan, this.installments.filter(i => i.loanId === loan.id));
    this.auditEvent('loans', loan.id, 'RESTRUCTURE', {
      previousCount: current.length,
      newCount: input.newInstallmentsCount,
      frequency: input.frequency,
      firstDueDate: input.firstDueDate,
      pendingRemaining,
    });
    this.persistAll();
    return loan;
  }

  async listApplications(): Promise<CreditApplication[]> {
    return [...this.applications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createApplication(input: NewCreditApplicationInput): Promise<CreditApplication> {
    const client = input.clientId
      ? this.clients.find(c => c.id === input.clientId)
      : emailMatch(this.clients, input.email);
    const now = new Date().toISOString();
    const application: CreditApplication = {
      id: uid(),
      clientId: client?.id ?? input.clientId ?? null,
      applicantName: input.applicantName ?? client?.name ?? 'Cliente',
      document: input.document ?? client?.document,
      phone: input.phone ?? client?.phone ?? '',
      email: input.email ?? client?.email,
      address: input.address ?? client?.address,
      requestedAmount: input.requestedAmount,
      purpose: input.purpose,
      notes: input.notes,
      status: 'pending',
      reviewNotes: null,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
    };
    this.applications.unshift(application);
    write(LS.applications, this.applications);
    this.auditEvent('credit_applications', application.id, 'INSERT', { amount: application.requestedAmount });
    return application;
  }

  async updateApplicationStatus(
    id: string,
    status: CreditApplicationStatus,
    reviewNotes?: string,
    approvedAmount?: number | null,
  ): Promise<void> {
    const app = this.applications.find(a => a.id === id);
    if (!app) throw new Error('Solicitud no encontrada');
    app.status = status;
    app.reviewNotes = reviewNotes ?? app.reviewNotes;
    app.approvedAmount = status === 'approved' ? (approvedAmount ?? app.requestedAmount) : null;
    app.updatedAt = new Date().toISOString();
    write(LS.applications, this.applications);
    this.auditEvent('credit_applications', id, status.toUpperCase(), {
      reviewNotes, approvedAmount: app.approvedAmount,
    });
  }

  async linkClientToProfile(userId: string, clientId: string | null): Promise<void> {
    const profile = this.profiles.find(p => p.id === userId);
    if (!profile) throw new Error('Perfil no encontrado');
    profile.clientId = clientId;
    write(LS.profiles, this.profiles);
    this.auditEvent('profiles', userId, 'LINK_CLIENT', { clientId });
  }

  /** Restaura un respaldo JSON (acepta el formato exportado por la app y el del navegador). */
  async importBackup(input: Record<string, any>): Promise<void> {
    if (this.clients.length > 0 || this.loans.length > 0) {
      throw new Error('Esta instalación ya tiene datos. El respaldo solo se puede importar en una base vacía.');
    }
    const pick = <T,>(...keys: string[]): T[] | null => {
      for (const key of keys) {
        const value = input?.[key];
        if (Array.isArray(value)) return value as T[];
      }
      return null;
    };

    const clients = pick<Client>('clients', 'db_clients') ?? [];
    if (clients.length === 0) throw new Error('El archivo no contiene clientes para importar.');

    this.clients = clients;
    this.loans = pick<Loan>('loans', 'db_loans') ?? [];
    this.installments = pick<Installment>('installments', 'db_installments') ?? [];
    this.payments = pick<Payment>('payments', 'db_payments') ?? [];
    this.activities = pick<CollectionActivity>('activities', 'db_activities') ?? [];
    this.applications = pick<CreditApplication>('applications', 'db_applications') ?? [];
    this.notifications = pick<AppNotification>('notifications', 'db_notifications') ?? [];

    const methods = pick<PaymentMethodOption>('paymentMethods', 'db_payment_methods');
    if (methods && methods.length) this.paymentMethods = methods;
    const templates = pick<NotificationTemplate>('notificationTemplates', 'db_notification_templates');
    if (templates && templates.length) this.notificationTemplates = templates;
    const channels = pick<PaymentChannel>('paymentChannels', 'db_payment_channels');
    if (channels && channels.length) this.paymentChannels = channels;

    const settings = input?.settings ?? input?.db_settings;
    if (settings && typeof settings === 'object') this.settings = { ...this.settings, ...(settings as Partial<AppSettings>) };

    this.auditEvent('system', 'import', 'IMPORT', {
      clients: this.clients.length, loans: this.loans.length, payments: this.payments.length,
    });
    write(LS.settings, this.settings);
    this.persistAll();
  }

  /** En el navegador y en Supabase no hay copias del lado del servidor. */
  async listBackups(): Promise<BackupInfo[]> {
    return [];
  }

  async restoreBackup(): Promise<void> {
    throw new Error('Los respaldos del servidor solo están disponibles en la versión en la nube (Sites).');
  }

  async cancelLoan(id: string, reason: string): Promise<void> {
    const loan = this.loans.find(l => l.id === id);
    if (!loan) throw new Error('Préstamo no encontrado');
    loan.status = 'cancelled';
    this.installments.filter(i => i.loanId === id && i.status !== 'paid').forEach(i => { i.status = 'waived'; });
    this.auditEvent('loans', id, 'CANCEL', { reason });
    this.persistAll();
  }

  async assignLoan(id: string, userId: string | null): Promise<void> {
    const loan = this.loans.find(l => l.id === id);
    if (!loan) throw new Error('Préstamo no encontrado');
    loan.assignedTo = userId;
    this.auditEvent('loans', id, 'ASSIGN', { assignedTo: userId });
    this.persistAll();
  }

  async registerPayment(input: PayInput): Promise<Payment> {
    const loan = this.loans.find(l => l.id === input.loanId);
    if (!loan) throw new Error('Préstamo no encontrado');
    const li = this.installments
      .filter(i => i.loanId === input.loanId && i.status !== 'paid' && i.status !== 'waived')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber);

    const outstandingBefore = li.reduce((acc, i) => acc + (i.amountDue - i.amountPaid), 0);
    if (input.amount > outstandingBefore + 0.001) {
      throw new Error(`El pago (${input.amount}) excede el saldo pendiente (${outstandingBefore.toFixed(2)})`);
    }

    let remaining = input.amount;
    const date = input.date ?? todayISO();
    li.forEach(i => {
      if (remaining <= 0) return;
      const need = i.amountDue - i.amountPaid;
      const apply = Math.min(remaining, need);
      i.amountPaid = Number((i.amountPaid + apply).toFixed(2));
      i.status = i.amountPaid >= i.amountDue ? 'paid' : 'partial';
      if (i.status === 'paid') i.paidAt = new Date().toISOString();
      remaining = Number((remaining - apply).toFixed(2));
    });

    this.recomputeStatus(loan, this.installments.filter(i => i.loanId === input.loanId));
    const payment: Payment = {
      id: uid(), loanId: loan.id, clientId: loan.clientId, amount: input.amount,
      method: input.method, notes: input.notes, paymentDate: date,
      balanceAfter: loanOutstanding(loan.id, this.installments),
      receivedBy: this.actor.id, createdAt: new Date().toISOString(),
    };
    this.payments.push(payment);
    this.auditEvent('payments', payment.id, 'INSERT', {
      loanId: loan.id, amount: payment.amount, method: payment.method,
    });
    this.persistAll();
    return payment;
  }

  async voidPayment(paymentId: string, reason: string): Promise<void> {
    const idx = this.payments.findIndex(p => p.id === paymentId);
    if (idx < 0) throw new Error('Pago no encontrado');
    if (!reason.trim()) throw new Error('Se requiere un motivo para anular un pago');
    const payment = this.payments[idx];
    const loan = this.loans.find(l => l.id === payment.loanId);
    if (!loan) throw new Error('Préstamo no encontrado');

    // Revertir: reasignar los pagos posteriores sería complejo; en modo local
    // recalculamos las cuotas desde cero excluyendo este pago.
    this.rebuildAllocations(loan.id, this.payments.filter(p => p.id !== paymentId));
    payment.notes = `${payment.notes ?? ''} | ANULADO: ${reason}`.trim();
    this.auditEvent('payments', paymentId, 'VOID', { reason, amount: payment.amount });
    this.persistAll();
  }

  private rebuildAllocations(loanId: string, keep: Payment[]) {
    const li = this.installments.filter(i => i.loanId === loanId);
    li.forEach(i => { i.amountPaid = 0; i.status = i.status === 'waived' ? 'waived' : 'pending'; i.paidAt = null; });
    const sorted = [...keep].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.createdAt.localeCompare(b.createdAt));
    sorted.forEach(p => {
      let remaining = p.amount;
      li.filter(i => i.status !== 'paid' && i.status !== 'waived')
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber)
        .forEach(i => {
          if (remaining <= 0) return;
          const apply = Math.min(remaining, i.amountDue - i.amountPaid);
          i.amountPaid = Number((i.amountPaid + apply).toFixed(2));
          i.status = i.amountPaid >= i.amountDue ? 'paid' : 'partial';
          if (i.status === 'paid') i.paidAt = new Date(`${p.paymentDate}T10:00:00`).toISOString();
          remaining = Number((remaining - apply).toFixed(2));
        });
    });
    const loan = this.loans.find(l => l.id === loanId);
    if (loan) this.recomputeStatus(loan, li);
  }

  async logActivity(input: ActivityInput): Promise<CollectionActivity> {
    const loan = this.loans.find(l => l.id === input.loanId);
    if (!loan) throw new Error('Préstamo no encontrado');
    const activity: CollectionActivity = {
      id: uid(), loanId: input.loanId, clientId: loan.clientId,
      type: input.type, result: input.result,
      promiseDate: input.promiseDate ?? null,
      notes: input.notes, activityDate: new Date().toISOString(),
      createdBy: this.actor.id,
    };
    this.activities.push(activity);
    this.auditEvent('collection_activities', activity.id, 'INSERT', {
      type: activity.type, result: activity.result, promiseDate: activity.promiseDate,
    });
    this.persistAll();
    return activity;
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    this.settings = { ...this.settings, ...patch };
    write(LS.settings, this.settings);
    this.auditEvent('app_settings', '1', 'UPDATE', patch);
    return { ...this.settings };
  }

  async updateProfileRole(userId: string, role: UserRole): Promise<void> {
    const profile = this.profiles.find(p => p.id === userId);
    if (!profile) throw new Error('Perfil no encontrado');
    const custom = this.roles.find(r => r.id === role);
    profile.role = custom ? 'cobrador' : role;
    profile.roleId = custom?.id;
    profile.roleName = custom?.name;
    profile.screens = custom?.screens;
    profile.perms = custom?.perms;
    write(LS.profiles, this.profiles);
    this.auditEvent('profiles', userId, 'ROLE', { role, roleId: profile.roleId });
  }

  async listRoles(): Promise<CustomRole[]> {
    return [...this.roles];
  }

  async saveRole(role: CustomRole): Promise<void> {
    const idx = this.roles.findIndex(r => r.id === role.id);
    if (idx >= 0) this.roles[idx] = role;
    else this.roles.push(role);
    write(LS.roles, this.roles);
    this.auditEvent('roles', role.id, idx >= 0 ? 'UPDATE' : 'INSERT', { name: role.name });
  }

  async deleteRole(roleId: string): Promise<void> {
    this.roles = this.roles.filter(r => r.id !== roleId);
    this.profiles = this.profiles.map(p => (p.roleId === roleId ? { ...p, roleId: undefined, roleName: undefined } : p));
    write(LS.roles, this.roles);
    write(LS.profiles, this.profiles);
    this.auditEvent('roles', roleId, 'DELETE');
  }

  async toggleProfileActive(userId: string, active: boolean): Promise<void> {
    const profile = this.profiles.find(p => p.id === userId);
    if (!profile) throw new Error('Perfil no encontrado');
    profile.active = active;
    write(LS.profiles, this.profiles);
    this.auditEvent('profiles', userId, active ? 'ACTIVATE' : 'DEACTIVATE');
  }
}

const addDaysISO = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const emailMatch = (clients: Client[], email?: string): Client | undefined =>
  email ? clients.find(c => c.email && c.email.toLowerCase() === email.toLowerCase()) : undefined;
