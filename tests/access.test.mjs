// Pruebas del gating por rol: matriz de pantallas, roles personalizados,
// alias heredado "audit" → Configuración y pestaña efectiva.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCREEN_IDS,
  allowedScreensFor,
  canAccessScreen,
  resolveTab,
} from '../.local/test-build/modules.mjs';

const ALL = SCREEN_IDS;

describe('matriz de roles', () => {
  test('admin ve todas las pantallas de gestión (el portal es solo del cliente)', () => {
    for (const screen of ALL.filter(screen => screen !== 'portal')) {
      assert.ok(canAccessScreen(screen, 'admin'), `admin debería ver ${screen}`);
    }
    assert.equal(canAccessScreen('portal', 'admin'), false);
  });

  test('gerente no gestiona equipo', () => {
    assert.ok(canAccessScreen('settings', 'gerente'));
    assert.ok(canAccessScreen('reports', 'gerente'));
    assert.ok(canAccessScreen('applications', 'gerente'));
    assert.equal(canAccessScreen('team', 'gerente'), false);
  });

  test('cobrador opera cartera y configuración, sin reportes ni equipo', () => {
    for (const screen of ['dashboard', 'collections', 'loans', 'payments', 'clients', 'settings']) {
      assert.ok(canAccessScreen(screen, 'cobrador'), `cobrador debería ver ${screen}`);
    }
    for (const screen of ['reports', 'applications', 'team', 'portal']) {
      assert.equal(canAccessScreen(screen, 'cobrador'), false, `cobrador no debería ver ${screen}`);
    }
  });

  test('cliente solo tiene su portal', () => {
    assert.ok(canAccessScreen('portal', 'cliente'));
    for (const screen of ALL.filter(screen => screen !== 'portal')) {
      assert.equal(canAccessScreen(screen, 'cliente'), false);
    }
  });

  test('sin rol no hay acceso', () => {
    for (const screen of ALL) assert.equal(canAccessScreen(screen, null), false);
  });
});

describe('roles personalizados (screens)', () => {
  test('sin lista o lista vacía = sin restricción', () => {
    assert.equal(allowedScreensFor(undefined), undefined);
    assert.equal(allowedScreensFor([]), undefined);
    assert.ok(canAccessScreen('reports', 'gerente', []));
  });

  test('una lista restringe a esas pantallas y quita duplicados', () => {
    assert.deepEqual(allowedScreensFor(['collections', 'collections']), ['collections']);
    assert.ok(canAccessScreen('collections', 'gerente', ['collections']));
    assert.equal(canAccessScreen('loans', 'gerente', ['collections']), false);
  });

  test('"audit" heredado concede Configuración (donde vive Log)', () => {
    assert.deepEqual(allowedScreensFor(['audit']), ['settings']);
    assert.ok(canAccessScreen('settings', 'admin', ['audit']));
    assert.equal(canAccessScreen('team', 'admin', ['audit']), false);
  });

  test('pantallas desconocidas se ignoran; si no queda ninguna, no restringe', () => {
    assert.deepEqual(allowedScreensFor(['caja', 'inventada']), undefined);
    assert.deepEqual(allowedScreensFor(['caja', 'loans']), ['loans']);
  });

  test('la lista nunca amplía lo que el rol estándar ya niega', () => {
    assert.equal(canAccessScreen('team', 'cobrador', ['team']), false);
  });
});

describe('pestaña efectiva', () => {
  test('el cliente siempre aterriza en su portal', () => {
    assert.equal(resolveTab('loans', 'cliente'), 'portal');
  });

  test('se respeta la pestaña pedida cuando hay permiso', () => {
    assert.equal(resolveTab('loans', 'cobrador'), 'loans');
    assert.equal(resolveTab('settings', 'admin'), 'settings');
  });

  test('sin permiso cae en la primera pantalla permitida del rol', () => {
    assert.equal(resolveTab('team', 'gerente'), 'dashboard');
    assert.equal(resolveTab('reports', 'cobrador'), 'dashboard');
    assert.equal(resolveTab('reports', 'admin', ['loans']), 'loans');
    // Una lista sin pantallas válidas no restringe: manda el rol.
    assert.equal(resolveTab('loans', 'admin', ['caja']), 'loans');
  });

  test('un rol personalizado con screens heredadas cae en Configuración', () => {
    assert.equal(resolveTab('loans', 'admin', ['audit']), 'settings');
  });
});
