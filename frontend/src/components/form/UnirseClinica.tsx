import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Building2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/form/Field"
import { api, ApiError } from "@/lib/api"

const schema = z.object({
  codigo: z.string().trim().min(1, "Ingresá el código de activación"),
})
type FormValues = z.infer<typeof schema>

/**
 * Un profesional ya registrado se suma a otra clínica con un código de activación
 * (el que genera el administrador de esa clínica). Al terminar va al selector de
 * clínicas para que pueda cambiar a la nueva.
 * `children` va al final (p. ej. el botón Cancelar de un diálogo).
 */
export function UnirseClinicaForm({ children }: { children?: React.ReactNode }) {
  const [saving, setSaving] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { codigo: "" },
  })

  async function onSubmit(values: FormValues) {
    setSaving(true)
    try {
      const r = await api.post<{ clinica?: { nombre?: string | null } }>(
        "/auth/unirse-clinica",
        { codigo: values.codigo }
      )
      toast.success(
        r.clinica?.nombre ? `Te sumaste a ${r.clinica.nombre}.` : "Te sumaste a la clínica."
      )
      // Navegación completa: el usuario (y sus clínicas) se vuelve a cargar.
      window.location.href = "/seleccionar-clinica?cambiar=1"
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No se pudo sumar a la clínica."
      if (/c[oó]digo/i.test(msg)) setError("codigo", { message: msg })
      else toast.error(msg)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <Field
        label="Código de activación"
        htmlFor="unirse-codigo"
        error={errors.codigo?.message}
        hint="Te lo da el administrador de la otra clínica."
      >
        <Input
          id="unirse-codigo"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="h-10 font-mono tracking-widest"
          aria-invalid={!!errors.codigo}
          {...register("codigo")}
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {children}
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Building2 />}
          Sumarme
        </Button>
      </div>
    </form>
  )
}
