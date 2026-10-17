-- =============================================================================
-- Fase W — Rendimiento de la RLS de lectura (mismo acceso, menos trabajo)
--
-- Contexto: las políticas SELECT llaman a las funciones app_* (SECURITY DEFINER con
-- search_path fijo: Postgres no las puede "inlinear") sin envolverlas en
-- (select …), así que se evalúan POR FILA. app_current_clinica_id() sola hace varias
-- consultas; app_is_clinica_member() cuesta ~0,6 ms por llamada. Además:
--   - registro_diagnostico / registro_practica usan id_registro IN (SELECT id FROM
--     registro_clinico): Postgres arma un "hashed SubPlan" que recorre TODAS las
--     consultas visibles de la clínica (con la RLS de registro_clinico por fila)
--     aunque se pidan las de un solo paciente.
--   - especialidad_profesional / profesional / paciente / membresia: subselect con
--     IN que arrastra la RLS de persona (y app_persona_es_staff(id) por fila).
--   - auditor: app_auditor_ve_paciente(id) / app_auditor_ve_persona(id) por fila,
--     cada una con 4-6 consultas adentro.
-- Medido en DEV-Medilu con el seed (clínica 1: 1.488 consultas): abrir la ficha
-- 1,56 s, bandeja de auditoría 10-20 s, especialidad de un profesional 1,0 s.
--
-- Qué hace (la semántica de acceso queda IDÉNTICA):
--   1. Funciones nuevas (SECURITY DEFINER, se calculan una vez por consulta):
--      - app_staff_persona_ids(): personas con membresía activa en la clínica
--        activa. app_persona_es_staff(x)  ≡  x = ANY(app_staff_persona_ids()).
--      - app_auditor_pacientes_alcance() / app_auditor_personas_alcance(): pacientes
--        (y sus personas) dentro del alcance del auditor por obra social (por id de
--        catálogo o, si no hay, por texto legado). Para un auditor:
--          app_auditor_ve_paciente(x) ≡ app_auditor_es_interno()
--                                       OR x IN (app_auditor_pacientes_alcance())
--          app_auditor_ve_persona(p)  ≡ app_auditor_es_interno()
--                                       OR p IN (app_auditor_personas_alcance())
--                                       OR app_persona_sin_ficha(p)
--   2. Políticas SELECT de persona, paciente, profesional, especialidad_profesional,
--      membresia, registro_clinico, registro_diente, registro_diagnostico,
--      registro_practica, autorizacion, autorizacion_adjunto y practica:
--      - funciones sin argumentos -> (select fn());
--      - IN (SELECT …) -> EXISTS correlacionado. La tabla del subselect SIGUE
--        pasando por su propia RLS, igual que antes (por eso lo visible no cambia).
--   No toca las funciones existentes (las usan otras políticas) ni las políticas de
--   escritura.
--
-- Índices: registro_diagnostico(id_registro, codigo), registro_practica(id_registro),
-- registro_clinico(id_paciente) y (clinica_id, auditoria_estado) ya existen; con las
-- políticas nuevas los planes los usan y no hace falta uno nuevo.
--
-- Verificado en DEV-Medilu (2026-10-17): 25 sujetos (admin, profesional en 3
-- clínicas, sin header y con header de clínica ajena, recepción, recepcionista que
-- es paciente, auditores internos / Galeno / PAMI / OSDE / OSDE solo por texto,
-- pacientes con 1 y 3 fichas, autoregistrado, uid sin persona) × 12 tablas: misma
-- cantidad y mismo md5 de ids visibles antes y después (300/300). Tiempos (mediana,
-- como authenticated con JWT y x-clinica-id):
--     ficha completa de un paciente (31 consultas)     1.560 ms -> 10 ms
--     bandeja de auditoría, auditor interno / Galeno  20.431 / 9.999 ms -> 53 / 47 ms
--     cargar una autorización (auditor)                2.008 ms -> 27 ms
--     especialidad de un profesional                   1.048 ms -> 8 ms
--     persona por DNI                                    320 ms -> 6 ms
-- El orden DENTRO de los arrays embebidos sin ORDER BY puede cambiar con el plan
-- (el contenido es el mismo); PostgREST tampoco lo garantizaba antes.
--
-- El paso 0 aborta si alguna política no es exactamente la que se midió (así la
-- reversión deja lo que había).
-- Idempotente: se puede correr más de una vez (el paso 0 acepta también la versión
-- de esta fase).
-- Reversión: ver el bloque comentado al final.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Las políticas actuales tienen que ser las esperadas (las de antes de esta
--    fase, o las de esta fase si ya se corrió).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    esperado jsonb := jsonb_build_object(
        'persona.persona_select',
            '(((clinica_id = app_current_clinica_id()) OR app_persona_es_staff(id)) AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_persona(id))))',
        'persona.persona_propia_select',
            '(id_auth = auth.uid())',
        'paciente.paciente_select',
            E'((id_persona IN ( SELECT persona.id\n   FROM persona\n  WHERE (persona.clinica_id = app_current_clinica_id()))) AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_paciente(id))))',
        'profesional.profesional_select',
            E'((app_is_clinica_member() AND app_persona_es_staff(id_persona)) OR (id_persona IN ( SELECT persona.id\n   FROM persona\n  WHERE ((app_is_clinica_member() AND (persona.clinica_id = app_current_clinica_id())) OR (persona.id_auth = auth.uid())))))',
        'especialidad_profesional.especialidad_profesional_select',
            E'(id_profesional IN ( SELECT pr.id\n   FROM (profesional pr\n     JOIN persona p ON ((p.id = pr.id_persona)))\n  WHERE ((app_is_clinica_member() AND ((p.clinica_id = app_current_clinica_id()) OR app_persona_es_staff(p.id))) OR (p.id_auth = auth.uid()))))',
        'membresia.membresia_select',
            E'((app_is_clinica_member() AND (clinica_id = app_current_clinica_id())) OR (id_persona IN ( SELECT persona.id\n   FROM persona\n  WHERE (persona.id_auth = auth.uid()))))',
        'registro_clinico.registro_clinico_select',
            '((clinica_id = app_current_clinica_id()) AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_paciente(id_paciente))))',
        'registro_diente.registro_diente_select',
            E'(id_registro IN ( SELECT rc.id\n   FROM registro_clinico rc\n  WHERE ((rc.clinica_id = app_current_clinica_id()) AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_paciente(rc.id_paciente))))))',
        'registro_diagnostico.registro_diagnostico_select',
            E'(id_registro IN ( SELECT registro_clinico.id\n   FROM registro_clinico))',
        'registro_practica.registro_practica_select',
            E'(id_registro IN ( SELECT registro_clinico.id\n   FROM registro_clinico))',
        'autorizacion.autorizacion_select',
            '((clinica_id = app_current_clinica_id()) AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_paciente(id_paciente))))',
        'autorizacion_adjunto.autorizacion_adjunto_select',
            E'(id_autorizacion IN ( SELECT autorizacion.id\n   FROM autorizacion))',
        'practica.practica_select',
            '((clinica_id = app_current_clinica_id()) AND (app_is_clinica_member() OR app_is_clinica_auditor()))'
    );
    -- Versión de esta fase (re-ejecución): md5 del texto tal como lo guarda Postgres.
    nuevo jsonb := jsonb_build_object(
        'autorizacion.autorizacion_select', '9b9cbf83d9787cbcc13e563a7fb6ac85',
        'autorizacion_adjunto.autorizacion_adjunto_select', '21afb82f190eb581e82ffc7014e8ec08',
        'especialidad_profesional.especialidad_profesional_select', '640072b09f7499238cd5c440416490f7',
        'membresia.membresia_select', '350c99115b3bf2c698668bb2f93b2ae4',
        'paciente.paciente_select', '312d9aa18608321dfd3a85ca34305989',
        'persona.persona_propia_select', 'e636260ca7e568ddba5b7cefb339a2e5',
        'persona.persona_select', '113759cd9570824a237c9d65993661b9',
        'practica.practica_select', 'fb20e90f49e8aeee8034693cb2a56012',
        'profesional.profesional_select', '8c59f24cb9963e5df7d6d8c28af5d01f',
        'registro_clinico.registro_clinico_select', '9b9cbf83d9787cbcc13e563a7fb6ac85',
        'registro_diagnostico.registro_diagnostico_select', '0d945300742ad7b9cb128d15bfab60b2',
        'registro_diente.registro_diente_select', '974f593571dd0ffe9b1af81808800775',
        'registro_practica.registro_practica_select', '5cc4d696e8fba23696b6abbdf8c7117c'
    );
    k text;
    actual text;
    raros text := '';
