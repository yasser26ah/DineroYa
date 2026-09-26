// ============================================================================
// DineroYa — Préstamos: lista y ficha de detalle con seguimiento completo
// ============================================================================
import React, { useMemo, useState } from 'react';
import {
  Plus, Wallet, CalendarDays, Banknote, HandCoins, XCircle, UserCog, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import {
  Card, PageHeader, EmptyState, Btn, StatusBadge, RiskBadge, SearchBar, loanStatusStyle, installmentStatusStyle, Field, inputCls, Modal,
} from '../components/ui';
import { PaymentModal, ActivityModal, VoidPaymentModal, CreateLoanModal, WhatsAppDraftModal } from '../components/modals';
import { loanOutstanding, nextInstallmentNumber } from '../lib/engine';
import { fmtDate, fmtDateTime, fmtMoney } from '../lib/format';
import {
  ACTIVITY_RESULT_LABELS, ACTIVITY_TYPE_LABELS, Client, FREQUENCY_LABELS, Installment, InstallmentStatus,
  Loan, LOAN_STATUS_LABELS, PAYMENT_METHOD_LABELS, Payment,
} from '../types';

type ModalState =
  | { kind: 'create' }
  | { kind: 'payment'; loan: Loan }
  | { kind: 'activity'; loan: Loan; defaultType?: 'call' | 'whatsapp' | 'visit' | 'note' }
  | { kind: 'void'; payment: Payment; loan: Loan }
  | { kind: 'assign'; loan: Loan }
  | { kind: 'cancel'; loan: Loan }
  | { kind: 'wa'; loan: Loan }
  | null;

export const LoansPage: React.FC = () => {
  const {
    loans, clients, installments, payments, activities, settings, profiles, cancelLoan, assignLoan,
  } = useData();
  const { user } = useAuth();
  const cur = settings.currency;
  // Permisos del rol personalizado (si existen); admin siempre tiene todo.
  const myProfile = profiles.find(p => p.id === user?.id);
  const can = (perm: string): boolean => {
    if (user?.role === 'admin') return true;
    if (!myProfile?.perms) return true; // sin rol personalizado → comportamiento clásico
    return !!myProfile.perms[perm];
  };
  const canCancel = (loan: Loan): boolean =>
    can('cancelLoan') || (loan.assignedTo !== null && loan.assignedTo === user?.id);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detail, setDetail] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [waMessage, setWaMessage] = useState<string | null>(null);
  const [waLoan, setWaLoan] = useState<Loan | null>(null);
  const [busyLoan, setBusyLoan] = useState<string | null>(null);

  const clientOf = (id: string) => clients.find(c => c.id === id);

  const visibleLoans = useMemo(() => {
    let list = [...loans].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (statusFilter !== 'all') list = list.filter(l => l.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l => {
        const c = clientOf(l.clientId);
        return c?.name.toLowerCase().includes(q) || c?.phone.includes(q) || l.id.slice(0, 8).includes(q);
      });
    }
    return list;
  }, [loans, clients, statusFilter, search]);

  const openWhatsApp = async (loan: Loan) => {
    setBusyLoan(loan.id);
    try {
      const { generateOverdueMessage, generateReminderMessage } = await import('../services/gemini');
      const client = clientOf(loan.clientId);
      if (!client) return;
      const li = installments.filter(i => i.loanId === loan.id);
      const msg = loan.status === 'overdue'
        ? await generateOverdueMessage(client, loan, li)
        : await generateReminderMessage(client, loan, li);
      setWaMessage(msg);
      setWaLoan(loan);
    } finally {
      setBusyLoan(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Préstamos"
        subtitle="Seguimiento cuota por cuota con historial de pagos y gestiones"
        actions={
          <Btn onClick={() => setModal({ kind: 'create' })} className="flex items-center gap-2 py-3.5">
            <Plus className="w-4 h-4" /> Nuevo Préstamo
          </Btn>
        }
      />

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1"><SearchBar value={search} onChange={setSearch} placeholder="Cliente, teléfono o ID..." /></div>
        <div className="flex gap-1.5 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm self-start">
          {['all', 'active', 'overdue', 'paid', 'cancelled'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${
                statusFilter === s ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {s === 'all' ? 'Todos' : LOAN_STATUS_LABELS[s as Loan['status']]}
            </button>
          ))}
        </div>
      </div>

      {visibleLoans.length === 0 ? (
        <EmptyState icon={Wallet} title="Sin préstamos" hint="Crea el primer préstamo para generar su calendario de cuotas." />
      ) : (
        <div className="flex flex-col gap-4">
          {visibleLoans.map(loan => {
            const client = clientOf(loan.clientId);
            const li = installments.filter(i => i.loanId === loan.id).sort((a, b) => a.installmentNumber - b.installmentNumber);
            const outstanding = loanOutstanding(loan.id, installments);
            const nextNum = nextInstallmentNumber(li);
            const paidCount = li.filter(i => i.status === 'paid' || i.status === 'waived').length;
            const isDetail = detail === loan.id;

            return (
              <Card key={loan.id} className="overflow-hidden">
                <div className="p-6 lg:p-7">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h4 className="font-black text-xl text-slate-900">{client?.name ?? '—'}</h4>
                        <StatusBadge label={LOAN_STATUS_LABELS[loan.status]} className={loanStatusStyle(loan.status)} />
                      </div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
                        {loan.installmentsCount} cuotas {FREQUENCY_LABELS[loan.frequency].toLowerCase()} · desde {fmtDate(loan.createdAt)}
                      </p>
                    </div>
                    <div className="flex lg:items-center gap-6 lg:gap-6 overflow-x-auto -mx-1 px-1 lg:overflow-visible lg:mx-0 lg:px-0 pb-1 lg:pb-0">
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capital</p>
                        <p className="font-black text-slate-900">{fmtMoney(loan.principal, cur)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interés</p>
                        <p className="font-black text-slate-900">{loan.interestRate}%</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cuotas</p>
                        <p className="font-black text-slate-900">{paidCount}/{loan.installmentsCount}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pendiente</p>
                        <p className={`text-2xl font-black ${outstanding > 0 ? 'text-indigo-600' : 'text-emerald-600'}`}>{fmtMoney(outstanding, cur)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="mt-5">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                      {li.map(i => (
                        <div
                          key={i.id}
                          className={`h-full ${
                            i.status === 'paid' ? 'bg-emerald-500'
                              : i.status === 'partial' ? 'bg-amber-400'
                                : i.status === 'overdue' ? 'bg-rose-500'
                                  : i.status === 'waived' ? 'bg-slate-300' : 'bg-slate-200'
                          }`}
                          style={{ width: `${100 / Math.max(1, li.length)}%` }}
                          title={`Cuota ${i.installmentNumber}: ${i.status}`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1.5">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Próxima: #{nextNum} · {li.find(i => i.installmentNumber === nextNum) ? fmtDate(li.find(i => i.installmentNumber === nextNum)!.dueDate) : '—'}
                      </p>
                      <button onClick={() => setDetail(isDetail ? null : loan.id)} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline flex items-center gap-1">
                        {isDetail ? <><ChevronUp className="w-3 h-3" /> Ocultar detalle</> : <><ChevronDown className="w-3 h-3" /> Ver detalle completo</>}
                      </button>
                    </div>
                  </div>
                </div>

                {isDetail && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-6 lg:p-7 grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Calendario de cuotas */}
                    <div>
                      <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-indigo-500" /> Calendario de Cuotas
                      </h5>
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {li.map(i => (
                          <div key={i.id} className="bg-white rounded-2xl border border-slate-100 p-3.5 flex justify-between items-center">
                            <div>
                              <p className="text-xs font-black text-slate-800">Cuota {i.installmentNumber} · {fmtDate(i.dueDate)}</p>
                              <p className="text-[11px] text-slate-400 font-bold">
                                {fmtMoney(i.amountPaid, cur)} / {fmtMoney(i.amountDue, cur)} pagado
                              </p>
                            </div>
                            <StatusBadge label={i.status === 'partial' ? 'Abonada' : ({ pending: 'Pendiente', paid: 'Pagada', overdue: 'Vencida', waived: 'Condonada' } as Record<InstallmentStatus, string>)[i.status]} className={installmentStatusStyle(i.status)} />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Timeline de pagos */}
                    <div>
                      <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Banknote className="w-4 h-4 text-emerald-500" /> Pagos Recibidos
                      </h5>
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {payments.filter(p => p.loanId === loan.id)
                          .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
                          .map(p => {
                            const receiver = profiles.find(u => u.id === p.receivedBy);
                            return (
                              <div key={p.id} className="bg-white rounded-2xl border border-slate-100 p-3.5">
                                <div className="flex justify-between items-center">
                                  <p className="font-black text-slate-800">{fmtMoney(p.amount, cur)}</p>
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{PAYMENT_METHOD_LABELS[p.method]}</span>
                                </div>
                                <div className="flex justify-between items-center mt-1">
                                  <p className="text-[11px] text-slate-400 font-bold">
                                    {fmtDate(p.paymentDate)} · saldo {fmtMoney(p.balanceAfter, cur)}{receiver ? ` · ${receiver.fullName}` : ''}
                                  </p>
                                  {p.notes?.includes('ANULADO') ? (
                                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-500">Anulado</span>
                                  ) : can('voidPayment') ? (
                                    <button
                                      onClick={() => setModal({ kind: 'void', payment: p, loan })}
                                      className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100"
                                    >
                                      Anular
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        {payments.filter(p => p.loanId === loan.id).length === 0 && (
                          <p className="text-slate-400 italic text-sm">Sin pagos registrados.</p>
                        )}
                      </div>
                    </div>

                    {/* Timeline de gestiones */}
                    <div>
                      <h5 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <HandCoins className="w-4 h-4 text-amber-500" /> Gestiones de Cobranza
                      </h5>
                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                        {activities.filter(a => a.loanId === loan.id)
                          .sort((a, b) => b.activityDate.localeCompare(a.activityDate))
                          .map(a => (
                            <div key={a.id} className="bg-white rounded-2xl border border-slate-100 p-3.5">
                              <p className="text-xs font-black text-slate-800">
                                {ACTIVITY_TYPE_LABELS[a.type]} — {ACTIVITY_RESULT_LABELS[a.result]}
                              </p>
                              {a.promiseDate && (
                                <p className="text-[11px] font-bold text-amber-600">Compromiso: {fmtDate(a.promiseDate)}</p>
                              )}
                              {a.notes && <p className="text-[11px] text-slate-400 mt-0.5">{a.notes}</p>}
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">{fmtDateTime(a.activityDate)}</p>
                            </div>
                          ))}
                        {activities.filter(a => a.loanId === loan.id).length === 0 && (
                          <p className="text-slate-400 italic text-sm">Sin gestiones registradas.</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Acciones */}
                <div className="border-t border-slate-100 px-4 lg:px-7 py-4 bg-white flex flex-wrap gap-2 items-center sticky bottom-0">
                  {(loan.status === 'active' || loan.status === 'overdue') && (
                    <>
                      <Btn onClick={() => setModal({ kind: 'payment', loan })} className="flex items-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> Cobrar</Btn>
                      <Btn variant="secondary" onClick={() => setModal({ kind: 'activity', loan })} className="flex items-center gap-1.5"><HandCoins className="w-3.5 h-3.5" /> Gestionar</Btn>
                      <Btn variant="secondary" onClick={() => openWhatsApp(loan)} disabled={busyLoan === loan.id} className="flex items-center gap-1.5">
                        <span>WhatsApp</span>
                      </Btn>
                    </>
                  )}
                  {can('assignLoan') && (
                    <Btn variant="secondary" onClick={() => setModal({ kind: 'assign', loan })} className="flex items-center gap-1.5"><UserCog className="w-3.5 h-3.5" /> Asignar</Btn>
                  )}
                  {loan.status !== 'cancelled' && loan.status !== 'paid' && canCancel(loan) && (
                    <Btn variant="danger" onClick={() => setModal({ kind: 'cancel', loan })} className="flex items-center gap-1.5"><XCircle className="w-3.5 h-3.5" /> Cancelar</Btn>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modales */}
      {modal?.kind === 'create' && (
        <CreateLoanModal onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'payment' && (
        <PaymentModal
          loan={modal.loan}
          client={clientOf(modal.loan.clientId)}
          installments={installments.filter(i => i.loanId === modal.loan.id)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'activity' && (
        <ActivityModal loan={modal.loan} client={clientOf(modal.loan.clientId)} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'void' && (
        <VoidPaymentModal payment={modal.payment} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'assign' && (
        <AssignModal loan={modal.loan} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'cancel' && (
        <CancelLoanModal loan={modal.loan} onCancel={(reason) => { cancelLoan(modal.loan.id, reason); setModal(null); }} onClose={() => setModal(null)} />
      )}
      {waMessage !== null && waLoan && (
        <WhatsAppDraftModal
          message={waMessage}
          phone={clientOf(waLoan.clientId)?.phone ?? ''}
          loanId={waLoan.id}
          onClose={() => { setWaMessage(null); setWaLoan(null); }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Modal de asignación de cobrador
// ---------------------------------------------------------------------------
const AssignModal: React.FC<{ loan: Loan; onClose: () => void }> = ({ loan, onClose }) => {
  const { profiles, assignLoan } = useData();
  const [userId, setUserId] = useState(loan.assignedTo ?? '');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="Asignar cobrador" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <Field label="Responsable del cobro">
          <select value={userId} onChange={e => setUserId(e.target.value)} className={inputCls}>
            <option value="">— Sin asignar (visible para todos) —</option>
            {profiles.filter(p => p.active).map(p => (
              <option key={p.id} value={p.id}>{p.fullName} ({p.role})</option>
            ))}
          </select>
        </Field>
        <div className="flex gap-3 mt-2">
          <Btn variant="secondary" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn onClick={async () => { setBusy(true); try { await assignLoan(loan.id, userId || null); onClose(); } finally { setBusy(false); } }} disabled={busy} className="flex-1">Guardar</Btn>
        </div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Modal de cancelación de préstamo
// ---------------------------------------------------------------------------
const CancelLoanModal: React.FC<{ loan: Loan; onCancel: (reason: string) => void; onClose: () => void }> = ({ onCancel, onClose }) => {
  const [reason, setReason] = useState('');
  return (
    <Modal title="Cancelar préstamo" subtitle="Requiere motivo; queda en auditoría" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div className="bg-amber-50 text-amber-700 text-sm font-bold p-4 rounded-2xl flex items-start gap-2">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          Las cuotas no pagadas se marcarán como condonadas y el préstamo quedará fuera de la cartera activa.
        </div>
        <Field label="Motivo de cancelación">
          <textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="Ej: acuerdo alternativo, fraude detectado..." />
        </Field>
        <div className="flex gap-3 mt-2">
          <Btn variant="secondary" onClick={onClose} className="flex-1">Volver</Btn>
          <Btn variant="danger" disabled={!reason.trim()} onClick={() => onCancel(reason)} className="flex-1">Confirmar cancelación</Btn>
        </div>
      </div>
    </Modal>
  );
};
