// ============================================================================
// DineroYa — Cartera de Préstamos
// Seguimiento, trazabilidad y gestión de cobranza de préstamos.
// ============================================================================
import React, { useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { Btn, inputCls } from './components/ui';
import { DashboardPage } from './pages/DashboardPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { LoansPage } from './pages/LoansPage';
import { ClientsPage } from './pages/ClientsPage';
import { AuditPage } from './pages/AuditPage';
import { TeamPage } from './pages/TeamPage';
import { SettingsPage } from './pages/SettingsPage';

const ErrorBanner: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="mb-6 bg-rose-50 border border-rose-100 text-rose-700 p-4 rounded-2xl flex items-start justify-between gap-4">
    <div className="flex items-start gap-2">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <p className="text-sm font-bold">{message}</p>
    </div>
    <button onClick={onRetry} className="text-xs font-black uppercase tracking-widest hover:underline shrink-0">Reintentar</button>
  </div>
);

const ResetPasswordPage: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const { updatePassword, signOut } = useAuth();
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd !== pwd2) { setError('Las contraseñas no coinciden.'); return; }
    if (pwd.length < 6) { setError('La contraseña debe tener al menos 6 caracteres.'); return; }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(pwd);
      await signOut();
      onDone();
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo actualizar la contraseña');
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-6">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-[32px] shadow-2xl p-8 lg:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
              <KeyRound className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">Nueva contraseña</h2>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">CREA UNA CONTRASEÑA SEGURA</p>
            </div>
          </div>
          <form onSubmit={submit} className="flex flex-col gap-5">
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Nueva contraseña</label>
              <input type="password" required minLength={6} value={pwd} onChange={e => setPwd(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Repetir contraseña</label>
              <input type="password" required minLength={6} value={pwd2} onChange={e => setPwd2(e.target.value)} className={inputCls} />
            </div>
            {error && (
              <div className="bg-rose-50 text-rose-600 text-sm font-bold p-4 rounded-2xl flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}
            <Btn type="submit" disabled={busy} className="w-full">Guardar contraseña</Btn>
          </form>
        </div>
      </div>
    </div>
  );
};

const Shell: React.FC = () => {
  const { user, loading, isSupabase } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isResetFlow, setIsResetFlow] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    const hasResetFlag = params.get('reset') === '1' || params.has('error_description') || params.get('code') !== null;
    if (hasResetFlag) {
      window.history.replaceState({}, '', window.location.pathname);
      return true;
    }
    return false;
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="animate-pulse text-slate-400 font-black uppercase tracking-widest text-sm">Cargando FinanzaPro...</div>
      </div>
    );
  }

  // El enlace del email aterriza aquí con la sesión de recuperación activa:
  // el usuario define su nueva contraseña y vuelve al login.
  if (isResetFlow) return <ResetPasswordPage onDone={() => setIsResetFlow(false)} />;

  if (!user) return <LoginPage />;

  return (
    <DataProvider>
      <AppBody activeTab={activeTab} onNavigate={setActiveTab} isSupabase={isSupabase} />
    </DataProvider>
  );
};

const AppBody: React.FC<{ activeTab: string; onNavigate: (t: string) => void; isSupabase: boolean }> = ({ activeTab, onNavigate, isSupabase }) => {
  const { error, refresh, loading, clients, profiles } = useData();
  const { user } = useAuth();
  const firstLoad = loading && clients.length === 0;

  // Si la pestaña activa no está permitida por el rol, redirige a la primera permitida.
  const myProfile = profiles.find(p => p.id === user?.id);
  const allowed = myProfile?.screens;
  const effectiveTab = (allowed && allowed.length > 0 && !allowed.includes(activeTab))
    ? allowed[0]
    : activeTab;

  const page = (() => {
    switch (effectiveTab) {
      case 'collections': return <CollectionsPage />;
      case 'loans': return <LoansPage />;
      case 'clients': return <ClientsPage />;
      case 'audit': return <AuditPage />;
      case 'team': return <TeamPage />;
      case 'settings': return <SettingsPage />;
      default: return <DashboardPage onGoCollect={() => onNavigate('collections')} />;
    }
  })();

  return (
    <Layout active={effectiveTab} onNavigate={onNavigate}>
      <div className="pt-4 lg:pt-6">
        {error && <ErrorBanner message={error} onRetry={refresh} />}
        {firstLoad ? (
          <div className="py-24 text-center text-slate-400 font-black uppercase tracking-widest text-sm animate-pulse">Cargando datos...</div>
        ) : (
          page
        )}
      </div>
    </Layout>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <Shell />
  </AuthProvider>
);

export default App;
