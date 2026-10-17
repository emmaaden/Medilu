import { useEffect } from "react"
import { useLocation } from "react-router-dom"

/** id del <main> de cada layout: destino del enlace «Saltar al contenido». */
export const MAIN_ID = "contenido"

/**
 * Primer elemento enfocable de la página (WCAG 2.4.1): permite a quien navega con
 * teclado o lector de pantalla saltar el menú. Invisible hasta recibir el foco.
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-3 focus:ring-ring/50"
    >
      Saltar al contenido
    </a>
  )
}

const BASE = "Medilu"

// Título por ruta (WCAG 2.4.2): cada página tiene un <title> propio, que es lo primero
// que anuncia un lector de pantalla al navegar dentro del SPA.
const TITULOS: Record<string, string> = {
  "/": "Turnos y gestión clínica",
  "/turnos": "Reservar turno",
  "/planes": "Planes",
  "/login": "Iniciar sesión",
  "/register": "Crear cuenta",
  "/register/paciente": "Registro de paciente",
  "/register/profesional": "Registro profesional",
  "/register/recepcion": "Registro de recepción",
  "/forgot-password": "Recuperar contraseña",
  "/confirmar-email": "Confirmá tu email",
  "/reset-password": "Nueva contraseña",
  "/mis-turnos": "Mis turnos",
  "/mi-perfil": "Mi perfil",
  "/mi-historia": "Mi historia clínica",
  "/mis-certificados": "Mis certificados",
  "/mis-estudios": "Mis estudios",
  "/gestionar-turno": "Gestionar turno",
  "/seleccionar-clinica": "Seleccionar clínica",
  "/terminos": "Términos y condiciones",
  "/privacidad": "Política de privacidad",
  "/cookies": "Política de cookies",
  "/reembolsos": "Política de reembolsos",
  "/arrepentimiento": "Botón de arrepentimiento",
  "/baja": "Botón de baja de servicio",
  "/reportar-suplantacion": "Reportar suplantación de identidad",
  "/accesibilidad": "Accesibilidad",
  "/dashboard": "Panel",
  "/dashboard/turnos": "Turnos · Panel",
  "/dashboard/config": "Configuración · Panel",
  "/dashboard/registro-clinico": "Registro clínico · Panel",
  "/dashboard/admin": "Administración · Panel",
  "/dashboard/certificados": "Certificados · Panel",
  "/dashboard/historias": "Historias clínicas · Panel",
  "/dashboard/estudios": "Estudios · Panel",
  "/dashboard/auditoria": "Auditoría · Panel",
  "/dashboard/autorizaciones": "Autorizaciones · Panel",
  "/dashboard/plan": "Plan · Panel",
  "/dashboard/plataforma": "Plataforma · Panel",
}

/** Actualiza document.title según la ruta actual. Montar una vez por layout. */
export function RouteTitle() {
  const { pathname } = useLocation()
  useEffect(() => {
    const ruta = pathname.replace(/\/+$/, "") || "/"
    const titulo = TITULOS[ruta] ?? "Página no encontrada"
    document.title = ruta === "/" ? `${BASE} · ${titulo}` : `${titulo} · ${BASE}`
  }, [pathname])
  return null
}
