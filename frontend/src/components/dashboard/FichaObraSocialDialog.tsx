import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Field } from "@/components/form/Field"
import { api } from "@/lib/api"
import { hoyAR, inicioMes, ymdAR } from "@/lib/fecha"
import type { Diente } from "@/lib/odontograma"
import type { HistoryEntry, Paciente } from "@/lib/patientPdf"
import {
  REFERENCIA_CARAS,
  abreviarCaras,
  downloadFichaObraSocial,
  type Emisor,
} from "@/lib/fichaObraSocialPdf"

type Fila = {
  key: string
  ymd: string
  fecha: string
  codigo: string
  descripcion: string
  pieza: string
  caras: string
}

/** Día (YYYY-MM-DD) del registro: la fecha cruda o, si falta, la formateada "dd/mm/aaaa, hh:mm". */
function diaDelRegistro(e: HistoryEntry) {
  if (e.fechaIso) return ymdAR(e.fechaIso)
  const m = e.fecha.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""
}

// Cantidad de renglones elegida: se recuerda en este navegador (cada profesional suele
// usar siempre la misma). Vacío = completar la hoja.
const FILAS_KEY = "medilu.fichaObraSocial.filas"
const MAX_FILAS = 100

function filasGuardadas() {
  try {
    return localStorage.getItem(FILAS_KEY) ?? ""
  } catch {
    return ""
  }
}

function guardarFilas(v: string) {
  try {
    if (v) localStorage.setItem(FILAS_KEY, v)
    else localStorage.removeItem(FILAS_KEY)
  } catch {
    // Sin storage (modo privado): solo no se recuerda.
  }
}

const ddmmaaaa = (ymd: string) => ymd.split("-").reverse().join("/")
const soloDigitos = (s: string) => s.replace(/\D/g, "")

/**
 * Caras trabajadas en la pieza durante esa consulta: las que cambiaron respecto del
 * odontograma anterior (cada consulta guarda el estado completo). Sin odontograma
 * previo, todas las caras con hallazgos en la pieza.
 */
function carasTrabajadas(actual: Diente[], previo: Diente[] | null, pieza: string) {
  const n = soloDigitos(pieza)
  if (!n) return ""
  const clave = (d: Diente) => `${d.condicion}|${d.estado ?? ""}`
  const antes = new Map(
    (previo ?? [])
      .filter((d) => soloDigitos(d.numero) === n && d.cara)
      .map((d) => [d.cara as string, clave(d)])
  )
  const caras = actual
    .filter((d) => soloDigitos(d.numero) === n && d.cara)
    .filter((d) => !previo || antes.get(d.cara as string) !== clave(d))
    .map((d) => d.cara as string)
  return abreviarCaras(caras)
}

