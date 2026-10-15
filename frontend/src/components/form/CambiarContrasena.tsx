import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { KeyRound, Loader2 } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Field } from "@/components/form/Field"
import { api, ApiError } from "@/lib/api"

const schema = z
  .object({
    actual: z.string().min(1, "Ingresá tu contraseña actual"),
    nueva: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string().min(1, "Repetí la contraseña nueva"),
  })
  .refine((d) => d.nueva === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  })
  .refine((d) => d.nueva !== d.actual, {
    message: "Tiene que ser distinta de la actual",
    path: ["nueva"],
  })
type FormValues = z.infer<typeof schema>

/**
 * Formulario de cambio de contraseña estando logueado (cualquier rol). Pide la actual.
 * `children` va al final (p. ej. el botón Cancelar de un diálogo).
 */
export function CambiarContrasenaForm({
  onDone,
  className,
  children,
}: {
  onDone?: () => void
  className?: string
  children?: React.ReactNode
}) {
  const [saving, setSaving] = useState(false)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { actual: "", nueva: "", confirm: "" },
  })

  async function onSubmit(values: FormValues) {
    setSaving(true)
    try {
      await api.post("/auth/cambiar-contrasena", { actual: values.actual, nueva: values.nueva })
      toast.success("Contraseña actualizada.")
      reset()
      onDone?.()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña."
      if (/actual/i.test(msg)) setError("actual", { message: msg })
      else toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className={cn("grid gap-4", className)} noValidate>
      <Field label="Contraseña actual" htmlFor="pass-actual" error={errors.actual?.message}>
        <Input
          id="pass-actual"
          type="password"
          autoComplete="current-password"
          className="h-10"
          aria-invalid={!!errors.actual}
          {...register("actual")}
        />
      </Field>
      <Field
        label="Contraseña nueva"
        htmlFor="pass-nueva"
        error={errors.nueva?.message}
        hint="Mínimo 8 caracteres."
      >
        <Input
          id="pass-nueva"
          type="password"
          autoComplete="new-password"
          className="h-10"
          aria-invalid={!!errors.nueva}
          {...register("nueva")}
        />
      </Field>
      <Field label="Repetí la contraseña nueva" htmlFor="pass-confirm" error={errors.confirm?.message}>
        <Input
          id="pass-confirm"
          type="password"
          autoComplete="new-password"
          className="h-10"
          aria-invalid={!!errors.confirm}
          {...register("confirm")}
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {children}
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Cambiar contraseña
        </Button>
      </div>
    </form>
  )
}

/** Tarjeta con el formulario (para páginas de perfil). */
export function CambiarContrasena({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-6 sm:p-8">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="size-5 text-primary" /> Cambiar contraseña
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Si entraste con una contraseña temporal, cambiala por una tuya.
        </p>
        <CambiarContrasenaForm className="mt-4" />
      </CardContent>
    </Card>
  )
}
