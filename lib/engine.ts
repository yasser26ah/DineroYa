// ============================================================================
// DineroYa — Motor de negocio (compartido por adaptador local y Supabase)
// ============================================================================

import {
  ActivityResult, AppSettings, Client, Installment, Loan, LoanBalance, LoanFrequency,
  Payment, PortfolioSummary, QueueRow, AgingRow, AgingBucket,
} from '../types';
import { todayISO, daysBetween } from './format';

export const EMPTY_SETTINGS: AppSettings = {
  currency: '$',
  defaultInterestRate: 15,
  companyName: 'DineroYa',
  moraRate: 5,
};

// --- Fórmulas ---------------------------------------------------------------

export const totalDueFor = (principal: number, rate: number): number =>
  Number((principal * (1 + rate / 100)).toFixed(2));

export const riskSuggestedRate = (clientRisk: number, baseRate: number): number => {
  if (clientRisk > 80) return Math.max(0, baseRate - 5);
  if (clientRisk >= 40) return baseRate;
  return baseRate + 10;
};

/**
 * Interés de mora acumulado de un cliente: saldo vencido de cada cuota ×
 * tasa de mora mensual × (días vencidos / 30). Requiere moraRate > 0 en
 * configuración; coincide con fn_client_mora() en Supabase.
 */
export const clientMoraAmount = (
  clientId: string,
  loans: Loan[],
  installments: Installment[],
  moraRate: number,
  today = todayISO()
): number => {
  if (moraRate <= 0) return 0;
  const activeLoanIds = new Set(
    loans.filter(l => l.clientId === clientId && (l.status === 'active' || l.status === 'overdue')).map(l => l.id)
  );
  let mora = 0;
  installments.forEach(i => {
    if (!activeLoanIds.has(i.loanId)) return;
    if (i.status === 'paid' || i.status === 'waived') return;
    if (i.dueDate >= today) return;
    const days = daysBetween(i.dueDate, today);
    const saldo = Math.max(i.amountDue - i.amountPaid, 0);
    mora += (saldo * moraRate / 100) * (days / 30);
  });
  return Number(mora.toFixed(2));
};

// --- Calendario de cuotas -----------------------------------------------------

export interface ScheduleRow {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
}

export const restructureSchedule = (
  remainingDue: number,
  newPendingCount: number,
  frequency: LoanFrequency,
  firstDueDate: string,
  startInstallmentNumber = 1,
): ScheduleRow[] => {
  if (newPendingCount < 1) throw new Error('Número de cuotas pendientes inválido');
  if (remainingDue <= 0) throw new Error('No hay saldo pendiente para redistribuir');
  const each = Number((remainingDue / newPendingCount).toFixed(2));
  const last = Number((remainingDue - each * (newPendingCount - 1)).toFixed(2));
  const stepDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 15 : 30;
  const rows: ScheduleRow[] = [];
  let due = firstDueDate;
  for (let i = 1; i <= newPendingCount; i++) {
    const installmentNumber = startInstallmentNumber + i - 1;
    rows.push({ installmentNumber, dueDate: due, amountDue: i === newPendingCount ? last : each });
    due = addDays(due, stepDays);
  }
  return rows;
};

/**
 * Separa las cuotas de un préstamo en dos grupos para una reestructuración:
 *  - keep: cuotas que deben conservarse (pagadas, condonadas o con saldo pagado > 0).
 *  - pendingRemaining: saldo pendiente total y las cuotas actuales pendientes de reemplazar.
 */
export const splitInstallmentsForRestructure = (
  installments: Installment[],
): { keep: Installment[]; pendingRemaining: number; pendingCount: number } => {
  let keep: Installment[] = [];
  let pendingRemaining = 0;
  let pendingCount = 0;

  const ordered = [...installments].sort((a, b) => a.installmentNumber - b.installmentNumber);

  for (const i of ordered) {
    if (i.status === 'paid' || i.status === 'waived' || i.amountPaid > 0) {
      // Las cuotas pagadas, condonadas o con abono conservan su historial.
      keep.push(i);
    } else {
      pendingRemaining += i.amountDue - i.amountPaid;
      pendingCount++;
    }
  }

  return { keep, pendingRemaining, pendingCount };
};

