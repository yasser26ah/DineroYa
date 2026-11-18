// ============================================================================
// DineroYa — Modelo de navegación
// Una sola fuente de verdad para pestañas, subsecciones, títulos y rutas.
// Las rutas heredadas (Notificaciones, Caja, Canales, Auditoría) se resuelven
// aquí, para que ningún enlace viejo rompa al cambiar la jerarquía.
// ============================================================================

export type TabId =
  | 'portal'
  | 'dashboard'
  | 'collections'
  | 'loans'
  | 'payments'
  | 'reports'
  | 'clients'
  | 'applications'
  | 'team'
  | 'settings';

export type SettingsSection = 'general' | 'channels' | 'log' | 'data';
export type CollectionsSection = 'today' | 'notifications';

export interface NavTarget {
  tab: TabId;
  settings: SettingsSection;
  collections: CollectionsSection;
}

export const DEFAULT_TARGET: NavTarget = {
  tab: 'dashboard',
  settings: 'general',
  collections: 'today',
};

/**
 * Rutas que existieron antes del refactor. Se mantienen permanentemente para
 * no romper marcadores, enlaces compartidos ni historial del navegador.
 */
export const LEGACY_TABS: Record<string, Partial<NavTarget>> = {
  notifications: { tab: 'collections', collections: 'notifications' },
  notificaciones: { tab: 'collections', collections: 'notifications' },
  cash: { tab: 'dashboard' },
  caja: { tab: 'dashboard' },
  channels: { tab: 'settings', settings: 'channels' },
  'canales-de-pago': { tab: 'settings', settings: 'channels' },
  canales: { tab: 'settings', settings: 'channels' },
  audit: { tab: 'settings', settings: 'log' },
  auditoria: { tab: 'settings', settings: 'log' },
  log: { tab: 'settings', settings: 'log' },
};

const TAB_SLUGS: Record<TabId, string> = {
  portal: 'portal',
  dashboard: 'resumen',
  collections: 'cobranza',
  loans: 'prestamos',
  payments: 'recaudos',
  reports: 'reportes',
  clients: 'clientes',
  applications: 'solicitudes',
  team: 'equipo',
  settings: 'configuracion',
};

const TAB_BY_SLUG: Record<string, TabId> = Object.entries(TAB_SLUGS).reduce(
  (acc, [id, slug]) => ({ ...acc, [slug]: id as TabId, [id]: id as TabId }),
  {} as Record<string, TabId>,
);

const SETTINGS_SLUGS: Record<SettingsSection, string> = {
  general: '',
  channels: 'canales-de-pago',
  log: 'log',
  data: 'datos',
};

const SETTINGS_BY_SLUG: Record<string, SettingsSection> = {
  general: 'general',
  'canales-de-pago': 'channels',
  canales: 'channels',
  log: 'log',
  auditoria: 'log',
  datos: 'data',
};

export const TAB_LABELS: Record<TabId, string> = {
  portal: 'Mi portal',
  dashboard: 'Resumen global',
  collections: 'Cobranza del Día',
  loans: 'Préstamos',
  payments: 'Recaudos',
  reports: 'Reportes',
  clients: 'Clientes',
  applications: 'Solicitudes',
  team: 'Equipo',
  settings: 'Configuración',
};

/** Ruta canónica de un destino (hash estable y compartible). */
export function targetToHash(target: NavTarget): string {
  const base = `#/${TAB_SLUGS[target.tab]}`;
  if (target.tab === 'collections' && target.collections === 'notifications') return `${base}/notificaciones`;
  if (target.tab === 'settings') {
    const slug = SETTINGS_SLUGS[target.settings];
    return slug ? `${base}/${slug}` : base;
  }
  return base;
}

/** Resuelve cualquier hash —actual o heredado— a un destino válido. */
export function targetFromHash(hash: string): NavTarget {
  const clean = (hash || '')
    .replace(/^#/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  if (!clean) return DEFAULT_TARGET;

  const [first, second] = clean.split('/');

  const legacy = LEGACY_TABS[first];
  if (legacy) return { ...DEFAULT_TARGET, ...legacy };

  const tab = TAB_BY_SLUG[first];
  if (!tab) return DEFAULT_TARGET;

  const target: NavTarget = { ...DEFAULT_TARGET, tab };
  if (tab === 'collections' && second === 'notificaciones') target.collections = 'notifications';
  if (tab === 'settings' && second) target.settings = SETTINGS_BY_SLUG[second] ?? 'general';
  return target;
}

/** ¿El hash entrante apunta a una ruta que ya no existe con ese nombre? */
export function isLegacyRoute(hash: string): boolean {
  const first = (hash || '').replace(/^#/, '').replace(/^\/+/, '').toLowerCase().split('/')[0];
  return Boolean(first && LEGACY_TABS[first]);
}

export const sameTarget = (a: NavTarget, b: NavTarget): boolean =>
  a.tab === b.tab &&
  (a.tab !== 'settings' || a.settings === b.settings) &&
  (a.tab !== 'collections' || a.collections === b.collections);
