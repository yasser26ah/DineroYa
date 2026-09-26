<div align="center">

# 📘 Manual de Operación — FinanzaPro (DineroYa)

**Guía para el equipo de cobranza: accesos, usuarios, rutina diaria y qué hacer si algo falla.**

</div>

---

## 1. Accesos

| Qué | Dónde |
|---|---|
| **App en producción** | https://dineroya.pages.dev |
| **Panel de base de datos (solo admin técnico)** | https://supabase.com/dashboard/project/crmnnoyvcvjhfquewofn |
| **Hosting / deploys (solo admin técnico)** | Cloudflare Pages → proyecto `dineroya` |

### Cuenta de administrador

| Campo | Valor |
|---|---|
| **Email** | `admin@dineroya.app` |
| **Contraseña** | `DineroYa2026!` |
| **Rol** | Administrador (acceso total) |

> 🔐 **Reglas de la contraseña admin:**
> - No compartirla por WhatsApp ni correo. Comunicarla de persona a persona.
> - Si alguien la conoce y deja el equipo, cambiarla en Supabase → Authentication → Users → admin@dineroya.app → Reset password.
> - Cada persona del equipo debe tener **su propia cuenta** (ver sección 3). Nunca operar dos personas con la misma cuenta: la auditoría registra quién hizo cada cosa.

### ¿Olvidaste una contraseña? (autoservicio)

1. En la pantalla de login, pulsa **"¿Olvidaste tu contraseña?"**.
2. Escribe **tu email** y pulsa **ENVIAR ENLACE**.
3. Revisa tu correo (y la carpeta de spam): llega un enlace para crear una contraseña nueva.
4. Al abrir el enlace, la app pide la nueva contraseña (dos veces) y te devuelve al login.

> ⚠️ El enlace de recuperación **llega solo a emails reales**. Cuentas con dominio inventado (ej: `@dineroya.app`) no pueden recibirlo — para esas, el admin técnico cambia la contraseña en Supabase → Authentication → Users.
> ⏱️ En el plan gratuito de Supabase hay un límite de emails por hora; si aparece "email rate limit exceeded", espera un rato y reintenta.

---

## 2. Roles: quién puede hacer qué

| Rol | Ve | Puede hacer |
|---|---|---|
| **Administrador** | Toda la cartera | Todo: configuración, crear/editar usuarios, cancelar préstamos, auditoría completa |
| **Gerente** | Toda la cartera | Operar cobranza de cualquier préstamo, ver auditoría. No gestiona usuarios ni configuración |
| **Cobrador** | Solo sus préstamos asignados | Registrar gestiones y pagos de sus casos, ver sus clientes |

Al registrarse por la app, una cuenta nueva entra como **cobrador**. Un administrador la sube de rol desde **Equipo**.

---

## 3. Cómo registrar un cobrador (o gerente)

1. La persona entra a **https://dineroya.pages.dev** → botón **"¿No tienes cuenta? Regístrate"**.
2. Completa **nombre completo**, **email real** (que pueda consultar) y contraseña (mínimo 6 caracteres).
3. Le aparecerá la app con rol **cobrador** y sin casos asignados todavía.
4. El **administrador** entra a la app → pestaña **Equipo** → busca a la persona:
   - Cambia el **rol** (cobrador / gerente / administrador) con el selector.
   - Activa o desactiva la cuenta con el interruptor (una cuenta inactiva no puede entrar).
5. Asignar casos: en **Préstamos** → tarjeta del préstamo → botón **ASIGNAR** → elige el cobrador. Desde ese momento el cobrador ve ese préstamo (y su cliente) en su vista.

> ✅ **Verifica el alta**: pídele a la persona que cierre sesión y vuelva a entrar una vez antes de darle casos reales.

> 📧 La confirmación por email está **desactivada** en este proyecto: al registrarse, la cuenta queda lista para entrar de inmediato. Si algún día se activa, el nuevo usuario deberá confirmar su correo antes de entrar.

---

## 4. Flujo diario de cobranza

### 🌅 Inicio del día (10 minutos)

1. Entra con **tu cuenta** (no la del admin salvo que seas él).
2. Abre **Cobranza del Día**: ahí está la cola del día, priorizada por días de mora:
   - **Cuotas vencidas** (rojo/moroso al frente).
   - **Cuotas que vencen hoy**.
   - **Compromisos incumplidos**: clientes que prometieron pagar y no lo hicieron.
3. Revisa en cada caso la **última gestión** (fecha y resultado) para no repetir contactos innecesarios.

### 📞 Durante el día: gestionar

En cada caso de la cola (o desde Préstamos → GESTIONAR):

1. **Contacta** al cliente: llamada, WhatsApp o visita.
2. Registra la **gestión** con:
   - **Tipo**: llamada / WhatsApp / visita / otro.
   - **Resultado**: contactado, sin respuesta, prometió pagar, se negó, etc.
   - **Fecha de compromiso**: si prometió pagar "el viernes", ponla. Ese caso reaparece en la cola como *compromiso* si no paga.
   - **Notas**: lo hablado, en pocas palabras claras (esto queda en auditoría).
