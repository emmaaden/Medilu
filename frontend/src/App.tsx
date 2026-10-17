import { Suspense, lazy } from "react"
import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { PublicLayout } from "@/layouts/PublicLayout"
import { DashboardLayout } from "@/layouts/DashboardLayout"
import { Toaster } from "@/components/ui/sonner"
import { PageLoader } from "@/components/site/PageLoader"
import { RouteTitle } from "@/components/site/A11y"
import { FeatureGate } from "@/components/dashboard/PlanGate"

// Carga inicial: solo lo que ve quien llega al sitio.
import Home from "@/pages/Home"
import Login from "@/pages/Login"
import NotFound from "@/pages/NotFound"

// Páginas públicas de visita ocasional → carga diferida.
const Planes = lazy(() => import("@/pages/Planes"))
const RegisterRole = lazy(() => import("@/pages/RegisterRole"))
const RegisterPaciente = lazy(() => import("@/pages/RegisterPaciente"))
const RegisterProfesional = lazy(() => import("@/pages/RegisterProfesional"))
const RegisterRecepcion = lazy(() => import("@/pages/RegisterRecepcion"))
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"))
const ConfirmarEmail = lazy(() => import("@/pages/ConfirmarEmail"))
const Terminos = lazy(() => import("@/pages/Terminos"))
const Privacidad = lazy(() => import("@/pages/Privacidad"))
const Cookies = lazy(() => import("@/pages/Cookies"))
const Reembolsos = lazy(() => import("@/pages/Reembolsos"))
const Accesibilidad = lazy(() => import("@/pages/Accesibilidad"))
const SolicitudConsumo = lazy(() => import("@/pages/SolicitudConsumo"))
const ReporteSuplantacion = lazy(() => import("@/pages/ReporteSuplantacion"))

// Páginas con dependencias pesadas (jsPDF / Supabase) → carga diferida.
const Turnos = lazy(() => import("@/pages/Turnos"))
const MisTurnos = lazy(() => import("@/pages/MisTurnos"))
const GestionarTurno = lazy(() => import("@/pages/GestionarTurno"))
const MiHistoria = lazy(() => import("@/pages/MiHistoria"))
const MisCertificados = lazy(() => import("@/pages/MisCertificados"))
const MisEstudios = lazy(() => import("@/pages/MisEstudios"))
const MiPerfil = lazy(() => import("@/pages/MiPerfil"))
const ResetPassword = lazy(() => import("@/pages/ResetPassword"))
const SeleccionarClinica = lazy(() => import("@/pages/SeleccionarClinica"))
const ElegirPerfil = lazy(() => import("@/pages/ElegirPerfil"))

// Dashboard (área privada)
const DashboardHome = lazy(() => import("@/pages/dashboard/Home"))
const DashboardTurnos = lazy(() => import("@/pages/dashboard/Turnos"))
const DashboardConfig = lazy(() => import("@/pages/dashboard/Config"))
const DashboardRegistroClinico = lazy(
  () => import("@/pages/dashboard/RegistroClinico")
)
const DashboardAdministracion = lazy(
  () => import("@/pages/dashboard/Administracion")
)
const DashboardCertificados = lazy(
  () => import("@/pages/dashboard/Certificados")
)
const DashboardHistorias = lazy(
  () => import("@/pages/dashboard/HistoriasClinicas")
)
const DashboardEstudios = lazy(
  () => import("@/pages/dashboard/EstudiosCompartidos")
)
const DashboardAuditoria = lazy(() => import("@/pages/dashboard/Auditoria"))
const DashboardAutorizaciones = lazy(() => import("@/pages/dashboard/Autorizaciones"))
const DashboardPlan = lazy(() => import("@/pages/dashboard/Plan"))
const DashboardPlataforma = lazy(() => import("@/pages/dashboard/Plataforma"))

/**
 * Redirección de rutas legacy que conserva ?query y #hash: el enlace de recuperación de
 * contraseña de Supabase trae el token en el hash, y un <Navigate to="/x"> lo perdía.
 */
function RedirectKeep({ to }: { to: string }) {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: to, search, hash }} replace />
}

