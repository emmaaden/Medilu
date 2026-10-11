import { Link } from "react-router-dom"
import { cn } from "cn"

/**
 * Isotipo «Turno»: tres módulos de agenda y un círculo (el turno reservado). Geometría
 * en una grilla de 64 u (módulo 28 · separación 8) que cae en píxeles enteros a 16 y 32 px.
 * Fuente de verdad: AgendaSalud-Branding/logo/agenda-salud-isotipo.svg.
 */
export function Isotipo({
  className,
  inverted = false,
}: {
  className?: string
  /** Sobre fondo `bg-primary`: módulos en `primary-foreground`. */
  inverted?: boolean
}) {
  const modulo = inverted ? "fill-primary-foreground" : "fill-primary"
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      focusable="false"
      className={cn("shrink-0", className)}
    >
      <path
        className={modulo}
        d="M13 0H25A3 3 0 0 1 28 3V25A3 3 0 0 1 25 28H3A3 3 0 0 1 0 25V13A13 13 0 0 1 13 0Z"
      />
      <path
        className={modulo}
        d="M3 36H25A3 3 0 0 1 28 39V61A3 3 0 0 1 25 64H13A13 13 0 0 1 0 51V39A3 3 0 0 1 3 36Z"
      />
      <path
        className={modulo}
        d="M39 36H61A3 3 0 0 1 64 39V51A13 13 0 0 1 51 64H39A3 3 0 0 1 36 61V39A3 3 0 0 1 39 36Z"
      />
      <circle
        className={inverted ? "fill-turno-on-primary" : "fill-turno"}
        cx="50"
        cy="14"
        r="14"
      />
    </svg>
  )
}

export function Logo({
  className,
  to = "/",
  inverted = false,
}: {
  className?: string
  to?: string
  /** Versión para fondo `bg-primary` (aside del login). */
  inverted?: boolean
}) {
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex items-center gap-1.5 font-heading text-xl font-semibold tracking-tight",
        inverted ? "text-primary-foreground" : "text-foreground",
        className
      )}
    >
      {/* isotipo = 1,5 × altura de mayúscula; separación = 0,62 módulo (manual de marca) */}
      <Isotipo inverted={inverted} className="size-5.5" />
      <span>
        Medi<span className={inverted ? undefined : "text-primary"}>lu</span>
      </span>
    </Link>
  )
}
