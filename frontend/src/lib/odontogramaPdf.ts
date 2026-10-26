// Odontograma vectorial para los PDF (historia clínica y ficha para la obra social).
// Replica el dibujo del componente Odontogram: mismas caras, colores por estado y
// símbolos de diente completo. Todas las medidas en mm.
import type { jsPDF } from "jspdf"
import {
  CONDICIONES,
  ESTADO_COLOR,
  PERMANENTES,
  TEMPORALES,
  carasDelDiente,
  esTemporal,
  type Diente,
} from "@/lib/odontograma"

type RGB = [number, number, number]

function hexRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const REALIZADO = hexRgb(ESTADO_COLOR.realizado)
const PENDIENTE = hexRgb(ESTADO_COLOR.pendiente)
const BLANCO: RGB = [255, 255, 255]
const GRIS_AUSENTE: RGB = [226, 232, 240]
const TRAZO: RGB = [100, 116, 139]
const TEXTO: RGB = [51, 65, 85]

const colorDe = (estado?: string): RGB => (estado === "pendiente" ? PENDIENTE : REALIZADO)

// Condiciones de diente completo que se dibujan como símbolo (el resto va como código).
const CON_SIMBOLO = new Set(["ausente", "extraccion", "corona", "endodoncia"])

const NUM_H = 3.4 // franja del número del diente
const CODE_H = 3 // franja de los códigos (Im, PF…)
const GAP_FILA = 2.5 // entre la fila permanente y la temporal de una misma arcada
const GAP_ARCADA = 4 // entre la arcada superior y la inferior
const LADOS_H = 4.5 // "Derecha / Izquierda del paciente"

function geometria(ancho: number) {
  const stride = ancho / PERMANENTES.superior.length
  const S = Math.min(stride * 0.74, 10)
  return { stride, S, fila: NUM_H + S + CODE_H }
}

/** Alto (mm) que ocupa el odontograma con ese ancho. */
export function medirOdontograma(ancho: number, temporales: boolean) {
  const { fila } = geometria(ancho)
  return LADOS_H + (temporales ? fila * 4 + GAP_FILA * 2 : fila * 2) + GAP_ARCADA
}

/** ¿Hay que mostrar la dentición temporal? (igual que la web en solo lectura). */
export function tieneTemporales(dientes: Diente[]) {
  return dientes.some((d) => esTemporal(d.numero))
}

function poligono(doc: jsPDF, pts: number[][], fill: RGB) {
  doc.setFillColor(...fill)
  doc.path([
    { op: "m", c: pts[0] },
    ...pts.slice(1).map((p) => ({ op: "l", c: p })),
    { op: "h", c: [] },
  ])
  doc.fillStroke()
}