BEGIN
    FOR k IN SELECT jsonb_object_keys(esperado) LOOP
        SELECT p.qual INTO actual
        FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND p.tablename = split_part(k, '.', 1)
          AND p.policyname = split_part(k, '.', 2)
          AND p.cmd = 'SELECT';
        IF actual IS DISTINCT FROM esperado->>k AND md5(actual) IS DISTINCT FROM nuevo->>k THEN
            raros := raros || ' ' || k;
        END IF;
    END LOOP;
    IF raros <> '' THEN
        RAISE EXCEPTION 'Fase W: estas políticas no son las esperadas, revisarlas antes:%', raros;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Funciones de conjunto (una evaluación por consulta).
-- -----------------------------------------------------------------------------

-- Personas con membresía ACTIVA (cualquier rol) en la clínica activa.
-- Mismo criterio que app_persona_es_staff(id_persona). Vacío si no hay clínica activa.
CREATE OR REPLACE FUNCTION public.app_staff_persona_ids()
RETURNS bigint[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(array_agg(m.id_persona), '{}')
    FROM membresia m
    WHERE m.activo = true
      AND m.clinica_id = public.app_current_clinica_id();
$$;
REVOKE ALL ON FUNCTION public.app_staff_persona_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_staff_persona_ids() TO authenticated;

-- Pacientes dentro del alcance del auditor de la clínica activa: por id de catálogo
-- (app_auditor_alcance_id) o, si no tiene, por texto legado (app_auditor_alcance).
-- Mismas ramas que app_auditor_ve_paciente(). Vacío para el auditor interno y para
-- quien no es auditor (en las políticas siempre va detrás de app_is_clinica_auditor()
-- y de app_auditor_es_interno()).
CREATE OR REPLACE FUNCTION public.app_auditor_pacientes_alcance()
RETURNS SETOF bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
ROWS 200
AS $$
    SELECT pa.id
    FROM paciente pa
    WHERE pa.id_obra_social = (SELECT public.app_auditor_alcance_id())
    UNION ALL
    SELECT pa.id
    FROM paciente pa
    WHERE (SELECT public.app_auditor_alcance_id()) IS NULL
      AND (SELECT public.app_auditor_alcance()) IS NOT NULL
      AND lower(trim(pa.obra_social)) = (SELECT public.app_auditor_alcance());
$$;
REVOKE ALL ON FUNCTION public.app_auditor_pacientes_alcance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_auditor_pacientes_alcance() TO authenticated;

-- Personas de esos pacientes (para la RLS de persona: app_auditor_ve_persona).
CREATE OR REPLACE FUNCTION public.app_auditor_personas_alcance()
RETURNS SETOF bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
ROWS 200
AS $$
    SELECT pa.id_persona
    FROM paciente pa
    WHERE pa.id IN (SELECT public.app_auditor_pacientes_alcance());
$$;
REVOKE ALL ON FUNCTION public.app_auditor_personas_alcance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_auditor_personas_alcance() TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Políticas SELECT. Para cada una, la versión anterior está en la reversión.
-- -----------------------------------------------------------------------------

-- persona: (clínica de origen o equipo) y (miembro, o auditor que la ve).
DROP POLICY IF EXISTS persona_select ON persona;
CREATE POLICY persona_select ON persona
    FOR SELECT TO authenticated
    USING (
        (clinica_id = (SELECT app_current_clinica_id())
         OR id = ANY ((SELECT app_staff_persona_ids())::bigint[]))
        AND (
            (SELECT app_is_clinica_member())
            OR ((SELECT app_is_clinica_auditor())
                AND ((SELECT app_auditor_es_interno())
                     OR id IN (SELECT app_auditor_personas_alcance())
                     OR app_persona_sin_ficha(id)))
        )
    );

DROP POLICY IF EXISTS persona_propia_select ON persona;
CREATE POLICY persona_propia_select ON persona
    FOR SELECT TO authenticated
    USING (id_auth = (SELECT auth.uid()));

-- paciente: su persona es de la clínica activa (y visible, por la RLS de persona) y
-- (miembro, o auditor que lo ve).
DROP POLICY IF EXISTS paciente_select ON paciente;
CREATE POLICY paciente_select ON paciente
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM persona pe
            WHERE pe.id = paciente.id_persona
              AND pe.clinica_id = (SELECT app_current_clinica_id()))
        AND (
            (SELECT app_is_clinica_member())
            OR ((SELECT app_is_clinica_auditor())
                AND ((SELECT app_auditor_es_interno())
                     OR id IN (SELECT app_auditor_pacientes_alcance())))
        )
    );

