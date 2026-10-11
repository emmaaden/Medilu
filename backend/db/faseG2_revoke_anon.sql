-- ===========================================================================
-- Medilu — Fase G.2: quitar el acceso del rol `anon` a las tablas de negocio
-- ---------------------------------------------------------------------------
-- Ejecutar UNA vez en el SQL Editor de Supabase, DESPUÉS de faseG_fix_rls.sql.
-- Es IDEMPOTENTE.
--
-- MOTIVO (advisors 0026 de Supabase — defensa en profundidad):
--   Por defecto Supabase otorga privilegios de tabla al rol `anon`, así que las
--   tablas aparecen en el esquema REST/GraphQL público. Hoy la RLS ya impide que
--   `anon` lea filas (todas las políticas son `TO authenticated`), pero igual expone
--   los nombres de tablas/columnas. Como NINGÚN flujo usa el rol `anon` para leer
--   tablas —los endpoints públicos (profesionales, horarios, reserva) usan el
--   cliente `service_role` en el backend, y el cliente anon del frontend solo habla
--   con Supabase Auth para el reset de contraseña—, se revoca todo acceso de `anon`.
--
--   NO se toca el rol `authenticated`: lo necesita para el camino por-JWT (la RLS
--   filtra las filas). NO se toca `service_role` (saltea grants y RLS).
--
-- ROLLBACK:
--   GRANT SELECT ON <tabla> TO anon;  -- por cada tabla, si hiciera falta.
-- ===========================================================================

REVOKE ALL PRIVILEGES ON
    persona,
    profesional,
    paciente,
    registro_clinico,
    registro_diente,
    especialidad_profesional,
    especialidad,
    horario_profesional,
    pacientes_ortodoncia,
    clinica,
    codigo_activacion,
    membresia,
    turno,
    certificado_medico,
    bloqueo_horario
FROM anon;
