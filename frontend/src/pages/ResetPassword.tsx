import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/form/Field"
import { Card, CardContent } from "@/components/ui/card"
import { Logo } from "@/components/site/Logo"
import { getSupabase } from "@/lib/supabase"

const schema = z
  .object({
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string().min(1, "Repetí la contraseña"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  })
type FormValues = z.infer<typeof schema>

type Status = "loading" | "ready" | "error"

export default function ResetPassword() {
  const [status, setStatus] = useState<Status>("loading")
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    let unsub: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout>

    getSupabase()
      .then(async (sb) => {
        setClient(sb)

        // Flujo PKCE: intercambiar el ?code= por sesión (si aplica).
        const url = new URL(window.location.href)
        const code = url.searchParams.get("code")
        if (code) {
          try {
            await sb.auth.exchangeCodeForSession(code)
          } catch {
            /* si falla, puede ser flujo implícito (hash) */
          }
        }

        // El flujo implícito (hash con access_token) lo procesa el cliente al crearse.
        const {
          data: { session },
        } = await sb.auth.getSession()
        if (session) setStatus("ready")

        const { data } = sb.auth.onAuthStateChange((event, session) => {
          if (
            event === "PASSWORD_RECOVERY" ||
            event === "SIGNED_IN" ||
            session
          ) {
            setStatus("ready")
          }
        })
        unsub = () => data.subscription.unsubscribe()

        // Si tras unos segundos no hubo sesión válida, marcar enlace inválido.
        timer = setTimeout(() => {
          setStatus((s) => (s === "loading" ? "error" : s))
        }, 4000)
      })
      .catch(() => setStatus("error"))

    return () => {
      unsub?.()
      clearTimeout(timer)
    }
  }, [])

  async function onSubmit(values: FormValues) {
    if (!client) return
    setSubmitting(true)
    try {
      const { error } = await client.auth.updateUser({
        password: values.password,
      })
      if (error) throw error
      // La sesión de recuperación solo sirve para este cambio: se cierra (scope local)
      // para que no quede un token de Supabase guardado en el navegador. El login de la
      // app usa su propia cookie de sesión.
      await client.auth.signOut({ scope: "local" }).catch(() => {})
      setDone(true)
      toast.success("Contraseña actualizada")
      setTimeout(() => {
        window.location.href = "/login"
      }, 1500)
    } catch (err) {
      // El detalle de Supabase (en inglés) queda en la consola; al usuario, un mensaje claro.
      console.error("No se pudo actualizar la contraseña:", err)
      const code = (err as { code?: string } | null)?.code
      const msg =
        code === "same_password"
          ? "La contraseña nueva tiene que ser distinta de la anterior."
          : code === "weak_password"
            ? "La contraseña es muy débil. Usá una más larga o con más variedad de caracteres."
            : "No se pudo actualizar la contraseña. Probá de nuevo o pedí un enlace nuevo."
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-muted/30 px-4 py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <Card className="w-full max-w-md">
        <CardContent className="p-6 sm:p-8">
          {status === "loading" && (
            <div className="flex flex-col items-center py-6 text-center">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">
                Validando el enlace de recuperación…
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-destructive/10 text-destructive">
                <TriangleAlert className="size-7" />
              </div>
              <h1 className="mt-4 text-xl font-semibold">Enlace no válido</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                El enlace de recuperación expiró o no es válido. Solicitá uno
                nuevo desde “¿Olvidaste tu contraseña?”.
              </p>
              <Button asChild variant="outline" size="lg" className="mt-6">
                <a href="/forgot-password">Solicitar nuevo enlace</a>
              </Button>
            </div>
          )}

          {status === "ready" && !done && (
            <>
              <div className="mb-6 text-center">
                <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <KeyRound className="size-7" />
                </div>
                <h1 className="mt-4 text-xl font-semibold">Nueva contraseña</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Elegí una contraseña segura para tu cuenta.
                </p>
              </div>
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-4"
                noValidate
              >
                <Field
                  label="Nueva contraseña"
                  htmlFor="password"
                  required
                  error={errors.password?.message}
                >
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.password}
                    {...register("password")}
                  />
                </Field>
                <Field
                  label="Confirmar contraseña"
                  htmlFor="confirm"
                  required
                  error={errors.confirm?.message}
                >
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={!!errors.confirm}
                    {...register("confirm")}
                  />
                </Field>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={submitting}
                >
                  {submitting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ShieldCheck />
                  )}
                  Guardar contraseña
                </Button>
              </form>
            </>
          )}

          {done && (
            <div className="flex flex-col items-center py-4 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <ShieldCheck className="size-7" />
              </div>
              <h1 className="mt-4 text-xl font-semibold">¡Listo!</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tu contraseña fue actualizada. Redirigiendo al inicio de sesión…
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
