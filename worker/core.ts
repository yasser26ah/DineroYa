// ============================================================================
// DineroYa — Núcleo del servidor (estado en D1 + reglas de permisos)
// ============================================================================
import type { FreebuffUser } from '@freebuff/auth';
import { LocalDataAdapter, createMemoryStorage, setStorageBackend } from '../services/localAdapter';
import type { Profile } from '../types';
import type { AuthUser } from '../services/inputs';

// --- Tipos mínimos de D1 (sin dependencias extra) ---------------------------
export interface D1Result { success: boolean; meta?: { changes?: number } }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
}
export interface D1Database { prepare(query: string): D1PreparedStatement }

export interface Env {
  DB: D1Database;
  ASSETS: { fetch(request: Request): Promise<Response> };
  FREEBUFF_CLIENT_ID: string;
  FREEBUFF_ISSUER?: string;
  APP_ORIGIN: string;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'Error inesperado');

// --- Estado en D1 -----------------------------------------------------------
interface StateRow { data: string; rev: number }
let schemaReady = false;

export async function ensureSchema(env: Env): Promise<void> {
  if (schemaReady) return;
  await env.DB.prepare(
    'CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, data TEXT NOT NULL, rev INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)',
  ).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO app_state (id, data, rev, updated_at) VALUES ('main', '{}', 0, ?)",
  ).bind(new Date().toISOString()).run();
  schemaReady = true;
}

export async function readState(env: Env): Promise<{ keys: Record<string, string>; rev: number }> {
  await ensureSchema(env);
  const row = await env.DB.prepare('SELECT data, rev FROM app_state WHERE id = ?').bind('main').first<StateRow>();
  let keys: Record<string, string> = {};
  if (row?.data) {
    try { keys = JSON.parse(row.data) as Record<string, string>; } catch { keys = {}; }
  }
  return { keys, rev: row?.rev ?? 0 };
}

export async function writeState(env: Env, rev: number, keys: Record<string, string>): Promise<boolean> {
  const res = await env.DB.prepare(
    'UPDATE app_state SET data = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ?',
  ).bind(JSON.stringify(keys), new Date().toISOString(), 'main', rev).run();
  return (res.meta?.changes ?? 0) > 0;
}

export function toClient(keys: Record<string, string>) {
  const get = <T,>(key: string, fallback: T): T => {
    const raw = keys[key];
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  };
  return {
    profiles: get<Profile[]>('db_profiles', []),
    roles: get('db_roles', []),
    clients: get('db_clients', []),
    loans: get('db_loans', []),
    installments: get('db_installments', []),
    payments: get('db_payments', []),
    activities: get('db_activities', []),
    auditEvents: get('db_audit', []),
    applications: get('db_applications', []),
    paymentMethods: get('db_payment_methods', []),
    notificationTemplates: get('db_notification_templates', []),
    notifications: get('db_notifications', []),
    cashSessions: get('db_cash_sessions', []),
    paymentChannels: get('db_payment_channels', []),
    settings: get('db_settings', null),
  };
}

export const toAuthUser = (profile: Profile): AuthUser => ({
  id: profile.id,
  email: profile.email ?? '',
  fullName: profile.fullName,
  role: profile.role,
  clientId: profile.clientId ?? null,
});

