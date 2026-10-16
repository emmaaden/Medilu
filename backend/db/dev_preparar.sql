-- =============================================================================
-- DEV-Medilu — Preparar la base de destino antes de copiar prod
--
-- Lo corre copiar_prod_a_dev.ps1 contra DEV-Medilu, dentro de la misma transacción
-- que la copia (si algo falla, DEV queda como estaba).
--
--   - Si public ya tiene tablas y NO se pidió reemplazar: aborta.
--   - Si se pidió reemplazar (variable psql `reemplazar` = 'si'): borra public,
--     sesiones, los usuarios de Auth y los buckets, y deja public como en un
--     proyecto nuevo de Supabase.
--   - Crea lo que el dump de public da por hecho: el rol medilu_sesiones (sin
--     login; la contraseña de DEV se pone aparte) y la extensión btree_gist (la
--     usa la restricción de turnos sin solape).
--
-- NUNCA correr contra prod.
-- =============================================================================

CREATE TEMP TABLE _opciones AS SELECT :'reemplazar' = 'si' AS reemplazar;

DO $$
DECLARE
    n int;
    reemplazar boolean;
BEGIN
    SELECT o.reemplazar INTO reemplazar FROM _opciones o;
    SELECT count(*) INTO n FROM pg_tables WHERE schemaname = 'public';
    IF n > 0 AND NOT reemplazar THEN
        RAISE EXCEPTION 'DEV ya tiene % tabla(s) en public. Para pisarlas, correr el script con -Reemplazar.', n;
    END IF;
    IF NOT reemplazar AND (EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM storage.buckets)) THEN
        RAISE EXCEPTION 'DEV ya tiene cuentas de Auth o buckets. Para pisarlos, correr el script con -Reemplazar.';
    END IF;
END $$;

DO $$
BEGIN
    IF (SELECT o.reemplazar FROM _opciones o) THEN
        DROP SCHEMA IF EXISTS public CASCADE;
        DROP SCHEMA IF EXISTS sesiones CASCADE;
        CREATE SCHEMA public;
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
        GRANT ALL ON SCHEMA public TO postgres;
        -- Con las FK activas: el borrado arrastra identities, sesiones, tokens, etc.
        DELETE FROM auth.users;
    END IF;
END $$;

DO $$
DECLARE pol record;
BEGIN
    IF (SELECT o.reemplazar FROM _opciones o) THEN
        FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' LOOP
            EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
        END LOOP;
        -- Storage bloquea el DELETE directo con un trigger; en modo réplica no corre.
        -- Los archivos que hubiera en DEV quedan huérfanos en el bucket (es dev).
        PERFORM set_config('session_replication_role', 'replica', true);
        DELETE FROM storage.objects;
        DELETE FROM storage.buckets;
        PERFORM set_config('session_replication_role', 'origin', true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medilu_sesiones') THEN
        CREATE ROLE medilu_sesiones NOLOGIN;
    END IF;
END $$;

-- Supabase da por defecto todos los permisos a anon/authenticated/service_role en
-- cada tabla nueva de public. Si quedaran, las tablas de DEV tendrían permisos que
-- prod ya les sacó (Fases G2, P, T...). Se quitan: el dump pone los GRANT exactos
-- de prod y al final vuelve a poner los permisos por defecto que tenga prod.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
