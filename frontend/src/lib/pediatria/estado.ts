// Fase Z: estado del carnet de vacunas y de los hitos según la edad del chico.

import type { Catalogo, HitoEvaluado, VacunaAplicada, VacunaCatalogo, DosisCatalogo } from "./tipos"

export type EstadoDosis = "aplicada" | "corresponde" | "atrasada" | "fuera_de_edad" | "proxima" | "zona"

export const ESTADO_DOSIS_LABEL: Record<EstadoDosis, string> = {
  aplicada: "Aplicada",
  corresponde: "Corresponde ahora",
  atrasada: "Atrasada",
  fuera_de_edad: "Fuera de edad",
  proxima: "Próxima",
  zona: "Zona de riesgo",
}

/** Margen (meses) después de la edad recomendada antes de marcarla atrasada. */
const MARGEN_VACUNA = 1

export type FilaCarnet = {
  vacuna: VacunaCatalogo
  dosis: DosisCatalogo
  estado: EstadoDosis
  aplicada: VacunaAplicada | null
}

/** Carnet por dosis del calendario, con su estado a la edad (cronológica) actual. */
export function carnet(catalogo: Catalogo, aplicadas: VacunaAplicada[], edadMeses: number): FilaCarnet[] {
  const filas: FilaCarnet[] = []
  for (const v of catalogo.vacunas) {
    for (const d of v.dosis) {
      const aplicada =
        aplicadas.find((a) => a.vacuna === v.codigo && (a.dosis || "").toLowerCase() === d.dosis.toLowerCase()) ?? null
      let estado: EstadoDosis
      if (aplicada) estado = "aplicada"
      else if (v.zona) estado = "zona"
      else if (d.hasta != null && edadMeses > d.hasta) estado = "fuera_de_edad"
      else if (edadMeses >= d.edad + MARGEN_VACUNA && !v.anual) estado = "atrasada"
      else if (edadMeses >= d.edad) estado = "corresponde"
      else estado = "proxima"
      filas.push({ vacuna: v, dosis: d, estado, aplicada })
    }
  }
  return filas
}

/** Aplicadas que no corresponden a una dosis del calendario (otras, anuales extra…). */
export function fueraDeCarnet(catalogo: Catalogo, aplicadas: VacunaAplicada[]) {
  return aplicadas.filter((a) => {
    const v = catalogo.vacunas.find((c) => c.codigo === a.vacuna)
    return !v || !v.dosis.some((d) => d.dosis.toLowerCase() === (a.dosis || "").toLowerCase())
  })
}

/** "2 m", "1 a 3 m", "Al nacer"… */
export function edadRecomendada(meses: number) {
  if (meses === 0) return "Al nacer"
  if (meses < 24) return `${meses} m`
  const a = Math.floor(meses / 12)
  const m = meses % 12
  return m ? `${a} a ${m} m` : `${a} años`
}

// ---------------------------------------------------------------------------
// Hitos
// ---------------------------------------------------------------------------

export type EstadoHito = "logrado" | "no_logrado" | "sin_evaluar" | "alerta"

/** Meses de margen antes de alertar un hito no logrado. */
export function margenHito(edad: number) {
  return edad < 24 ? 3 : 6
}

export function estadoHito(edadHito: number, ev: HitoEvaluado | undefined, edadMeses: number): EstadoHito {
  if (ev?.estado === "logrado") return "logrado"
  if (ev?.estado === "no_logrado") return edadMeses >= edadHito + margenHito(edadHito) ? "alerta" : "no_logrado"
  return "sin_evaluar"
}
