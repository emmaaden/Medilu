import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { CalendarClock, Loader2, Trash2, UserPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Container, PageHero } from "@/components/site/Section"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { api, ApiError } from "@/lib/api"
import { SkeletonTarjetas } from "@/components/site/Skeletons"

type Turno = {
  id: number
  inicio: string
  fin: string | null
  estado: "reservado" | "cancelado" | "atendido" | "ausente"
  profesional_nombre: string | null
  especialidad: string | null
  paciente_nombre: string | null
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

export default function GestionarTurno() {
  const [params] = useSearchParams()
  const token = params.get("token") || ""

  const [turno, setTurno] = useState<Turno | null>(null)
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!token) {
      setStatus("error")
      return
    }
    api
      .get<{ turno: Turno }>(
        `/api/turnos/gestionar?token=${encodeURIComponent(token)}`
      )
      .then((d) => {
        setTurno(d.turno)
        setStatus("ok")
      })
      .catch(() => setStatus("error"))
  }, [token])

  async function cancelar() {
    setCancelling(true)
    try {
      await api.post("/api/turnos/gestionar/cancelar", { token })
      toast.success("Turno cancelado.")
      setTurno((t) => (t ? { ...t, estado: "cancelado" } : t))
      setConfirmOpen(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cancelar el turno."
      )
    } finally {
      setCancelling(false)
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Turnos"
        title="Gestionar tu turno"
        description="Desde acá podés ver o cancelar el turno que reservaste."
      />

      <Container className="py-12">
        <div className="mx-auto max-w-lg">
          {status === "loading" && (
            <SkeletonTarjetas cantidad={1} />
          )}

          {status === "error" && (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="font-medium">Enlace inválido o vencido</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No encontramos un turno con este enlace. Revisá el email de
                  confirmación o volvé a reservar.
                </p>
                <Button asChild className="mt-4">
                  <Link to="/turnos">Ir a turnos</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {status === "ok" && turno && (
            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <CalendarClock className="size-6" />
                  </div>
                  <div>
                    <p className="font-medium capitalize">
                      {formatFecha(turno.inicio)} hs
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[turno.especialidad, turno.profesional_nombre]
                        .filter(Boolean)
                        .join(" · ") || "Turno reservado"}
                    </p>
                  </div>
                </div>

                {turno.estado === "cancelado" ? (
                  <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                    Este turno está cancelado.
                  </div>
                ) : turno.estado !== "reservado" ? (
                  <div className="rounded-lg bg-muted px-4 py-3 text-sm font-medium text-muted-foreground">
                    Este turno ya pasó.
                  </div>
                ) : (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setConfirmOpen(true)}
                  >
                    <Trash2 /> Cancelar este turno
                  </Button>
                )}

                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2 font-medium text-foreground">
                    <UserPlus className="size-4 text-primary" /> ¿Querés todo en
                    un solo lugar?
                  </p>
                  <p className="mt-1">
                    Creá una cuenta con tu email y gestioná todos tus turnos sin
                    depender de este enlace.
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/register/paciente">Crear cuenta</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </Container>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar turno</DialogTitle>
            <DialogDescription>
              {turno
                ? `¿Seguro que querés cancelar el turno del ${formatFecha(turno.inicio)} hs?`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={cancelling}
            >
              No, volver
            </Button>
            <Button
              variant="destructive"
              onClick={cancelar}
              disabled={cancelling}
            >
              {cancelling ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Sí, cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
