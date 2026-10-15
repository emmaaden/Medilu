-- =============================================================================
-- Fase T — app_current_paciente_id() sin acceso para anon
-- (auditoría 2026-10-15, hallazgo 12; advisor de Supabase "anon_security_definer_function_executable")
--
-- Era la única función app_* (SECURITY DEFINER) ejecutable por anon y por PUBLIC
-- (vía /rest/v1/rpc/app_current_paciente_id). Sin sesión devuelve NULL, pero no hay
-- motivo para exponerla: la usan las políticas RLS de usuarios autenticados. Queda
-- igual que el resto: solo authenticated y service_role.
--
-- Reversión: GRANT EXECUTE ON FUNCTION public.app_current_paciente_id() TO PUBLIC, anon;
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.app_current_paciente_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_current_paciente_id() TO authenticated, service_role;
