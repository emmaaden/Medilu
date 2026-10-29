import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { CheckCircle2, FileText, Loader2, XCircle, Ban } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Odontogram } from "@/components/dashboard/Odontogram"
import { api, ApiError } from "@/lib/api"
import { formatDia, formatFechaHora, hoyAR } from "@/lib/fecha"
import {
  ESTADO_AUTORIZACION,
  tamanioLegible,
  type Autorizacion,
} from "@/lib/autorizaciones"
import { SkeletonDetalle } from "@/components/site/Skeletons"

export type ModoAutorizacion = "profesional" | "auditor" | "admin"

export function EstadoAutorizacionBadge({ a }: { a: Pick<Autorizacion, "estado" | "vencida"> }) {
  if (a.vencida) return <Badge variant="secondary">Vencida</Badge>
  const meta = ESTADO_AUTORIZACION[a.estado] ?? ESTADO_AUTORIZACION.pendiente
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titulo}</p>
      <div className="mt-1 text-sm whitespace-pre-wrap">{children}</div>
    </div>
  )
}

/**
 * Fase K: detalle de una autorización previa. El auditor la resuelve (aprobar con
 * vencimiento / rechazar con motivo); el profesional puede cancelar la suya pendiente.
 */
export function AutorizacionSheet({
  id,
  modo,
  onClose,
  onCambio,
}: {
  id: number | null
  modo: ModoAutorizacion
  onClose: () => void
  onCambio: () => void
}) {
  const [a, setA] = useState<Autorizacion | null>(null)
  const [motivo, setMotivo] = useState("")
  const [venceEn, setVenceEn] = useState("")
  const [accion, setAccion] = useState<string | null>(null)

  const cargar = useCallback(
    async (autId: number) => {
      try {
        const d = await api.get<{ autorizacion: Autorizacion }>(`/autorizaciones/${autId}`)
        setA(d.autorizacion)
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "No se pudo abrir la autorización.")
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (id == null) return
    setA(null)
    setMotivo("")
    setVenceEn("")
    cargar(id)
  }, [id, cargar])

  async function abrirAdjunto(adjuntoId: number) {
    if (!a) return
    try {
      const { url } = await api.get<{ url: string }>(`/autorizaciones/${a.id}/adjuntos/${adjuntoId}`)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      toast.error("No se pudo abrir el adjunto.")
    }
  }

  async function resolver(estado: "aprobada" | "rechazada") {
    if (!a) return
    if (estado === "rechazada" && !motivo.trim()) {
      toast.error("Indicá el motivo del rechazo.")
      return
    }
    setAccion(estado)
    try {
      const d = await api.post<{ autorizacion: Autorizacion }>(`/autorizaciones/${a.id}/resolver`, {
        estado,
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
        ...(estado === "aprobada" && venceEn ? { venceEn } : {}),
      })
      setA(d.autorizacion)
      toast.success(estado === "aprobada" ? "Autorización aprobada." : "Autorización rechazada.")
      onCambio()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo resolver la autorización.")
    } finally {
      setAccion(null)
    }
  }

  async function cancelar() {
    if (!a) return
    setAccion("cancelar")
    try {
      await api.post(`/autorizaciones/${a.id}/cancelar`)
      toast.success("Solicitud cancelada.")
      onCambio()
      await cargar(a.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cancelar la solicitud.")
    } finally {
      setAccion(null)
    }
  }

  return (
    <Sheet open={id != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader>
          <SheetTitle>
            {a ? `${a.practica.codigo} · ${a.practica.descripcion}` : "Autorización previa"}
          </SheetTitle>
          <SheetDescription>
            {a ? `Pedida por ${a.profesional || "—"} el ${formatFechaHora(a.creadoEn)}` : "Cargando…"}
          </SheetDescription>
        </SheetHeader>

        {!a ? (
          <SkeletonDetalle />
        ) : (
          <div className="grid gap-5 px-4 pb-8">
            <div className="flex flex-wrap items-center gap-2">
              <EstadoAutorizacionBadge a={a} />
              {a.numero && <Badge variant="outline">{a.numero}</Badge>}
              {a.venceEn && (
                <span className="text-xs text-muted-foreground">Vence el {formatDia(a.venceEn)}</span>
              )}
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{a.paciente.nombre || "—"}</p>
              <p className="text-muted-foreground">
                DNI {a.paciente.dni || "—"} · {a.paciente.obraSocial || "Sin obra social"}
                {a.paciente.nroAfiliado ? ` · Afiliado ${a.paciente.nroAfiliado}` : ""}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Dato titulo="Pieza o zona">{a.practica.pieza || "—"}</Dato>
              <Dato titulo="Cantidad">{a.practica.cantidad}</Dato>
              <Dato titulo="Diagnóstico">
                {a.diagnostico ? `${a.diagnostico.codigo} · ${a.diagnostico.descripcion}` : "—"}
              </Dato>
            </div>
            <Dato titulo="Fundamento clínico">{a.fundamento || "—"}</Dato>

            {a.adjuntos.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Adjuntos
                </p>
                <ul className="grid gap-2">
                  {a.adjuntos.map((f) => (
                    <li key={f.id}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="max-w-full justify-start"
                        onClick={() => abrirAdjunto(f.id)}
                      >
                        <FileText />
                        <span className="truncate">{f.nombre}</span>
                        {f.size ? (
                          <span className="text-muted-foreground">{tamanioLegible(f.size)}</span>
                        ) : null}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {a.odontograma && a.odontograma.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Odontograma al pedirla
                </p>
                <Odontogram value={a.odontograma} readOnly />
              </div>
            )}

            {a.estado !== "pendiente" && (a.motivo || a.auditor) && (
              <div className="rounded-lg border border-border p-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  {a.estado === "cancelada" ? "Cancelada" : `Resuelta por ${a.auditor || "auditoría"}`}
                  {a.resueltaEn ? ` · ${formatFechaHora(a.resueltaEn)}` : ""}
                </p>
                {a.motivo && <p className="mt-1 whitespace-pre-wrap">{a.motivo}</p>}
              </div>
            )}

            {/* Resolución (auditor) */}
            {modo === "auditor" && a.estado === "pendiente" && (
              <div className="grid gap-4 rounded-lg border border-border p-4">
                <p className="font-medium">Resolver</p>
                <div className="grid gap-1.5">
                  <Label htmlFor="aut-motivo">Motivo o condiciones</Label>
                  <Textarea
                    id="aut-motivo"
                    rows={3}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Obligatorio al rechazar."
                    maxLength={4000}
                  />
                </div>
                <div className="grid max-w-xs gap-1.5">
                  <Label htmlFor="aut-vence">Vence (si se aprueba)</Label>
                  <Input
                    id="aut-vence"
                    type="date"
                    min={hoyAR()}
                    value={venceEn}
                    onChange={(e) => setVenceEn(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => resolver("aprobada")} disabled={!!accion}>
                    {accion === "aprobada" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Aprobar
                  </Button>
                  <Button variant="destructive" onClick={() => resolver("rechazada")} disabled={!!accion}>
                    {accion === "rechazada" ? <Loader2 className="animate-spin" /> : <XCircle />}
                    Rechazar
                  </Button>
                </div>
              </div>
            )}

            {/* Cancelación (quien la pidió) */}
            {modo === "profesional" && a.estado === "pendiente" && (
              <div>
                <Button variant="outline" onClick={cancelar} disabled={!!accion}>
                  {accion === "cancelar" ? <Loader2 className="animate-spin" /> : <Ban />}
                  Cancelar solicitud
                </Button>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
