// ============================================================================
// DineroYa — Modales de operación (cliente, préstamo, pago, gestión, WhatsApp)
// ============================================================================
import React, { useMemo, useState } from 'react';
import { Send, Copy, AlertTriangle, Banknote } from 'lucide-react';
import {
  ACTIVITY_RESULT_LABELS, ACTIVITY_TYPE_LABELS, ActivityResult, ActivityType,
  Client, FREQUENCY_LABELS, Installment, Loan, LoanFrequency, PAYMENT_METHOD_LABELS, Payment, PaymentMethod,
} from '../types';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { fmtDate, fmtMoney, todayISO, waLink } from '../lib/format';
import { generateSchedule, riskSuggestedRate } from '../lib/engine';
import { generatePaymentMessage } from '../services/gemini';
import { Btn, Field, inputCls, Modal } from './ui';

// ---------------------------------------------------------------------------
// Cliente: alta / edición
// ---------------------------------------------------------------------------
export const ClientFormModal: React.FC<{ client?: Client; onClose: () => void }> = ({ client, onClose }) => {
  const { createClient, updateClient } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input = {
      name: String(fd.get('name') ?? '').trim(),
      document: String(fd.get('document') ?? '').trim(),
      phone: String(fd.get('phone') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      address: String(fd.get('address') ?? '').trim(),
      notes: String(fd.get('notes') ?? '').trim(),
    };
    setBusy(true);
    setError(null);
    try {
      if (client) await updateClient(client.id, input);
      else await createClient(input);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={client ? 'Editar cliente' : 'Registro de cliente'} subtitle="Datos personales y de contacto" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Nombre completo">
          <input name="name" required defaultValue={client?.name} className={inputCls} />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Documento">
            <input name="document" defaultValue={client?.document} className={inputCls} placeholder="CC / DNI" />
          </Field>
          <Field label="WhatsApp">
            <input name="phone" required defaultValue={client?.phone} className={inputCls} placeholder="573001112233" />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Email">
            <input name="email" type="email" defaultValue={client?.email} className={inputCls} />
          </Field>
          <Field label="Dirección">
            <input name="address" defaultValue={client?.address} className={inputCls} />
          </Field>
        </div>
        <Field label="Notas internas">
          <textarea name="notes" rows={2} defaultValue={client?.notes} className={inputCls} />
        </Field>
        {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
        <div className="flex gap-3 mt-2">
          <Btn variant="secondary" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn type="submit" disabled={busy} className="flex-1">{client ? 'Guardar cambios' : 'Registrar'}</Btn>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Préstamo: creación con calendario
// ---------------------------------------------------------------------------
export const CreateLoanModal: React.FC<{
  preselectedClient?: Client | null;
  defaultClientId?: string;
  onClose: () => void;
  onCreated?: (loan: Loan) => void;
}> = ({ preselectedClient, defaultClientId, onClose, onCreated }) => {
  const { clients, profiles, settings, createLoan } = useData();
  const { user } = useAuth();
  const [clientId, setClientId] = useState(preselectedClient?.id ?? defaultClientId ?? '');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState(String(settings.defaultInterestRate));
  const [count, setCount] = useState('4');
  const [frequency, setFrequency] = useState<LoanFrequency>('monthly');
  const [firstDue, setFirstDue] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const client = clients.find(c => c.id === clientId);

  // Al elegir cliente se sugiere tasa según su riesgo
  const onClientChange = (id: string) => {
    setClientId(id);
    const c = clients.find(x => x.id === id);
    if (c && principal) setRate(String(riskSuggestedRate(c.riskScore, settings.defaultInterestRate)));
  };

  const schedulePreview = useMemo(() => {
    const p = Number(principal);
    const r = Number(rate);
    const n = Number(count);
    if (!p || !n || p <= 0 || n <= 0) return null;
    return generateSchedule(p, r || 0, n, frequency, firstDue);
  }, [principal, rate, count, frequency, firstDue]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (!clientId) { setError('Selecciona un cliente'); return; }
    setBusy(true);
    try {
      const loan = await createLoan({
        clientId,
        principal: Number(principal),
        interestRate: Number(rate),
        installmentsCount: Number(count),
        frequency,
        firstDueDate: firstDue,
        assignedTo: assignedTo || user?.id || null,
      });
      onCreated?.(loan);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Nuevo préstamo" subtitle="Se generará el calendario de cuotas" onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Cliente">
            <select value={clientId} onChange={e => onClientChange(e.target.value)} className={inputCls} required>
              <option value="">Seleccionar...</option>
              {clients.filter(c => c.active).map(c => (
                <option key={c.id} value={c.id}>{c.name} — riesgo {c.riskScore}</option>
              ))}
            </select>
          </Field>
          <Field label={`Monto (${settings.currency})`}>
            <input type="number" min="1" step="0.01" required value={principal} onChange={e => setPrincipal(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          <Field label="Interés total %">
            <input type="number" min="0" step="0.1" required value={rate} onChange={e => setRate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="N° de cuotas">
            <input type="number" min="1" max="120" required value={count} onChange={e => setCount(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Frecuencia">
            <select value={frequency} onChange={e => setFrequency(e.target.value as LoanFrequency)} className={inputCls}>
              {Object.entries(FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Primera cuota">
            <input type="date" required value={firstDue} onChange={e => setFirstDue(e.target.value)} className={inputCls} />
          </Field>
        </div>
        {profiles.length > 1 && (
          <Field label="Cobrador responsable">
            <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={inputCls}>
              <option value="">— Asignación automática (yo) —</option>
              {profiles.filter(p => p.active).map(p => (
                <option key={p.id} value={p.id}>{p.fullName} ({p.role})</option>
              ))}
            </select>
          </Field>
        )}

        {schedulePreview && (
          <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
              Vista previa del calendario — total a pagar {fmtMoney(schedulePreview.reduce((a, s) => a + s.amountDue, 0), settings.currency)}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-44 overflow-y-auto">
              {schedulePreview.map(s => (
                <div key={s.installmentNumber} className="bg-white rounded-xl p-3 border border-slate-100">
                  <p className="text-[10px] font-black text-slate-400">CUOTA {s.installmentNumber}</p>
                  <p className="text-sm font-black text-slate-800">{fmtMoney(s.amountDue, settings.currency)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{fmtDate(s.dueDate)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
        <div className="flex gap-3 mt-2">
          <Btn variant="secondary" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn type="submit" disabled={busy} className="flex-1">Aprobar préstamo</Btn>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// WhatsApp: borrador editable + envío con registro
// ---------------------------------------------------------------------------
export const WhatsAppDraftModal: React.FC<{
  message: string;
  phone: string;
  loanId?: string;
  onClose: () => void;
}> = ({ message, phone, loanId, onClose }) => {
  const { logActivity } = useData();
  const [text, setText] = useState(message);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      if (loanId) {
        await logActivity({
          loanId,
          type: 'whatsapp',
          result: 'message_sent',
          notes: text,
        }).catch(() => { /* el registro no debe bloquear el envío */ });
      }
      window.open(waLink(phone, text), '_blank');
    } finally {
      setSending(false);
      onClose();
    }
  };

  return (
    <Modal title="Mensaje de WhatsApp" subtitle="Edita antes de enviar" onClose={onClose}>
      <textarea
        rows={6}
        value={text}
        onChange={e => setText(e.target.value)}
        className={`${inputCls} italic font-medium leading-relaxed mb-2`}
      />
      <div className="flex flex-col gap-3 mt-6">
        <Btn variant="success" onClick={send} disabled={sending} className="w-full flex items-center justify-center gap-2 py-4">
          <Send className="w-4 h-4" /> Enviar WhatsApp
        </Btn>
        <Btn variant="secondary" onClick={() => { navigator.clipboard?.writeText(text); }} className="w-full flex items-center justify-center gap-2">
          <Copy className="w-4 h-4" /> Copiar texto
        </Btn>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Pago: registro con asignación automática a cuotas
// ---------------------------------------------------------------------------
export const PaymentModal: React.FC<{
  loan: Loan;
  installments: Installment[];
  client?: Client;
  onClose: () => void;
}> = ({ loan, installments, client, onClose }) => {
  const { registerPayment, settings } = useData();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [donePayment, setDonePayment] = useState<Payment | null>(null);

  const pending = installments
    .filter(i => i.status !== 'paid' && i.status !== 'waived')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber);
  const next = pending[0];
  const outstanding = pending.reduce((a, i) => a + (i.amountDue - i.amountPaid), 0);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const amt = Number(amount);
    if (!amt || amt <= 0) { setError('Ingresa un monto válido'); return; }
    if (amt > outstanding + 0.001) { setError(`El pago excede el saldo pendiente (${fmtMoney(outstanding, settings.currency)})`); return; }
    setBusy(true);
    try {
      const payment = await registerPayment({ loanId: loan.id, amount: amt, method, notes, date });
      if (client) {
        const updatedInstallments = installments.map(i => ({ ...i }));
        let remaining = amt;
        updatedInstallments
          .filter(i => i.status !== 'paid' && i.status !== 'waived')
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
          .forEach(i => {
            if (remaining <= 0) return;
            const apply = Math.min(remaining, i.amountDue - i.amountPaid);
            i.amountPaid += apply;
            if (i.amountPaid >= i.amountDue) i.status = 'paid';
            else if (i.amountPaid > 0) i.status = 'partial';
            remaining -= apply;
          });
        const msg = await generatePaymentMessage(client, { amount: amt, paymentDate: date }, loan, updatedInstallments);
        setDraft(msg);
      }
      setDonePayment(payment);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Tras el pago: mostrar borrador de confirmación
  if (draft !== null && client) {
    return (
      <WhatsAppDraftModal
        message={draft}
        phone={client.phone}
        loanId={loan.id}
        onClose={() => { setDraft(null); onClose(); }}
      />
    );
  }

  return (
    <Modal title="Registrar pago" subtitle={`Préstamo de ${client?.name ?? 'cliente'}`} onClose={onClose}>
      <div className="bg-indigo-50 p-5 rounded-3xl mb-6 flex justify-between items-center border border-indigo-100">
        <div>
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Saldo pendiente</p>
          <p className="text-2xl font-black text-indigo-700">{fmtMoney(outstanding, settings.currency)}</p>
        </div>
        {next && (
          <div className="text-right">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Próxima cuota</p>
            <p className="font-black text-indigo-700">#{next.installmentNumber} — {fmtMoney(next.amountDue - next.amountPaid, settings.currency)}</p>
            <p className="text-[10px] font-bold text-indigo-400">{fmtDate(next.dueDate)}</p>
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label={`Monto recibido (${settings.currency})`}>
          <div className="relative">
            <Banknote className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="number" min="0.01" step="0.01" required autoFocus
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder={next ? String(next.amountDue - next.amountPaid) : String(outstanding)}
              className={`${inputCls} pl-12 text-xl`}
            />
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {next && Number(amount) !== next.amountDue - next.amountPaid && (
              <button type="button" onClick={() => setAmount(String(next.amountDue - next.amountPaid))} className="text-[11px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl uppercase tracking-widest hover:bg-indigo-100">
                Cuota exacta ({fmtMoney(next.amountDue - next.amountPaid, settings.currency)})
              </button>
            )}
            {outstanding > 0 && Number(amount) !== outstanding && (
              <button type="button" onClick={() => setAmount(String(outstanding))} className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl uppercase tracking-widest hover:bg-emerald-100">
                Liquidar todo ({fmtMoney(outstanding, settings.currency)})
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-400 font-bold mt-2 leading-relaxed">
            Puedes registrar <strong>abonos parciales</strong>: el monto que digites se aplica automáticamente a la cuota más antigua pendiente (FIFO). Sirve para pagos anticipados o abonos que no cubren una cuota completa.
          </p>
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Método">
            <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className={inputCls}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Fecha del pago">
            <input type="date" max={todayISO()} value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </Field>
        </div>
        <Field label="Notas">
          <input value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} placeholder="Opcional" />
        </Field>

        {error && (
          <div className="bg-rose-50 text-rose-600 text-sm font-bold p-4 rounded-2xl flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
          </div>
        )}
        <div className="flex gap-3 mt-2">
          <Btn variant="secondary" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn type="submit" disabled={busy} className="flex-1">Confirmar pago</Btn>
        </div>
      </form>
      {donePayment && !client && <p className="text-emerald-600 font-bold text-sm mt-4">Pago registrado correctamente.</p>}
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Gestión de cobranza: llamada / visita / WhatsApp / nota
// ---------------------------------------------------------------------------
export const ActivityModal: React.FC<{
  loan: Loan;
  client?: Client;
  defaultType?: ActivityType;
  onClose: () => void;
}> = ({ loan, client, defaultType = 'call', onClose }) => {
  const { logActivity } = useData();
  const [type, setType] = useState<ActivityType>(defaultType);
  const [result, setResult] = useState<ActivityResult>('contacted_promised');
  const [promiseDate, setPromiseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await logActivity({
        loanId: loan.id,
        type,
        result,
        promiseDate: result === 'contacted_promised' && promiseDate ? promiseDate : null,
        notes,
      });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Registrar gestión" subtitle={client ? `${client.name} — ${client.phone}` : undefined} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Canal">
            <select value={type} onChange={e => setType(e.target.value as ActivityType)} className={inputCls}>
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Resultado">
            <select value={result} onChange={e => setResult(e.target.value as ActivityResult)} className={inputCls}>
              {Object.entries(ACTIVITY_RESULT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
        </div>
        {result === 'contacted_promised' && (
          <Field label="Fecha de compromiso de pago">
            <input type="date" required min={todayISO()} value={promiseDate} onChange={e => setPromiseDate(e.target.value)} className={inputCls} />
          </Field>
        )}
        <Field label="Notas de la gestión">
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} placeholder="¿Qué se acordó? Detalles de la conversación..." />
        </Field>
        {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
        <div className="flex gap-3 mt-2">
          <Btn variant="secondary" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn type="submit" disabled={busy} className="flex-1">Guardar gestión</Btn>
        </div>
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// Anulación de pago con motivo obligatorio
// ---------------------------------------------------------------------------
export const VoidPaymentModal: React.FC<{
  payment: Payment;
  onClose: () => void;
}> = ({ payment, onClose }) => {
  const { voidPayment } = useData();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await voidPayment(payment.id, reason);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Anular pago" subtitle={`Pago de ${fmtMoney(payment.amount)} del ${fmtDate(payment.paymentDate)}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="bg-amber-50 text-amber-700 text-sm font-bold p-4 rounded-2xl flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          La anulación revierte la asignación a las cuotas y queda registrada en la auditoría. Esta acción no se puede deshacer.
        </div>
        <Field label="Motivo de anulación">
          <textarea rows={2} required value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="Ej: error de digitación, pago devuelto..." />
        </Field>
        {error && <p className="text-rose-600 text-sm font-bold">{error}</p>}
        <div className="flex gap-3 mt-2">
          <Btn variant="secondary" onClick={onClose} className="flex-1">Cancelar</Btn>
          <Btn type="submit" variant="danger" disabled={busy} className="flex-1">Anular pago</Btn>
        </div>
      </form>
    </Modal>
  );
};
