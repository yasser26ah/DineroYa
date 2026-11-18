<div align="center">

# DineroYa — Cartera de Préstamos

**Seguimiento · Trazabilidad · Gestión de Cobranza**

</div>

## Qué es

Aplicación para operar préstamos de cartera propia con tres pilares:

- **Seguimiento**: calendario de cuotas por préstamo (semanal / quincenal / mensual), vencimientos, marcado de mora y antigüedad por tramos (1–30, 31–60, 61–90, +90 días).
- **Trazabilidad**: bitácora automática de auditoría (altas, cambios de estado, pagos, anulaciones, gestiones) con autor y fecha; historial de gestiones de cobranza por préstamo; anulación de pagos con motivo obligatorio.
- **Gestión de cobranza**: cola del día con casos vencidos y compromisos incumplidos, registro de gestiones (llamada, WhatsApp, visita) con resultado y fecha de compromiso, recordatorios por WhatsApp redactados con IA (Gemini) y registrados automáticamente.

## Módulos

| Módulo | Contenido |
|---|---|
| **Resumen Global** | KPIs de cartera, evolución de recaudación, aging de mora, cobros del día, compromisos incumplidos |
| **Cobranza del Día** | Cola priorizada por días de mora con última gestión, historial por caso, gestiones, cobros y WhatsApp |
| **Préstamos** | Lista con filtros, ficha de detalle: calendario cuota por cuota, pagos con anulación, gestiones, asignación de cobrador, cancelación con motivo |
| **Clientes** | Alta/edición, scoring de riesgo, ficha 360 con préstamos y últimos pagos |
| **Auditoría** (gerente/admin) | Bitácora global filtrable por entidad, autor y búsqueda |
| **Equipo** (admin) | Usuarios y roles: administrador, gerente, cobrador |
| **Configuración** | Moneda, tasa base, nombre; backup JSON; guía de conexión a Supabase |

## Roles

- **Administrador**: acceso total (configuración, equipo, cancelaciones, auditoría, solicitudes).
- **Gerente**: ve toda la cartera, auditoría y solicitudes; no gestiona usuarios.
- **Cobrador**: ve y opera solo los préstamos asignados a él (RLS en Supabase).
- **Cliente**: portal de autoservicio. Ve únicamente sus préstamos y cuotas, y envía solicitudes de crédito. No accede a la cartera interna.

## Portal del cliente

El cliente se registra desde **Crear cuenta → Soy cliente**. Al confirmar su correo:

1. Se crea su ficha en `clients` y se vincula a su usuario (`profiles.client_id`).
2. Entra a **Mi portal**, donde ve saldo, próxima cuota, mora, sus préstamos y el calendario de cuotas.
3. Puede enviar **solicitudes de crédito** con monto, destino y notas.
4. El administrador o gerente las revisa en **Solicitudes**, las aprueba o rechaza con una respuesta que el cliente ve en su portal.

Las políticas RLS impiden que un cliente vea clientes, préstamos, cuotas o pagos de otras personas.


## Dos modos de operación

### Modo local (por defecto, sin configuración)
Un solo operador (demo) con datos en `localStorage` de este navegador, **incluye datos de demostración** para explorar la app. Ideal para probar.

```bash
npm install
npm run dev
```
Entra con el botón **"Entrar en modo demo"**.

### Modo local con base de datos en este equipo (Docker)

Postgres + Auth + API + Studio corriendo en tu PC con Docker, sin depender de internet
ni de un proyecto en la nube. Es el modo recomendado para operar de verdad en un solo equipo.

Requisitos: **Docker Desktop** instalado (el lanzador lo arranca solo) y Node 20+.

#### Arranque de un paso

Con el equipo recién encendido, **doble clic en `arrancar.bat`** o, desde la terminal:

```bash
npm run local:start
```

Ese único comando:

1. arranca Docker Desktop si el motor no responde y espera a que esté listo;
2. levanta la base de datos local (Postgres + Auth + API + Studio);
3. arranca la app en http://localhost:3000 (si ya estaba corriendo, la reutiliza);
4. abre el navegador.

Es idempotente: puedes ejecutarlo dos veces sin duplicar contenedores ni servidores.
Si algo falla, muestra el motivo y la acción recomendada. El log de la app queda en
`.local/app.log`.

Para apagar todo (los datos se conservan):

```bash
npm run local:stop
```

#### Paso a paso (equivalente manual)

```bash
npm install          # solo la primera vez
npm run db:start     # levanta Postgres, Auth, API y Studio (primera vez: varios minutos)
npm run dev          # app en http://localhost:3000
```

Servicios locales:

| Servicio | URL |
|---|---|
| Aplicación | http://localhost:3000 |
| API (Auth + REST) | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (administrar la base de datos) | http://localhost:54323 |
| Correos de prueba (confirmaciones, reset) | http://localhost:54324 |La primera vez el esquema se aplica solo desde `supabase/migrations`. La conexión yaestá en `.env.local` (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).