function dibujarDiente(
  doc: jsPDF,
  numero: string,
  x: number,
  boxY: number,
  S: number,
  hallazgos: Diente[],
  arriba: boolean
) {
  const meta = carasDelDiente(numero)
  const IN = S / 3
  const l = x
  const r = x + S
  const t = boxY
  const b = boxY + S
  const ci1 = x + IN
  const ci2 = x + S - IN
  const cj1 = boxY + IN
  const cj2 = boxY + S - IN
  const cx = x + S / 2
  const cy = boxY + S / 2

  const ausente = hallazgos.find((f) => f.condicion === "ausente")
  const extrac = hallazgos.find((f) => f.condicion === "extraccion")
  const corona = hallazgos.find((f) => f.condicion === "corona")
  const endo = hallazgos.find((f) => f.condicion === "endodoncia")
  const codigos = hallazgos.filter((f) => f.cara == null && !CON_SIMBOLO.has(f.condicion))

  const fillCara = (cara: string): RGB => {
    if (ausente) return GRIS_AUSENTE
    const f = hallazgos.find((d) => d.cara === cara)
    return f ? colorDe(f.estado) : BLANCO
  }

  // Número
  doc.setFont("helvetica", hallazgos.length ? "bold" : "normal")
  doc.setFontSize(7)
  doc.setTextColor(...TEXTO)
  const numY = arriba ? boxY - 1.1 : b + 2.9
  doc.text(numero, cx, numY, { align: "center" })

  // Caras
  doc.setDrawColor(...TRAZO)
  doc.setLineWidth(0.15)
  poligono(doc, [[l, t], [r, t], [ci2, cj1], [ci1, cj1]], fillCara(meta.arriba))
  poligono(doc, [[l, b], [r, b], [ci2, cj2], [ci1, cj2]], fillCara(meta.abajo))
  poligono(doc, [[l, t], [l, b], [ci1, cj2], [ci1, cj1]], fillCara(meta.izquierda))
  poligono(doc, [[r, t], [r, b], [ci2, cj2], [ci2, cj1]], fillCara(meta.derecha))
  doc.setFillColor(...fillCara(meta.centro))
  doc.rect(ci1, cj1, ci2 - ci1, cj2 - cj1, "FD")

  // Símbolos de diente completo
  if (corona) {
    doc.setDrawColor(...colorDe(corona.estado))
    doc.setLineWidth(0.4)
    doc.circle(cx, cy, S / 2 + 0.6, "S")
  }
  if (endo) {
    // Línea vertical que atraviesa todo el diente
    doc.setDrawColor(...colorDe(endo.estado))
    doc.setLineWidth(0.5)
    doc.line(cx, t - 0.4, cx, b + 0.4)
  }
  const cruz = extrac || ausente
  if (cruz) {
    const m = S * 0.1
    doc.setDrawColor(...colorDe(cruz.estado))
    doc.setLineWidth(0.4)
    doc.line(l + m, t + m, r - m, b - m)
    doc.line(r - m, t + m, l + m, b - m)
  }

  // Códigos (implante, prótesis, movilidad), coloreados por estado
  if (codigos.length) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(5.5)
    const partes = codigos.map((f, k) => ({
      txt: (k ? " " : "") + (CONDICIONES[f.condicion]?.corto ?? f.condicion),
      color: colorDe(f.estado),
    }))
    const total = partes.reduce((s, p) => s + doc.getTextWidth(p.txt), 0)
    let px = cx - total / 2
    const codeY = arriba ? b + 2.4 : t - 0.8
    for (const p of partes) {
      doc.setTextColor(...p.color)
      doc.text(p.txt, px, codeY)
      px += doc.getTextWidth(p.txt)
    }
  }
}

/**
 * Dibuja el odontograma con su esquina superior izquierda en (x, y) y devuelve el
 * alto usado. `temporales` agrega las dos filas de la dentición temporal (centradas,
 * como en las fichas impresas).
 */
