-- ===========================================================================
-- Medilu — Fase H: Odontograma profesional (por caras + estados)
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase. Es idempotente.
--
-- El odontograma pasa de "un estado por diente entero" a un modelo clínico real:
-- cada fila de `registro_diente` es un HALLAZGO sobre un diente, que puede estar
-- localizado en una CARA (mesial, distal, oclusal/incisal, vestibular, lingual/
-- palatina) o aplicar al diente completo (corona, ausente, endodoncia, etc.), y
-- que distingue si ya está REALIZADO (azul) o si es un tratamiento PENDIENTE (rojo).
--
-- Cambios en `registro_diente`:
--   1. Nueva columna `condicion` — el hallazgo clínico (caries, obturacion, corona...).
--   2. Nueva columna `cara`      — la superficie afectada, o NULL si es diente completo.
--   3. La columna `estado` cambia de semántica: antes era el hallazgo
--      (sano/caries/tratado/falta); ahora es realizado|pendiente.
--   4. `numero` se normaliza a la numeración FDI pura ("18"), sin el prefijo "tooth-".
--
-- Migración de datos existentes (mapeo legacy -> nuevo):
--   caries  -> condicion=caries,      estado=pendiente
--   tratado -> condicion=obturacion,  estado=realizado
--   falta   -> condicion=ausente,     estado=realizado
--   sano    -> se elimina (en el modelo nuevo, "sano" = ausencia de hallazgos)
--
-- RLS y GRANTs no cambian: siguen definidos por tabla y vía el registro_clinico
-- padre (ver fase2c_rls_jwt.sql / faseG_fix_rls.sql / faseG2_revoke_anon.sql).
--
-- ROLLBACK (destructivo — solo si hace falta revertir el esquema):
--   ALTER TABLE registro_diente DROP CONSTRAINT IF EXISTS registro_diente_estado_check;
--   ALTER TABLE registro_diente DROP CONSTRAINT IF EXISTS registro_diente_cara_check;
--   ALTER TABLE registro_diente DROP CONSTRAINT IF EXISTS registro_diente_condicion_check;
--   ALTER TABLE registro_diente DROP COLUMN IF EXISTS condicion;
--   ALTER TABLE registro_diente DROP COLUMN IF EXISTS cara;
--   ALTER TABLE registro_diente ADD  CONSTRAINT registro_diente_estado_check
--       CHECK (estado IN ('sano','caries','tratado','falta'));
-- ===========================================================================

-- 1. Nuevas columnas (aditivas).
ALTER TABLE registro_diente ADD COLUMN IF NOT EXISTS condicion text;
ALTER TABLE registro_diente ADD COLUMN IF NOT EXISTS cara      text;

-- 2. Soltar el CHECK viejo de `estado` para poder migrar la semántica.
ALTER TABLE registro_diente DROP CONSTRAINT IF EXISTS registro_diente_estado_check;

-- 3. Derivar `condicion` a partir del `estado` legacy (solo filas sin migrar).
UPDATE registro_diente
   SET condicion = CASE estado
                     WHEN 'caries'  THEN 'caries'
                     WHEN 'tratado' THEN 'obturacion'
                     WHEN 'falta'   THEN 'ausente'
                     ELSE 'sano'
                   END
 WHERE condicion IS NULL;

-- 4. Recalcular `estado` a realizado|pendiente (lee el `estado` legacy, aún intacto).
UPDATE registro_diente
   SET estado = CASE
                  WHEN estado IN ('caries') THEN 'pendiente'
                  ELSE 'realizado'
                END
 WHERE estado NOT IN ('realizado', 'pendiente');

-- 5. Normalizar `numero` a FDI puro (quitar el prefijo "tooth-").
UPDATE registro_diente
   SET numero = replace(numero, 'tooth-', '')
 WHERE numero LIKE 'tooth-%';

-- 6. Eliminar las filas "sano" legacy: en el modelo nuevo no son hallazgos.
DELETE FROM registro_diente WHERE condicion = 'sano';

-- 7. Restricciones nuevas.
ALTER TABLE registro_diente ALTER COLUMN condicion SET NOT NULL;
ALTER TABLE registro_diente ALTER COLUMN estado    SET DEFAULT 'realizado';

ALTER TABLE registro_diente
    ADD CONSTRAINT registro_diente_estado_check
    CHECK (estado IN ('realizado', 'pendiente'));

ALTER TABLE registro_diente
    ADD CONSTRAINT registro_diente_condicion_check
    CHECK (condicion IN (
        'caries', 'obturacion', 'sellante', 'fractura',
        'corona', 'endodoncia', 'ausente', 'extraccion',
        'implante', 'protesis_fija', 'protesis_removible', 'movilidad'
    ));

ALTER TABLE registro_diente
    ADD CONSTRAINT registro_diente_cara_check
    CHECK (cara IS NULL OR cara IN (
        'mesial', 'distal', 'vestibular', 'lingual', 'palatina', 'oclusal', 'incisal'
    ));

-- 8. Índice para consultas por (registro, diente).
CREATE INDEX IF NOT EXISTS idx_registro_diente_numero
    ON registro_diente (id_registro, numero);
