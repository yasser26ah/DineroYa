// ============================================================================
// DineroYa — Canales de pago y pasarelas: registro de cuentas e instrucciones
// ============================================================================
import React, { useState } from 'react';
import { Banknote, CreditCard, ExternalLink, Plus, Smartphone, Wallet } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Btn, Card, Field, PageHeader, StatusBadge, inputCls } from '../components/ui';
import { PAYMENT_CHANNEL_KIND_LABELS, PaymentChannel, PaymentChannelKind } from '../types';
import { PaymentChannelInput } from '../services/dataAdapter';

const kindIcon = (kind: PaymentChannelKind) =>
  kind === 'bank_account' ? Wallet
    : kind === 'wallet' ? Smartphone
      : kind === 'card_gateway' ? CreditCard
        : Banknote;

const ChannelRow: React.FC<{ channel: PaymentChannel; onSave: (input: PaymentChannelInput) => Promise<unknown> }> = ({ channel, onSave }) => {
  const [name, setName] = useState(channel.name);
  const [kind, setKind] = useState<PaymentChannelKind>(channel.kind);
  const [accountInfo, setAccountInfo] = useState(channel.accountInfo ?? '');
  const [instructions, setInstructions] = useState(channel.instructions ?? '');
  const [link, setLink] = useState(channel.link ?? '');
  const [active, setActive] = useState(channel.active);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const Icon = kindIcon(kind);

  const save = async (patch?: { active?: boolean }) => {
    setBusy(true);
    setMsg(null);
    try {
      await onSave({
        id: channel.id, name: name.trim() || channel.name, kind,
        accountInfo: accountInfo.trim() || undefined,
        instructions: instructions.trim() || undefined,
        link: link.trim() || undefined,
        active,
        ...patch,
      });
      setMsg('Guardado');
    } catch (err: any) {
      setMsg(err.message ?? 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="p-2.5 bg-slate-50 text-slate-500 rounded-xl"><Icon className="w-5 h-5" /></div>
        <input value={name} onChange={e => setName(e.target.value)} className={`${inputCls} flex-1 min-w-[180px]`} />
        <select value={kind} onChange={e => setKind(e.target.value as PaymentChannelKind)} className={inputCls}>
          {Object.entries(PAYMENT_CHANNEL_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <StatusBadge
          label={active ? 'Activo' : 'Inactivo'}
          className={active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Datos de la cuenta / identificador">
          <input value={accountInfo} onChange={e => setAccountInfo(e.target.value)} className={inputCls} placeholder="Banco, cuenta, titular, llave..." />
        </Field>
        <Field label="Enlace de pago (opcional)">
          <input value={link} onChange={e => setLink(e.target.value)} className={inputCls} placeholder="https://..." />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Instrucciones para el cliente">
          <textarea rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} className={inputCls} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4">
        <Btn onClick={() => save()} disabled={busy}>Guardar</Btn>
        <Btn
          variant={active ? 'secondary' : 'success'}
          onClick={() => { setActive(v => !v); save({ active: !active }); }}
          disabled={busy}
        >
          {active ? 'Desactivar' : 'Activar'}
        </Btn>
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="text-[11px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1">
            <ExternalLink className="w-3.5 h-3.5" /> Probar enlace
          </a>
        )}
        {msg && <span className="text-xs font-bold text-slate-500">{msg}</span>}
      </div>
    </Card>
  );
};

export const ChannelsPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { paymentChannels, savePaymentChannel } = useData();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<PaymentChannelKind>('wallet');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await savePaymentChannel({ name, kind });
      setName('');
    } catch (err: any) {
      setError(err.message ?? 'No se pudo crear el canal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8" data-reveal>
      {embedded ? (
        <div>
          <h3 className="text-lg font-black text-slate-900">Canales de pago</h3>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
            Cuentas, billeteras y enlaces que verá el cliente para pagar
          </p>
        </div>
      ) : (
        <PageHeader title="Canales de pago" subtitle="Cuentas, billeteras y enlaces que verá el cliente para pagar" />
      )}

      <div className="bg-sky-50 border border-sky-100 text-sky-800 p-4 rounded-2xl text-xs font-bold leading-relaxed">
        Aquí registras los datos reales de cada canal (banco, Nequi, Daviplata, enlace de pasarela) y las instrucciones.
        El portal del cliente los muestra automáticamente. Las pasarelas que cobran en línea (PSE, tarjetas, links de pago)
        necesitan además las credenciales del proveedor para confirmar pagos de forma automática; mientras tanto, el
        recaudo se registra manualmente al recibir el comprobante.
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl"><Plus className="w-5 h-5" /></div>
          <h3 className="font-black text-slate-900">Nuevo canal</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <Field label="Nombre">
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Ej. Nequi" />
          </Field>
          <Field label="Tipo">
            <select value={kind} onChange={e => setKind(e.target.value as PaymentChannelKind)} className={inputCls}>
              {Object.entries(PAYMENT_CHANNEL_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Btn onClick={add} disabled={busy || !name.trim()}>{busy ? 'Creando...' : 'Crear canal'}</Btn>
        </div>
        {error && <p className="text-rose-600 text-sm font-bold mt-3">{error}</p>}
      </Card>

      <div className="flex flex-col gap-4">
        {paymentChannels.map(c => (
          <ChannelRow key={c.id} channel={c} onSave={savePaymentChannel} />
        ))}
      </div>
    </div>
  );
};
