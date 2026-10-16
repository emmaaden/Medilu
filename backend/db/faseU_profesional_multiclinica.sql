-- =============================================================================
-- Fase U — Profesional en varias clínicas (horarios por clínica)
--
-- Contexto: desde la Fase A la pertenencia a una clínica vive en `membresia`, pero
-- varias cosas seguían usando persona.clinica_id (la clínica de ORIGEN, una sola):
-- los horarios no tenían clínica y la RLS de persona / profesional /
-- especialidad_profesional / horario_profesional solo mostraba a los profesionales
-- cuya clínica de origen era la activa. Un profesional sumado a una segunda clínica
-- (con un código de activación, ver POST /auth/unirse-clinica) quedaba invisible ahí.
--
-- Qué hace:
--   0. Aborta si hay horarios que no se pueden asignar a una clínica.
--   1. horario_profesional.clinica_id (NOT NULL, FK a clinica): cada franja es de
--      una clínica. Los horarios existentes pasan a la clínica de origen del
--      profesional (persona.clinica_id), que es donde se veían hasta ahora.
--   2. app_persona_es_staff(id_persona): ¿la persona tiene membresía ACTIVA en la
--      clínica activa? SECURITY DEFINER para no recorrer la RLS de membresia (que a
--      su vez mira persona: evitaría recursión).
--   3. RLS:
--      - persona / profesional / especialidad_profesional (SELECT): se AGREGA el caso
--        "es del equipo de la clínica activa por membresía". Lo que ya se veía por la
--        clínica de origen se sigue viendo (no se quita acceso).
--      - horario_profesional: la lectura pasa a ser por horario.clinica_id; la
--        escritura del propio profesional queda limitada a la clínica activa.
--
-- Verificado en producción (solo lectura, 2026-10-16): 2 clínicas, 2 profesionales,
-- 3 membresías (ninguno en más de una clínica), 1 horario (profesional 1, con
-- clínica de origen y membresía activa en ella), 1 turno con la misma clínica que
-- la de origen de su profesional, 0 bloqueos. El paso 0 lo vuelve a chequear.
--
-- Ver con: faseU_prueba_en_seco.sql (corre esto adentro y lo deshace).
-- Idempotente: se puede correr más de una vez.
-- Reversión: ver el bloque comentado al final.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Abortar si algún horario no tiene profesional o su profesional no tiene
--    clínica de origen (no habría a qué clínica asignarlo).
-- -----------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n
    FROM horario_profesional h
    LEFT JOIN profesional pr ON pr.id = h.id_profesional
    LEFT JOIN persona pe ON pe.id = pr.id_persona
    WHERE pe.clinica_id IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION 'Fase U: % horario(s) sin profesional o sin clínica de origen. Resolverlos antes.', n;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Clínica de cada horario.
-- -----------------------------------------------------------------------------
ALTER TABLE horario_profesional
    ADD COLUMN IF NOT EXISTS clinica_id uuid REFERENCES clinica(id) ON DELETE CASCADE;

UPDATE horario_profesional h
SET clinica_id = pe.clinica_id
FROM profesional pr
JOIN persona pe ON pe.id = pr.id_persona
WHERE pr.id = h.id_profesional
  AND h.clinica_id IS NULL;

ALTER TABLE horario_profesional ALTER COLUMN clinica_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_horario_profesional_prof_clinica
    ON horario_profesional (id_profesional, clinica_id);

-- -----------------------------------------------------------------------------
-- 2. ¿La persona es del equipo de la clínica activa (membresía activa)?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_persona_es_staff(p_id_persona bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM membresia m
        WHERE m.id_persona = p_id_persona
          AND m.activo = true
          AND m.clinica_id = public.app_current_clinica_id()
    );
$$;
REVOKE ALL ON FUNCTION public.app_persona_es_staff(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_persona_es_staff(bigint) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------

-- persona: igual que antes + las personas del equipo de la clínica activa.
DROP POLICY IF EXISTS persona_select ON persona;
CREATE POLICY persona_select ON persona
    FOR SELECT TO authenticated
    USING (
        (clinica_id = app_current_clinica_id() OR app_persona_es_staff(id))
        AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_persona(id)))
    );

