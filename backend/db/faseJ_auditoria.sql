-- ===========================================================================
-- Medilu — Fase J: rol AUDITOR, bitácora de accesos a la HC y bandeja de auditoría
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de faseI_estudios.sql.
-- Es IDEMPOTENTE.
--
-- Modelo:
--   * Nuevo rol de membresía 'auditor' (médico auditor). Alcance configurable:
--       - membresia.alcance_obra_social IS NULL  -> auditor INTERNO (toda la clínica).
--       - membresia.alcance_obra_social = 'OSDE' -> solo pacientes con esa obra social
--         (comparación lower(trim()), porque paciente.obra_social es texto libre).
--   * El auditor NO es staff operativo: app_is_clinica_member() pasa a EXCLUIRLO, así
--     que todas las políticas "por clínica" existentes le niegan el acceso directo. Las
--     lecturas que sí necesita (HC, bitácora, revisiones) se habilitan con políticas
--     SELECT explícitas y acotadas por su alcance. Nunca escribe por API directa.
--   * La ESCRITURA de HC (persona/paciente/registro_clinico/registro_diente) por la rama
--     "por clínica" queda solo para admin/profesional (antes: cualquier miembro activo,
--     incluida recepción).
--   * hc_acceso: bitácora append-only (quién vio/cargó/exportó/auditó qué HC). Escribe
--     solo el backend (service_role); un trigger impide UPDATE/DELETE incluso a él.
--   * auditoria_revision: revisiones del auditor sobre cada registro_clinico
--     (aprobado | observado | rechazado) + respuesta del profesional autor.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS auditoria_revision;
--   DROP TRIGGER IF EXISTS registro_clinico_auditoria_protegida ON registro_clinico;
--   DROP FUNCTION IF EXISTS public.registro_clinico_proteger_auditoria();
--   ALTER TABLE registro_clinico DROP COLUMN IF EXISTS auditoria_estado;
--   DROP TRIGGER IF EXISTS hc_acceso_inmutable ON hc_acceso; DROP TABLE IF EXISTS hc_acceso;
--   DROP FUNCTION IF EXISTS public.hc_acceso_bloquear_cambios();
--   Re-aplicar faseC2_fix_rls_miembro.sql (app_is_clinica_member) y faseG_fix_rls.sql
--   (políticas de persona/paciente/registro_clinico/registro_diente); luego:
--   DROP POLICY IF EXISTS persona_select ON persona; (ídem paciente_select,
--   registro_clinico_select, registro_diente_select)
--   DROP FUNCTION IF EXISTS public.app_current_rol(), public.app_is_clinica_auditor(),
--     public.app_puede_escribir_hc(), public.app_auditor_alcance(),
--     public.app_auditor_ve_paciente(bigint), public.app_auditor_ve_persona(bigint);
--   UPDATE membresia SET rol = 'profesional' WHERE rol = 'auditor';  (o borrarlas)
--   ALTER TABLE membresia DROP COLUMN IF EXISTS alcance_obra_social;
--   Restaurar los CHECK de membresia.rol / codigo_activacion.rol sin 'auditor'.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Rol 'auditor' + alcance por obra social.
-- ---------------------------------------------------------------------------
ALTER TABLE membresia DROP CONSTRAINT IF EXISTS membresia_rol_check;
ALTER TABLE membresia ADD CONSTRAINT membresia_rol_check
    CHECK (rol IN ('admin', 'profesional', 'recepcion', 'auditor'));

ALTER TABLE membresia ADD COLUMN IF NOT EXISTS alcance_obra_social text;

ALTER TABLE codigo_activacion DROP CONSTRAINT IF EXISTS codigo_activacion_rol_check;
ALTER TABLE codigo_activacion ADD CONSTRAINT codigo_activacion_rol_check
    CHECK (rol IN ('profesional', 'recepcion', 'auditor'));

-- El código de un auditor puede traer su alcance (lo copia el registro a la membresía).
ALTER TABLE codigo_activacion ADD COLUMN IF NOT EXISTS alcance_obra_social text;

-- ---------------------------------------------------------------------------
-- 2. Helpers (SECURITY DEFINER + search_path fijo, mismo patrón que fase A).
-- ---------------------------------------------------------------------------

-- Rol de la membresía activa en la clínica activa (NULL si no hay).
CREATE OR REPLACE FUNCTION public.app_current_rol()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT m.rol
    FROM membresia m
    JOIN persona pe ON pe.id = m.id_persona
    WHERE pe.id_auth = auth.uid()
      AND m.activo = true
      AND m.clinica_id = public.app_current_clinica_id()
    LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.app_current_rol() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_current_rol() FROM anon, public;

