// Genera src/lib/pediatria/oms-lms.json (Fase Z: curvas de crecimiento) a partir de
// las tablas LMS oficiales de la OMS:
//   0–5 años  (Child Growth Standards 2006, por día):
//     github.com/WorldHealthOrganization/anthro  data-raw/growthstandards/
//     weianthro.txt  lenanthro.txt  hcanthro.txt  bmianthro.txt
//   5–19 años (Growth Reference 2007, por mes):
//     github.com/WorldHealthOrganization/anthroplus  data-raw/growthstandards/
//     wfawho2007.txt  hfawho2007.txt  bfawho2007.txt
//
// Uso: node scripts/generar-oms.mjs <carpeta con los .txt>
//
// Salida: { indicador: { "1"|"2": [[edadMeses, L, M, S], ...] } } (sexo 1 = varón,
// 2 = mujer, como en la OMS). Las tablas diarias se muestrean una vez por mes
// (día = round(mes × 30.4375), la conversión que usa la OMS); entre meses se
// interpola en lib/pediatria/oms.ts.

import { readFileSync, writeFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const dir = process.argv[2]
if (!dir) {
  console.error("Uso: node scripts/generar-oms.mjs <carpeta con los .txt de la OMS>")
  process.exit(1)
}

const DIAS_POR_MES = 30.4375

function leer(archivo) {
  const filas = readFileSync(join(dir, archivo), "utf8").trim().split(/\r?\n/).slice(1)
  return filas.map((f) => {
    const [sexo, edad, l, m, s] = f.split("\t")
    return { sexo, edad: Number(edad), l: Number(l), m: Number(m), s: Number(s) }
  })
}

// Tabla diaria (0–1856 días) → un punto por mes, 0–60.
function mensualDesdeDiaria(archivo) {
  const porSexo = { 1: new Map(), 2: new Map() }
  for (const r of leer(archivo)) porSexo[r.sexo].set(r.edad, r)
  const out = {}
  for (const sexo of ["1", "2"]) {
    out[sexo] = []
    for (let mes = 0; mes <= 60; mes++) {
      const r = porSexo[sexo].get(Math.round(mes * DIAS_POR_MES))
      out[sexo].push([mes, r.l, r.m, r.s])
    }
  }
  return out
}

// Tabla mensual 2007 (desde 61 meses: hasta 60 vale la de 2006).
function mensual2007(archivo) {
  const out = { 1: [], 2: [] }
  for (const r of leer(archivo)) if (r.edad > 60) out[r.sexo].push([r.edad, r.l, r.m, r.s])
  return out
}

function unir(a, b) {
  return b ? { 1: [...a[1], ...b[1]], 2: [...a[2], ...b[2]] } : a
}

const datos = {
  peso: unir(mensualDesdeDiaria("weianthro.txt"), mensual2007("wfawho2007.txt")),
  talla: unir(mensualDesdeDiaria("lenanthro.txt"), mensual2007("hfawho2007.txt")),
  pc: mensualDesdeDiaria("hcanthro.txt"),
  imc: unir(mensualDesdeDiaria("bmianthro.txt"), mensual2007("bfawho2007.txt")),
}

const destino = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "pediatria", "oms-lms.json")
writeFileSync(destino, JSON.stringify(datos))
console.log("OK →", destino)
