// Verifica que cada pestaña tenga ruta canónica estable y que las rutas
// heredadas (Notificaciones, Caja, Canales, Auditoría) redirijan al destino
// nuevo correcto. Se ejecuta con `npm run check:nav` (compila lib/nav.ts con esbuild).
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const outdir = mkdtempSync(path.join(tmpdir(), 'dineroya-nav-'));
const outfile = path.join(outdir, 'nav.mjs');

await build({
  entryPoints: ['lib/nav.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});

const nav = await import(pathToFileURL(outfile).href);

const cases = [
  // Pestañas vigentes: ida y vuelta por hash.
  ['#/resumen', { tab: 'dashboard' }],
  ['#/cobranza', { tab: 'collections', collections: 'today' }],
  ['#/cobranza/notificaciones', { tab: 'collections', collections: 'notifications' }],
  ['#/prestamos', { tab: 'loans' }],
  ['#/recaudos', { tab: 'payments' }],
  ['#/clientes', { tab: 'clients' }],
  ['#/solicitudes', { tab: 'applications' }],
  ['#/reportes', { tab: 'reports' }],
  ['#/equipo', { tab: 'team' }],
  ['#/configuracion', { tab: 'settings', settings: 'general' }],
  ['#/configuracion/canales-de-pago', { tab: 'settings', settings: 'channels' }],
  ['#/configuracion/log', { tab: 'settings', settings: 'log' }],
  ['#/configuracion/datos', { tab: 'settings', settings: 'data' }],

  // Rutas heredadas: deben resolver al destino nuevo, sin 404.
  ['#/notificaciones', { tab: 'collections', collections: 'notifications' }],
  ['#/notifications', { tab: 'collections', collections: 'notifications' }],
  ['#/caja', { tab: 'dashboard' }],
  ['#/cash', { tab: 'dashboard' }],
  ['#/canales-de-pago', { tab: 'settings', settings: 'channels' }],
  ['#/channels', { tab: 'settings', settings: 'channels' }],
  ['#/auditoria', { tab: 'settings', settings: 'log' }],
  ['#/audit', { tab: 'settings', settings: 'log' }],
  ['#/log', { tab: 'settings', settings: 'log' }],

  // Basura o vacío: siempre una pestaña válida, nunca una pantalla en blanco.
  ['', { tab: 'dashboard' }],
  ['#/no-existe', { tab: 'dashboard' }],
];

for (const [hash, expected] of cases) {
  const target = nav.targetFromHash(hash);
  for (const [key, value] of Object.entries(expected)) {
    assert.equal(target[key], value, `${hash} → ${key} esperado ${value}, recibido ${target[key]}`);
  }
  // El hash canónico debe volver a resolver al mismo destino (ida y vuelta).
  const canonical = nav.targetToHash(target);
  const roundTrip = nav.targetFromHash(canonical);
  assert.deepEqual(roundTrip, target, `${hash} no es estable en ida y vuelta (${canonical})`);
}

// Ningún destino puede apuntar a Caja ni a Notificaciones como pestaña.
const hashes = cases.map(([hash]) => nav.targetToHash(nav.targetFromHash(hash)));
assert.ok(hashes.every(hash => !/caja|cash/.test(hash)), 'quedó una ruta de Caja navegable');
assert.ok(hashes.every(hash => !/^#\/notificaciones/.test(hash)), 'Notificaciones sigue siendo ruta de primer nivel');

console.log(`OK ${cases.length} rutas verificadas (vigentes + heredadas + fallback)`);