-- profesional: del equipo de la clínica activa, o con persona visible de la clínica
-- activa, o el propio.
DROP POLICY IF EXISTS profesional_select ON profesional;
CREATE POLICY profesional_select ON profesional
    FOR SELECT TO authenticated
    USING (
        ((SELECT app_is_clinica_member())
         AND id_persona = ANY ((SELECT app_staff_persona_ids())::bigint[]))
        OR EXISTS (
            SELECT 1 FROM persona pe
            WHERE pe.id = profesional.id_persona
              AND (((SELECT app_is_clinica_member())
                    AND pe.clinica_id = (SELECT app_current_clinica_id()))
                   OR pe.id_auth = (SELECT auth.uid())))
    );

-- especialidad_profesional: ídem (profesional y persona siguen con su RLS).
DROP POLICY IF EXISTS especialidad_profesional_select ON especialidad_profesional;
CREATE POLICY especialidad_profesional_select ON especialidad_profesional
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM profesional pr
            JOIN persona p ON p.id = pr.id_persona
            WHERE pr.id = especialidad_profesional.id_profesional
              AND (((SELECT app_is_clinica_member())
                    AND (p.clinica_id = (SELECT app_current_clinica_id())
                         OR p.id = ANY ((SELECT app_staff_persona_ids())::bigint[])))
                   OR p.id_auth = (SELECT auth.uid())))
    );

