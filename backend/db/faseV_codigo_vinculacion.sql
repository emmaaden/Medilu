-- =============================================================================
-- Fase V — Código de vinculación de la historia clínica
--
-- Contexto: un profesional puede dar de alta a un paciente sin email (no lo sabe).
-- Esa ficha queda sin cuenta. Para que el paciente la vea en su cuenta, el
-- profesional le da un código de vinculación; el paciente, ya registrado y con
-- sesión, lo carga en "Mi historia" y la ficha se ata a su cuenta (persona.id_auth).
-- No hay vinculación por DNI solo: cualquiera podría registrarse con un DNI ajeno.
--
-- Qué hace:
--   1. Tabla codigo_vinculacion: un código vigente por ficha (id_persona), con
--      vencimiento (30 días, lo pone el backend). Se guarda en claro porque el
--      profesional tiene que poder volver a verlo; quien lo ve (el equipo de la
--      clínica) ya ve la historia completa.
--   2. RLS activada SIN políticas + REVOKE a anon/authenticated: solo la usa el
--      backend con service_role.
--   3. Bitácora (hc_acceso): se suman las acciones 'codigo_vinculacion' y
--      'vincular_historia'.
--
-- Verificado en producción (solo lectura, 2026-10-16): la tabla no existe, la
-- restricción de hc_acceso tiene exactamente las 13 acciones de la Fase K, y hay
-- 0 fichas de paciente sin cuenta. Aplicada en producción el 2026-10-16.
--
-- Aditivo: tabla nueva, no toca datos existentes.
-- Idempotente: se puede correr más de una vez.
-- Reversión: ver el bloque comentado al final.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Códigos de vinculación.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS codigo_vinculacion (
    id_persona  bigint PRIMARY KEY REFERENCES persona(id) ON DELETE CASCADE,
    codigo      text NOT NULL UNIQUE,
    creado_por  bigint REFERENCES persona(id) ON DELETE SET NULL,
    creado_en   timestamptz NOT NULL DEFAULT now(),
    vence_en    timestamptz NOT NULL
);

-- -----------------------------------------------------------------------------
-- 2. Solo service_role.
-- -----------------------------------------------------------------------------
ALTER TABLE codigo_vinculacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON codigo_vinculacion FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Bitácora: acciones nuevas (el profesional ve/genera el código; el paciente
--    vincula la historia). Misma lista que la Fase K + las dos nuevas.
-- -----------------------------------------------------------------------------
ALTER TABLE hc_acceso DROP CONSTRAINT IF EXISTS hc_acceso_accion_check;
ALTER TABLE hc_acceso ADD CONSTRAINT hc_acceso_accion_check CHECK (accion IN (
    'ver_hc', 'crear_registro', 'registrar_paciente',
    'exportar_hc', 'importar_hc',
    'ver_registro_auditoria', 'revisar', 'responder',
    'solicitar_autorizacion', 'ver_autorizacion', 'resolver_autorizacion',
    'ver_adjunto_autorizacion', 'editar_cobertura',
    'codigo_vinculacion', 'vincular_historia'));

COMMIT;

-- =============================================================================
-- REVERSIÓN (correr a mano si hiciera falta). Los códigos sin usar se pierden;
-- las fichas ya vinculadas quedan vinculadas (eso vive en persona.id_auth).
-- La restricción vieja falla si ya hay filas con las acciones nuevas en la
-- bitácora (que es append-only): en ese caso dejarla como está.
-- -----------------------------------------------------------------------------
-- BEGIN;
-- DROP TABLE IF EXISTS codigo_vinculacion;
-- ALTER TABLE hc_acceso DROP CONSTRAINT IF EXISTS hc_acceso_accion_check;
-- ALTER TABLE hc_acceso ADD CONSTRAINT hc_acceso_accion_check CHECK (accion IN (
--     'ver_hc', 'crear_registro', 'registrar_paciente',
--     'exportar_hc', 'importar_hc',
--     'ver_registro_auditoria', 'revisar', 'responder',
--     'solicitar_autorizacion', 'ver_autorizacion', 'resolver_autorizacion',
--     'ver_adjunto_autorizacion', 'editar_cobertura'));
-- COMMIT;
-- =============================================================================
