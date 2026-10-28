import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  Loader2,
  Download,
  FolderHeart,
  Image as ImageIcon,
  FileText,
  User,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Container } from "@/components/site/Section"
import { api } from "@/lib/api"
import { SkeletonTarjetas } from "@/components/site/Skeletons"

type CategoriaId = "laboratorio" | "imagen" | "informe" | "receta" | "otro"

type EstudioCompartido = {
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
  compartidoEn: string | null
}

const CATEGORIA_LABEL: Record<CategoriaId, string> = {
  laboratorio: "Laboratorio",
  imagen: "Imagen / Radiografía",
  informe: "Informe",
  receta: "Receta",
  otro: "Otro",
}

function formatFecha(iso: string | null) {
  if (!iso) return ""
  try {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "short",
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

export default function EstudiosCompartidos() {
  const [estudios, setEstudios] = useState<EstudioCompartido[] | null>(null)
  const [descargando, setDescargando] = useState<number | null>(null)

  useEffect(() => {
    api
      .get<{ estudios: EstudioCompartido[] }>("/estudios/compartidos-conmigo")
      .then((d) => setEstudios(d.estudios || []))
      .catch(() => {
        toast.error("No se pudieron cargar los estudios compartidos.")
        setEstudios([])
      })
  }, [])

  // Agrupa por paciente para lectura tipo bandeja.
  const grupos = useMemo(() => {
    const map = new Map<string, EstudioCompartido[]>()
    for (const e of estudios || []) {
      const k = e.pacienteNombre || "Paciente"
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return Array.from(map.entries())
  }, [estudios])

  async function descargar(e: EstudioCompartido) {
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

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">Compartidos conmigo</h1>
        <p className="mt-1 text-muted-foreground">
          Estudios que tus pacientes eligieron compartir con vos.
        </p>
      </div>

      {estudios === null ? (
        <SkeletonTarjetas />
      ) : estudios.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <FolderHeart className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Todavía no te compartieron estudios.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grupos.map(([paciente, items]) => (
            <section key={paciente}>
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <User className="size-4 text-muted-foreground" />
                {paciente}
                <Badge variant="secondary" className="font-normal">
                  {items.length}
                </Badge>
              </h2>
              <ul className="space-y-3">
                {items.map((e) => (
                  <li key={e.id}>
                    <Card>
                      <CardContent className="flex flex-wrap items-center gap-4 p-4">
                        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                          {e.esImagen ? (
                            <ImageIcon className="size-5" />
                          ) : (
                            <FileText className="size-5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 font-medium">
                            <span className="truncate">{e.titulo}</span>
                            <Badge variant="secondary" className="font-normal">
                              {CATEGORIA_LABEL[e.categoria] ?? e.categoria}
                            </Badge>
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {e.fechaEstudio
                              ? `Estudio: ${formatFecha(e.fechaEstudio)}`
                              : `Subido: ${formatFecha(e.subidoEn)}`}
                            {e.archivoSize ? ` · ${formatSize(e.archivoSize)}` : ""}
                            {e.compartidoEn
                              ? ` · Compartido ${formatFecha(e.compartidoEn)}`
                              : ""}
                          </p>
                          {e.descripcion && (
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                              {e.descripcion}
                            </p>
                          )}
                        </div>
                        <Button
                          onClick={() => descargar(e)}
                          disabled={descargando === e.id}
                        >
                          {descargando === e.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Download />
                          )}
                          Ver
                        </Button>
                      </CardContent>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Container>
  )
}
