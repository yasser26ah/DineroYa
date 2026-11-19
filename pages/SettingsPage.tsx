// ============================================================================
// DineroYa — Configuración
// Hub de ajustes: parámetros del negocio, Canales de pago, Log y datos.
// Canales de pago y Log dejaron de ser secciones del menú principal: viven
// aquí, con todas sus funciones originales intactas.
// ============================================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Settings as SettingsIcon, Download, Database, Upload, Cloud, CheckCircle2, CreditCard, LogOut, History, RotateCcw } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../components/ui';
import { SectionTabs } from '../components/SectionTabs';
import { ChannelsPage } from './ChannelsPage';
import { LogPage } from './LogPage';
import { useReveal } from '../lib/motion';
import { SettingsSection } from '../lib/nav';
import { PaymentMethodOption } from '../types';
import { fmtDateTime } from '../lib/format';
import type { BackupInfo } from '../services/inputs';

const BACKUP_KIND_LABEL: Record<string, string> = {
  auto: 'Automático',
  'before-import': 'Antes de importar',
  'pre-restore': 'Antes de restaurar',
};

const OLD_KEYS = ['db_clients', 'db_loans', 'db_payments'];

/** Fila editable de un método de pago: renombrar y activar/desactivar. */
const PaymentMethodRow: React.FC<{
  method: PaymentMethodOption;
  onSave: (input: { id?: string; name: string; active?: boolean }) => Promise<PaymentMethodOption>;
}> = ({ method, onSave }) => {
  const [name, setName] = useState(method.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch?: { active?: boolean }) => {
    setBusy(true);
    setError(null);
    try {
      const finalName = name.trim() || method.name;
      await onSave({ id: method.id, name: finalName, ...patch });
      setName(finalName);
    } catch (err: any) {
      setError(err.message ?? 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <input value={name} onChange={e => setName(e.target.value)} className={`${inputCls} flex-1`} />
        <Btn onClick={() => save()} disabled={busy || name.trim() === method.name} className="shrink-0">Guardar</Btn>
        <Btn
          variant={method.active ? 'secondary' : 'success'}
          onClick={() => save({ active: !method.active })}
          disabled={busy}
          className="shrink-0"
        >
          {method.active ? 'Desactivar' : 'Activar'}
        </Btn>
      </div>
      {!method.active && (
        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">
          Desactivado: no aparece al registrar pagos
        </p>
      )}
      {error && <p className="text-rose-600 text-xs font-bold">{error}</p>}
    </div>
  );
};

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'channels', label: 'Canales de pago' },
  { id: 'log', label: 'Log' },
  { id: 'data', label: 'Datos y respaldo' },
];

