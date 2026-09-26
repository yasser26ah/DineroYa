// ============================================================================
// DineroYa — Capa de datos desacoplada
// Dos implementaciones de una misma interfaz:
//  - LocalDataAdapter: todo en localStorage (sin backend, con demo data opcional)
//  - SupabaseAdapter:   Postgres + Auth + RLS (producción multiusuario)
// La app usa Supabase cuando existen VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY,
// y modo local (con usuario demo) en caso contrario.
// ============================================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AppSettings, AuditEvent, Client, CollectionActivity, Installment, Loan,
  Payment, Profile, UserRole,
} from '../types';
import { DEFAULT_SETTINGS, todayISO } from '../lib/format';
import {
  EMPTY_SETTINGS, generateSchedule, computeRiskScore, loanOutstanding, clientMoraAmount,
} from '../lib/engine';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
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

export interface DataAdapter {
  readonly mode: 'local' | 'supabase';

  // Auth
  getSession(): Promise<AuthUser | null>;
  signIn(email: string, password: string): Promise<AuthUser>;
  signUp(email: string, password: string, fullName: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  signOut(): Promise<void>;

  // Lectura
  listProfiles(): Promise<Profile[]>;
  listClients(): Promise<Client[]>;
  listLoans(): Promise<Loan[]>;
  listInstallments(): Promise<Installment[]>;
  listPayments(): Promise<Payment[]>;
  listActivities(): Promise<CollectionActivity[]>;
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  getSettings(): Promise<AppSettings>;
  getClientMora(clientId: string): Promise<number>;

  // Escritura
  createClient(input: NewClientInput): Promise<Client>;
  updateClient(id: string, patch: Partial<NewClientInput> & { active?: boolean }): Promise<void>;
  createLoan(input: CreateLoanInput): Promise<Loan>;
  cancelLoan(id: string, reason: string): Promise<void>;
  assignLoan(id: string, userId: string | null): Promise<void>;
  registerPayment(input: PayInput): Promise<Payment>;
  voidPayment(paymentId: string, reason: string): Promise<void>;
  logActivity(input: ActivityInput): Promise<CollectionActivity>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
  updateProfileRole(userId: string, role: UserRole): Promise<void>;
  toggleProfileActive(userId: string, active: boolean): Promise<void>;
}

// ============================================================================
// Adaptador LOCAL (localStorage) — para demo / un solo operador
// ============================================================================

const LS = {
  clients: 'db_clients',
  loans: 'db_loans',
  installments: 'db_installments',
  payments: 'db_payments',
  activities: 'db_activities',
  audit: 'db_audit',
  settings: 'db_settings',
  session: 'db_session',
  seeded: 'db_seeded_v3',
};

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const write = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value));

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const DEMO_USER: AuthUser = {
  id: 'demo-user',
  email: 'demo@finanzapro.local',
  fullName: 'Operador Demo',
  role: 'admin',
};

export class LocalDataAdapter implements DataAdapter {
  readonly mode = 'local' as const;

  private clients: Client[] = [];
  private loans: Loan[] = [];
  private installments: Installment[] = [];
  private payments: Payment[] = [];
  private activities: CollectionActivity[] = [];
  private audit: AuditEvent[] = [];
  private settings: AppSettings = { ...DEFAULT_SETTINGS };

  constructor(seedDemo = true) {
    this.clients = read<Client[]>(LS.clients, []);
    this.loans = read<Loan[]>(LS.loans, []);
    this.installments = read<Installment[]>(LS.installments, []);
    this.payments = read<Payment[]>(LS.payments, []);
    this.activities = read<CollectionActivity[]>(LS.activities, []);
    this.audit = read<AuditEvent[]>(LS.audit, []);
    this.settings = { ...EMPTY_SETTINGS, ...read<Partial<AppSettings>>(LS.settings, {}) };

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
      actor: DEMO_USER.id,
      actorName: DEMO_USER.fullName,
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
    write(LS.activities, this.activities);
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
    const user = { ...DEMO_USER, email };
    write(LS.session, user);
    return user;
  }

  async signUp(email: string, _password: string, fullName: string): Promise<void> {
    write(LS.session, { ...DEMO_USER, email, fullName });
  }

  async resetPassword(_email: string): Promise<void> {
    throw new Error('La recuperación de contraseña requiere el modo multiusuario (Supabase).');
  }

  async updatePassword(_newPassword: string): Promise<void> {
    throw new Error('Cambiar contraseña requiere el modo multiusuario (Supabase).');
  }

  async signOut(): Promise<void> {
    localStorage.removeItem(LS.session);
  }

  // --- Lectura -----------------------------------------------------------------

  async listProfiles(): Promise<Profile[]> {
    return [{ id: DEMO_USER.id, fullName: DEMO_USER.fullName, role: 'admin', active: true, email: DEMO_USER.email }];
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
      receivedBy: DEMO_USER.id, createdAt: new Date().toISOString(),
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
      createdBy: DEMO_USER.id,
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

  async updateProfileRole(): Promise<void> {
    // Sin usuarios reales en modo local
  }

  async toggleProfileActive(): Promise<void> {
    // Sin usuarios reales en modo local
  }
}

const addDaysISO = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

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
    };
  }

  private fetchMyProfile = async (): Promise<Profile | null> => {
    const { data: auth } = await this.db.auth.getUser();
    if (!auth.user) return null;
    const { data } = await this.db.from('profiles').select('*').eq('id', auth.user.id).maybeSingle();
    return data ? mapProfile({ ...data, email: auth.user.email }) : null;
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

  async signUp(email: string, password: string, fullName: string): Promise<void> {
    const { error } = await this.db.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } },
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
    return profiles.map((r: any) => mapProfile({ ...r, email: r.id === auth.data.user?.id ? auth.data.user?.email : undefined }));
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
    const { data, error } = await this.db.from('collection_activities').insert({
      loan_id: input.loanId,
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

  async updateProfileRole(userId: string, role: UserRole): Promise<void> {
    const { error } = await this.db.from('profiles').update({ role }).eq('id', userId);
    if (error) throw new Error(error.message);
  }

  async toggleProfileActive(userId: string, active: boolean): Promise<void> {
    const { error } = await this.db.from('profiles').update({ active }).eq('id', userId);
    if (error) throw new Error(error.message);
  }
}

// ============================================================================
// Selección de adaptador
// ============================================================================

let adapter: DataAdapter | null = null;

export const getAdapter = (): DataAdapter => {
  if (!adapter) {
    adapter = isSupabaseConfigured ? new SupabaseAdapter() : new LocalDataAdapter(true);
  }
  return adapter;
};

export const resetAdapter = () => { adapter = null; };

// Export tipo para contextos
export type { DataAdapter as IDataAdapter };
