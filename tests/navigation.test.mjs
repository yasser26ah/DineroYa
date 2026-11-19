// Pruebas del modelo de navegación: rutas canónicas, redirects heredados y
// estabilidad ida/vuelta del hash. Sustituye a scripts/check-nav.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TARGET,
  targetFromHash,
  targetToHash,
  sameTarget,
} from '../.local/test-build/modules.mjs';

const target = (overrides = {}) => ({ ...DEFAULT_TARGET, ...overrides });

// Destino → hash canónico. Cubre pestañas y subsecciones.
const ROUTES = [
  [target({ tab: 'portal' }), '#/portal'],
  [target({ tab: 'dashboard' }), '#/resumen'],
  [target({ tab: 'collections' }), '#/cobranza'],
  [target({ tab: 'collections', collections: 'promises' }), '#/cobranza/promesas'],
  [target({ tab: 'collections', collections: 'notifications' }), '#/cobranza/notificaciones'],
  [target({ tab: 'loans' }), '#/prestamos'],
  [target({ tab: 'payments' }), '#/recaudos'],
  [target({ tab: 'clients' }), '#/clientes'],
  [target({ tab: 'applications' }), '#/solicitudes'],
  [target({ tab: 'reports' }), '#/reportes'],
  [target({ tab: 'team' }), '#/equipo'],
  [target({ tab: 'settings' }), '#/configuracion'],
  [target({ tab: 'settings', settings: 'channels' }), '#/configuracion/canales-de-pago'],
  [target({ tab: 'settings', settings: 'log' }), '#/configuracion/log'],
  [target({ tab: 'settings', settings: 'data' }), '#/configuracion/datos'],
];

for (const [expected, hash] of ROUTES) {
  test(`${hash} es la ruta de ${expected.tab}`, () => {
    assert.equal(targetToHash(expected), hash);
    assert.deepEqual(targetFromHash(hash), expected);
  });
}

// Rutas que existieron antes del refactor.
const LEGACY = [
  ['#/notificaciones', { tab: 'collections', collections: 'notifications' }],
  ['#/notifications', { tab: 'collections', collections: 'notifications' }],
  ['#/caja', { tab: 'dashboard' }],
  ['#/cash', { tab: 'dashboard' }],
  ['#/canales-de-pago', { tab: 'settings', settings: 'channels' }],
  ['#/canales', { tab: 'settings', settings: 'channels' }],
  ['#/channels', { tab: 'settings', settings: 'channels' }],
  ['#/auditoria', { tab: 'settings', settings: 'log' }],
  ['#/audit', { tab: 'settings', settings: 'log' }],
  ['#/log', { tab: 'settings', settings: 'log' }],
];

for (const [hash, expected] of LEGACY) {
  test(`${hash} redirige a ${expected.tab}`, () => {
    assert.deepEqual(targetFromHash(hash), target(expected));
  });
}

test('acepta la ruta sin "#" y con barras extra', () => {
  assert.equal(targetFromHash('notificaciones').collections, 'notifications');
  assert.equal(targetFromHash('#/auditoria/').settings, 'log');
});

test('hash vacío o desconocido cae en el dashboard', () => {
  for (const hash of ['', '#', '#/', '#/no-existe']) {
    assert.equal(targetFromHash(hash).tab, 'dashboard');
  }
});

test('una subruta desconocida se queda en la pestaña padre', () => {
  assert.equal(targetFromHash('#/cobranza/otra-cosa').collections, 'today');
  assert.equal(targetFromHash('#/configuracion/loquesea').settings, 'general');
});

test('Caja no tiene ruta navegable', () => {
  const hashes = ['#/caja', '#/cash', '#/configuracion', '#/cobranza']
    .map(hash => targetToHash(targetFromHash(hash)));
  assert.ok(hashes.every(hash => !/caja|cash/.test(hash)));
});

test('Notificaciones solo se alcanza dentro de Cobranza', () => {
  const resolved = targetFromHash('#/notificaciones');
  assert.equal(resolved.tab, 'collections');
  assert.equal(targetToHash(resolved), '#/cobranza/notificaciones');
});

test('sameTarget compara la sección solo cuando la pestaña la tiene', () => {
  assert.ok(sameTarget(target({ tab: 'settings', settings: 'log' }), target({ tab: 'settings', settings: 'log' })));
  assert.ok(!sameTarget(target({ tab: 'settings', settings: 'log' }), target({ tab: 'settings', settings: 'general' })));
  assert.ok(sameTarget(target({ tab: 'loans', settings: 'log' }), target({ tab: 'loans', settings: 'general' })));
});
