import { useState } from "react"
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
  const ROL_LABEL: Record<string, string> = {
    admin: "Administrador/a",
    profesional: "Profesional",
    recepcion: "Recepción",
    auditor: "Auditoría",
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
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
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle asChild>
                  <Logo to="/dashboard" />
                </SheetTitle>
              </SheetHeader>
              {/* Con muchos enlaces la lista scrollea sola y el pie (cerrar sesión) queda fijo. */}
              <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4">
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
                        "inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <LifeBuoy className="size-4" /> Ayuda
                </a>
              </nav>
              <div className="mt-auto border-t border-border p-4">
                <p className="mb-2 truncate px-1 text-xs text-muted-foreground">
                  {user?.email}
                </p>
                {user?.perfiles?.includes("paciente") && (
                  <Button variant="ghost" className="mb-2 w-full" onClick={entrarComoPaciente}>
                    <UserRound /> Entrar como paciente
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleLogout}
                >
                  <LogOut /> Cerrar sesión
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
