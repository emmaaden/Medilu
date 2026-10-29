import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  CalendarClock,
  FileHeart,
  Stethoscope,
  ShieldCheck,
  Clock,
  Smartphone,
  ArrowRight,
  UserPlus,
  CalendarPlus,
  Search,
  ClipboardList,
  LogIn,
  LayoutDashboard,
  } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Container } from "@/components/site/Section"
import { api } from "@/lib/api"
import { useUser } from "@/hooks/useUser"

const features = [
  {
    icon: CalendarClock,
    title: "Turnos online",
    description:
      "Reservá tu consulta online: elegí profesional y horario disponible, y recibí la confirmación por email.",
    to: "/turnos",
    cta: "Pedir turno",
  },
  {
    icon: FileHeart,
    title: "Historia clínica digital",
    description:
      "Consultá tu historial de consultas, diagnósticos y tratamientos de forma segura desde tu cuenta.",
    to: "/mi-historia",
    cta: "Ver mi historia clínica",
  },
  {
    icon: Stethoscope,
    title: "Para profesionales",
    description:
      "Gestioná tu agenda, tus pacientes y tu clínica desde un panel simple y ordenado.",
    to: "/register/profesional",
    cta: "Crear cuenta profesional",
  },
]

const steps = [
  {
    icon: Search,
    title: "Elegí especialidad",
    description: "Buscá el área y el profesional que necesitás.",
  },
  {
    icon: CalendarPlus,
    title: "Seleccioná el horario",
    description: "Mirá los horarios libres del profesional y reservá el tuyo.",
  },
  {
    icon: ClipboardList,
    title: "Recibí la confirmación",
    description: "Te enviamos el detalle del turno por email.",
  },
]

const values = [
  {
    icon: ShieldCheck,
    title: "Acceso controlado",
    description:
      "Tu historia clínica solo la ve el personal autorizado de tu clínica, y queda registrado cada acceso.",
  },
  {
    icon: Clock,
    title: "Sin llamadas",
    description: "Reservá o consultá tus turnos online, sin esperar en el teléfono.",
  },
  {
    icon: Smartphone,
    title: "Desde cualquier dispositivo",
    description: "Funciona en el navegador del celular o de la computadora.",
  },
]

type ProximoTurno = {
  id: number
  inicio: string
  profesional_nombre: string | null
  especialidad: string | null
}

