import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Loader2, UserRound, Stethoscope, ChevronRight, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/site/Logo"
import { api, ApiError } from "@/lib/api"
import { cambiarPerfil, type Perfil } from "@/lib/perfil"

type PerfilesResponse = {
  activo: Perfil | null
  staff: { role: string; clinicas: string[] } | null
  paciente: { clinicas: string[] } | null
}

const ROLE_LABEL: Record<string, string> = {
  profesional: "Profesional",
  recepcion: "Recepción",
  auditor: "Auditoría",
}

type Opcion = { perfil: Perfil; titulo: string; detalle: string; icon: LucideIcon }

/** Fase O: la cuenta es del equipo de una clínica y además paciente → elegir con cuál entrar. */
export default function ElegirPerfil() {
  const navigate = useNavigate()
  const [opciones, setOpciones] = useState<Opcion[] | null>(null)
  const [activo, setActivo] = useState<Perfil | null>(null)
  const [eligiendo, setEligiendo] = useState<Perfil | null>(null)

  useEffect(() => {
    let active = true
    api
      .get<PerfilesResponse>("/auth/perfiles")
      .then((d) => {
        if (!active) return
        const lista: Opcion[] = []
        if (d.staff) {
          lista.push({
            perfil: "staff",
            titulo: ROLE_LABEL[d.staff.role] ?? "Equipo de la clínica",
            detalle: d.staff.clinicas.join(" · ") || "Tu panel de trabajo",
            icon: Stethoscope,
          })
        }
        if (d.paciente) {
          lista.push({
            perfil: "paciente",
            titulo: "Paciente",
            detalle: d.paciente.clinicas.length
              ? `Tu historia clínica en ${d.paciente.clinicas.join(" · ")}`
              : "Tus turnos, estudios e historia clínica",
            icon: UserRound,
          })
        }
        // Con un solo perfil no hay nada que elegir.
        if (lista.length < 2) {
          navigate(d.paciente ? "/mis-turnos" : "/dashboard", { replace: true })
          return
        }
        setActivo(d.activo)
        setOpciones(lista)
      })
      .catch(() => {
        if (active) navigate("/login", { replace: true })
      })
    return () => {
      active = false
    }
  }, [navigate])

  async function elegir(perfil: Perfil) {
    setEligiendo(perfil)
    try {
      window.location.assign(await cambiarPerfil(perfil))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo elegir el perfil.")
      setEligiendo(null)
    }
  }

  if (!opciones) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted/30">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
          <Logo />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <UserRound className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold">¿Con qué perfil querés entrar?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu cuenta es del equipo de una clínica y además tenés historia clínica como paciente.
            Podés cambiar de perfil cuando quieras.
          </p>
        </div>

        <ul className="space-y-3">
          {opciones.map((o) => {
            const Icon = o.icon
            return (
              <li key={o.perfil}>
                <button
                  type="button"
                  disabled={!!eligiendo}
                  onClick={() => elegir(o.perfil)}
                  className="group flex w-full items-center gap-4 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent disabled:opacity-60"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {o.titulo}
                      {activo === o.perfil && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">(actual)</span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">{o.detalle}</span>
                  </span>
                  {eligiendo === o.perfil ? (
                    <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
                  ) : (
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>

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
      </main>
    </div>
  )
}
