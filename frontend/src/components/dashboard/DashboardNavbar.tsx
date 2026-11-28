import { useCallback, useRef, useState } from "react"
import { Link, NavLink, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Menu,
  LayoutDashboard,
  Settings,
  ClipboardList,
  LifeBuoy,
  LogOut,
  User,
  Building2,
  ArrowLeftRight,
  ShieldCheck,
  FileCheck2,
  FolderDown,
  FolderHeart,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  ShieldPlus,
  CreditCard,
  Gauge,
  UserRound,
  KeyRound,
  CirclePlus,
  HousePlus,
  Eye,
} from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CambiarContrasenaForm } from "@/components/form/CambiarContrasena"
import { UnirseClinicaForm } from "@/components/form/UnirseClinica"
import { CrearConsultorioForm } from "@/components/form/CrearConsultorio"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Logo } from "@/components/site/Logo"
import { HELP_URL } from "@/lib/site"
import { useAuth } from "@/contexts/AuthContext"
import { ThemeToggle } from "@/components/site/ThemeToggle"
import { NotificacionesMenu } from "@/components/dashboard/NotificacionesMenu"
import { VistaBanner } from "@/components/VistaBanner"
import { VerComoDialog } from "@/components/VerComoDialog"
import { ESTADO_LABEL, tieneFeature, type Feature } from "@/lib/planes"
import { cambiarPerfil } from "@/lib/perfil"

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end: boolean
  /** Fase L: función del plan que habilita el enlace (sin ella no se muestra). */
  feature?: Feature
}

// Enlace de gestión de turnos (Fase E): lo ve todo el staff.
const TURNOS_LINK: NavItem = {
  to: "/dashboard/turnos",
  label: "Turnos",
  icon: CalendarClock,
  end: false,
}

const LINKS: NavItem[] = [
  { to: "/dashboard", label: "Inicio", icon: LayoutDashboard, end: true },
  TURNOS_LINK,
  { to: "/dashboard/config", label: "Configuración", icon: Settings, end: false },
  {
    to: "/dashboard/registro-clinico",
    label: "Registro clínico",
    icon: ClipboardList,
    end: false,
  },
  {
    to: "/dashboard/certificados",
    label: "Certificados",
    icon: FileCheck2,
    end: false,
  },
  {
    to: "/dashboard/historias",
    label: "Historias",
    icon: FolderDown,
    end: false,
  },
  {
    to: "/dashboard/estudios",
    label: "Compartidos",
    icon: FolderHeart,
    end: false,
  },
  // Fase K: autorizaciones previas de prácticas.
  {
    to: "/dashboard/autorizaciones",
    label: "Autorizaciones",
    icon: ShieldPlus,
    end: false,
    feature: "autorizaciones",
  },
]

// Fase J: panel de auditoría médica (auditor y admin de la clínica activa).
const AUDITORIA_LINK: NavItem = {
  to: "/dashboard/auditoria",
  label: "Auditoría",
  icon: ClipboardCheck,
  end: false,
  feature: "auditoria",
}

// Enlace solo para el admin de la clínica activa (Fase B).
const ADMIN_LINK: NavItem = {
  to: "/dashboard/admin",
  label: "Administración",
  icon: ShieldCheck,
  end: false,
}

// Fase L: plan y uso de la clínica (admin) y panel de la plataforma (equipo interno).
const PLAN_LINK: NavItem = {
  to: "/dashboard/plan",
  label: "Plan",
  icon: CreditCard,
  end: false,
}

const PLATAFORMA_LINK: NavItem = {
  to: "/dashboard/plataforma",
  label: "Plataforma",
  icon: Gauge,
  end: false,
}

// La barra vive dentro de un contenedor de 1152 px como máximo, así que los ocho
// enlaces con etiqueta nunca entran: los tres de uso diario quedan a la vista y el
// resto se agrupa en "Más".
const PRINCIPALES = ["/dashboard", "/dashboard/turnos", "/dashboard/registro-clinico"]

