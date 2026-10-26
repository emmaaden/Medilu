// Fase Z: percentiles de crecimiento OMS (método LMS).
//
// Datos: oms-lms.json, generado por scripts/generar-oms.mjs desde las tablas oficiales
// (Child Growth Standards 2006 hasta los 5 años y Growth Reference 2007 de 5 a 19).
// Un punto por mes; entre meses se interpola linealmente L, M y S.

import datos from "./oms-lms.json"

export type Indicador = "peso" | "talla" | "pc" | "imc"
/** 1 = varón, 2 = mujer (codificación de la OMS). */
export type SexoOms = 1 | 2

type FilaLms = [number, number, number, number] // [edadMeses, L, M, S]
const TABLAS = datos as unknown as Record<Indicador, Record<"1" | "2", FilaLms[]>>

export const INDICADORES: Record<Indicador, { label: string; unidad: string; corto: string }> = {
  peso: { label: "Peso para la edad", unidad: "kg", corto: "Peso" },
  talla: { label: "Talla para la edad", unidad: "cm", corto: "Talla" },
  pc: { label: "Perímetro cefálico para la edad", unidad: "cm", corto: "PC" },
  imc: { label: "IMC para la edad", unidad: "kg/m²", corto: "IMC" },
}

/** Percentiles que se dibujan (z de cada uno). */
export const PERCENTILES = [
  { p: 3, z: -1.881 },
  { p: 15, z: -1.036 },
  { p: 50, z: 0 },
  { p: 85, z: 1.036 },
  { p: 97, z: 1.881 },
] as const

export const DIAS_POR_MES = 30.4375

/** Edad máxima (meses) con referencia OMS para el indicador. */
export function edadMaxima(ind: Indicador): number {
  const t = TABLAS[ind]["1"]
  return t[t.length - 1][0]
}

function lms(ind: Indicador, sexo: SexoOms, meses: number): { l: number; m: number; s: number } | null {
  const t = TABLAS[ind][String(sexo) as "1" | "2"]
  if (meses < t[0][0] || meses > t[t.length - 1][0]) return null
  // Búsqueda lineal: las tablas tienen como mucho 230 filas.
  let i = 0
  while (i < t.length - 1 && t[i + 1][0] <= meses) i++
  const a = t[i]
  const b = t[Math.min(i + 1, t.length - 1)]
  const f = b[0] === a[0] ? 0 : (meses - a[0]) / (b[0] - a[0])
  return { l: a[1] + (b[1] - a[1]) * f, m: a[2] + (b[2] - a[2]) * f, s: a[3] + (b[3] - a[3]) * f }
}

function valorEnZ({ l, m, s }: { l: number; m: number; s: number }, z: number) {
  return l === 0 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l)
}

/**
 * Puntaje z de una medida. Por encima de +3 / debajo de -3 aplica la corrección de la
 * OMS (la distribución se extiende con la distancia entre 2 y 3 DE), que es la que
 * usa para peso e IMC; en talla y PC (L = 1) da lo mismo que sin corregir.
 */
export function puntajeZ(ind: Indicador, sexo: SexoOms, meses: number, valor: number): number | null {
  const p = lms(ind, sexo, meses)
  if (!p || !(valor > 0)) return null
  const { l, m, s } = p
  const z = l === 0 ? Math.log(valor / m) / s : (Math.pow(valor / m, l) - 1) / (l * s)
  if (z > 3) {
    const sd3 = valorEnZ(p, 3)
    return 3 + (valor - sd3) / (sd3 - valorEnZ(p, 2))
  }
  if (z < -3) {
    const sd3 = valorEnZ(p, -3)
    return -3 + (valor - sd3) / (valorEnZ(p, -2) - sd3)
  }
  return z
}

/** Función de distribución normal estándar (Abramowitz–Stegun 7.1.26). */
function normalCdf(z: number) {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2))
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2)
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2
}

export function percentilDeZ(z: number): number {
  return normalCdf(z) * 100
}

/** "P50", "P2,1", "<P0,1"… para mostrar. */
export function formatoPercentil(z: number): string {
  const p = percentilDeZ(z)
  if (p < 0.1) return "<P0,1"
  if (p > 99.9) return ">P99,9"
  const r = p < 1 || p > 99 ? p.toFixed(1) : Math.round(p).toString()
  return `P${r.replace(".", ",")}`
}

/** Lectura clínica orientativa del puntaje z (criterios OMS). */
export function interpretacion(ind: Indicador, z: number): { texto: string; alerta: boolean } {
  if (ind === "talla") {
    if (z < -3) return { texto: "Talla baja severa", alerta: true }
    if (z < -2) return { texto: "Talla baja", alerta: true }
    if (z > 3) return { texto: "Talla muy alta", alerta: true }
    return { texto: "Normal", alerta: false }
  }
  if (ind === "pc") {
    if (z < -2) return { texto: "Microcefalia (< -2 DE)", alerta: true }
    if (z > 2) return { texto: "Macrocefalia (> +2 DE)", alerta: true }
    return { texto: "Normal", alerta: false }
  }
  if (ind === "peso") {
    if (z < -3) return { texto: "Bajo peso severo", alerta: true }
    if (z < -2) return { texto: "Bajo peso", alerta: true }
    if (z > 2) return { texto: "Peso elevado: evaluar con IMC", alerta: true }
    return { texto: "Normal", alerta: false }
  }
  if (z < -3) return { texto: "Emaciación severa", alerta: true }
  if (z < -2) return { texto: "Emaciación", alerta: true }
  if (z > 3) return { texto: "Obesidad", alerta: true }
  if (z > 2) return { texto: "Sobrepeso", alerta: true }
  if (z > 1) return { texto: "Riesgo de sobrepeso", alerta: false }
  return { texto: "Normal", alerta: false }
}

