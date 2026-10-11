-- ===========================================================================
-- Medilu — Verificación de la Fase 1
-- Proyecto Supabase: Emma Project (rpdrgmvcxhxuwxkwixyy)
-- ---------------------------------------------------------------------------
-- Cómo usar: pegá TODO este archivo en el SQL Editor de Supabase y ejecutá.
-- Corré cada consulta (están separadas) o "Run" a todo; mirá la última columna:
--   ✅ OK    = ya está creado / configurado
--   ❌ FALTA = hay que correr db/esquema_supabase.sql (Sección B / ALTER email)
-- Es solo de LECTURA: no modifica nada.
-- ===========================================================================


-- 1) CHECKLIST GENERAL --------------------------------------------------------
WITH checks AS (
    -- Sección A (deberían existir desde antes)
    SELECT 1 AS orden, 'A · tabla persona' AS item,
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'persona') AS ok
    UNION ALL
    SELECT 2, 'A · tabla paciente',
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'paciente')
    UNION ALL
    SELECT 3, 'A · tabla profesional',
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'profesional')
    UNION ALL
    SELECT 4, 'A · tabla especialidad',
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'especialidad')
    UNION ALL
    SELECT 5, 'A · tabla especialidad_profesional',
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'especialidad_profesional')
    UNION ALL
    SELECT 6, 'A · tabla horario_profesional',
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'horario_profesional')
    UNION ALL
    -- Fase 1 · columna email en persona
    SELECT 10, 'F1 · persona.email',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'persona'
                  AND column_name = 'email')
    UNION ALL
    -- Fase 1 · tabla registro_clinico
    SELECT 11, 'F1 · tabla registro_clinico',
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'registro_clinico')
    UNION ALL
    SELECT 12, 'F1 · registro_clinico.id_paciente',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'registro_clinico'
                  AND column_name = 'id_paciente')
    UNION ALL
    SELECT 13, 'F1 · registro_clinico.id_profesional',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'registro_clinico'
                  AND column_name = 'id_profesional')
    UNION ALL
    SELECT 14, 'F1 · registro_clinico.profesional_nombre',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'registro_clinico'
                  AND column_name = 'profesional_nombre')
    UNION ALL
    -- Fase 1 · tabla registro_diente
    SELECT 15, 'F1 · tabla registro_diente',
        EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = 'registro_diente')
    UNION ALL
    SELECT 16, 'F1 · registro_diente.id_registro',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'registro_diente'
                  AND column_name = 'id_registro')
    UNION ALL
    SELECT 17, 'F1 · registro_diente.estado (con CHECK)',
        EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'registro_diente'
                  AND column_name = 'estado')
    UNION ALL
    -- Fase 1 · índices
    SELECT 18, 'F1 · idx_registro_clinico_paciente',
        EXISTS (SELECT 1 FROM pg_indexes
                WHERE schemaname = 'public' AND indexname = 'idx_registro_clinico_paciente')
    UNION ALL
    SELECT 19, 'F1 · idx_registro_diente_registro',
        EXISTS (SELECT 1 FROM pg_indexes
                WHERE schemaname = 'public' AND indexname = 'idx_registro_diente_registro')
    UNION ALL
    -- Fase 1 · RLS activado
    SELECT 20, 'F1 · RLS en registro_clinico',
        COALESCE((SELECT c.relrowsecurity FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'registro_clinico'), false)
    UNION ALL
    SELECT 21, 'F1 · RLS en registro_diente',
        COALESCE((SELECT c.relrowsecurity FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                  WHERE n.nspname = 'public' AND c.relname = 'registro_diente'), false)
)
SELECT item,
       CASE WHEN ok THEN '✅ OK' ELSE '❌ FALTA' END AS estado
FROM checks
ORDER BY orden;


-- 2) DETALLE de columnas de las tablas nuevas (para revisar tipos) ------------
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('registro_clinico', 'registro_diente')
ORDER BY table_name, ordinal_position;


-- 3) Restricción CHECK de registro_diente.estado (debe listar los 4 estados) --
SELECT conname AS restriccion, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = to_regclass('public.registro_diente')  -- NULL (sin error) si aún no existe
  AND contype = 'c';


-- 4) (Opcional) Conteo rápido de datos existentes ----------------------------
--    Útil una vez que ya cargaste algún paciente desde la app.
SELECT
    (SELECT count(*) FROM persona)          AS personas,
    (SELECT count(*) FROM paciente)         AS pacientes,
    (SELECT count(*) FROM profesional)      AS profesionales,
    (SELECT count(*) FROM registro_clinico) AS registros_clinicos,
    (SELECT count(*) FROM registro_diente)  AS dientes;