-- membresia: las de la clínica activa (miembro) o las propias.
DROP POLICY IF EXISTS membresia_select ON membresia;
CREATE POLICY membresia_select ON membresia
    FOR SELECT TO authenticated
    USING (
        ((SELECT app_is_clinica_member())
         AND clinica_id = (SELECT app_current_clinica_id()))
        OR EXISTS (
            SELECT 1 FROM persona pe
            WHERE pe.id = membresia.id_persona
              AND pe.id_auth = (SELECT auth.uid()))
    );

-- registro_clinico: de la clínica activa y (miembro, o auditor que ve al paciente).
DROP POLICY IF EXISTS registro_clinico_select ON registro_clinico;
CREATE POLICY registro_clinico_select ON registro_clinico
    FOR SELECT TO authenticated
    USING (
        clinica_id = (SELECT app_current_clinica_id())
        AND (
            (SELECT app_is_clinica_member())
            OR ((SELECT app_is_clinica_auditor())
                AND ((SELECT app_auditor_es_interno())
                     OR id_paciente IN (SELECT app_auditor_pacientes_alcance())))
        )
    );

-- registro_diente: su registro es visible (mismas condiciones, explícitas como antes).
DROP POLICY IF EXISTS registro_diente_select ON registro_diente;
CREATE POLICY registro_diente_select ON registro_diente
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM registro_clinico rc
            WHERE rc.id = registro_diente.id_registro
              AND rc.clinica_id = (SELECT app_current_clinica_id())
              AND ((SELECT app_is_clinica_member())
                   OR ((SELECT app_is_clinica_auditor())
                       AND ((SELECT app_auditor_es_interno())
                            OR rc.id_paciente IN (SELECT app_auditor_pacientes_alcance())))))
    );

-- registro_diagnostico / registro_practica: su registro es visible (RLS de registro_clinico).
DROP POLICY IF EXISTS registro_diagnostico_select ON registro_diagnostico;
CREATE POLICY registro_diagnostico_select ON registro_diagnostico
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM registro_clinico rc WHERE rc.id = registro_diagnostico.id_registro)
    );

DROP POLICY IF EXISTS registro_practica_select ON registro_practica;
CREATE POLICY registro_practica_select ON registro_practica
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM registro_clinico rc WHERE rc.id = registro_practica.id_registro)
    );

-- autorizacion: de la clínica activa y (miembro, o auditor que ve al paciente).
DROP POLICY IF EXISTS autorizacion_select ON autorizacion;
CREATE POLICY autorizacion_select ON autorizacion
    FOR SELECT TO authenticated
    USING (
        clinica_id = (SELECT app_current_clinica_id())
        AND (
            (SELECT app_is_clinica_member())
            OR ((SELECT app_is_clinica_auditor())
                AND ((SELECT app_auditor_es_interno())
                     OR id_paciente IN (SELECT app_auditor_pacientes_alcance())))
        )
    );

-- autorizacion_adjunto: su autorización es visible (RLS de autorizacion).
DROP POLICY IF EXISTS autorizacion_adjunto_select ON autorizacion_adjunto;
CREATE POLICY autorizacion_adjunto_select ON autorizacion_adjunto
    FOR SELECT TO authenticated
    USING (
        EXISTS (SELECT 1 FROM autorizacion a WHERE a.id = autorizacion_adjunto.id_autorizacion)
    );

-- practica: catálogo de la clínica activa para el staff y el auditor.
DROP POLICY IF EXISTS practica_select ON practica;
CREATE POLICY practica_select ON practica
    FOR SELECT TO authenticated
    USING (
        clinica_id = (SELECT app_current_clinica_id())
        AND ((SELECT app_is_clinica_member()) OR (SELECT app_is_clinica_auditor()))
    );

COMMIT;