-- profesional: igual que antes + los profesionales del equipo de la clínica activa.
DROP POLICY IF EXISTS profesional_select ON profesional;
CREATE POLICY profesional_select ON profesional
    FOR SELECT TO authenticated
    USING (
        (app_is_clinica_member() AND app_persona_es_staff(id_persona))
        OR id_persona IN (
            SELECT persona.id FROM persona
            WHERE (app_is_clinica_member() AND persona.clinica_id = app_current_clinica_id())
               OR persona.id_auth = auth.uid())
    );

-- especialidad_profesional: ídem.
DROP POLICY IF EXISTS especialidad_profesional_select ON especialidad_profesional;
CREATE POLICY especialidad_profesional_select ON especialidad_profesional
    FOR SELECT TO authenticated
    USING (
        id_profesional IN (
            SELECT pr.id
            FROM profesional pr
            JOIN persona p ON p.id = pr.id_persona
            WHERE (app_is_clinica_member()
                   AND (p.clinica_id = app_current_clinica_id() OR app_persona_es_staff(p.id)))
               OR p.id_auth = auth.uid())
    );

-- horario_profesional: lectura del equipo por la clínica del horario.
DROP POLICY IF EXISTS horario_profesional_select ON horario_profesional;
CREATE POLICY horario_profesional_select ON horario_profesional
    FOR SELECT TO authenticated
    USING (app_is_clinica_member() AND clinica_id = app_current_clinica_id());

-- horario_profesional: el profesional escribe SOLO sus horarios de la clínica activa.
DROP POLICY IF EXISTS horario_profesional_own_write ON horario_profesional;
CREATE POLICY horario_profesional_own_write ON horario_profesional
    FOR ALL TO authenticated
    USING (
        id_profesional = app_current_profesional_id()
        AND clinica_id = app_current_clinica_id())
    WITH CHECK (
        id_profesional = app_current_profesional_id()
        AND clinica_id = app_current_clinica_id());

COMMIT;

-- =============================================================================
-- REVERSIÓN (correr a mano si hiciera falta). Antes de volver atrás, si algún
-- profesional ya tiene horarios en una segunda clínica, esos horarios se mezclan
-- con los de origen (la columna desaparece): revisarlos primero.
-- -----------------------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS horario_profesional_own_write ON horario_profesional;
-- CREATE POLICY horario_profesional_own_write ON horario_profesional FOR ALL TO authenticated
--     USING (id_profesional IN (SELECT pr.id FROM profesional pr JOIN persona p ON p.id = pr.id_persona
--            WHERE p.id_auth = auth.uid()))
--     WITH CHECK (id_profesional IN (SELECT pr.id FROM profesional pr JOIN persona p ON p.id = pr.id_persona
--            WHERE p.id_auth = auth.uid()));
-- DROP POLICY IF EXISTS horario_profesional_select ON horario_profesional;
-- CREATE POLICY horario_profesional_select ON horario_profesional FOR SELECT TO authenticated
--     USING (app_is_clinica_member() AND id_profesional IN (SELECT pr.id FROM profesional pr
--            JOIN persona p ON p.id = pr.id_persona WHERE p.clinica_id = app_current_clinica_id()));
-- DROP POLICY IF EXISTS especialidad_profesional_select ON especialidad_profesional;
-- CREATE POLICY especialidad_profesional_select ON especialidad_profesional FOR SELECT TO authenticated
--     USING (id_profesional IN (SELECT pr.id FROM profesional pr JOIN persona p ON p.id = pr.id_persona
--            WHERE (app_is_clinica_member() AND p.clinica_id = app_current_clinica_id()) OR p.id_auth = auth.uid()));
-- DROP POLICY IF EXISTS profesional_select ON profesional;
-- CREATE POLICY profesional_select ON profesional FOR SELECT TO authenticated
--     USING (id_persona IN (SELECT persona.id FROM persona
--            WHERE (app_is_clinica_member() AND persona.clinica_id = app_current_clinica_id())
--               OR persona.id_auth = auth.uid()));
-- DROP POLICY IF EXISTS persona_select ON persona;
-- CREATE POLICY persona_select ON persona FOR SELECT TO authenticated
--     USING (clinica_id = app_current_clinica_id()
--            AND (app_is_clinica_member() OR (app_is_clinica_auditor() AND app_auditor_ve_persona(id))));
-- DROP FUNCTION IF EXISTS public.app_persona_es_staff(bigint);
-- DROP INDEX IF EXISTS idx_horario_profesional_prof_clinica;
-- ALTER TABLE horario_profesional DROP COLUMN IF EXISTS clinica_id;
-- COMMIT;
-- =============================================================================