export function drawOdontograma(
  doc: jsPDF,
  x: number,
  y: number,
  ancho: number,
  dientes: Diente[],
  { temporales = false }: { temporales?: boolean } = {}
) {
  const { stride, S, fila } = geometria(ancho)
  const margen = (stride - S) / 2
  const grosorPrevio = doc.getLineWidth()
  const porDiente = new Map<string, Diente[]>()
  for (const d of dientes) {
    const n = d.numero.replace("tooth-", "")
    if (!porDiente.has(n)) porDiente.set(n, [])
    porDiente.get(n)!.push(d)
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(...TEXTO)
  doc.text("Derecha del paciente", x, y + 2.8)
  doc.text("Izquierda del paciente", x + ancho, y + 2.8, { align: "right" })

  const filas: { numeros: string[]; arriba: boolean; offset: number }[] = [
    { numeros: PERMANENTES.superior, arriba: true, offset: 0 },
    ...(temporales
      ? [
          { numeros: TEMPORALES.superior, arriba: true, offset: 3 },
          { numeros: TEMPORALES.inferior, arriba: false, offset: 3 },
        ]
      : []),
    { numeros: PERMANENTES.inferior, arriba: false, offset: 0 },
  ]

  let fy = y + LADOS_H
  const top = fy
  filas.forEach((f, i) => {
    // arriba: número / caja / códigos — abajo: códigos / caja / número
    const boxY = f.arriba ? fy + NUM_H : fy + CODE_H
    f.numeros.forEach((n, k) => {
      const tx = x + (f.offset + k) * stride + margen
      dibujarDiente(doc, n, tx, boxY, S, porDiente.get(n) || [], f.arriba)
    })
    fy += fila
    const siguiente = filas[i + 1]
    if (siguiente) fy += f.arriba && !siguiente.arriba ? GAP_ARCADA : GAP_FILA
  })

  // Línea media
  doc.setDrawColor(...TRAZO)
  doc.setLineWidth(0.2)
  doc.setLineDashPattern([1, 1], 0)
  doc.line(x + ancho / 2, top, x + ancho / 2, fy)
  doc.setLineDashPattern([], 0)

  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(grosorPrevio)
  return fy - y
}

/** Referencias de colores y símbolos, centradas en `ancho`. Devuelve el alto usado. */
export function drawLeyendaOdontograma(doc: jsPDF, x: number, y: number, ancho: number) {
  const L = 2.4 // lado del ícono
  const SEP = 1.2 // ícono → texto
  const ENTRE = 4 // entre ítems
  type Item = { texto: string; icono?: (ix: number, iy: number) => void; codigo?: string }
  const items: Item[] = [
    {
      texto: "Realizado",
      icono: (ix, iy) => {
        doc.setFillColor(...REALIZADO)
        doc.rect(ix, iy, L, L, "F")
      },
    },
    {
      texto: "A tratar",
      icono: (ix, iy) => {
        doc.setFillColor(...PENDIENTE)
        doc.rect(ix, iy, L, L, "F")
      },
    },
    {
      texto: "Corona",
      icono: (ix, iy) => {
        doc.setDrawColor(...TEXTO)
        doc.circle(ix + L / 2, iy + L / 2, L / 2, "S")
      },
    },
    {
      texto: "Endodoncia",
      icono: (ix, iy) => {
        doc.setDrawColor(...TEXTO)
        doc.line(ix + L / 2, iy, ix + L / 2, iy + L)
      },
    },
    {
      texto: "Ausente / extracción",
      icono: (ix, iy) => {
        doc.setDrawColor(...TEXTO)
        doc.line(ix, iy, ix + L, iy + L)
        doc.line(ix + L, iy, ix, iy + L)
      },
    },
    { codigo: "Im", texto: "Implante" },
    { codigo: "PF/PR", texto: "Prótesis fija / removible" },
    { codigo: "Mov", texto: "Movilidad" },
  ]

  const grosorPrevio = doc.getLineWidth()
  doc.setFontSize(6.5)
  doc.setLineWidth(0.3)
  const anchoItem = (it: Item) => {
    doc.setFont("helvetica", "bold")
    const cod = it.codigo ? doc.getTextWidth(it.codigo) + SEP : 0
    doc.setFont("helvetica", "normal")
    return (it.icono ? L + SEP : 0) + cod + doc.getTextWidth(it.texto)
  }
  const total = items.reduce((s, it) => s + anchoItem(it), 0) + ENTRE * (items.length - 1)
  let ix = x + Math.max(0, (ancho - total) / 2)
  const base = y + 4
  doc.setTextColor(...TEXTO)
  for (const it of items) {
    if (it.icono) {
      it.icono(ix, base - L + 0.3)
      ix += L + SEP
    }
    if (it.codigo) {
      doc.setFont("helvetica", "bold")
      doc.text(it.codigo, ix, base)
      ix += doc.getTextWidth(it.codigo) + SEP
    }
    doc.setFont("helvetica", "normal")
    doc.text(it.texto, ix, base)
    ix += doc.getTextWidth(it.texto) + ENTRE
  }
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(grosorPrevio)
  return 5.5
}
