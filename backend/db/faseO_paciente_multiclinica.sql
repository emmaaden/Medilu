-- ===========================================================================
-- Medilu — Fase O: un paciente (una cuenta) con historia en varias clínicas
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de faseN3. Es IDEMPOTENTE.
--
-- `persona` es por clínica (UNIQUE (clinica_id, dni)). Hasta ahora una cuenta de
-- Auth podía estar vinculada a UNA sola persona (persona_id_auth_key). Ahora una
-- cuenta puede tener una persona por clínica (más, como mucho, una sin clínica: la
-- del autoregistro). La cuenta de un profesional/recepción también puede tener
-- fichas de paciente en otras clínicas (elige con qué perfil entrar).
--
--   1. persona_id_auth_key (id_auth)  ->  persona_id_auth_clinica_key (id_auth, clinica_id)
--      NULLS NOT DISTINCT: una sola persona sin clínica por cuenta.
--   2. app_es_mi_paciente(id): ¿ese paciente.id es de una persona de mi cuenta?
--      Reemplaza `id_paciente = app_current_paciente_id()` (que veía uno solo) en las
--      políticas de turno, estudio y certificado.
--   3. app_current_paciente_id() queda (compatibilidad) con un orden fijo.
--
-- ROLLBACK (solo si ninguna cuenta tiene más de una persona):
--   DROP INDEX IF EXISTS persona_id_auth_clinica_key;
--   CREATE UNIQUE INDEX persona_id_auth_key ON persona (id_auth) WHERE id_auth IS NOT NULL;
--   y volver a crear las políticas de abajo con `id_paciente = public.app_current_paciente_id()`.
-- ===========================================================================

-- 1. Unicidad por (cuenta, clínica) en vez de por cuenta.
CREATE UNIQUE INDEX IF NOT EXISTS persona_id_auth_clinica_key
    ON public.persona (id_auth, clinica_id) NULLS NOT DISTINCT
    WHERE id_auth IS NOT NULL;
DROP INDEX IF EXISTS public.persona_id_auth_key;

-- 2. Pacientes de la cuenta logueada.
CREATE OR REPLACE FUNCTION public.app_es_mi_paciente(p_id_paciente bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM paciente pa
        JOIN persona pe ON pe.id = pa.id_persona
        WHERE pa.id = p_id_paciente
          AND pe.id_auth = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.app_es_mi_paciente(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_es_mi_paciente(bigint) TO authenticated, service_role;

-- 3. Compatibilidad: el "principal" es la ficha sin clínica (autoregistro) o la más vieja.
CREATE OR REPLACE FUNCTION public.app_current_paciente_id()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT pa.id
    FROM paciente pa
    JOIN persona pe ON pe.id = pa.id_persona
    WHERE pe.id_auth = auth.uid()
    ORDER BY (pe.clinica_id IS NULL) DESC, pa.id
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.app_estudio_es_mio(p_id_estudio bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1 FROM estudio e
        WHERE e.id = p_id_estudio AND public.app_es_mi_paciente(e.id_paciente)
    );
$$;

-- 4. Políticas del paciente: todos sus pacientes, no uno.
DROP POLICY IF EXISTS turno_paciente_select ON public.turno;
CREATE POLICY turno_paciente_select ON public.turno
    FOR SELECT TO authenticated
    USING (public.app_es_mi_paciente(id_paciente));

DROP POLICY IF EXISTS turno_paciente_update ON public.turno;
CREATE POLICY turno_paciente_update ON public.turno
    FOR UPDATE TO authenticated
    USING (public.app_es_mi_paciente(id_paciente))
    WITH CHECK (public.app_es_mi_paciente(id_paciente));

DROP POLICY IF EXISTS estudio_select ON public.estudio;
CREATE POLICY estudio_select ON public.estudio
    FOR SELECT TO authenticated
    USING (
        public.app_es_mi_paciente(id_paciente)
        OR public.app_estudio_compartido_conmigo(id)
    );

DROP POLICY IF EXISTS estudio_insert ON public.estudio;
CREATE POLICY estudio_insert ON public.estudio
    FOR INSERT TO authenticated
    WITH CHECK (public.app_es_mi_paciente(id_paciente));

DROP POLICY IF EXISTS estudio_update ON public.estudio;
CREATE POLICY estudio_update ON public.estudio
    FOR UPDATE TO authenticated
    USING (public.app_es_mi_paciente(id_paciente))
    WITH CHECK (public.app_es_mi_paciente(id_paciente));

DROP POLICY IF EXISTS estudio_delete ON public.estudio;
CREATE POLICY estudio_delete ON public.estudio
    FOR DELETE TO authenticated
    USING (public.app_es_mi_paciente(id_paciente));

DROP POLICY IF EXISTS certificado_select ON public.certificado_medico;
CREATE POLICY certificado_select ON public.certificado_medico
    FOR SELECT TO authenticated
    USING (
        (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
        OR public.app_es_mi_paciente(id_paciente)
    );
