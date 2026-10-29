import { useCallback, useEffect, useRef, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Loader2,
  Download,
  ArrowLeft,
  FolderHeart,
  Image as ImageIcon,
  FileText,
  Upload,
  Trash2,
  Share2,
  Search,
  UserPlus,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Container, PageHero } from "@/components/site/Section"
import { api, ApiError } from "@/lib/api"
import { useUser } from "@/hooks/useUser"
import { SkeletonLista, SkeletonTarjetas, PageSkeleton } from "@/components/site/Skeletons"

type Compartido = {
  idProfesional: number
  profesionalNombre: string | null
  compartidoEn: string
}

type Estudio = {
  id: number
  titulo: string
  descripcion: string | null
  categoria: CategoriaId
  fechaEstudio: string | null
  archivoNombre: string | null
  archivoSize: number | null
  esImagen: boolean
  pacienteNombre: string | null
  subidoEn: string
  compartidos: Compartido[]
}

type ProfesionalBusqueda = {
  id: number
  nombre: string
  matricula: string | null
  especialidades: string[]
}

type CategoriaId = "laboratorio" | "imagen" | "informe" | "receta" | "otro"

const CATEGORIAS: { id: CategoriaId; label: string }[] = [
  { id: "laboratorio", label: "Laboratorio" },
  { id: "imagen", label: "Imagen / Radiografía" },
  { id: "informe", label: "Informe" },
  { id: "receta", label: "Receta" },
  { id: "otro", label: "Otro" },
]

const CATEGORIA_LABEL: Record<CategoriaId, string> = Object.fromEntries(
  CATEGORIAS.map((c) => [c.id, c.label])
) as Record<CategoriaId, string>

