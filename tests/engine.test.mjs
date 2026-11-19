// Pruebas del motor de dinero: interés, calendario, saldos, mora, riesgo y
// envejecimiento. Es la lógica donde un error cuesta plata real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  totalDueFor,
  riskSuggestedRate,
  clientMoraAmount,
  generateSchedule,
  addDays,
  loanOutstanding,
  daysOverdueFor,
  computeRiskScore,
  agingBucket,
  restructureSchedule,
  splitInstallmentsForRestructure,
} from '../.local/test-build/modules.mjs';

const loan = (overrides = {}) => ({
  id: 'l1', clientId: 'c1', principal: 1000, interestRate: 10,
  totalInterest: 100, totalDue: 1100, installmentsCount: 1,
  frequency: 'monthly', firstDueDate: '2026-01-01', status: 'active',
  ...overrides,
});

const installment = (overrides = {}) => ({
  id: 'i1', loanId: 'l1', installmentNumber: 1, dueDate: '2026-01-01',
  amountDue: 1000, amountPaid: 0, status: 'pending',
  ...overrides,
});

// --- Interés ---------------------------------------------------------------

test('el total a pagar aplica el interés plano sobre el capital', () => {
  assert.equal(totalDueFor(1_000_000, 15), 1_150_000);
  assert.equal(totalDueFor(1000, 0), 1000);
  assert.equal(totalDueFor(1000, 7.5), 1075);
});

test('la tasa sugerida premia el buen riesgo y encarece el malo', () => {
  assert.equal(riskSuggestedRate(90, 20), 15);
  assert.equal(riskSuggestedRate(60, 20), 20);
  assert.equal(riskSuggestedRate(20, 20), 30);
});

// --- Calendario ------------------------------------------------------------

test('el calendario reparte el total y ajusta los centavos de la última cuota', () => {
  const rows = generateSchedule(1000, 10, 7, 'monthly', '2026-01-10');
  assert.equal(rows.length, 7);
  const sum = rows.reduce((acc, row) => acc + row.amountDue, 0);
  assert.equal(Number(sum.toFixed(2)), 1100);
  assert.equal(rows[0].amountDue, 157.14);
  assert.equal(rows[rows.length - 1].amountDue, 157.16);
  assert.equal(rows[0].installmentNumber, 1);
  assert.equal(rows[rows.length - 1].installmentNumber, 7);
});

test('la frecuencia define el paso entre cuotas', () => {
  const weekly = generateSchedule(700, 0, 3, 'weekly', '2026-01-05');
  assert.deepEqual(weekly.map(r => r.dueDate), ['2026-01-05', '2026-01-12', '2026-01-19']);

  const biweekly = generateSchedule(700, 0, 3, 'biweekly', '2026-01-05');
  assert.deepEqual(biweekly.map(r => r.dueDate), ['2026-01-05', '2026-01-20', '2026-02-04']);
});

