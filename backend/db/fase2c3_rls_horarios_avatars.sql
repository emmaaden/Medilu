-- ===========================================================================
-- Medilu — Fase 2c (parte 3): RLS por JWT para horarios y avatars
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de fase2c_rls_jwt.sql.
-- Es idempotente. Cierra el rollout de RLS: horario_profesional (tabla) y el
-- bucket de avatars (storage).
--
-- profesionalController NO necesita SQL nueva: opera sobre persona / profesional /
-- especialidad_profesional, que ya tienen políticas RLS por clínica (fase2c).
--
-- ROLLBACK: ALTER TABLE horario_profesional DISABLE ROW LEVEL SECURITY;
--           DROP POLICY IF EXISTS avatar_rw_own ON storage.objects;
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- horario_profesional: pertenece a la clínica vía profesional -> persona.
-- (available-slots y api/get-hours son públicos y usan service_role: saltean RLS.)
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON horario_profesional TO authenticated;

ALTER TABLE horario_profesional ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS horario_profesional_tenant ON horario_profesional;
CREATE POLICY horario_profesional_tenant ON horario_profesional
    FOR ALL TO authenticated
    USING (id_profesional IN (
        SELECT pr.id FROM profesional pr
        JOIN persona p ON p.id = pr.id_persona
        WHERE p.clinica_id = public.app_current_clinica_id()))
    WITH CHECK (id_profesional IN (
        SELECT pr.id FROM profesional pr
        JOIN persona p ON p.id = pr.id_persona
        WHERE p.clinica_id = public.app_current_clinica_id()));

-- ---------------------------------------------------------------------------
-- Avatars (storage): cada usuario solo puede escribir su propio archivo,
-- cuyo nombre es 'avatars/<auth.uid()>.png'. La lectura es por URL pública del
-- bucket (no pasa por RLS). service_role sigue salteando la RLS.
-- storage.objects ya tiene RLS habilitada por Supabase; solo agregamos la política.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS avatar_rw_own ON storage.objects;
CREATE POLICY avatar_rw_own ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id = 'avatars' AND name = 'avatars/' || auth.uid()::text || '.png')
    WITH CHECK (bucket_id = 'avatars' AND name = 'avatars/' || auth.uid()::text || '.png');
