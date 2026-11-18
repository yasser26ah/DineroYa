// ============================================================================
// DineroYa — Caja y tesorería: apertura, recaudo de la sesión y arqueo
// ============================================================================
import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LockKeyhole, Wallet } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Btn, Card, EmptyState, Field, MoneyInput, PageHeader, StatusBadge, inputCls } from '../components/ui';
import { fmtDate, fmtDateTime, fmtMoney } from '../lib/format';
import { paymentMethodLabel } from '../types';

export const CashPage: React.FC = () => {
  const { cashSessions, payments, profiles, settings, paymentMethods, openCashSession, closeCashSession } = useData();
  const cur = settings.currency;

  const [opening, setOpening] = useState('');
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<string | null>(null);

  const openSession = cashSessions.find(s => s.status === 'open');

  const sessionPayments = useMemo(
    () => (openSession
      ? payments
        .filter(p => p.createdAt >= openSession.openedAt && !p.notes?.includes('ANULADO'))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : []),
    [payments, openSession],
  );

  const collected = sessionPayments.reduce((a, p) => a + p.amount, 0);
  const expected = openSession ? openSession.openingAmount + collected : 0;

  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    sessionPayments.forEach(p => map.set(p.method, (map.get(p.method) ?? 0) + p.amount));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [sessionPayments]);

  const openCash = async () => {
    setBusy(true);
    setError(null);
    setClosed(null);
    try {
      await openCashSession(Number(opening) || 0);
      setOpening('');
    } catch (err: any) {
      setError(err.message ?? 'No se pudo abrir la caja');
    } finally {
      setBusy(false);
    }
  };

  const closeCash = async () => {
    if (!openSession) return;
    if (counted === '') { setError('Ingresa el monto contado en caja'); return; }
    setBusy(true);
    setError(null);
    try {
      const session = await closeCashSession(openSession.id, Number(counted), notes.trim() || undefined);
      const diff = session.difference ?? 0;
      setClosed(diff === 0
        ? 'Caja cerrada sin diferencias. ✔'
        : `Caja cerrada con ${diff > 0 ? 'sobrante' : 'faltante'} de ${fmtMoney(Math.abs(diff), cur)}.`);
      setCounted('');
      setNotes('');
    } catch (err: any) {
      setError(err.message ?? 'No se pudo cerrar la caja');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Caja y tesorería" subtitle="Abre la caja del día y cierra con arqueo contra lo recaudado" />

      {(error || closed) && (
        <div className={`p-4 rounded-2xl text-sm font-bold flex items-start gap-2 ${error ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {error ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />}
          {error ?? closed}
        </div>
      )}

      {!openSession ? (
        <Card className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><Wallet className="w-6 h-6" /></div>
            <div>
              <h3 className="text-lg font-black text-slate-900">Abrir caja</h3>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Fondo inicial con el que arrancas el día</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
            <Field label={`Fondo inicial (${cur})`}>
              <MoneyInput value={opening} onChange={setOpening} placeholder="0" />
            </Field>
            <Btn onClick={openCash} disabled={busy} className="md:col-span-2">{busy ? 'Abriendo...' : 'Abrir caja'}</Btn>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <StatusBadge label="Caja abierta" className="bg-emerald-100 text-emerald-700" />
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    desde {fmtDateTime(openSession.openedAt)}
                  </p>
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3">Fondo inicial</p>
                <p className="text-xl font-black text-slate-900">{fmtMoney(openSession.openingAmount, cur)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recaudado en la sesión</p>
                <p className="text-2xl font-black text-emerald-600">{fmtMoney(collected, cur)}</p>
                <p className="text-[11px] font-bold text-slate-400">{sessionPayments.length} recaudo(s)</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Esperado en caja</p>
                <p className="text-2xl font-black text-indigo-600">{fmtMoney(expected, cur)}</p>
              </div>
            </div>

            {byMethod.length > 0 && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {byMethod.map(([method, amount]) => (
                  <div key={method} className="bg-slate-50 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{paymentMethodLabel(method, paymentMethods)}</p>
                    <p className="font-black text-slate-800">{fmtMoney(amount, cur)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><LockKeyhole className="w-6 h-6" /></div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Cerrar caja (arqueo)</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Cuenta el dinero físico y compáralo con lo esperado</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <Field label={`Monto contado (${cur})`}>
                <MoneyInput value={counted} onChange={setCounted} placeholder={String(expected)} />
              </Field>
              <Field label="Notas del cierre">
                <input value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} placeholder="Opcional" />
              </Field>
              <div className="flex items-end">
                <Btn onClick={closeCash} disabled={busy} className="w-full">{busy ? 'Cerrando...' : 'Cerrar caja'}</Btn>
              </div>
            </div>
            {counted !== '' && (
              <p className="text-sm font-bold mt-4 text-slate-600">
                Diferencia estimada:{' '}
                <span className={Number(counted) - expected === 0 ? 'text-emerald-600' : 'text-rose-600'}>
                  {fmtMoney(Number(counted) - expected, cur)}
                </span>
              </p>
            )}
          </Card>

          <Card className="p-6 lg:p-8">
            <h3 className="font-black text-slate-900 mb-4">Movimientos de la sesión</h3>
            {sessionPayments.length === 0 ? (
              <p className="text-sm font-bold text-slate-400">Aún no hay recaudos desde que abriste la caja.</p>
            ) : (
              <div className="flex flex-col divide-y divide-slate-100">
                {sessionPayments.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{paymentMethodLabel(p.method, paymentMethods)}</p>
                      <p className="text-[11px] font-bold text-slate-400">{fmtDateTime(p.createdAt)}</p>
                    </div>
                    <p className="font-black text-emerald-600 shrink-0">{fmtMoney(p.amount, cur)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      <div>
        <h3 className="font-black text-slate-900 mb-4">Historial de cierres</h3>
        {cashSessions.filter(s => s.status === 'closed').length === 0 ? (
          <EmptyState icon={Wallet} title="Sin cierres todavía" hint="Cuando cierres la primera caja aparecerá aquí el arqueo." />
        ) : (
          <Card className="p-2 lg:p-4 overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-left">
                  <th className="px-4 py-3">Apertura</th>
                  <th className="px-4 py-3">Cierre</th>
                  <th className="px-4 py-3 text-right">Fondo</th>
                  <th className="px-4 py-3 text-right">Esperado</th>
                  <th className="px-4 py-3 text-right">Contado</th>
                  <th className="px-4 py-3 text-right">Diferencia</th>
                  <th className="px-4 py-3">Notas</th>
                </tr>
              </thead>
              <tbody>
                {cashSessions.filter(s => s.status === 'closed').map(s => {
                  const diff = s.difference ?? 0;
                  return (
                    <tr key={s.id} className="border-t border-slate-100 text-sm font-bold text-slate-700">
                      <td className="px-4 py-3 whitespace-nowrap">{fmtDateTime(s.openedAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{s.closedAt ? fmtDateTime(s.closedAt) : '—'}</td>
                      <td className="px-4 py-3 text-right">{fmtMoney(s.openingAmount, cur)}</td>
                      <td className="px-4 py-3 text-right">{fmtMoney(s.expectedAmount ?? 0, cur)}</td>
                      <td className="px-4 py-3 text-right">{fmtMoney(s.countedAmount ?? 0, cur)}</td>
                      <td className={`px-4 py-3 text-right ${diff === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtMoney(diff, cur)}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-400 max-w-[200px] truncate">{s.notes ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  );
};
