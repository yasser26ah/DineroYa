// ============================================================================
// DineroYa — Configuración y utilidades de datos
// ============================================================================
import React, { useState } from 'react';
import { Settings as SettingsIcon, Download, Database, Upload, Cloud, CheckCircle2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Card, PageHeader, Btn, Field, inputCls } from '../components/ui';
import { fmtMoney } from '../lib/format';
import { isSupabaseConfigured } from '../services/dataAdapter';

const OLD_KEYS = ['db_clients', 'db_loans', 'db_payments'];

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, clients, loans, installments, payments, activities } = useData();
  const { isSupabase } = useAuth();
  const [saved, setSaved] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await updateSettings({
      companyName: String(fd.get('companyName') ?? '').trim() || 'FinanzaPro',
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
    <div className="flex flex-col gap-8 max-w-4xl">
      <PageHeader title="Configuración" subtitle="Parámetros del negocio y utilidades de datos" />

      <Card className="p-8">
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

      <Card className="p-8">
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
          {!isSupabase && (
            <Btn variant="secondary" onClick={importLegacy} className="flex items-center gap-2">
              <Upload className="w-4 h-4" /> Recuperar datos versión anterior
            </Btn>
          )}
        </div>
        {importMsg && (
          <div className="mt-5 bg-sky-50 text-sky-700 text-sm font-medium p-4 rounded-2xl">{importMsg}</div>
        )}
      </Card>

      <Card className="p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className={`p-3 rounded-2xl ${isSupabase ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">
              {isSupabase ? 'Conectado a Supabase' : 'Modo local (sin backend)'}
            </h3>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              {isSupabase ? 'Multiusuario con autenticación y auditoría en la nube' : 'Los datos viven solo en este navegador'}
            </p>
          </div>
        </div>

        {!isSupabase && (
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
    </div>
  );
};
