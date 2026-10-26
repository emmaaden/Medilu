// Ficha para la obra social: datos del afiliado, odontograma y registro de
// prestaciones (fecha, código, pieza, caras y firma del paciente), con la firma y el
// sello del profesional al pie. Sigue el formato de las fichas que piden las obras
// sociales para liquidar el tratamiento (p. ej. la ficha odontológica de Unimed).
import { jsPDF } from "jspdf"
import { AR_TZ } from "@/lib/fecha"
import { CARA_LABEL, type Diente } from "@/lib/odontograma"
import { drawLeyendaOdontograma, drawOdontograma } from "@/lib/odontogramaPdf"
import type { Paciente } from "@/lib/patientPdf"

/** Profesional que emite (y firma) la ficha. */
export type Emisor = {
  clinica: string
  profesional: string
  especialidad: string
  matricula: string
}

export type PrestacionFicha = {
  fecha: string // dd/mm/aaaa
  codigo: string
  pieza: string
  caras: string // abreviadas: "MOD"
}

/** Abreviatura de cada cara, en el orden en que se escriben (M-O-D-V-L). */
export const CARA_ABREV: [string, string][] = [
  ["mesial", "M"],
  ["oclusal", "O"],
  ["incisal", "I"],
  ["distal", "D"],
  ["vestibular", "V"],
  ["lingual", "L"],
  ["palatina", "P"],
]

export function abreviarCaras(caras: Iterable<string>) {
  const set = new Set(caras)
  return CARA_ABREV.filter(([c]) => set.has(c))
    .map(([, a]) => a)
    .join("")
}

export const REFERENCIA_CARAS = CARA_ABREV.map(([c, a]) => `${a}: ${CARA_LABEL[c]}`).join(" · ")

const M = 12 // margen
const W = 210 - M * 2
const AZUL: [number, number, number] = [29, 92, 170]
const GRIS: [number, number, number] = [96, 109, 125]

/** "M.P. 3230" salvo que la matrícula ya traiga su prefijo (M.N., MP…). */
function textoMatricula(m: string) {
  const t = m.trim()
  if (!t) return ""
  return /^[a-z]/i.test(t) ? t : `M.P. ${t}`
}

