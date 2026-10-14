-- ===========================================================================
-- Medilu — Fase N3: cada profesional decide si recibe turnos online
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de faseN2_turnos_online.sql.
-- Es IDEMPOTENTE.
--
-- Igual que la clínica (Fase N2), pero por profesional: con turnos_online = false
-- no aparece en la reserva pública y /create-event rechaza la reserva. El staff
-- sigue cargándole turnos desde el panel. Si la clínica tiene los turnos online
-- apagados, manda la clínica.
--
-- El profesional lo cambia desde su Configuración con su JWT: la RLS de
-- `profesional` ya le permite actualizar su propia fila (UPDATE a nivel tabla).
--
-- ROLLBACK:
--   ALTER TABLE profesional DROP COLUMN IF EXISTS turnos_online;
-- ===========================================================================

ALTER TABLE profesional
    ADD COLUMN IF NOT EXISTS turnos_online boolean NOT NULL DEFAULT true;