export const generateSchedule = (
  principal: number,
  rate: number,
  count: number,
  frequency: LoanFrequency,
  firstDueDate: string
): ScheduleRow[] => {
  const total = totalDueFor(principal, rate);
  const each = Number((total / count).toFixed(2));
  const last = Number((total - each * (count - 1)).toFixed(2));
  const stepDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 15 : 30;

  const rows: ScheduleRow[] = [];
  let due = firstDueDate;
  for (let i = 1; i <= count; i++) {
    rows.push({ installmentNumber: i, dueDate: due, amountDue: i === count ? last : each });
    due = addDays(due, stepDays);
  }
  return rows;
};

export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

// --- Cálculos sobre colecciones ----------------------------------------------

export const loanOutstanding = (loanId: string, installments: Installment[]): number =>
  installments
    .filter(i => i.loanId === loanId && i.status !== 'paid' && i.status !== 'waived')
    .reduce((acc, i) => acc + (i.amountDue - i.amountPaid), 0);

export const nextInstallmentNumber = (installments: Installment[]): number => {
  if (installments.length === 0) return 1;
  const paid = installments.filter(i => i.status === 'paid' || i.status === 'waived').length;
  const nextPending = installments
    .filter(i => i.status !== 'paid' && i.status !== 'waived')
    .sort((a, b) => a.installmentNumber - b.installmentNumber)[0];
  return nextPending ? nextPending.installmentNumber : installments.length + 1;
};

export const daysOverdueFor = (installments: Installment[], today = todayISO()): number => {
  const overdue = installments.filter(
    i => i.dueDate < today && i.status !== 'paid' && i.status !== 'waived'
  );
  if (overdue.length === 0) return 0;
  return Math.max(...overdue.map(i => daysBetween(i.dueDate, today)));
};

export const computeRiskScore = (clientId: string, loans: Loan[], installments: Installment[]): number => {
  const clientLoans = loans.filter(l => l.clientId === clientId);
  if (clientLoans.length === 0) return 50;
  let score = 50;
  clientLoans.forEach(loan => {
    const li = installments.filter(i => i.loanId === loan.id);
    const hasOverdue = loan.status === 'overdue' || li.some(i => i.dueDate < todayISO() && i.status !== 'paid' && i.status !== 'waived');
    if (loan.status === 'paid') score += 15;
    if (hasOverdue) score -= 40;
  });
  // Abonos (cuotas parciales con pagos registrados) también mejoran el riesgo, tope +15.
  const partialCount = installments.filter(i => {
    const loan = clientLoans.find(l => l.id === i.loanId);
    return loan && i.amountPaid > 0 && i.amountPaid < i.amountDue;
  }).length;
  score += Math.min(15, partialCount * 5);
  return Math.min(100, Math.max(1, score));
};

export const agingBucket = (days: number): AgingBucket => {
  if (days <= 0) return 'current';
  if (days <= 30) return '1-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
};

export const bucketLabel: Record<string, string> = {
  current: 'Al día',
  '1-30': '1–30 días',
  '31-60': '31–60 días',
  '61-90': '61–90 días',
  '90+': '+90 días',
};

// --- Filas de reporte (aging / cola) ------------------------------------------

export const buildAgingRows = (
  loans: Loan[],
  clients: Client[],
  installments: Installment[],
  balances?: LoanBalance[]
): AgingRow[] => {
  return loans
    .filter(l => l.status !== 'cancelled')
    .map(l => {
      const client = clients.find(c => c.id === l.clientId);
      const li = installments.filter(i => i.loanId === l.id);
      const outstanding = balances
        ? balances.find(b => b.loanId === l.id)?.outstanding ?? loanOutstanding(l.id, installments)
        : loanOutstanding(l.id, installments);
      const days = daysOverdueFor(li);
      return {
        loanId: l.id,
        clientId: l.clientId,
        clientName: client?.name ?? '—',
        clientPhone: client?.phone ?? '',
        status: l.status,
        assignedTo: l.assignedTo,
        outstanding,
        bucket: agingBucket(days),
        nextDueDate: li.filter(i => i.status !== 'paid' && i.status !== 'waived')
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate ?? null,
        daysOverdue: days || null,
      };
    });
};