-- Staff OPERATIVO (admin | profesional | recepcion) de la clínica activa.
-- REDEFINIDA: antes incluía a cualquier miembro; ahora excluye al auditor, de modo
-- que todas las políticas "por clínica" existentes le niegan el acceso directo.
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
          AND m.rol <> 'auditor'
          AND m.clinica_id = public.app_current_clinica_id()
    );
$$;
GRANT EXECUTE ON FUNCTION public.app_is_clinica_member() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_is_clinica_member() FROM anon, public;

-- ¿Es auditor (membresía activa) de la clínica activa?
CREATE OR REPLACE FUNCTION public.app_is_clinica_auditor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT COALESCE(public.app_current_rol() = 'auditor', false);
$$;
GRANT EXECUTE ON FUNCTION public.app_is_clinica_auditor() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_is_clinica_auditor() FROM anon, public;

-- ¿Puede ESCRIBIR historias clínicas en la clínica activa? (admin | profesional)
CREATE OR REPLACE FUNCTION public.app_puede_escribir_hc()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT COALESCE(public.app_current_rol() IN ('admin', 'profesional'), false);
$$;
GRANT EXECUTE ON FUNCTION public.app_puede_escribir_hc() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_puede_escribir_hc() FROM anon, public;

-- Alcance (obra social) del auditor en la clínica activa. NULL = interno.
CREATE OR REPLACE FUNCTION public.app_auditor_alcance()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT NULLIF(lower(trim(m.alcance_obra_social)), '')
    FROM membresia m
    JOIN persona pe ON pe.id = m.id_persona
    WHERE pe.id_auth = auth.uid()
      AND m.activo = true
      AND m.rol = 'auditor'
      AND m.clinica_id = public.app_current_clinica_id()
    LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.app_auditor_alcance() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_auditor_alcance() FROM anon, public;