function formatCorto(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

// Contenedor y encabezado de la tarjeta del hero. Van fuera de ProximoTurnoCard
// para que React no los trate como componentes nuevos en cada render.
function HeroShell({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mx-auto max-w-md shadow-xl ring-foreground/5">
      <CardContent className="space-y-4 p-6">{children}</CardContent>
    </Card>
  )
}

function HeroHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
        <CalendarClock className="size-6" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

// Tarjeta del hero. Antes mostraba un turno ficticio a todo el mundo; ahora es
// consciente de la sesión: el paciente logueado ve SU próximo turno real, y quien
// no tiene sesión ve una invitación a entrar o reservar.
function ProximoTurnoCard() {
  const { user, loading } = useUser()
  const [turno, setTurno] = useState<ProximoTurno | null>(null)
  const [loadingTurno, setLoadingTurno] = useState(false)

  const esPaciente = user?.role === "paciente"

  useEffect(() => {
    if (!esPaciente) return
    setLoadingTurno(true)
    api
      .get<{ turno: ProximoTurno | null }>("/api/turnos/proximo")
      .then((d) => setTurno(d?.turno ?? null))
      .catch(() => setTurno(null))
      .finally(() => setLoadingTurno(false))
  }, [esPaciente])

  if (loading || (esPaciente && loadingTurno)) {
    return (
      <HeroShell>
        <HeroHeader title="Próximo turno" subtitle="Cargando…" />
        <div className="space-y-3" role="status" aria-label="Cargando">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-11 w-full" />
        </div>
      </HeroShell>
    )
  }

  // Profesional logueado: atajo al panel.
  if (user && !esPaciente) {
    return (
      <HeroShell>
        <HeroHeader title="Hola de nuevo" subtitle="Tu panel te espera" />
        <Button asChild className="w-full" size="lg">
          <a href="/dashboard">
            <LayoutDashboard /> Ir al panel
          </a>
        </Button>
      </HeroShell>
    )
  }

  // Paciente logueado con un turno próximo real.
  if (esPaciente && turno) {
    return (
      <HeroShell>
        <HeroHeader title="Tu próximo turno" subtitle="Asociado a tu cuenta" />
        <div className="border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            {turno.especialidad || "Consulta"}
          </p>
          <p className="font-medium">
            {turno.profesional_nombre || "Profesional a confirmar"}
          </p>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 capitalize text-foreground">
              <CalendarClock className="size-4 text-primary" />{" "}
              {formatCorto(turno.inicio)} hs
            </span>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              Reservado
            </Badge>
          </div>
        </div>
        <Button asChild className="w-full" size="lg">
          <Link to="/mis-turnos">
            Ver mis turnos <ArrowRight />
          </Link>
        </Button>
      </HeroShell>
    )
  }

  // Paciente logueado sin turnos próximos.
  if (esPaciente) {
    return (
      <HeroShell>
        <HeroHeader title="Tu próximo turno" subtitle="Asociado a tu cuenta" />
        <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
          No tenés turnos próximos.
        </p>
        <Button asChild className="w-full" size="lg">
          <Link to="/turnos">
            <CalendarPlus /> Reservar ahora
          </Link>
        </Button>
      </HeroShell>
    )
  }

  // Sin sesión.
  return (
    <HeroShell>
      <HeroHeader
        title="Tu próximo turno"
        subtitle="Iniciá sesión para verlo acá"
      />
      <p className="text-sm text-muted-foreground">
        Con tu cuenta, tus turnos y tus datos quedan en un solo lugar: los ves y
        los cancelás cuando quieras.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild size="lg" variant="outline">
          <Link to="/login">
            <LogIn /> Iniciar sesión
          </Link>
        </Button>
        <Button asChild size="lg">
          <Link to="/turnos">
            <CalendarPlus /> Pedir turno
          </Link>
        </Button>
      </div>
    </HeroShell>
  )
}

// Solo datos verificables: nada de «100 % online» ni «24/7» (son promesas de
// disponibilidad que no se pueden garantizar ni probar).
// Cantidad real de especialidades con al menos un profesional (misma fuente que
// la página de turnos). Si no se puede obtener, la estadística no se muestra:
// nunca un número inventado.
function useEspecialidadesActivas() {
  const [total, setTotal] = useState<number | null | "error">(null)
  useEffect(() => {
    api
      .get<{ area: string }[]>("/professionals")
      .then((d) => setTotal(Array.isArray(d) ? d.length : "error"))
      .catch(() => setTotal("error"))
  }, [])
  return total
}

function HeroStats() {
  const especialidades = useEspecialidadesActivas()
  const stats: { label: string; value: React.ReactNode }[] = [
    { label: "Reservar es gratis", value: "$0" },
  ]
  if (especialidades === null) {
    stats.push({
      label: "Especialidades",
      value: <Skeleton className="h-8 w-10" aria-label="Cargando" />,
    })
  } else if (especialidades !== "error" && especialidades > 0) {
    stats.push({ label: "Especialidades", value: especialidades })
  }

  return (
    <dl className="mt-10 grid max-w-md grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
      {stats.map((s) => (
        // dt = etiqueta, dd = valor; flex-col-reverse muestra el valor arriba.
        <div key={s.label} className="flex flex-col-reverse">
          <dt className="text-sm text-muted-foreground">{s.label}</dt>
          <dd className="text-2xl font-semibold text-foreground tabular-nums">
            {s.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-accent/60 via-background to-background"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 -z-10 size-[32rem] rounded-full bg-primary/10 blur-3xl"
        />
        <Container className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-primary">
              <span aria-hidden className="size-1.5 rounded-full bg-primary" />
              Salud simple y organizada
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl">
              Tu salud, <span className="text-primary">a un clic</span> de
              distancia
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Reservá turnos online, accedé a tu historia clínica y gestioná tu
              consultorio desde un solo lugar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/turnos">
                  <CalendarPlus />
                  Pedir turno
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/register">
                  <UserPlus />
                  Crear cuenta
                </Link>
              </Button>
            </div>
            <HeroStats />
          </div>

          <div className="relative">
            <ProximoTurnoCard />
          </div>
        </Container>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-4xl">
              Todo lo que necesitás
            </h2>
            <p className="mt-3 text-muted-foreground">
              Una plataforma pensada para pacientes y profesionales de la salud.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="group h-full">
                <CardContent className="flex h-full flex-col p-6">
                  <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <f.icon className="size-6" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">
                    {f.description}
                  </p>
                  <Link
                    to={f.to}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {f.cta} <ArrowRight className="size-4" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* Cómo funciona */}
      <section className="border-y border-border bg-muted/30 py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold sm:text-4xl">Cómo funciona</h2>
            <p className="mt-3 text-muted-foreground">
              Reservar un turno nunca fue tan fácil.
            </p>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="relative text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-background text-primary shadow-sm ring-1 ring-border">
                  <s.icon className="size-7" />
                </div>
                <span className="mt-4 inline-block text-xs font-semibold text-primary">
                  Paso {i + 1}
                </span>
                <h3 className="mt-1 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild size="lg">
              <Link to="/turnos">
                <CalendarPlus />
                Pedir turno
              </Link>
            </Button>
          </div>
        </Container>
      </section>

      {/* Sobre nosotros */}
      <section id="sobrenosotros" className="scroll-mt-20 py-16 sm:py-20">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-primary">Sobre nosotros</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Cerca de tu salud, siempre
            </h2>
            <p className="mt-4 text-muted-foreground">
              Medilu nació para simplificar la relación entre pacientes y
              profesionales: menos llamadas, menos esperas y más tiempo para lo
              que importa. Digitalizamos turnos e historias clínicas con foco en
              la seguridad y la simplicidad.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="outline" size="lg">
                <Link to="/planes">Ver planes</Link>
              </Button>
              <Button asChild variant="ghost" size="lg">
                <Link to="/register/profesional">Crear cuenta profesional</Link>
              </Button>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {values.map((v) => (
              <Card key={v.title} className="h-full">
                <CardContent className="p-5">
                  <v.icon className="size-6 text-primary" />
                  <h3 className="mt-3 font-semibold">{v.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {v.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* CTA final */}
      <section className="pb-20">
        <Container>
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-white/10 blur-2xl"
            />
            <h2 className="relative text-3xl font-semibold sm:text-4xl">
              ¿Listo para empezar?
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-primary-foreground/80">
              Creá tu cuenta de paciente sin costo o reservá tu próximo turno online.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="secondary">
                <Link to="/register">Crear cuenta</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground dark:border-white/30 dark:bg-transparent dark:hover:bg-white/10"
              >
                <Link to="/turnos">Pedir turno</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </>
  )
}