// --- Estadísticas del dashboard ------------------------------------------------

export const buildDashboardStats = (
  loans: Loan[],
  clients: Client[],
  installments: Installment[],
  payments: Payment[],
  activities: CollectionActivityLike[],
  settings: AppSettings
): DashboardStatsLike => {
  const totalPrincipal = loans.filter(l => l.status !== 'cancelled').reduce((acc, l) => acc + l.principal, 0);
  const totalCollected = payments.reduce((acc, p) => acc + p.amount, 0);
  const outstanding = loans
    .filter(l => l.status !== 'cancelled')
    .reduce((acc, l) => acc + loanOutstanding(l.id, installments), 0);
  const expectedInterest = loans.filter(l => l.status !== 'cancelled').reduce((acc, l) => acc + l.totalInterest, 0);
  const denom = totalPrincipal + expectedInterest;

  // Serie de cobranza por día (últimos 15 días con movimiento)
  const byDay = new Map<string, number>();
  payments.forEach(p => byDay.set(p.paymentDate, (byDay.get(p.paymentDate) ?? 0) + p.amount));
  const portfolioByDay = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-15)
    .map(([date, cobrado]) => ({ date, cobrado }));

  // Aging
  const rows = buildAgingRows(loans, clients, installments);
  const agingByBucket = ['1-30', '31-60', '61-90', '90+'].map(bucket => {
    const inBucket = rows.filter(r => r.bucket === bucket);
    return {
      bucket,
      monto: inBucket.reduce((acc, r) => acc + r.outstanding, 0),
      casos: inBucket.length,
    };
  });

  // Cola del día: vencidas + vencen hoy
  const dueToday = rows
    .filter(r => r.outstanding > 0 && (r.status === 'active' || r.status === 'overdue'))
    .filter(r => {
      const li = installments.filter(i => i.loanId === r.loanId);
      return li.some(i => i.status !== 'paid' && i.status !== 'waived' && i.dueDate <= todayISO());
    })
    .map(r => attachLastActivity(r, activities));

  // Compromisos vencidos: prometió y no pagó
  const brokenPromises = rows
    .filter(r => r.outstanding > 0 && (r.status === 'active' || r.status === 'overdue'))
    .filter(r => {
      const last = lastActivityFor(r.loanId, activities);
      return !!last?.promiseDate && last.promiseDate < todayISO() && last.result === 'contacted_promised';
    })
    .map(r => attachLastActivity(r, activities));

  return {
    totalPrincipal,
    totalCollected,
    outstanding,
    expectedInterest,
    recoveryRate: denom > 0 ? Number(((totalCollected / denom) * 100).toFixed(1)) : 0,
    activeLoansCount: loans.filter(l => l.status === 'active' || l.status === 'overdue').length,
    overdueLoansCount: rows.filter(r => r.bucket !== 'current').length,
    portfolioByDay,
    agingByBucket,
    dueToday,
    brokenPromises,
  };
};

// --- Gestiones ------------------------------------------------------------------

export interface CollectionActivityLike {
  id: string;
  loanId: string;
  clientId: string;
  type: string;
  result: ActivityResult;
  promiseDate?: string | null;
  notes?: string;
  activityDate: string;
  createdBy?: string | null;
}

