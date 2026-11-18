#!/usr/bin/env node
// ============================================================================
// DineroYa — Arranque/apagado de un paso en este equipo
//
//   node scripts/local.mjs start    (o doble clic en arrancar.bat)
//   node scripts/local.mjs stop
//
// start:
//   1. Arranca Docker Desktop si el motor no responde y espera a que esté listo.
//   2. Levanta la base de datos local (Postgres + Auth + API + Studio).
//   3. Arranca la app en http://localhost:3000 si no estaba ya corriendo.
//   4. Abre el navegador.
// Es idempotente: si algo ya está corriendo lo reutiliza sin duplicarlo.
// Sin dependencias nuevas: solo Node y las herramientas del proyecto.
// ============================================================================
import { spawn, spawnSync } from 'node:child_process';
import {
  appendFileSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWin = process.platform === 'win32';
const APP_URL = 'http://localhost:3000';
const APP_PORT = 3000;
const STUDIO_URL = 'http://localhost:54323';
const LOG_DIR = path.join(root, '.local');
const APP_LOG = path.join(LOG_DIR, 'app.log');
const PID_FILE = path.join(LOG_DIR, 'app.pid');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (msg) => console.log(`[DineroYa] ${msg}`);

function die(msg, hint) {
  console.error(`\n✖ ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

/** Ejecuta un comando y devuelve su código de salida (sin lanzar excepción). */
function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: root, ...opts });
    child.on('error', (err) => resolve({ code: -1, error: err }));
    child.on('close', (code) => resolve({ code }));
  });
}

/** Ejecuta una línea de shell (necesario para .cmd en Windows). */
function runShell(commandLine, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(commandLine, { cwd: root, shell: true, ...opts });
    child.on('error', (err) => resolve({ code: -1, error: err }));
    child.on('close', (code) => resolve({ code }));
  });
}

// ---------------------------------------------------------------------------
// Docker
// ---------------------------------------------------------------------------
function dockerReady() {
  const r = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
    timeout: 20000,
    windowsHide: true,
  });
  return r.status === 0;
}

const dockerDesktopExe = () => [
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Docker', 'Docker', 'Docker Desktop.exe'),
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'DockerDesktop', 'Docker Desktop.exe'),
].find((p) => p && existsSync(p));

async function ensureDocker() {
  if (dockerReady()) {
    say('Docker ya está corriendo.');
    return;
  }

  say('Docker no responde; arrancando Docker Desktop...');
  let launched = false;

  // Camino preferente: el plugin oficial del CLI.
  const desktopCli = await run('docker', ['desktop', 'start'], { stdio: 'ignore' });
  if (desktopCli.code === 0) launched = true;

  // Respaldo: lanzar el ejecutable directamente.
  if (!launched) {
    const exe = dockerDesktopExe();
    if (!exe) {
      die(
        'Docker no está corriendo y no encuentro Docker Desktop en este equipo.',
        'Abre Docker Desktop manualmente y vuelve a intentarlo.',
      );
    }
    spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
    launched = true;
  }

  // Esperar al motor (Docker Desktop puede tardar en el primer arranque).
  const deadline = Date.now() + 240000;
  process.stdout.write('  esperando al motor de Docker');
  while (Date.now() < deadline) {
    await sleep(3000);
    if (dockerReady()) {
      process.stdout.write('\n');
      say('Docker listo.');
      return;
    }
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  die(
    'El motor de Docker no respondió en 4 minutos.',
    'Abre Docker Desktop, revisa que no pida iniciar sesión o permisos, y vuelve a ejecutar el lanzador.',
  );
}

// ---------------------------------------------------------------------------
// Supabase local
// ---------------------------------------------------------------------------
const supabaseBin = path.join(root, 'node_modules', '.bin', isWin ? 'supabase.cmd' : 'supabase');

function supabaseConfigured() {
  return existsSync(supabaseBin);
}

function runSupabase(args) {
  return runShell(`"${supabaseBin}" ${args.join(' ')}`, { stdio: 'inherit' });
}

async function ensureDatabase() {
  if (!supabaseConfigured()) {
    die('No encuentro el CLI de Supabase en el proyecto.', 'Ejecuta primero: npm install');
  }

  say('Levantando la base de datos local (Postgres + Auth + API)...');
  const r = await runSupabase(['start']);
  if (r.code !== 0) {
    die(
      'No se pudo levantar la base de datos local.',
      'Revisa el mensaje anterior. Si menciona puertos en uso, ejecuta: npm run local:stop y reintenta.',
    );
  }

  // La API respondiendo (401/200) es la prueba real de que quedó operativa.
  const apiOk = await waitForApi();
  if (!apiOk) {
    die(
      'La base de datos arrancó pero la API no responde en http://127.0.0.1:54321.',
      'Ejecuta: npm run db:status para ver el estado.',
    );
  }
  say('Base de datos lista.');
}

async function apiResponds() {
  try {
    const res = await fetch('http://127.0.0.1:54321/rest/v1/', {
      signal: AbortSignal.timeout(4000),
      headers: { apikey: 'anon' },
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForApi() {
  for (let i = 0; i < 40; i++) {
    if (await apiResponds()) return true;
    await sleep(1500);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Aplicación (Vite, puerto 3000)
// ---------------------------------------------------------------------------
async function appState() {
  try {
    const res = await fetch(APP_URL, { signal: AbortSignal.timeout(3000) });
    const html = await res.text();
    return { up: true, ours: html.includes('DineroYa'), status: res.status };
  } catch {
    return { up: false };
  }
}

async function ensureApp() {
  const state = await appState();
  if (state.up && state.ours) {
    say('La app ya estaba corriendo; se reutiliza.');
    return;
  }
  if (state.up && !state.ours) {
    die(
      `El puerto ${APP_PORT} está ocupado por otra aplicación que no es DineroYa.`,
      `Libéralo (o cambia el puerto en vite.config.ts) y vuelve a ejecutar el lanzador.`,
    );
  }

  if (!existsSync(path.join(root, 'node_modules', 'vite'))) {
    die('Faltan las dependencias del proyecto.', 'Ejecuta primero: npm install');
  }

  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(APP_LOG, `\n=== Arranque ${new Date().toISOString()} ===\n`);
  const out = openSync(APP_LOG, 'a');

  say('Arrancando la app...');
  const child = isWin
    ? spawn('cmd.exe', ['/c', 'npm', 'run', 'dev'], {
        cwd: root, detached: true, windowsHide: true, stdio: ['ignore', out, out],
      })
    : spawn('npm', ['run', 'dev'], {
        cwd: root, detached: true, stdio: ['ignore', out, out],
      });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid), 'utf8');

  const deadline = Date.now() + 120000;
  process.stdout.write('  esperando a la app en http://localhost:3000');
  while (Date.now() < deadline) {
    await sleep(1500);
    const s = await appState();
    if (s.up && s.ours) {
      process.stdout.write('\n');
      say('App lista.');
      return;
    }
    process.stdout.write('.');
  }
  process.stdout.write('\n');
  const tail = tailLog();
  die(
    'La app no respondió en 2 minutos.',
    `Revisa el detalle en .local/app.log${tail ? `\n\n${tail}` : ''}`,
  );
}

function tailLog(lines = 15) {
  try {
    return readFileSync(APP_LOG, 'utf8').trim().split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

function openBrowser() {
  const cmd = isWin
    ? `start "" "${APP_URL}"`
    : process.platform === 'darwin'
      ? `open "${APP_URL}"`
      : `xdg-open "${APP_URL}"`;
  spawn(cmd, { shell: true, detached: true, stdio: 'ignore' }).unref();
}

// ---------------------------------------------------------------------------
// stop
// ---------------------------------------------------------------------------
function readPidFile() {
  try {
    const pid = Number(readFileSync(PID_FILE, 'utf8').trim());
    return Number.isFinite(pid) && pid > 0 ? pid : 0;
  } catch {
    return 0;
  }
}

/** PID que está escuchando en un puerto local (Windows), para poder cerrar la app
 *  aunque se haya arrancado a mano con `npm run dev`. */
function pidOnPort(port) {
  if (!isWin) return 0;
  const r = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0 || !r.stdout) return 0;
  const line = r.stdout
    .split(/\r?\n/)
    .find((l) => new RegExp(`[:.]${port}\\s`).test(l) && /LISTENING/i.test(l));
  if (!line) return 0;
  const pid = Number(line.trim().split(/\s+/).pop());
  return Number.isFinite(pid) && pid > 0 ? pid : 0;
}

function killPid(pid) {
  if (!pid) return false;
  if (isWin) {
    const r = spawnSync('taskkill', ['/F', '/T', '/PID', String(pid)], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return r.status === 0;
  }
  try {
    process.kill(-pid, 'SIGTERM');
    return true;
  } catch {
    try { process.kill(pid, 'SIGTERM'); return true; } catch { return false; }
  }
}

async function stopAll() {
  say('Deteniendo la app...');
  const state = await appState();
  const pid = readPidFile() || (state.up && state.ours ? pidOnPort(APP_PORT) : 0);
  const killed = state.up && state.ours ? killPid(pid) : false;

  if (!state.up) {
    say('La app no estaba corriendo.');
  } else if (killed) {
    say('App detenida.');
  } else {
    console.warn('⚠ La app responde pero no pude cerrarla automáticamente.');
    console.warn('  Ciérrala con Ctrl+C en su terminal o reinicia el equipo.');
  }
  try { rmSync(PID_FILE, { force: true }); } catch {}

  if (supabaseConfigured()) {
    say('Deteniendo la base de datos local (los datos se conservan)...');
    const r = await runSupabase(['stop']);
    if (r.code !== 0) console.warn('⚠ supabase stop terminó con error; revisa el mensaje anterior.');
    else say('Base de datos detenida.');
  }
  say('Listo. Docker Desktop se puede cerrar desde su icono si no lo usas para otra cosa.');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
const command = (process.argv[2] || 'start').toLowerCase();

if (command === 'start') {
  console.log('=== DineroYa — arranque local ===\n');
  await ensureDocker();
  await ensureDatabase();
  await ensureApp();
  openBrowser();

  console.log(`
✔ Todo listo. http://localhost:3000

  App       ${APP_URL}
  Login     admin@dineroya.local / Dineroya2026
  Studio    ${STUDIO_URL}   (administrar la base de datos)
  Detener   npm run local:stop
`);
} else if (command === 'stop') {
  console.log('=== DineroYa — apagado local ===\n');
  await stopAll();
} else {
  die(`Comando desconocido: ${command}`, 'Usa: node scripts/local.mjs start | stop');
}
