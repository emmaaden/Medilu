-- ===========================================================================
-- Medilu — Fase 2b: URL pública de turnos por clínica (slug)
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de fase2_multiclinica.sql.
-- Es idempotente.
--
-- Cierra el aislamiento por tenant en el lado público: cada clínica tiene su
-- propia página de reservas (turnos.html?clinica=<slug>) que muestra solo sus
-- profesionales. El backend resuelve el slug -> clinica_id y filtra el listado.
-- ===========================================================================

-- 1. Columna slug (URL amigable, única por clínica).
ALTER TABLE clinica ADD COLUMN IF NOT EXISTS slug text;

-- 2. Backfill: generar un slug para las clínicas que todavía no lo tengan.
--    Sin depender de la extensión unaccent: translate() cubre los acentos del
--    español; el resto de lo no alfanumérico se reemplaza por guiones.
DO $$
DECLARE
    r    RECORD;
    base text;
    cand text;
    n    int;
BEGIN
    FOR r IN SELECT id, nombre FROM clinica WHERE slug IS NULL OR slug = '' LOOP
        base := translate(lower(trim(coalesce(r.nombre, ''))), 'áéíóúñü', 'aeiounu');
        base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
        base := trim(both '-' from base);
        IF base IS NULL OR base = '' THEN
            base := 'clinica';
        END IF;
        base := left(base, 40);

        -- Resolver colisiones agregando un sufijo numérico.
        cand := base;
        n := 1;
        WHILE EXISTS (SELECT 1 FROM clinica WHERE slug = cand) LOOP
            n := n + 1;
            cand := left(base, 34) || '-' || n::text;
        END LOOP;

        UPDATE clinica SET slug = cand WHERE id = r.id;
    END LOOP;
END $$;

-- 3. Unicidad del slug (una vez backfilleados, no puede haber nulos duplicados).
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clinica_slug_key') THEN
        ALTER TABLE clinica ADD CONSTRAINT clinica_slug_key UNIQUE (slug);
    END IF;
END $$;
