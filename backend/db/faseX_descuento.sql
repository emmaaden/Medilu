-- ===========================================================================
-- Medilu — Fase X: descuento manual en la suscripción de una clínica
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de faseM2. Es IDEMPOTENTE.
-- (Ya corrida en producción y en DEV-Medilu el 19/10/2026.)
--
-- El equipo de Medilu le da a una clínica un % de descuento sobre su plan desde el
-- panel de plataforma (lanzamiento, convenio, cortesía), con o sin fecha de fin.
--   * descuento_pct   1–99. NULL = sin descuento.
--   * descuento_hasta fin del descuento (incluido). NULL = sin vencimiento.
-- Vencido, deja de aplicarse solo (las fechas mandan, como en el resto de la
-- suscripción). Con débito de Mercado Pago, bajar el monto rige ya y subirlo (fin
-- del descuento) se avisa con 30 días, igual que un cambio de precio (Fase M2).
--
-- ROLLBACK:
--   ALTER TABLE suscripcion DROP COLUMN IF EXISTS descuento_pct, DROP COLUMN IF EXISTS descuento_hasta;
-- ===========================================================================

ALTER TABLE suscripcion
    ADD COLUMN IF NOT EXISTS descuento_pct   int,
    ADD COLUMN IF NOT EXISTS descuento_hasta timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'suscripcion_descuento_pct_check') THEN
        ALTER TABLE suscripcion
            ADD CONSTRAINT suscripcion_descuento_pct_check CHECK (descuento_pct >= 1 AND descuento_pct <= 99);
    END IF;
END $$;
