import { Link } from "react-router-dom"
import { Mail, MessageCircle } from "lucide-react"
import { Logo } from "./Logo"
import { AvisoDatosPersonales } from "@/components/form/Consentimiento"
import {
  BUSINESS,
  CONTACT_EMAIL,
  DEFENSA_CONSUMIDOR_TEXTO,
  DEFENSA_CONSUMIDOR_URL,
  WHATSAPP_URL,
  datoNegocio,
} from "@/lib/site"

const columns = [
  {
    title: "Producto",
    links: [
      { to: "/turnos", label: "Reservar turno" },
      { to: "/planes", label: "Planes" },
      { to: "/mi-historia", label: "Mi historia clínica" },
    ],
  },
  {
    title: "Cuenta",
    links: [
      { to: "/login", label: "Iniciar sesión" },
      { to: "/register/paciente", label: "Registro de paciente" },
      { to: "/register/profesional", label: "Registro profesional" },
      { to: "/reportar-suplantacion", label: "Reportar suplantación de identidad" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/terminos", label: "Términos y condiciones" },
      { to: "/privacidad", label: "Política de privacidad" },
      { to: "/cookies", label: "Política de cookies" },
      { to: "/reembolsos", label: "Política de reembolsos" },
      { to: "/arrepentimiento", label: "Botón de arrepentimiento" },
      { to: "/baja", label: "Botón de baja de servicio" },
      { to: "/accesibilidad", label: "Accesibilidad" },
    ],
  },
]

const NUEVA_PESTANA = <span className="sr-only"> (se abre en una pestaña nueva)</span>

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3 sm:col-span-2 md:col-span-1">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Turnos online, historia clínica digital y gestión para profesionales
            de la salud.
          </p>
          <div className="flex flex-col gap-2 pt-1 text-sm">
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <MessageCircle className="size-4" aria-hidden /> WhatsApp {BUSINESS.telefono}
              {NUEVA_PESTANA}
            </a>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex items-center gap-2 break-all text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="size-4 shrink-0" aria-hidden /> {CONTACT_EMAIL}
            </a>
          </div>
        </div>

        {columns.map((col) => (
          <nav key={col.title} aria-labelledby={`footer-${col.title}`}>
            <h2 id={`footer-${col.title}`} className="mb-3 text-sm font-semibold text-foreground">
              {col.title}
            </h2>
            <ul className="space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.to}>
                  <Link
                    to={l.to}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="border-t border-border">
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <p>
            © {new Date().getFullYear()} {BUSINESS.marca}. Titular: {BUSINESS.titular} ·
            CUIT {datoNegocio(BUSINESS.cuit)} · Domicilio: {datoNegocio(BUSINESS.domicilio)}
          </p>
          <p>
            <a
              href={DEFENSA_CONSUMIDOR_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-foreground underline underline-offset-2"
            >
              {DEFENSA_CONSUMIDOR_TEXTO}
              {NUEVA_PESTANA}
            </a>
          </p>
          <AvisoDatosPersonales />
        </div>
      </div>
    </footer>
  )
}
