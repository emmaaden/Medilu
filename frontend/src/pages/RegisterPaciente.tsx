import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, UserPlus, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Field } from "@/components/form/Field"
import { Consentimiento, CONSENTIMIENTO_REQUERIDO } from "@/components/form/Consentimiento"
import { LEGAL_VERSION } from "@/lib/site"
import { SelectField } from "@/components/form/SelectField"
import { CoberturaFields } from "@/components/form/CoberturaFields"
import { COBERTURA_VACIA, coberturaPayload, type Cobertura } from "@/lib/catalogos"
import { Container } from "@/components/site/Section"
import { api, ApiError } from "@/lib/api"
import { errorFechaNacimiento, FECHA_NAC_MIN, hoyAR } from "@/lib/fecha"

const schema = z.object({
  dni: z.string().min(6, "DNI inválido"),
  sexo: z
    .string({ required_error: "Seleccioná una opción" })
    .min(1, "Seleccioná una opción"),
  nombre: z.string().min(2, "Requerido"),
  apellido: z.string().min(2, "Requerido"),
  fechaNacimiento: z
    .string()
    .min(1, "Requerido")
    .refine((v) => !errorFechaNacimiento(v), (v) => ({ message: errorFechaNacimiento(v) ?? "" })),
  telefono: z.string().min(6, "Teléfono inválido"),
  // Opcional (minimización, Ley 25.326 art. 4): no hace falta para turnos ni HC.
  direccion: z.string().optional(),
  email: z.string().email("Email inválido"),
  // Mismo mínimo que valida el backend (validators/schemas.js).
  password: z.string().min(8, "Mínimo 8 caracteres"),
  acepta: z.boolean().refine((v) => v === true, CONSENTIMIENTO_REQUERIDO),
})
type FormValues = z.infer<typeof schema>

const SEXO = [
  { value: "M", label: "Masculino" },
  { value: "F", label: "Femenino" },
  { value: "O", label: "Otro" },
]

export default function RegisterPaciente() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  // Fase K: cobertura del catálogo global (fuera de react-hook-form: es un objeto).
  const [cobertura, setCobertura] = useState<Cobertura>(COBERTURA_VACIA)
  const [coberturaError, setCoberturaError] = useState<string | undefined>()
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { acepta: false },
  })

  async function onSubmit(values: FormValues) {
    if (!cobertura.idObraSocial) {
      setCoberturaError("Requerido")
      return
    }
    setSubmitting(true)
    try {
      const { acepta, ...datos } = values
      const res = await api.post<{ requiereConfirmacion?: boolean }>("/auth/register", {
        ...datos,
        direccion: datos.direccion?.trim() || undefined,
        ...coberturaPayload(cobertura),
        role: "PACIENTE",
        aceptaTerminos: acepta,
        versionLegal: LEGAL_VERSION,
      })
      if (res?.requiereConfirmacion) {
        navigate("/confirmar-email", { state: { email: values.email } })
        return
      }
      toast.success("Cuenta creada con éxito")
      navigate("/")
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "No se pudo completar el registro."
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <Container className="py-12">
      <Link
        to="/register"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Volver
      </Link>

      <div className="mx-auto mt-4 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold">Registro de paciente</h1>
          <p className="mt-2 text-muted-foreground">
            Completá tus datos para crear tu cuenta.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <form
              onSubmit={handleSubmit(onSubmit)}
              className="grid gap-4 sm:grid-cols-2"
              noValidate
            >
              <Field label="DNI" htmlFor="dni" required error={errors.dni?.message}>
                <Input
                  id="dni"
                  type="number"
                  inputMode="numeric"
                  className="h-10"
                  aria-invalid={!!errors.dni}
                  {...register("dni")}
                />
              </Field>

              <Field label="Sexo" htmlFor="sexo" required error={errors.sexo?.message}>
                <Controller
                  control={control}
                  name="sexo"
                  render={({ field }) => (
                    <SelectField
                      id="sexo"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={SEXO}
                      invalid={!!errors.sexo}
                      placeholder="Seleccionar…"
                    />
                  )}
                />
              </Field>

              <Field label="Nombre" htmlFor="nombre" required error={errors.nombre?.message}>
                <Input id="nombre" autoComplete="given-name" className="h-10" aria-invalid={!!errors.nombre} {...register("nombre")} />
              </Field>

              <Field label="Apellido" htmlFor="apellido" required error={errors.apellido?.message}>
                <Input id="apellido" autoComplete="family-name" className="h-10" aria-invalid={!!errors.apellido} {...register("apellido")} />
              </Field>

              <Field
                label="Fecha de nacimiento"
                htmlFor="fechaNacimiento"
                required
                error={errors.fechaNacimiento?.message}
              >
                <Input
                  id="fechaNacimiento"
                  type="date"
                  min={FECHA_NAC_MIN}
                  max={hoyAR()}
                  className="h-10"
                  aria-invalid={!!errors.fechaNacimiento}
                  {...register("fechaNacimiento")}
                />
              </Field>

              <Field label="Teléfono" htmlFor="telefono" required error={errors.telefono?.message}>
                <Input id="telefono" type="tel" autoComplete="tel" className="h-10" aria-invalid={!!errors.telefono} {...register("telefono")} />
              </Field>

              <Field label="Dirección (opcional)" htmlFor="direccion" error={errors.direccion?.message} className="sm:col-span-2">
                <Input id="direccion" autoComplete="street-address" className="h-10" aria-invalid={!!errors.direccion} {...register("direccion")} />
              </Field>

              <CoberturaFields
                value={cobertura}
                onChange={(c) => {
                  setCobertura(c)
                  if (c.idObraSocial) setCoberturaError(undefined)
                }}
                publico
                required
                idPrefix="registro"
                error={coberturaError}
              />

              <Field label="Email" htmlFor="email" required error={errors.email?.message}>
                <Input id="email" type="email" autoComplete="email" className="h-10" aria-invalid={!!errors.email} {...register("email")} />
              </Field>

              <Field label="Contraseña" htmlFor="password" required error={errors.password?.message}>
                <Input id="password" type="password" autoComplete="new-password" className="h-10" aria-invalid={!!errors.password} {...register("password")} />
              </Field>

              <div className="sm:col-span-2">
                <Controller
                  control={control}
                  name="acepta"
                  render={({ field }) => (
                    <Consentimiento
                      ref={field.ref}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      error={errors.acepta?.message}
                      salud
                    />
                  )}
                />
              </div>

              <div className="sm:col-span-2">
                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
                  Crear cuenta
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </Container>
  )
}
