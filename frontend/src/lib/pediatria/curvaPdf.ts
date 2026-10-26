// Fase Z: PDF de crecimiento (curvas OMS con los puntos del paciente) y carnet de
// vacunas, para entregar a la familia. Dibujo vectorial con jsPDF.

import { jsPDF } from "jspdf"
import { drawLogo } from "@/lib/patientPdf"
import {
  INDICADORES,
  PERCENTILES,
  curvas,
  edadMaxima,
  formatoEdad,
  formatoPercentil,
  type Indicador,
  type SexoOms,
} from "./oms"
import { carnet, ESTADO_DOSIS_LABEL, edadRecomendada, fueraDeCarnet } from "./estado"
import { fechaCorta, nombreVacuna, type DatosPediatricos } from "./tipos"

export type PuntoPdf = { meses: number; valor: number; z: number }

const AZUL: [number, number, number] = [29, 92, 170]
const GRIS: [number, number, number] = [150, 158, 170]

function encabezado(doc: jsPDF, titulo: string, nombre: string, subtitulo: string) {
  drawLogo(doc, 10, 12, 9)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.setTextColor(96, 109, 125)
  doc.text(titulo, 200, 19, { align: "right" })
  doc.setDrawColor(...AZUL)
  doc.setLineWidth(0.5)
  doc.line(10, 27, 200, 27)
  doc.setTextColor(0, 0, 0)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text(nombre, 10, 35)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text(subtitulo, 10, 41)
}

/** Un gráfico de percentiles en el rectángulo (x, y, w, h). */
function grafico(
  doc: jsPDF,
  ind: Indicador,
  sexo: SexoOms,
  desde: number,
  hasta: number,
  puntos: PuntoPdf[],
  x: number,
  y: number,
  w: number,
  h: number
) {
  const datos = curvas(ind, sexo, desde, hasta)
  if (!datos.length) return
  const fin = datos[datos.length - 1].meses
  const visibles = puntos.filter((p) => p.meses >= desde && p.meses <= fin)
  const valores = [...datos.flatMap((d) => [d.p3, d.p97]), ...visibles.map((p) => p.valor)]
  let ymin = Math.min(...valores)
  let ymax = Math.max(...valores)
  const margen = (ymax - ymin) * 0.05
  ymin = Math.max(0, ymin - margen)
  ymax += margen
  const px = (m: number) => x + ((m - desde) / (fin - desde)) * w
  const py = (v: number) => y + h - ((v - ymin) / (ymax - ymin)) * h

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text(`${INDICADORES[ind].label} (${INDICADORES[ind].unidad})`, x, y - 3)

  // Grilla y ejes.
  doc.setLineWidth(0.1)
  doc.setDrawColor(225, 228, 232)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(...GRIS)
  const pasoY = niceStep((ymax - ymin) / 6)
  for (let v = Math.ceil(ymin / pasoY) * pasoY; v <= ymax; v += pasoY) {
    doc.line(x, py(v), x + w, py(v))
    doc.text(String(Math.round(v * 10) / 10), x - 1.5, py(v) + 1, { align: "right" })
  }
  const pasoX = fin - desde <= 24 ? 3 : 12
  for (let m = desde; m <= fin; m += pasoX) {
    doc.line(px(m), y, px(m), y + h)
    doc.text(m < 24 ? `${m}m` : `${m / 12}a`, px(m), y + h + 4, { align: "center" })
  }
  doc.setDrawColor(...GRIS)
  doc.rect(x, y, w, h)

  // Percentiles.
  for (const { p } of PERCENTILES) {
    const key = `p${p}`
    doc.setDrawColor(...(p === 50 ? AZUL : GRIS))
    doc.setLineWidth(p === 50 ? 0.5 : 0.25)
    for (let i = 1; i < datos.length; i++) {
      doc.line(px(datos[i - 1].meses), py(datos[i - 1][key]), px(datos[i].meses), py(datos[i][key]))
    }
    const ult = datos[datos.length - 1]
    doc.text(`P${p}`, x + w + 1, py(ult[key]) + 1)
  }

  // Paciente.
  doc.setDrawColor(200, 40, 60)
  doc.setFillColor(200, 40, 60)
  doc.setLineWidth(0.4)
  visibles.forEach((p, i) => {
    if (i > 0) doc.line(px(visibles[i - 1].meses), py(visibles[i - 1].valor), px(p.meses), py(p.valor))
    doc.circle(px(p.meses), py(p.valor), 0.9, "F")
  })
  doc.setTextColor(0, 0, 0)
}

