-- ===========================================================================
-- Medilu — Fase 2c (parte 2): RLS por JWT para ortodoncia y clínica
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de fase2c_rls_jwt.sql.
-- Es idempotente. Extiende el rollout de RLS a las tablas que usan los
-- controllers de ortodoncia y de gestión de clínica.
--
-- Nota: fase2_multiclinica.sql ya activó RLS en `clinica` y `codigo_activacion`
-- pero SIN políticas (todo denegado para authenticated). Acá se agregan las
-- políticas por clínica. El `service_role` (registro, endpoints públicos) saltea
-- la RLS, así que el onboarding y la resolución de slug siguen funcionando.
--
-- ROLLBACK: ALTER TABLE <tabla> DISABLE ROW LEVEL SECURITY;
-- ===========================================================================

-- Privilegios de tabla para authenticated (la RLS filtra las filas).
GRANT SELECT, INSERT, UPDATE, DELETE ON pacientes_ortodoncia TO authenticated;
GRANT SELECT ON clinica TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON codigo_activacion TO authenticated;

-- ---------------------------------------------------------------------------
-- pacientes_ortodoncia: pertenece a la clínica vía paciente -> persona.
-- ---------------------------------------------------------------------------
ALTER TABLE pacientes_ortodoncia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pacientes_ortodoncia_tenant ON pacientes_ortodoncia;
CREATE POLICY pacientes_ortodoncia_tenant ON pacientes_ortodoncia
    FOR ALL TO authenticated
    USING (id_paciente IN (
        SELECT pac.id FROM paciente pac
        JOIN persona p ON p.id = pac.id_persona
        WHERE p.clinica_id = public.app_current_clinica_id()))
    WITH CHECK (id_paciente IN (
        SELECT pac.id FROM paciente pac
        JOIN persona p ON p.id = pac.id_persona
        WHERE p.clinica_id = public.app_current_clinica_id()));

-- ---------------------------------------------------------------------------
-- clinica: cada usuario ve solo su propia clínica (solo lectura desde authenticated;
-- la creación de clínicas ocurre en el registro con service_role).
-- ---------------------------------------------------------------------------
ALTER TABLE clinica ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinica_propia ON clinica;
CREATE POLICY clinica_propia ON clinica
    FOR SELECT TO authenticated
    USING (id = public.app_current_clinica_id());

-- ---------------------------------------------------------------------------
-- codigo_activacion: los códigos de la propia clínica (generar/listar).
-- La validación de "usado" durante el registro usa service_role (saltea RLS).
-- ---------------------------------------------------------------------------
ALTER TABLE codigo_activacion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS codigo_activacion_tenant ON codigo_activacion;
CREATE POLICY codigo_activacion_tenant ON codigo_activacion
    FOR ALL TO authenticated
    USING (clinica_id = public.app_current_clinica_id())
    WITH CHECK (clinica_id = public.app_current_clinica_id());