/** Curvas de percentiles entre dos edades (un punto por mes). */
export function curvas(ind: Indicador, sexo: SexoOms, desde: number, hasta: number) {
  const fin = Math.min(hasta, edadMaxima(ind))
  const paso = fin - desde > 72 ? 3 : 1
  const puntos: Record<string, number>[] = []
  for (let mes = Math.max(0, desde); mes <= fin; mes += paso) {
    const p = lms(ind, sexo, mes)
    if (!p) continue
    const fila: Record<string, number> = { meses: mes }
    for (const { p: pc, z } of PERCENTILES) fila[`p${pc}`] = Number(valorEnZ(p, z).toFixed(2))
    puntos.push(fila)
  }
  return puntos
}

// ---------------------------------------------------------------------------
// Edad
// ---------------------------------------------------------------------------

function diasEntre(desdeIso: string, hastaIso: string) {
  const a = Date.UTC(+desdeIso.slice(0, 4), +desdeIso.slice(5, 7) - 1, +desdeIso.slice(8, 10))
  const b = Date.UTC(+hastaIso.slice(0, 4), +hastaIso.slice(5, 7) - 1, +hastaIso.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** Semanas de gestación por debajo de las cuales se corrige la edad. */
export const PREMATURO_SEMANAS = 37
/** Hasta qué edad cronológica (meses) se usa la edad corregida. */
export const CORREGIR_HASTA_MESES = 24

/**
 * Edad en meses (fraccionaria) en una fecha. Con edad gestacional < 37 semanas y
 * menos de 24 meses cronológicos, se descuenta lo que faltó para las 40 semanas.
 */
export function edadMeses(
  nacimientoIso: string,
  fechaIso: string,
  gestacion?: { semanas: number | null; dias?: number | null } | null
): { meses: number; corregida: boolean } {
  const dias = diasEntre(nacimientoIso, fechaIso)
  const cronologica = dias / DIAS_POR_MES
  const sem = gestacion?.semanas
  if (sem && sem < PREMATURO_SEMANAS && cronologica < CORREGIR_HASTA_MESES) {
    const faltan = 280 - (sem * 7 + (gestacion?.dias ?? 0))
    return { meses: Math.max(0, (dias - faltan) / DIAS_POR_MES), corregida: true }
  }
  return { meses: cronologica, corregida: false }
}

/** "3 a 4 m", "7 m 12 d"… */
export function formatoEdad(meses: number): string {
  if (meses < 0) return "—"
  if (meses < 24) {
    const m = Math.floor(meses)
    const d = Math.round((meses - m) * DIAS_POR_MES)
    return d > 0 ? `${m} m ${d} d` : `${m} m`
  }
  const a = Math.floor(meses / 12)
  const m = Math.floor(meses - a * 12)
  return m > 0 ? `${a} a ${m} m` : `${a} a`
}

export function sexoOms(sexo: string | null | undefined): SexoOms | null {
  const s = (sexo || "").trim().toLowerCase()
  if (s.startsWith("m") && !s.startsWith("mu")) return 1 // Masculino
  if (s.startsWith("f") || s.startsWith("mu")) return 2 // Femenino / Mujer
  return null
}

// ---------------------------------------------------------------------------
// Medición → valores para las curvas
// ---------------------------------------------------------------------------

export type Medicion = {
  id: string
  fecha: string
  pesoKg: number | null
  tallaCm: number | null
  posicion: "acostado" | "parado" | null
  pcCm: number | null
  notas: string | null
  profesional?: string | null
}

/**
 * Talla para comparar con la OMS: hasta los 24 meses la referencia es acostado
 * (longitud) y después de pie; medida en la otra posición se ajusta 0,7 cm.
 */
export function tallaReferencia(talla: number, posicion: Medicion["posicion"], meses: number) {
  if (meses < 24 && posicion === "parado") return talla + 0.7
  if (meses >= 24 && posicion === "acostado") return talla - 0.7
  return talla
}

export function valorIndicador(ind: Indicador, m: Medicion, meses: number): number | null {
  if (ind === "peso") return m.pesoKg
  if (ind === "pc") return m.pcCm
  if (ind === "talla") return m.tallaCm == null ? null : tallaReferencia(m.tallaCm, m.posicion, meses)
  if (m.pesoKg == null || m.tallaCm == null) return null
  const t = tallaReferencia(m.tallaCm, m.posicion, meses) / 100
  return m.pesoKg / (t * t)
}