export function DashboardNavbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [cambiarPass, setCambiarPass] = useState(false)
  const [unirse, setUnirse] = useState(false)
  const [consultorio, setConsultorio] = useState(false)
  const [verComo, setVerComo] = useState(false)
  const [hayMasAbajo, setHayMasAbajo] = useState(false)

  // Menú móvil: detecta si quedan enlaces por debajo del borde visible para mostrar el aviso.
  const navEl = useRef<HTMLElement | null>(null)
  const medirNav = useCallback(() => {
    const el = navEl.current
    if (!el) return
    setHayMasAbajo(el.scrollHeight - el.scrollTop - el.clientHeight > 8)
  }, [])
  // Callback ref: el Sheet monta el contenido recién al abrirse (portal), así que se mide
  // ahí y cada vez que cambia el alto (p. ej. al desplegar "Mi cuenta").
  const observer = useRef<ResizeObserver | null>(null)
  const navRef = useCallback(
    (el: HTMLElement | null) => {
      observer.current?.disconnect()
      navEl.current = el
      if (!el) return
      observer.current = new ResizeObserver(medirNav)
      observer.current.observe(el)
      medirNav()
    },
    [medirNav]
  )

  // Fase E: la recepción SOLO ve el panel de turnos. Fase J: el auditor, solo el suyo
  // (aunque el plan ya no lo incluya: la página le explica por qué).
  // Fase L: el resto de los enlaces se filtra por las funciones del plan.
  const porRol =
    user?.rol === "recepcion"
      ? [TURNOS_LINK]
      : user?.rol === "auditor"
        ? [AUDITORIA_LINK]
        : user?.esAdmin
          ? [...LINKS, AUDITORIA_LINK, ADMIN_LINK, PLAN_LINK]
          : LINKS
  const links = [
    ...(porRol.length === 1
      ? porRol
      : porRol.filter((l) => !l.feature || tieneFeature(user?.plan, l.feature))),
    ...(user?.esPlataforma ? [PLATAFORMA_LINK] : []),
  ]

  // Con un único enlace (recepción, auditoría) va siempre a la vista.
  const esPrincipal = (to: string) => links.length === 1 || PRINCIPALES.includes(to)
  const principales = links.filter((l) => esPrincipal(l.to))
  const secundarios = links.filter((l) => !esPrincipal(l.to))

  async function handleLogout() {
    await logout()
    navigate("/login")
  }

  // Fase O: la cuenta también es paciente (en esta u otra clínica).
  async function entrarComoPaciente() {
    try {
      window.location.assign(await cambiarPerfil("paciente"))
    } catch {
      toast.error("No se pudo cambiar de perfil.")
    }
  }

  const initials =
    (user?.fullName || user?.email || "?")
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"

  // Fase A: clínica activa y posibilidad de cambiar (si pertenece a varias).
  const clinicaActiva = user?.clinicas?.find(
    (c) => c.clinicaId === user?.clinicaId
  )
  const puedeCambiarClinica = (user?.clinicas?.length ?? 0) > 1
  // Fase U: un profesional puede sumarse a otra clínica con un código de activación.
  const puedeUnirse = user?.role === "profesional" && user?.rol !== "auditor"
  const ROL_LABEL: Record<string, string> = {
    admin: "Administrador/a",
    profesional: "Profesional",
    recepcion: "Recepción",
    auditor: "Auditoría",
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      {/* Fase Z: "Ver como" activo (solo la plataforma). */}
      <VistaBanner vista={user?.vista} />
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Logo to="/dashboard" />
          <nav className="hidden items-center gap-1 lg:flex">
            {principales.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                    isActive && "bg-accent text-accent-foreground"
                  )
                }
              >
                <l.icon className="size-4" />
                {l.label}
              </NavLink>
            ))}
            {secundarios.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                  >
                    Más <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  {secundarios.map((l) => (
                    <DropdownMenuItem key={l.to} asChild>
                      <NavLink to={l.to} end={l.end}>
                        <l.icon /> {l.label}
                      </NavLink>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {/* Fase AB: centro de notificaciones (turnos online, datos por link…). */}
          <NotificacionesMenu />
          <ThemeToggle />
          <div className="hidden items-center gap-2 lg:flex">
            <Button asChild variant="ghost" size="sm">
              <a href={HELP_URL} target="_blank" rel="noreferrer">
                <LifeBuoy /> Ayuda
              </a>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {initials}
                  </span>
                  <span className="max-w-[12ch] truncate">
                    {user?.fullName || user?.email}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="truncate">
                  {user?.email}
                </DropdownMenuLabel>
                {clinicaActiva && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <Building2 className="size-3.5 text-muted-foreground" />
                        <span className="truncate">{clinicaActiva.nombre}</span>
                      </p>
                      <p className="mt-0.5 pl-5 text-xs text-muted-foreground">
                        {ROL_LABEL[clinicaActiva.rol] ?? clinicaActiva.rol}
                        {user?.plan?.nombre
                          ? ` · Plan ${user.plan.nombre} (${ESTADO_LABEL[user.plan.estado].toLowerCase()})`
                          : ""}
                      </p>
                    </div>
                    {puedeCambiarClinica && (
                      <DropdownMenuItem asChild>
                        <Link to="/seleccionar-clinica?cambiar=1">
                          <ArrowLeftRight /> Cambiar de clínica
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {puedeUnirse && (
                      <>
                        <DropdownMenuItem onSelect={() => setUnirse(true)}>
                          <CirclePlus /> Sumarme a otra clínica
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setConsultorio(true)}>
                          <HousePlus /> Crear mi consultorio
                        </DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
                <DropdownMenuSeparator />
                {user?.rol !== "auditor" && (
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard/config">
                      <User /> Mi perfil
                    </Link>
                  </DropdownMenuItem>
                )}
                {user?.perfiles?.includes("paciente") && (
                  <DropdownMenuItem onSelect={entrarComoPaciente}>
                    <UserRound /> Entrar como paciente
                  </DropdownMenuItem>
                )}
                {user?.esPlataforma && (
                  <DropdownMenuItem onSelect={() => setVerComo(true)}>
                    <Eye /> Ver como…
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => setCambiarPass(true)}>
                  <KeyRound /> Cambiar contraseña
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleLogout} variant="destructive">
                  <LogOut /> Cerrar sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Móvil */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="outline" size="icon" aria-label="Abrir menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 gap-0">
              <SheetHeader>
                <SheetTitle asChild>
                  <Logo to="/dashboard" />
                </SheetTitle>
              </SheetHeader>
              {/* La navegación se lleva todo el alto disponible; si igual no entra, scrollea
                  y un degradado con "Más opciones" avisa que hay enlaces abajo. */}
              <div className="relative flex min-h-0 flex-1 flex-col">
                <nav
                  ref={navRef}
                  onScroll={medirNav}
                  className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-4 pb-4"
                >
                  {/* Sin <SheetClose asChild>: su Slot convierte el className-función de
                      NavLink en texto y el enlace se queda sin estilos. */}
                  {links.map((l) => (
                    <NavLink
                      key={l.to}
                      to={l.to}
                      end={l.end}
                      onClick={() => setOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                          isActive && "bg-accent text-accent-foreground"
                        )
                      }
                    >
                      <l.icon className="size-4" />
                      {l.label}
                    </NavLink>
                  ))}
                  <a
                    href={HELP_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    <LifeBuoy className="size-4" /> Ayuda
                  </a>
                </nav>
                {hayMasAbajo && (
                  <button
                    type="button"
                    onClick={() =>
                      navEl.current?.scrollBy({ top: navEl.current.clientHeight * 0.7, behavior: "smooth" })
                    }
                    className="absolute inset-x-0 bottom-0 flex h-14 items-end justify-center bg-gradient-to-t from-popover via-popover/90 to-transparent pb-1.5 text-xs font-medium text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-1">
                      Más opciones <ChevronDown className="size-3.5 animate-bounce" />
                    </span>
                  </button>
                )}
              </div>

              {/* Cuenta compacta: una sola fila con la persona y la clínica; las acciones
                  de la cuenta se despliegan al tocarla. Cerrar sesión queda siempre visible. */}
              <div className="border-t border-border px-4 pt-2 pb-4">
                <Accordion type="single" collapsible>
                  <AccordionItem value="cuenta">
                    <AccordionTrigger className="items-center gap-3 px-1 hover:no-underline">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                        {initials}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">
                          {clinicaActiva?.nombre ?? (user?.fullName || user?.email)}
                        </span>
                        <span className="truncate text-xs font-normal text-muted-foreground">
                          {clinicaActiva
                            ? `${ROL_LABEL[clinicaActiva.rol] ?? clinicaActiva.rol} · Mi cuenta`
                            : "Mi cuenta"}
                        </span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="flex flex-col gap-0.5 pb-1 [&_a]:no-underline">
                      <span className="truncate px-1 pb-1 text-xs text-muted-foreground">
                        {user?.email}
                      </span>
                      {puedeCambiarClinica && (
                        <Button asChild variant="ghost" className="w-full justify-start">
                          <Link to="/seleccionar-clinica?cambiar=1" onClick={() => setOpen(false)}>
                            <ArrowLeftRight /> Cambiar de clínica
                          </Link>
                        </Button>
                      )}
                      {user?.rol !== "auditor" && (
                        <Button asChild variant="ghost" className="w-full justify-start">
                          <Link to="/dashboard/config" onClick={() => setOpen(false)}>
                            <User /> Mi perfil
                          </Link>
                        </Button>
                      )}
                      {user?.perfiles?.includes("paciente") && (
                        <Button variant="ghost" className="w-full justify-start" onClick={entrarComoPaciente}>
                          <UserRound /> Entrar como paciente
                        </Button>
                      )}
                      {user?.esPlataforma && (
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => {
                            setOpen(false)
                            setVerComo(true)
                          }}
                        >
                          <Eye /> Ver como…
                        </Button>
                      )}
                      {puedeUnirse && (
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => {
                            setOpen(false)
                            setUnirse(true)
                          }}
                        >
                          <CirclePlus /> Sumarme a otra clínica
                        </Button>
                      )}
                      {puedeUnirse && (
                        <Button
                          variant="ghost"
                          className="w-full justify-start"
                          onClick={() => {
                            setOpen(false)
                            setConsultorio(true)
                          }}
                        >
                          <HousePlus /> Crear mi consultorio
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          setOpen(false)
                          setCambiarPass(true)
                        }}
                      >
                        <KeyRound /> Cambiar contraseña
                      </Button>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <Button variant="outline" className="mt-2 w-full" onClick={handleLogout}>
                  <LogOut /> Cerrar sesión
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      <VerComoDialog open={verComo} onOpenChange={setVerComo} vista={user?.vista ?? null} />

      <Dialog open={cambiarPass} onOpenChange={setCambiarPass}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar contraseña</DialogTitle>
            <DialogDescription>Para confirmar que sos vos, ingresá tu contraseña actual.</DialogDescription>
          </DialogHeader>
          <CambiarContrasenaForm onDone={() => setCambiarPass(false)}>
            <Button type="button" variant="outline" onClick={() => setCambiarPass(false)}>
              Cancelar
            </Button>
          </CambiarContrasenaForm>
        </DialogContent>
      </Dialog>

      <Dialog open={unirse} onOpenChange={setUnirse}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sumarme a otra clínica</DialogTitle>
            <DialogDescription>
              Ingresá el código de activación que te dio el administrador de la otra clínica.
              Vas a seguir en esta y podés cambiar de clínica cuando quieras.
            </DialogDescription>
          </DialogHeader>
          <UnirseClinicaForm>
            <Button type="button" variant="outline" onClick={() => setUnirse(false)}>
              Cancelar
            </Button>
          </UnirseClinicaForm>
        </DialogContent>
      </Dialog>

      <Dialog open={consultorio} onOpenChange={setConsultorio}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear mi consultorio</DialogTitle>
            <DialogDescription>
              Tu propio espacio para atender por tu cuenta, con su agenda y sus pacientes.
              Arranca con 14 días de prueba gratis y después lo pagás vos; las clínicas donde ya
              atendés no cambian.
            </DialogDescription>
          </DialogHeader>
          <CrearConsultorioForm>
            <Button type="button" variant="outline" onClick={() => setConsultorio(false)}>
              Cancelar
            </Button>
          </CrearConsultorioForm>
        </DialogContent>
      </Dialog>
    </header>
  )
}
