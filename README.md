<div align="center">

# FinanzaPro — DineroYa · Cartera de Préstamos

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

- **Administrador**: acceso total (configuración, equipo, cancelaciones, auditoría).
- **Gerente**: ve toda la cartera y auditoría; no gestiona usuarios.
- **Cobrador**: ve y opera solo los préstamos asignados a él (RLS en Supabase).

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
