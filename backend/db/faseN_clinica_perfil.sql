-- ===========================================================================
-- Medilu — Fase N: perfil público de la clínica (dirección + descripción)
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase. Es IDEMPOTENTE.
--
-- El paciente elige la clínica antes de sacar un turno y ve su dirección y una
-- descripción opcional. Las carga el ADMIN de la clínica desde Administración.
-- Las escrituras pasan por el backend (service_role acotado a la clínica activa);
-- no se agregan políticas RLS nuevas.
--
-- ROLLBACK:
--   ALTER TABLE clinica DROP COLUMN IF EXISTS direccion, DROP COLUMN IF EXISTS descripcion;
-- ===========================================================================

ALTER TABLE clinica
    ADD COLUMN IF NOT EXISTS direccion   text CHECK (char_length(direccion) <= 200),
    ADD COLUMN IF NOT EXISTS descripcion text CHECK (char_length(descripcion) <= 1000);
