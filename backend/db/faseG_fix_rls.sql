-- ===========================================================================
-- Medilu — Fase G: FIX de RLS — exigir membresía ACTIVA en las políticas tenant
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de faseF_sin_calendar.sql.
-- Es IDEMPOTENTE (usa DROP POLICY IF EXISTS + CREATE).
--
-- MOTIVO (auditoría de seguridad — ver AUDITORIA_SEGURIDAD.md, hallazgos 1–4):
--   `app_current_clinica_id()` devuelve, para usuarios SIN membresía activa (pacientes
--   o STAFF DADO DE BAJA), su clínica de origen por FALLBACK (persona.clinica_id). Las
--   políticas que solo comparan `clinica_id = app_current_clinica_id()` daban verdadero
--   para esas cuentas → un ex-integrante del staff, autenticándose directo contra Supabase
--   con la anon key pública, conservaba acceso de LECTURA (y en las FOR ALL, escritura) a
--   la PII y a las historias clínicas de toda la clínica.
--
--   El fix ya se había aplicado a `certificado_medico` y `membresia` (faseC2), pero NO a
--   estas tablas. Acá se cierra el patrón de forma consistente: la rama "por clínica"
--   exige además `app_is_clinica_member()` (membresía activa). El acceso a la identidad
--   propia se mantiene con `id_auth = auth.uid()` donde corresponde.
--
--   Además:
--     * codigo_activacion: la escritura pasa a ser SOLO del admin (evita que un miembro
--       no-admin aprovisione cuentas por API directa). (Hallazgo 3)
--     * horario_profesional: la escritura se restringe al profesional dueño; la lectura
--       queda para el staff de la clínica. (Hallazgo 4)
--
-- ROLLBACK: re-aplicar los archivos fase2c_rls_jwt.sql, fase2c2_*, fase2c3_*, fase3_turnos.sql
--   y faseA_membresia.sql (contienen las versiones anteriores de estas políticas).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. turno — la lectura por clínica exige staff activo (Hallazgo 2).
--    Se conserva turno_paciente_select / turno_paciente_update (dueño) intactas.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS turno_clinica_select ON turno;
CREATE POLICY turno_clinica_select ON turno
    FOR SELECT TO authenticated
    USING (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id());

