import { jsPDF } from "jspdf"
import { describeDiente, type Diente } from "@/lib/odontograma"
import {
  drawLeyendaOdontograma,
  drawOdontograma,
  medirOdontograma,
  tieneTemporales,
} from "@/lib/odontogramaPdf"
import { LOGO_PDF } from "@/lib/brandMark"
import type { CodificacionRegistro } from "@/lib/catalogos"

export type HistoryEntry = {
  /** Fase O: clínica del registro (en la historia del paciente, que junta todas). */
  clinica?: string
  profesional: string
  area: string
  fecha: string
  /** Fecha cruda (ISO) y profesional del registro: filtran la ficha para la obra social. */
  fechaIso?: string
  idProfesional?: number | null
  sintomas: string
  diagnostico: string
  tratamiento: string
  dientes?: Diente[]
  /** Fase K: estado de auditoría del registro (solo en la ficha del profesional). */
  auditoria?: string
  /** Vino de otro sistema (import de HC): fecha y profesional son los del archivo. */
  importado?: boolean
} & CodificacionRegistro

export type Paciente = {
  fullName: string
  /** Fase Z: id de la ficha (panel pediátrico; solo en el registro clínico). */
  pacienteId?: number
  /** Fase Y: separados y la fecha ISO, para editar los datos (solo en el registro clínico). */
  nombre?: string
  apellido?: string
  fechaNacimientoIso?: string
  telefono: string
  email: string
  dni: string
  direccion: string
  fechaNacimiento: string
  edad: string | number
  obraSocial: string
  /** Fase K: cobertura estructurada. */
  idObraSocial?: number | null
  nroAfiliado?: string
  plan?: string
  /** Si ya tiene cuenta para entrar a Medilu (si no, se le puede enviar el acceso). */
  tieneCuenta?: boolean
  sexo: string
  fechaApertura: string
  /** Fase O: clínicas donde el paciente tiene ficha (solo en "Mi historia"). */
  clinicas?: string[]
  history: HistoryEntry[]
}

/** Dibuja el logo horizontal (vectorial) con su esquina superior izquierda en (x, y), en mm. */
export function drawLogo(doc: jsPDF, x: number, y: number, height: number) {
  const k = height / LOGO_PDF.height
  for (const { rgb, d } of LOGO_PDF.parts) {
    const ops: { op: string; c: number[] }[] = []
    const tokens = d.match(/[MLCZ]|-?\d*\.?\d+/g) ?? []
    let cmd = ""
    let nums: number[] = []
    const flush = () => {
      if (!cmd) return
      const pts = nums.map((n, i) => (i % 2 === 0 ? x + n * k : y + n * k))
      ops.push({ op: cmd === "Z" ? "h" : cmd.toLowerCase(), c: pts })
    }
    for (const t of tokens) {
      if (/[MLCZ]/.test(t)) {
        flush()
        cmd = t
        nums = []
      } else nums.push(Number(t))
    }
    flush()
    doc.setFillColor(...rgb)
    doc.path(ops)
    doc.fill()
  }
}

