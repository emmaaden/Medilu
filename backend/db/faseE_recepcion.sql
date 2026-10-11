-- ===========================================================================
-- Medilu — Fase E: rol de RECEPCIÓN (gestión de turnos de la clínica)
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase. Es idempotente.
--
-- Contexto: el rol `recepcion` ya existía en `membresia.rol` (Fase A) pero no
-- había forma de crear una cuenta de recepción ni de gestionar turnos como staff.
--
-- Esta fase habilita el ALTA por CÓDIGO: un código de activación puede apuntar a
-- un rol concreto ('profesional' | 'recepcion'). Al registrarse con un código de
-- recepción, la persona queda con una `membresia(rol='recepcion')` y SIN fila en
-- `profesional` (no es un profesional: no tiene matrícula ni especialidad).
--
-- La gestión de turnos del staff (listar/buscar/crear/reprogramar/cancelar) la hace
-- el BACKEND con service_role, acotada por la clínica activa de la sesión (igual que
-- el panel de administración de la Fase B). Por eso NO se agregan políticas de
-- UPDATE/INSERT sobre `turno` para el staff: la RLS existente (turno_clinica_select)
-- ya permite la lectura por-JWT y el resto pasa por el backend.
--
-- ROLLBACK:
--   ALTER TABLE codigo_activacion DROP COLUMN IF EXISTS rol;
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. El código de activación lleva el ROL destino de quien lo use.
--    Default 'profesional' -> los códigos existentes siguen sirviendo para
--    sumar profesionales, sin cambios de comportamiento.
-- ---------------------------------------------------------------------------
ALTER TABLE codigo_activacion
    ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'profesional';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'codigo_activacion_rol_check'
    ) THEN
        ALTER TABLE codigo_activacion
            ADD CONSTRAINT codigo_activacion_rol_check
            CHECK (rol IN ('profesional', 'recepcion'));
    END IF;
END $$;
