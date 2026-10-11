-- ===========================================================================
-- Medilu — Fase 2: Multi-clínica (SaaS)
-- Proyecto Supabase: Emma Project
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase. Es idempotente.
-- Aísla los datos por clínica (tenant). El backend usa service_role y hace el
-- scoping en la aplicación; la RLS queda como respaldo.
-- ===========================================================================

-- 1. Tabla de clínicas (tenant).
CREATE TABLE IF NOT EXISTS clinica (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre    text NOT NULL,
    plan      text NOT NULL DEFAULT 'free',
    activa    boolean NOT NULL DEFAULT true,
    creada_en timestamptz NOT NULL DEFAULT now()
);

-- 2. Códigos de activación para sumar profesionales a una clínica existente.
CREATE TABLE IF NOT EXISTS codigo_activacion (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo     text UNIQUE NOT NULL,
    clinica_id uuid NOT NULL REFERENCES clinica(id) ON DELETE CASCADE,
    usado      boolean NOT NULL DEFAULT false,
    usado_por  uuid,                 -- persona.id_auth que lo usó
    creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_codigo_activacion_clinica ON codigo_activacion (clinica_id);

-- 3. Vincular el modelo existente a la clínica.
ALTER TABLE persona          ADD COLUMN IF NOT EXISTS clinica_id uuid REFERENCES clinica(id);
ALTER TABLE profesional      ADD COLUMN IF NOT EXISTS es_admin   boolean NOT NULL DEFAULT false;
ALTER TABLE registro_clinico ADD COLUMN IF NOT EXISTS clinica_id uuid REFERENCES clinica(id);
CREATE INDEX IF NOT EXISTS idx_persona_clinica          ON persona (clinica_id);
CREATE INDEX IF NOT EXISTS idx_registro_clinico_clinica ON registro_clinico (clinica_id);

-- 4. DNI único POR clínica (antes era global). Si el constraint tiene otro nombre, ajustá el DROP.
ALTER TABLE persona DROP CONSTRAINT IF EXISTS persona_dni_key;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'persona_clinica_dni_key') THEN
        ALTER TABLE persona ADD CONSTRAINT persona_clinica_dni_key UNIQUE (clinica_id, dni);
    END IF;
END $$;

-- 5. Backfill: mover los datos existentes a una clínica por defecto.
DO $$
DECLARE cid uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM clinica) THEN
        INSERT INTO clinica (nombre) VALUES ('Clínica Principal') RETURNING id INTO cid;
    ELSE
        SELECT id INTO cid FROM clinica ORDER BY creada_en LIMIT 1;
    END IF;
    UPDATE persona          SET clinica_id = cid WHERE clinica_id IS NULL;
    UPDATE registro_clinico SET clinica_id = cid WHERE clinica_id IS NULL;
    -- El/los profesional(es) existentes quedan como admin de esa clínica.
    UPDATE profesional      SET es_admin = true WHERE es_admin = false;
END $$;

-- 6. RLS de respaldo en las tablas nuevas (el backend service_role la salta).
ALTER TABLE clinica           ENABLE ROW LEVEL SECURITY;
ALTER TABLE codigo_activacion ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Nota: la RLS por clinica_id "real" (que cada usuario solo vea su clínica desde
-- el cliente) requiere migrar a auth por JWT de usuario (anon key + token), no
-- service_role. Por ahora el aislamiento lo garantiza el scoping en la aplicación.
-- ---------------------------------------------------------------------------
