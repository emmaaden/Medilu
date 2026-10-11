-- ===========================================================================
-- Medilu — Fase L: Planes, suscripciones y permisos por plan
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de faseK_auditoria2.sql.
-- Es IDEMPOTENTE.
--
-- Modelo:
--   * `plan`        = catálogo comercial (precio, asientos, límites y features).
--                     Los precios viven acá para actualizarlos (inflación) sin deploy.
--   * `suscripcion` = una por clínica: plan + estado (prueba | activa | vencida |
--                     cancelada) + período pago. La activación es MANUAL (panel de
--                     plataforma) hasta integrar Mercado Pago.
--   * Sin plan gratis: toda clínica nueva arranca con 14 días de prueba del plan
--     Clínica. Vencida la prueba (o el período pago + 5 días de gracia) la clínica
--     queda en SOLO LECTURA: ve y exporta sus datos, pero no carga nada nuevo ni
--     recibe turnos online. El paciente nunca paga.
--   * Asientos: cuentan solo los PROFESIONALES (membresías activas con rol admin o
--     profesional). Recepción y auditoría no ocupan asiento.
--
-- Las features son claves de texto; el catálogo y su significado viven en
-- backend/utils/planes.js (y su espejo frontend/src/lib/planes.ts).
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS suscripcion; DROP TABLE IF EXISTS plan;
--   ALTER TABLE clinica ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Catálogo de planes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan (
    id                       text PRIMARY KEY,                 -- 'profesional' | 'equipo' | 'clinica'
    nombre                   text NOT NULL,
    descripcion              text,
    precio_mensual           numeric(12,2) NOT NULL CHECK (precio_mensual >= 0),
    precio_anual             numeric(12,2) NOT NULL CHECK (precio_anual >= 0),
    profesionales_incluidos  int NOT NULL CHECK (profesionales_incluidos >= 1),
    -- Precio mensual de cada profesional por encima de los incluidos.
    -- NULL = el plan no admite profesionales extra (hay que pasar de plan).
    precio_profesional_extra numeric(12,2) CHECK (precio_profesional_extra >= 0),
    -- Tope de miembros de recepción. NULL = sin tope.
    max_recepcion            int CHECK (max_recepcion >= 0),
    features                 text[] NOT NULL DEFAULT '{}',
    orden                    int NOT NULL DEFAULT 0,
    destacado                boolean NOT NULL DEFAULT false,
    activo                   boolean NOT NULL DEFAULT true,
    actualizado_en           timestamptz NOT NULL DEFAULT now()
);

-- Precios finales (IVA incluido), ARS, octubre 2026. Anual = 10 meses (2 de regalo).
INSERT INTO plan (id, nombre, descripcion, precio_mensual, precio_anual, profesionales_incluidos,
                  precio_profesional_extra, max_recepcion, features, orden, destacado)
VALUES
  ('profesional', 'Profesional',
   'Para el profesional independiente: agenda, historia clínica y todo el consultorio en una app.',
   14900, 149000, 1, NULL, 1,
   ARRAY['agenda','historia_clinica','certificados','odontologia','dictado','estudios','importar_hc','recepcion'],
   1, false),
  ('equipo', 'Equipo',
   'Para consultorios con varios profesionales y recepción: agenda compartida y catálogos propios.',
   32900, 329000, 3, 9900, NULL,
   ARRAY['agenda','historia_clinica','certificados','odontologia','dictado','estudios','importar_hc','recepcion',
         'catalogos'],
   2, true),
  ('clinica', 'Clínica',
   'Para clínicas y centros: obras sociales con autorizaciones previas y auditoría médica.',
   74900, 749000, 10, 5900, NULL,
   ARRAY['agenda','historia_clinica','certificados','odontologia','dictado','estudios','importar_hc','recepcion',
         'catalogos','autorizaciones','auditoria'],
   3, false)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Suscripción de cada clínica.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suscripcion (
    clinica_id          uuid PRIMARY KEY REFERENCES clinica(id) ON DELETE CASCADE,
    plan_id             text NOT NULL REFERENCES plan(id),
    estado              text NOT NULL DEFAULT 'prueba'
                        CHECK (estado IN ('prueba', 'activa', 'vencida', 'cancelada')),
    ciclo               text NOT NULL DEFAULT 'mensual' CHECK (ciclo IN ('mensual', 'anual')),
    profesionales_extra int  NOT NULL DEFAULT 0 CHECK (profesionales_extra >= 0),
    prueba_hasta        timestamptz,
    -- Fin del período pago (NULL = sin vencimiento, p. ej. cuentas de cortesía).
    periodo_hasta       timestamptz,
    notas               text,
    creada_en           timestamptz NOT NULL DEFAULT now(),
    actualizada_en      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suscripcion_plan ON suscripcion (plan_id);

-- Backfill: toda clínica sin suscripción arranca una prueba de 14 días del plan Clínica.
INSERT INTO suscripcion (clinica_id, plan_id, estado, prueba_hasta)
SELECT c.id, 'clinica', 'prueba', now() + interval '14 days'
FROM clinica c
WHERE NOT EXISTS (SELECT 1 FROM suscripcion s WHERE s.clinica_id = c.id);

-- La columna vieja `clinica.plan` ('free') queda reemplazada por `suscripcion`.
ALTER TABLE clinica DROP COLUMN IF EXISTS plan;

-- ---------------------------------------------------------------------------
-- 3. RLS. El backend lee/escribe con service_role; estas políticas son respaldo
--    para el camino por-JWT: cualquiera autenticado ve el catálogo de planes y
--    cada miembro ve SOLO la suscripción de su clínica activa. Nadie escribe
--    por-JWT (la activación la hace el backend).
-- ---------------------------------------------------------------------------
ALTER TABLE plan        ENABLE ROW LEVEL SECURITY;
ALTER TABLE suscripcion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_lectura ON plan;
CREATE POLICY plan_lectura ON plan
    FOR SELECT TO authenticated
    USING (activo = true);

DROP POLICY IF EXISTS suscripcion_lectura ON suscripcion;
CREATE POLICY suscripcion_lectura ON suscripcion
    FOR SELECT TO authenticated
    USING (clinica_id = public.app_current_clinica_id());

-- Mismo criterio que faseG2: el rol anon no toca tablas de negocio.
REVOKE ALL ON plan, suscripcion FROM anon;
