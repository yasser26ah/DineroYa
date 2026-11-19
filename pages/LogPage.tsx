// ============================================================================
// DineroYa — Log
// Antes "Auditoría de app": bitácora global de trazabilidad. Vive dentro de
// Configuración y conserva visor, filtros, detalle y exportación.
// ============================================================================
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollText, ChevronDown, ChevronUp, Download, AlertTriangle } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Card, PageHeader, EmptyState, SearchBar, Btn } from '../components/ui';
import { fmtDateTime } from '../lib/format';
import type { ServerError } from '../services/inputs';

const ENTITY_LABELS: Record<string, string> = {
  clients: 'Clientes',
  loans: 'Préstamos',
  installments: 'Cuotas',
  payments: 'Pagos',
  collection_activities: 'Gestiones',
  app_settings: 'Configuración',
  profiles: 'Equipo',
  system: 'Sistema',
};

const ACTION_STYLE: Record<string, string> = {
  INSERT: 'bg-emerald-100 text-emerald-700',
  UPDATE: 'bg-indigo-100 text-indigo-700',
  DELETE: 'bg-rose-100 text-rose-700',
  CANCEL: 'bg-amber-100 text-amber-700',
  ASSIGN: 'bg-sky-100 text-sky-700',
  VOID: 'bg-rose-100 text-rose-700',
  SEED: 'bg-slate-200 text-slate-600',
};

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const LogPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { auditEvents, listServerErrors } = useData();
  const [serverErrors, setServerErrors] = useState<ServerError[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [search, setSearch] = useState('');
  const [entity, setEntity] = useState('all');
  const [actor, setActor] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Diagnóstico del Worker: solo los administradores reciben la lista; para el
  // resto el servidor responde 403 y la sección simplemente no aparece.
  useEffect(() => {
    listServerErrors().then(setServerErrors).catch(() => setServerErrors([]));
  }, [listServerErrors]);

  const entities = [...new Set(auditEvents.map(e => e.entity))];
  const actors = [...new Set(auditEvents.map(e => e.actorName ?? 'Sistema'))];

  const visible = useMemo(() => {
    let list = auditEvents;
    if (entity !== 'all') list = list.filter(e => e.entity === entity);
    if (actor !== 'all') list = list.filter(e => (e.actorName ?? 'Sistema') === actor);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e => {
        if ((e.actorName ?? '').toLowerCase().includes(q)) return true;
        if (ENTITY_LABELS[e.entity]?.toLowerCase().includes(q)) return true;
        try {
          return JSON.stringify(e.details ?? {}).toLowerCase().includes(q);
        } catch {
          return false;
        }
      });
    }
    return list;
  }, [auditEvents, entity, actor, search]);

  const exportLog = () => {
    const rows = [
      ['Fecha', 'Entidad', 'Acción', 'Autor', 'Detalle'],
      ...visible.map(ev => [
        fmtDateTime(ev.createdAt),
        ENTITY_LABELS[ev.entity] ?? ev.entity,
        ev.action,
        ev.actorName ?? 'Sistema',
        JSON.stringify(ev.details ?? {}),
      ]),
    ];
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `log_dineroya_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-slate-900">Log</h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              Bitácora automática de la operación: quién hizo qué y cuándo
            </p>
          </div>
          <Btn variant="secondary" onClick={exportLog} className="flex items-center gap-2">
            <Download className="w-4 h-4" /> Exportar CSV
          </Btn>
        </div>
      ) : (
        <PageHeader
          title="Log"
          subtitle="Bitácora automática de toda la operación: quién hizo qué y cuándo"
          actions={
            <Btn variant="secondary" onClick={exportLog} className="flex items-center gap-2">
              <Download className="w-4 h-4" /> Exportar CSV
            </Btn>
          }
        />
      )}

      {serverErrors.length > 0 && (
        <div className="bg-rose-50 border border-rose-100 rounded-3xl p-5" data-reveal>
          <button
            onClick={() => setShowErrors(v => !v)}
            className="w-full flex items-center justify-between gap-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-black text-rose-700">
              <AlertTriangle className="w-4 h-4" />
              {serverErrors.length} error(es) recientes del servidor
            </span>
            {showErrors ? <ChevronUp className="w-4 h-4 text-rose-500" /> : <ChevronDown className="w-4 h-4 text-rose-500" />}
          </button>
          {showErrors && (
            <div className="flex flex-col gap-2 mt-4">
              {serverErrors.map(err => (
                <div key={err.id} className="bg-white/70 border border-rose-100 rounded-2xl px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-100 text-rose-700">{err.op}</span>
                    <span className="text-[11px] font-bold text-slate-400">{fmtDateTime(err.createdAt)}</span>
                  </div>
                  <p className="text-sm font-bold text-slate-700 mt-1 break-words">{err.message}</p>
                  {err.stack && (
                    <pre className="text-[10px] leading-relaxed text-slate-500 whitespace-pre-wrap break-all max-h-40 overflow-y-auto mt-2">{err.stack}</pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div data-reveal>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar en el log (autor, detalle, contenido JSON)..." />
      </div>

      <div className="flex flex-wrap gap-3" data-reveal>
        <select value={entity} onChange={e => setEntity(e.target.value)} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 font-bold text-sm text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="all">Todas las entidades</option>
          {entities.map(en => <option key={en} value={en}>{ENTITY_LABELS[en] ?? en}</option>)}
        </select>
        <select value={actor} onChange={e => setActor(e.target.value)} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 font-bold text-sm text-slate-600 outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="all">Todos los autores</option>
          {actors.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={ScrollText} title="Sin eventos" hint="No hay eventos que coincidan con los filtros aplicados." />
      ) : (
        <>
        {/* Móvil: tarjetas apiladas */}
        <div className="md:hidden flex flex-col gap-3">
          {visible.slice(0, 300).map(ev => (
            <div key={ev.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm" data-reveal>
              <button
                onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                className="w-full text-left p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${ACTION_STYLE[ev.action] ?? 'bg-slate-100 text-slate-600'}`}>{ev.action}</span>
                  <span className="text-[10px] font-bold text-slate-400">{fmtDateTime(ev.createdAt)}</span>
                </div>
                <p className="text-sm font-black text-slate-800 mt-2">{ENTITY_LABELS[ev.entity] ?? ev.entity}</p>
                <p className="text-xs font-bold text-slate-500">{ev.actorName ?? 'Sistema'}</p>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-2 flex items-center gap-1">
                  {expanded === ev.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Ver detalle
                </p>
              </button>
              {expanded === ev.id && (
                <div className="px-4 pb-4">
                  <pre className="text-[10px] leading-relaxed text-slate-600 whitespace-pre-wrap break-all max-h-60 overflow-y-auto bg-slate-50 rounded-xl p-3">
                    {JSON.stringify(ev.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop: tabla */}
        <Card className="overflow-hidden overflow-x-auto hidden md:block">
          <table className="w-full text-left min-w-[760px]">
            <thead className="bg-slate-50/80 border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entidad</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Acción</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Autor</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {visible.slice(0, 300).map(ev => (
                <React.Fragment key={ev.id}>
                  <tr className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-3.5 text-xs font-bold text-slate-500 whitespace-nowrap">{fmtDateTime(ev.createdAt)}</td>
                    <td className="px-6 py-3.5 text-xs font-black text-slate-700">{ENTITY_LABELS[ev.entity] ?? ev.entity}</td>
                    <td className="px-6 py-3.5">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${ACTION_STYLE[ev.action] ?? 'bg-slate-100 text-slate-600'}`}>{ev.action}</span>
                    </td>
                    <td className="px-6 py-3.5 text-xs font-bold text-slate-600">{ev.actorName ?? 'Sistema'}</td>
                    <td className="px-6 py-3.5">
                      <button
                        onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                        className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-1"
                      >
                        {expanded === ev.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        Ver
                      </button>
                    </td>
                  </tr>
                  {expanded === ev.id && (
                    <tr className="bg-slate-50/80">
                      <td colSpan={5} className="px-6 py-4">
                        <pre className="text-[11px] leading-relaxed text-slate-600 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
                          {JSON.stringify(ev.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
        </>
      )}
    </div>
  );
};