3. **WhatsApp**: el botón WHATSAPP pre-redacta un recordatorio con IA. **Revísalo y ajústalo** antes de enviar; el envío queda registrado en el historial del préstamo.

### 💵 Cuando el cliente paga: registrar el pago

1. En el préstamo (cola o ficha) → botón **COBRAR**.
2. Confirma el **monto recibido** (usa "USAR CUOTA EXACTA" si paga completo) y el **método** (efectivo, transferencia…).
3. La fecha por defecto es hoy; cámbiala solo si el pago fue otro día.
4. **Cómo se asigna el dinero**: el sistema aplica el pago automáticamente a la **cuota más antigua pendiente** (FIFO):
   - Si cubre la cuota completa → cuota **PAGADA**.
   - Si cubre una parte (abono) → cuota **PARCIAL** y el resto sigue pendiente. El cliente no "debe elegir" cuota: siempre baja primero la más vieja.
5. El **saldo pendiente** del préstamo se actualiza al instante y el pago queda en el historial con tu nombre.

### ⚠️ Anular un pago (error de dedo, pago devuelto)

1. Préstamos → detalle del préstamo → **PAGOS RECIBIDOS** → botón **ANULAR** del pago.
2. Escribir el **motivo** (obligatorio; ej: "transferencia devuelta por el banco").
3. La anulación revierte las cuotas a su estado anterior y queda **registrada en la auditoría**. No se puede deshacer la anulación.

### 🌙 Cierre del día

1. Verifica que **toda gestión del día esté registrada** (la memoria de mañana es la bitácora de hoy).
2. Mira **Compromisos Incumplidos**: si un cliente prometió hoy y no pagó, deja la gestión con nueva fecha de compromiso.
3. Revisa el **Resumen Global**: cobrado real vs. esperado te dice cómo fue el día.

---

## 5. Si algo falla (guía rápida)

### "No puedo entrar" / usuario o contraseña incorrectos
- Revisa mayúsculas y que el email sea el correcto.
- Si olvidaste tu contraseña: usa **"¿Olvidaste tu contraseña?"** en la pantalla de login (ver sección 1). Si tu email no puede recibir correo, pídele al admin técnico el cambio en Supabase.

### "Database error saving new user" al registrarte
- El registro pudo quedar a medias. Espera 1 minuto y prueba **entrar** directamente; si no funciona, avisa al admin técnico para revisar Supabase.

### La app carga pero no veo mis préstamos / clientes
- **Cobrador**: solo ves lo **asignado a ti**. Si te falta un caso, pide al admin que lo asigne.
- Recarga la página (F5). Si persiste, verifica tu conexión; la app requiere internet (los datos viven en Supabase).

### Error al aprobar un préstamo o registrar un pago (mensaje con texto técnico)
- Toma **captura del mensaje** y avísale al admin técnico. No reintentar muchas veces seguidas: cada intento puede crear registros duplicados.

### La mora no se marca sola
- El marcado de vencidos corre con una tarea programada (`fn_mark_overdue`). Si la cartera aparece "al día" cuando no lo está, el admin técnico debe ejecutar en Supabase → SQL Editor:
  ```sql
  SELECT fn_mark_overdue();
  ```
- El estado también se corrige al instante cuando se registra un pago.

### Se cayó la página / no abre dineroya.pages.dev
- Revisa https://www.pagesstatus.com o simplemente espera 2 minutos; el hosting (Cloudflare) es muy estable.
- Los datos están a salvo: viven en la base de datos, no en tu navegador.

### Escalado a admin técnico
Avísale (con captura de pantalla y qué estabas haciendo) cuando:
- Un error técnico se repite en 2 intentos.
- Un pago quedó registrado y **no** aparece en el historial.
- Sospechas datos inconsistentes (saldo raro, cuota pagada que no era).

El admin técnico tiene dos herramientas de diagnóstico:
- **Auditoría** (en la app, pestaña Auditoría): quién hizo qué, cuándo y el detalle JSON.
- **Supabase → SQL Editor**: consultas directas sobre la base.

---

## 6. Respaldo y trazabilidad

- **Toda la operación queda en auditoría**: altas, cambios de rol, préstamos, pagos, anulaciones y gestiones, con autor y fecha. Visible para gerente/admin en la pestaña **Auditoría**.
- **Backup manual** (admin): Configuración → descarga el JSON de la cartera. Recomendado cada semana o antes de cambios grandes.
- La base de datos (Supabase) hace copias de seguridad automáticas diarias del proyecto.

---

## 7. Contactos y responsabilidades

| Tarea | Responsable |
|---|---|
| Cobranza diaria, gestiones, pagos | Equipo de cobranza |
| Alta/baja de usuarios, roles, asignación de casos | Administrador |
| Configuración (moneda, tasa base), cancelaciones | Administrador |
| Errores técnicos, base de datos, deploys, contraseñas | Admin técnico |

---

*Documento de operación. Cualquier cambio de credenciales o de flujo debe reflejarse aquí.*