export interface DashboardStatsLike {
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

export const lastActivityFor = (loanId: string, activities: CollectionActivityLike[]) =>
  activities
    .filter(a => a.loanId === loanId)
    .sort((a, b) => b.activityDate.localeCompare(a.activityDate))[0] ?? null;

export const attachLastActivity = (row: AgingRow, activities: CollectionActivityLike[]): QueueRow => {
  const last = lastActivityFor(row.loanId, activities);
  return {
    ...row,
    lastActivityDate: last?.activityDate ?? null,
    lastResult: last?.result ?? null,
    lastPromiseDate: last?.promiseDate ?? null,
  };
};

// --- Agenda de promesas de pago ------------------------------------------------

export interface PromiseRow {
  loanId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  assignedTo?: string | null;
  promiseDate: string;
  /** Días desde la promesa: >0 incumplida, 0 hoy, <0 futura. */
  daysLate: number;
  outstanding: number;
  status: 'overdue' | 'today' | 'upcoming';
  notes?: string | null;
}

/**
 * Promesas de pago vigentes: la última gestión del préstamo fue un compromiso
 * y todavía no se registró ningún pago desde esa fecha.
 */
export const buildPromiseAgenda = (
  loans: Loan[],
  clients: Client[],
  installments: Installment[],
  payments: Payment[],
  activities: CollectionActivityLike[],
  today = todayISO(),
): PromiseRow[] => {
  const rows: PromiseRow[] = [];

  loans
    .filter(loan => loan.status === 'active' || loan.status === 'overdue')
    .forEach(loan => {
      const last = lastActivityFor(loan.id, activities);
      if (!last?.promiseDate || last.result !== 'contacted_promised') return;
      const fulfilled = payments.some(p => p.loanId === loan.id && p.paymentDate >= last.promiseDate!);
      if (fulfilled) return;
      const outstanding = loanOutstanding(loan.id, installments);
      if (outstanding <= 0) return;
      const client = clients.find(c => c.id === loan.clientId);
      const daysLate = daysBetween(last.promiseDate, today);
      rows.push({
        loanId: loan.id,
        clientId: loan.clientId,
        clientName: client?.name ?? '—',
        clientPhone: client?.phone ?? '',
        assignedTo: loan.assignedTo,
        promiseDate: last.promiseDate,
        daysLate,
        outstanding,
        status: daysLate > 0 ? 'overdue' : daysLate === 0 ? 'today' : 'upcoming',
        notes: last.notes ?? null,
      });
    });

  return rows.sort((a, b) => b.daysLate - a.daysLate || a.clientName.localeCompare(b.clientName));
};

// --- Duplicados de clientes ------------------------------------------------

const normDocument = (value?: string | null) => (value ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();
const normPhone = (value?: string | null) => (value ?? '').replace(/\D/g, '').slice(-7);
const normEmail = (value?: string | null) => (value ?? '').trim().toLowerCase();

export interface DuplicatePair {
  a: Client;
  b: Client;
  reason: string;
}

/** Motivos por los que dos fichas parecen la misma persona. */
export const duplicateReason = (
  a: Pick<Client, 'document' | 'phone' | 'email'>,
  b: Pick<Client, 'document' | 'phone' | 'email'>,
): string | null => {
  if (normDocument(a.document) && normDocument(a.document) === normDocument(b.document)) return 'mismo documento';
  if (normPhone(a.phone) && normPhone(a.phone) === normPhone(b.phone)) return 'mismo teléfono';
  if (normEmail(a.email) && normEmail(a.email) === normEmail(b.email)) return 'mismo email';
  return null;
};

/** Pares de fichas activas que probablemente son la misma persona. */
export const findClientDuplicatePairs = (clients: Client[]): DuplicatePair[] => {
  const active = clients.filter(c => c.active);
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const reason = duplicateReason(active[i], active[j]);
      if (reason) pairs.push({ a: active[i], b: active[j], reason });
    }
  }
  return pairs;
};

/** ¿Ya existe una ficha con este documento? (bloquea el alta duplicada) */
export const findClientByDocument = (
  clients: Client[],
  document?: string | null,
  excludeId?: string,
): Client | undefined => {
  const target = normDocument(document);
  if (!target) return undefined;
  return clients.find(c => c.id !== excludeId && c.active && normDocument(c.document) === target);
};

