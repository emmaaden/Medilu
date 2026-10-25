// Fase Z: utilidades compartidas por el panel pediátrico.

import { hoyAR } from "@/lib/fecha"
import {
  edadMaxima,
  edadMeses,
  puntajeZ,
  valorIndicador,
  type Indicador,
  type SexoOms,
} from "@/lib/pediatria/oms"
import type { MedicionApi, Perinatal } from "@/lib/pediatria/tipos"

/** "9,5" o "9.5" → 9.5; vacío → null. */
export function numero(s: string): number | null {
  const t = s.trim().replace(",", ".")
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function textoNumero(n: number | null | undefined) {
  return n == null ? "" : String(n).replace(".", ",")
}

export function decimal(n: number | null | undefined, dec = 1) {
  return n == null ? "—" : n.toFixed(dec).replace(".", ",")
}

export type PuntoCrecimiento = { meses: number; valor: number; z: number; fecha: string }

/** Puntos del paciente para un indicador (con edad corregida si corresponde). */
export function puntosPaciente(
  ind: Indicador,
  sexo: SexoOms,
  nacimiento: string,
  mediciones: MedicionApi[],
  perinatal: Perinatal | null
): PuntoCrecimiento[] {
  const gest = perinatal ? { semanas: perinatal.edadGestacionalSem, dias: perinatal.edadGestacionalDias } : null
  const out: PuntoCrecimiento[] = []
  for (const m of mediciones) {
    const { meses } = edadMeses(nacimiento, m.fecha, gest)
    const valor = valorIndicador(ind, m, meses)
    if (valor == null || meses > edadMaxima(ind)) continue
    const z = puntajeZ(ind, sexo, meses, valor)
    if (z == null) continue
    out.push({ meses: Number(meses.toFixed(2)), valor: Number(valor.toFixed(2)), z, fecha: m.fecha })
  }
  return out
}

/** Hasta qué edad (años) se muestra el panel pediátrico. */
export const EDAD_PEDIATRICA = 19

/** ¿Edad pediátrica? (para decidir si se muestra el panel). */
export function esPediatrico(nacimiento: string | undefined | null) {
  if (!nacimiento) return false
  return edadMeses(nacimiento, hoyAR()).meses < EDAD_PEDIATRICA * 12
}
