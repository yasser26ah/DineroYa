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
  companyName: 'FinanzaPro',
};

// --- Fórmulas ---------------------------------------------------------------

export const totalDueFor = (principal: number, rate: number): number =>
  Number((principal * (1 + rate / 100)).toFixed(2));

export const riskSuggestedRate = (clientRisk: number, baseRate: number): number => {
  if (clientRisk > 80) return Math.max(0, baseRate - 5);
  if (clientRisk >= 40) return baseRate;
  return baseRate + 10;
};

// --- Calendario de cuotas -----------------------------------------------------

export interface ScheduleRow {
  installmentNumber: number;
  dueDate: string;
  amountDue: number;
}

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
