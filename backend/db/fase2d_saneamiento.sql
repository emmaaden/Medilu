-- ===========================================================================
-- Medilu — Fase 2d: saneamiento de la base (seguridad + normalización)
-- ---------------------------------------------------------------------------
-- Aplicada vía Supabase MCP el 2026-09-15. Idempotente.
-- Basada en una revisión completa (advisors de seguridad/performance + chequeos
-- de integridad, todos en 0).
-- ===========================================================================

-- 1. CRÍTICO: eliminar el modelo legacy (pre-Supabase) que quedó con RLS
--    DESACTIVADA y expuesto al rol anon. Tablas vacías y sin uso en el código
--    (hoy: registro_clinico/registro_diente + Google Calendar). Orden por FKs.
DROP TABLE IF EXISTS public.consulta;
DROP TABLE IF EXISTS public.turno;
DROP TABLE IF EXISTS public.historia_clinica;

-- 2. (NO aplicado) Los _id_key parecían índices UNIQUE duplicados del PK, pero
--    varias FKs dependen de ellos (p. ej. especialidad_profesional_id_especialidad_fkey
--    referencia especialidad vía "ESPECIALIDAD_id_key", no vía la PK). Dropearlos
--    exigiría re-apuntar esas FKs a la PK: no vale la pena por el ahorro de espacio.

-- 3. La función SECURITY DEFINER no debe ser ejecutable por anon/public
--    (solo la usa el rol authenticated dentro de las políticas RLS).
REVOKE EXECUTE ON FUNCTION public.app_current_clinica_id() FROM anon, public;

-- 4. Índices sobre FKs de las tablas activas (estaban sin cubrir).
CREATE INDEX IF NOT EXISTS idx_paciente_persona            ON public.paciente(id_persona);
CREATE INDEX IF NOT EXISTS idx_profesional_persona         ON public.profesional(id_persona);
CREATE INDEX IF NOT EXISTS idx_esp_prof_profesional        ON public.especialidad_profesional(id_profesional);
CREATE INDEX IF NOT EXISTS idx_esp_prof_especialidad       ON public.especialidad_profesional(id_especialidad);
CREATE INDEX IF NOT EXISTS idx_horario_profesional         ON public.horario_profesional(id_profesional);
CREATE INDEX IF NOT EXISTS idx_registro_clinico_profesional ON public.registro_clinico(id_profesional);
CREATE INDEX IF NOT EXISTS idx_ortodoncia_paciente         ON public.pacientes_ortodoncia(id_paciente);
CREATE INDEX IF NOT EXISTS idx_ortodoncia_profesional      ON public.pacientes_ortodoncia(id_profesional);
CREATE INDEX IF NOT EXISTS idx_persona_id_auth             ON public.persona(id_auth);

-- 5. Endurecer integridad (los datos actuales ya cumplen).
--    registro_clinico.clinica_id: siempre lo setea un profesional -> NOT NULL.
ALTER TABLE public.registro_clinico ALTER COLUMN clinica_id SET NOT NULL;
--    especialidad_profesional: fila de join sin profesional no tiene sentido, y
--    no debe repetirse el par (profesional, especialidad).
ALTER TABLE public.especialidad_profesional ALTER COLUMN id_profesional SET NOT NULL;
ALTER TABLE public.especialidad_profesional
    ADD CONSTRAINT especialidad_profesional_prof_esp_key UNIQUE (id_profesional, id_especialidad);

-- ---------------------------------------------------------------------------
-- NO aplicado (requiere decisión de producto):
--   persona.clinica_id SET NOT NULL — rompería el auto-registro de PACIENTE, que
--   hoy inserta persona.clinica_id = NULL (los pacientes que se registran solos no
--   quedan atados a una clínica). Definir cómo se asigna la clínica de un paciente
--   auto-registrado (o quitar ese flujo) antes de poner NOT NULL.
--
-- Config (dashboard de Supabase, no SQL):
--   - Auth: activar "Leaked password protection" (HaveIBeenPwned).
--   - Platform: upgrade de Postgres (hay parches de seguridad pendientes).
-- ---------------------------------------------------------------------------
