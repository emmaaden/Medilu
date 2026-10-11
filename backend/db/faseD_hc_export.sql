-- ===========================================================================
-- Medilu — Fase D: Exportación / Importación de Historias Clínicas
-- ---------------------------------------------------------------------------
-- Ejecutar en Supabase DESPUÉS de faseC2_fix_rls_miembro.sql. Idempotente.
--
-- Marco legal: Ley 26.529 (derecho del paciente a una copia de su HC),
-- Ley 27.706 (digitalización) y Res. 1840/2018 (interoperabilidad). El export
-- estructurado (JSON) permite portar/re-importar la información.
--
-- Cambios: columnas de ORIGEN en registro_clinico para deduplicar registros al
-- importar (evita cargar dos veces el mismo registro de un archivo).
--   * origen     : etiqueta libre del origen (p. ej. 'import' o 'import:<sistema>').
--   * origen_id  : id del registro en el sistema/archivo de origen.
-- Índice único parcial (id_paciente, origen_id) para que un re-import del mismo
-- archivo no duplique registros.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS uq_registro_origen;
--   ALTER TABLE registro_clinico DROP COLUMN IF EXISTS origen, DROP COLUMN IF EXISTS origen_id;
-- ===========================================================================

ALTER TABLE registro_clinico ADD COLUMN IF NOT EXISTS origen    text;
ALTER TABLE registro_clinico ADD COLUMN IF NOT EXISTS origen_id text;

-- Dedupe: un mismo registro de origen no se importa dos veces para el mismo paciente.
CREATE UNIQUE INDEX IF NOT EXISTS uq_registro_origen
    ON registro_clinico (id_paciente, origen_id)
    WHERE origen_id IS NOT NULL;
