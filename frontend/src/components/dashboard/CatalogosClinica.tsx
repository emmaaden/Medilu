import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Building, ListChecks, Loader2, Plus, Upload, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api, ApiError } from "@/lib/api"
import { invalidarCatalogo, type ObraSocial, type Practica } from "@/lib/catalogos"
import { SkeletonLista, SkeletonTabla } from "@/components/site/Skeletons"

const msg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback)

/* ----------------------------- CSV de prácticas ----------------------------- */

/**
 * CSV de prácticas: `codigo;descripcion;requiere_autorizacion` (separador ; o ,).
 * La primera fila se ignora si es un encabezado. La tercera columna es opcional
 * (sí/si/true/1 = requiere autorización).
 */
function parsearCsvPracticas(texto: string) {
  const filas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const items: { codigo: string; descripcion: string; requiereAutorizacion: boolean }[] = []
  filas.forEach((linea, i) => {
    const sep = linea.includes(";") ? ";" : ","
    const [codigo = "", descripcion = "", req = ""] = linea
      .split(sep)
      .map((c) => c.trim().replace(/^"(.*)"$/, "$1"))
    if (i === 0 && /c[oó]digo/i.test(codigo)) return // encabezado
    if (!codigo || !descripcion) return
    items.push({
      codigo: codigo.slice(0, 30),
      descripcion: descripcion.slice(0, 200),
      requiereAutorizacion: /^(s[ií]|true|1|x)$/i.test(req),
    })
  })
  return items
}

/* ----------------------------- Obras sociales ----------------------------- */