test('addDays cruza meses y años sin desfase de zona horaria', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('la reestructuración conserva la numeración y no pierde centavos', () => {
  const rows = restructureSchedule(1000, 3, 'weekly', '2026-02-01', 5);
  assert.deepEqual(rows.map(r => r.installmentNumber), [5, 6, 7]);
  assert.deepEqual(rows.map(r => r.amountDue), [333.33, 333.33, 333.34]);
  assert.deepEqual(rows.map(r => r.dueDate), ['2026-02-01', '2026-02-08', '2026-02-15']);
});

test('la reestructuración rechaza saldo cero y cuotas inválidas', () => {
  assert.throws(() => restructureSchedule(0, 3, 'monthly', '2026-02-01'));
  assert.throws(() => restructureSchedule(1000, 0, 'monthly', '2026-02-01'));
});

// --- Saldos ----------------------------------------------------------------

test('el saldo pendiente ignora cuotas pagadas y condonadas', () => {
  const installments = [
    installment({ id: 'a', amountDue: 500, amountPaid: 500, status: 'paid' }),
    installment({ id: 'b', amountDue: 500, amountPaid: 200, status: 'partial' }),
    installment({ id: 'c', amountDue: 300, amountPaid: 0, status: 'waived' }),
  ];
  assert.equal(loanOutstanding('l1', installments), 300);
});

test('los días de mora se cuentan desde la cuota vencida más antigua', () => {
  const installments = [
    installment({ id: 'a', dueDate: '2026-01-01', status: 'pending' }),
    installment({ id: 'b', dueDate: '2026-01-05', status: 'pending' }),
  ];
  assert.equal(daysOverdueFor(installments, '2026-01-11'), 10);
  assert.equal(daysOverdueFor(installments, '2025-12-31'), 0);
});

test('la mora es proporcional a los días vencidos sobre el saldo', () => {
  const installments = [installment({ dueDate: '2026-01-01', amountDue: 1000, amountPaid: 0 })];
  // 5% mensual sobre 1.000 durante 30 días = 50
  assert.equal(clientMoraAmount('c1', [loan()], installments, 5, '2026-01-31'), 50);
  // 5% sobre 1.000 durante 15 días = 25
  assert.equal(clientMoraAmount('c1', [loan()], installments, 5, '2026-01-16'), 25);
});

test('sin tasa de mora no se cobra mora', () => {
  const installments = [installment({ dueDate: '2026-01-01' })];
  assert.equal(clientMoraAmount('c1', [loan()], installments, 0, '2026-06-01'), 0);
});

test('la mora no se cobra sobre cuotas pagadas ni préstamos cancelados', () => {
  const paid = [installment({ dueDate: '2026-01-01', amountDue: 1000, amountPaid: 1000, status: 'paid' })];
  assert.equal(clientMoraAmount('c1', [loan()], paid, 5, '2026-06-01'), 0);
  const cancelled = [installment({ dueDate: '2026-01-01' })];
  assert.equal(clientMoraAmount('c1', [loan({ status: 'cancelled' })], cancelled, 5, '2026-06-01'), 0);
});

test('la mora no se mezcla entre clientes', () => {
  const installments = [installment({ dueDate: '2026-01-01' })];
  assert.equal(clientMoraAmount('c2', [loan()], installments, 5, '2026-01-31'), 0);
});

// --- Riesgo y envejecimiento ----------------------------------------------

test('el riesgo sube al pagar y baja con la mora, siempre entre 1 y 100', () => {
  assert.equal(computeRiskScore('c1', [], []), 50);
  const paidLoan = loan({ status: 'paid' });
  const paidInstallments = [installment({ status: 'paid', amountPaid: 1000 })];
  assert.equal(computeRiskScore('c1', [paidLoan], paidInstallments), 65);

  const overdue = loan({ status: 'overdue', firstDueDate: '2020-01-01' });
  const overdueInstallments = [installment({ dueDate: '2020-01-01', status: 'pending' })];
  assert.equal(computeRiskScore('c1', [overdue], overdueInstallments), 10);
});

test('las cuotas parciales mejoran el riesgo con tope de 15 puntos', () => {
  const installments = [1, 2, 3, 4, 5].map(n =>
    installment({ id: `p${n}`, dueDate: '2099-01-01', amountDue: 1000, amountPaid: 500, status: 'partial' }));
  assert.equal(computeRiskScore('c1', [loan()], installments), 65);
});

test('el envejecimiento clasifica los tramos correctamente', () => {
  assert.equal(agingBucket(0), 'current');
  assert.equal(agingBucket(-3), 'current');
  assert.equal(agingBucket(1), '1-30');
  assert.equal(agingBucket(30), '1-30');
  assert.equal(agingBucket(31), '31-60');
  assert.equal(agingBucket(61), '61-90');
  assert.equal(agingBucket(91), '90+');
});

test('la separación para reestructurar conserva abonos y suma solo lo pendiente', () => {
  const installments = [
    installment({ id: 'a', installmentNumber: 1, status: 'paid', amountPaid: 1000 }),
    installment({ id: 'b', installmentNumber: 2, status: 'partial', amountDue: 1000, amountPaid: 400 }),
    installment({ id: 'c', installmentNumber: 3, status: 'pending', amountDue: 1000 }),
    installment({ id: 'd', installmentNumber: 4, status: 'pending', amountDue: 500 }),
  ];
  const { keep, pendingRemaining, pendingCount } = splitInstallmentsForRestructure(installments);
  assert.deepEqual(keep.map(i => i.id), ['a', 'b']);
  assert.equal(pendingCount, 2);
  assert.equal(pendingRemaining, 1500);
});