**Primer acceso (ya creado en este equipo)**

| Usuario | Contraseña | Rol |
|---|---|---|
| `admin@dineroya.local` | `Dineroya2026` | Administrador |

Cámbiala desde la app cuando empieces a operar. Los demás usuarios se crean desde
**Equipo**: el alta queda como cobrador hasta que un admin le asigne rol.

Los datos viven en un volumen de Docker: al apagar el equipo no se pierden, solo
debes volver a ejecutar `npm run db:start`. Para respaldos usa **Configuración →
backup JSON** o `pg_dump` contra `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

Comandos útiles:

| Comando | Descripción |
|---|---|
| `npm run db:start` | Arranca la base de datos y servicios |
| `npm run db:stop` | Los detiene (los datos se conservan) |
| `npm run db:status` | URLs y claves actuales |
| `npm run db:reset` | Recrea la base desde cero y reaplica el esquema |
| `npm run db:sync` | Copia `schema.sql` y la migración a `supabase/migrations` |

Si editas `schema.sql` o `migration_portal_cliente.sql`, ejecuta `npm run db:sync`
(y `npm run db:reset` si quieres aplicar los cambios desde cero).

### Modo multiusuario (Supabase en la nube)
Postgres + autenticación + Row Level Security + auditoría por triggers.

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. Ejecuta el contenido completo de **`schema.sql`** en el SQL Editor del proyecto.
3. Copia URL y anon key de *Settings → API*.
4. Crea `.env.local` (ver `.env.example`):

   ```
   VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
   VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
   ```

5. `npm run dev` → regístrate; **el primer usuario queda como administrador**.
6. Opcional: configura `GEMINI_API_KEY` para la redacción de mensajes con IA.

### Proyecto Supabase ya existente

Si ya ejecutaste `schema.sql` antes de esta versión, ejecuta **una sola vez**
`migration_portal_cliente.sql` en el SQL Editor. Añade el rol `cliente`, la tabla
`credit_applications`, el vínculo `profiles.client_id`, las políticas RLS del portal
y la función `fn_restructure_loan`. Es idempotente.

### Crear el primer administrador sin depender del correo

1. Supabase → **Authentication → Users → Add user**.
2. Escribe email y contraseña y marca **Auto Confirm User**.
3. Ese primer perfil queda como `admin` automáticamente.
4. Entra a la app con esas credenciales.

### Correo de confirmación

Con `mailer_autoconfirm` desactivado (por defecto), cada cliente debe confirmar su
correo antes de entrar. Para pruebas puedes desactivarlo en
**Authentication → Providers → Email → Confirm email**, o crear los usuarios desde
el panel con **Auto Confirm User**.


## Lógica de negocio

- Interés plano: `total = capital × (1 + tasa/100)`, repartido en cuotas iguales (la última ajusta centavos).
- Los pagos se asignan **FIFO** a la cuota más antigua pendiente; se permiten abonos parciales.
- Estado de mora recalculado en tiempo real (local) o con `fn_mark_overdue()` programable con `pg_cron` (Supabase).
- La tasa sugerida al crear un préstamo varía con el riesgo del cliente.
- El riesgo del cliente se recalcula automáticamente (+15 por préstamo pagado, −40 por mora).

## Stack

React 19 · Vite · TypeScript · TailwindCSS · Recharts · Lucide · Supabase (opcional) · Gemini AI (opcional)

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo (puerto 3000) |
| `npm run build` | Compilación de producción |
| `npm run preview` | Previsualizar el build |
| `npm run build:sites` | Compila el SPA y empaqueta el Worker en `freebuff-sites-build/` |
| `npm run sites:dev` | Prueba el sitio completo en workerd (`http://localhost:8787`) con D1 local |

## Producción en la nube (Freebuff Sites)

La rama `feat/produccion-sites` añade un despliegue multiusuario sin servidores propios:

- **Acceso**: cada persona entra con su cuenta de Google (GitHub o Apple) mediante Sign in with Freebuff. No hay contraseñas ni invitaciones por correo.
- **Permisos**: el primer usuario que entra queda como `admin`; los demás entran como `cliente` sin acceso a la cartera hasta que un administrador les asigne rol en **Equipo** o les vincule una ficha de cliente.
- **Datos**: se guardan en D1 (`app_state`) y toda la lógica de negocio corre en el Worker; el navegador solo usa `/api/session`, `/api/state` y `/api/op`.
- **Migrar datos**: en la instalación local usa Configuración → *Exportar backup JSON* y en producción (con la base vacía) usa *Importar respaldo JSON*.

Producción: https://site-4a5449d5b57540ec884ea1f16a51c5d8.freebuff.page

El modo Docker/Supabase (puerto 3000) sigue igual: con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` la app usa Supabase; la compilación `--mode sites` fuerza el modo Worker/D1.