function ObrasSocialesCard() {
  const [lista, setLista] = useState<ObraSocial[]>([])
  const [cargando, setCargando] = useState(true)
  const [nombre, setNombre] = useState("")
  const [sigla, setSigla] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [cambiando, setCambiando] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    try {
      const d = await api.get<{ obrasSociales: ObraSocial[] }>("/catalogos/obras-sociales?todas=1")
      setLista(d.obrasSociales || [])
    } catch {
      toast.error("No se pudieron cargar las obras sociales.")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardando(true)
    try {
      await api.post("/catalogos/obras-sociales", {
        nombre: nombre.trim(),
        ...(sigla.trim() ? { sigla: sigla.trim() } : {}),
      })
      toast.success("Obra social agregada.")
      setNombre("")
      setSigla("")
      invalidarCatalogo("os")
      await cargar()
    } catch (err) {
      toast.error(msg(err, "No se pudo agregar la obra social."))
    } finally {
      setGuardando(false)
    }
  }

  async function alternar(o: ObraSocial) {
    setCambiando(o.id)
    try {
      await api.patch(`/catalogos/obras-sociales/${o.id}`, { activo: !o.activo })
      invalidarCatalogo("os")
      await cargar()
    } catch (err) {
      toast.error(msg(err, "No se pudo actualizar la obra social."))
    } finally {
      setCambiando(null)
    }
  }

  const propias = lista.filter((o) => o.propia)
  const globales = lista.filter((o) => !o.propia)

  return (
    <Card className="mt-6">
      <CardContent className="p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Building className="size-5 text-primary" /> Obras sociales
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          El sistema trae {globales.length} obras sociales nacionales. Agregá las que trabaja tu
          clínica y no estén en el listado.
        </p>

        <form onSubmit={agregar} className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="os-nombre">Nombre</Label>
            <Input id="os-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="os-sigla">Sigla (opcional)</Label>
            <Input id="os-sigla" value={sigla} onChange={(e) => setSigla(e.target.value)} maxLength={30} />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={guardando || !nombre.trim()}>
              {guardando ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
            </Button>
          </div>
        </form>

        {cargando ? (
          <SkeletonLista filas={3} className="mt-5" />
        ) : propias.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Todavía no agregaste obras sociales propias.</p>
        ) : (
          <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
            {propias.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {o.nombre}
                  {o.sigla ? <span className="text-muted-foreground"> · {o.sigla}</span> : null}
                </span>
                <Badge variant={o.activo ? "default" : "secondary"}>{o.activo ? "Activa" : "De baja"}</Badge>
                <Button variant="ghost" size="sm" disabled={cambiando === o.id} onClick={() => alternar(o)}>
                  {cambiando === o.id && <Loader2 className="animate-spin" />}
                  {o.activo ? "Dar de baja" : "Activar"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/* ------------------------------- Prácticas ------------------------------- */

function PracticasCard() {
  const [lista, setLista] = useState<Practica[]>([])
  const [cargando, setCargando] = useState(true)
  const [form, setForm] = useState({ codigo: "", descripcion: "", requiere: false })
  const [ocupado, setOcupado] = useState<string | null>(null)
  const archivoRef = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    try {
      const d = await api.get<{ practicas: Practica[] }>("/catalogos/practicas?todas=1")
      setLista(d.practicas || [])
    } catch {
      toast.error("No se pudieron cargar las prácticas.")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function refrescar() {
    invalidarCatalogo("practicas")
    await cargar()
  }

  async function agregar(e: React.FormEvent) {
    e.preventDefault()
    if (!form.codigo.trim() || !form.descripcion.trim()) return
    setOcupado("agregar")
    try {
      await api.post("/catalogos/practicas", {
        codigo: form.codigo.trim(),
        descripcion: form.descripcion.trim(),
        requiereAutorizacion: form.requiere,
      })
      toast.success("Práctica agregada.")
      setForm({ codigo: "", descripcion: "", requiere: false })
      await refrescar()
    } catch (err) {
      toast.error(msg(err, "No se pudo agregar la práctica."))
    } finally {
      setOcupado(null)
    }
  }

  async function cargarBase() {
    setOcupado("base")
    try {
      const r = await api.post<{ agregadas: number }>("/catalogos/practicas/base")
      toast.success(
        r.agregadas ? `Se agregaron ${r.agregadas} prácticas.` : "La lista base ya estaba cargada."
      )
      await refrescar()
    } catch (err) {
      toast.error(msg(err, "No se pudo cargar la lista base."))
    } finally {
      setOcupado(null)
    }
  }

  async function importar(file: File | undefined) {
    if (archivoRef.current) archivoRef.current.value = ""
    if (!file) return
    const items = parsearCsvPracticas(await file.text())
    if (!items.length) {
      toast.error("El archivo no tiene prácticas (formato: código;descripción;requiere).")
      return
    }
    setOcupado("importar")
    try {
      const r = await api.post<{ agregadas: number; omitidas: number }>(
        "/catalogos/practicas/importar",
        { items }
      )
      toast.success(`Importadas: ${r.agregadas}. Omitidas (repetidas o existentes): ${r.omitidas}.`)
      await refrescar()
    } catch (err) {
      toast.error(msg(err, "No se pudo importar el archivo."))
    } finally {
      setOcupado(null)
    }
  }

  async function actualizar(p: Practica, patch: Partial<Pick<Practica, "requiereAutorizacion" | "activo">>) {
    setOcupado(`p-${p.id}`)
    try {
      await api.patch(`/catalogos/practicas/${p.id}`, patch)
      await refrescar()
    } catch (err) {
      toast.error(msg(err, "No se pudo actualizar la práctica."))
    } finally {
      setOcupado(null)
    }
  }

  return (
    <Card className="mt-6">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ListChecks className="size-5 text-primary" /> Prácticas
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={cargarBase} disabled={!!ocupado}>
              {ocupado === "base" ? <Loader2 className="animate-spin" /> : <Sparkles />}
              Cargar lista base
            </Button>
            <input
              ref={archivoRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => importar(e.target.files?.[0])}
            />
            <Button variant="outline" size="sm" onClick={() => archivoRef.current?.click()} disabled={!!ocupado}>
              {ocupado === "importar" ? <Loader2 className="animate-spin" /> : <Upload />}
              Importar CSV
            </Button>
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Catálogo propio de la clínica para codificar las consultas. Marcá las que necesitan
          autorización previa de la auditoría. El CSV lleva <code>código;descripción;requiere</code>.
        </p>

        <form onSubmit={agregar} className="mt-4 grid gap-3 sm:grid-cols-6">
          <div className="grid gap-1.5">
            <Label htmlFor="px-codigo">Código</Label>
            <Input
              id="px-codigo"
              value={form.codigo}
              onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
              maxLength={30}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-3">
            <Label htmlFor="px-desc">Descripción</Label>
            <Input
              id="px-desc"
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              maxLength={200}
            />
          </div>
          <div className="flex items-end gap-2 pb-2.5">
            <Checkbox
              id="px-req"
              checked={form.requiere}
              onCheckedChange={(v) => setForm((f) => ({ ...f, requiere: v === true }))}
            />
            <Label htmlFor="px-req" className="font-normal">
              Requiere autorización
            </Label>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full"
              disabled={!!ocupado || !form.codigo.trim() || !form.descripcion.trim()}
            >
              {ocupado === "agregar" ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
            </Button>
          </div>
        </form>

        {cargando ? (
          <SkeletonTabla className="mt-4" />
        ) : lista.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Todavía no hay prácticas. Cargá la lista base o importá la de tu convenio.
          </p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Autorización previa</TableHead>
                <TableHead className="text-right">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((p) => (
                <TableRow key={p.id} className={p.activo ? undefined : "opacity-60"}>
                  <TableCell className="font-mono text-xs">{p.codigo}</TableCell>
                  <TableCell>{p.descripcion}</TableCell>
                  <TableCell>
                    <Checkbox
                      checked={p.requiereAutorizacion}
                      disabled={ocupado === `p-${p.id}`}
                      onCheckedChange={(v) => actualizar(p, { requiereAutorizacion: v === true })}
                      aria-label={`${p.codigo}: requiere autorización`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={ocupado === `p-${p.id}`}
                      onClick={() => actualizar(p, { activo: !p.activo })}
                    >
                      {p.activo ? "Dar de baja" : "Activar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

/** Fase K: catálogos propios de la clínica (solo admin). */
export function CatalogosClinica() {
  return (
    <>
      <ObrasSocialesCard />
      <PracticasCard />
    </>
  )
}
