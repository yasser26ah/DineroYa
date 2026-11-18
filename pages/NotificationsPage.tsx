// ============================================================================
// DineroYa — Centro de notificaciones y automatización (WhatsApp y correo)
// ============================================================================
import React, { useMemo, useState } from 'react';
import { Bell, Check, Copy, Mail, MessageCircle, Sparkles, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Btn, Card, EmptyState, Field, PageHeader, StatusBadge, inputCls } from '../components/ui';
import { fmtDate, fmtMoney, todayISO, waLink } from '../lib/format';
import {
  NOTIFICATION_CHANNEL_LABELS, NOTIFICATION_STATUS_LABELS, AppNotification, NotificationTemplate,
} from '../types';

const fillTemplate = (body: string, ctx: Record<string, string>) =>
  body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => ctx[key] ?? '');

const statusStyle = (s: AppNotification['status']) =>
  s === 'sent' ? 'bg-emerald-100 text-emerald-700'
    : s === 'cancelled' ? 'bg-slate-200 text-slate-500'
      : 'bg-amber-100 text-amber-700';

// ---------------------------------------------------------------------------
// Editor de plantilla
// ---------------------------------------------------------------------------
const TemplateCard: React.FC<{ template: NotificationTemplate; onSave: (t: NotificationTemplate) => Promise<unknown> }> = ({ template, onSave }) => {
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body);
  const [subject, setSubject] = useState(template.subject ?? '');
  const [channel, setChannel] = useState(template.channel);
  const [active, setActive] = useState(template.active);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setSavedMsg(null);
    try {
      await onSave({ ...template, name: name.trim() || template.name, body, subject: subject.trim() || undefined, channel, active });
      setSavedMsg('Plantilla guardada');
    } catch (err: any) {
      setSavedMsg(err.message ?? 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <input value={name} onChange={e => setName(e.target.value)} className={`${inputCls} flex-1`} />
        <select value={channel} onChange={e => setChannel(e.target.value as NotificationTemplate['channel'])} className={inputCls}>
          <option value="whatsapp">WhatsApp</option>
          <option value="email">Correo</option>
        </select>
        <button
          type="button"
          onClick={() => setActive(v => !v)}
          className={`px-4 rounded-2xl text-[11px] font-black uppercase tracking-widest ${active ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
        >
          {active ? 'Activa' : 'Inactiva'}
        </button>
      </div>
      {channel === 'email' && (
        <Field label="Asunto">
          <input value={subject} onChange={e => setSubject(e.target.value)} className={inputCls} />
        </Field>
      )}
      <div className="mt-4">
        <Field label="Mensaje">
          <textarea rows={4} value={body} onChange={e => setBody(e.target.value)} className={inputCls} />
        </Field>
        <p className="text-[11px] text-slate-400 font-bold mt-2">
          Variables: {'{{cliente}} {{monto}} {{fecha}} {{cuota}} {{saldo}} {{empresa}}'}
        </p>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <Btn onClick={save} disabled={busy}>{busy ? 'Guardando...' : 'Guardar plantilla'}</Btn>
        {savedMsg && <span className="text-xs font-bold text-slate-500">{savedMsg}</span>}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
export const NotificationsPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const {
    notifications, notificationTemplates, clients, loans, installments, settings,
    createNotification, setNotificationStatus, saveNotificationTemplate,
  } = useData();
  const cur = settings.currency;

  const [tab, setTab] = useState<'inbox' | 'templates'>('inbox');
  const [filter, setFilter] = useState<'pending' | 'sent' | 'all'>('pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const clientOf = (n: AppNotification) => clients.find(c => c.id === n.clientId);

  const visible = useMemo(
    () => notifications
      .filter(n => filter === 'all' || n.status === filter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications, filter],
  );

  const pendingCount = notifications.filter(n => n.status === 'pending').length;

  /** Automatización: crea recordatorios para cuotas vencidas o que vencen en 3 días. */
  const generateReminders = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const limit = new Date();
      limit.setDate(limit.getDate() + 3);
      const limitISO = limit.toISOString().slice(0, 10);
      const templates = notificationTemplates.filter(t => t.active);
      const tplSoon = templates.find(t => t.id === 'recordatorio_cuota');
      const tplOverdue = templates.find(t => t.id === 'cuota_vencida');
      let created = 0;

      for (const loan of loans.filter(l => l.status === 'active' || l.status === 'overdue')) {
        const client = clients.find(c => c.id === loan.clientId);
        if (!client) continue;
        const pending = installments
          .filter(i => i.loanId === loan.id && i.status !== 'paid' && i.status !== 'waived')
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        const target = pending.find(i => i.dueDate <= limitISO);
        if (!target) continue;

        const isOverdue = target.dueDate < todayISO();
        const tpl = isOverdue ? tplOverdue : tplSoon;
        if (!tpl) continue;

        const dupe = notifications.some(n =>
          n.status === 'pending' && n.loanId === loan.id && n.templateId === tpl.id);
        if (dupe) continue;

        const saldo = pending.reduce((a, i) => a + (i.amountDue - i.amountPaid), 0);
        const body = fillTemplate(tpl.body, {
          cliente: client.name,
          monto: fmtMoney(target.amountDue - target.amountPaid, cur),
          fecha: fmtDate(target.dueDate),
          cuota: String(target.installmentNumber),
          saldo: fmtMoney(saldo, cur),
          empresa: settings.companyName,
        });
        await createNotification({
          clientId: client.id, loanId: loan.id, channel: tpl.channel,
          templateId: tpl.id, title: tpl.name, body,
        });
        created += 1;
      }
      setMsg(created
        ? `${created} recordatorio(s) nuevos en la bandeja.`
        : 'No hay cuotas por recordar (o ya estaban en la bandeja).');
    } catch (err: any) {
      setError(err.message ?? 'No se pudieron generar los recordatorios');
    } finally {
      setBusy(false);
    }
  };

  const send = async (n: AppNotification) => {
    const client = clientOf(n);
    if (!client) { setError('La notificación no tiene cliente asociado.'); return; }
    if (n.channel === 'whatsapp') {
      window.open(waLink(client.phone, n.body), '_blank');
    } else {
      const subject = encodeURIComponent(n.title);
      const body = encodeURIComponent(n.body);
      window.open(`mailto:${client.email ?? ''}?subject=${subject}&body=${body}`, '_blank');
    }
    await setNotificationStatus(n.id, 'sent');
  };

  return (
    <div className="flex flex-col gap-8">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900">Bandeja y plantillas</h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              {pendingCount} pendiente(s) de envío
            </p>
          </div>
          <Btn onClick={generateReminders} disabled={busy} className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> {busy ? 'Generando...' : 'Generar recordatorios'}
          </Btn>
        </div>
      ) : (
        <PageHeader
          title="Notificaciones"
          subtitle="Recordatorios automáticos por WhatsApp y correo, con registro de envíos"
          actions={
            <Btn onClick={generateReminders} disabled={busy} className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> {busy ? 'Generando...' : 'Generar recordatorios'}
            </Btn>
          }
        />
      )}

      {(error || msg) && (
        <div className={`p-4 rounded-2xl text-sm font-bold flex items-start gap-2 ${error ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
          {error ? <X className="w-4 h-4 mt-0.5 shrink-0" /> : <Check className="w-4 h-4 mt-0.5 shrink-0" />}
          {error ?? msg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {([['inbox', `Bandeja (${pendingCount})`], ['templates', `Plantillas (${notificationTemplates.length})`]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition ${tab === id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 border border-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'inbox' ? (
        <>
          <div className="flex flex-wrap gap-2">
            {(['pending', 'sent', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                {f === 'pending' ? 'Pendientes' : f === 'sent' ? 'Enviadas' : 'Todas'}
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={Bell} title="Nada por aquí" hint="Genera los recordatorios del día o cambia el filtro." />
          ) : (
            <div className="flex flex-col gap-3">
              {visible.map(n => {
                const client = clientOf(n);
                return (
                  <Card key={n.id} className="p-5" data-reveal>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <StatusBadge label={NOTIFICATION_STATUS_LABELS[n.status]} className={statusStyle(n.status)} />
                      <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg ${n.channel === 'whatsapp' ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600'}`}>
                        {NOTIFICATION_CHANNEL_LABELS[n.channel]}
                      </span>
                      <p className="font-black text-slate-800 text-sm">{client?.name ?? 'Cliente'}</p>
                      <p className="text-[11px] font-bold text-slate-400">{fmtDate(n.createdAt.slice(0, 10))}</p>
                      <p className="text-[11px] font-bold text-slate-400 ml-auto">{n.title}</p>
                    </div>
                    <p className="text-sm text-slate-600 font-medium whitespace-pre-line leading-relaxed">{n.body}</p>
                    {n.status === 'pending' && (
                      <div className="flex flex-wrap gap-2 mt-4">
                        <Btn
                          variant="success"
                          onClick={() => send(n)}
                          disabled={!client?.phone}
                          className="flex items-center gap-1.5"
                          title={client?.phone ? undefined : 'El cliente no tiene teléfono'}
                        >
                          {n.channel === 'whatsapp' ? <MessageCircle className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                          {n.channel === 'whatsapp' ? 'Abrir WhatsApp' : 'Abrir correo'}
                        </Btn>
                        <Btn variant="secondary" onClick={() => navigator.clipboard?.writeText(n.body)} className="flex items-center gap-1.5">
                          <Copy className="w-4 h-4" /> Copiar
                        </Btn>
                        <Btn variant="secondary" onClick={() => setNotificationStatus(n.id, 'cancelled')} className="flex items-center gap-1.5">
                          <X className="w-4 h-4" /> Descartar
                        </Btn>
                      </div>
                    )}
                    {n.sentAt && (
                      <p className="text-[11px] font-bold text-slate-400 mt-3">Enviada el {fmtDate(n.sentAt.slice(0, 10))}</p>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-4">
          {notificationTemplates.map(t => (
            <div key={t.id} data-reveal>
              <TemplateCard template={t} onSave={saveNotificationTemplate} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
