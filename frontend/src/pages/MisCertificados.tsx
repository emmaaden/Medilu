import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Loader2,
  Download,
  ArrowLeft,
  FileCheck2,
  Image as ImageIcon,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Container, PageHero } from "@/components/site/Section"
import { api } from "@/lib/api"
import { useUser } from "@/hooks/useUser"
import { SkeletonTarjetas, PageSkeleton } from "@/components/site/Skeletons"

export type Certificado = {
  id: number
  tipo: "generado" | "subido"
  motivo: string | null
  diagnostico: string | null
  indicaciones: string | null
  diasReposo: number | null
  pacienteNombre: string | null
  profesionalNombre: string | null
  emitidoEn: string
  esImagen: boolean
}

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

export default function MisCertificados() {
  const { user, loading: loadingUser } = useUser()
  const [certificados, setCertificados] = useState<Certificado[] | null>(null)
  const [descargando, setDescargando] = useState<number | null>(null)

  const esPaciente = user?.role === "paciente"

  useEffect(() => {
    if (!esPaciente) return
    api
      .get<{ certificados: Certificado[] }>("/api/mi-cuenta/certificados")
      .then((d) => setCertificados(d.certificados || []))
      .catch(() => {
        toast.error("No se pudieron cargar tus certificados.")
        setCertificados([])
      })
  }, [esPaciente])

  async function descargar(c: Certificado) {
    setDescargando(c.id)
    try {
      const { url } = await api.get<{ url: string }>(
        `/certificados/${c.id}/descargar`
      )
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      toast.error("No se pudo descargar el certificado.")
    } finally {
      setDescargando(null)
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
        title="Mis certificados"
        description="Los certificados médicos que emitieron tus profesionales. Solo vos podés verlos."
      />

      <Container className="py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6">
            <Button asChild variant="ghost">
              <Link to="/mis-turnos">
                <ArrowLeft /> Volver a mi cuenta
              </Link>
            </Button>
          </div>

          {certificados === null ? (
            <SkeletonTarjetas />
          ) : certificados.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FileCheck2 className="mx-auto mb-3 size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Todavía no tenés certificados médicos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-3">
              {certificados.map((c) => (
                <li key={c.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
                      <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        {c.esImagen ? (
                          <ImageIcon className="size-5" />
                        ) : (
                          <FileText className="size-5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          Certificado médico
                          <Badge variant="secondary" className="font-normal">
                            {c.tipo === "generado" ? "Digital" : "Adjunto"}
                          </Badge>
                        </p>
                        <p className="truncate text-sm text-muted-foreground">
                          {formatFecha(c.emitidoEn)}
                          {c.profesionalNombre ? ` · ${c.profesionalNombre}` : ""}
                          {c.diasReposo ? ` · ${c.diasReposo} día(s) de reposo` : ""}
                        </p>
                      </div>
                      <Button
                        className="w-full sm:w-auto"
                        onClick={() => descargar(c)}
                        disabled={descargando === c.id}
                      >
                        {descargando === c.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <Download />
                        )}
                        Descargar
                      </Button>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Container>
    </>
  )
}