export function downloadFichaObraSocial({
  paciente,
  emisor,
  titulo,
  prestaciones,
  dientes,
  odontograma,
  filas: totalFilas = null,
}: {
  paciente: Paciente
  emisor: Emisor
  titulo: string
  prestaciones: PrestacionFicha[]
  /**
   * Renglones del registro, contando las prestaciones cargadas (nunca menos que ellas).
   * null = completar la hoja con renglones en blanco.
   */
  filas?: number | null
  /** Estado del odontograma a informar (vacío = para completar a mano). */
  dientes: Diente[]
  /** Incluir el odontograma (fichas odontológicas). */
  odontograma: boolean
}) {
  const doc = new jsPDF({ format: "a4" })
  const altoPagina = doc.internal.pageSize.height
  let y = 18

  // --- Encabezado: clínica + profesional ---
  if (emisor.clinica) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(15)
    doc.text(emisor.clinica.toUpperCase(), 105, y, { align: "center" })
    y += 6
  }
  const linea = [emisor.profesional, emisor.especialidad, textoMatricula(emisor.matricula)]
    .filter(Boolean)
    .join("  |  ")
  if (linea) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(...GRIS)
    doc.text(linea, 105, y, { align: "center" })
    doc.setTextColor(0, 0, 0)
    y += 4
  }
  doc.setDrawColor(...AZUL)
  doc.setLineWidth(0.5)
  doc.line(M, y, M + W, y)
  doc.setDrawColor(0, 0, 0)
  y += 8

  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(titulo, 105, y, { align: "center" })
  y += 9

  // --- Datos del afiliado, como renglones de formulario ---
  doc.setLineWidth(0.2)
  const campo = (label: string, valor: string, x: number, ancho: number) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text(`${label}:`, x, y)
    const lx = x + doc.getTextWidth(`${label}:`) + 2
    doc.setFont("helvetica", "normal")
    const v = doc.splitTextToSize(valor || "", x + ancho - lx - 1)[0] ?? ""
    doc.text(v, lx + 1, y - 0.3)
    doc.setDrawColor(150, 150, 150)
    doc.line(lx, y + 1, x + ancho, y + 1)
    doc.setDrawColor(0, 0, 0)
  }
  const mitad = W / 2 + 6
  const filas: [string, string][][] = [
    [["Nombre y apellido", paciente.fullName]],
    [
      ["Fecha de nacimiento", paciente.fechaNacimiento],
      ["Edad", paciente.edad ? String(paciente.edad) : ""],
    ],
    [
      ["DNI", paciente.dni],
      ["Teléfono", paciente.telefono],
    ],
    [["Domicilio", paciente.direccion]],
    [
      ["Obra social", paciente.obraSocial],
      ["Plan", paciente.plan || ""],
    ],
    [["Número de afiliado", paciente.nroAfiliado || ""]],
  ]
  for (const f of filas) {
    if (f.length === 1) campo(f[0][0], f[0][1], M, W)
    else {
      campo(f[0][0], f[0][1], M, mitad - 4)
      campo(f[1][0], f[1][1], M + mitad, W - mitad)
    }
    y += 8
  }

  const seccion = (texto: string) => {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.text(texto, M, y)
    y += 3
  }

  // --- Odontograma ---
  if (odontograma) {
    y += 2
    seccion("Odontograma")
    y += drawOdontograma(doc, M, y, W, dientes, { temporales: true })
    y += drawLeyendaOdontograma(doc, M, y, W) + 4
  }

  // --- Registro de prestaciones ---
  const PIE = 30 // espacio reservado para la firma del profesional
  const FILA = 8
  const cols: { titulo: string; ancho: number; valor: (p: PrestacionFicha) => string }[] = [
    { titulo: "Fecha", ancho: 26, valor: (p) => p.fecha },
    { titulo: "Código", ancho: 32, valor: (p) => p.codigo },
    { titulo: "Pieza", ancho: 18, valor: (p) => p.pieza },
    { titulo: "Caras", ancho: 24, valor: (p) => p.caras },
    { titulo: "Firma del paciente", ancho: W - 100, valor: () => "" },
  ]

  const encabezadoTabla = () => {
    doc.setFillColor(238, 242, 247)
    doc.rect(M, y, W, 7, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    let cx = M
    for (const c of cols) {
      doc.rect(cx, y, c.ancho, 7, "S")
      doc.text(c.titulo, cx + c.ancho / 2, y + 4.8, { align: "center" })
      cx += c.ancho
    }
    y += 7
  }
  const fila = (p: PrestacionFicha | null) => {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    let cx = M
    for (const c of cols) {
      doc.rect(cx, y, c.ancho, FILA, "S")
      if (p) {
        const v = doc.splitTextToSize(c.valor(p), c.ancho - 2)[0] ?? ""
        doc.text(v, cx + c.ancho / 2, y + 5.3, { align: "center" })
      }
      cx += c.ancho
    }
    y += FILA
  }

  y += 2
  seccion("Registro de prestaciones")
  y += 1
  doc.setLineWidth(0.2)
  doc.setDrawColor(120, 120, 120)
  encabezadoTabla()
  // Con cantidad elegida, los renglones en blanco son los que faltan para llegar a ella.
  const renglones: (PrestacionFicha | null)[] = [
    ...prestaciones,
    ...Array<null>(totalFilas === null ? 0 : Math.max(0, totalFilas - prestaciones.length)).fill(null),
  ]
  renglones.forEach((p, i) => {
    // Si no entra, sigue en otra hoja (la firma va al final de la última).
    const quedan = renglones.length - i - 1
    const limite = quedan === 0 ? altoPagina - PIE : altoPagina - 15
    if (y + FILA > limite) {
      doc.addPage()
      y = 20
      encabezadoTabla()
    }
    fila(p)
  })
  // Sin cantidad elegida: renglones en blanco hasta completar la hoja, para cargar a mano.
  if (totalFilas === null) while (y + FILA <= altoPagina - PIE) fila(null)
  doc.setDrawColor(0, 0, 0)

  // --- Pie: fecha de emisión + firma y sello ---
  const pieY = altoPagina - 14
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(`Emitida el ${new Date().toLocaleDateString("es-AR", { timeZone: AR_TZ })}`, M, pieY)
  doc.setTextColor(0, 0, 0)
  doc.setLineWidth(0.3)
  const fx = M + W - 70
  doc.line(fx, pieY - 5, M + W, pieY - 5)
  doc.setFontSize(10)
  doc.text("Firma y sello del profesional", fx + 35, pieY, { align: "center" })

  const nombre = (paciente.fullName || "paciente").replace(/[^\p{L}\p{N}]+/gu, "_")
  doc.save(`Ficha_${nombre}.pdf`)
}
