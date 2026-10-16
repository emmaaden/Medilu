import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { toast } from "sonner"
import {
  CalendarClock,
  CalendarPlus,
  Loader2,
  Trash2,
  User,
  Pencil,
  FileText,
  FileCheck2,
  FolderHeart,
  Stethoscope,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { useUser } from "@/hooks/useUser"
import { cambiarPerfil } from "@/lib/perfil"

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

export default function MisTurnos() {
  const { user, loading: loadingUser } = useUser()
  const [turnos, setTurnos] = useState<Turno[] | null>(null)
  const [toCancel, setToCancel] = useState<Turno | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const esPaciente = user?.role === "paciente"

  useEffect(() => {
    if (!esPaciente) return
    api
      .get<Turno[]>("/api/turnos/mios")
      .then((d) => setTurnos(Array.isArray(d) ? d : []))
      .catch(() => {
        toast.error("No se pudieron cargar tus turnos.")
        setTurnos([])
      })
  }, [esPaciente])

  // Gating por rol: mientras carga la sesión, spinner; si no es paciente, al login.
  if (loadingUser) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }
  // Fase O: cuenta del equipo que además es paciente, sin perfil elegido todavía.
  if (user?.needsProfileSelection) {
    return <Navigate to="/elegir-perfil" replace />
  }
  if (!user || !esPaciente) {
    return <Navigate to="/login" replace />
  }

  async function irAlPanel() {
    try {
      window.location.assign(await cambiarPerfil("staff"))
    } catch {
      toast.error("No se pudo cambiar de perfil.")
    }
  }

  const ahora = Date.now()
  const proximos = (turnos || []).filter(
    (t) => t.estado === "reservado" && new Date(t.inicio).getTime() >= ahora
  )
  const pasados = (turnos || []).filter(
    (t) => t.estado === "cancelado" || new Date(t.inicio).getTime() < ahora
  )

  async function cancelar() {
    if (!toCancel) return
    setCancelling(true)
    try {
      await api.post(`/api/turnos/${toCancel.id}/cancelar`)
      toast.success("Turno cancelado.")
      setTurnos((list) =>
        (list || []).map((t) =>
          t.id === toCancel.id ? { ...t, estado: "cancelado" } : t
        )
      )
      setToCancel(null)
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
        eyebrow="Mi cuenta"
        title="Mis turnos"
        description="Consultá y cancelá tus turnos. Tus datos están asociados a tu cuenta."
      />

      <Container className="py-12">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Datos del paciente + accesos */}
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <User className="size-6" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {user.fullName || user.email}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/mi-perfil">
                    <Pencil /> Mis datos
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/mi-historia">
                    <FileText /> Mi historia clínica
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/mis-certificados">
                    <FileCheck2 /> Mis certificados
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/mis-estudios">
                    <FolderHeart /> Mis estudios
                  </Link>
                </Button>
                {user.perfiles?.includes("staff") && (
                  <Button variant="outline" size="sm" onClick={irAlPanel}>
                    <Stethoscope /> Ir a mi panel de trabajo
                  </Button>
                )}
                <Button asChild size="sm" className="sm:ml-auto">
                  <Link to="/turnos">
                    <CalendarPlus /> Pedir turno
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {turnos === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Próximos */}
              <section>
                <h2 className="mb-3 text-lg font-semibold">Próximos turnos</h2>
                {proximos.length ? (
                  <ul className="space-y-3">
                    {proximos.map((t) => (
                      <li key={t.id}>
                        <Card>
                          <CardContent className="flex items-center gap-4 p-4">
                            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                              <CalendarClock className="size-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium capitalize">
                                {formatFecha(t.inicio)} hs
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {[t.especialidad, t.profesional_nombre]
                                  .filter(Boolean)
                                  .join(" · ") || "Turno reservado"}
                              </p>
                            </div>
                            <Button
                              variant="destructive"
                              size="icon"
                              aria-label="Cancelar turno"
                              className="ml-auto"
                              onClick={() => setToCancel(t)}
                            >
                              <Trash2 />
                            </Button>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        No tenés turnos próximos.
                      </p>
                      <Button asChild className="mt-4">
                        <Link to="/turnos">
                          <CalendarPlus /> Reservar un turno
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </section>

              {/* Historial */}
              {pasados.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-semibold">Historial</h2>
                  <ul className="space-y-2">
                    {pasados.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm"
                      >
                        <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                        <span className="capitalize text-muted-foreground">
                          {formatFecha(t.inicio)} hs
                        </span>
                        {t.estado === "cancelado" && (
                          <Badge variant="destructive" className="ml-auto">
                            Cancelado
                          </Badge>
                        )}
                        {t.estado === "atendido" && (
                          <Badge variant="outline" className="ml-auto">
                            Atendido
                          </Badge>
                        )}
                        {t.estado === "ausente" && (
                          <Badge variant="secondary" className="ml-auto">
                            No asististe
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </Container>

      <Dialog open={!!toCancel} onOpenChange={(o) => !o && setToCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar turno</DialogTitle>
            <DialogDescription>
              {toCancel
                ? `¿Seguro que querés cancelar el turno del ${formatFecha(toCancel.inicio)} hs?`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setToCancel(null)}
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
