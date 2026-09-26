// ============================================================================
// DineroYa — Clientes: cartera con ficha 360
// ============================================================================
import React, { useMemo, useState } from 'react';
import { UserPlus, Users, MessageSquare, Pencil, PlusCircle, Eye } from 'lucide-react';
import { useData } from '../context/DataContext';
import {
  Card, PageHeader, EmptyState, Btn, RiskBadge, SearchBar, Modal, Field, inputCls, StatusBadge, loanStatusStyle,
} from '../components/ui';
import { ClientFormModal, CreateLoanModal } from '../components/modals';
import { loanOutstanding, clientMoraAmount } from '../lib/engine';
import { fmtDate, fmtMoney, waLink } from '../lib/format';
import { Client, LOAN_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../types';

export const ClientsPage: React.FC = () => {
  const { clients, loans, installments, payments, settings } = useData();
  const moraOf = (clientId: string) => clientMoraAmount(clientId, loans, installments, settings.moraRate ?? 0);
  const cur = settings.currency;
  const [search, setSearch] = useState('');
  const [formModal, setFormModal] = useState<{ open: boolean; client?: Client }>({ open: false });
  const [detail, setDetail] = useState<Client | null>(null);
  const [loanModal, setLoanModal] = useState<{ open: boolean; clientId?: string }>({ open: false });

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return clients;
    return clients.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.document ?? '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  const debtOf = (clientId: string) =>
    loans.filter(l => l.clientId === clientId && l.status !== 'cancelled' && l.status !== 'paid')
      .reduce((acc, l) => acc + loanOutstanding(l.id, installments), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        subtitle="Cartera de deudores con scoring de riesgo"
        actions={
          <Btn onClick={() => setFormModal({ open: true })} className="flex items-center gap-2 py-3.5">
            <UserPlus className="w-4 h-4" /> Nuevo Cliente
          </Btn>
        }
      />

      <SearchBar value={search} onChange={setSearch} placeholder="Nombre, teléfono o documento..." />

      {visible.length === 0 ? (
        <EmptyState icon={Users} title="Sin clientes" hint="Registra tu primer cliente para poder crear préstamos." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {visible.map(client => {
            const clientLoans = loans.filter(l => l.clientId === client.id && l.status !== 'cancelled');
            const debt = debtOf(client.id);
            return (
              <Card key={client.id} className="p-6 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-5 gap-3">
                  <div className="min-w-0">
                    <h4 className="font-black text-slate-900 text-lg leading-tight truncate">{client.name}</h4>
                    <p className="text-slate-400 text-xs font-bold">{client.phone}</p>
                    {client.document && <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">{client.document}</p>}
                  </div>
                  <div className="w-24 shrink-0"><RiskBadge score={client.riskScore} /></div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Deuda</p>
                    <p className={`text-xl font-black ${debt > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{fmtMoney(debt, cur)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Créditos</p>
                    <p className="text-xl font-black text-slate-900">{clientLoans.length}</p>
                  </div>
                </div>

                <div className="mt-5 flex gap-2">
                  <Btn variant="secondary" onClick={() => setDetail(client)} className="flex-1 flex items-center justify-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" /> Ficha
                  </Btn>
                  <Btn onClick={() => setLoanModal({ open: true, clientId: client.id })} className="flex-1 flex items-center justify-center gap-1.5">
                    <PlusCircle className="w-3.5 h-3.5" /> Préstamo
                  </Btn>
                  <a
                    href={waLink(client.phone)}
                    target="_blank" rel="noreferrer"
                    className="p-3 bg-slate-50 text-slate-400 rounded-2xl hover:bg-emerald-50 hover:text-emerald-600 transition border border-slate-100 flex items-center justify-center"
                    title="WhatsApp directo"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </a>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modales */}
      {formModal.open && (
        <ClientFormModal client={formModal.client} onClose={() => setFormModal({ open: false })} />
      )}

      {detail && (
        <Modal title={detail.name} subtitle="Ficha del cliente" onClose={() => setDetail(null)} wide>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-4">
              <div className="w-28"><RiskBadge score={detail.riskScore} /></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contacto</p>
                <p className="font-bold text-slate-700">{detail.phone}</p>
                <p className="font-bold text-slate-500">{detail.email || 'Sin email'}</p>
                <p className="font-bold text-slate-500">{detail.address || 'Sin dirección'}</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notas</p>
                <p className="text-slate-600 font-medium">{detail.notes || '—'}</p>
              </div>
              <p className="text-[11px] text-slate-400 font-bold">Cliente desde {fmtDate(detail.registrationDate)}</p>
              <div className="flex gap-2 pt-2">
                <Btn variant="secondary" onClick={() => { setFormModal({ open: true, client: detail }); setDetail(null); }} className="flex items-center gap-1.5">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Btn>
              </div>
            </div>
            <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Resumen de cartera</p>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-slate-500">Deuda vigente:</span>
                <span className="font-black text-indigo-600">{fmtMoney(debtOf(detail.id), cur)}</span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm font-medium text-slate-500">Préstamos totales:</span>
                <span className="font-black text-slate-900">{loans.filter(l => l.clientId === detail.id).length}</span>
              </div>
              {moraOf(detail.id) > 0 && (
                <div className="flex justify-between items-center mt-3 bg-rose-50 border border-rose-100 rounded-2xl px-4 py-2.5">
                  <span className="text-xs font-black text-rose-500 uppercase tracking-widest">Mora acumulada ({settings.moraRate}% mensual):</span>
                  <span className="font-black text-rose-600">{fmtMoney(moraOf(detail.id), cur)}</span>
                </div>
              )}
              <div className="space-y-2 max-h-56 overflow-y-auto mt-4">
                {loans.filter(l => l.clientId === detail.id).map(l => {
                  const out = loanOutstanding(l.id, installments);
                  return (
                    <div key={l.id} className="bg-white p-3 rounded-2xl border border-slate-100 flex justify-between items-center">
                      <div>
                        <p className="text-sm font-black text-slate-800">{fmtMoney(l.principal, cur)}</p>
                        <p className="text-[10px] font-bold text-slate-400">{fmtDate(l.createdAt)} · pendiente {fmtMoney(out, cur)}</p>
                      </div>
                      <StatusBadge label={LOAN_STATUS_LABELS[l.status]} className={loanStatusStyle(l.status)} />
                    </div>
                  );
                })}
                {loans.filter(l => l.clientId === detail.id).length === 0 && (
                  <p className="text-slate-400 italic text-sm">Sin préstamos aún.</p>
                )}
              </div>
              {payments.filter(p => p.clientId === detail.id).length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Últimos pagos</p>
                  {payments.filter(p => p.clientId === detail.id)
                    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
                    .slice(0, 3)
                    .map(p => (
                      <div key={p.id} className="flex justify-between text-xs font-bold text-slate-600 py-1">
                        <span>{fmtDate(p.paymentDate)} · {PAYMENT_METHOD_LABELS[p.method]}</span>
                        <span className="text-emerald-600 font-black">{fmtMoney(p.amount, cur)}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <Btn variant="secondary" onClick={() => setDetail(null)} className="flex-1">Cerrar</Btn>
            <Btn onClick={() => { setLoanModal({ open: true, clientId: detail.id }); setDetail(null); }} className="flex-1 flex items-center justify-center gap-1.5">
              <PlusCircle className="w-4 h-4" /> Nuevo crédito
            </Btn>
          </div>
        </Modal>
      )}

      {loanModal.open && (
        <CreateLoanModal
          defaultClientId={loanModal.clientId}
          onClose={() => setLoanModal({ open: false })}
        />
      )}
    </div>
  );
};
