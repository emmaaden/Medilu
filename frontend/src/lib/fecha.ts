/**
 * Fechas y horas en la zona de la clínica (Argentina, UTC-3 sin horario de verano).
 *
 * Regla: nunca usar getHours/setHours/toISOString().split("T") para razonar sobre
 * "el día" o "la hora" — eso trabaja en la zona del navegador y da mal si el equipo
 * está en otra. Acá se arma el instante con el offset fijo y se formatea con Intl
 * pasando la zona explícita.
 */

export const AR_TZ = "America/Argentina/Buenos_Aires"
export const AR_OFFSET = "-03:00"

/** Duración del turno, igual que SLOT_MINUTOS en backend/utils/disponibilidad.js */
export const SLOT_MIN = 30

/** Nombres de día como los guarda `horario_profesional` (lunes = 0). */
export const DIAS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
]

const partesFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: AR_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

function partes(d: Date) {
  const p: Record<string, string> = {}
  for (const { type, value } of partesFmt.formatToParts(d)) p[type] = value
  return p
}

/** Fecha (YYYY-MM-DD) del instante, en hora argentina. */
export function ymdAR(d: Date | string): string {
  const p = partes(typeof d === "string" ? new Date(d) : d)
  return `${p.year}-${p.month}-${p.day}`
}

/** Hora (HH:MM) del instante, en hora argentina. */
export function horaAR(d: Date | string): string {
  const p = partes(typeof d === "string" ? new Date(d) : d)
  return `${p.hour === "24" ? "00" : p.hour}:${p.minute}`
}

/** Minutos transcurridos desde la medianoche argentina. */
export function minutosAR(d: Date | string): number {
  const [h, m] = horaAR(d).split(":")
  return Number(h) * 60 + Number(m)
}

/** Instante a partir de una fecha YYYY-MM-DD y una hora HH:MM argentinas. */
export function instanteAR(ymd: string, hora: string): Date {
  const [h = "00", m = "00"] = hora.split(":")
  return new Date(`${ymd}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00${AR_OFFSET}`)
}

/** Hoy (YYYY-MM-DD) en hora argentina. */
export function hoyAR(): string {
  return ymdAR(new Date())
}

// El mediodía UTC evita que sumar días cruce un cambio de fecha por el offset.
function aMediodia(ymd: string) {
  return new Date(`${ymd}T12:00:00Z`)
}

export function sumarDias(ymd: string, dias: number): string {
  const d = aMediodia(ymd)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function sumarMeses(ymd: string, meses: number): string {
  const d = aMediodia(ymd)
  const diaDelMes = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + meses)
  const ultimo = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)
  ).getUTCDate()
  d.setUTCDate(Math.min(diaDelMes, ultimo))
  return d.toISOString().slice(0, 10)
}

/** Índice del día de la semana con lunes = 0, para indexar DIAS. */
export function diaSemana(ymd: string): number {
  return (aMediodia(ymd).getUTCDay() + 6) % 7
}

/** Nombre del día tal como lo guarda `horario_profesional`. */
export function nombreDia(ymd: string): string {
  return DIAS[diaSemana(ymd)]
}

/** Lunes de la semana de `ymd`. */
export function inicioSemana(ymd: string): string {
  return sumarDias(ymd, -diaSemana(ymd))
}

/** Primer día del mes de `ymd`. */
export function inicioMes(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}

/** Días que cubre la grilla del mes: semanas completas de lunes a domingo. */
export function diasDelMes(ymd: string): string[] {
  const primero = inicioMes(ymd)
  const desde = inicioSemana(primero)
  const dias: string[] = []
  for (let i = 0; i < 42; i++) {
    const d = sumarDias(desde, i)
    dias.push(d)
    // Cortamos al completar la semana que contiene el último día del mes.
    if (i >= 27 && d.slice(0, 7) !== ymd.slice(0, 7) && diaSemana(d) === 6) break
  }
  return dias
}

/** Rango [desde, hasta] en ISO que cubre por completo esos días argentinos. */
export function rangoISO(desdeYmd: string, hastaYmd: string) {
  return {
    desde: instanteAR(desdeYmd, "00:00").toISOString(),
    hasta: instanteAR(sumarDias(hastaYmd, 1), "00:00").toISOString(),
  }
}

const fmtFechaHora = new Intl.DateTimeFormat("es-AR", {
  timeZone: AR_TZ,
  dateStyle: "medium",
  timeStyle: "short",
})

const fmtFecha = new Intl.DateTimeFormat("es-AR", {
  timeZone: AR_TZ,
  dateStyle: "long",
})

const fmtDiaMes = new Intl.DateTimeFormat("es-AR", {
  timeZone: AR_TZ,
  day: "numeric",
  month: "short",
})

const fmtMesAnio = new Intl.DateTimeFormat("es-AR", {
  timeZone: AR_TZ,
  month: "long",
  year: "numeric",
})

/** "26 sept 2026, 18:30" */
export function formatFechaHora(iso: string | Date): string {
  try {
    return fmtFechaHora.format(new Date(iso))
  } catch {
    return String(iso)
  }
}

/** "26 de septiembre de 2026" */
export function formatFecha(iso: string | Date): string {
  try {
    return fmtFecha.format(new Date(iso))
  } catch {
    return String(iso)
  }
}

/** Fecha calendario "YYYY-MM-DD" (sin hora) -> "26 de septiembre de 2026", sin correrse de día. */
export function formatDia(ymd: string): string {
  return formatFecha(`${ymd}T12:00:00${AR_OFFSET}`)
}

/** "26 sept" */
export function formatDiaMes(iso: string | Date): string {
  return fmtDiaMes.format(new Date(iso))
}

/** "septiembre de 2026" */
export function formatMesAnio(ymd: string): string {
  return fmtMesAnio.format(aMediodia(ymd))
}

/** Número del día dentro del mes, para la grilla mensual. */
export function numeroDia(ymd: string): number {
  return aMediodia(ymd).getUTCDate()
}

/** Fecha de nacimiento más antigua aceptada (igual que backend/utils/fechaNacimiento.js). */
export const FECHA_NAC_MIN = "1900-01-01"

/**
 * Error de una fecha de nacimiento "YYYY-MM-DD" (la del input type="date"), o null si
 * es válida o está vacía. Mismas reglas que el backend: que exista y esté entre 1900 y hoy.
 */
export function errorFechaNacimiento(v: string): string | null {
  if (!v) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "La fecha de nacimiento no es válida."
  const d = new Date(`${v}T12:00:00Z`)
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    return "La fecha de nacimiento no existe. Revisá el día y el mes."
  }
  if (v < FECHA_NAC_MIN) return "La fecha de nacimiento no puede ser anterior a 1900."
  if (v > hoyAR()) return "La fecha de nacimiento no puede ser posterior a hoy."
  return null
}

/**
 * Edad en años cumplidos a hoy (hora argentina), o null si la fecha falta o no es
 * válida. Igual que calcEdad en backend/utils/fechaNacimiento.js.
 */
export function calcularEdad(fechaNac: string): number | null {
  if (!fechaNac || errorFechaNacimiento(fechaNac)) return null
  const [hy, hm, hd] = hoyAR().split("-").map(Number)
  const [y, mo, d] = fechaNac.split("-").map(Number)
  let edad = hy - y
  if (hm < mo || (hm === mo && hd < d)) edad--
  return edad >= 0 ? edad : null
}
