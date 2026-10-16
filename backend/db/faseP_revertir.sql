-- =============================================================================
-- Fase P — REVERTIR faseP_endurecer_rls.sql
--
-- Deja políticas y GRANT exactamente como estaban en producción el 2026-10-15
-- (definiciones leídas en vivo de pg_policies antes de la migración). Usar solo si
-- algún flujo de la app deja de andar después de aplicar la Fase P: vuelve a abrir
-- los hallazgos 1, 2, 4, 5 y 6 de AUDITORIA_FLUJOS_2026-10-15.md.
-- =============================================================================

BEGIN;

-- persona
DROP POLICY IF EXISTS persona_propia_select ON public.persona;
DROP POLICY IF EXISTS persona_insert ON public.persona;
DROP POLICY IF EXISTS persona_update ON public.persona;
DROP POLICY IF EXISTS persona_delete ON public.persona;
DROP POLICY IF EXISTS persona_tenant ON public.persona;
CREATE POLICY persona_tenant ON public.persona FOR ALL TO authenticated
    USING ((app_puede_escribir_hc() AND clinica_id = app_current_clinica_id()) OR id_auth = auth.uid())
    WITH CHECK ((app_puede_escribir_hc() AND clinica_id = app_current_clinica_id()) OR id_auth = auth.uid());

-- paciente
DROP POLICY IF EXISTS paciente_insert ON public.paciente;
DROP POLICY IF EXISTS paciente_update ON public.paciente;
DROP POLICY IF EXISTS paciente_tenant ON public.paciente;
CREATE POLICY paciente_tenant ON public.paciente FOR ALL TO authenticated
    USING (app_puede_escribir_hc() AND id_persona IN (SELECT persona.id FROM persona WHERE persona.clinica_id = app_current_clinica_id()))
    WITH CHECK (app_puede_escribir_hc() AND id_persona IN (SELECT persona.id FROM persona WHERE persona.clinica_id = app_current_clinica_id()));

-- profesional
DROP POLICY IF EXISTS profesional_select ON public.profesional;
DROP POLICY IF EXISTS profesional_update_propio ON public.profesional;
DROP POLICY IF EXISTS profesional_tenant ON public.profesional;
CREATE POLICY profesional_tenant ON public.profesional FOR ALL TO authenticated
    USING (id_persona IN (SELECT persona.id FROM persona
        WHERE (app_is_clinica_member() AND persona.clinica_id = app_current_clinica_id()) OR persona.id_auth = auth.uid()))
    WITH CHECK (id_persona IN (SELECT persona.id FROM persona
        WHERE (app_is_clinica_member() AND persona.clinica_id = app_current_clinica_id()) OR persona.id_auth = auth.uid()));

-- especialidad_profesional
DROP POLICY IF EXISTS especialidad_profesional_select ON public.especialidad_profesional;
DROP POLICY IF EXISTS especialidad_profesional_tenant ON public.especialidad_profesional;
CREATE POLICY especialidad_profesional_tenant ON public.especialidad_profesional FOR ALL TO authenticated
    USING (id_profesional IN (SELECT pr.id FROM profesional pr JOIN persona p ON p.id = pr.id_persona
        WHERE (app_is_clinica_member() AND p.clinica_id = app_current_clinica_id()) OR p.id_auth = auth.uid()))
    WITH CHECK (id_profesional IN (SELECT pr.id FROM profesional pr JOIN persona p ON p.id = pr.id_persona
        WHERE (app_is_clinica_member() AND p.clinica_id = app_current_clinica_id()) OR p.id_auth = auth.uid()));

-- turno
DROP POLICY IF EXISTS turno_paciente_update ON public.turno;
CREATE POLICY turno_paciente_update ON public.turno FOR UPDATE TO authenticated
    USING (app_es_mi_paciente(id_paciente))
    WITH CHECK (app_es_mi_paciente(id_paciente));

-- registro_clinico y tablas hijas
DROP POLICY IF EXISTS registro_clinico_insert ON public.registro_clinico;
DROP POLICY IF EXISTS registro_clinico_tenant ON public.registro_clinico;
CREATE POLICY registro_clinico_tenant ON public.registro_clinico FOR ALL TO authenticated
    USING (app_puede_escribir_hc() AND clinica_id = app_current_clinica_id())
    WITH CHECK (app_puede_escribir_hc() AND clinica_id = app_current_clinica_id());

DROP POLICY IF EXISTS registro_diente_insert ON public.registro_diente;
DROP POLICY IF EXISTS registro_diente_tenant ON public.registro_diente;
CREATE POLICY registro_diente_tenant ON public.registro_diente FOR ALL TO authenticated
    USING (app_puede_escribir_hc() AND id_registro IN (SELECT registro_clinico.id FROM registro_clinico WHERE registro_clinico.clinica_id = app_current_clinica_id()))
    WITH CHECK (app_puede_escribir_hc() AND id_registro IN (SELECT registro_clinico.id FROM registro_clinico WHERE registro_clinico.clinica_id = app_current_clinica_id()));

DROP POLICY IF EXISTS registro_diagnostico_insert ON public.registro_diagnostico;
DROP POLICY IF EXISTS registro_diagnostico_tenant ON public.registro_diagnostico;
CREATE POLICY registro_diagnostico_tenant ON public.registro_diagnostico FOR ALL TO authenticated
    USING (app_puede_escribir_hc() AND id_registro IN (SELECT registro_clinico.id FROM registro_clinico WHERE registro_clinico.clinica_id = app_current_clinica_id()))
    WITH CHECK (app_puede_escribir_hc() AND id_registro IN (SELECT registro_clinico.id FROM registro_clinico WHERE registro_clinico.clinica_id = app_current_clinica_id()));

DROP POLICY IF EXISTS registro_practica_insert ON public.registro_practica;
DROP POLICY IF EXISTS registro_practica_tenant ON public.registro_practica;
CREATE POLICY registro_practica_tenant ON public.registro_practica FOR ALL TO authenticated
    USING (app_puede_escribir_hc() AND id_registro IN (SELECT registro_clinico.id FROM registro_clinico WHERE registro_clinico.clinica_id = app_current_clinica_id()))
    WITH CHECK (app_puede_escribir_hc() AND id_registro IN (SELECT registro_clinico.id FROM registro_clinico WHERE registro_clinico.clinica_id = app_current_clinica_id()));

-- GRANT: antes `authenticated` tenía todos los privilegios de tabla.
GRANT ALL ON public.persona, public.paciente, public.profesional, public.especialidad_profesional,
    public.turno, public.registro_clinico, public.registro_diente, public.registro_diagnostico,
    public.registro_practica TO authenticated;

DROP FUNCTION IF EXISTS public.app_persona_sin_ficha(bigint);

COMMIT;
