-- =============================================================================
-- Fase Y: el profesional corrige los datos personales del paciente.
--
-- Suma la acción 'editar_datos_paciente' a la bitácora (hc_acceso). Sin esto el
-- cambio se guarda igual, pero el registro en la bitácora falla (solo queda en el
-- log del servidor). Misma lista que la Fase V + la nueva.
--
-- Idempotente: se puede correr más de una vez.
-- =============================================================================

BEGIN;

ALTER TABLE hc_acceso DROP CONSTRAINT IF EXISTS hc_acceso_accion_check;
ALTER TABLE hc_acceso ADD CONSTRAINT hc_acceso_accion_check CHECK (accion IN (
    'ver_hc', 'crear_registro', 'registrar_paciente',
    'exportar_hc', 'importar_hc',
    'ver_registro_auditoria', 'revisar', 'responder',
    'solicitar_autorizacion', 'ver_autorizacion', 'resolver_autorizacion',
    'ver_adjunto_autorizacion', 'editar_cobertura',
    'codigo_vinculacion', 'vincular_historia',
    'editar_datos_paciente'));

COMMIT;
