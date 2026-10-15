import { api } from "@/lib/api"

/** Fase O: una cuenta puede ser del equipo de una clínica y además paciente. */
export type Perfil = "staff" | "paciente"

type SelectPerfilResponse = { needsClinicSelection?: boolean }

/**
 * Entra (o cambia) con ese perfil y devuelve a dónde ir. La navegación conviene hacerla
 * completa (`window.location.assign`) para que toda la app tome la nueva sesión.
 */
export async function cambiarPerfil(perfil: Perfil): Promise<string> {
  const res = await api.post<SelectPerfilResponse>("/auth/select-perfil", { perfil })
  if (perfil === "paciente") return "/mis-turnos"
  return res?.needsClinicSelection ? "/seleccionar-clinica" : "/dashboard"
}
