// Odontograma (Fase H) — catálogo clínico compartido por el componente Odontogram
// y el generador de PDF. Debe coincidir con backend/utils/odontograma.js y con el
// CHECK de backend/db/faseH_odontograma.sql.

export type Estado = "realizado" | "pendiente"
export type Scope = "cara" | "diente"

// Un hallazgo del odontograma sobre un diente (FDI). `cara` = null => diente completo.
export type Diente = {
  numero: string
  condicion: string
  cara?: string | null
  estado?: Estado | string
  notas?: string
}

export const CONDICIONES: Record<
  string,
  { label: string; corto: string; scope: Scope; estadoDefault: Estado }
> = {
  // Por cara (superficie)
  caries: { label: "Caries", corto: "C", scope: "cara", estadoDefault: "pendiente" },
  obturacion: { label: "Obturación", corto: "Ob", scope: "cara", estadoDefault: "realizado" },
  sellante: { label: "Sellante", corto: "Se", scope: "cara", estadoDefault: "realizado" },
  fractura: { label: "Fractura", corto: "Fr", scope: "cara", estadoDefault: "pendiente" },
  // Diente completo
  corona: { label: "Corona", corto: "Co", scope: "diente", estadoDefault: "realizado" },
  endodoncia: { label: "Endodoncia", corto: "End", scope: "diente", estadoDefault: "realizado" },
  ausente: { label: "Ausente", corto: "Au", scope: "diente", estadoDefault: "realizado" },
  extraccion: { label: "Extracción indicada", corto: "Ext", scope: "diente", estadoDefault: "pendiente" },
  implante: { label: "Implante", corto: "Im", scope: "diente", estadoDefault: "realizado" },
  protesis_fija: { label: "Prótesis fija", corto: "PF", scope: "diente", estadoDefault: "realizado" },
  protesis_removible: { label: "Prótesis removible", corto: "PR", scope: "diente", estadoDefault: "realizado" },
  movilidad: { label: "Movilidad", corto: "Mov", scope: "diente", estadoDefault: "pendiente" },
}

export const CARA_LABEL: Record<string, string> = {
  mesial: "Mesial",
  distal: "Distal",
  vestibular: "Vestibular",
  lingual: "Lingual",
  palatina: "Palatina",
  oclusal: "Oclusal",
  incisal: "Incisal",
}

export const ESTADO_COLOR: Record<Estado, string> = {
  realizado: "#dc2626", // rojo: ya realizado / existente (convención odontológica)
  pendiente: "#2563eb", // azul: a tratar / pendiente
}

export const ESTADO_LABEL: Record<Estado, string> = {
  realizado: "Realizado",
  pendiente: "A tratar",
}

// Numeración FDI. Filas para la representación gráfica (izq. → der. en pantalla).
export const PERMANENTES = {
  superior: ["18", "17", "16", "15", "14", "13", "12", "11", "21", "22", "23", "24", "25", "26", "27", "28"],
  inferior: ["48", "47", "46", "45", "44", "43", "42", "41", "31", "32", "33", "34", "35", "36", "37", "38"],
}
export const TEMPORALES = {
  superior: ["55", "54", "53", "52", "51", "61", "62", "63", "64", "65"],
  inferior: ["85", "84", "83", "82", "81", "71", "72", "73", "74", "75"],
}

// Posición de las 5 caras dentro de la cajita del diente, según cuadrante FDI.
export function carasDelDiente(numero: string) {
  const q = parseInt(numero[0] || "0", 10)
  const pos = parseInt(numero[1] || "0", 10)
  const superior = [1, 2, 5, 6].includes(q)
  const mitadIzquierda = [1, 4, 5, 8].includes(q) // mitad izquierda en pantalla
  const anterior = [1, 2, 3].includes(pos)
  const interna = superior ? "palatina" : "lingual"
  return {
    arriba: superior ? "vestibular" : interna,
    abajo: superior ? interna : "vestibular",
    izquierda: mitadIzquierda ? "distal" : "mesial",
    derecha: mitadIzquierda ? "mesial" : "distal",
    centro: anterior ? "incisal" : "oclusal",
  }
}

export function esTemporal(numero: string) {
  return ["5", "6", "7", "8"].includes(numero[0] || "")
}

export function condicionLabel(c: string) {
  return CONDICIONES[c]?.label ?? c
}

export function estadoLabel(e?: string) {
  return e === "pendiente" ? ESTADO_LABEL.pendiente : ESTADO_LABEL.realizado
}

// Texto de una línea que describe un hallazgo (para PDF / listados).
export function describeDiente(d: Diente): string {
  const cond = condicionLabel(d.condicion)
  const cara = d.cara ? ` · ${CARA_LABEL[d.cara] ?? d.cara}` : ""
  const est = d.estado === "pendiente" ? "a tratar" : "realizado"
  const notas = d.notas ? ` — ${d.notas}` : ""
  return `${cond}${cara} (${est})${notas}`
}
