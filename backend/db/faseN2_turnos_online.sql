-- ===========================================================================
-- Medilu — Fase N2: la clínica decide si recibe turnos online
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de faseN_clinica_perfil.sql.
-- Es IDEMPOTENTE.
--
-- Una clínica puede usar el sistema (historias, agenda interna, recepción) sin
-- ofrecer reservas a los pacientes. Con turnos_online = false no aparece en la
-- lista pública de clínicas, no se listan sus profesionales y /create-event
-- rechaza la reserva. El staff sigue cargando turnos desde el panel.
--
-- ROLLBACK:
--   ALTER TABLE clinica DROP COLUMN IF EXISTS turnos_online;
-- ===========================================================================

ALTER TABLE clinica
    ADD COLUMN IF NOT EXISTS turnos_online boolean NOT NULL DEFAULT true;
