-- =============================================================================
-- Fase Q — Turnos sin solape (restricción de exclusión en `turno`)
-- (auditoría 2026-10-15, hallazgo 3: AUDITORIA_FLUJOS_2026-10-15.md)
--
-- Contexto: el backend ya valida el horario (30', futuro, dentro de la atención) y
-- chequea `estaLibre` antes de insertar o reprogramar, pero entre ese chequeo y el
-- INSERT/UPDATE hay una carrera: dos reservas simultáneas al mismo horario pasan las
-- dos. Esta restricción la cierra en la base. El backend traduce la violación
-- (SQLSTATE 23P01) a un 409 "Ese horario ya no está disponible" (esSolapeTurno).
--
-- Qué hace:
--   1. Instala btree_gist (en el schema `extensions`, como el resto de Supabase):
--      hace falta para usar `id_profesional WITH =` dentro de un índice GiST.
--   2. Crea public.turno_fin_efectivo(inicio, fin): el fin del turno, o inicio + 30'
--      si no tiene (la misma regla que finEfectivo en utils/disponibilidad.js).
--      Es una función porque `timestamptz + interval` es STABLE en Postgres y una
--      restricción de exclusión solo acepta expresiones IMMUTABLE. Marcarla IMMUTABLE
--      es correcto: sumar minutos fijos no depende de la zona horaria (solo los
--      intervalos con días o meses dependen de ella).
--   3. Agrega turno_sin_solape: un profesional no puede tener dos turnos no cancelados
--      que se pisen ([inicio, fin) — uno que termina 10:30 y otro que empieza 10:30
--      NO se pisan).
--
-- Verificado en producción (solo lectura, 2026-10-15): 1 turno en total, 0 pares
-- solapados entre turnos no cancelados, 0 turnos sin `fin`, 0 con duración distinta
-- de 30'. btree_gist disponible (1.7) pero no instalado. De todos modos el paso 0
-- vuelve a chequear los solapes y aborta si encuentra alguno.
--
-- Costo: el ADD CONSTRAINT construye un índice GiST y toma un lock exclusivo sobre
-- `turno` mientras lo hace (instantáneo con el volumen actual).
--
-- Idempotente: se puede correr más de una vez.
-- Reversión: ver el bloque comentado al final.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0. Abortar si ya hay turnos solapados (habría que resolverlos a mano antes).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_pares integer;
BEGIN
    SELECT count(*) INTO v_pares
    FROM public.turno a
    JOIN public.turno b
      ON a.id < b.id
     AND a.id_profesional = b.id_profesional
     AND a.estado <> 'cancelado'
     AND b.estado <> 'cancelado'
     AND tstzrange(a.inicio, coalesce(a.fin, a.inicio + interval '30 minutes'))
      && tstzrange(b.inicio, coalesce(b.fin, b.inicio + interval '30 minutes'));
    IF v_pares > 0 THEN
        RAISE EXCEPTION 'Hay % pares de turnos solapados: resolverlos antes de aplicar la Fase Q.', v_pares;
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 1. btree_gist
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 2. Fin efectivo de un turno (IMMUTABLE, para poder usarla en la restricción).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.turno_fin_efectivo(p_inicio timestamptz, p_fin timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
    SELECT coalesce(p_fin, p_inicio + interval '30 minutes')
$$;

-- -----------------------------------------------------------------------------
-- 3. Restricción de exclusión.
-- -----------------------------------------------------------------------------
ALTER TABLE public.turno DROP CONSTRAINT IF EXISTS turno_sin_solape;
ALTER TABLE public.turno
    ADD CONSTRAINT turno_sin_solape
    EXCLUDE USING gist (
        id_profesional WITH =,
        tstzrange(inicio, public.turno_fin_efectivo(inicio, fin)) WITH &&
    )
    WHERE (estado <> 'cancelado');

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación (después de aplicar):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid = 'public.turno'::regclass AND conname = 'turno_sin_solape';
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- Reversión (no vuelve a abrir nada del backend: solo quita la red de la base):
--   BEGIN;
--   ALTER TABLE public.turno DROP CONSTRAINT IF EXISTS turno_sin_solape;
--   DROP FUNCTION IF EXISTS public.turno_fin_efectivo(timestamptz, timestamptz);
--   -- btree_gist se puede dejar instalada; si se quiere sacar:
--   -- DROP EXTENSION IF EXISTS btree_gist;
--   COMMIT;
-- -----------------------------------------------------------------------------
