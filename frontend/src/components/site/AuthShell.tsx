import { Check } from "lucide-react"
import { Logo } from "./Logo"

/**
 * Layout de pantalla partida para páginas de autenticación:
 * panel de marca (aside) + panel de formulario. En móvil solo el formulario.
 */
export function AuthShell({
  title,
  subtitle,
  bullets,
  children,
}: {
  title: string
  subtitle?: string
  bullets?: string[]
  children: React.ReactNode
}) {
  return (
    <div className="grid lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-2">
      {/* Aside de marca */}
      <aside className="relative hidden overflow-hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 size-80 rounded-full bg-white/10 blur-2xl"
        />
        <Logo to="/" inverted className="relative self-start" />
        <div className="relative max-w-md">
          <h2 className="font-heading text-3xl font-semibold leading-tight">
            {title}
          </h2>
          {subtitle && (
            <p className="mt-3 text-primary-foreground/80">{subtitle}</p>
          )}
          {bullets && (
            <ul className="mt-8 space-y-3">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/20">
                    <Check className="size-3.5" />
                  </span>
                  <span className="text-sm text-primary-foreground/90">{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="relative text-xs text-primary-foreground/85">
          © {new Date().getFullYear()} Medilu
        </p>
      </aside>

      {/* Panel de formulario */}
      <div className="flex flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
