-- ===========================================================================
-- Medilu — Fase M2: actualización de precios de los débitos vigentes
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de faseM_mercadopago.sql.
-- Es IDEMPOTENTE.
--
-- Cuando sube el precio de un plan, los débitos automáticos que ya existen siguen
-- cobrando el monto viejo hasta que se les cambia en Mercado Pago. El cambio se
-- PROGRAMA: se avisa por email al admin de la clínica y rige recién 30 días después
-- del aviso (Términos: «te avisamos antes de que entre en vigencia»). El control
-- diario lo aplica cuando llega la fecha, solo si el aviso salió.
--
-- ROLLBACK:
--   ALTER TABLE suscripcion DROP COLUMN IF EXISTS monto_nuevo,
--     DROP COLUMN IF EXISTS monto_nuevo_desde, DROP COLUMN IF EXISTS aviso_precio_enviado_en;
-- ===========================================================================

ALTER TABLE suscripcion
    ADD COLUMN IF NOT EXISTS monto_nuevo             numeric(12,2) CHECK (monto_nuevo > 0),
    ADD COLUMN IF NOT EXISTS monto_nuevo_desde       timestamptz,
    ADD COLUMN IF NOT EXISTS aviso_precio_enviado_en timestamptz;