function formatFecha(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function formatSize(bytes: number | null) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const MAX_BYTES = 10 * 1024 * 1024

export default function MisEstudios() {
  const { user, loading: loadingUser } = useUser()
  const [estudios, setEstudios] = useState<Estudio[] | null>(null)
  const [descargando, setDescargando] = useState<number | null>(null)
  const [subirOpen, setSubirOpen] = useState(false)
  const [compartirId, setCompartirId] = useState<number | null>(null)
  const [eliminar, setEliminar] = useState<Estudio | null>(null)

  // El estudio del diálogo de compartir se deriva de la lista (por id) para que
  // sus "compartidos" se refresquen al recargar tras compartir/revocar.
  const compartir =
    compartirId != null
      ? (estudios || []).find((e) => e.id === compartirId) ?? null
      : null

  const esPaciente = user?.role === "paciente"

  const cargar = useCallback(() => {
    return api
      .get<{ estudios: Estudio[] }>("/estudios")
      .then((d) => setEstudios(d.estudios || []))
      .catch(() => {
        toast.error("No se pudieron cargar tus estudios.")
        setEstudios([])
      })
  }, [])

  useEffect(() => {
    if (!esPaciente) return
    cargar()
  }, [esPaciente, cargar])

  async function descargar(e: Estudio) {
    setDescargando(e.id)
    try {
      const { url } = await api.get<{ url: string }>(`/estudios/${e.id}/descargar`)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      toast.error("No se pudo abrir el estudio.")
    } finally {
      setDescargando(null)
    }
  }

  async function confirmarEliminar() {
    if (!eliminar) return
    try {
      await api.del(`/estudios/${eliminar.id}`)
      toast.success("Estudio eliminado.")
      setEstudios((list) => (list || []).filter((x) => x.id !== eliminar.id))
      setEliminar(null)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar.")
    }
  }

  if (loadingUser) {
    return <PageSkeleton />
  }
  if (!user || !esPaciente) {
    return <Navigate to="/login" replace />
  }

  return (
    <>
      <PageHero
        eyebrow="Mi cuenta"
        title="Mis estudios"
        description="Guardá tus estudios (laboratorios, imágenes, informes) y compartilos con los profesionales que quieras. Solo vos decidís quién los ve."
      />

      <Container className="py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost">
              <Link to="/mis-turnos">
                <ArrowLeft /> Volver a mi cuenta
              </Link>
            </Button>
            <Button onClick={() => setSubirOpen(true)}>
              <Upload /> Subir estudio
            </Button>
          </div>

          {estudios === null ? (
            <SkeletonTarjetas />
          ) : estudios.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FolderHeart className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Todavía no subiste ningún estudio.
                </p>
                <Button className="mt-4" onClick={() => setSubirOpen(true)}>
                  <Upload /> Subir mi primer estudio
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {estudios.map((e) => (
                <li key={e.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        {e.esImagen ? (
                          <ImageIcon className="size-5" />
                        ) : (
                          <FileText className="size-5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                          <span className="min-w-0 break-words">{e.titulo}</span>
                          <Badge variant="secondary" className="font-normal">
                            {CATEGORIA_LABEL[e.categoria] ?? e.categoria}
                          </Badge>
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {e.fechaEstudio
                            ? formatFecha(e.fechaEstudio)
                            : formatFecha(e.subidoEn)}
                          {e.archivoSize ? ` · ${formatSize(e.archivoSize)}` : ""}
                        </p>
                        {e.compartidos.length > 0 && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            Compartido con{" "}
                            {e.compartidos
                              .map((c) => c.profesionalNombre || "profesional")
                              .join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="flex w-full items-center justify-end gap-1.5 sm:w-auto">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCompartirId(e.id)}
                        >
                          <Share2 />
                          {e.compartidos.length > 0
                            ? `Compartido (${e.compartidos.length})`
                            : "Compartir"}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Descargar"
                          onClick={() => descargar(e)}
                          disabled={descargando === e.id}
                        >
                          {descargando === e.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Download />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Eliminar"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setEliminar(e)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>

      <SubirDialog
        open={subirOpen}
        onOpenChange={setSubirOpen}
        onSubido={cargar}
      />

      <CompartirDialog
        estudio={compartir}
        onOpenChange={(o) => !o && setCompartirId(null)}
        onCambio={cargar}
      />

      <Dialog open={!!eliminar} onOpenChange={(o) => !o && setEliminar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar estudio</DialogTitle>
            <DialogDescription>
              {eliminar
                ? `¿Seguro que querés eliminar "${eliminar.titulo}"? Se borrará el archivo y dejará de estar compartido. Esta acción no se puede deshacer.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEliminar(null)}>
              No, volver
            </Button>
            <Button variant="destructive" onClick={confirmarEliminar}>
              <Trash2 /> Sí, eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// --- Dialog de subida ---
function SubirDialog({
  open,
  onOpenChange,
  onSubido,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSubido: () => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [titulo, setTitulo] = useState("")
  const [categoria, setCategoria] = useState<CategoriaId>("laboratorio")
  const [fechaEstudio, setFechaEstudio] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [enviando, setEnviando] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFile(null)
    setTitulo("")
    setCategoria("laboratorio")
    setFechaEstudio("")
    setDescripcion("")
    if (fileRef.current) fileRef.current.value = ""
  }

  async function enviar() {
    if (!file) {
      toast.error("Adjuntá un archivo (PDF, PNG o JPG).")
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error("El archivo supera el máximo de 10 MB.")
      return
    }
    if (!titulo.trim()) {
      toast.error("Poné un título al estudio.")
      return
    }
    setEnviando(true)
    try {
      const form = new FormData()
      form.append("archivo", file)
      form.append("titulo", titulo.trim())
      form.append("categoria", categoria)
      if (fechaEstudio) form.append("fechaEstudio", fechaEstudio)
      if (descripcion.trim()) form.append("descripcion", descripcion.trim())
      await api.upload("/estudios", form)
      toast.success("Estudio subido.")
      reset()
      onOpenChange(false)
      await onSubido()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo subir el estudio.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Subir estudio</DialogTitle>
          <DialogDescription>
            Formatos permitidos: PDF, PNG o JPG. Hasta 10 MB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="estudio-archivo">Archivo</Label>
            <Input
              id="estudio-archivo"
              type="file"
              ref={fileRef}
              accept="application/pdf,image/png,image/jpeg"
              onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="estudio-titulo">Título</Label>
            <Input
              id="estudio-titulo"
              placeholder="Ej: Análisis de sangre"
              value={titulo}
              maxLength={200}
              onChange={(ev) => setTitulo(ev.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select
                value={categoria}
                onValueChange={(v) => setCategoria(v as CategoriaId)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estudio-fecha">Fecha del estudio</Label>
              <Input
                id="estudio-fecha"
                type="date"
                value={fechaEstudio}
                onChange={(ev) => setFechaEstudio(ev.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="estudio-desc">Notas (opcional)</Label>
            <Textarea
              id="estudio-desc"
              placeholder="Detalles que quieras dejar anotados."
              value={descripcion}
              maxLength={4000}
              onChange={(ev) => setDescripcion(ev.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={enviando}
          >
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={enviando}>
            {enviando ? <Loader2 className="animate-spin" /> : <Upload />}
            Subir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Dialog de compartir ---
function CompartirDialog({
  estudio,
  onOpenChange,
  onCambio,
}: {
  estudio: Estudio | null
  onOpenChange: (o: boolean) => void
  onCambio: () => Promise<void>
}) {
  const [query, setQuery] = useState("")
  const [resultados, setResultados] = useState<ProfesionalBusqueda[]>([])
  const [buscando, setBuscando] = useState(false)
  const [accion, setAccion] = useState<number | null>(null)

  // Reinicia la búsqueda al abrir/cerrar o cambiar de estudio.
  useEffect(() => {
    setQuery("")
    setResultados([])
  }, [estudio?.id])

  // Búsqueda con debounce.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResultados([])
      setBuscando(false)
      return
    }
    setBuscando(true)
    const t = setTimeout(() => {
      api
        .get<{ profesionales: ProfesionalBusqueda[] }>(
          `/estudios/profesionales/buscar?q=${encodeURIComponent(q)}`
        )
        .then((d) => setResultados(d.profesionales || []))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false))
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  if (!estudio) return null

  const yaCompartidos = new Set(estudio.compartidos.map((c) => c.idProfesional))

  async function compartirCon(prof: ProfesionalBusqueda) {
    if (!estudio) return
    setAccion(prof.id)
    try {
      const r = await api.post<{ message: string }>(
        `/estudios/${estudio.id}/compartir`,
        { idProfesional: prof.id }
      )
      toast.success(r.message || "Estudio compartido.")
      setQuery("")
      setResultados([])
      await onCambio()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo compartir.")
    } finally {
      setAccion(null)
    }
  }

  async function revocar(idProfesional: number) {
    if (!estudio) return
    setAccion(idProfesional)
    try {
      await api.del(`/estudios/${estudio.id}/compartir/${idProfesional}`)
      toast.success("Acceso revocado.")
      await onCambio()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo revocar.")
    } finally {
      setAccion(null)
    }
  }

  // Toma la versión más fresca de los compartidos desde la lista recargada.
  const compartidos = estudio.compartidos

  return (
    <Dialog open={!!estudio} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compartir estudio</DialogTitle>
          <DialogDescription className="truncate">
            {estudio.titulo}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Compartidos actuales */}
          <div>
            <p className="mb-2 text-sm font-medium">Compartido con</p>
            {compartidos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no lo compartiste con nadie.
              </p>
            ) : (
              <ul className="space-y-2">
                {compartidos.map((c) => (
                  <li
                    key={c.idProfesional}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {c.profesionalNombre || "Profesional"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => revocar(c.idProfesional)}
                      disabled={accion === c.idProfesional}
                    >
                      {accion === c.idProfesional ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <X />
                      )}
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Buscador */}
          <div className="space-y-1.5">
            <Label htmlFor="buscar-prof">Agregar profesional</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="buscar-prof"
                className="pl-9"
                placeholder="Buscá por nombre, apellido o matrícula"
                value={query}
                onChange={(ev) => setQuery(ev.target.value)}
              />
            </div>

            {query.trim().length >= 2 && (
              <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border">
                {buscando ? (
                  <SkeletonLista filas={2} bordes={false} />
                ) : resultados.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                    No se encontraron profesionales.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {resultados.map((p) => {
                      const yaEsta = yaCompartidos.has(p.id)
                      return (
                        <li
                          key={p.id}
                          className="flex items-center gap-2 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{p.nombre}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[
                                p.matricula ? `Mat. ${p.matricula}` : null,
                                ...p.especialidades,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Profesional"}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={yaEsta ? "ghost" : "outline"}
                            disabled={yaEsta || accion === p.id}
                            onClick={() => compartirCon(p)}
                          >
                            {accion === p.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <UserPlus />
                            )}
                            {yaEsta ? "Ya compartido" : "Compartir"}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
