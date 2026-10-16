import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { HousePlus, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/form/Field"
import { api, ApiError } from "@/lib/api"

const schema = z.object({
  nombre: z.string().trim().min(2, "Ingresá el nombre del consultorio").max(120),
})
type FormValues = z.infer<typeof schema>

/**
 * Un profesional ya registrado crea su propio consultorio (queda como administrador,
 * con la prueba gratis del plan). Al terminar pasa a trabajar en el consultorio nuevo.
 * `children` va al final (p. ej. el botón Cancelar de un diálogo).
 */
export function CrearConsultorioForm({ children }: { children?: React.ReactNode }) {
  const [saving, setSaving] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nombre: "" },
  })

  async function onSubmit(values: FormValues) {
    setSaving(true)
    try {
      const r = await api.post<{ clinica: { clinicaId: string; nombre: string } }>(
        "/auth/crear-consultorio",
        { nombre: values.nombre }
      )
      toast.success(`Creaste ${r.clinica.nombre}.`)
      // Pasa a operar en el consultorio nuevo; si falla, que lo elija en el selector.
      try {
        await api.post("/auth/select-clinica", { clinicaId: r.clinica.clinicaId })
        window.location.href = "/dashboard"
      } catch {
        window.location.href = "/seleccionar-clinica?cambiar=1"
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No se pudo crear el consultorio."
      if (/nombre/i.test(msg)) setError("nombre", { message: msg })
      else toast.error(msg)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4" noValidate>
      <Field
        label="Nombre del consultorio"
        htmlFor="consultorio-nombre"
        error={errors.nombre?.message}
        hint="Es el nombre que van a ver tus pacientes al sacar turno."
      >
        <Input
          id="consultorio-nombre"
          autoComplete="organization"
          className="h-10"
          aria-invalid={!!errors.nombre}
          {...register("nombre")}
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {children}
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <HousePlus />}
          Crear consultorio
        </Button>
      </div>
    </form>
  )
}