-- =============================================================================
-- REVERSIÓN (correr a mano si hiciera falta). Deja las políticas exactamente como
-- estaban antes de esta fase y borra las funciones nuevas.
-- -----------------------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS persona_select ON persona;
-- CREATE POLICY persona_select ON persona FOR SELECT TO authenticated
--     USING ((clinica_id = app_current_clinica_id() OR app_persona_es_staff(id))
--            AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_persona(id))));
-- DROP POLICY IF EXISTS persona_propia_select ON persona;
-- CREATE POLICY persona_propia_select ON persona FOR SELECT TO authenticated
--     USING (id_auth = auth.uid());
-- DROP POLICY IF EXISTS paciente_select ON paciente;
-- CREATE POLICY paciente_select ON paciente FOR SELECT TO authenticated
--     USING (id_persona IN (SELECT persona.id FROM persona WHERE persona.clinica_id = app_current_clinica_id())
--            AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_paciente(id))));
-- DROP POLICY IF EXISTS profesional_select ON profesional;
-- CREATE POLICY profesional_select ON profesional FOR SELECT TO authenticated
--     USING ((app_is_clinica_member() AND app_persona_es_staff(id_persona))
--            OR id_persona IN (SELECT persona.id FROM persona
--                WHERE (app_is_clinica_member() AND persona.clinica_id = app_current_clinica_id())
--                   OR persona.id_auth = auth.uid()));
-- DROP POLICY IF EXISTS especialidad_profesional_select ON especialidad_profesional;
-- CREATE POLICY especialidad_profesional_select ON especialidad_profesional FOR SELECT TO authenticated
--     USING (id_profesional IN (SELECT pr.id FROM profesional pr JOIN persona p ON p.id = pr.id_persona
--            WHERE (app_is_clinica_member()
--                   AND (p.clinica_id = app_current_clinica_id() OR app_persona_es_staff(p.id)))
--               OR p.id_auth = auth.uid()));
-- DROP POLICY IF EXISTS membresia_select ON membresia;
-- CREATE POLICY membresia_select ON membresia FOR SELECT TO authenticated
--     USING ((app_is_clinica_member() AND clinica_id = app_current_clinica_id())
--            OR id_persona IN (SELECT persona.id FROM persona WHERE persona.id_auth = auth.uid()));
-- DROP POLICY IF EXISTS registro_clinico_select ON registro_clinico;
-- CREATE POLICY registro_clinico_select ON registro_clinico FOR SELECT TO authenticated
--     USING (clinica_id = app_current_clinica_id()
--            AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_paciente(id_paciente))));
-- DROP POLICY IF EXISTS registro_diente_select ON registro_diente;
-- CREATE POLICY registro_diente_select ON registro_diente FOR SELECT TO authenticated
--     USING (id_registro IN (SELECT rc.id FROM registro_clinico rc
--            WHERE rc.clinica_id = app_current_clinica_id()
--              AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_paciente(rc.id_paciente)))));
-- DROP POLICY IF EXISTS registro_diagnostico_select ON registro_diagnostico;
-- CREATE POLICY registro_diagnostico_select ON registro_diagnostico FOR SELECT TO authenticated
--     USING (id_registro IN (SELECT registro_clinico.id FROM registro_clinico));
-- DROP POLICY IF EXISTS registro_practica_select ON registro_practica;
-- CREATE POLICY registro_practica_select ON registro_practica FOR SELECT TO authenticated
--     USING (id_registro IN (SELECT registro_clinico.id FROM registro_clinico));
-- DROP POLICY IF EXISTS autorizacion_select ON autorizacion;
-- CREATE POLICY autorizacion_select ON autorizacion FOR SELECT TO authenticated
--     USING (clinica_id = app_current_clinica_id()
--            AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_paciente(id_paciente))));
-- DROP POLICY IF EXISTS autorizacion_adjunto_select ON autorizacion_adjunto;
-- CREATE POLICY autorizacion_adjunto_select ON autorizacion_adjunto FOR SELECT TO authenticated
--     USING (id_autorizacion IN (SELECT autorizacion.id FROM autorizacion));
-- DROP POLICY IF EXISTS practica_select ON practica;
-- CREATE POLICY practica_select ON practica FOR SELECT TO authenticated
--     USING (clinica_id = app_current_clinica_id() AND (app_is_clinica_member() OR app_is_clinica_auditor()));
-- DROP FUNCTION IF EXISTS public.app_auditor_personas_alcance();
-- DROP FUNCTION IF EXISTS public.app_auditor_pacientes_alcance();
-- DROP FUNCTION IF EXISTS public.app_staff_persona_ids();
-- COMMIT;
-- =============================================================================
