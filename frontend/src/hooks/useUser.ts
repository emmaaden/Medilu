import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import type { PlanSesion } from "@/lib/planes"

// Rol de la membresía en una clínica (Fase J: + auditor).
export type RolClinica = "admin" | "profesional" | "recepcion" | "auditor"

export type ClinicaMembresia = {
  clinicaId: string
  nombre: string | null
  rol: RolClinica
}

export type CurrentUser = {
  user: string
  email: string
  fullName: string | null
  idRole: number
  id: string
  role: string
  // Fase A (multi-clínica): clínica activa, rol en ella y todas las membresías.
  clinicaId: string | null
  rol: RolClinica | null
  esAdmin: boolean
  // Fase J: alcance del auditor (obra social) en la clínica activa; null = interno.
  alcanceObraSocial?: string | null
  clinicas: ClinicaMembresia[]
  needsClinicSelection: boolean
  // Fase O: perfiles de la cuenta (staff y/o paciente). Con los dos y sin elegir
  // todavía, `role` viene vacío y needsProfileSelection en true.
  perfiles: ("staff" | "paciente")[]
  needsProfileSelection: boolean
  // Fase L: plan de la clínica activa (null para el paciente o sin clínica elegida).
  plan: PlanSesion | null
  // Fase L: equipo de la plataforma (activa planes y edita precios).
  esPlataforma: boolean
}

/**
 * Estado de sesión ligero para la UI pública (p. ej. el navbar).
 * Llama a GET /api/user; si no hay sesión (401) devuelve `user: null`.
 */
export function useUser() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api
      .get<CurrentUser>("/api/user")
      .then((d) => active && setUser(d))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return { user, loading }
}