/** Carga estado, ejecuta la operación con la misma lógica del adaptador y guarda. */
export async function withState<T>(
  env: Env,
  user: FreebuffUser,
  fn: (adapter: LocalDataAdapter, profile: Profile) => T | Promise<T>,
): Promise<{ result: T; profile: Profile; keys: Record<string, string> }> {
  const name = (user.name ?? '').trim() || (user.email ?? '').split('@')[0] || 'Usuario';
  for (let attempt = 0; attempt < 4; attempt++) {
    const { keys, rev } = await readState(env);
    const store = createMemoryStorage(keys);
    const before = JSON.stringify(keys);
    setStorageBackend(store);
    let result: T;
    let profile: Profile;
    try {
      const adapter = new LocalDataAdapter({
        seedDemo: false,
        actor: { id: user.sub, email: user.email ?? '', fullName: name, role: 'cliente' },
      });
      profile = adapter.upsertProfile({ id: user.sub, fullName: name, email: user.email });
      if (!profile.active) throw new HttpError(403, 'Tu cuenta está desactivada. Pide al administrador que la reactive.');
      result = await fn(adapter, profile);
    } catch (e) {
      // Aun si la acción falla o no está permitida, el alta del perfil debe quedar guardada.
      const pending = store.dump();
      if (JSON.stringify(pending) !== before) await writeState(env, rev, pending).catch(() => false);
      throw e;
    } finally {
      setStorageBackend(null);
    }
    const next = store.dump();
    if (JSON.stringify(next) === before) return { result, profile, keys: next };
    if (await writeState(env, rev, next)) return { result, profile, keys: next };
  }
  throw new HttpError(409, 'Otra operación guardó al mismo tiempo. Vuelve a intentarlo.');
}

// --- Operaciones permitidas -------------------------------------------------
type Args = any;
export const OPS: Record<string, (a: LocalDataAdapter, x: Args) => unknown> = {
  createClient: (a, x) => a.createClient(x),
  updateClient: (a, x) => a.updateClient(x.id, x.patch),
  createLoan: (a, x) => a.createLoan(x),
  restructureLoan: (a, x) => a.restructureLoan(x),
  cancelLoan: (a, x) => a.cancelLoan(x.id, x.reason),
  assignLoan: (a, x) => a.assignLoan(x.id, x.userId),
  registerPayment: (a, x) => a.registerPayment(x),
  voidPayment: (a, x) => a.voidPayment(x.id, x.reason),
  logActivity: (a, x) => a.logActivity(x),
  updateSettings: (a, x) => a.updateSettings(x),
  updateProfileRole: (a, x) => a.updateProfileRole(x.userId, x.role),
  toggleProfileActive: (a, x) => a.toggleProfileActive(x.userId, x.active),
  savePaymentMethod: (a, x) => a.savePaymentMethod(x),
  saveRole: (a, x) => a.saveRole(x),
  deleteRole: (a, x) => a.deleteRole(x.id),
  saveNotificationTemplate: (a, x) => a.saveNotificationTemplate(x),
  createNotification: (a, x) => a.createNotification(x),
  setNotificationStatus: (a, x) => a.setNotificationStatus(x.id, x.status),
  openCashSession: (a, x) => a.openCashSession(x.openingAmount),
  closeCashSession: (a, x) => a.closeCashSession(x.id, x.countedAmount, x.notes),
  savePaymentChannel: (a, x) => a.savePaymentChannel(x),
  createApplication: (a, x) => a.createApplication(x),
  updateApplicationStatus: (a, x) => a.updateApplicationStatus(x.id, x.status, x.reviewNotes, x.approvedAmount),
  linkClientToProfile: (a, x) => a.linkClientToProfile(x.userId, x.clientId),
  importBackup: (a, x) => a.importBackup(x),
};

export const ADMIN_ONLY = new Set(['updateProfileRole', 'toggleProfileActive', 'saveRole', 'deleteRole', 'importBackup']);
/** El rol cliente solo puede registrar sus propias solicitudes de crédito. */
export const CLIENT_ONLY = new Set(['createApplication']);

/** Ejecuta una operación autenticada aplicando las reglas de permisos. */
export async function runOperation(env: Env, user: FreebuffUser, name: string, args: unknown) {
  const run = OPS[name];
  if (!run) throw new HttpError(404, 'Operación no soportada');
  return withState(env, user, (adapter, profile) => {
    if (profile.role === 'cliente') {
      if (!CLIENT_ONLY.has(name)) throw new HttpError(403, 'Tu cuenta no tiene permiso para esta acción');
      return run(adapter, { ...(args as object), clientId: profile.clientId ?? null });
    }
    if (ADMIN_ONLY.has(name) && profile.role !== 'admin') {
      throw new HttpError(403, 'Solo un administrador puede hacer esto');
    }
    return run(adapter, args);
  });
}