export function FichaObraSocialDialog({
  open,
  onOpenChange,
  paciente,
  idProfesional,
  odontologica,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  paciente: Paciente
  /** Profesional de la sesión: por defecto la ficha lleva solo sus prestaciones. */
  idProfesional?: number | null
  /** Ficha odontológica (con odontograma). */
  odontologica: boolean
}) {
  const [emisor, setEmisor] = useState<Emisor | null>(null)
  const [desde, setDesde] = useState(() => inicioMes(hoyAR()))
  const [hasta, setHasta] = useState(() => hoyAR())
  const [soloMias, setSoloMias] = useState(true)
  const [tituloEditado, setTitulo] = useState<string | null>(null)
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set())
  const [carasEditadas, setCarasEditadas] = useState<Record<string, string>>({})
  const [filasTexto, setFilasTexto] = useState(filasGuardadas)

  useEffect(() => {
    if (!open || emisor) return
    api
      .get<Emisor>("/pacient/emisor")
      .then(setEmisor)
      .catch(() => {
        // Sin encabezado igual sirve: la firma y el sello van a mano.
        toast.error("No se pudieron cargar tus datos profesionales para el encabezado.")
        setEmisor({ clinica: "", profesional: "", especialidad: "", matricula: "" })
      })
  }, [open, emisor])

  const titulo =
    tituloEditado ??
    `${odontologica ? "Ficha odontológica" : "Ficha de prestaciones"}${
      paciente.obraSocial ? ` ${paciente.obraSocial}` : ""
    }`

  const historia = (paciente.history || []).map((e) => ({ e, ymd: diaDelRegistro(e) }))

  const filas: Fila[] = []
  let previo: Diente[] | null = null
  historia.forEach(({ e, ymd }, i) => {
    const dientes = e.dientes?.length ? e.dientes : null
    const enRango = ymd >= desde && ymd <= hasta
    const propia = !soloMias || !idProfesional || e.idProfesional === idProfesional
    if (enRango && propia) {
      ;(e.practicas || []).forEach((p, k) => {
        filas.push({
          key: `${i}-${k}`,
          ymd,
          fecha: ddmmaaaa(ymd),
          codigo: p.cantidad > 1 ? `${p.codigo} x${p.cantidad}` : p.codigo,
          descripcion: p.descripcion,
          pieza: p.pieza || "",
          caras: dientes ? carasTrabajadas(dientes, previo, p.pieza || "") : "",
        })
      })
    }
    if (dientes) previo = dientes
  })

  // Odontograma informado: el último registrado hasta el fin del período.
  const ultimo = historia.findLast(({ e, ymd }) => ymd <= hasta && e.dientes?.length)
  const ultimoOdontograma = ultimo
    ? { dientes: ultimo.e.dientes ?? [], fecha: ddmmaaaa(ultimo.ymd) }
    : null

  const incluidas = filas.filter((f) => !excluidas.has(f.key))

  // Renglones del PDF: nunca menos que las prestaciones incluidas (null = toda la hoja).
  const filasPedidas = Number.parseInt(filasTexto, 10)
  const totalFilas =
    filasPedidas > 0 ? Math.max(Math.min(filasPedidas, MAX_FILAS), incluidas.length) : null

  function alternar(key: string, incluir: boolean) {
    setExcluidas((s) => {
      const n = new Set(s)
      if (incluir) n.delete(key)
      else n.add(key)
      return n
    })
  }

  function descargar() {
    if (!emisor) return
    downloadFichaObraSocial({
      paciente,
      emisor,
      titulo: titulo.trim() || "Ficha de prestaciones",
      prestaciones: incluidas.map((f) => ({
        fecha: f.fecha,
        codigo: f.codigo,
        pieza: f.pieza,
        caras: (carasEditadas[f.key] ?? f.caras).trim().toUpperCase(),
      })),
      dientes: ultimoOdontograma?.dientes ?? [],
      odontograma: odontologica,
      filas: totalFilas,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ficha para la obra social</DialogTitle>
          <DialogDescription>
            Elegí el período y las prestaciones a informar. Se genera un PDF con los datos del
            afiliado{odontologica ? ", el odontograma" : ""} y el registro de prestaciones para
            firmar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Título" htmlFor="ficha-titulo" className="sm:col-span-2">
            <Input
              id="ficha-titulo"
              className="h-10"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </Field>
          <Field label="Desde" htmlFor="ficha-desde">
            <Input
              id="ficha-desde"
              type="date"
              className="h-10"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
            />
          </Field>
          <Field label="Hasta" htmlFor="ficha-hasta">
            <Input
              id="ficha-hasta"
              type="date"
              className="h-10"
              value={hasta}
              min={desde}
              onChange={(e) => setHasta(e.target.value)}
            />
          </Field>
          {idProfesional ? (
            <div className="flex items-center gap-2 sm:col-span-2">
              <Checkbox
                id="ficha-solo-mias"
                checked={soloMias}
                onCheckedChange={(v) => setSoloMias(v === true)}
              />
              <Label htmlFor="ficha-solo-mias" className="font-normal">
                Solo las prestaciones que registré yo (la ficha la firma quien la emite)
              </Label>
            </div>
          ) : null}
        </div>

        <div>
          <p className="text-sm font-medium">
            Prestaciones del período{" "}
            <span className="font-normal text-muted-foreground">
              ({incluidas.length} de {filas.length})
            </span>
          </p>
          {filas.length ? (
            <div className="mt-2 rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <span className="sr-only">Incluir</span>
                    </TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Pieza</TableHead>
                    <TableHead className="w-28">Caras</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((f) => {
                    const incluida = !excluidas.has(f.key)
                    return (
                      <TableRow key={f.key} className={incluida ? undefined : "opacity-50"}>
                        <TableCell>
                          <Checkbox
                            checked={incluida}
                            onCheckedChange={(v) => alternar(f.key, v === true)}
                            aria-label={`Incluir ${f.codigo} del ${f.fecha}`}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{f.fecha}</TableCell>
                        <TableCell>
                          <span className="font-medium">{f.codigo}</span>
                          <span className="block max-w-56 truncate text-xs text-muted-foreground">
                            {f.descripcion}
                          </span>
                        </TableCell>
                        <TableCell>{f.pieza || "—"}</TableCell>
                        <TableCell>
                          <Input
                            className="h-8 uppercase"
                            value={carasEditadas[f.key] ?? f.caras}
                            onChange={(e) =>
                              setCarasEditadas((c) => ({ ...c, [f.key]: e.target.value }))
                            }
                            aria-label={`Caras de ${f.codigo} del ${f.fecha}`}
                            disabled={!incluida}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="mt-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
              No hay prácticas codificadas en este período. La ficha sale con los renglones en
              blanco para completar a mano.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Las caras se completan con las que cambiaron en el odontograma de esa consulta.{" "}
            {REFERENCIA_CARAS}.
          </p>
        </div>

        <Field
          label="Filas del registro"
          htmlFor="ficha-filas"
          hint={
            totalFilas === null
              ? "Vacío: se completa la hoja con renglones en blanco para cargar a mano."
              : totalFilas > incluidas.length
                ? `Sale con ${totalFilas} filas: ${incluidas.length} cargada(s) y ${totalFilas - incluidas.length} en blanco.`
                : `Sale con ${totalFilas} fila(s), sin renglones en blanco (no puede tener menos que las prestaciones incluidas).`
          }
        >
          <Input
            id="ficha-filas"
            type="number"
            inputMode="numeric"
            min={Math.max(1, incluidas.length)}
            max={MAX_FILAS}
            placeholder="Toda la hoja"
            className="h-10 sm:max-w-40"
            value={filasTexto}
            onChange={(e) => {
              setFilasTexto(e.target.value)
              guardarFilas(e.target.value)
            }}
          />
        </Field>

        {odontologica && (
          <p className="text-sm text-muted-foreground">
            {ultimoOdontograma
              ? `Odontograma: el registrado el ${ultimoOdontograma.fecha}.`
              : "No hay odontograma registrado hasta esa fecha: sale en blanco."}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={descargar} disabled={!emisor}>
            {emisor ? <Download /> : <Loader2 className="animate-spin" />}
            Descargar ficha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
