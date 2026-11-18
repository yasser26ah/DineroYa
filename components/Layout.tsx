// ============================================================================
// DineroYa — Layout
// Navegación agrupada (Operación / Administración), iconos vivos con Anime.js,
// drawer móvil con física de resorte y Cerrar Sesión siempre a la vista.
// ============================================================================
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Activity, Menu, X, PieChart, Users, HandCoins, Settings, LogOut, HardDrive, Cloud,
  ClipboardList, Home, Banknote, BarChart3, Wallet, Bell, CreditCard, ScrollText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { UserRole } from '../types';
import { initials } from '../lib/format';
import { sameTarget } from '../lib/nav';
import type { NavTarget, TabId } from '../lib/nav';
import { AnimatedIcon, IconMotionKind } from './AnimatedIcon';
import { animateDrawer, fadeIn, prefersReducedMotion, revealSubitems } from '../lib/motion';

interface NavChild {
  id: string;
  label: string;
  icon: React.ElementType;
  target: NavTarget;
  roles?: UserRole[];
  badge?: number;
}

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ElementType;
  roles: UserRole[];
  kind?: IconMotionKind;
  children?: NavChild[];
}

const OPERACION: TabId[] = [
  'portal', 'dashboard', 'collections', 'loans', 'payments', 'clients', 'applications', 'reports',
];
const ADMINISTRACION: TabId[] = ['team', 'settings'];

const targetFor = (tab: TabId, current: NavTarget): NavTarget => {
  if (tab === 'collections') return { ...current, tab, collections: 'today' };
  if (tab === 'settings') return { ...current, tab, settings: 'general' };
  return { ...current, tab };
};

const subitemTarget = (child: NavChild, current: NavTarget): NavTarget => ({ ...current, ...child.target });