function App() {
  return (
    <>
      <RouteTitle />
      <Suspense fallback={<PageLoader />}>
        <Routes>
        {/* Dashboard (privado, protegido en el cliente) */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardHome />} />
          <Route path="/dashboard/turnos" element={<DashboardTurnos />} />
          <Route path="/dashboard/config" element={<DashboardConfig />} />
          <Route
            path="/dashboard/registro-clinico"
            element={<DashboardRegistroClinico />}
          />
          <Route path="/dashboard/admin" element={<DashboardAdministracion />} />
          <Route
            path="/dashboard/certificados"
            element={
              <FeatureGate feature="certificados">
                <DashboardCertificados />
              </FeatureGate>
            }
          />
          <Route path="/dashboard/historias" element={<DashboardHistorias />} />
          <Route path="/dashboard/estudios" element={<DashboardEstudios />} />
          {/* Fase L: funciones que dependen del plan de la clínica. */}
          <Route
            path="/dashboard/auditoria"
            element={
              <FeatureGate feature="auditoria">
                <DashboardAuditoria />
              </FeatureGate>
            }
          />
          <Route
            path="/dashboard/autorizaciones"
            element={
              <FeatureGate feature="autorizaciones">
                <DashboardAutorizaciones />
              </FeatureGate>
            }
          />
          <Route path="/dashboard/plan" element={<DashboardPlan />} />
          <Route path="/dashboard/plataforma" element={<DashboardPlataforma />} />
        </Route>

        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/turnos" element={<Turnos />} />
          <Route path="/mis-turnos" element={<MisTurnos />} />
          <Route path="/mi-perfil" element={<MiPerfil />} />
          <Route path="/mi-historia" element={<MiHistoria />} />
          <Route path="/mis-certificados" element={<MisCertificados />} />
          <Route path="/mis-estudios" element={<MisEstudios />} />
          <Route path="/gestionar-turno" element={<GestionarTurno />} />
          <Route path="/planes" element={<Planes />} />
          {/* Compatibilidad: la vieja historia clínica pública por DNI se retiró. */}
          <Route
            path="/historia-clinica"
            element={<Navigate to="/mi-historia" replace />}
          />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<RegisterRole />} />
          <Route path="/register/paciente" element={<RegisterPaciente />} />
          <Route path="/register/profesional" element={<RegisterProfesional />} />
          <Route path="/register/recepcion" element={<RegisterRecepcion />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/confirmar-email" element={<ConfirmarEmail />} />
          <Route path="/terminos" element={<Terminos />} />
          <Route path="/privacidad" element={<Privacidad />} />
          <Route path="/cookies" element={<Cookies />} />
          <Route path="/reembolsos" element={<Reembolsos />} />
          <Route path="/accesibilidad" element={<Accesibilidad />} />
          <Route
            path="/arrepentimiento"
            element={<SolicitudConsumo key="arrepentimiento" tipo="arrepentimiento" />}
          />
          <Route path="/baja" element={<SolicitudConsumo key="baja" tipo="baja" />} />
          <Route path="/reportar-suplantacion" element={<ReporteSuplantacion />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* Selección de clínica: post-login, flujo aislado (sin navbar público) */}
        <Route path="/seleccionar-clinica" element={<SeleccionarClinica />} />
        {/* Fase O: cuenta de staff que además es paciente → elegir con qué perfil entrar */}
        <Route path="/elegir-perfil" element={<ElegirPerfil />} />

        {/* reset-password: sin navbar/footer (flujo aislado tras el email) */}
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* Compatibilidad con enlaces legacy .html */}
        <Route path="/reset-password.html" element={<RedirectKeep to="/reset-password" />} />
        <Route path="/login.html" element={<RedirectKeep to="/login" />} />
        <Route path="/index.html" element={<RedirectKeep to="/" />} />
        <Route path="/politica-privacidad.html" element={<RedirectKeep to="/privacidad" />} />
        <Route path="/terminos-condiciones.html" element={<RedirectKeep to="/terminos" />} />
        <Route path="/planes.html" element={<RedirectKeep to="/planes" />} />
        <Route path="/turnos.html" element={<RedirectKeep to="/turnos" />} />
        <Route path="/register.html" element={<RedirectKeep to="/register" />} />
        <Route path="/forgot-password.html" element={<RedirectKeep to="/forgot-password" />} />
        </Routes>
      </Suspense>
      <Toaster position="top-center" richColors />
    </>
  )
}

export default App
