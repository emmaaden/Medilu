import { Suspense, useEffect } from "react"
import { Outlet, useLocation, Navigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { DashboardNavbar } from "@/components/dashboard/DashboardNavbar"
import { PageLoader } from "@/components/site/PageLoader"
import { MAIN_ID, SkipLink } from "@/components/site/A11y"
import { PlanBanner } from "@/components/dashboard/PlanGate"

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior })
  }, [pathname])
  return null
}

function Guarded() {
  const { user, loading } = useAuth()
  const { pathname } = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="size-7 animate-spin text-primary" />
      </div>
    )
  }

  // Sin sesión → login.
  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Fase O: cuenta del equipo que además es paciente, sin perfil elegido todavía.
  if (user.needsProfileSelection) {
    return <Navigate to="/elegir-perfil" replace />
  }

  // El panel es del staff (profesional/admin y recepción). Un paciente va a su área.
  // (El backend además exige el rol correspondiente en cada endpoint.)
  if (user.role !== "profesional" && user.role !== "recepcion" && user.role !== "auditor") {
    return <Navigate to="/mis-turnos" replace />
  }

  // Fase A: con varias clínicas y ninguna activa todavía → elegir primero.
  if (user.needsClinicSelection) {
    return <Navigate to="/seleccionar-clinica" replace />
  }

  // Fase E: la recepción SOLO gestiona turnos. Cualquier otra ruta del dashboard
  // la mandamos a su panel (además el backend bloquea los endpoints de profesional).
  if (user.rol === "recepcion" && !pathname.startsWith("/dashboard/turnos")) {
    return <Navigate to="/dashboard/turnos" replace />
  }

  // Fase J: el auditor SOLO trabaja en su panel de auditoría (aunque sea médico con
  // fila de profesional: en esta clínica su rol es de auditoría).
  if (user.rol === "auditor" && !pathname.startsWith("/dashboard/auditoria")) {
    return <Navigate to="/dashboard/auditoria" replace />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <SkipLink />
      <ScrollToTop />
      <DashboardNavbar />
      <main id={MAIN_ID} tabIndex={-1} className="flex-1 focus:outline-none">
        {/* Fase L: prueba, pago pendiente o solo lectura. */}
        <PlanBanner />
        {/* Suspense acá: mientras carga una página lazy, el navbar queda visible. */}
        <Suspense fallback={<PageLoader />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}

export function DashboardLayout() {
  return (
    <AuthProvider>
      <Guarded />
    </AuthProvider>
  )
}
