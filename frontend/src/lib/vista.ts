import { api } from "@/lib/api"
import type { RolVista, VistaSesion } from "@/hooks/useUser"

// Fase Z: "Ver como" del equipo de la plataforma (ver backend/utils/vista.js).

export const ROL_VISTA_LABEL: Record<RolVista, string> = {
  admin: "Admin de clínica",
  profesional: "Profesional",
  recepcion: "Recepción",
  auditor: "Auditoría",
  paciente: "Paciente",
}

// Página de inicio de cada rol (adonde se va después de cambiar de vista).
export const INICIO_VISTA: Record<RolVista, string> = {
  admin: "/dashboard",
  profesional: "/dashboard",
  recepcion: "/dashboard/turnos",
  auditor: "/dashboard/auditoria",
  paciente: "/mis-turnos",
}

export type PedidoVista = {
  rol: RolVista
  especialidad?: string | null
  pacienteId?: number | null
  alcanceIdObraSocial?: number | null
}

export async function entrarEnVista(pedido: PedidoVista) {
  await api.post("/plataforma/vista", pedido)
  // Recarga completa: todo el estado de sesión del cliente se arma de nuevo.
  window.location.assign(INICIO_VISTA[pedido.rol])
}

export async function salirDeVista() {
  await api.del("/plataforma/vista")
  window.location.assign("/dashboard")
}

export function describirVista(v: VistaSesion) {
  return [
    ROL_VISTA_LABEL[v.rol],
    v.especialidad,
    v.pacienteNombre,
  ].filter(Boolean).join(" · ")
}
