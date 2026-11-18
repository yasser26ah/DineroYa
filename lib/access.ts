// ============================================================================
// DineroYa — Acceso por rol
// Fuente única de verdad de qué pantallas ve cada rol y cómo se resuelve la
// pestaña efectiva. Sin React: se puede probar de forma aislada.
// ============================================================================
import type { TabId } from './nav';
import type { UserRole } from '../types';

export const SCREEN_IDS: TabId[] = [
  'portal', 'dashboard', 'collections', 'loans', 'payments',
  'reports', 'clients', 'applications', 'team', 'settings',
];

/** Roles que pueden ver cada pantalla. */
export const SCREEN_ROLES: Record<TabId, UserRole[]> = {
  portal: ['cliente'],
  dashboard: ['admin', 'gerente', 'cobrador'],
  collections: ['admin', 'gerente', 'cobrador'],
  loans: ['admin', 'gerente', 'cobrador'],
  payments: ['admin', 'gerente', 'cobrador'],
  clients: ['admin', 'gerente', 'cobrador'],
  reports: ['admin', 'gerente'],
  applications: ['admin', 'gerente'],
  team: ['admin'],
  settings: ['admin', 'gerente', 'cobrador'],
};

/** "audit" era la pantalla de Auditoría; hoy Log vive dentro de Configuración. */
const LEGACY_SCREEN_ALIASES: Record<string, TabId> = {
  audit: 'settings',
};

const isScreenId = (id: string): id is TabId => (SCREEN_IDS as string[]).includes(id);

/**
 * Pantallas permitidas de un rol personalizado.
 * `undefined` significa "sin restricción": manda el rol estándar.
 */
export function allowedScreensFor(screens?: string[] | null): TabId[] | undefined {
  if (!screens || screens.length === 0) return undefined;
  const normalized = screens.map(screen => LEGACY_SCREEN_ALIASES[screen] ?? screen).filter(isScreenId);
  const unique = [...new Set(normalized)];
  return unique.length > 0 ? unique : undefined;
}

/** ¿Este rol (y su lista de pantallas, si la tiene) puede abrir la pantalla? */
export function canAccessScreen(
  screen: TabId,
  role: UserRole | null | undefined,
  screens?: string[] | null,
): boolean {
  if (!role || !SCREEN_ROLES[screen]?.includes(role)) return false;
  const allowed = allowedScreensFor(screens);
  return !allowed || allowed.includes(screen);
}

/**
 * Pestaña efectiva: el cliente siempre cae en su portal y, si el rol no puede
 * abrir lo pedido, se usa la primera pantalla permitida (nunca una en blanco).
 */
export function resolveTab(
  requested: TabId,
  role: UserRole | null | undefined,
  screens?: string[] | null,
): TabId {
  if (role === 'cliente') return 'portal';
  if (canAccessScreen(requested, role, screens)) return requested;
  const candidates = allowedScreensFor(screens) ?? SCREEN_IDS;
  return candidates.find(screen => canAccessScreen(screen, role, screens)) ?? 'dashboard';
}