const MenuItem: React.FC<{
  item: NavItem;
  isActive: boolean;
  onNavigate: (target: NavTarget) => void;
  onClose: () => void;
  current: NavTarget;
}> = ({ item, isActive, onNavigate, onClose, current }) => {
  const childrenRef = useRef<HTMLDivElement>(null);
  const visibleChildren = item.children ?? [];

  useEffect(() => {
    if (!isActive) return;
    const animation = revealSubitems(childrenRef.current);
    return () => {
      animation?.revert();
    };
  }, [isActive]);

  const go = (target: NavTarget) => {
    onNavigate(target);
    onClose();
  };

  const badge = visibleChildren.reduce((total, child) => total + (child.badge ?? 0), 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => go(targetFor(item.id, current))}
        aria-current={isActive ? 'page' : undefined}
        className={`w-full flex items-center gap-4 px-5 py-3 rounded-2xl transition-colors font-bold text-sm ${
          isActive
            ? 'bg-indigo-600 shadow-lg shadow-indigo-600/20 text-white'
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }`}
      >
        <AnimatedIcon
          icon={item.icon}
          active={isActive}
          kind={item.kind}
          badge={item.kind === 'bell' ? badge : undefined}
          className="w-5 h-5"
        />
        <span className="truncate">{item.label}</span>
        {item.kind === 'bell' && badge > 0 && (
          <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
            {badge}
          </span>
        )}
      </button>

      {isActive && visibleChildren.length > 0 && (
        <div ref={childrenRef} className="mt-1 ml-5 pl-4 border-l border-slate-800 flex flex-col gap-0.5">
          {visibleChildren.map(child => (
            <button
              key={child.id}
              type="button"
              data-subitem
              onClick={() => go(subitemTarget(child, current))}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[12px] font-bold transition-colors ${
                sameTarget(current, subitemTarget(child, current))
                  ? 'text-white bg-slate-800'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <child.icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{child.label}</span>
              {typeof child.badge === 'number' && child.badge > 0 && (
                <span className="ml-auto min-w-4 h-4 px-1 rounded-full bg-rose-500/90 text-white text-[9px] font-black flex items-center justify-center">
                  {child.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export const Layout: React.FC<{
  active: TabId;
  activeTarget: NavTarget;
  onNavigate: (target: NavTarget) => void;
  children: React.ReactNode;
}> = ({ active, activeTarget, onNavigate, children }) => {
  const { user, signOut, mode } = useAuth();
  const { profiles, notifications } = useData();
  const [isOpen, setIsOpen] = useState(false);

  const asideRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const drawerReady = useRef(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );

  const pendingNotifications = notifications.filter(n => n.status === 'pending').length;
  const canManageChannels = user ? user.role === 'admin' || user.role === 'gerente' : false;

  const items: NavItem[] = [
    { id: 'portal', label: 'Mi portal', icon: Home, roles: ['cliente'] },
    { id: 'dashboard', label: 'Resumen global', icon: PieChart, roles: ['admin', 'gerente', 'cobrador'] },
    {
      id: 'collections',
      label: 'Cobranza del Día',
      icon: HandCoins,
      roles: ['admin', 'gerente', 'cobrador'],
      kind: 'bell',
      children: [
        { id: 'collections-today', label: 'Casos de hoy', icon: HandCoins, target: { tab: 'collections', collections: 'today', settings: 'general' } },
        {
          id: 'collections-notifications',
          label: 'Notificaciones',
          icon: Bell,
          badge: pendingNotifications,
          target: { tab: 'collections', collections: 'notifications', settings: 'general' },
        },
      ],
    },
    { id: 'loans', label: 'Préstamos', icon: Wallet, roles: ['admin', 'gerente', 'cobrador'] },
    { id: 'payments', label: 'Recaudos', icon: Banknote, roles: ['admin', 'gerente', 'cobrador'] },
    { id: 'clients', label: 'Clientes', icon: Users, roles: ['admin', 'gerente', 'cobrador'] },
    { id: 'applications', label: 'Solicitudes', icon: ClipboardList, roles: ['admin', 'gerente'] },
    { id: 'reports', label: 'Reportes', icon: BarChart3, roles: ['admin', 'gerente'] },
    { id: 'team', label: 'Equipo', icon: Users, roles: ['admin'] },
    {
      id: 'settings',
      label: 'Configuración',
      icon: Settings,
      roles: ['admin', 'gerente', 'cobrador'],
      kind: 'gear',
      children: [
        ...(canManageChannels
          ? [{
            id: 'settings-channels',
            label: 'Canales de pago',
            icon: CreditCard,
            target: { tab: 'settings', settings: 'channels', collections: 'today' } as NavTarget,
          }]
          : []),
        ...(canManageChannels
          ? [{
            id: 'settings-log',
            label: 'Log',
            icon: ScrollText,
            target: { tab: 'settings', settings: 'log', collections: 'today' } as NavTarget,
          }]
          : []),
      ],
    },
  ];

  // Pantallas permitidas: rol estándar o rol personalizado con screens.
  // "audit" era la pantalla del módulo anterior; ahora vive dentro de Configuración.
  const rawScreens = profiles.find(p => p.id === user?.id)?.screens;
  const allowedScreens = rawScreens && rawScreens.length > 0
    ? [...new Set(rawScreens.map(screen => (screen === 'audit' ? 'settings' : screen)))]
    : undefined;

  const canSee = (item: NavItem): boolean => {
    if (!user || !item.roles.includes(user.role)) return false;
    return !allowedScreens || allowedScreens.includes(item.id);
  };

  const visibleItems = items.filter(canSee);
  const groupItems = (ids: TabId[]) => ids.map(id => visibleItems.find(i => i.id === id)).filter((i): i is NavItem => Boolean(i));

  // Drawer móvil con resorte. El transform lo controla Anime.js: Tailwind v4
  // usa la propiedad `translate`, que se sumaría a nuestro `transform`.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useLayoutEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    if (isDesktop) {
      el.style.transform = '';
      drawerReady.current = false;
      return;
    }
    // Primer pintado: colocar sin animar para no ver el drawer abrirse solo.
    if (!drawerReady.current) {
      el.style.transform = isOpen ? 'translateX(0)' : 'translateX(-100%)';
      drawerReady.current = true;
      return;
    }
    const animation = animateDrawer(el, isOpen);
    return () => {
      animation?.pause();
    };
  }, [isOpen, isDesktop]);

  useEffect(() => {
    if (!isOpen || !overlayRef.current) return;
    if (prefersReducedMotion()) return;
    const animation = fadeIn(overlayRef.current);
    return () => {
      animation?.pause();
    };
  }, [isOpen]);

  const closeDrawer = () => setIsOpen(false);
  const navigate = (target: NavTarget) => onNavigate(target);

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* Sidebar / drawer */}
      <aside
        ref={asideRef}
        className="fixed inset-y-0 left-0 z-50 w-72 bg-[#0F172A] flex flex-col p-6 lg:p-8 text-white lg:static"
      >
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
              <Activity className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-black tracking-tight truncate">DineroYa</h1>
          </div>
          <button onClick={closeDrawer} className="lg:hidden p-1" aria-label="Cerrar menú">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex flex-col gap-6 overflow-y-auto -mx-2 px-2 pb-4">
          {([
            { label: 'Operación', ids: OPERACION },
            { label: 'Administración', ids: ADMINISTRACION },
          ] as const).map(group => {
            const groupList = groupItems([...group.ids]);
            if (groupList.length === 0) return null;
            return (
              <div key={group.label}>
                <p className="px-5 pb-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">{group.label}</p>
                <div className="flex flex-col gap-1">
                  {groupList.map(item => (
                    <MenuItem
                      key={item.id}
                      item={item}
                      isActive={active === item.id}
                      onNavigate={navigate}
                      onClose={closeDrawer}
                      current={activeTarget}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Pie fijo: usuario + Cerrar Sesión siempre visible */}
        <div className="mt-auto pt-5 border-t border-slate-800 space-y-3 shrink-0">
          <div className="flex items-center gap-3 px-2">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center font-black text-xs shrink-0">
              {user ? initials(user.fullName) : '·'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black truncate">{user?.fullName}</p>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">
                {mode === 'local' ? <HardDrive className="w-3 h-3" /> : <Cloud className="w-3 h-3" />}
                {mode === 'supabase' ? 'Supabase' : mode === 'api' ? 'Freebuff' : 'Modo local'}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 transition font-black text-[11px] uppercase tracking-widest"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Overlay móvil */}
      {isOpen && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <main className="flex-1 overflow-y-auto min-w-0">
        {/* Cabecera móvil: salir siempre a un toque, sin submenús */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-black text-slate-900 truncate">DineroYa</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest active:scale-95 transition-transform"
              aria-label="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" /> Salir
            </button>
            <button
              onClick={() => setIsOpen(true)}
              className="p-2 bg-slate-100 rounded-lg"
              aria-label="Abrir menú"
            >
              <Menu className="w-6 h-6 text-slate-600" />
            </button>
          </div>
        </header>

        <div className="p-4 lg:p-10 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
};

