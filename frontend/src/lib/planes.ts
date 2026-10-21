/**
 * Planes y permisos por plan (Fase L).
 *
 * Lo que una persona puede hacer en el panel = lo que permite su ROL en la clínica
 * activa ∩ lo que incluye el PLAN de esa clínica. El backend lo exige en cada
 * endpoint (responde 402); acá solo se usa para no mostrar lo que no se puede usar
 * y ofrecer el plan que lo incluye.
 */
import { useEffect, useState } from "react"
import { api, ApiError } from "@/lib/api"
import { WHATSAPP_URL } from "@/lib/site"

/** Espejo de FEATURES en backend/utils/planes.js (mantener alineados). */
export const FEATURES = {
  agenda: "Agenda, turnos online y recordatorios por email",
  historia_clinica: "Historia clínica con CIE-10 y obras sociales",
  certificados: "Certificados médicos con firma",
  odontologia: "Odontograma por caras",
  dictado: "Dictado por voz en la consulta",
  estudios: "Estudios que comparten los pacientes",
  importar_hc: "Importación de historias clínicas",
  recepcion: "Recepción que gestiona la agenda",
  catalogos: "Catálogos propios de obras sociales y prácticas",
  autorizaciones: "Autorizaciones previas de prácticas",
  auditoria: "Auditoría médica y bitácora de accesos",
} as const

export type Feature = keyof typeof FEATURES

/** Estado efectivo de la suscripción (las fechas mandan sobre lo guardado). */
export type EstadoPlan = "prueba" | "activa" | "gracia" | "vencida" | "cancelada"

/** Plan de la clínica activa, tal como lo devuelve /api/user. */
export type PlanSesion = {
  id: string | null
  nombre: string | null
  estado: EstadoPlan
  soloLectura: boolean
  diasRestantes: number | null
  features: string[]
}

/** Un plan del catálogo (/api/planes/catalogo). */
export type Plan = {
  id: string
  nombre: string
  descripcion: string | null
  precioMensual: number
  precioAnual: number
  profesionalesIncluidos: number
  /** null = el plan no admite profesionales extra. */
  precioProfesionalExtra: number | null
  /** null = recepción sin tope. */
  maxRecepcion: number | null
  features: string[]
  orden: number
  destacado: boolean
  activo: boolean
}

export type Catalogo = {
  planes: Plan[]
  features: Record<string, string>
  diasPrueba: number
  planPrueba: string
}

export const ESTADO_LABEL: Record<EstadoPlan, string> = {
  prueba: "En prueba",
  activa: "Activo",
  gracia: "Pago pendiente",
  vencida: "Vencido",
  cancelada: "Cancelado",
}

/** ¿El plan de la sesión incluye esta función? Sin plan cargado → no. */
export function tieneFeature(plan: PlanSesion | null | undefined, f: Feature) {
  return !!plan && plan.features.includes(f)
}

/** Plan más barato que incluye la función (para sugerir a cuál pasar). */
export function planMinimo(planes: Plan[], f: Feature) {
  return [...planes]
    .filter((p) => p.activo && p.features.includes(f))
    .sort((a, b) => a.orden - b.orden)[0]
}

const pesos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
})

/** $ 14.900 */
export function formatoPesos(n: number) {
  return pesos.format(n)
}

/**
 * Monto por ciclo (espejo de calcularMonto en backend/utils/suscripcionMp.js). El
 * anual aplica a los extras el mismo descuento que al plan; `descuentoPct` es el
 * descuento manual de la clínica (Fase X), sobre el total.
 */
export function montoPlan(p: Plan, ciclo: "mensual" | "anual", extras: number, descuentoPct = 0) {
  const extraMensual = p.precioProfesionalExtra == null ? 0 : extras * p.precioProfesionalExtra
  let total: number
  if (ciclo === "anual") {
    const factor = p.precioMensual > 0 ? p.precioAnual / p.precioMensual : 12
    total = p.precioAnual + extraMensual * factor
  } else {
    total = p.precioMensual + extraMensual
  }
  return Math.round((total * (100 - descuentoPct)) / 100)
}

/** Descuento manual que rige para la clínica (Fase X). `hasta` null = sin fin. */
export type Descuento = { pct: number; hasta: string | null }

/** Ahorro de pagar el año contra 12 meses, redondeado a meses enteros. */
export function mesesDeRegalo(p: Plan) {
  if (!p.precioMensual) return 0
  return Math.round(12 - p.precioAnual / p.precioMensual)
}

/** Código de error de plan del backend (402), si lo es. */
export function codigoErrorPlan(err: unknown) {
  if (!(err instanceof ApiError) || err.status !== 402) return null
  const code = (err.data as { code?: string } | null)?.code
  return code === "PLAN_FEATURE" || code === "PLAN_SOLO_LECTURA" || code === "PLAN_LIMITE"
    ? code
    : null
}

/**
 * Hasta integrar Mercado Pago la contratación es manual: el admin pide el plan por
 * WhatsApp y el equipo lo activa desde el panel de plataforma.
 */
export function waContratar(plan: string, clinica?: string | null, ciclo: "mensual" | "anual" = "mensual") {
  const texto = clinica
    ? `Hola, quiero contratar el plan ${plan} (${ciclo}) para la clínica «${clinica}».`
    : `Hola, me interesa el plan ${plan} (${ciclo}) de Medilu y quiero saber cómo seguir.`
  return `${WHATSAPP_URL}?text=${encodeURIComponent(texto)}`
}

// El catálogo cambia poco: una sola consulta por carga de página.
let catalogoCache: Promise<Catalogo> | null = null

export function cargarCatalogo() {
  catalogoCache ??= api.get<Catalogo>("/api/planes/catalogo").catch((e) => {
    catalogoCache = null
    throw e
  })
  return catalogoCache
}

/** Catálogo público de planes (precios, asientos y funciones). */
export function useCatalogoPlanes() {
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let activo = true
    cargarCatalogo()
      .then((c) => activo && setCatalogo(c))
      .catch(() => activo && setError(true))
    return () => {
      activo = false
    }
  }, [])
  return { catalogo, error }
}
