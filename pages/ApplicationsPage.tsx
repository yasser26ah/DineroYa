// ============================================================================
// DineroYa — Solicitudes de crédito (bandeja del administrador/gerente)
// ============================================================================
import React, { useMemo, useState } from 'react';
import {
  FileText, CheckCircle2, XCircle, Clock, Phone, Mail, MapPin, AlertTriangle,
} from 'lucide-react';
import { useData } from '../context/DataContext';
import {
  Btn, Card, EmptyState, Field, Modal, PageHeader, SearchBar, StatusBadge, inputCls,
} from '../components/ui';
import { fmtDate, fmtDateTime, fmtMoney } from '../lib/format';
import {
  CREDIT_APPLICATION_STATUS_LABELS, CreditApplication, CreditApplicationStatus,
} from '../types';

const statusStyle = (s: CreditApplicationStatus) =>
  s === 'approved' ? 'bg-emerald-100 text-emerald-700'
    : s === 'rejected' ? 'bg-rose-100 text-rose-700'
      : s === 'cancelled' ? 'bg-slate-200 text-slate-500'
        : 'bg-amber-100 text-amber-700';

const FILTERS: { id: 'all' | CreditApplicationStatus; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'rejected', label: 'Rechazadas' },
];

export const ApplicationsPage: React.FC = () => {
  const { applications, clients, settings, updateApplicationStatus } = useData();
  const [filter, setFilter] = useState<'all' | CreditApplicationStatus>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CreditApplication | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cur = settings.currency;

  const visible = useMemo(() => {
    let list = [...applications];
    if (filter !== 'all') list = list.filter(a => a.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(a =>
        a.applicantName.toLowerCase().includes(q) ||
        (a.document ?? '').toLowerCase().includes(q) ||
        (a.phone ?? '').toLowerCase().includes(q) ||
        (a.email ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [applications, filter, search]);

  const clientName = (a: CreditApplication) =>
    a.clientId ? clients.find(c => c.id === a.clientId)?.name : undefined;

  const openDecision = (app: CreditApplication, kind: 'approved' | 'rejected') => {
    setSelected(app);
    setDecision(kind);
    setNotes('');
    setError(null);
  };

  const submitDecision = async () => {
    if (!selected || !decision) return;
    setBusy(true);
    setError(null);
    try {
      await updateApplicationStatus(selected.id, decision, notes.trim() || undefined);
      setSelected(null);
      setDecision(null);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo actualizar la solicitud.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Solicitudes de crédito"
        subtitle="Revisa las solicitudes que envían tus clientes desde el portal."
      />

      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="flex-1">
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nombre, documento, teléfono o email..." />
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition ${
                filter === f.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filter === 'pending' ? 'No hay solicitudes pendientes' : 'No hay solicitudes en este filtro'}
          hint="Cuando un cliente envíe una solicitud desde su portal, aparecerá aquí."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {visible.map(app => (
            <Card key={app.id} className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <p className="text-xl font-black text-slate-900">{fmtMoney(app.requestedAmount, cur)}</p>
                  <p className="text-xs font-bold text-slate-500">{app.applicantName}</p>
                  {clientName(app) && (
                    <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">
                      Cliente registrado
                    </p>
                  )}
                </div>
                <StatusBadge label={CREDIT_APPLICATION_STATUS_LABELS[app.status]} className={statusStyle(app.status)} />
              </div>

              <div className="space-y-1.5 text-xs font-medium text-slate-500 mb-4">
                {app.phone && <p className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400" /> {app.phone}</p>}
                {app.email && <p className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-slate-400" /> {app.email}</p>}
                {app.address && <p className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {app.address}</p>}
                <p className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-slate-400" /> {fmtDateTime(app.createdAt)}</p>
              </div>

              {app.purpose && (
                <p className="text-xs font-medium text-slate-600 bg-slate-50 rounded-xl p-3 mb-3">
                  <span className="font-black text-slate-400 uppercase tracking-widest text-[10px] mr-2">Destino</span>
                  {app.purpose}
                </p>
              )}
              {app.notes && <p className="text-xs font-medium text-slate-500 mb-3">{app.notes}</p>}
              {app.reviewNotes && (
                <p className="text-xs font-medium text-slate-500 bg-slate-50 rounded-xl p-3 mb-3">
                  <span className="font-black text-slate-400 uppercase tracking-widest text-[10px] mr-2">Respuesta</span>
                  {app.reviewNotes}
                </p>
              )}

              {app.status === 'pending' && (
                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <Btn variant="success" onClick={() => openDecision(app, 'approved')} className="flex-1 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Aprobar
                  </Btn>
                  <Btn variant="danger" onClick={() => openDecision(app, 'rejected')} className="flex-1 flex items-center justify-center gap-1.5">
                    <XCircle className="w-4 h-4" /> Rechazar
                  </Btn>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {selected && decision && (
        <Modal
          title={decision === 'approved' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
          subtitle={`${selected.applicantName} · ${fmtMoney(selected.requestedAmount, cur)}`}
          onClose={() => { setSelected(null); setDecision(null); }}
        >
          <div className="flex flex-col gap-5">
            <div className={`text-sm font-bold p-4 rounded-2xl flex items-start gap-2 ${
              decision === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'
            }`}>
              {decision === 'approved'
                ? <><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> Al aprobar, el cliente verá la respuesta en su portal. Luego crea el préstamo desde la sección Préstamos.</>
                : <><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> El cliente verá el motivo del rechazo en su portal.</>}
            </div>
            <Field label={decision === 'approved' ? 'Condiciones o nota para el cliente (opcional)' : 'Motivo del rechazo (opcional)'}>
              <textarea
                rows={3}
                className={inputCls}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={decision === 'approved' ? 'Ej: aprobado por 500.000 a 12 cuotas mensuales.' : 'Ej: capacidad de pago insuficiente.'}
              />
            </Field>
            {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
            <div className="flex gap-3">
              <Btn variant="secondary" onClick={() => { setSelected(null); setDecision(null); }} className="flex-1">Cancelar</Btn>
              <Btn
                variant={decision === 'approved' ? 'success' : 'danger'}
                onClick={submitDecision}
                disabled={busy}
                className="flex-1"
              >
                {decision === 'approved' ? 'Confirmar aprobación' : 'Confirmar rechazo'}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