-- ---------------------------------------------------------------------------
-- 2. persona — staff activo de la clínica, o la propia identidad (Hallazgo 1).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS persona_tenant ON persona;
CREATE POLICY persona_tenant ON persona
    FOR ALL TO authenticated
    USING (
        (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
        OR id_auth = auth.uid()
    )
    WITH CHECK (
        (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
        OR id_auth = auth.uid()
    );

-- ---------------------------------------------------------------------------
-- 3. profesional — staff activo de la clínica, o la propia identidad (Hallazgo 1).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS profesional_tenant ON profesional;
CREATE POLICY profesional_tenant ON profesional
    FOR ALL TO authenticated
    USING (id_persona IN (
        SELECT id FROM persona
        WHERE (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
           OR id_auth = auth.uid()))
    WITH CHECK (id_persona IN (
        SELECT id FROM persona
        WHERE (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
           OR id_auth = auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. paciente — solo el staff activo de la clínica (Hallazgo 1).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS paciente_tenant ON paciente;
CREATE POLICY paciente_tenant ON paciente
    FOR ALL TO authenticated
    USING (
        public.app_is_clinica_member()
        AND id_persona IN (SELECT id FROM persona WHERE clinica_id = public.app_current_clinica_id())
    )
    WITH CHECK (
        public.app_is_clinica_member()
        AND id_persona IN (SELECT id FROM persona WHERE clinica_id = public.app_current_clinica_id())
    );

-- ---------------------------------------------------------------------------
-- 5. registro_clinico — solo el staff activo de la clínica (Hallazgo 1).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS registro_clinico_tenant ON registro_clinico;
CREATE POLICY registro_clinico_tenant ON registro_clinico
    FOR ALL TO authenticated
    USING (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
    WITH CHECK (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id());

-- ---------------------------------------------------------------------------
-- 6. registro_diente — vía el registro_clinico padre, con staff activo (Hallazgo 1).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS registro_diente_tenant ON registro_diente;
CREATE POLICY registro_diente_tenant ON registro_diente
    FOR ALL TO authenticated
    USING (
        public.app_is_clinica_member()
        AND id_registro IN (SELECT id FROM registro_clinico WHERE clinica_id = public.app_current_clinica_id())
    )
    WITH CHECK (
        public.app_is_clinica_member()
        AND id_registro IN (SELECT id FROM registro_clinico WHERE clinica_id = public.app_current_clinica_id())
    );

-- ---------------------------------------------------------------------------
-- 7. especialidad_profesional — staff activo de la clínica, o la propia identidad.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS especialidad_profesional_tenant ON especialidad_profesional;
CREATE POLICY especialidad_profesional_tenant ON especialidad_profesional
    FOR ALL TO authenticated
    USING (id_profesional IN (
        SELECT pr.id FROM profesional pr
        JOIN persona p ON p.id = pr.id_persona
        WHERE (public.app_is_clinica_member() AND p.clinica_id = public.app_current_clinica_id())
           OR p.id_auth = auth.uid()))
    WITH CHECK (id_profesional IN (
        SELECT pr.id FROM profesional pr
        JOIN persona p ON p.id = pr.id_persona
        WHERE (public.app_is_clinica_member() AND p.clinica_id = public.app_current_clinica_id())
           OR p.id_auth = auth.uid()));

-- ---------------------------------------------------------------------------
-- 8. pacientes_ortodoncia — solo el staff activo de la clínica (Hallazgo 1).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS pacientes_ortodoncia_tenant ON pacientes_ortodoncia;
CREATE POLICY pacientes_ortodoncia_tenant ON pacientes_ortodoncia
    FOR ALL TO authenticated
    USING (
        public.app_is_clinica_member()
        AND id_paciente IN (
            SELECT pac.id FROM paciente pac
            JOIN persona p ON p.id = pac.id_persona
            WHERE p.clinica_id = public.app_current_clinica_id()))
    WITH CHECK (
        public.app_is_clinica_member()
        AND id_paciente IN (
            SELECT pac.id FROM paciente pac
            JOIN persona p ON p.id = pac.id_persona
            WHERE p.clinica_id = public.app_current_clinica_id()));

-- ---------------------------------------------------------------------------
-- 9. clinica — la propia clínica, solo para staff activo.
--    (El nombre de la clínica también es público vía slug; esto solo evita que un
--     ex-integrante la lea por-JWT, por consistencia.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS clinica_propia ON clinica;
CREATE POLICY clinica_propia ON clinica
    FOR SELECT TO authenticated
    USING (public.app_is_clinica_member() AND id = public.app_current_clinica_id());

-- ---------------------------------------------------------------------------
-- 10. codigo_activacion (Hallazgo 3): separar lectura/escritura y exigir ADMIN.
--     Se elimina la política FOR ALL permisiva. La validación de "usado" durante el
--     registro usa service_role (saltea RLS), así que el onboarding no se ve afectado.
--     Se conserva codigo_activacion_admin_delete (faseA: admin + usado=false).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS codigo_activacion_tenant ON codigo_activacion;

DROP POLICY IF EXISTS codigo_activacion_admin_select ON codigo_activacion;
CREATE POLICY codigo_activacion_admin_select ON codigo_activacion
    FOR SELECT TO authenticated
    USING (public.app_is_clinica_admin() AND clinica_id = public.app_current_clinica_id());

DROP POLICY IF EXISTS codigo_activacion_admin_insert ON codigo_activacion;
CREATE POLICY codigo_activacion_admin_insert ON codigo_activacion
    FOR INSERT TO authenticated
    WITH CHECK (public.app_is_clinica_admin() AND clinica_id = public.app_current_clinica_id());

DROP POLICY IF EXISTS codigo_activacion_admin_update ON codigo_activacion;
CREATE POLICY codigo_activacion_admin_update ON codigo_activacion
    FOR UPDATE TO authenticated
    USING (public.app_is_clinica_admin() AND clinica_id = public.app_current_clinica_id())
    WITH CHECK (public.app_is_clinica_admin() AND clinica_id = public.app_current_clinica_id());

-- ---------------------------------------------------------------------------
-- 11. horario_profesional (Hallazgo 4): lectura por staff de la clínica; escritura
--     SOLO del profesional dueño (id_profesional cuyo persona.id_auth = auth.uid()).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS horario_profesional_tenant ON horario_profesional;

DROP POLICY IF EXISTS horario_profesional_select ON horario_profesional;
CREATE POLICY horario_profesional_select ON horario_profesional
    FOR SELECT TO authenticated
    USING (
        public.app_is_clinica_member()
        AND id_profesional IN (
            SELECT pr.id FROM profesional pr
            JOIN persona p ON p.id = pr.id_persona
            WHERE p.clinica_id = public.app_current_clinica_id()))
    ;

-- Escritura (INSERT/UPDATE/DELETE) del propio profesional. FOR ALL cubre las tres
-- operaciones; la lectura del no-dueño la habilita la política de SELECT de arriba.
DROP POLICY IF EXISTS horario_profesional_own_write ON horario_profesional;
CREATE POLICY horario_profesional_own_write ON horario_profesional
    FOR ALL TO authenticated
    USING (id_profesional IN (
        SELECT pr.id FROM profesional pr
        JOIN persona p ON p.id = pr.id_persona
        WHERE p.id_auth = auth.uid()))
    WITH CHECK (id_profesional IN (
        SELECT pr.id FROM profesional pr
        JOIN persona p ON p.id = pr.id_persona
        WHERE p.id_auth = auth.uid()));