-- ¿El auditor actual puede ver a este paciente? (interno: sí; con alcance: misma OS)
CREATE OR REPLACE FUNCTION public.app_auditor_ve_paciente(p_id_paciente bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT CASE
        WHEN public.app_auditor_alcance() IS NULL THEN true
        ELSE EXISTS (
            SELECT 1 FROM paciente pa
            WHERE pa.id = p_id_paciente
              AND lower(trim(pa.obra_social)) = public.app_auditor_alcance()
        )
    END;
$$;
GRANT EXECUTE ON FUNCTION public.app_auditor_ve_paciente(bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_auditor_ve_paciente(bigint) FROM anon, public;

-- ¿El auditor actual puede ver a esta persona? Las personas que NO son pacientes
-- (profesionales del staff) se ven siempre; los pacientes, según el alcance.
CREATE OR REPLACE FUNCTION public.app_auditor_ve_persona(p_id_persona bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT CASE
        WHEN public.app_auditor_alcance() IS NULL THEN true
        WHEN NOT EXISTS (SELECT 1 FROM paciente pa WHERE pa.id_persona = p_id_persona) THEN true
        ELSE EXISTS (
            SELECT 1 FROM paciente pa
            WHERE pa.id_persona = p_id_persona
              AND lower(trim(pa.obra_social)) = public.app_auditor_alcance()
        )
    END;
$$;
GRANT EXECUTE ON FUNCTION public.app_auditor_ve_persona(bigint) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.app_auditor_ve_persona(bigint) FROM anon, public;

-- ---------------------------------------------------------------------------
-- 3. RLS de la HC: escritura solo admin/profesional; lectura staff + auditor acotado.
--    Las políticas permisivas se combinan con OR: la FOR ALL (escritura) también
--    concede lectura a quien escribe; la FOR SELECT agrega lectores.
-- ---------------------------------------------------------------------------

-- persona
DROP POLICY IF EXISTS persona_tenant ON persona;
CREATE POLICY persona_tenant ON persona
    FOR ALL TO authenticated
    USING (
        (public.app_puede_escribir_hc() AND clinica_id = public.app_current_clinica_id())
        OR id_auth = auth.uid()
    )
    WITH CHECK (
        (public.app_puede_escribir_hc() AND clinica_id = public.app_current_clinica_id())
        OR id_auth = auth.uid()
    );

DROP POLICY IF EXISTS persona_select ON persona;
CREATE POLICY persona_select ON persona
    FOR SELECT TO authenticated
    USING (
        clinica_id = public.app_current_clinica_id()
        AND (
            public.app_is_clinica_member()
            OR (public.app_is_clinica_auditor() AND public.app_auditor_ve_persona(id))
        )
    );

-- paciente
DROP POLICY IF EXISTS paciente_tenant ON paciente;
CREATE POLICY paciente_tenant ON paciente
    FOR ALL TO authenticated
    USING (
        public.app_puede_escribir_hc()
        AND id_persona IN (SELECT id FROM persona WHERE clinica_id = public.app_current_clinica_id())
    )
    WITH CHECK (
        public.app_puede_escribir_hc()
        AND id_persona IN (SELECT id FROM persona WHERE clinica_id = public.app_current_clinica_id())
    );

DROP POLICY IF EXISTS paciente_select ON paciente;
CREATE POLICY paciente_select ON paciente
    FOR SELECT TO authenticated
    USING (
        id_persona IN (SELECT id FROM persona WHERE clinica_id = public.app_current_clinica_id())
        AND (
            public.app_is_clinica_member()
            OR (public.app_is_clinica_auditor() AND public.app_auditor_ve_paciente(id))
        )
    );

-- registro_clinico
DROP POLICY IF EXISTS registro_clinico_tenant ON registro_clinico;
CREATE POLICY registro_clinico_tenant ON registro_clinico
    FOR ALL TO authenticated
    USING (public.app_puede_escribir_hc() AND clinica_id = public.app_current_clinica_id())
    WITH CHECK (public.app_puede_escribir_hc() AND clinica_id = public.app_current_clinica_id());

DROP POLICY IF EXISTS registro_clinico_select ON registro_clinico;
CREATE POLICY registro_clinico_select ON registro_clinico
    FOR SELECT TO authenticated
    USING (
        clinica_id = public.app_current_clinica_id()
        AND (
            public.app_is_clinica_member()
            OR (public.app_is_clinica_auditor() AND public.app_auditor_ve_paciente(id_paciente))
        )
    );

-- registro_diente (vía el registro padre)
DROP POLICY IF EXISTS registro_diente_tenant ON registro_diente;
CREATE POLICY registro_diente_tenant ON registro_diente
    FOR ALL TO authenticated
    USING (
        public.app_puede_escribir_hc()
        AND id_registro IN (SELECT id FROM registro_clinico WHERE clinica_id = public.app_current_clinica_id())
    )
    WITH CHECK (
        public.app_puede_escribir_hc()
        AND id_registro IN (SELECT id FROM registro_clinico WHERE clinica_id = public.app_current_clinica_id())
    );

DROP POLICY IF EXISTS registro_diente_select ON registro_diente;
CREATE POLICY registro_diente_select ON registro_diente
    FOR SELECT TO authenticated
    USING (
        id_registro IN (
            SELECT rc.id FROM registro_clinico rc
            WHERE rc.clinica_id = public.app_current_clinica_id()
              AND (
                  public.app_is_clinica_member()
                  OR (public.app_is_clinica_auditor() AND public.app_auditor_ve_paciente(rc.id_paciente))
              )
        )
    );

-- ---------------------------------------------------------------------------
-- 4. Bitácora de accesos a la HC (append-only).
--    Sin FKs a propósito: el log debe sobrevivir al borrado de pacientes/clínicas
--    (por eso guarda snapshots de nombres y DNI).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hc_acceso (
    id                bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    clinica_id        uuid,
    id_persona_actor  bigint,
    actor_nombre      text,
    actor_rol         text,
    accion            text NOT NULL CHECK (accion IN (
                          'ver_hc', 'crear_registro', 'registrar_paciente',
                          'exportar_hc', 'importar_hc',
                          'ver_registro_auditoria', 'revisar', 'responder')),
    id_paciente       bigint,
    paciente_nombre   text,
    paciente_dni      text,
    id_registro       uuid,
    detalle           jsonb,
    ip                text,
    user_agent        text,
    creado_en         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hc_acceso_clinica_fecha ON hc_acceso (clinica_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_hc_acceso_paciente      ON hc_acceso (id_paciente);
CREATE INDEX IF NOT EXISTS idx_hc_acceso_actor         ON hc_acceso (id_persona_actor);

-- Inmutable: ni siquiera el service_role puede modificar o borrar filas.
CREATE OR REPLACE FUNCTION public.hc_acceso_bloquear_cambios()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    RAISE EXCEPTION 'hc_acceso es de solo inserción (bitácora inalterable)';
END;
$$;

DROP TRIGGER IF EXISTS hc_acceso_inmutable ON hc_acceso;
CREATE TRIGGER hc_acceso_inmutable
    BEFORE UPDATE OR DELETE ON hc_acceso
    FOR EACH ROW EXECUTE FUNCTION public.hc_acceso_bloquear_cambios();

ALTER TABLE hc_acceso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON hc_acceso FROM anon, authenticated;
GRANT SELECT ON hc_acceso TO authenticated;

-- Lectura: admin de la clínica (todo) o auditor (acotado a su alcance).
DROP POLICY IF EXISTS hc_acceso_select ON hc_acceso;
CREATE POLICY hc_acceso_select ON hc_acceso
    FOR SELECT TO authenticated
    USING (
        clinica_id = public.app_current_clinica_id()
        AND (
            public.app_is_clinica_admin()
            OR (
                public.app_is_clinica_auditor()
                AND (
                    public.app_auditor_alcance() IS NULL
                    OR (id_paciente IS NOT NULL AND public.app_auditor_ve_paciente(id_paciente))
                )
            )
        )
    );

-- ---------------------------------------------------------------------------
-- 5. Revisiones de auditoría (historial; la vigente es la última por registro).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria_revision (
    id                    bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    clinica_id            uuid   NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
    id_registro           uuid   NOT NULL REFERENCES registro_clinico(id) ON DELETE CASCADE,
    id_paciente           bigint REFERENCES paciente(id) ON DELETE CASCADE,
    id_profesional        bigint REFERENCES profesional(id) ON DELETE SET NULL, -- autor del registro
    id_persona_auditor    bigint REFERENCES persona(id) ON DELETE SET NULL,
    auditor_nombre        text,
    estado                text   NOT NULL CHECK (estado IN ('aprobado', 'observado', 'rechazado')),
    checklist             jsonb  NOT NULL DEFAULT '{}'::jsonb,
    comentario            text,
    -- Respuesta del profesional autor a una observación/rechazo.
    respuesta             text,
    respondido_en         timestamptz,
    id_persona_respuesta  bigint REFERENCES persona(id) ON DELETE SET NULL,
    creado_en             timestamptz NOT NULL DEFAULT now()
);
-- Estado VIGENTE de auditoría, denormalizado en el registro para filtrar/paginar la
-- bandeja (la fuente de verdad es el historial de auditoria_revision). Lo mantiene el
-- backend (service_role); un trigger impide que un usuario lo cambie por API directa
-- (p. ej. un profesional "autoaprobándose" con la política de escritura de la HC).
ALTER TABLE registro_clinico ADD COLUMN IF NOT EXISTS auditoria_estado text NOT NULL DEFAULT 'pendiente';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'registro_clinico_auditoria_estado_check') THEN
        ALTER TABLE registro_clinico ADD CONSTRAINT registro_clinico_auditoria_estado_check
            CHECK (auditoria_estado IN ('pendiente', 'aprobado', 'observado', 'rechazado', 'respondido'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_registro_clinico_auditoria ON registro_clinico (clinica_id, auditoria_estado);

CREATE OR REPLACE FUNCTION public.registro_clinico_proteger_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Sin JWT (SQL editor / conexión directa) o service_role: permitido.
    IF COALESCE(auth.jwt()->>'role', 'service_role') = 'service_role' THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        NEW.auditoria_estado := 'pendiente';
    ELSIF NEW.auditoria_estado IS DISTINCT FROM OLD.auditoria_estado THEN
        RAISE EXCEPTION 'El estado de auditoría solo lo cambia la auditoría';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS registro_clinico_auditoria_protegida ON registro_clinico;
CREATE TRIGGER registro_clinico_auditoria_protegida
    BEFORE INSERT OR UPDATE ON registro_clinico
    FOR EACH ROW EXECUTE FUNCTION public.registro_clinico_proteger_auditoria();

CREATE INDEX IF NOT EXISTS idx_auditoria_revision_registro    ON auditoria_revision (id_registro, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_revision_clinica     ON auditoria_revision (clinica_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_revision_profesional ON auditoria_revision (id_profesional);

ALTER TABLE auditoria_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON auditoria_revision FROM anon, authenticated;
GRANT SELECT ON auditoria_revision TO authenticated;

-- Lectura: admin, auditor (acotado) o el profesional AUTOR del registro revisado.
-- Las escrituras las hace el backend (service_role) tras validar rol y alcance.
DROP POLICY IF EXISTS auditoria_revision_select ON auditoria_revision;
CREATE POLICY auditoria_revision_select ON auditoria_revision
    FOR SELECT TO authenticated
    USING (
        clinica_id = public.app_current_clinica_id()
        AND (
            public.app_is_clinica_admin()
            OR (public.app_is_clinica_auditor() AND public.app_auditor_ve_paciente(id_paciente))
            OR id_profesional = public.app_current_profesional_id()
        )
    );
