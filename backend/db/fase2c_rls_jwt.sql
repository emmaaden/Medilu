-- ===========================================================================
-- Medilu — Fase 2c: RLS real por JWT de usuario
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de fase2_multiclinica.sql
-- y fase2b_turnos_publicos.sql. Es idempotente.
--
-- Objetivo: que el aislamiento por clínica lo garantice POSTGRES (no solo la app).
-- El backend, para las operaciones de usuario autenticado, usa la anon key + el
-- JWT del usuario (rol `authenticated`), y estas políticas filtran por clinica_id
-- a partir de auth.uid(). El `service_role` (resto del backend) SALTEA la RLS,
-- así que los endpoints todavía no migrados siguen funcionando igual.
--
-- Alcance de esta fase (piloto historia clínica): persona, paciente,
-- profesional, registro_clinico, registro_diente, especialidad_profesional,
-- especialidad (catálogo, solo lectura).
--
-- ROLLBACK: para desactivar la RLS de una tabla si algo se rompe:
--   ALTER TABLE <tabla> DISABLE ROW LEVEL SECURITY;
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Helper: clinica_id del usuario autenticado (a partir del JWT auth.uid()).
--    SECURITY DEFINER + search_path fijo: lee persona salteando su propia RLS,
--    evitando recursión en la política de persona.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_current_clinica_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT clinica_id FROM persona WHERE id_auth = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.app_current_clinica_id() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Privilegios de tabla para el rol authenticated (Supabase suele otorgarlos
--    por defecto; los reafirmamos por si acaso). La RLS es la que filtra filas.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
    persona, paciente, profesional, registro_clinico, registro_diente,
    especialidad_profesional
TO authenticated;
GRANT SELECT ON especialidad TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Habilitar RLS + políticas por clínica.
--    Se usa el patrón DROP POLICY IF EXISTS + CREATE para que sea idempotente.
-- ---------------------------------------------------------------------------

-- persona: solo la propia clínica.
ALTER TABLE persona ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS persona_tenant ON persona;
CREATE POLICY persona_tenant ON persona
    FOR ALL TO authenticated
    USING (clinica_id = public.app_current_clinica_id())
    WITH CHECK (clinica_id = public.app_current_clinica_id());

-- profesional: los profesionales de la propia clínica (vía persona).
ALTER TABLE profesional ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profesional_tenant ON profesional;
CREATE POLICY profesional_tenant ON profesional
    FOR ALL TO authenticated
    USING (id_persona IN (SELECT id FROM persona WHERE clinica_id = public.app_current_clinica_id()))
    WITH CHECK (id_persona IN (SELECT id FROM persona WHERE clinica_id = public.app_current_clinica_id()));

-- paciente: los pacientes de la propia clínica (vía persona).
ALTER TABLE paciente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paciente_tenant ON paciente;
CREATE POLICY paciente_tenant ON paciente
    FOR ALL TO authenticated
    USING (id_persona IN (SELECT id FROM persona WHERE clinica_id = public.app_current_clinica_id()))
    WITH CHECK (id_persona IN (SELECT id FROM persona WHERE clinica_id = public.app_current_clinica_id()));

-- registro_clinico: tiene clinica_id propio.
ALTER TABLE registro_clinico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registro_clinico_tenant ON registro_clinico;
CREATE POLICY registro_clinico_tenant ON registro_clinico
    FOR ALL TO authenticated
    USING (clinica_id = public.app_current_clinica_id())
    WITH CHECK (clinica_id = public.app_current_clinica_id());

-- registro_diente: vía el registro_clinico padre.
ALTER TABLE registro_diente ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registro_diente_tenant ON registro_diente;
CREATE POLICY registro_diente_tenant ON registro_diente
    FOR ALL TO authenticated
    USING (id_registro IN (SELECT id FROM registro_clinico WHERE clinica_id = public.app_current_clinica_id()))
    WITH CHECK (id_registro IN (SELECT id FROM registro_clinico WHERE clinica_id = public.app_current_clinica_id()));

-- especialidad_profesional: vía profesional -> persona -> clínica.
ALTER TABLE especialidad_profesional ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS especialidad_profesional_tenant ON especialidad_profesional;
CREATE POLICY especialidad_profesional_tenant ON especialidad_profesional
    FOR ALL TO authenticated
    USING (id_profesional IN (
        SELECT pr.id FROM profesional pr
        JOIN persona p ON p.id = pr.id_persona
        WHERE p.clinica_id = public.app_current_clinica_id()))
    WITH CHECK (id_profesional IN (
        SELECT pr.id FROM profesional pr
        JOIN persona p ON p.id = pr.id_persona
        WHERE p.clinica_id = public.app_current_clinica_id()));

-- especialidad: catálogo global, solo lectura para cualquier usuario autenticado.
ALTER TABLE especialidad ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS especialidad_read ON especialidad;
CREATE POLICY especialidad_read ON especialidad
    FOR SELECT TO authenticated
    USING (true);
