import { useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { CircleCheck, Loader2, Send, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Container, PageHero } from "@/components/site/Section"
import { Field } from "@/components/form/Field"
import { SelectField } from "@/components/form/SelectField"
import { Consentimiento, CONSENTIMIENTO_REQUERIDO } from "@/components/form/Consentimiento"
import { SkeletonBloque } from "@/components/site/Skeletons"
import { api, ApiError } from "@/lib/api"
import { errorFechaNacimiento, FECHA_NAC_MIN, hoyAR } from "@/lib/fecha"
import { LEGAL_VERSION } from "@/lib/site"

/**
 * Fase AA: el paciente carga sus datos personales desde el link que le mandó el
 * profesional (sin cuenta). El token del link es la única llave; ver
 * backend/controllers/linkDatosController.js.
 */

type Link = {
  clinica: string
  profesional: string
  /** El link es de una ficha que ya existe: hay que confirmar el DNI. */
  existente: boolean
  venceEn: string
  obrasSociales: { id: number; nombre: string; sigla: string | null }[]
}

type Cuenta = { estado: "creada" | "vinculada" } | null

const SEXO = [
  { value: "Masculino", label: "Masculino" },
  { value: "Femenino", label: "Femenino" },
  { value: "Otro", label: "Otro" },
]

const VACIO = {
  dni: "",
  nombre: "",
  apellido: "",
  fechaNacimiento: "",
  sexo: "",
  telefono: "",
  email: "",
  direccion: "",
  idObraSocial: "",
  nroAfiliado: "",
  plan: "",
}

/** El backend valida con zod y devuelve el primer campo inválido en `detalles`. */
function mensajeError(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return fallback
  const det = (err.data as { detalles?: { mensaje: string }[] } | null)?.detalles
  return det?.[0]?.mensaje || err.message || fallback
}

export default function CompletarDatos() {
  const [params] = useSearchParams()
  const token = params.get("token") || ""

  const [link, setLink] = useState<Link | null>(null)
  const [estado, setEstado] = useState<"cargando" | "ok" | "invalido" | "usado" | "listo">("cargando")
  const [form, setForm] = useState(VACIO)
  const [acepta, setAcepta] = useState(false)
  const [errores, setErrores] = useState<Partial<Record<keyof typeof VACIO | "acepta", string>>>({})
  const [errorEnvio, setErrorEnvio] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [cuenta, setCuenta] = useState<Cuenta>(null)

  useEffect(() => {
    if (!token) {
      setEstado("invalido")
      return
    }
    api
      .get<Link>(`/api/datos-paciente?token=${encodeURIComponent(token)}`)
      .then((d) => {
        setLink(d)
        setEstado("ok")
      })
      .catch((err) => setEstado(err instanceof ApiError && err.status === 410 ? "usado" : "invalido"))
  }, [token])

  const set = (k: keyof typeof VACIO) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setForm((f) => ({ ...f, [k]: v }))
    setErrores((er) => ({ ...er, [k]: undefined }))
  }
  const setValor = (k: keyof typeof VACIO) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrores((er) => ({ ...er, [k]: undefined }))
  }

  const particular =
    link?.obrasSociales.find((o) => String(o.id) === form.idObraSocial)?.nombre === "Particular"

  function validar() {
    const e: typeof errores = {}
    const dni = form.dni.replace(/\D/g, "")
    if (!dni) e.dni = "Escribí tu DNI."
    else if (dni.length < 6 || dni.length > 9) e.dni = "El DNI tiene que tener entre 6 y 9 números."
    if (!form.nombre.trim()) e.nombre = "Escribí tu nombre."
    if (!form.apellido.trim()) e.apellido = "Escribí tu apellido."
    if (!form.fechaNacimiento) e.fechaNacimiento = "Cargá tu fecha de nacimiento."
    else {
      const f = errorFechaNacimiento(form.fechaNacimiento)
      if (f) e.fechaNacimiento = f
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "El email no es válido."
    if (!acepta) e.acepta = CONSENTIMIENTO_REQUERIDO
    setErrores(e)
    return Object.keys(e).length === 0
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    setErrorEnvio("")
    if (!validar()) return
    setEnviando(true)
    try {
      const r = await api.post<{ ok: true; cuenta: Cuenta }>("/api/datos-paciente", {
        token,
        dni: form.dni.replace(/\D/g, ""),
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        fechaNacimiento: form.fechaNacimiento,
        sexo: form.sexo,
        telefono: form.telefono.trim(),
        email: form.email.trim(),
        direccion: form.direccion.trim(),
        ...(form.idObraSocial ? { idObraSocial: Number(form.idObraSocial) } : {}),
        nroAfiliado: particular ? "" : form.nroAfiliado.trim(),
        plan: particular ? "" : form.plan.trim(),
        aceptaTerminos: true,
        versionLegal: LEGAL_VERSION,
      })
      setCuenta(r.cuenta)
      setEstado("listo")
      window.scrollTo({ top: 0 })
    } catch (err) {
      if (err instanceof ApiError && err.status === 410 && /anul/.test(err.message)) {
        setEstado("usado")
        return
      }
      setErrorEnvio(mensajeError(err, "No se pudieron guardar tus datos. Probá de nuevo."))
    } finally {
      setEnviando(false)
    }
  }

  const quien = link
    ? [link.profesional, link.clinica].filter(Boolean).join(" · ")
    : ""

  return (
    <>
      <PageHero
        eyebrow="Historia clínica"
        title="Completá tus datos"
        description={
          quien
            ? `${quien} te pide tus datos personales para tu historia clínica.`
            : "Cargá tus datos personales para tu historia clínica."
        }
      />

      <Container className="py-10 sm:py-12">
        <div className="mx-auto max-w-2xl">
          {estado === "cargando" && <SkeletonBloque className="h-[32rem] w-full rounded-xl" />}

          {(estado === "invalido" || estado === "usado") && (
            <Card>
              <CardContent className="p-6 text-center">
                <TriangleAlert className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 font-medium">
                  {estado === "usado" ? "Este link ya no se puede usar" : "Link inválido o vencido"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {estado === "usado"
                    ? "Ya se usó para cargar los datos o se anuló. Si necesitás corregir algo, pedile un link nuevo a tu profesional."
                    : "Revisá que el link esté completo o pedile uno nuevo a tu profesional."}
                </p>
              </CardContent>
            </Card>
          )}

          {estado === "listo" && (
            <Card>
              <CardContent className="p-6 text-center">
                <CircleCheck className="mx-auto size-10 text-primary" />
                <p className="mt-3 text-lg font-semibold">¡Listo, gracias!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tus datos quedaron cargados en tu ficha{link?.clinica ? ` de ${link.clinica}` : ""}. Ya podés cerrar esta página.
                </p>
                {cuenta?.estado === "creada" && (
                  <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm">
                    Te mandamos un email con tu acceso a Medilu para que veas tu historia clínica y tus turnos.
                  </p>
                )}
                {cuenta?.estado === "vinculada" && (
                  <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm">
                    Ya tenías cuenta en Medilu: vas a ver esta ficha entrando con tu email.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {estado === "ok" && link && (
            <Card>
              <CardContent className="p-4 sm:p-6">
                <form onSubmit={enviar} noValidate className="space-y-6">
                  {link.existente && (
                    <Alert>
                      <AlertDescription>
                        Para proteger tu ficha, escribí el mismo DNI que tenés registrado en la clínica.
                      </AlertDescription>
                    </Alert>
                  )}

                  <section className="grid gap-4 sm:grid-cols-2">
                    <h2 className="text-base font-semibold sm:col-span-2">Datos personales</h2>
                    <Field label="DNI" htmlFor="cd-dni" required error={errores.dni} hint="Solo números, sin puntos.">
                      <Input
                        id="cd-dni"
                        inputMode="numeric"
                        autoComplete="off"
                        className="h-10"
                        aria-invalid={!!errores.dni}
                        value={form.dni}
                        onChange={set("dni")}
                        maxLength={12}
                      />
                    </Field>
                    <Field label="Fecha de nacimiento" htmlFor="cd-fnac" required error={errores.fechaNacimiento}>
                      <Input
                        id="cd-fnac"
                        type="date"
                        min={FECHA_NAC_MIN}
                        max={hoyAR()}
                        className="h-10"
                        aria-invalid={!!errores.fechaNacimiento}
                        value={form.fechaNacimiento}
                        onChange={set("fechaNacimiento")}
                      />
                    </Field>
                    <Field label="Nombre" htmlFor="cd-nombre" required error={errores.nombre}>
                      <Input
                        id="cd-nombre"
                        autoComplete="given-name"
                        className="h-10"
                        aria-invalid={!!errores.nombre}
                        value={form.nombre}
                        onChange={set("nombre")}
                        maxLength={120}
                      />
                    </Field>
                    <Field label="Apellido" htmlFor="cd-apellido" required error={errores.apellido}>
                      <Input
                        id="cd-apellido"
                        autoComplete="family-name"
                        className="h-10"
                        aria-invalid={!!errores.apellido}
                        value={form.apellido}
                        onChange={set("apellido")}
                        maxLength={120}
                      />
                    </Field>
                    <Field label="Sexo" htmlFor="cd-sexo">
                      <SelectField id="cd-sexo" value={form.sexo} onValueChange={setValor("sexo")} options={SEXO} />
                    </Field>
                    <Field label="Teléfono" htmlFor="cd-tel">
                      <Input
                        id="cd-tel"
                        type="tel"
                        autoComplete="tel"
                        className="h-10"
                        value={form.telefono}
                        onChange={set("telefono")}
                        maxLength={30}
                      />
                    </Field>
                    <Field
                      label="Email"
                      htmlFor="cd-email"
                      error={errores.email}
                      hint="Si no tenés cuenta en Medilu, te mandamos el acceso para ver tu historia clínica."
                    >
                      <Input
                        id="cd-email"
                        type="email"
                        autoComplete="email"
                        className="h-10"
                        aria-invalid={!!errores.email}
                        value={form.email}
                        onChange={set("email")}
                      />
                    </Field>
                    <Field label="Dirección" htmlFor="cd-dir">
                      <Input
                        id="cd-dir"
                        autoComplete="street-address"
                        className="h-10"
                        value={form.direccion}
                        onChange={set("direccion")}
                        maxLength={200}
                      />
                    </Field>
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2">
                    <h2 className="text-base font-semibold sm:col-span-2">Cobertura</h2>
                    <Field
                      label="Obra social o prepaga"
                      htmlFor="cd-os"
                      className="sm:col-span-2"
                      hint="Si no tenés o no está en el listado, elegí “Particular”."
                    >
                      <SelectField
                        id="cd-os"
                        value={form.idObraSocial}
                        onValueChange={setValor("idObraSocial")}
                        placeholder="Elegí tu obra social"
                        options={link.obrasSociales.map((o) => ({
                          value: String(o.id),
                          label: o.sigla ? `${o.nombre} (${o.sigla})` : o.nombre,
                        }))}
                      />
                    </Field>
                    <Field label="N.º de afiliado" htmlFor="cd-afiliado">
                      <Input
                        id="cd-afiliado"
                        className="h-10"
                        value={form.nroAfiliado}
                        onChange={set("nroAfiliado")}
                        maxLength={40}
                        disabled={particular}
                      />
                    </Field>
                    <Field label="Plan" htmlFor="cd-plan">
                      <Input
                        id="cd-plan"
                        className="h-10"
                        value={form.plan}
                        onChange={set("plan")}
                        maxLength={60}
                        disabled={particular}
                      />
                    </Field>
                  </section>

                  <Consentimiento
                    checked={acepta}
                    onCheckedChange={(v) => {
                      setAcepta(v)
                      setErrores((er) => ({ ...er, acepta: undefined }))
                    }}
                    error={errores.acepta}
                    salud
                  />

                  {errorEnvio && (
                    <Alert variant="destructive">
                      <TriangleAlert />
                      <AlertDescription>{errorEnvio}</AlertDescription>
                    </Alert>
                  )}

                  <Button type="submit" size="lg" className="w-full" disabled={enviando}>
                    {enviando ? <Loader2 className="animate-spin" /> : <Send />}
                    Enviar mis datos
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    El link es personal y se puede usar una sola vez.
                  </p>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </Container>
    </>
  )
}
