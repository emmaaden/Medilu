import { useState } from "react"
import { Link } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, LogIn, MailWarning } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/form/Field"
import { AuthShell } from "@/components/site/AuthShell"
import { ReenviarConfirmacion } from "@/components/site/ReenviarConfirmacion"
import { api, ApiError } from "@/lib/api"

const schema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
})
type FormValues = z.infer<typeof schema>

export default function Login() {
  const [submitting, setSubmitting] = useState(false)
  // Email de una cuenta que todavía no confirmó su correo (muestra el aviso).
  const [sinConfirmar, setSinConfirmar] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    setSinConfirmar(null)
    try {
      // El backend detecta el rol (profesional/paciente) desde la base; no se envía.
      const res = await api.post<{
        user?: { role?: string }
        needsClinicSelection?: boolean
        needsProfileSelection?: boolean
      }>("/auth/login", values)
      toast.success("Bienvenido/a")
      // Paciente → su área de turnos. Profesional con varias clínicas → selector.
      // Profesional con una sola clínica → panel. Navegación completa para que la
      // nueva sesión (cookie httpOnly) se tome en el primer render.
      // Cuenta del equipo de una clínica que además es paciente → elegir perfil.
      const destino = res?.needsProfileSelection
        ? "/elegir-perfil"
        : res?.user?.role === "paciente"
          ? "/mis-turnos"
          : res?.needsClinicSelection
            ? "/seleccionar-clinica"
            : "/dashboard"
      window.location.href = destino
    } catch (err) {
      setSubmitting(false)
      const data = err instanceof ApiError ? (err.data as { code?: string } | null) : null
      if (data?.code === "EMAIL_NO_CONFIRMADO") {
        setSinConfirmar(values.email)
        return
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : "No se pudo iniciar sesión. Intentá de nuevo."
      toast.error(msg)
    }
  }

  return (
    <AuthShell
      title="Tu salud, organizada en un solo lugar"
      subtitle="Accedé a tus turnos y tus datos. Si sos profesional, gestioná tu agenda y tu clínica."
      bullets={[
        "Pacientes: mirá y cancelá tus turnos",
        "Profesionales: agenda de turnos en un panel",
        "Historia clínica digital",
      ]}
    >
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingresá con tu cuenta de paciente o profesional.
        </p>
      </div>

      {sinConfirmar && (
        <Alert className="mb-6 border-primary/30 bg-primary/5">
          <MailWarning className="text-primary" />
          <AlertTitle>Confirmá tu email para entrar</AlertTitle>
          <AlertDescription>
            <p>
              Te enviamos un enlace a{" "}
              <strong className="font-medium break-all text-foreground">{sinConfirmar}</strong>{" "}
              al registrarte. Abrilo para activar tu cuenta y volvé a iniciar sesión.
              Revisá también la carpeta de spam.
            </p>
            <ReenviarConfirmacion
              email={sinConfirmar}
              size="sm"
            />
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" required error={errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            aria-invalid={!!errors.email}
            {...register("email")}
          />
        </Field>

        <Field
          label="Contraseña"
          htmlFor="password"
          required
          error={errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
        </Field>

        <div className="flex justify-end">
          <Link
            to="/forgot-password"
            className="text-sm font-medium text-primary hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <LogIn />}
          Iniciar sesión
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        ¿No tenés cuenta?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Registrate
        </Link>
      </p>
    </AuthShell>
  )
}
