-- =============================================================================
-- Fase P — Endurecer la RLS y los GRANT del rol `authenticated`
-- (auditoría 2026-10-15, hallazgos 1, 2, 4, 5 y 6: AUDITORIA_FLUJOS_2026-10-15.md)
--
-- Contexto: la anon key es pública, así que cualquier cuenta puede hablar con
-- PostgREST directo. Las políticas FOR ALL (y el GRANT de todas las columnas) dejaban
-- escribir mucho más de lo que el backend usa por JWT. Esta fase deja SOLO lo que el
-- backend hace "como el usuario" (getUserSupabase); el resto va por service_role, que
-- saltea la RLS y los GRANT, y no cambia.
--
-- Escrituras por JWT que el backend necesita (y que quedan permitidas):
--   persona            INSERT de la ficha nueva (id_auth NULL, clínica activa)  regisPacient
--                      UPDATE del email                                         enviarAcceso
--                      DELETE de la ficha recién creada si falla el paciente    regisPacient
--   paciente           INSERT / UPDATE de cobertura                             regisPacient, actualizarCobertura
--   registro_clinico   INSERT (+ registro_diente / registro_diagnostico / registro_practica)
--   profesional        UPDATE de descripción, turnos_online, precio y dirección de la fila PROPIA
--   turno              UPDATE estado -> 'cancelado' del turno propio (paciente)
--
-- Qué se cierra:
--   #1 persona.id_auth / clinica_id / dni ya no se pueden cambiar por la API
--      (escalada a admin y robo de fichas).
--   #2 ya no se pueden crear personas con id_auth propio en cualquier clínica
--      (persona "plantada" que se queda con la HC).
--   #4 el paciente solo puede pasar su turno de 'reservado' a 'cancelado'.
--   #5 sin INSERT/DELETE en `profesional`; UPDATE solo de la fila propia y de columnas
--      de perfil; `especialidad_profesional` queda de solo lectura por JWT.
--   #6 la HC (registro_clinico y sus tablas hijas) es solo INSERT por JWT, y solo sobre
--      registros propios.
--
-- Idempotente: se puede correr más de una vez.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Helper: ¿la persona NO tiene ficha de paciente? (SECURITY DEFINER para no
-- encadenar la RLS persona <-> paciente, que daría recursión infinita).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_persona_sin_ficha(p_id_persona bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT NOT EXISTS (SELECT 1 FROM paciente WHERE id_persona = p_id_persona);
$$;
REVOKE ALL ON FUNCTION public.app_persona_sin_ficha(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_persona_sin_ficha(bigint) TO authenticated;

-- =============================================================================
-- persona (#1, #2)
-- =============================================================================
DROP POLICY IF EXISTS persona_tenant ON public.persona;
DROP POLICY IF EXISTS persona_propia_select ON public.persona;
DROP POLICY IF EXISTS persona_insert ON public.persona;
DROP POLICY IF EXISTS persona_update ON public.persona;
DROP POLICY IF EXISTS persona_delete ON public.persona;

-- La persona propia se sigue pudiendo LEER: la usan las subconsultas de otras
-- políticas (membresia_select, horario_profesional_own_write, profesional_select).
CREATE POLICY persona_propia_select ON public.persona
    FOR SELECT TO authenticated
    USING (id_auth = auth.uid());

-- Alta de ficha por el profesional/admin, en su clínica activa y SIN cuenta
-- (la cuenta del paciente la vincula el backend con service_role). Si el cliente
-- omite id_auth, el DEFAULT auth.uid() hace fallar el chequeo: falla cerrado.
CREATE POLICY persona_insert ON public.persona
    FOR INSERT TO authenticated
    WITH CHECK (
        app_puede_escribir_hc()
        AND clinica_id = app_current_clinica_id()
        AND id_auth IS NULL
    );

CREATE POLICY persona_update ON public.persona
    FOR UPDATE TO authenticated
    USING (app_puede_escribir_hc() AND clinica_id = app_current_clinica_id())
    WITH CHECK (app_puede_escribir_hc() AND clinica_id = app_current_clinica_id());

-- Solo la limpieza de una ficha recién creada: sin cuenta y sin paciente.
CREATE POLICY persona_delete ON public.persona
    FOR DELETE TO authenticated
    USING (
        app_puede_escribir_hc()
        AND clinica_id = app_current_clinica_id()
        AND id_auth IS NULL
        AND app_persona_sin_ficha(id)
    );

-- Columnas: id_auth, clinica_id y dni NO se modifican por JWT.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.persona FROM authenticated;
GRANT INSERT (id_auth, clinica_id, dni, nombre, apellido, fecha_nacimiento, telefono, direccion, sexo, email)
    ON public.persona TO authenticated;
GRANT UPDATE (nombre, apellido, fecha_nacimiento, telefono, direccion, sexo, email)
    ON public.persona TO authenticated;
GRANT DELETE ON public.persona TO authenticated;

-- =============================================================================
-- paciente (#1): sin DELETE ni cambio de id_persona por JWT
-- =============================================================================
DROP POLICY IF EXISTS paciente_tenant ON public.paciente;
DROP POLICY IF EXISTS paciente_insert ON public.paciente;
DROP POLICY IF EXISTS paciente_update ON public.paciente;

CREATE POLICY paciente_insert ON public.paciente
    FOR INSERT TO authenticated
    WITH CHECK (
        app_puede_escribir_hc()
        AND id_persona IN (SELECT id FROM persona WHERE clinica_id = app_current_clinica_id())
    );

CREATE POLICY paciente_update ON public.paciente
    FOR UPDATE TO authenticated
    USING (
        app_puede_escribir_hc()
        AND id_persona IN (SELECT id FROM persona WHERE clinica_id = app_current_clinica_id())
    )
    WITH CHECK (
        app_puede_escribir_hc()
        AND id_persona IN (SELECT id FROM persona WHERE clinica_id = app_current_clinica_id())
    );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.paciente FROM authenticated;
GRANT INSERT (id_persona, obra_social, id_obra_social, nro_afiliado, plan) ON public.paciente TO authenticated;
GRANT UPDATE (obra_social, id_obra_social, nro_afiliado, plan) ON public.paciente TO authenticated;

-- =============================================================================
-- profesional / especialidad_profesional (#5)
-- =============================================================================
DROP POLICY IF EXISTS profesional_tenant ON public.profesional;
DROP POLICY IF EXISTS profesional_select ON public.profesional;
DROP POLICY IF EXISTS profesional_update_propio ON public.profesional;

-- Lectura: igual que antes (staff activo de la clínica, o la fila propia).
CREATE POLICY profesional_select ON public.profesional
    FOR SELECT TO authenticated
    USING (id_persona IN (
        SELECT persona.id FROM persona
        WHERE (app_is_clinica_member() AND persona.clinica_id = app_current_clinica_id())
           OR persona.id_auth = auth.uid()
    ));

-- Escritura: solo la fila propia (la firma la guarda el backend con service_role).
CREATE POLICY profesional_update_propio ON public.profesional
    FOR UPDATE TO authenticated
    USING (id = app_current_profesional_id())
    WITH CHECK (id = app_current_profesional_id());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.profesional FROM authenticated;
GRANT UPDATE (descripcion, turnos_online, precio, direccion, telefono) ON public.profesional TO authenticated;

DROP POLICY IF EXISTS especialidad_profesional_tenant ON public.especialidad_profesional;
DROP POLICY IF EXISTS especialidad_profesional_select ON public.especialidad_profesional;

CREATE POLICY especialidad_profesional_select ON public.especialidad_profesional
    FOR SELECT TO authenticated
    USING (id_profesional IN (
        SELECT pr.id FROM profesional pr JOIN persona p ON p.id = pr.id_persona
        WHERE (app_is_clinica_member() AND p.clinica_id = app_current_clinica_id())
           OR p.id_auth = auth.uid()
    ));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.especialidad_profesional FROM authenticated;

-- =============================================================================
-- turno (#4): el paciente solo cancela un turno propio reservado
-- =============================================================================
DROP POLICY IF EXISTS turno_paciente_update ON public.turno;

CREATE POLICY turno_paciente_update ON public.turno
    FOR UPDATE TO authenticated
    USING (app_es_mi_paciente(id_paciente) AND estado = 'reservado')
    WITH CHECK (app_es_mi_paciente(id_paciente) AND estado = 'cancelado');

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.turno FROM authenticated;
GRANT UPDATE (estado) ON public.turno TO authenticated;

-- =============================================================================
-- Historia clínica (#6): solo INSERT por JWT, y sobre registros propios.
-- El estado de auditoría lo cambia el backend con service_role (no se toca).
-- =============================================================================
DROP POLICY IF EXISTS registro_clinico_tenant ON public.registro_clinico;
DROP POLICY IF EXISTS registro_clinico_insert ON public.registro_clinico;

CREATE POLICY registro_clinico_insert ON public.registro_clinico
    FOR INSERT TO authenticated
    WITH CHECK (
        app_puede_escribir_hc()
        AND clinica_id = app_current_clinica_id()
        AND id_profesional = app_current_profesional_id()
    );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.registro_clinico FROM authenticated;
GRANT INSERT ON public.registro_clinico TO authenticated;

-- Tablas hijas: solo se agregan filas a un registro propio de la clínica activa.
DROP POLICY IF EXISTS registro_diente_tenant ON public.registro_diente;
DROP POLICY IF EXISTS registro_diente_insert ON public.registro_diente;
CREATE POLICY registro_diente_insert ON public.registro_diente
    FOR INSERT TO authenticated
    WITH CHECK (
        app_puede_escribir_hc()
        AND id_registro IN (
            SELECT id FROM registro_clinico
            WHERE clinica_id = app_current_clinica_id()
              AND id_profesional = app_current_profesional_id()
        )
    );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.registro_diente FROM authenticated;
GRANT INSERT ON public.registro_diente TO authenticated;

DROP POLICY IF EXISTS registro_diagnostico_tenant ON public.registro_diagnostico;
DROP POLICY IF EXISTS registro_diagnostico_insert ON public.registro_diagnostico;
CREATE POLICY registro_diagnostico_insert ON public.registro_diagnostico
    FOR INSERT TO authenticated
    WITH CHECK (
        app_puede_escribir_hc()
        AND id_registro IN (
            SELECT id FROM registro_clinico
            WHERE clinica_id = app_current_clinica_id()
              AND id_profesional = app_current_profesional_id()
        )
    );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.registro_diagnostico FROM authenticated;
GRANT INSERT ON public.registro_diagnostico TO authenticated;

DROP POLICY IF EXISTS registro_practica_tenant ON public.registro_practica;
DROP POLICY IF EXISTS registro_practica_insert ON public.registro_practica;
CREATE POLICY registro_practica_insert ON public.registro_practica
    FOR INSERT TO authenticated
    WITH CHECK (
        app_puede_escribir_hc()
        AND id_registro IN (
            SELECT id FROM registro_clinico
            WHERE clinica_id = app_current_clinica_id()
              AND id_profesional = app_current_profesional_id()
        )
    );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON public.registro_practica FROM authenticated;
GRANT INSERT ON public.registro_practica TO authenticated;

COMMIT;
