// Fase Z: calculadora de dosis pediátricas por peso. ORIENTATIVA: los valores son
// los habituales de las guías pediátricas; el profesional los verifica antes de
// indicar (función renal/hepática, alergias, indicación, presentación disponible).

export type Farmaco = {
  codigo: string
  nombre: string
  /** mg/kg por TOMA (min–max). */
  mgKgDosis?: [number, number]
  /** mg/kg por DÍA (min–max), repartidos en `tomasDia`. */
  mgKgDia?: [number, number]
  tomasDia: number
  intervalo: string
  /** Máximo por toma y por día (mg). */
  maxDosisMg?: number
  maxDiaMg?: number
  /** Presentaciones líquidas: mg por ml. */
  presentaciones: { nombre: string; mgPorMl: number }[]
  nota?: string
}

export const FARMACOS: Farmaco[] = [
  {
    codigo: "paracetamol",
    nombre: "Paracetamol",
    mgKgDosis: [10, 15],
    tomasDia: 4,
    intervalo: "cada 6 h",
    maxDosisMg: 1000,
    maxDiaMg: 4000,
    presentaciones: [
      { nombre: "Gotas 100 mg/ml", mgPorMl: 100 },
      { nombre: "Jarabe 160 mg/5 ml", mgPorMl: 32 },
      { nombre: "Jarabe 120 mg/5 ml", mgPorMl: 24 },
    ],
    nota: "Máximo 60 mg/kg/día (75 en mayores).",
  },
  {
    codigo: "ibuprofeno",
    nombre: "Ibuprofeno",
    mgKgDosis: [5, 10],
    tomasDia: 3,
    intervalo: "cada 6 a 8 h",
    maxDosisMg: 400,
    maxDiaMg: 1200,
    presentaciones: [
      { nombre: "Suspensión 2% (100 mg/5 ml)", mgPorMl: 20 },
      { nombre: "Suspensión 4% (200 mg/5 ml)", mgPorMl: 40 },
    ],
    nota: "Desde los 6 meses. Máximo 40 mg/kg/día.",
  },
  {
    codigo: "amoxicilina",
    nombre: "Amoxicilina",
    mgKgDia: [50, 50],
    tomasDia: 3,
    intervalo: "cada 8 h",
    maxDiaMg: 3000,
    presentaciones: [
      { nombre: "Suspensión 250 mg/5 ml", mgPorMl: 50 },
      { nombre: "Suspensión 500 mg/5 ml", mgPorMl: 100 },
      { nombre: "Suspensión 750 mg/5 ml", mgPorMl: 150 },
    ],
  },
  {
    codigo: "amoxicilina_alta",
    nombre: "Amoxicilina (dosis alta: OMA, neumonía)",
    mgKgDia: [80, 90],
    tomasDia: 2,
    intervalo: "cada 12 h",
    maxDiaMg: 4000,
    presentaciones: [
      { nombre: "Suspensión 500 mg/5 ml", mgPorMl: 100 },
      { nombre: "Suspensión 750 mg/5 ml", mgPorMl: 150 },
    ],
  },
  {
    codigo: "amoxi_clav",
    nombre: "Amoxicilina-clavulánico (por amoxicilina)",
    mgKgDia: [40, 90],
    tomasDia: 2,
    intervalo: "cada 12 h",
    maxDiaMg: 4000,
    presentaciones: [
      { nombre: "Suspensión 400/57 mg/5 ml", mgPorMl: 80 },
      { nombre: "Suspensión 600/42,9 mg/5 ml (ES)", mgPorMl: 120 },
    ],
    nota: "Por encima de 45 mg/kg/día usar la formulación ES (menos clavulánico).",
  },
  {
    codigo: "cefalexina",
    nombre: "Cefalexina",
    mgKgDia: [50, 100],
    tomasDia: 4,
    intervalo: "cada 6 h",
    maxDiaMg: 4000,
    presentaciones: [
      { nombre: "Suspensión 250 mg/5 ml", mgPorMl: 50 },
      { nombre: "Suspensión 500 mg/5 ml", mgPorMl: 100 },
    ],
  },
  {
    codigo: "azitromicina",
    nombre: "Azitromicina",
    mgKgDia: [10, 10],
    tomasDia: 1,
    intervalo: "cada 24 h, 3 días",
    maxDiaMg: 500,
    presentaciones: [{ nombre: "Suspensión 200 mg/5 ml", mgPorMl: 40 }],
  },
  {
    codigo: "claritromicina",
    nombre: "Claritromicina",
    mgKgDia: [15, 15],
    tomasDia: 2,
    intervalo: "cada 12 h",
    maxDiaMg: 1000,
    presentaciones: [
      { nombre: "Suspensión 125 mg/5 ml", mgPorMl: 25 },
      { nombre: "Suspensión 250 mg/5 ml", mgPorMl: 50 },
    ],
  },
  {
    codigo: "tmp_smx",
    nombre: "Trimetoprima-sulfametoxazol (por TMP)",
    mgKgDia: [8, 10],
    tomasDia: 2,
    intervalo: "cada 12 h",
    maxDiaMg: 320,
    presentaciones: [{ nombre: "Suspensión 40/200 mg/5 ml", mgPorMl: 8 }],
    nota: "No en menores de 2 meses.",
  },
  {
    codigo: "corticoide_oral",
    nombre: "Prednisolona / meprednisona",
    mgKgDia: [1, 2],
    tomasDia: 1,
    intervalo: "cada 24 h",
    maxDiaMg: 60,
    presentaciones: [{ nombre: "Solución 15 mg/5 ml", mgPorMl: 3 }],
  },
  {
    codigo: "dexametasona",
    nombre: "Dexametasona (laringitis)",
    mgKgDosis: [0.15, 0.6],
    tomasDia: 1,
    intervalo: "dosis única",
    maxDosisMg: 16,
    // Sin presentación oral pediátrica única: se carga la concentración a mano.
    presentaciones: [],
  },
  {
    codigo: "ondansetron",
    nombre: "Ondansetrón",
    mgKgDosis: [0.15, 0.15],
    tomasDia: 1,
    intervalo: "dosis única (puede repetirse c/8 h)",
    maxDosisMg: 8,
    presentaciones: [{ nombre: "Solución 4 mg/5 ml", mgPorMl: 0.8 }],
    nota: "Desde los 6 meses.",
  },
  {
    codigo: "hierro_profilaxis",
    nombre: "Hierro (profilaxis, Fe elemental)",
    mgKgDia: [1, 1],
    tomasDia: 1,
    intervalo: "cada 24 h",
    maxDiaMg: 15,
    presentaciones: [{ nombre: "Gotas sulfato ferroso 25 mg Fe/ml", mgPorMl: 25 }],
    nota: "De los 4 a los 18 meses (desde los 2 meses en prematuros).",
  },
  {
    codigo: "hierro_tratamiento",
    nombre: "Hierro (tratamiento, Fe elemental)",
    mgKgDia: [3, 6],
    tomasDia: 1,
    intervalo: "cada 24 h (o en 2 tomas)",
    maxDiaMg: 200,
    presentaciones: [{ nombre: "Gotas sulfato ferroso 25 mg Fe/ml", mgPorMl: 25 }],
  },
]

