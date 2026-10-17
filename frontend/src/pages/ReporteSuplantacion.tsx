import { useState } from "react"
import { Link } from "react-router-dom"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { CircleCheck, Loader2, Mail, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Field } from "@/components/form/Field"
import { SelectField } from "@/components/form/SelectField"
import { AvisoDatosPersonales } from "@/components/form/Consentimiento"
import { Container, PageHero } from "@/components/site/Section"
import { api, ApiError } from "@/lib/api"
import { CONTACT_EMAIL } from "@/lib/site"

const SITUACIONES = [
  { value: "cuenta", label: "Alguien creó o usa una cuenta con mis datos" },
  { value: "historia", label: "Alguien accedió o vinculó mi historia clínica" },
  { value: "turnos", label: "Sacaron turnos a mi nombre" },
  { value: "otra", label: "Otra situación" },
]

const schema = z.object({
  nombre: z.string().trim().min(2, "Ingresá tu nombre").max(120, "Máximo 120 caracteres"),
  apellido: z.string().trim().min(2, "Ingresá tu apellido").max(120, "Máximo 120 caracteres"),
  dni: z.string().trim().min(1, "Ingresá tu DNI").max(20, "Máximo 20 caracteres"),
  email: z.string().trim().email("Email inválido"),
  telefono: z.string().trim().max(30, "Máximo 30 caracteres").optional(),
  situacion: z.string().min(1, "Elegí qué pasó"),
  clinica: z.string().trim().max(120, "Máximo 120 caracteres").optional(),
  detalle: z.string().trim().min(10, "Contanos qué pasó").max(2000, "Máximo 2000 caracteres"),
})
type FormValues = z.infer<typeof schema>

type Resultado = { codigo: string; notificado: boolean; datos: FormValues }

/**
 * Reporte de suplantación de identidad: público y sin sesión (quien lo sufre puede no
 * tener cuenta, o tenerla tomada por otro). Deja un código, como los botones de consumo.
 */
export default function ReporteSuplantacion() {
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { situacion: "" } })

  async function onSubmit(values: FormValues) {
    setSubmitting(true)
    try {
      const r = await api.post<Omit<Resultado, "datos">>("/api/reportes-suplantacion", values)
      setResultado({ ...r, datos: values })
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : `No se pudo enviar. Escribinos a ${CONTACT_EMAIL}.`
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Seguridad"
        title="Reportar suplantación de identidad"
        description="Si alguien usó tu nombre o tu DNI en Medilu (para crear una cuenta, ver tu historia clínica o sacar turnos), contanos. No necesitás iniciar sesión."
      />
      <Container className="py-12">
        <div className="mx-auto max-w-2xl">
          {resultado ? (
            <Confirmacion resultado={resultado} />
          ) : (
            <Card>
              <CardContent className="p-6 sm:p-8">
                <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
                  <Field label="Nombre" htmlFor="nombre" required error={errors.nombre?.message}>
                    <Input id="nombre" autoComplete="given-name" className="h-10" aria-invalid={!!errors.nombre} {...register("nombre")} />
                  </Field>
                  <Field label="Apellido" htmlFor="apellido" required error={errors.apellido?.message}>
                    <Input id="apellido" autoComplete="family-name" className="h-10" aria-invalid={!!errors.apellido} {...register("apellido")} />
                  </Field>
                  <Field label="DNI" htmlFor="dni" required error={errors.dni?.message}>
                    <Input id="dni" inputMode="numeric" className="h-10" aria-invalid={!!errors.dni} {...register("dni")} />
                  </Field>
                  <Field label="Teléfono (opcional)" htmlFor="telefono" error={errors.telefono?.message}>
                    <Input id="telefono" type="tel" autoComplete="tel" className="h-10" aria-invalid={!!errors.telefono} {...register("telefono")} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field
                      label="Email"
                      htmlFor="email"
                      required
                      error={errors.email?.message}
                      hint="Te escribimos ahí. Si tu cuenta está tomada, usá otro email que sea tuyo."
                    >
                      <Input id="email" type="email" autoComplete="email" className="h-10" aria-invalid={!!errors.email} {...register("email")} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="¿Qué pasó?" htmlFor="situacion" required error={errors.situacion?.message}>
                      <Controller
                        name="situacion"
                        control={control}
                        render={({ field }) => (
                          <SelectField
                            id="situacion"
                            value={field.value}
                            onValueChange={field.onChange}
                            options={SITUACIONES}
                            invalid={!!errors.situacion}
                          />
                        )}
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field
                      label="Clínica o profesional (opcional)"
                      htmlFor="clinica"
                      error={errors.clinica?.message}
                      hint="Dónde te atendés, si lo sabés. Nos ayuda a encontrar el caso."
                    >
                      <Input id="clinica" className="h-10" aria-invalid={!!errors.clinica} {...register("clinica")} />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Contanos qué pasó" htmlFor="detalle" required error={errors.detalle?.message}>
                      <Textarea id="detalle" rows={5} aria-invalid={!!errors.detalle} {...register("detalle")} />
                    </Field>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      Usamos estos datos solo para investigar el caso. Más información en la{" "}
                      <Link to="/privacidad" className="font-medium text-primary underline-offset-2 hover:underline">
                        Política de privacidad
                      </Link>
                      .
                    </p>
                    <AvisoDatosPersonales />
                  </div>

                  <Button type="submit" size="lg" className="w-full sm:col-span-2" disabled={submitting}>
                    {submitting ? <Loader2 className="animate-spin" /> : <ShieldAlert />}
                    Enviar reporte
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </Container>
    </>
  )
}

function Confirmacion({ resultado }: { resultado: Resultado }) {
  const { codigo, notificado, datos } = resultado
  const situacion = SITUACIONES.find((s) => s.value === datos.situacion)?.label ?? datos.situacion
  const cuerpo = [
    `Código: ${codigo}`,
    `Nombre: ${datos.nombre} ${datos.apellido}`,
    `DNI: ${datos.dni}`,
    `Email: ${datos.email}`,
    `Teléfono: ${datos.telefono || "—"}`,
    `Qué pasó: ${situacion}`,
    `Clínica o profesional: ${datos.clinica || "—"}`,
    `Detalle: ${datos.detalle}`,
  ].join("\n")
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
    `Reporte de suplantación de identidad — ${codigo}`
  )}&body=${encodeURIComponent(cuerpo)}`

  return (
    <Card>
      <CardContent className="space-y-4 p-6 sm:p-8" role="status">
        <div className="flex items-center gap-3">
          <CircleCheck className="size-7 shrink-0 text-primary" aria-hidden />
          <h2 className="text-xl font-semibold">Recibimos tu reporte</h2>
        </div>
        <p className="text-muted-foreground">Tu código es:</p>
        <p className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-center font-mono text-lg font-semibold tracking-wide">
          {codigo}
        </p>
        {notificado ? (
          <p className="text-sm text-muted-foreground">
            Te lo enviamos también a <strong className="text-foreground">{datos.email}</strong>. Vamos a
            revisar el caso y te escribimos ahí.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Anotá el código. Para que nos llegue seguro, envianos también el reporte por email con
              un clic:
            </p>
            <Button asChild size="lg" className="w-full">
              <a href={mailto}>
                <Mail /> Enviar el reporte por email
              </a>
            </Button>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          Si tenés cuenta en Medilu y todavía podés entrar, cambiá tu contraseña ahora.
        </p>
      </CardContent>
    </Card>
  )
}