/** Genera y descarga el PDF del historial clínico de un paciente. */
export function downloadPatientHistoryPdf(p: Paciente) {
  const doc = new jsPDF()
  drawLogo(doc, 10, 15, 10)
  doc.setFontSize(12)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(96, 109, 125)
  doc.text("Historial clínico del paciente", 200, 23, { align: "right" })
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(29, 92, 170)
  doc.setLineWidth(0.5)
  doc.line(10, 35, 200, 35)
  doc.setDrawColor(0, 0, 0)

  const left: [string, string][] = [
    ["Nombre", p.fullName ?? "N/A"],
    ["Teléfono", String(p.telefono ?? "N/A")],
    ["DNI", String(p.dni ?? "N/A")],
    ["Email", p.email ?? "N/A"],
    ["Sexo", p.sexo ?? "N/A"],
  ]
  const right: [string, string][] = [
    ["Fecha de nacimiento", p.fechaNacimiento ?? "N/A"],
    ["Edad", String(p.edad ?? "N/A")],
    ["Dirección", p.direccion ?? "N/A"],
    ["Obra social", p.obraSocial ?? "N/A"],
    ...(p.nroAfiliado ? ([["N.º afiliado", p.nroAfiliado]] as [string, string][]) : []),
    ...(p.plan ? ([["Plan", p.plan]] as [string, string][]) : []),
    ["Fecha de apertura", p.fechaApertura ?? "N/A"],
  ]
  let yL = 45
  let yR = 45
  doc.setFontSize(12)
  left.forEach(([l, v]) => {
    doc.setFont("helvetica", "bold")
    doc.text(`${l}:`, 10, yL)
    doc.setFont("helvetica", "normal")
    doc.text(String(v), 40, yL)
    yL += 10
  })
  right.forEach(([l, v]) => {
    doc.setFont("helvetica", "bold")
    doc.text(`${l}:`, 110, yR)
    doc.setFont("helvetica", "normal")
    // Valores largos (dirección) en varios renglones, sin salirse de la hoja.
    const renglones: string[] = doc.splitTextToSize(String(v), 35)
    doc.text(renglones, 165, yR)
    yR += 10 + (renglones.length - 1) * 5
  })

  const lineY = Math.max(yL, yR) + 5
  doc.line(10, lineY, 200, lineY)
  let y = lineY + 10
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text("Historial médico", 10, y)
  y += 10

  const maxHeight = doc.internal.pageSize.height - 10
  const line = (text: string, bold = false) => {
    if (y > maxHeight) {
      doc.addPage()
      y = 20
    }
    doc.setFont("helvetica", bold ? "bold" : "normal")
    doc.setFontSize(12)
    doc.text(text, 10, y)
    y += 7
  }

  ;(p.history || []).forEach((entry) => {
    if (entry.clinica) line(`Clínica: ${entry.clinica}`)
    line(`Profesional: ${entry.profesional}`)
    if (entry.importado) line("Registro importado de otro sistema")
    line(`Área: ${entry.area}`)
    line(`Fecha: ${entry.fecha}hs`)
    line("")
    doc.splitTextToSize(`Síntomas: ${entry.sintomas}`, 180).forEach((l: string) => line(l))
    line("")
    doc.splitTextToSize(`Diagnóstico: ${entry.diagnostico}`, 180).forEach((l: string) => line(l))
    if (entry.diagnosticos && entry.diagnosticos.length) {
      const dx = entry.diagnosticos.map((d) => `${d.codigo} ${d.descripcion}${d.principal ? " (principal)" : ""}`)
      doc.splitTextToSize(`CIE-10: ${dx.join("; ")}`, 180).forEach((l: string) => line(l))
    }
    line("")
    doc.splitTextToSize(`Tratamiento: ${entry.tratamiento}`, 180).forEach((l: string) => line(l))
    if (entry.practicas && entry.practicas.length) {
      const px = entry.practicas.map(
        (x) =>
          `${x.codigo} ${x.descripcion}${x.pieza ? ` (pieza ${x.pieza})` : ""}${x.cantidad > 1 ? ` x${x.cantidad}` : ""}${x.autorizacion ? ` [aut. ${x.autorizacion}]` : ""}`
      )
      doc.splitTextToSize(`Prácticas: ${px.join("; ")}`, 180).forEach((l: string) => line(l))
    }
    if (entry.dientes && entry.dientes.length) {
      // Odontograma dibujado (mismos colores y símbolos que en la web).
      const temporales = tieneTemporales(entry.dientes)
      const alto = medirOdontograma(190, temporales) + 6
      line("")
      if (y + alto > maxHeight) {
        doc.addPage()
        y = 20
      }
      line("Odontograma:", true)
      y += drawOdontograma(doc, 10, y - 3, 190, entry.dientes, { temporales })
      y += drawLeyendaOdontograma(doc, 10, y - 2, 190) + 3
      // Las notas no se ven en el dibujo: van como texto, por diente.
      entry.dientes
        .filter((d) => d.notas)
        .sort((a, b) => Number(a.numero.replace("tooth-", "")) - Number(b.numero.replace("tooth-", "")))
        .forEach((d) => {
          doc
            .splitTextToSize(`  Diente ${d.numero.replace("tooth-", "")}: ${describeDiente(d)}`, 180)
            .forEach((l: string) => line(l))
        })
    }
    if (y > maxHeight) {
      doc.addPage()
      y = 20
    }
    doc.line(10, y, 200, y)
    y += 10
  })

  if (y > maxHeight) {
    doc.addPage()
    y = 20
  }
  doc.setFont("helvetica", "bold")
  doc.text("Fin del historial clínico", 10, y + 5)
  doc.save(`Historial_${p.fullName}.pdf`)
}
