// Fase Z: tipos de la API de pediatría (backend/controllers/pediatriaController.js).
// Los catálogos (vacunas, hitos) vienen del backend junto con los datos.

import type { Medicion } from "./oms"

export type Perinatal = {
  edadGestacionalSem: number | null
  edadGestacionalDias: number | null
  pesoNacerG: number | null
  tallaNacerCm: number | null
  pcNacerCm: number | null
  apgar1: number | null
  apgar5: number | null
  tipoParto: "vaginal" | "cesarea" | "forceps" | "otro" | null
  grupoSanguineo: string | null
  pesquisaNeonatal: EstadoEstudio | null
  otoemisiones: EstadoEstudio | null
  lactancia: "exclusiva" | "mixta" | "formula" | "destete" | null
  notas: string | null
  actualizadoEn?: string
}

export type EstadoEstudio = "normal" | "alterada" | "pendiente" | "no_realizada"

export type DosisCatalogo = { dosis: string; edad: number; hasta?: number }

export type VacunaCatalogo = {
  codigo: string
  nombre: string
  dosis: DosisCatalogo[]
  zona?: boolean
  anual?: boolean
  fueraDeCalendario?: boolean
}

export type HitoCatalogo = {
  codigo: string
  edad: number
  area: string
  texto: string
}

export type Catalogo = {
  vacunas: VacunaCatalogo[]
  hitos: HitoCatalogo[]
  areasHito: Record<string, string>
}

export type VacunaAplicada = {
  id: string
  vacuna: string
  vacunaOtra: string | null
  dosis: string | null
  fecha: string
  lote: string | null
  lugar: string | null
  notas: string | null
  idProfesional?: number
}

export type HitoEvaluado = {
  hito: string
  estado: "logrado" | "no_logrado"
  fechaEvaluacion: string
}

export type MedicionApi = Medicion & { idProfesional?: number }

export type DatosPediatricos = {
  perinatal: Perinatal | null
  mediciones: MedicionApi[]
  vacunas: VacunaAplicada[]
  hitos: HitoEvaluado[]
  catalogo: Catalogo
  /** profesional.id de la sesión (para mostrar "Anular" solo en lo propio). */
  idProfesional?: number | null
}

export const PERINATAL_VACIO: Perinatal = {
  edadGestacionalSem: null,
  edadGestacionalDias: null,
  pesoNacerG: null,
  tallaNacerCm: null,
  pcNacerCm: null,
  apgar1: null,
  apgar5: null,
  tipoParto: null,
  grupoSanguineo: null,
  pesquisaNeonatal: null,
  otoemisiones: null,
  lactancia: null,
  notas: null,
}

export function nombreVacuna(v: VacunaAplicada, catalogo: Catalogo) {
  if (v.vacuna === "otra") return v.vacunaOtra || "Otra"
  return catalogo.vacunas.find((c) => c.codigo === v.vacuna)?.nombre ?? v.vacuna
}

/** dd/mm/aaaa de una fecha ISO (sin pasar por Date: no corre por zona horaria). */
export function fechaCorta(iso: string | null | undefined) {
  if (!iso) return ""
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}
