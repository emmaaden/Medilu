import { useState } from "react"
import { Link, NavLink } from "react-router-dom"
import { Menu, LifeBuoy, LayoutDashboard, CalendarClock, LogOut } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet"
import { Logo } from "./Logo"
import { NAV_LINKS, HELP_URL } from "@/lib/site"
import { useUser } from "@/hooks/useUser"
import { api } from "@/lib/api"
import { ThemeToggle } from "@/components/site/ThemeToggle"

function DesktopLink({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
          isActive && "text-foreground"
        )
      }
    >
      {label}
    </NavLink>
  )
}

export function Navbar() {
  const [open, setOpen] = useState(false)
  const { user } = useUser()

  // Recarga completa al salir: así se limpia el estado de sesión de toda la página.
  async function cerrarSesion() {
    try {
      await api.post("/auth/logout")
    } catch {
      /* ignorar: igual se recarga sin sesión */
    }
    window.location.assign("/")
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />

        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((l) => (
            <DesktopLink key={l.to} {...l} />
          ))}
          <a
            href={HELP_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Ayuda
            <span className="sr-only"> por WhatsApp (se abre en una pestaña nueva)</span>
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <>
                {user.role === "paciente" ? (
                  <Button asChild size="lg">
                    <Link to="/mis-turnos">
                      <CalendarClock />
                      Mis turnos
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="lg">
                    <a href="/dashboard">
                      <LayoutDashboard />
                      Ir al panel
                    </a>
                  </Button>
                )}
                <Button variant="ghost" size="lg" onClick={cerrarSesion}>
                  <LogOut />
                  Cerrar sesión
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="lg">
                  <Link to="/login">Iniciar sesión</Link>
                </Button>
                <Button asChild size="lg">
                  <Link to="/register">Crear cuenta</Link>
                </Button>
              </>
            )}
          </div>

          {/* Menú móvil */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="outline" size="icon" aria-label="Abrir menú">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle asChild>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <nav
                aria-label="Principal"
                className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4"
              >
                {/* Sin <SheetClose asChild>: su Slot convierte el className-función de
                    NavLink en texto y el enlace se queda sin estilos. */}
                {NAV_LINKS.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === "/"}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        isActive && "bg-accent text-accent-foreground"
                      )
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
                <a
                  href={HELP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  <LifeBuoy className="size-4" aria-hidden /> Ayuda
                  <span className="sr-only"> por WhatsApp (se abre en una pestaña nueva)</span>
                </a>
              </nav>
              <div className="mt-auto flex flex-col gap-2 border-t border-border p-4">
                {user ? (
                  <>
                    {user.role === "paciente" ? (
                      <SheetClose asChild>
                        <Button asChild size="lg" className="w-full">
                          <Link to="/mis-turnos">Mis turnos</Link>
                        </Button>
                      </SheetClose>
                    ) : (
                      <Button asChild size="lg" className="w-full">
                        <a href="/dashboard">Ir al panel</a>
                      </Button>
                    )}
                    <Button variant="outline" size="lg" className="w-full" onClick={cerrarSesion}>
                      <LogOut /> Cerrar sesión
                    </Button>
                  </>
                ) : (
                  <>
                    <SheetClose asChild>
                      <Button asChild variant="outline" size="lg" className="w-full">
                        <Link to="/login">Iniciar sesión</Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild size="lg" className="w-full">
                        <Link to="/register">Crear cuenta</Link>
                      </Button>
                    </SheetClose>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
