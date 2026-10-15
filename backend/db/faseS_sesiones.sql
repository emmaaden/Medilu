-- =============================================================================
-- Fase S — Tabla de sesiones del backend (connect-pg-simple)
--
-- Sin DATABASE_URL el backend guarda las sesiones en memoria: se pierden en cada
-- reinicio o deploy (todos vuelven a iniciar sesión) y no sirve con más de una
-- instancia. Esta fase crea la tabla donde connect-pg-simple las guarda.
--
-- Seguridad: cada sesión guarda el access/refresh token de Supabase del usuario, así
-- que la tabla NO va en `public` (expuesto por la API de Supabase) sino en el esquema
-- `sesiones`, que PostgREST no publica, y sin ningún permiso para anon/authenticated.
-- El backend se conecta con un rol propio, `medilu_sesiones`, que solo puede leer y
-- escribir esta tabla (no ve el resto de la base).
--
-- Después de aplicar, en el SQL Editor (la contraseña no se guarda en el repo):
--   ALTER ROLE medilu_sesiones WITH LOGIN PASSWORD '<contraseña larga y aleatoria>';
-- y en el hosting:
--   DATABASE_URL=postgresql://medilu_sesiones.<ref>:<contraseña>@<host del pooler>:5432/postgres
--
-- Idempotente.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS sesiones;
REVOKE ALL ON SCHEMA sesiones FROM PUBLIC, anon, authenticated;

-- Estructura de connect-pg-simple (node_modules/connect-pg-simple/table.sql).
CREATE TABLE IF NOT EXISTS sesiones.session (
    sid    varchar      NOT NULL COLLATE "default" PRIMARY KEY,
    sess   json         NOT NULL,
    expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sesiones.session (expire);
REVOKE ALL ON sesiones.session FROM PUBLIC, anon, authenticated;

-- Rol del backend para las sesiones: sin login hasta que se le ponga contraseña.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medilu_sesiones') THEN
        CREATE ROLE medilu_sesiones NOLOGIN;
    END IF;
END
$$;
GRANT USAGE ON SCHEMA sesiones TO medilu_sesiones;
GRANT SELECT, INSERT, UPDATE, DELETE ON sesiones.session TO medilu_sesiones;
-- Que no pueda ver ni usar nada de public.
REVOKE ALL ON SCHEMA public FROM medilu_sesiones;

COMMIT;

-- -----------------------------------------------------------------------------
-- Reversión:
--   BEGIN;
--   DROP TABLE IF EXISTS sesiones.session;
--   DROP SCHEMA IF EXISTS sesiones;
--   DROP ROLE IF EXISTS medilu_sesiones;
--   COMMIT;
-- -----------------------------------------------------------------------------
