// Pruebas del modelo de navegación: rutas canónicas, redirects heredados y
// estabilidad ida/vuelta del hash.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TARGET,
  targetFromHash,
  targetToHash,
  sameTarget,
} from '../.local/test-build/modules.mjs';

const target = (overrides = {}) => ({ ...DEFAULT_TARGET, ...overrides });

describe('rutas canónicas', () => {
  const canonical = [
    ['dashboard', '#/resumen'],
    ['collections', '#/cobranza'],
    ['loans', '#/prestamos'],
    ['payments', '#/recaudos'],
    ['clients', '#/clientes'],
    ['applications', '#/solicitudes'],
    ['reports', '#/reportes'],
    ['team', '#/equipo'],
    ['settings', '#/configuracion'],
    ['portal', '#/portal'],
  ];

  for (const [tab, hash] of canonical) {
    test(`${tab} → ${hash}`, () => {
      assert.equal(targetToHash(target({ tab })), hash);
      assert.equal(targetFromHash(hash).tab, tab);
    });
  }

  test('las subsecciones tienen ruta propia y vuelven al mismo destino', () => {
    const cases = [
      target({ tab: 'collections', collections: 'today' }),
      target({ tab: 'collections', collections: 'notifications' }),
      target({ tab: 'settings', settings: 'general' }),
      target({ tab: 'settings', settings: 'channels' }),
      target({ tab: 'settings', settings: 'log' }),
      target({ tab: 'settings', settings: 'data' }),
    ];
    for (const expected of cases) {
      const hash = targetToHash(expected);
      assert.ok(sameTarget(targetFromHash(hash), expected), `${hash} no vuelve al mismo destino`);
    }
    assert.equal(targetToHash(target({ tab: 'collections', collections: 'notifications' })), '#/cobranza/notificaciones');
    assert.equal(targetToHash(target({ tab: 'settings', settings: 'log' })), '#/configuracion/log');
    assert.equal(targetToHash(target({ tab: 'settings', settings: 'channels' })), '#/configuracion/canales-de-pago');
  });
});

describe('redirects heredados', () => {
  const legacy = [
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

  for (const [hash, expected] of legacy) {
    test(`${hash} redirige a ${expected.tab}`, () => {
      const resolved = targetFromHash(hash);
      for (const [key, value] of Object.entries(expected)) assert.equal(resolved[key], value);
      // Y desde ahí ya no queda ninguna ruta vieja navegable.
      assert.equal(targetFromHash(targetToHash(resolved)).tab, resolved.tab);
    });
  }

  test('acepta la ruta sin "#" y con barras extra', () => {
    assert.equal(targetFromHash('notificaciones').collections, 'notifications');
    assert.equal(targetFromHash('#/auditoria/').settings, 'log');
  });
});

describe('fallback y límites del modelo', () => {
  for (const hash of ['', '#', '#/', '#/no-existe']) {
    test(`"${hash}" cae en una pestaña válida`, () => {
      const resolved = targetFromHash(hash);
      assert.equal(resolved.tab, 'dashboard');
    });
  }

  test('una subruta desconocida se queda en la pestaña padre', () => {
    assert.equal(targetFromHash('#/cobranza/otra-cosa').tab, 'collections');
    assert.equal(targetFromHash('#/cobranza/otra-cosa').collections, 'today');
    assert.equal(targetFromHash('#/configuracion/loquesea').tab, 'settings');
    assert.equal(targetFromHash('#/configuracion/loquesea').settings, 'general');
  });

  test('Caja no tiene ruta navegable', () => {
    const hashes = ['#/caja', '#/cash', '#/configuracion', '#/cobranza']
      .map(hash => targetToHash(targetFromHash(hash)));
    assert.ok(hashes.every(hash => !/caja|cash/.test(hash)));
  });

  test('Notificaciones solo existe dentro de Cobranza', () => {
    const resolved = targetFromHash('#/notificaciones');
    assert.equal(resolved.tab, 'collections');
    assert.equal(targetToHash(resolved), '#/cobranza/notificaciones');
    assert.ok(!targetToHash(target({ tab: 'dashboard' })).includes('notificaciones'));
  });

  test('sameTarget compara sección solo cuando corresponde', () => {
    assert.ok(sameTarget(target({ tab: 'settings', settings: 'log' }), target({ tab: 'settings', settings: 'log' })));
    assert.ok(!sameTarget(target({ tab: 'settings', settings: 'log' }), target({ tab: 'settings', settings: 'general' })));
    assert.ok(sameTarget(target({ tab: 'loans', settings: 'log' }), target({ tab: 'loans', settings: 'general' })));
  });
});
