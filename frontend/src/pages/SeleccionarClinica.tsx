import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import { Loader2, Building2, ShieldCheck, Stethoscope, ClipboardList, ClipboardCheck, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Logo } from "@/components/site/Logo"
import { api, ApiError } from "@/lib/api"
import type { CurrentUser, ClinicaMembresia } from "@/hooks/useUser"
import { EleccionSkeleton } from "@/components/site/Skeletons"

const ROL_META: Record<
  ClinicaMembresia["rol"],
  { label: string; icon: typeof ShieldCheck }
> = {
  admin: { label: "Administrador/a", icon: ShieldCheck },
  profesional: { label: "Profesional", icon: Stethoscope },
  recepcion: { label: "Recepción", icon: ClipboardList },
  auditor: { label: "Auditoría", icon: ClipboardCheck },
}

export default function SeleccionarClinica() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Modo "cambiar": se llega desde el navbar teniendo ya una clínica activa.
  const cambiar = params.get("cambiar") === "1"
  const [clinicas, setClinicas] = useState<ClinicaMembresia[]>([])
  const [activa, setActiva] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    api
      .get<CurrentUser>("/api/user")
      .then((u) => {
        if (!active) return
        if (u.role === "paciente") {
          navigate("/mis-turnos", { replace: true })
          return
        }
        // Con una sola clínica no hay nada que elegir.
        if ((u.clinicas?.length ?? 0) <= 1) {
          navigate("/dashboard", { replace: true })
          return
        }
        // Ya hay clínica activa y no es un cambio explícito → al panel.
        if (u.clinicaId && !cambiar) {
          navigate("/dashboard", { replace: true })
          return
        }
        setClinicas(u.clinicas)
        setActiva(u.clinicaId)
        setLoading(false)
      })
      .catch(() => {
        if (active) navigate("/login", { replace: true })
      })
    return () => {
      active = false
    }
  }, [navigate, cambiar])

  async function elegir(clinicaId: string) {
    setSelecting(clinicaId)
    try {
      await api.post("/auth/select-clinica", { clinicaId })
      // Navegación completa: la sesión ya tiene la clínica activa fijada.
      window.location.href = "/dashboard"
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "No se pudo seleccionar la clínica."
      toast.error(msg)
      setSelecting(null)
    }
  }

  if (loading) {
    return <EleccionSkeleton logo={<Logo to="/dashboard" />} opciones={3} />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Logo to="/dashboard" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Building2 className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold">
            {cambiar ? "Cambiar de clínica" : "Elegí una clínica"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Trabajás en más de una clínica. Seleccioná con cuál querés operar en esta sesión.
          </p>
        </div>

        <ul className="space-y-3">
          {clinicas.map((c) => {
            const meta = ROL_META[c.rol] ?? ROL_META.profesional
            const Icon = meta.icon
            const isSelecting = selecting === c.clinicaId
            return (
              <li key={c.clinicaId}>
                <button
                  type="button"
                  disabled={!!selecting}
                  onClick={() => elegir(c.clinicaId)}
                  className="group flex w-full items-center gap-4 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:opacity-60"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {c.nombre ?? "Clínica"}
                      </span>
                      {activa === c.clinicaId && (
                        <Badge className="shrink-0 font-normal">Actual</Badge>
                      )}
                    </span>
                    <Badge variant="secondary" className="mt-1 font-normal">
                      {meta.label}
                    </Badge>
                  </span>
                  {isSelecting ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>

        {cambiar ? (
          <Button
            variant="ghost"
            className="mt-6 self-center"
            disabled={!!selecting}
            onClick={() => navigate("/dashboard")}
          >
            Volver al panel
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="mt-6 self-center"
            onClick={async () => {
              await api.post("/auth/logout").catch(() => {})
              navigate("/login")
            }}
          >
            Cerrar sesión
          </Button>
        )}
      </main>
    </div>
  )
}
