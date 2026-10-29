import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Save, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Field } from "@/components/form/Field"
import { CoberturaFields } from "@/components/form/CoberturaFields"
import { CambiarContrasena } from "@/components/form/CambiarContrasena"
import { COBERTURA_VACIA, coberturaPayload, type Cobertura } from "@/lib/catalogos"
import { Container, PageHero } from "@/components/site/Section"
import { api, ApiError } from "@/lib/api"
import { useUser } from "@/hooks/useUser"
import { errorFechaNacimiento, FECHA_NAC_MIN, hoyAR } from "@/lib/fecha"
import { SkeletonFormulario, PageSkeleton } from "@/components/site/Skeletons"

const schema = z.object({
  nombre: z.string().trim().min(1, "Ingresá tu nombre").max(120),
  apellido: z.string().trim().max(120).optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  telefono: z.string().max(30).optional().or(z.literal("")),
  direccion: z.string().max(200).optional().or(z.literal("")),
  sexo: z.string().max(20).optional().or(z.literal("")),
  fechaNacimiento: z
    .string()
    .optional()
    .refine((v) => !errorFechaNacimiento(v ?? ""), (v) => ({ message: errorFechaNacimiento(v ?? "") ?? "" })),
})
type FormValues = z.infer<typeof schema>

type Perfil = FormValues & {
  dni: string
  obraSocial: string
  idObraSocial: number | null
  nroAfiliado: string
  plan: string
}

export default function MiPerfil() {
  const { user, loading: loadingUser } = useUser()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dni, setDni] = useState("")
  // Fase K: cobertura del catálogo (fuera de react-hook-form: es un objeto).
  const [cobertura, setCobertura] = useState<Cobertura>(COBERTURA_VACIA)
  const [obraSocialTexto, setObraSocialTexto] = useState("")

  const esPaciente = user?.role === "paciente"

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (!esPaciente) return
    api
      .get<Perfil>("/api/mi-cuenta/perfil")
      .then((d) => {
        setDni(d.dni || "")
        reset({
          nombre: d.nombre || "",
          apellido: d.apellido || "",
          email: d.email || "",
          telefono: d.telefono || "",
          direccion: d.direccion || "",
          sexo: d.sexo || "",
          fechaNacimiento: d.fechaNacimiento || "",
        })
        setCobertura({
          idObraSocial: d.idObraSocial ? String(d.idObraSocial) : "",
          nroAfiliado: d.nroAfiliado || "",
          plan: d.plan || "",
        })
        setObraSocialTexto(d.obraSocial || "")
      })
      .catch(() => toast.error("No se pudieron cargar tus datos."))
      .finally(() => setLoading(false))
  }, [esPaciente, reset])

  if (loadingUser) {
    return <PageSkeleton />
  }
  if (!user || !esPaciente) {
    return <Navigate to="/login" replace />
  }

  async function onSubmit(values: FormValues) {
    setSaving(true)
    try {
      await api.put("/api/mi-cuenta/perfil", { ...values, ...coberturaPayload(cobertura) })
      toast.success("Datos actualizados.")
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudieron guardar los datos."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Mi cuenta"
        title="Mis datos"
        description="Actualizá tu información de contacto y tu obra social."
      />

      <Container className="py-12">
        <div className="mx-auto max-w-2xl">
          <Button asChild variant="ghost" className="mb-4">
            <Link to="/mis-turnos">
              <ArrowLeft /> Volver a mi cuenta
            </Link>
          </Button>

          <Card>
            <CardContent className="p-6 sm:p-8">
              {loading ? (
                <SkeletonFormulario />
              ) : (
                <form
                  onSubmit={handleSubmit(onSubmit)}
                  className="space-y-4"
                  noValidate
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Nombre"
                      htmlFor="nombre"
                      required
                      error={errors.nombre?.message}
                    >
                      <Input id="nombre" className="h-10" {...register("nombre")} />
                    </Field>
                    <Field
                      label="Apellido"
                      htmlFor="apellido"
                      error={errors.apellido?.message}
                    >
                      <Input
                        id="apellido"
                        className="h-10"
                        {...register("apellido")}
                      />
                    </Field>
                  </div>

                  <Field label="DNI" htmlFor="dni" hint="No se puede modificar.">
                    <Input id="dni" className="h-10" value={dni} readOnly disabled />
                  </Field>

                  <Field
                    label="Email"
                    htmlFor="email"
                    error={errors.email?.message}
                  >
                    <Input
                      id="email"
                      type="email"
                      className="h-10"
                      {...register("email")}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Teléfono"
                      htmlFor="telefono"
                      error={errors.telefono?.message}
                    >
                      <Input
                        id="telefono"
                        type="tel"
                        className="h-10"
                        {...register("telefono")}
                      />
                    </Field>
                    <Field
                      label="Fecha de nacimiento"
                      htmlFor="fechaNacimiento"
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
                  </div>

                  <Field
                    label="Dirección"
                    htmlFor="direccion"
                    error={errors.direccion?.message}
                  >
                    <Input
                      id="direccion"
                      className="h-10"
                      {...register("direccion")}
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Sexo"
                      htmlFor="sexo"
                      error={errors.sexo?.message}
                    >
                      <Input id="sexo" className="h-10" {...register("sexo")} />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <CoberturaFields
                      value={cobertura}
                      onChange={setCobertura}
                      publico
                      idPrefix="perfil"
                      textoLegado={!cobertura.idObraSocial ? obraSocialTexto : undefined}
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="animate-spin" /> : <Save />}
                    Guardar cambios
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <CambiarContrasena className="mt-6" />
        </div>
      </Container>
    </>
  )
}
