import { Link, useLocation } from "react-router-dom"
import { ArrowLeft, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/site/AuthShell"
import { ReenviarConfirmacion } from "@/components/site/ReenviarConfirmacion"

/**
 * Pantalla después del registro cuando la cuenta requiere confirmar el email.
 * El email llega por el state de la navegación (nunca por la URL).
 */
export default function ConfirmarEmail() {
  const location = useLocation()
  const email = (location.state as { email?: string } | null)?.email

  return (
    <AuthShell
      title="Ya casi está"
      subtitle="Confirmá tu email para activar tu cuenta y empezar a usar Medilu."
    >
      <div className="text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <MailCheck className="size-7" />
        </div>
        <h1 className="mt-5 text-2xl font-semibold">Confirmá tu email</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {email ? (
            <>
              Te enviamos un enlace a{" "}
              <strong className="font-medium break-all text-foreground">{email}</strong>.
            </>
          ) : (
            "Te enviamos un enlace a tu email."
          )}{" "}
          Abrilo para activar tu cuenta y después iniciá sesión.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          ¿No lo ves? Puede tardar unos minutos. Revisá también la carpeta de spam.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {email && <ReenviarConfirmacion email={email} />}
          <Button asChild size="lg">
            <Link to="/login">
              <ArrowLeft />
              Ir a iniciar sesión
            </Link>
          </Button>
        </div>
      </div>
    </AuthShell>
  )
}
