-- =============================================================================
-- Fase Z: módulo de pediatría.
--
--   antecedente_perinatal  una fila por paciente (nacimiento, edad gestacional...).
--   medicion_crecimiento   peso / talla / perímetro cefálico por fecha (curvas OMS).
--   vacuna_aplicada        carnet de vacunación (Calendario Nacional AR u otras).
--   hito_desarrollo        pautas madurativas evaluadas (una fila por hito).
--
-- Los catálogos (vacunas, hitos) viven en backend/utils/pediatria.js: acá solo se
-- guardan los códigos. Mediciones y vacunas no se borran: el autor las ANULA.
--
-- RLS (mismo criterio que registro_clinico):
--   SELECT  miembro de la clínica activa.
--   INSERT  quien puede escribir HC, en la clínica activa y como sí mismo.
--   UPDATE  perinatal e hitos: cualquier profesional de la clínica (se completan
--           entre todos); mediciones y vacunas: solo el autor (para anular).
-- Que el paciente sea de la clínica activa lo verifica el backend (service_role)
-- antes de escribir. El portal del paciente lee con service_role por id de sesión.
--
-- Idempotente: se puede correr más de una vez.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Tablas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS antecedente_perinatal (
    id_paciente          bigint PRIMARY KEY REFERENCES paciente(id) ON DELETE CASCADE,
    clinica_id           uuid NOT NULL REFERENCES clinica(id),
    edad_gestacional_sem smallint CHECK (edad_gestacional_sem BETWEEN 20 AND 45),
    edad_gestacional_dias smallint CHECK (edad_gestacional_dias BETWEEN 0 AND 6),
    peso_nacer_g         integer CHECK (peso_nacer_g BETWEEN 200 AND 8000),
    talla_nacer_cm       numeric(4,1) CHECK (talla_nacer_cm BETWEEN 20 AND 70),
    pc_nacer_cm          numeric(4,1) CHECK (pc_nacer_cm BETWEEN 15 AND 50),
    apgar_1              smallint CHECK (apgar_1 BETWEEN 0 AND 10),
    apgar_5              smallint CHECK (apgar_5 BETWEEN 0 AND 10),
    tipo_parto           text CHECK (tipo_parto IN ('vaginal', 'cesarea', 'forceps', 'otro')),
    grupo_sanguineo      text CHECK (char_length(grupo_sanguineo) <= 10),
    pesquisa_neonatal    text CHECK (pesquisa_neonatal IN ('normal', 'alterada', 'pendiente', 'no_realizada')),
    otoemisiones         text CHECK (otoemisiones IN ('normal', 'alterada', 'pendiente', 'no_realizada')),
    lactancia            text CHECK (lactancia IN ('exclusiva', 'mixta', 'formula', 'destete')),
    notas                text CHECK (char_length(notas) <= 2000),
    id_profesional       bigint NOT NULL REFERENCES profesional(id),
    actualizado_en       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medicion_crecimiento (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_paciente    bigint NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
    clinica_id     uuid NOT NULL REFERENCES clinica(id),
    id_profesional bigint NOT NULL REFERENCES profesional(id),
    fecha          date NOT NULL,
    peso_kg        numeric(6,3) CHECK (peso_kg BETWEEN 0.2 AND 250),
    talla_cm       numeric(5,1) CHECK (talla_cm BETWEEN 20 AND 230),
    -- Hasta los 2 años la OMS mide acostado (longitud); después, de pie (talla).
    posicion       text CHECK (posicion IN ('acostado', 'parado')),
    pc_cm          numeric(4,1) CHECK (pc_cm BETWEEN 15 AND 70),
    notas          text CHECK (char_length(notas) <= 500),
    anulada        boolean NOT NULL DEFAULT false,
    creado_en      timestamptz NOT NULL DEFAULT now(),
    CHECK (peso_kg IS NOT NULL OR talla_cm IS NOT NULL OR pc_cm IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS medicion_crecimiento_paciente_idx ON medicion_crecimiento (id_paciente, fecha);

CREATE TABLE IF NOT EXISTS vacuna_aplicada (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    id_paciente    bigint NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
    clinica_id     uuid NOT NULL REFERENCES clinica(id),
    id_profesional bigint NOT NULL REFERENCES profesional(id),
    vacuna         text NOT NULL CHECK (char_length(vacuna) <= 40),
    vacuna_otra    text CHECK (char_length(vacuna_otra) <= 120),
    dosis          text CHECK (char_length(dosis) <= 40),
    fecha          date NOT NULL,
    lote           text CHECK (char_length(lote) <= 60),
    -- Dónde se aplicó (p. ej. "Vacunatorio Hospital X") al pasar el carnet previo.
    lugar          text CHECK (char_length(lugar) <= 120),
    notas          text CHECK (char_length(notas) <= 500),
    anulada        boolean NOT NULL DEFAULT false,
    creado_en      timestamptz NOT NULL DEFAULT now(),
    CHECK (vacuna <> 'otra' OR vacuna_otra IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS vacuna_aplicada_paciente_idx ON vacuna_aplicada (id_paciente, fecha);

CREATE TABLE IF NOT EXISTS hito_desarrollo (
    id_paciente      bigint NOT NULL REFERENCES paciente(id) ON DELETE CASCADE,
    hito             text NOT NULL CHECK (char_length(hito) <= 40),
    clinica_id       uuid NOT NULL REFERENCES clinica(id),
    id_profesional   bigint NOT NULL REFERENCES profesional(id),
    estado           text NOT NULL CHECK (estado IN ('logrado', 'no_logrado')),
    fecha_evaluacion date NOT NULL,
    actualizado_en   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id_paciente, hito)
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE antecedente_perinatal ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicion_crecimiento  ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacuna_aplicada       ENABLE ROW LEVEL SECURITY;
ALTER TABLE hito_desarrollo       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['antecedente_perinatal', 'medicion_crecimiento', 'vacuna_aplicada', 'hito_desarrollo']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$I', t);
        EXECUTE format($p$
            CREATE POLICY %1$s_select ON %1$I FOR SELECT TO authenticated
            USING (clinica_id = (SELECT app_current_clinica_id())
                   AND (SELECT app_is_clinica_member()))$p$, t);

        EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON %1$I', t);
        EXECUTE format($p$
            CREATE POLICY %1$s_insert ON %1$I FOR INSERT TO authenticated
            WITH CHECK ((SELECT app_puede_escribir_hc())
                        AND clinica_id = (SELECT app_current_clinica_id())
                        AND id_profesional = (SELECT app_current_profesional_id()))$p$, t);

        EXECUTE format('REVOKE ALL PRIVILEGES ON %I FROM anon', t);
        EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON %I FROM authenticated', t);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO authenticated', t);
    END LOOP;
END $$;

-- UPDATE compartido: perinatal e hitos los completa cualquier profesional de la clínica.
DROP POLICY IF EXISTS antecedente_perinatal_update ON antecedente_perinatal;
CREATE POLICY antecedente_perinatal_update ON antecedente_perinatal FOR UPDATE TO authenticated
    USING ((SELECT app_puede_escribir_hc()) AND clinica_id = (SELECT app_current_clinica_id()))
    WITH CHECK ((SELECT app_puede_escribir_hc())
                AND clinica_id = (SELECT app_current_clinica_id())
                AND id_profesional = (SELECT app_current_profesional_id()));

DROP POLICY IF EXISTS hito_desarrollo_update ON hito_desarrollo;
CREATE POLICY hito_desarrollo_update ON hito_desarrollo FOR UPDATE TO authenticated
    USING ((SELECT app_puede_escribir_hc()) AND clinica_id = (SELECT app_current_clinica_id()))
    WITH CHECK ((SELECT app_puede_escribir_hc())
                AND clinica_id = (SELECT app_current_clinica_id())
                AND id_profesional = (SELECT app_current_profesional_id()));

-- UPDATE del autor (solo para anular): mediciones y vacunas.
DROP POLICY IF EXISTS medicion_crecimiento_update ON medicion_crecimiento;
CREATE POLICY medicion_crecimiento_update ON medicion_crecimiento FOR UPDATE TO authenticated
    USING ((SELECT app_puede_escribir_hc())
           AND clinica_id = (SELECT app_current_clinica_id())
           AND id_profesional = (SELECT app_current_profesional_id()))
    WITH CHECK (clinica_id = (SELECT app_current_clinica_id())
                AND id_profesional = (SELECT app_current_profesional_id()));

DROP POLICY IF EXISTS vacuna_aplicada_update ON vacuna_aplicada;
CREATE POLICY vacuna_aplicada_update ON vacuna_aplicada FOR UPDATE TO authenticated
    USING ((SELECT app_puede_escribir_hc())
           AND clinica_id = (SELECT app_current_clinica_id())
           AND id_profesional = (SELECT app_current_profesional_id()))
    WITH CHECK (clinica_id = (SELECT app_current_clinica_id())
                AND id_profesional = (SELECT app_current_profesional_id()));

-- -----------------------------------------------------------------------------
-- Bitácora: acción de carga de datos pediátricos (lista de la Fase Y + la nueva).
-- -----------------------------------------------------------------------------
ALTER TABLE hc_acceso DROP CONSTRAINT IF EXISTS hc_acceso_accion_check;
ALTER TABLE hc_acceso ADD CONSTRAINT hc_acceso_accion_check CHECK (accion IN (
    'ver_hc', 'crear_registro', 'registrar_paciente',
    'exportar_hc', 'importar_hc',
    'ver_registro_auditoria', 'revisar', 'responder',
    'solicitar_autorizacion', 'ver_autorizacion', 'resolver_autorizacion',
    'ver_adjunto_autorizacion', 'editar_cobertura',
    'codigo_vinculacion', 'vincular_historia',
    'editar_datos_paciente',
    'cargar_pediatria'));

COMMIT;