function niceStep(raw: number) {
  const e = Math.pow(10, Math.floor(Math.log10(raw)))
  const f = raw / e
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e
}

export function descargarPdfPediatrico({
  nombre,
  nacimiento,
  sexo,
  edadMeses,
  edadCorregida,
  datos,
  puntos,
}: {
  nombre: string
  nacimiento: string
  sexo: SexoOms
  edadMeses: number
  edadCorregida: boolean
  datos: DatosPediatricos
  puntos: Record<Indicador, PuntoPdf[]>
}) {
  const doc = new jsPDF()
  const sub = `Nacimiento: ${fechaCorta(nacimiento)} · Edad: ${formatoEdad(edadMeses)}${edadCorregida ? " (corregida)" : ""} · ${sexo === 1 ? "Varón" : "Mujer"} · Referencia OMS`
  encabezado(doc, "Crecimiento y vacunas", nombre, sub)

  // Rango de edades: el que cubre las mediciones (y la edad actual).
  const maxMes = Math.max(edadMeses, ...Object.values(puntos).flat().map((p) => p.meses))
  const [desde, hasta] = maxMes <= 24 ? [0, 24] : maxMes <= 60 ? [0, 60] : [60, 228]

  const indicadores = (Object.keys(INDICADORES) as Indicador[]).filter(
    (i) => desde < edadMaxima(i) && (puntos[i].length > 0 || i !== "pc")
  )
  let y = 56
  for (const ind of indicadores) {
    if (y + 75 > 287) {
      doc.addPage()
      y = 20
    }
    grafico(doc, ind, sexo, desde, Math.min(hasta, edadMaxima(ind)), puntos[ind], 22, y, 168, 60)
    // Última medición del indicador.
    const ult = puntos[ind][puntos[ind].length - 1]
    if (ult) {
      doc.setFontSize(8)
      doc.text(
        `Último: ${String(ult.valor).replace(".", ",")} ${INDICADORES[ind].unidad} a los ${formatoEdad(ult.meses)} (${formatoPercentil(ult.z)})`,
        22,
        y + 70
      )
    }
    y += 80
  }

  // Carnet de vacunas.
  doc.addPage()
  encabezado(doc, "Carnet de vacunación", nombre, sub)
  y = 52
  doc.setFontSize(9)
  const filas = carnet(datos.catalogo, datos.vacunas, edadMeses).filter(
    (f) => f.estado !== "proxima" || f.dosis.edad <= edadMeses + 24
  )
  const linea = (cols: string[], bold = false) => {
    if (y > 280) {
      doc.addPage()
      y = 20
    }
    doc.setFont("helvetica", bold ? "bold" : "normal")
    const xs = [10, 92, 122, 147, 175]
    cols.forEach((c, i) => doc.text(doc.splitTextToSize(c, (xs[i + 1] ?? 200) - xs[i] - 2)[0], xs[i], y))
    y += 6
  }
  linea(["Vacuna", "Dosis", "Edad", "Fecha", "Estado"], true)
  for (const f of filas) {
    linea([
      f.vacuna.nombre,
      f.dosis.dosis,
      edadRecomendada(f.dosis.edad),
      f.aplicada ? fechaCorta(f.aplicada.fecha) : "",
      ESTADO_DOSIS_LABEL[f.estado],
    ])
  }
  const extra = fueraDeCarnet(datos.catalogo, datos.vacunas)
  if (extra.length) {
    y += 4
    linea(["Otras aplicaciones", "", "", "", ""], true)
    for (const a of extra) linea([nombreVacuna(a, datos.catalogo), a.dosis || "", "", fechaCorta(a.fecha), "Aplicada"])
  }

  doc.save(`crecimiento-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "paciente"}.pdf`)
}
