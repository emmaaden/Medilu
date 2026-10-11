-- ===========================================================================
-- Medilu — Fase C.2: FIX de RLS — distinguir staff de pacientes
-- ---------------------------------------------------------------------------
-- Ejecutar en Supabase DESPUÉS de faseC_certificados.sql. Idempotente.
--
-- MOTIVO (bug encontrado en la verificación E2E de la Fase C):
--   `app_current_clinica_id()` devuelve, para los PACIENTES (que no tienen membresía),
--   su clínica de origen por FALLBACK (persona.clinica_id). Por eso una política con la
--   rama `clinica_id = app_current_clinica_id()` daba verdadero también para cualquier
--   paciente de esa clínica → un paciente veía los certificados de TODA la clínica
--   (y podía auto-insertarse uno vía API directa).
--
-- FIX: la rama "por clínica" debe exigir además ser MIEMBRO del staff (membresía
--   activa) con el helper app_is_clinica_member(). El acceso del paciente se rige solo
--   por la rama del dueño (id_paciente = app_current_paciente_id()).
--
-- Nota: los archivos faseA_membresia.sql y faseC_certificados.sql ya incorporan estas
--   versiones corregidas; este archivo es el parche aplicado sobre la base ya migrada.
-- ===========================================================================

-- Helper: ¿miembro del staff (membresía activa) de la clínica activa?
CREATE OR REPLACE FUNCTION public.app_is_clinica_member()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM membresia m
        JOIN persona pe ON pe.id = m.id_persona
        WHERE pe.id_auth = auth.uid()
          AND m.activo = true
          AND m.clinica_id = public.app_current_clinica_id()
    );
$$;
GRANT EXECUTE ON FUNCTION public.app_is_clinica_member() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_is_clinica_member() FROM anon, public;

-- certificado_medico: staff de la clínica O el paciente dueño.
DROP POLICY IF EXISTS certificado_select ON certificado_medico;
CREATE POLICY certificado_select ON certificado_medico
    FOR SELECT TO authenticated
    USING (
        (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
        OR id_paciente = public.app_current_paciente_id()
    );

DROP POLICY IF EXISTS certificado_insert ON certificado_medico;
CREATE POLICY certificado_insert ON certificado_medico
    FOR INSERT TO authenticated
    WITH CHECK (
        public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id()
    );

-- membresia: ver las de la clínica solo si sos staff; más las propias (para el selector).
DROP POLICY IF EXISTS membresia_select ON membresia;
CREATE POLICY membresia_select ON membresia
    FOR SELECT TO authenticated
    USING (
        (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
        OR id_persona IN (SELECT id FROM persona WHERE id_auth = auth.uid())
    );
