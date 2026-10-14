import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  CalendarDays,
  UserCog,
  ClipboardList,
  ArrowRight,
  Building2,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Container } from "@/components/site/Section"
import { ObservacionesAuditoria } from "@/components/dashboard/ObservacionesAuditoria"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { ESTADO_LABEL, tieneFeature } from "@/lib/planes"

type ClinicaInfo = {
  esAdmin?: boolean
  clinica?: { nombre?: string; slug?: string; turnos_online?: boolean }
}

const accesos = [
  {
    to: "/dashboard/registro-clinico",
    icon: ClipboardList,
    title: "Registro clínico",
    description: "Registrá pacientes y cargá nuevas consultas.",
  },
  {
    to: "/dashboard/config",
    icon: CalendarDays,
    title: "Calendario y horarios",
    description: "Gestioná tu disponibilidad y tu agenda.",
  },
  {
    to: "/dashboard/config",
    icon: UserCog,
    title: "Mi perfil",
    description: "Actualizá tus datos, descripción y horarios.",
  },
]

export default function DashboardHome() {
  const { user } = useAuth()
  const [nombre, setNombre] = useState("")
  const [clinica, setClinica] = useState<ClinicaInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (user?.id) {
      api
        .post<{ nombre?: string; apellido?: string }>(
          "/profesional/get-datos-prof",
          { user_id: user.id }
        )
        .then((d) =>
          setNombre([d.nombre, d.apellido].filter(Boolean).join(" "))
        )
        .catch(() => {})
    }

    api
      .get<ClinicaInfo>("/clinica/info")
      .then((info) => setClinica(info))
      .catch(() => {})
  }, [user?.id])

  const slug = clinica?.clinica?.slug
  const publicLink = slug
    ? `${window.location.origin}/turnos?clinica=${encodeURIComponent(slug)}`
    : ""

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(publicLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No se pudo copiar el enlace.")
    }
  }

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          Te damos la bienvenida{nombre ? `, ${nombre}` : ""}
        </h1>
        <p className="mt-1 text-muted-foreground">
          Gestioná tu consultorio desde un solo lugar.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {accesos.map((a) => (
          <Link key={a.title} to={a.to} className="group">
            <Card className="h-full transition-[translate,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:ring-primary/40 motion-reduce:group-hover:translate-y-0">
              <CardContent className="flex h-full flex-col p-6">
                <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <a.icon className="size-6" />
                </div>
                <h2 className="mt-4 text-lg font-semibold">{a.title}</h2>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">
                  {a.description}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  Abrir <ArrowRight className="size-4" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Fase J: observaciones de auditoría sobre mis registros (si hay). */}
      {tieneFeature(user?.plan, "auditoria") && <ObservacionesAuditoria />}

      {clinica?.esAdmin && (
        <Card className="mt-8">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Gestión de la clínica</h2>
                <p className="text-sm text-muted-foreground">
                  {clinica.clinica?.nombre || "—"}
                  {user?.plan?.nombre
                    ? ` · Plan ${user.plan.nombre} (${ESTADO_LABEL[user.plan.estado].toLowerCase()})`
                    : ""}
                </p>
              </div>
            </div>

            {/* Fase N2: con los turnos online apagados el enlace no sirve para reservar. */}
            {publicLink && clinica.clinica?.turnos_online === false && (
              <p className="mt-5 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="status">
                Tu clínica no está recibiendo turnos online. Podés activarlos desde{" "}
                <Link to="/dashboard/admin" className="font-medium text-primary underline-offset-4 hover:underline">
                  Administración
                </Link>
                .
              </p>
            )}
            {publicLink && clinica.clinica?.turnos_online !== false && (
              <div className="mt-5">
                <label className="text-sm font-medium">
                  Enlace público de turnos
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    readOnly
                    value={publicLink}
                    className="h-10 w-full rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
                  />
                  <Button variant="outline" size="lg" onClick={copiarLink}>
                    {copied ? <Check /> : <Copy />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 text-primary" />
                <span className="font-medium">Profesionales, códigos de activación y plan</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/dashboard/plan">Plan</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/dashboard/admin">
                    Administración <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </Container>
  )
}
