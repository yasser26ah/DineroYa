// ============================================================================
// DineroYa — Portal del cliente: mis préstamos, cuotas y solicitudes de crédito
// ============================================================================
import React, { useMemo, useState } from 'react';
import {
  Wallet, CalendarClock, CircleDollarSign, FileText, Plus, CheckCircle2, AlertTriangle, Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import {
  Btn, Card, EmptyState, Field, MetricCard, Modal, PageHeader, StatusBadge,
  inputCls, installmentStatusStyle, loanStatusStyle,
} from '../components/ui';
import { fmtDate, fmtMoney, todayISO } from '../lib/format';
import { loanOutstanding } from '../lib/engine';
import {
  CREDIT_APPLICATION_STATUS_LABELS, FREQUENCY_LABELS, INSTALLMENT_STATUS_LABELS, LOAN_STATUS_LABELS,
  PAYMENT_CHANNEL_KIND_LABELS,
} from '../types';

const appStatusStyle = (s: string) =>
  s === 'approved' ? 'bg-emerald-100 text-emerald-700'
    : s === 'rejected' ? 'bg-rose-100 text-rose-700'
      : s === 'cancelled' ? 'bg-slate-200 text-slate-500'
        : 'bg-amber-100 text-amber-700';

export const ClientPortalPage: React.FC = () => {
  const { user } = useAuth();
  const { clients, loans, installments, applications, settings, paymentChannels, createApplication } = useData();
  const [showRequest, setShowRequest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const me = useMemo(() => {
    if (!user) return undefined;
    if (user.clientId) return clients.find(c => c.id === user.clientId);
    return clients.find(c => c.email && c.email.toLowerCase() === user.email.toLowerCase());
  }, [clients, user]);

  const myLoans = useMemo(
    () => (me ? loans.filter(l => l.clientId === me.id) : []),
    [loans, me],
  );
  const myLoanIds = useMemo(() => new Set(myLoans.map(l => l.id)), [myLoans]);
  const myInstallments = useMemo(
    () => installments.filter(i => myLoanIds.has(i.loanId)),
    [installments, myLoanIds],
  );
  const myApplications = useMemo(
    () => applications.filter(a =>
      (me && a.clientId === me.id) ||
      (user?.email && a.email && a.email.toLowerCase() === user.email.toLowerCase())),
    [applications, me, user],
  );

  // Tope del portal: 3 solicitudes por día (el servidor lo valida igualmente).
  const DAILY_LIMIT = 3;
  const todayCount = useMemo(
    () => myApplications.filter(a =>
      a.status !== 'cancelled' &&
      new Date(a.createdAt).toDateString() === new Date().toDateString(),
    ).length,
    [myApplications],
  );
  const limitReached = todayCount >= DAILY_LIMIT;

  const outstanding = myLoans
    .filter(l => l.status !== 'cancelled' && l.status !== 'paid')
    .reduce((acc, l) => acc + loanOutstanding(l.id, installments), 0);

  const pendingInstallments = myInstallments.filter(i => i.status !== 'paid' && i.status !== 'waived');
  const nextDue = [...pendingInstallments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const overdue = pendingInstallments.filter(i => i.dueDate < todayISO());
  const overdueAmount = overdue.reduce((a, i) => a + (i.amountDue - i.amountPaid), 0);
  const cur = settings.currency;

  const submitRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const amount = Number(fd.get('amount'));
    if (!amount || amount <= 0) { setError('Ingresa un monto válido.'); return; }
    setBusy(true);
    setError(null);
    try {
      await createApplication({
        requestedAmount: amount,
        purpose: String(fd.get('purpose') ?? '').trim(),
        notes: String(fd.get('notes') ?? '').trim(),
        clientId: me?.id ?? null,
        applicantName: me?.name ?? user?.fullName ?? 'Cliente',
        document: me?.document,
        phone: me?.phone,
        email: me?.email ?? user?.email,
        address: me?.address,
      });
      setShowRequest(false);
      setSuccess('Tu solicitud fue enviada. La revisaremos y te contactaremos con la respuesta.');
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo enviar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Hola, ${user?.fullName?.split(' ')[0] ?? 'cliente'}`}
        subtitle="Consulta tus préstamos, tus cuotas y solicita un nuevo crédito."
        actions={
          <Btn
            onClick={() => { setShowRequest(true); setSuccess(null); setError(null); }}
            disabled={limitReached}
            className="flex items-center gap-2"
            title={limitReached ? 'Ya enviaste 3 solicitudes hoy' : undefined}
          >
            <Plus className="w-4 h-4" /> Solicitar crédito
          </Btn>
        }
      />

      {success && (
        <div className="mb-6 bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-2xl flex items-start gap-2">
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-bold">{success}</p>
        </div>
      )}

      {limitReached && (
        <div className="mb-6 bg-amber-50 border border-amber-100 text-amber-700 p-4 rounded-2xl flex items-start gap-2">
          <Clock className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm font-bold">
            Ya enviaste {DAILY_LIMIT} solicitudes hoy. Podrás enviar otra mañana.
          </p>
        </div>
      )}

      {!me && (
        <div className="mb-6 bg-amber-50 border border-amber-100 text-amber-700 p-4 rounded-2xl flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold">Tu usuario aún no está vinculado a una ficha de cliente.</p>
            <p className="text-xs font-medium mt-1">
              Puedes enviar una solicitud de todos modos. Si ya eres cliente, pide a la oficina que vincule tu cuenta
              con tu número de documento.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Saldo pendiente" value={fmtMoney(outstanding, cur)} icon={Wallet} />
        <MetricCard
          label="Próxima cuota"
          value={nextDue ? fmtMoney(nextDue.amountDue - nextDue.amountPaid, cur) : '—'}
          subValue={nextDue ? fmtDate(nextDue.dueDate) : 'Sin cuotas pendientes'}
          icon={CalendarClock}
        />
        <MetricCard
          label="En mora"
          value={fmtMoney(overdueAmount, cur)}
          subValue={`${overdue.length} cuota(s) vencida(s)`}
          icon={CircleDollarSign}
          alert={overdue.length > 0}
        />
        <MetricCard label="Solicitudes" value={myApplications.length} icon={FileText} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-black text-slate-900 mb-4">Mis préstamos</h3>
          {myLoans.length === 0 ? (
            <EmptyState icon={Wallet} title="Aún no tienes préstamos" hint="Cuando se apruebe un crédito aparecerá aquí." />
          ) : (
            <div className="flex flex-col gap-3">
              {myLoans.map(loan => {
                const loanInst = myInstallments
                  .filter(i => i.loanId === loan.id)
                  .sort((a, b) => a.installmentNumber - b.installmentNumber);
                return (
                  <div key={loan.id} className="border border-slate-100 rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-black text-slate-900">{fmtMoney(loan.principal, cur)}</p>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                          {loan.installmentsCount} cuotas {FREQUENCY_LABELS[loan.frequency].toLowerCase()}
                        </p>
                      </div>
                      <StatusBadge label={LOAN_STATUS_LABELS[loan.status]} className={loanStatusStyle(loan.status)} />
                    </div>
                    <div className="flex justify-between text-xs font-bold text-slate-500 mb-3">
                      <span>Total: {fmtMoney(loan.totalDue, cur)}</span>
                      <span>Saldo: {fmtMoney(loanOutstanding(loan.id, installments), cur)}</span>
                    </div>
                    <div className="max-h-44 overflow-y-auto divide-y divide-slate-50">
                      {loanInst.map(i => (
                        <div key={i.id} className="flex items-center justify-between py-2 text-xs">
                          <span className="font-bold text-slate-500">
                            Cuota {i.installmentNumber} · {fmtDate(i.dueDate)}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="font-black text-slate-700">{fmtMoney(i.amountDue, cur)}</span>
                            <StatusBadge label={INSTALLMENT_STATUS_LABELS[i.status]} className={installmentStatusStyle(i.status)} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-black text-slate-900 mb-4">Mis solicitudes</h3>
          {myApplications.length === 0 ? (
            <EmptyState icon={FileText} title="No has enviado solicitudes" hint="Usa el botón «Solicitar crédito» para empezar." />
          ) : (
            <div className="flex flex-col gap-3">
              {myApplications.map(a => (
                <div key={a.id} className="border border-slate-100 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-900">{fmtMoney(a.requestedAmount, cur)}</p>
                      {a.status === 'approved' && a.approvedAmount && (
                        <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest mt-0.5">
                          Aprobado por {fmtMoney(a.approvedAmount, cur)}
                        </p>
                      )}
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                        Enviada el {fmtDate(a.createdAt.slice(0, 10))}
                      </p>
                    </div>
                    <StatusBadge label={CREDIT_APPLICATION_STATUS_LABELS[a.status]} className={appStatusStyle(a.status)} />
                  </div>
                  {a.purpose && <p className="text-xs font-medium text-slate-500 mt-2">Destino: {a.purpose}</p>}
                  {a.reviewNotes && (
                    <p className="text-xs font-medium text-slate-500 mt-2 bg-slate-50 rounded-xl p-3">
                      Respuesta: {a.reviewNotes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {paymentChannels.filter(c => c.active).length > 0 && (
        <Card className="p-6 mt-6">
          <h3 className="text-lg font-black text-slate-900 mb-1">Canales de pago</h3>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Dónde puedes pagar tu cuota</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {paymentChannels.filter(c => c.active).map(c => (
              <div key={c.id} className="border border-slate-100 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-black text-slate-900">{c.name}</p>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 shrink-0">
                    {PAYMENT_CHANNEL_KIND_LABELS[c.kind]}
                  </span>
                </div>
                {c.accountInfo && <p className="text-xs font-bold text-slate-600 mt-2">{c.accountInfo}</p>}
                {c.instructions && <p className="text-xs font-medium text-slate-500 mt-1">{c.instructions}</p>}
                {c.link && (
                  <a href={c.link} target="_blank" rel="noreferrer" className="text-[11px] font-black text-indigo-600 uppercase tracking-widest mt-2 inline-block">
                    Pagar en línea
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6 mt-6">
        <h3 className="text-lg font-black text-slate-900 mb-2">Mis datos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre</p><p className="font-bold text-slate-700">{me?.name ?? user?.fullName}</p></div>
          <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Documento</p><p className="font-bold text-slate-700">{me?.document ?? '—'}</p></div>
          <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Teléfono</p><p className="font-bold text-slate-700">{me?.phone ?? '—'}</p></div>
          <div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</p><p className="font-bold text-slate-700">{me?.email ?? user?.email}</p></div>
        </div>
        <p className="text-[11px] text-slate-400 font-medium mt-4">
          Para corregir tus datos, comunícate con la oficina. Por seguridad no puedes editarlos desde el portal.
        </p>
      </Card>

      {showRequest && (
        <Modal title="Solicitar crédito" subtitle="CUÉNTANOS CUÁNTO NECESITAS" onClose={() => setShowRequest(false)}>
          <form onSubmit={submitRequest} className="flex flex-col gap-5">
            <Field label="Monto solicitado">
              <input name="amount" type="number" min="1" step="0.01" required className={inputCls} placeholder="Ej: 500000" />
            </Field>
            <Field label="Destino del crédito">
              <input name="purpose" className={inputCls} placeholder="Ej: capital de trabajo, compra de inventario..." />
            </Field>
            <Field label="Notas adicionales (opcional)">
              <textarea name="notes" rows={3} className={inputCls} placeholder="Cuéntanos algo que debamos saber." />
            </Field>
            {error && (
              <div className="bg-rose-50 text-rose-600 text-sm font-bold p-4 rounded-2xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}
            <div className="bg-slate-50 rounded-2xl p-4 flex items-start gap-2">
              <Clock className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-[11px] font-medium text-slate-500">
                Revisaremos tu solicitud y te contactaremos. Enviarla no garantiza la aprobación ni el monto final.
                <br />
                <strong>Solicitudes hoy: {todayCount} de {DAILY_LIMIT}.</strong> Máximo 3 por día y solo una por monto
                mientras la anterior siga pendiente. Las repetidas se rechazan automáticamente.
              </p>
            </div>
            <div className="flex gap-3">
              <Btn variant="secondary" onClick={() => setShowRequest(false)} className="flex-1">Cancelar</Btn>
              <Btn type="submit" disabled={busy} className="flex-1">Enviar solicitud</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
