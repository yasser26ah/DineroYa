// ============================================================================
// DineroYa — Cobranza del Día (módulo central de gestión de cobro)
// ============================================================================
import React, { useMemo, useState } from 'react';
import { Phone, MessageSquare, MapPin, StickyNote, Banknote, Clock, CheckCircle2, History } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Card, PageHeader, EmptyState, Btn } from '../components/ui';
import { PaymentModal, ActivityModal, WhatsAppDraftModal } from '../components/modals';
import { bucketLabel, lastActivityFor } from '../lib/engine';
import { fmtDate, fmtMoney, fmtDateTime } from '../lib/format';
import { ACTIVITY_RESULT_LABELS, Client, Installment, Loan } from '../types';
import { generateOverdueMessage, generateReminderMessage } from '../services/gemini';

type ModalState =
  | { kind: 'activity'; loan: Loan; client: Client; defaultType?: 'call' | 'whatsapp' | 'visit' | 'note' }
  | { kind: 'payment'; loan: Loan; client: Client }
  | { kind: 'wa'; loan: Loan; client: Client }
  | null;

const TYPE_ICON: Record<string, React.ElementType> = {
  call: Phone, whatsapp: MessageSquare, visit: MapPin, note: StickyNote,
};

export const CollectionsPage: React.FC = () => {
  const { stats, loans, installments, clients, activities, settings, profiles } = useData();
  const { user } = useAuth();
  const cur = settings.currency;
  const [modal, setModal] = useState<ModalState>(null);
  const [waMessage, setWaMessage] = useState<string | null>(null);
  const [pendingWa, setPendingWa] = useState<{ loan: Loan; client: Client } | null>(null);
  const [busyLoan, setBusyLoan] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(user?.role === 'cobrador');
  const [showHistory, setShowHistory] = useState<string | null>(null);

  const myProfile = profiles.find(p => p.id === user?.id);

  const queue = useMemo(() => {
    let rows = [...stats.dueToday, ...stats.brokenPromises.filter(bp => !stats.dueToday.some(d => d.loanId === bp.loanId))];
    if (mineOnly && user) rows = rows.filter(r => !r.assignedTo || r.assignedTo === user.id);
    return rows.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
  }, [stats.dueToday, stats.brokenPromises, mineOnly, user]);

  const brokenSet = new Set(stats.brokenPromises.map(bp => bp.loanId));

  const openWhatsApp = async (loan: Loan, client: Client) => {
    setBusyLoan(loan.id);
    try {
      const li = installments.filter(i => i.loanId === loan.id);
      const msg = loan.status === 'overdue'
        ? await generateOverdueMessage(client, loan, li)
        : await generateReminderMessage(client, loan, li);
      setWaMessage(msg);
      setPendingWa({ loan, client });
    } finally {
      setBusyLoan(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Cobranza del Día"
        subtitle="Casos que requieren gestión hoy: vencidos, por vencer hoy y compromisos incumplidos"
        actions={
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm">
            <button
              onClick={() => setMineOnly(false)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${!mineOnly ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Toda la cartera
            </button>
            <button
              onClick={() => setMineOnly(true)}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition ${mineOnly ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              Mis casos
            </button>
          </div>
        }
      />

      {myProfile && (
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          {user?.role === 'cobrador' ? 'Operas como cobrador' : 'Rol: ' + myProfile.role} — {queue.length} caso(s) en cola
        </p>
      )}

      {queue.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Cobranza al día" hint="No hay cuotas vencidas ni compromisos incumplidos pendientes de gestión." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {queue.map(row => {
            const loan = loans.find(l => l.id === row.loanId);
            const client = clients.find(c => c.id === row.clientId);
            if (!loan || !client) return null;
            const last = lastActivityFor(loan.id, activities);
            const LastIcon = last ? (TYPE_ICON[last.type] ?? History) : History;
            const isBroken = brokenSet.has(loan.id);

            return (
              <Card key={loan.id} className={`p-6 border-2 ${isBroken ? 'border-amber-200 bg-amber-50/30' : row.daysOverdue ? 'border-rose-100 bg-rose-50/20' : 'border-slate-100'}`}>
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div className="min-w-0">
                    <h4 className="font-black text-lg text-slate-900 truncate">{client.name}</h4>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${row.daysOverdue ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'}`}>
                        {row.daysOverdue ? `Mora ${row.daysOverdue} días` : 'Vence hoy'}
                      </span>
                      {isBroken && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg bg-amber-500 text-white flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Prometió {fmtDate(row.lastPromiseDate)}
                        </span>
                      )}
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{bucketLabel[row.bucket]}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Saldo</p>
                    <p className="text-2xl font-black text-slate-900">{fmtMoney(row.outstanding, cur)}</p>
                  </div>
                </div>

                {last && (
                  <div className="bg-white/80 rounded-2xl p-3 border border-slate-100 mb-4 flex items-center gap-3">
                    <div className="p-2 bg-slate-50 rounded-xl"><LastIcon className="w-4 h-4 text-slate-500" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-slate-700 truncate">{ACTIVITY_RESULT_LABELS[last.result]}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{fmtDateTime(last.activityDate)}</p>
                    </div>
                    <button
                      onClick={() => setShowHistory(showHistory === loan.id ? null : loan.id)}
                      className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline shrink-0"
                    >
                      {showHistory === loan.id ? 'Ocultar' : 'Historial'}
                    </button>
                  </div>
                )}

                {showHistory === loan.id && (
                  <div className="bg-slate-50 rounded-2xl p-4 mb-4 space-y-2 max-h-48 overflow-y-auto border border-slate-100">
                    {activities.filter(a => a.loanId === loan.id).sort((a, b) => b.activityDate.localeCompare(a.activityDate)).map(a => {
                      const Icon = TYPE_ICON[a.type] ?? History;
                      return (
                        <div key={a.id} className="flex items-start gap-3 p-2 bg-white rounded-xl border border-slate-100">
                          <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-700">{ACTIVITY_RESULT_LABELS[a.result]}</p>
                            {a.notes && <p className="text-[11px] text-slate-400 truncate">{a.notes}</p>}
                            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{fmtDateTime(a.activityDate)}</p>
                          </div>
                        </div>
                      );
                    })}
                    {activities.filter(a => a.loanId === loan.id).length === 0 && (
                      <p className="text-slate-400 italic text-xs">Sin gestiones registradas.</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <Btn variant="secondary" onClick={() => setModal({ kind: 'activity', loan, client })} title="Registrar gestión">
                    <span className="flex items-center justify-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Gestionar</span>
                  </Btn>
                  <Btn
                    variant="secondary"
                    onClick={() => openWhatsApp(loan, client)}
                    disabled={busyLoan === loan.id}
                    title="Recordatorio por WhatsApp"
                  >
                    <span className="flex items-center justify-center gap-1.5"><MessageSquare className="w-3.5 h-3.5" /> WhatsApp</span>
                  </Btn>
                  <Btn onClick={() => setModal({ kind: 'payment', loan, client })} title="Registrar pago">
                    <span className="flex items-center justify-center gap-1.5"><Banknote className="w-3.5 h-3.5" /> Cobrar</span>
                  </Btn>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modales */}
      {modal?.kind === 'activity' && (
        <ActivityModal loan={modal.loan} client={modal.client} onClose={() => setModal(null)} />
      )}
      {modal?.kind === 'payment' && (
        <PaymentModal
          loan={modal.loan}
          client={modal.client}
          installments={installments.filter(i => i.loanId === modal.loan.id)}
          onClose={() => setModal(null)}
        />
      )}
      {waMessage !== null && pendingWa && (
        <WhatsAppDraftModal
          message={waMessage}
          phone={pendingWa.client.phone}
          loanId={pendingWa.loan.id}
          onClose={() => { setWaMessage(null); setPendingWa(null); }}
        />
      )}
    </div>
  );
};
