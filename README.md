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

### Modo multiusuario (Supabase)
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
