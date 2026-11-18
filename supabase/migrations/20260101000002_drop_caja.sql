-- ============================================================================
-- Retira el módulo de Caja, descartado del producto.
-- Ojo: el método de pago 'cash' (Efectivo) no se toca; es otra cosa.
-- ============================================================================

-- Tabla de arqueos con su índice único y políticas RLS asociadas.
DROP TABLE IF EXISTS cash_sessions CASCADE;

-- Quita la pantalla del módulo a los roles que la tuvieran asignada.
UPDATE roles SET screens = array_remove(screens, 'cash');
