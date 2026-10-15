-- =============================================================================
-- Fase R — Permisos de estudios y certificados
-- (auditoría 2026-10-15, hallazgos 11 y 12: AUDITORIA_FLUJOS_2026-10-15.md)
--
-- Estado en producción al 2026-10-15 (leído en vivo):
--   - `anon` tiene TODOS los privilegios sobre estudio y estudio_compartido. La RLS lo
--     frena (las políticas son TO authenticated), pero no hace falta: el advisor de
--     Supabase lo marca y TRUNCATE no pasa por la RLS.
--   - `authenticated` tiene todos los privilegios sobre estudio, estudio_compartido y
--     certificado_medico, incluido UPDATE de `archivo_path` / `id_paciente`.
--
-- Qué queda (lo que el backend hace por JWT):
--   estudio            SELECT, INSERT (subir), UPDATE solo de metadatos, DELETE (borrar)
--   estudio_compartido SELECT, INSERT (compartir), DELETE (revocar)
--   certificado_medico SELECT, INSERT (generar / subir)
-- El backend además valida que el archivo esté en la carpeta del paciente o de la
-- clínica antes de firmar o borrar (estudioController / certificadoController).
--
-- Idempotente. Reversión al final (comentada).
-- =============================================================================

BEGIN;

REVOKE ALL ON public.estudio, public.estudio_compartido FROM anon;

REVOKE ALL ON public.estudio FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.estudio TO authenticated;
GRANT UPDATE (titulo, descripcion, categoria, fecha_estudio) ON public.estudio TO authenticated;

REVOKE ALL ON public.estudio_compartido FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.estudio_compartido TO authenticated;

REVOKE ALL ON public.certificado_medico FROM authenticated;
GRANT SELECT, INSERT ON public.certificado_medico TO authenticated;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación:
--   SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type)
--   FROM information_schema.table_privileges
--   WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')
--     AND table_name IN ('estudio', 'estudio_compartido', 'certificado_medico')
--   GROUP BY 1, 2;
--   -- esperado: sin filas de anon; estudio = DELETE,INSERT,SELECT (+ UPDATE por columna);
--   -- estudio_compartido = DELETE,INSERT,SELECT; certificado_medico = INSERT,SELECT
--
-- Reversión (vuelve a como estaba el 2026-10-15):
--   BEGIN;
--   GRANT ALL ON public.estudio, public.estudio_compartido TO anon;
--   GRANT ALL ON public.estudio, public.estudio_compartido, public.certificado_medico TO authenticated;
--   COMMIT;
-- -----------------------------------------------------------------------------