export const SettingsPage: React.FC<{
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}> = ({ section, onSectionChange }) => {
  const {
    settings, updateSettings, clients, loans, installments, payments, activities,
    paymentMethods, savePaymentMethod, importBackup, listBackups, restoreBackup,
  } = useData();
  const { isSupabase, mode, signOut } = useAuth();
  const [saved, setSaved] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [newMethod, setNewMethod] = useState('');
  const [methodError, setMethodError] = useState<string | null>(null);
  const [methodBusy, setMethodBusy] = useState(false);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backupsBusy, setBackupsBusy] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const revealRef = useReveal([section]);

  // Los respaldos viven en el servidor: solo se consultan al abrir la sección.
  useEffect(() => {
    if (section !== 'data' || mode !== 'api') return;
    let active = true;
    setBackupsBusy(true);
    listBackups()
      .then(list => { if (active) { setBackups(list); setBackupsError(null); } })
      .catch((err: any) => { if (active) setBackupsError(err?.message ?? 'No se pudieron cargar los respaldos'); })
      .finally(() => { if (active) setBackupsBusy(false); });
    return () => { active = false; };
  }, [section, mode, listBackups, restoringId]);

  const restore = useCallback(async (id: number) => {
    if (!window.confirm('Se reemplazarán todos los datos actuales por esta copia. ¿Continuar?')) return;
    setRestoringId(id);
    setBackupsError(null);
    setImportMsg(null);
    try {
      await restoreBackup(id);
      setImportMsg('Respaldo restaurado. Los datos volvieron al estado de la copia elegida.');
    } catch (err: any) {
      setBackupsError(err?.message ?? 'No se pudo restaurar el respaldo');
    } finally {
      setRestoringId(null);
    }
  }, [restoreBackup]);

  const addMethod = async () => {
    setMethodBusy(true);
    setMethodError(null);
    try {
      await savePaymentMethod({ name: newMethod });
      setNewMethod('');
    } catch (err: any) {
      setMethodError(err.message ?? 'No se pudo crear el método de pago');
    } finally {
      setMethodBusy(false);
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await updateSettings({
      companyName: String(fd.get('companyName') ?? '').trim() || 'DineroYa',
      currency: String(fd.get('currency') ?? '$').trim() || '$',
      defaultInterestRate: Number(fd.get('rate') ?? 15),
      moraRate: Math.max(0, Number(fd.get('moraRate') ?? 0)),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const exportData = () => {
    const data = { clients, loans, installments, payments, activities, settings, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_finanzapro_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const [importBusy, setImportBusy] = useState(false);

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportBusy(true);
    setImportMsg(null);
    try {
      const parsed = JSON.parse(await file.text());
      await importBackup(parsed);
      setImportMsg('Respaldo importado correctamente.');
    } catch (err: any) {
      setImportMsg(err?.message ?? 'No se pudo importar el respaldo.');
    } finally {
      setImportBusy(false);
      e.target.value = '';
    }
  };

  const importLegacy = () => {
    try {
      const raw = OLD_KEYS.map(k => ({ k, v: localStorage.getItem(k) })).filter(x => x.v);
      if (raw.length === 0) {
        setImportMsg('No se encontraron datos antiguos en este navegador.');
        return;
      }
      const parsed = Object.fromEntries(raw.map(x => [x.k, JSON.parse(x.v!)]));
      const blob = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `datos_version_anterior_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setImportMsg(`Se exportaron los datos de la versión anterior (${parsed.db_clients?.length ?? 0} clientes, ${parsed.db_loans?.length ?? 0} préstamos). Descarga el archivo y compártelo para planificar la migración a Supabase.`);
    } catch {
      setImportMsg('No se pudieron leer los datos antiguos.');
    }
  };

  return (
    <div
      ref={revealRef}
      className={`flex flex-col gap-8 ${section === 'log' ? 'max-w-6xl' : 'max-w-4xl'}`}
    >
      <PageHeader
        title="Configuración"
        subtitle="Parámetros del negocio, canales de pago, log de actividad y datos"
      />

      <SectionTabs
        tabs={SECTIONS}
        value={section}
        onChange={onSectionChange}
        label="Secciones de configuración"
      />

      {section === 'general' && (
        <>
          <Card className="p-8" data-reveal>
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl"><SettingsIcon className="w-6 h-6" /></div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Parámetros del negocio</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Se aplican a los nuevos préstamos</p>
              </div>
            </div>

            <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
              <Field label="Nombre de la financiera">
                <input name="companyName" defaultValue={settings.companyName} className={inputCls} />
              </Field>
              <Field label="Símbolo de moneda">
                <input name="currency" defaultValue={settings.currency} className={inputCls} />
              </Field>
              <Field label="Interés base (%)">
                <input name="rate" type="number" min="0" step="0.1" defaultValue={settings.defaultInterestRate} className={inputCls} />
              </Field>
              <Field label="Mora mensual (% sobre saldo vencido)">
                <input
                  name="moraRate" type="number" min="0" step="0.1"
                  defaultValue={settings.moraRate ?? 0}
                  className={inputCls}
                />
                <p className="text-[10px] text-slate-400 font-bold mt-1 leading-relaxed">
                  Se cobra proporcional a los días vencidos. 0 = sin mora. Ej: 5% → $1.000 vencido 15 días genera $25.
                </p>
              </Field>
              <div className="md:col-span-3 flex items-center gap-4">
                <Btn type="submit">Guardar cambios</Btn>
                {saved && (
                  <span className="text-emerald-600 text-sm font-black uppercase tracking-widest flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Guardado
                  </span>
                )}
              </div>
            </form>
          </Card>

          <Card className="p-8" data-reveal>
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><CreditCard className="w-6 h-6" /></div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Métodos de pago</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                  Cambia el nombre o agrega los que uses (Nequi, Daviplata, banco...)
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {paymentMethods.map(m => (
                <PaymentMethodRow key={m.id} method={m} onSave={savePaymentMethod} />
              ))}
            </div>

            <div className="flex flex-col md:flex-row gap-3 mt-6">
              <input
                value={newMethod}
                onChange={e => setNewMethod(e.target.value)}
                className={inputCls}
                placeholder="Nuevo método (ej. Nequi)"
              />
              <Btn onClick={addMethod} disabled={methodBusy || !newMethod.trim()} className="shrink-0">
                {methodBusy ? 'Agregando...' : 'Agregar método'}
              </Btn>
            </div>
            {methodError && <p className="text-rose-600 text-sm font-bold mt-3">{methodError}</p>}
          </Card>
        </>
      )}

      {section === 'channels' && <ChannelsPage embedded />}

      {section === 'log' && <LogPage embedded />}

      {section === 'data' && (
        <>
          <Card className="p-8" data-reveal>
            <div className="flex items-center gap-4 mb-8">
              <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl"><Database className="w-6 h-6" /></div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Datos y respaldo</h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                  {clients.length} clientes · {loans.length} préstamos · {installments.length} cuotas · {payments.length} pagos · {activities.length} gestiones
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Btn variant="secondary" onClick={exportData} className="flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar backup JSON
              </Btn>
              {mode === 'local' && (
                <Btn variant="secondary" onClick={importLegacy} className="flex items-center gap-2">
                  <Upload className="w-4 h-4" /> Recuperar datos versión anterior
                </Btn>
              )}
              {mode === 'api' && clients.length === 0 && (
                <label className={`cursor-pointer inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-sm bg-slate-100 text-slate-700 hover:bg-slate-200 transition ${importBusy ? 'opacity-60 pointer-events-none' : ''}`}>
                  <Upload className="w-4 h-4" /> {importBusy ? 'Importando...' : 'Importar respaldo JSON'}
                  <input type="file" accept="application/json,.json" onChange={importFile} className="hidden" />
                </label>
              )}
            </div>
            {importMsg && (
              <div className="mt-5 bg-sky-50 text-sky-700 text-sm font-medium p-4 rounded-2xl">{importMsg}</div>
            )}
          </Card>

          {mode === 'api' && (
            <Card className="p-8" data-reveal>
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-sky-50 text-sky-600 rounded-2xl"><History className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Respaldos automáticos</h3>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                    Copias del servidor · se conservan las últimas 40
                  </p>
                </div>
              </div>

              <p className="text-sm text-slate-500 font-medium leading-relaxed mb-5">
                Se guarda una copia del estado <span className="font-bold">anterior</span> a los cambios: una cada
                6 horas de actividad y siempre antes de importar o restaurar un respaldo. Restaurar reemplaza los
                datos actuales, pero antes guarda una copia de lo que había, así que también puedes deshacerlo.
              </p>

              {backupsBusy && backups.length === 0 && (
                <p className="text-sm font-bold text-slate-400">Cargando respaldos...</p>
              )}

              {!backupsBusy && backups.length === 0 && !backupsError && (
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-medium text-slate-600">
                  Aún no hay copias. La primera se crea en cuanto se guarde un cambio.
                </div>
              )}

              <div className="flex flex-col gap-2">
                {backups.map(b => (
                  <div
                    key={b.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-800">{fmtDateTime(b.createdAt)}</p>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                        {BACKUP_KIND_LABEL[b.kind] ?? b.kind} · rev {b.rev} · {Math.max(1, Math.round(b.size / 1024))} KB
                      </p>
                    </div>
                    <Btn
                      variant="secondary"
                      onClick={() => restore(b.id)}
                      disabled={restoringId !== null}
                      className="shrink-0 flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      {restoringId === b.id ? 'Restaurando...' : 'Restaurar'}
                    </Btn>
                  </div>
                ))}
              </div>

              {backupsError && <p className="text-rose-600 text-sm font-bold mt-4">{backupsError}</p>}
            </Card>
          )}

          <Card className="p-6" data-reveal>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl shrink-0">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-black text-slate-900">Cerrar sesión</h3>
                <p className="text-slate-400 text-[11px] font-bold">
                  Sal del panel en este dispositivo. Tus datos quedan guardados.
                </p>
              </div>
              <Btn variant="secondary" onClick={signOut} className="w-full sm:w-auto flex items-center justify-center gap-2 shrink-0">
                <LogOut className="w-4 h-4" /> Cerrar sesión
              </Btn>
            </div>
          </Card>

          <Card className="p-8" data-reveal>
            <div className="flex items-center gap-4 mb-6">
              <div className={`p-3 rounded-2xl ${mode === 'local' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <Cloud className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  {mode === 'api' ? 'Conectado a la nube' : isSupabase ? 'Conectado a Supabase' : 'Modo local (sin backend)'}
                </h3>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                  {mode === 'api'
                    ? 'Datos en D1 con login de Google y permisos por rol'
                    : isSupabase ? 'Multiusuario con autenticación y log en la nube' : 'Los datos viven solo en este navegador'}
                </p>
              </div>
            </div>

            {mode === 'api' && (
              <div className="bg-emerald-50 rounded-3xl p-5 border border-emerald-100 text-sm text-emerald-800 font-medium leading-relaxed">
                El equipo entra con su cuenta de Google desde la pantalla de acceso. Asigna roles, permisos y la ficha de cliente de cada persona en <span className="font-bold">Equipo</span>.
              </div>
            )}

            {mode === 'local' && (
              <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 text-sm text-slate-600 font-medium leading-relaxed">
                <p className="font-black text-slate-800 mb-2">Para activar el modo multiusuario:</p>
                <ol className="list-decimal ml-5 space-y-1.5">
                  <li>Crea un proyecto gratuito en <span className="font-bold">supabase.com</span>.</li>
                  <li>Abre el <span className="font-bold">SQL Editor</span> y ejecuta el contenido completo de <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-xs">schema.sql</code>.</li>
                  <li>En Settings → API copia la <span className="font-bold">URL</span> y la <span className="font-bold">anon key</span>.</li>
                  <li>Crea un archivo <code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-xs">.env.local</code> en la raíz con:
                    <pre className="bg-white border border-slate-200 rounded-xl p-3 mt-2 text-xs font-mono overflow-x-auto">VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co{"\n"}VITE_SUPABASE_ANON_KEY=TU_ANON_KEY</pre>
                  </li>
                  <li>Reinicia la app (<code className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-xs">npm run dev</code>) y regístrate: el primer usuario será administrador.</li>
                </ol>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
