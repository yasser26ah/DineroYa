// ============================================================================
// DineroYa — Layout con navegación por rol
// ============================================================================
import React, { useState } from 'react';
import {
  Activity, Menu, X, PieChart, Users, Wallet, HandCoins, ScrollText, Settings, LogOut, HardDrive, Cloud,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { UserRole } from '../types';
import { initials } from '../lib/format';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Resumen Global', icon: PieChart, roles: ['admin', 'gerente', 'cobrador'] },
  { id: 'collections', label: 'Cobranza del Día', icon: HandCoins, roles: ['admin', 'gerente', 'cobrador'] },
  { id: 'loans', label: 'Préstamos', icon: Wallet, roles: ['admin', 'gerente', 'cobrador'] },
  { id: 'clients', label: 'Clientes', icon: Users, roles: ['admin', 'gerente', 'cobrador'] },
  { id: 'audit', label: 'Auditoría', icon: ScrollText, roles: ['admin', 'gerente'] },
  { id: 'team', label: 'Equipo', icon: Users, roles: ['admin'] },
  { id: 'settings', label: 'Configuración', icon: Settings, roles: ['admin', 'gerente', 'cobrador'] },
];

export const Layout: React.FC<{
  active: string; onNavigate: (id: string) => void; children: React.ReactNode;
}> = ({ active, onNavigate, children }) => {
  const { user, signOut, mode } = useAuth();
  const { profiles } = useData();
  const [isOpen, setIsOpen] = useState(false);

  // Pantallas permitidas: rol admin ve todo; si hay rol personalizado con
  // screens definidas, se respeta esa lista.
  const myProfile = profiles.find(p => p.id === user?.id);
  const allowedScreens = myProfile?.screens;
  const items = NAV_ITEMS.filter(i =>
    user && i.roles.includes(user.role) &&
    (!allowedScreens || allowedScreens.length === 0 || allowedScreens.includes(i.id))
  );

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* Sidebar desktop */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0F172A] flex flex-col p-6 lg:p-8 text-white transition-transform duration-300 lg:translate-x-0 lg:static ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-black tracking-tight truncate">FinanzaPro</h1>
          </div>
          <button onClick={() => setIsOpen(false)} className="lg:hidden"><X className="w-6 h-6" /></button>
        </div>

        <nav className="flex flex-col gap-1.5">
          {items.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); setIsOpen(false); }}
              className={`flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all font-bold text-sm ${
                active === item.id
                  ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800 space-y-3">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-black text-xs">
              {user ? initials(user.fullName) : '·'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black truncate">{user?.fullName}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                {mode === 'supabase' ? <Cloud className="w-3 h-3" /> : <HardDrive className="w-3 h-3" />}
                {mode === 'supabase' ? 'Supabase' : 'Modo local'}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-2 text-rose-400 hover:text-rose-300 transition font-bold text-xs uppercase tracking-widest w-full"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Overlay móvil */}
      {isOpen && <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setIsOpen(false)} />}

      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Cabecera móvil */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-black text-slate-900">FinanzaPro</h1>
          </div>
          <button onClick={() => setIsOpen(true)} className="p-2 bg-slate-100 rounded-lg">
            <Menu className="w-6 h-6 text-slate-600" />
          </button>
        </header>

        <div className="p-4 lg:p-10 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
};
