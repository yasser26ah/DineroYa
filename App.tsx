// ============================================================================
// DineroYa — Cartera de Préstamos
// Seguimiento, trazabilidad y gestión de cobranza de préstamos.
// ============================================================================
import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
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

const Shell: React.FC = () => {
  const { user, loading, isSupabase } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC]">
        <div className="animate-pulse text-slate-400 font-black uppercase tracking-widest text-sm">Cargando FinanzaPro...</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <DataProvider>
      <AppBody activeTab={activeTab} onNavigate={setActiveTab} isSupabase={isSupabase} />
    </DataProvider>
  );
};

const AppBody: React.FC<{ activeTab: string; onNavigate: (t: string) => void; isSupabase: boolean }> = ({ activeTab, onNavigate, isSupabase }) => {
  const { error, refresh, loading, clients } = useData();
  const firstLoad = loading && clients.length === 0;

  const page = (() => {
    switch (activeTab) {
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
    <Layout active={activeTab} onNavigate={onNavigate}>
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