// --- Evaluación de solicitudes ----------------------------------------------

export interface ApplicationScore {
  /** 0–100: más alto es mejor candidato. */
  score: number;
  recommendation: 'approve' | 'review' | 'reject';
  /** Motivos legibles, para justificar la decisión. */
  reasons: string[];
  currentOutstanding: number;
  daysWaiting: number;
}

/**
 * Recomendación explicable para una solicitud: cruza riesgo del cliente,
 * saldo vigente, mora y tamaño del crédito pedido frente a su historial.
 * No decide nada por sí sola: ordena la revisión y deja por escrito el porqué.
 */
export const scoreCreditApplication = (
  input: { requestedAmount: number; clientId?: string | null; createdAt?: string },
  clients: Client[],
  loans: Loan[],
  installments: Installment[],
  today = todayISO(),
): ApplicationScore => {
  const requested = Number(input.requestedAmount) || 0;
  const reasons: string[] = [];
  let score = 60;
  let currentOutstanding = 0;

  const client = input.clientId ? clients.find(c => c.id === input.clientId) : undefined;

  if (!client) {
    reasons.push('Sin ficha de cliente vinculada: no hay historial que consultar.');
  } else {
    const clientLoans = loans.filter(l => l.clientId === client.id && l.status !== 'cancelled');
    const activeLoans = clientLoans.filter(l => l.status === 'active' || l.status === 'overdue');
    const risk = computeRiskScore(client.id, loans, installments);
    score = Math.round(40 + risk * 0.5);
    reasons.push(`Riesgo actual del cliente: ${risk}/100.`);

    currentOutstanding = activeLoans.reduce((acc, l) => acc + loanOutstanding(l.id, installments), 0);

    const overdue = activeLoans.reduce((acc, l) => {
      return acc + installments
        .filter(i => i.loanId === l.id && i.dueDate < today && i.status !== 'paid' && i.status !== 'waived')
        .reduce((sum, i) => sum + (i.amountDue - i.amountPaid), 0);
    }, 0);

    if (overdue > 0) {
      score -= 30;
      reasons.push(`Tiene cuotas vencidas por ${overdue.toFixed(2)}: cobrar antes de prestar más.`);
    }

    if (currentOutstanding > 0) {
      reasons.push(`Saldo vigente con la financiera: ${currentOutstanding.toFixed(2)}.`);
    }

    const maxPrincipal = clientLoans.reduce((max, l) => Math.max(max, l.principal), 0);
    if (maxPrincipal > 0 && requested > maxPrincipal * 2) {
      score -= 15;
      reasons.push('Pide más del doble de su crédito más alto: revisa capacidad de pago.');
    }

    const overdueCount = clientLoans.filter(l => l.status === 'overdue').length;
    if (overdueCount > 0) {
      score -= 10;
      reasons.push(`${overdueCount} préstamo(s) marcados como vencidos.`);
    }
  }

  score = Math.max(1, Math.min(100, score));
  const recommendation: ApplicationScore['recommendation'] =
    score >= 70 ? 'approve' : score >= 45 ? 'review' : 'reject';

  const daysWaiting = input.createdAt ? Math.max(0, daysBetween(input.createdAt.slice(0, 10), today)) : 0;

  return { score, recommendation, reasons, currentOutstanding, daysWaiting };
};

// --- Resumen de cartera -----------------------------------------------------------

export const buildPortfolioSummary = (
  loans: Loan[], installments: Installment[], payments: Payment[], clients: Client[]
): PortfolioSummary => ({
  totalClients: clients.filter(c => c.active).length,
  activeLoans: loans.filter(l => l.status === 'active' || l.status === 'overdue').length,
  totalPrincipalLent: loans.filter(l => l.status !== 'cancelled').reduce((a, l) => a + l.principal, 0),
  totalOutstanding: loans.filter(l => l.status !== 'cancelled').reduce((a, l) => a + loanOutstanding(l.id, installments), 0),
  totalCollected: payments.reduce((a, p) => a + p.amount, 0),
});
