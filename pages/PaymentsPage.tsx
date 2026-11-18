// ============================================================================
// DineroYa — Recaudos: día por método y cobrador + historial de recaudos
// ============================================================================
import React, { useMemo, useState } from 'react';
import { Banknote, CalendarDays, Receipt, Users } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Card, EmptyState, Field, PageHeader, SearchBar, inputCls } from '../components/ui';
import { fmtDate, fmtMoney, todayISO } from '../lib/format';
import { paymentMethodLabel } from '../types';
import { Payment } from '../types';

const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/** Totales agrupados (monto y cantidad) para una lista de pagos. */
const groupTotals = (rows: Payment[], keyOf: (p: Payment) => string) => {
  const map = new Map<string, { key: string; count: number; amount: number }>();
  rows.forEach(p => {
    const key = keyOf(p);
    const acc = map.get(key) ?? { key, count: 0, amount: 0 };
    acc.count += 1;
    acc.amount += p.amount;
    map.set(key, acc);
  });
  return [...map.values()].sort((a, b) => b.amount - a.amount);
};

const SummaryRow: React.FC<{ label: string; count: number; amount: number; currency: string }> = ({ label, count, amount, currency }) => (
  <div className="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
    <p className="font-bold text-slate-700 text-sm truncate">{label}</p>
    <div className="flex items-center gap-6 shrink-0">
      <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{count} recaudo(s)</span>
      <span className="font-black text-slate-900 text-sm">{fmtMoney(amount, currency)}</span>
    </div>
  </div>
);

export const PaymentsPage: React.FC = () => {
  const { payments, clients, profiles, settings, paymentMethods } = useData();
  const cur = settings.currency;

  const [day, setDay] = useState(todayISO());
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayISO());
  const [methodFilter, setMethodFilter] = useState('');
  const [collectorFilter, setCollectorFilter] = useState('');
  const [q, setQ] = useState('');

  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? '—';
  const collectorName = (id?: string | null) => (id ? profiles.find(p => p.id === id)?.fullName ?? '—' : 'Sin cobrador');
  const isVoided = (p: Payment) => !!p.notes?.includes('ANULADO');

  // Los pagos anulados no suman al recaudo, pero sí quedan en el historial.
  const live = payments.filter(p => !isVoided(p));

  const dayPayments = live.filter(p => p.paymentDate === day);
  const dayTotal = dayPayments.reduce((a, p) => a + p.amount, 0);
  const byMethod = groupTotals(dayPayments, p => p.method);
  const byCollector = groupTotals(dayPayments, p => p.receivedBy ?? '');

  const history = useMemo(() => {
    const term = q.trim().toLowerCase();
    return payments
      .filter(p => (!from || p.paymentDate >= from) && (!to || p.paymentDate <= to))
      .filter(p => !methodFilter || p.method === methodFilter)
      .filter(p => !collectorFilter || (p.receivedBy ?? '') === collectorFilter)
      .filter(p => !term
        || clientName(p.clientId).toLowerCase().includes(term)
        || (p.notes ?? '').toLowerCase().includes(term))
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.createdAt.localeCompare(a.createdAt));
  }, [payments, from, to, methodFilter, collectorFilter, q, clients]);

  const historyTotal = history.filter(p => !isVoided(p)).reduce((a, p) => a + p.amount, 0);
  const collectors = profiles.filter(p => p.role !== 'cliente');

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Recaudos" subtitle="Cobros del día por método y por cobrador, e historial completo" />

      <Card className="p-6 lg:p-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <Field label="Día a revisar">
            <input type="date" value={day} onChange={e => setDay(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex flex-wrap gap-6 md:gap-10">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recaudado</p>
              <p className="text-2xl font-black text-slate-900">{fmtMoney(dayTotal, cur)}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recaudos</p>
              <p className="text-2xl font-black text-slate-900">{dayPayments.length}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Promedio</p>
              <p className="text-2xl font-black text-slate-900">
                {fmtMoney(dayPayments.length ? dayTotal / dayPayments.length : 0, cur)}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {dayPayments.length === 0 ? (
        <EmptyState icon={Receipt} title="Sin recaudos ese día" hint="Elige otra fecha o registra un pago desde Préstamos o Cobranza." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl"><Banknote className="w-5 h-5" /></div>
              <h3 className="font-black text-slate-900">Por método de pago</h3>
            </div>
            {byMethod.map(row => (
              <SummaryRow
                key={row.key}
                label={paymentMethodLabel(row.key, paymentMethods)}
                count={row.count}
                amount={row.amount}
                currency={cur}
              />
            ))}
          </Card>

          <Card className="p-6 lg:p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Users className="w-5 h-5" /></div>
              <h3 className="font-black text-slate-900">Por cobrador</h3>
            </div>
            {byCollector.map(row => (
              <SummaryRow
                key={row.key || 'sin-cobrador'}
                label={collectorName(row.key || null)}
                count={row.count}
                amount={row.amount}
                currency={cur}
              />
            ))}
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-slate-100 text-slate-600 rounded-xl"><CalendarDays className="w-5 h-5" /></div>
          <div>
            <h3 className="font-black text-slate-900">Historial de recaudos</h3>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {history.length} movimiento(s) · {fmtMoney(historyTotal, cur)} recaudado
            </p>
          </div>
        </div>

        <Card className="p-5 flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Field label="Desde">
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Hasta">
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Método">
              <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className={inputCls}>
                <option value="">Todos</option>
                {paymentMethods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>
            <Field label="Cobrador">
              <select value={collectorFilter} onChange={e => setCollectorFilter(e.target.value)} className={inputCls}>
                <option value="">Todos</option>
                {collectors.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
              </select>
            </Field>
          </div>
          <SearchBar value={q} onChange={setQ} placeholder="Buscar por cliente o nota del pago..." />
        </Card>

        <Card className="p-2 lg:p-4 overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Cobrador</th>
                <th className="px-4 py-3 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {history.map(p => {
                const voided = isVoided(p);
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 text-xs font-bold text-slate-500 whitespace-nowrap">{fmtDate(p.paymentDate)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-800">
                      {clientName(p.clientId)}
                      {p.notes && !voided && (
                        <span className="block text-[11px] font-medium text-slate-400 truncate max-w-[220px]">{p.notes}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-500 whitespace-nowrap">
                      {paymentMethodLabel(p.method, paymentMethods)}
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-500 whitespace-nowrap">{collectorName(p.receivedBy)}</td>
                    <td className={`px-4 py-3 text-right font-black whitespace-nowrap ${voided ? 'text-slate-400 line-through' : 'text-emerald-600'}`}>
                      {fmtMoney(p.amount, cur)}
                      {voided && (
                        <span className="ml-2 text-[9px] font-black uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-500 no-underline">
                          Anulado
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm font-bold text-slate-400">
                    No hay recaudos con esos filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
};