export type ResultadoDosis = {
  /** mg por toma (min–max), ya topeado. */
  mgToma: [number, number]
  mgDia: [number, number]
  topeado: boolean
}

export function calcularDosis(f: Farmaco, pesoKg: number): ResultadoDosis | null {
  if (!(pesoKg > 0)) return null
  let toma: [number, number]
  if (f.mgKgDosis) toma = [f.mgKgDosis[0] * pesoKg, f.mgKgDosis[1] * pesoKg]
  else if (f.mgKgDia) toma = [(f.mgKgDia[0] * pesoKg) / f.tomasDia, (f.mgKgDia[1] * pesoKg) / f.tomasDia]
  else return null

  let topeado = false
  const topeToma = Math.min(f.maxDosisMg ?? Infinity, (f.maxDiaMg ?? Infinity) / f.tomasDia)
  if (toma[1] > topeToma) {
    topeado = true
    toma = [Math.min(toma[0], topeToma), topeToma]
  }
  return { mgToma: toma, mgDia: [toma[0] * f.tomasDia, toma[1] * f.tomasDia], topeado }
}

export function redondear(n: number) {
  if (n >= 100) return Math.round(n).toString()
  if (n >= 10) return (Math.round(n * 2) / 2).toString().replace(".", ",")
  return (Math.round(n * 10) / 10).toString().replace(".", ",")
}

export function rango([a, b]: [number, number], unidad: string) {
  return Math.abs(a - b) < 0.05 ? `${redondear(a)} ${unidad}` : `${redondear(a)}–${redondear(b)} ${unidad}`
}
