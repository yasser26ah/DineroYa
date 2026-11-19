// ============================================================================
// DineroYa — Worker de producción
//  · Login con Freebuff (Google, GitHub o Apple) — sin contraseñas ni secretos
//  · Datos en D1 (documento de estado por instalación)
//  · La lógica de negocio corre en el servidor (worker/core.ts)
// ============================================================================
import { createFreebuffAuth, isSameOriginRequest, type FreebuffAuth } from '@freebuff/auth';
import {
  HttpError, errorMessage, listBackups, listServerErrors, recordError, restoreBackup, runOperation,
  stateHealth, toAuthUser, toClient, withState,
} from './core';
import type { Env } from './core';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });

async function handle(request: Request, env: Env, auth: FreebuffAuth): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/api/session') {
    const user = await auth.getUser(request);
    if (!user) return json({ user: null, data: null });
    const { profile, keys } = await withState(env, user, () => null);
    return json({ user: toAuthUser(profile), data: toClient(keys) });
  }

  if (url.pathname === '/api/state') {
    const user = await auth.getUser(request);
    if (!user) return json({ error: 'Inicia sesión para continuar' }, 401);
    // Refresca estados de mora antes de entregar los datos.
    const { profile, keys } = await withState(env, user, async (adapter) => {
      await adapter.listClients();
      await adapter.listLoans();
      return null;
    });
    return json({ user: toAuthUser(profile), data: toClient(keys) });
  }

  if (url.pathname === '/api/backups') {
    const user = await auth.getUser(request);
    if (!user) return json({ error: 'Inicia sesión para continuar' }, 401);
    const { profile } = await withState(env, user, () => null);
    if (profile.role !== 'admin') return json({ error: 'Solo un administrador puede gestionar los respaldos' }, 403);

    if (request.method === 'GET') return json({ backups: await listBackups(env) });
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    if (!isSameOriginRequest(request, env.APP_ORIGIN)) return json({ error: 'Origen no permitido' }, 403);

    let body: { id?: number } | null = null;
    try { body = await request.json() as { id?: number }; } catch { body = null; }
    try {
      const data = await restoreBackup(env, Number(body?.id));
      return json({ data: toClient(data) });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      return json({ error: errorMessage(e) }, 400);
    }
  }

  if (url.pathname === '/api/op') {
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    if (!isSameOriginRequest(request, env.APP_ORIGIN)) return json({ error: 'Origen no permitido' }, 403);
    const user = await auth.getUser(request);
    if (!user) return json({ error: 'Inicia sesión para continuar' }, 401);

    let body: { name?: string; args?: unknown } | null = null;
    try { body = await request.json() as { name?: string; args?: unknown }; } catch { body = null; }
    const name = String(body?.name ?? '');

    try {
      const { result, profile, keys } = await runOperation(env, user, name, body?.args ?? {});
      return json({ user: toAuthUser(profile), data: toClient(keys), result: result ?? null });
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      await recordError(env, {
        op: name || 'op',
        message: errorMessage(e),
        stack: e instanceof Error ? e.stack : '',
        userId: user.sub,
        path: url.pathname,
      });
      return json({ error: errorMessage(e) }, 400);
    }
  }

  if (url.pathname === '/api/health') {
    const user = await auth.getUser(request);
    if (!user) return json({ error: 'Inicia sesión para continuar' }, 401);
    const { profile } = await withState(env, user, () => null);
    if (profile.role !== 'admin') return json({ error: 'Solo un administrador puede ver el estado del servidor' }, 403);
    return json({ health: await stateHealth(env) });
  }

  if (url.pathname === '/api/errors') {
    const user = await auth.getUser(request);
    if (!user) return json({ error: 'Inicia sesión para continuar' }, 401);
    const { profile } = await withState(env, user, () => null);
    if (profile.role !== 'admin') return json({ error: 'Solo un administrador puede ver los errores' }, 403);
    return json({ errors: await listServerErrors(env) });
  }

  if (url.pathname.startsWith('/api/')) return json({ error: 'No encontrado' }, 404);

  return env.ASSETS.fetch(request);
}

// Una instancia de auth por isolate (cachea discovery y claves).
let auth: FreebuffAuth | undefined;
let app: ((request: Request, env: Env) => Promise<Response>) | undefined;

function setup(env: Env) {
  const local = env.APP_ORIGIN.startsWith('http://localhost') || env.APP_ORIGIN.startsWith('http://127.0.0.1');
  auth ??= createFreebuffAuth({
    clientId: env.FREEBUFF_CLIENT_ID,
    issuer: env.FREEBUFF_ISSUER || undefined,
    baseUrl: env.APP_ORIGIN,
    allowInsecureLocalhost: local,
  });
  const signedIn = auth;
  app ??= signedIn.wrap((request: Request, e: Env) => handle(request, e, signedIn));
  return app;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await setup(env)(request, env);
    } catch (e) {
      // Cualquier fallo no controlado queda registrado antes de responder.
      await recordError(env, {
        op: 'unhandled',
        message: errorMessage(e),
        stack: e instanceof Error ? e.stack : '',
        path: new URL(request.url).pathname,
      });
      return json({ error: 'Error interno del servidor. Intenta de nuevo.' }, 500);
    }
  },
};
