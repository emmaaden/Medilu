import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import {
  Search,
  UserPlus,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Download,
  Save,
  FileText,
  User,
  Stethoscope,
  ShieldCheck,
  Pencil,
  Tags,
  ClipboardList,
  Mail,
  MailCheck,
  TriangleAlert,
  UserCheck,
  KeyRound,
  Copy,
  Check,
  RefreshCw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field } from "@/components/form/Field"
import { DictationTextarea } from "@/components/form/DictationTextarea"
import { SelectField } from "@/components/form/SelectField"
import { CoberturaFields } from "@/components/form/CoberturaFields"
import { CodificacionEditor, CodificacionResumen } from "@/components/form/CodificacionEditor"
import { Container } from "@/components/site/Section"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Odontogram, type Diente } from "@/components/dashboard/Odontogram"
import { FichaObraSocialDialog } from "@/components/dashboard/FichaObraSocialDialog"
import { api, ApiError } from "@/lib/api"
import { downloadPatientHistoryPdf, type Paciente } from "@/lib/patientPdf"
import { useAuth } from "@/contexts/AuthContext"
import { tieneFeature } from "@/lib/planes"
import {
  COBERTURA_VACIA,
  CODIFICACION_VACIA,
  coberturaPayload,
  codificacionPayload,
  type Cobertura,
  type Codificacion,
} from "@/lib/catalogos"
import { ESTADO_AUDITORIA, type EstadoAuditoria } from "@/lib/auditoria"
import { errorFechaNacimiento, FECHA_NAC_MIN, hoyAR } from "@/lib/fecha"

const SEXO = [
  { value: "Masculino", label: "Masculino" },
  { value: "Femenino", label: "Femenino" },
  { value: "Otro", label: "Otro" },
]

type View = "menu" | "registrar" | "buscar"

const emptyForm = {
  nombre: "",
  apellido: "",
  dni: "",
  telefono: "",
  email: "",
  sexo: "",
  direccion: "",
  fechaNacimiento: "",
  edad: "",
  sintomas: "",
  diagnostico: "",
  tratamiento: "",
}

export default function RegistroClinico() {
  const { user } = useAuth()
  const [area, setArea] = useState("")
  const [view, setView] = useState<View>("menu")

  useEffect(() => {
    if (!user?.email) return
    api
      .post<{ area?: string }>("/auth/get-area", { email: user.email })
      .then((d) => setArea(d.area || ""))
      .catch(() => {})
  }, [user?.email])

  // La especialidad odontológica se llama "Odontología" en la base; aceptamos
  // también "Dentista" y variantes de mayúsculas por robustez.
  const isOdonto = /odonto|dentista/i.test(area)

  return (
    <Container className="py-8 sm:py-12">
      <h1 className="text-2xl font-semibold sm:text-3xl">Registro clínico</h1>
      <p className="mt-1 text-muted-foreground">
        {area ? `Área: ${area}` : "Gestión de pacientes y consultas."}
      </p>

      {view === "menu" && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <MenuCard
            icon={Search}
            title="Buscar paciente"
            description="Consultá la ficha, el historial y cargá una nueva consulta."
            onClick={() => setView("buscar")}
          />
          <MenuCard
            icon={UserPlus}
            title="Registrar paciente"
            description="Dá de alta un paciente nuevo con su primera consulta."
            onClick={() => setView("registrar")}
          />
        </div>
      )}

      {view === "registrar" && (
        <RegistrarPaciente
          isOdonto={isOdonto}
          profesional={user?.fullName || ""}
          area={area}
          onBack={() => setView("menu")}
        />
      )}

      {view === "buscar" && (
        <BuscarPaciente
          isOdonto={isOdonto}
          profesional={user?.fullName || ""}
          area={area}
          onBack={() => setView("menu")}
        />
      )}
    </Container>
  )
}

function MenuCard({
  icon: Icon,
  title,
  description,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className="group text-left">
      <Card className="h-full transition-[translate,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:ring-primary/40 motion-reduce:group-hover:translate-y-0">
        <CardContent className="p-4 sm:p-6">
          <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <Icon className="size-6" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            Continuar <ArrowRight className="size-4" />
          </span>
        </CardContent>
      </Card>
    </button>
  )
}

/* --------------------------- Registrar --------------------------- */

/** Resultado de crear/vincular la cuenta del paciente (ver backend/utils/cuentaPaciente.js). */
type CuentaPaciente = {
  estado: "creada" | "vinculada" | "email_en_uso" | "sin_email" | "error"
  mailEnviado?: boolean
  /** El alta no espera el email: sale en segundo plano. */
  mailEnCurso?: boolean
  claveTemporal?: string
  /** Sin email: código para que el paciente vincule su historia cuando se registre. */
  codigo?: string
  venceEn?: string
}

type Vinculo = { codigo: string; venceEn: string }

/** "ABCD2345" -> "ABCD-2345" (más fácil de dictar). */
function formatoCodigo(codigo: string) {
  return codigo.length === 8 ? `${codigo.slice(0, 4)}-${codigo.slice(4)}` : codigo
}

/** Código de vinculación con su vencimiento y las instrucciones para el paciente. */
function CodigoVinculacion({ vinculo }: { vinculo: Vinculo }) {
  const [copiado, setCopiado] = useState(false)
  const codigo = formatoCodigo(vinculo.codigo)
  const vence = new Date(vinculo.venceEn).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
  })

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      toast.error("No se pudo copiar.")
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
        <p className="text-xs text-muted-foreground">Código de vinculación</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-wider">{codigo}</p>
        <p className="mt-1 text-xs text-muted-foreground">Vale hasta el {vence} y se usa una sola vez.</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={copiar}>
          {copiado ? <Check /> : <Copy />}
          {copiado ? "Copiado" : "Copiar código"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Dáselo al paciente: se registra en Medilu con su DNI, entra a{" "}
        <strong className="text-foreground">Mi historia → Vincular historia</strong> y carga este
        código. Lo podés volver a ver desde su ficha, en “Enviar acceso”.
      </p>
    </div>
  )
}

function errorCode(err: unknown) {
  if (!(err instanceof ApiError) || !err.data || typeof err.data !== "object") return undefined
  return (err.data as { code?: string }).code
}

/** Qué pasó con el acceso del paciente, para mostrárselo al profesional. */
function AccesoResultado({ cuenta, email }: { cuenta: CuentaPaciente; email: string }) {
  if (cuenta.estado === "creada" && (cuenta.mailEnviado || cuenta.mailEnCurso)) {
    return (
      <Alert>
        <MailCheck aria-hidden />
        <AlertTitle>
          {cuenta.mailEnviado ? "Le enviamos sus datos de acceso" : "Le estamos enviando sus datos de acceso"}
        </AlertTitle>
        <AlertDescription>
          <p>
            Llegan a <strong className="break-all text-foreground">{email}</strong> en unos minutos.
            Con eso entra a Medilu y ve su historia clínica. Si no le llega, que revise el spam o
            entre con “¿Olvidaste tu contraseña?”.
          </p>
        </AlertDescription>
      </Alert>
    )
  }
  if (cuenta.estado === "creada") {
    return (
      <div className="space-y-3">
        <Alert>
          <TriangleAlert aria-hidden />
          <AlertTitle>No pudimos enviar el email</AlertTitle>
          <AlertDescription>
            <p>
              La cuenta quedó creada con <span className="break-all">{email}</span>. Dale esta
              contraseña temporal al paciente para que entre y la cambie.
            </p>
          </AlertDescription>
        </Alert>
        {cuenta.claveTemporal && (
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
            <p className="text-xs text-muted-foreground">Contraseña temporal</p>
            <p className="mt-1 font-mono text-xl font-semibold">{cuenta.claveTemporal}</p>
          </div>
        )}
      </div>
    )
  }
  if (cuenta.estado === "vinculada") {
    return (
      <Alert>
        <MailCheck aria-hidden />
        <AlertTitle>El paciente ya tenía cuenta en Medilu</AlertTitle>
        <AlertDescription>
          <p>
            Lo sumamos a tu clínica: va a ver esta consulta en su cuenta, con su email y contraseña
            de siempre.
          </p>
        </AlertDescription>
      </Alert>
    )
  }
  if (cuenta.estado === "sin_email") {
    if (cuenta.codigo && cuenta.venceEn) {
      return <CodigoVinculacion vinculo={{ codigo: cuenta.codigo, venceEn: cuenta.venceEn }} />
    }
    return (
      <Alert>
        <KeyRound aria-hidden />
        <AlertTitle>Se registró sin email</AlertTitle>
        <AlertDescription>
          <p>
            Para que vea su historia en Medilu, pedí su código de vinculación desde su ficha con
            “Enviar acceso”.
          </p>
        </AlertDescription>
      </Alert>
    )
  }
  if (cuenta.estado === "email_en_uso") {
    return (
      <Alert>
        <TriangleAlert aria-hidden />
        <AlertTitle>Ese email ya tiene otra cuenta</AlertTitle>
        <AlertDescription>
          <p>
            <span className="break-all">{email}</span> ya está en uso en Medilu, así que no le
            creamos acceso. Si el email era otro, corregilo desde su ficha con “Enviar acceso”.
          </p>
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Alert>
      <TriangleAlert aria-hidden />
      <AlertTitle>No pudimos crear su acceso</AlertTitle>
      <AlertDescription>
        <p>Probá de nuevo desde su ficha con “Enviar acceso”.</p>
      </AlertDescription>
    </Alert>
  )
}

function RegistrarPaciente({
  isOdonto,
  profesional,
  area,
  onBack,
}: {
  isOdonto: boolean
  profesional: string
  area: string
  onBack: () => void
}) {
  const [form, setForm] = useState({ ...emptyForm })
  const [cobertura, setCobertura] = useState<Cobertura>(COBERTURA_VACIA)
  const [codificacion, setCodificacion] = useState<Codificacion>(CODIFICACION_VACIA)
  const [dientes, setDientes] = useState<Diente[]>([])
  const [saving, setSaving] = useState(false)
  // DNI que ya es paciente de la clínica: se ofrece cargar sus datos.
  const [duplicado, setDuplicado] = useState<{ dni: string; fullName: string } | null>(null)
  const [cargandoExistente, setCargandoExistente] = useState(false)
  // Paciente existente elegido: la consulta se guarda en su historia.
  const [existente, setExistente] = useState<Paciente | null>(null)
  const [confirmarEmail, setConfirmarEmail] = useState(false)
  const [resultado, setResultado] = useState<{ cuenta: CuentaPaciente; email: string } | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function verificarDni() {
    const dni = form.dni.trim()
    if (!dni || existente || duplicado?.dni === dni) return
    try {
      const r = await api.post<{ existe: boolean; fullName?: string }>("/pacient/existe-pacient", { dni })
      setDuplicado(r.existe ? { dni, fullName: r.fullName || "" } : null)
    } catch {
      // Si falla, el alta igual lo detecta al guardar.
    }
  }

  async function cargarExistente() {
    if (!duplicado) return
    setCargandoExistente(true)
    try {
      const data = await api.post<Paciente>("/pacient/get-data-pacient", { dni: duplicado.dni })
      setExistente(data)
      setDuplicado(null)
      // Odontograma: arrancar del último conocido si todavía no marcó nada.
      if (dientes.length === 0) setDientes(data.history?.[data.history.length - 1]?.dientes || [])
    } catch {
      toast.error("No se pudieron cargar los datos del paciente.")
    } finally {
      setCargandoExistente(false)
    }
  }

  function usarOtroPaciente() {
    setExistente(null)
    setForm((f) => ({ ...f, dni: "" }))
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (existente) {
      void guardarConsultaExistente()
      return
    }
    const req = ["nombre", "apellido", "dni", "telefono", "sexo", "direccion", "fechaNacimiento"] as const
    if (req.some((k) => !form[k]) || !cobertura.idObraSocial) {
      toast.warning("Completá los datos personales obligatorios.")
      return
    }
    const errorFecha = errorFechaNacimiento(form.fechaNacimiento)
    if (errorFecha) {
      toast.warning(errorFecha)
      return
    }
    if (duplicado?.dni === form.dni.trim()) {
      toast.warning("Ese DNI ya es paciente de tu clínica. Cargá sus datos para seguir.")
      return
    }
    // El email es por donde le llegan sus datos de acceso: se confirma antes de guardar.
    // Sin email se registra directo y se le da un código de vinculación.
    if (form.email.trim()) setConfirmarEmail(true)
    else void registrar()
  }

  async function registrar() {
    setConfirmarEmail(false)
    setSaving(true)
    try {
      const r = await api.post<{ cuenta?: CuentaPaciente }>("/pacient/regis-pacient", {
        nombre: form.nombre.trim(),
        apellido: form.apellido.trim(),
        dni: form.dni,
        telefono: form.telefono,
        email: form.email.trim(),
        sexo: form.sexo,
        direccion: form.direccion,
        fechaNacimiento: form.fechaNacimiento,
        edad: form.edad,
        ...coberturaPayload(cobertura),
        area,
        profesional,
        sintomas: form.sintomas,
        diagnostico: form.diagnostico,
        tratamiento: form.tratamiento,
        fecha: new Date(),
        ...(isOdonto ? { dientes } : {}),
        ...codificacionPayload(codificacion),
      })
      setResultado({ cuenta: r.cuenta || { estado: "error" }, email: form.email.trim() })
    } catch (err) {
      if (errorCode(err) === "PACIENTE_EXISTENTE") {
        setDuplicado({ dni: form.dni.trim(), fullName: "" })
        toast.warning("Ese DNI ya es paciente de tu clínica. Cargá sus datos para seguir.")
        return
      }
      toast.error(
        err instanceof ApiError
          ? `No se pudo registrar: ${err.message}`
          : "No se pudo registrar el paciente."
      )
    } finally {
      setSaving(false)
    }
  }

  async function guardarConsultaExistente() {
    if (!existente) return
    if (!form.sintomas && !form.diagnostico && !form.tratamiento && !codificacion.diagnosticos.length && !codificacion.practicas.length) {
      toast.warning("Cargá al menos un dato de la consulta.")
      return
    }
    setSaving(true)
    try {
      await api.post("/pacient/save-data-pacient", {
        dni: existente.dni,
        area,
        profesional,
        sintomas: form.sintomas,
        diagnostico: form.diagnostico,
        tratamiento: form.tratamiento,
        fecha: new Date(),
        ...(isOdonto ? { dientes } : {}),
        ...codificacionPayload(codificacion),
      })
      toast.success(`Consulta guardada en la historia de ${existente.fullName}`)
      onBack()
    } catch (err) {
      toast.error(err instanceof ApiError ? `No guardado: ${err.message}` : "No se pudo guardar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-6">
      <Button variant="ghost" onClick={onBack} className="mb-4">
        <ArrowLeft /> Volver
      </Button>

      <form onSubmit={guardar} className="space-y-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <User className="size-5 text-primary" /> Datos personales
            </h2>
            {existente ? (
              <div className="mt-4 space-y-4">
                <Alert>
                  <UserCheck aria-hidden />
                  <AlertTitle>Paciente ya registrado en tu clínica</AlertTitle>
                  <AlertDescription>
                    <p>La consulta se guarda en su historia clínica.</p>
                  </AlertDescription>
                </Alert>
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(
                    [
                      ["Nombre", existente.fullName],
                      ["DNI", existente.dni],
                      ["Email", existente.email],
                      ["Teléfono", existente.telefono],
                      ["Fecha de nacimiento", existente.fechaNacimiento],
                      ["Obra social", existente.obraSocial],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex min-w-0 flex-col">
                      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                      <dd className="break-words text-sm">{value || "—"}</dd>
                    </div>
                  ))}
                </dl>
                <Button type="button" variant="outline" size="sm" onClick={usarOtroPaciente}>
                  Cargar otro paciente
                </Button>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Nombre" htmlFor="nombre" required>
                  <Input id="nombre" className="h-10" value={form.nombre} onChange={set("nombre")} />
                </Field>
                <Field label="Apellido" htmlFor="apellido" required>
                  <Input id="apellido" className="h-10" value={form.apellido} onChange={set("apellido")} />
                </Field>
                <Field label="DNI" htmlFor="dni" required>
                  <Input
                    id="dni"
                    type="number"
                    inputMode="numeric"
                    className="h-10"
                    value={form.dni}
                    onChange={set("dni")}
                    onBlur={verificarDni}
                  />
                </Field>
                {duplicado && duplicado.dni === form.dni.trim() && (
                  <Alert className="sm:col-span-2">
                    <UserCheck aria-hidden />
                    <AlertTitle>
                      {duplicado.fullName
                        ? `${duplicado.fullName} ya es paciente de tu clínica`
                        : "Ese DNI ya es paciente de tu clínica"}
                    </AlertTitle>
                    <AlertDescription>
                      <p>No hace falta registrarlo de nuevo: cargá sus datos y seguí con la consulta.</p>
                      <Button type="button" size="sm" onClick={cargarExistente} disabled={cargandoExistente}>
                        {cargandoExistente ? <Loader2 className="animate-spin" /> : <UserCheck />}
                        Cargar sus datos
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <Field label="Teléfono" htmlFor="telefono" required>
                  <Input id="telefono" type="tel" className="h-10" value={form.telefono} onChange={set("telefono")} />
                </Field>
                <Field
                  label="Email del paciente"
                  htmlFor="email"
                  hint="Si lo cargás, tiene que ser el suyo y estar bien escrito: ahí le enviamos sus datos para entrar a Medilu. Si no lo sabés, dejalo vacío y te damos un código para que vincule su historia cuando se registre."
                >
                  <Input
                    id="email"
                    type="email"
                    autoComplete="off"
                    className="h-10"
                    value={form.email}
                    onChange={set("email")}
                  />
                </Field>
                <Field label="Sexo" htmlFor="sexo" required>
                  <SelectField
                    id="sexo"
                    value={form.sexo}
                    onValueChange={(v) => setForm((f) => ({ ...f, sexo: v }))}
                    options={SEXO}
                  />
                </Field>
                <Field label="Dirección" htmlFor="direccion" required>
                  <Input id="direccion" className="h-10" value={form.direccion} onChange={set("direccion")} />
                </Field>
                <Field
                  label="Fecha de nacimiento"
                  htmlFor="fechaNacimiento"
                  required
                  error={errorFechaNacimiento(form.fechaNacimiento) ?? undefined}
                >
                  <Input
                    id="fechaNacimiento"
                    type="date"
                    min={FECHA_NAC_MIN}
                    max={hoyAR()}
                    className="h-10"
                    aria-invalid={!!errorFechaNacimiento(form.fechaNacimiento)}
                    value={form.fechaNacimiento}
                    onChange={set("fechaNacimiento")}
                  />
                </Field>
                <Field label="Edad" htmlFor="edad">
                  <Input id="edad" type="number" className="h-10" value={form.edad} onChange={set("edad")} />
                </Field>
                <CoberturaFields value={cobertura} onChange={setCobertura} required idPrefix="reg" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 sm:p-6">
            <h2 className="flex items-center gap-2 font-semibold">
              <Stethoscope className="size-5 text-primary" /> {existente ? "Nueva consulta" : "Primera consulta"}
            </h2>
            <div className="mt-4 space-y-4">
              <Field label="Síntomas" htmlFor="sintomas">
                <DictationTextarea id="sintomas" rows={2} value={form.sintomas} onValueChange={(v) => setForm((f) => ({ ...f, sintomas: v }))} />
              </Field>
              <Field label="Diagnóstico" htmlFor="diagnostico">
                <DictationTextarea id="diagnostico" rows={2} value={form.diagnostico} onValueChange={(v) => setForm((f) => ({ ...f, diagnostico: v }))} />
              </Field>
              <Field label="Tratamiento" htmlFor="tratamiento">
                <DictationTextarea id="tratamiento" rows={2} value={form.tratamiento} onValueChange={(v) => setForm((f) => ({ ...f, tratamiento: v }))} />
              </Field>
              <CodificacionEditor value={codificacion} onChange={setCodificacion} dni={existente?.dni} />
            </div>
          </CardContent>
        </Card>

        {isOdonto && (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <h2 className="font-semibold">Odontograma</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tocá un diente para registrar su estado.
              </p>
              <div className="mt-4">
                <Odontogram value={dientes} onChange={setDientes} />
              </div>
            </CardContent>
          </Card>
        )}

        <Button type="submit" size="lg" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : existente ? <Save /> : <UserPlus />}
          {existente ? "Guardar consulta" : "Registrar paciente"}
        </Button>
      </form>

      <Dialog open={confirmarEmail} onOpenChange={setConfirmarEmail}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿El email del paciente es correcto?</DialogTitle>
            <DialogDescription>
              Le vamos a enviar sus datos de acceso a Medilu a este email. Si está mal escrito o no
              es suyo, otra persona podría entrar a su historia clínica.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-center font-medium break-all">
            {form.email.trim()}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarEmail(false)}>
              <Pencil /> Corregir
            </Button>
            <Button onClick={registrar}>
              <UserPlus /> Sí, registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!resultado} onOpenChange={(o) => !o && (setResultado(null), onBack())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paciente registrado</DialogTitle>
            <DialogDescription>La primera consulta quedó guardada en su historia clínica.</DialogDescription>
          </DialogHeader>
          {resultado && <AccesoResultado cuenta={resultado.cuenta} email={resultado.email} />}
          <DialogFooter>
            <Button
              onClick={() => {
                setResultado(null)
                onBack()
              }}
            >
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Crea la cuenta de un paciente de la clínica que todavía no tiene acceso. */
function EnviarAccesoDialog({
  paciente,
  open,
  onOpenChange,
  onEnviado,
}: {
  paciente: Paciente
  open: boolean
  onOpenChange: (o: boolean) => void
  onEnviado: () => void
}) {
  // El contenido se desmonta al cerrar, así que cada apertura arranca de cero.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <EnviarAccesoContenido
          paciente={paciente}
          onClose={() => onOpenChange(false)}
          onEnviado={onEnviado}
        />
      </DialogContent>
    </Dialog>
  )
}

function EnviarAccesoContenido({
  paciente,
  onClose,
  onEnviado,
}: {
  paciente: Paciente
  onClose: () => void
  onEnviado: () => void
}) {
  const [email, setEmail] = useState(paciente.email || "")
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ cuenta: CuentaPaciente; email: string } | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    const destino = email.trim()
    if (!destino) {
      toast.warning("Cargá el email del paciente.")
      return
    }
    setEnviando(true)
    try {
      const r = await api.post<{ cuenta: CuentaPaciente }>("/pacient/enviar-acceso", {
        dni: paciente.dni,
        email: destino,
      })
      setResultado({ cuenta: r.cuenta, email: destino })
      if (r.cuenta.estado === "creada") onEnviado()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo enviar el acceso.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Acceso a Medilu</DialogTitle>
        <DialogDescription>
          {paciente.fullName} todavía no tiene cuenta. Si tenés su email, le creamos una y le
          enviamos los datos para entrar. Si no, dale un código para que vincule su historia cuando
          se registre.
        </DialogDescription>
      </DialogHeader>
      {resultado ? (
        <>
          <AccesoResultado cuenta={resultado.cuenta} email={resultado.email} />
          <DialogFooter>
            <Button onClick={onClose}>Listo</Button>
          </DialogFooter>
        </>
      ) : (
        <Tabs defaultValue={paciente.email ? "email" : "codigo"}>
          <TabsList className="w-full">
            <TabsTrigger value="email">
              <Mail /> Por email
            </TabsTrigger>
            <TabsTrigger value="codigo">
              <KeyRound /> Con código
            </TabsTrigger>
          </TabsList>
          <TabsContent value="email">
            <form onSubmit={enviar} className="space-y-4 pt-2">
              <Field
                label="Email del paciente"
                htmlFor="acceso-email"
                required
                hint="Revisá que sea el suyo y esté bien escrito: ahí le llegan los datos para entrar."
              >
                <Input
                  id="acceso-email"
                  type="email"
                  autoComplete="off"
                  className="h-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={enviando}>
                  {enviando ? <Loader2 className="animate-spin" /> : <Mail />}
                  Enviar acceso
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
          <TabsContent value="codigo">
            <div className="space-y-4 pt-2">
              <CodigoVinculacionFicha dni={paciente.dni} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  Cerrar
                </Button>
              </DialogFooter>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}

/** Código de vinculación de un paciente sin cuenta: el vigente, o uno nuevo. */
function CodigoVinculacionFicha({ dni }: { dni: string }) {
  const [vinculo, setVinculo] = useState<Vinculo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState("")

  async function pedir(regenerar: boolean) {
    setCargando(true)
    setError("")
    try {
      setVinculo(await api.post<Vinculo>("/pacient/codigo-vinculacion", { dni, regenerar }))
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No se pudo obtener el código."
      setError(msg)
      if (regenerar) toast.error(msg)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void pedir(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dni])

  if (cargando && !vinculo) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    )
  }
  if (!vinculo) {
    return (
      <Alert>
        <TriangleAlert aria-hidden />
        <AlertTitle>No pudimos obtener el código</AlertTitle>
        <AlertDescription>
          <p>{error}</p>
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <div className="space-y-3">
      <CodigoVinculacion vinculo={vinculo} />
      <Button type="button" variant="ghost" size="sm" disabled={cargando} onClick={() => void pedir(true)}>
        {cargando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        Generar uno nuevo (el anterior deja de valer)
      </Button>
    </div>
  )
}

/* --------------------------- Buscar / ficha --------------------------- */
function BuscarPaciente({
  isOdonto,
  profesional,
  area,
  onBack,
}: {
  isOdonto: boolean
  profesional: string
  area: string
  onBack: () => void
}) {
  const { user } = useAuth()
  const [dni, setDni] = useState("")
  const [loading, setLoading] = useState(false)
  const [paciente, setPaciente] = useState<Paciente | null>(null)

  // Nueva consulta
  const [sintomas, setSintomas] = useState("")
  const [diagnostico, setDiagnostico] = useState("")
  const [tratamiento, setTratamiento] = useState("")
  const [dientes, setDientes] = useState<Diente[]>([])
  const [codificacion, setCodificacion] = useState<Codificacion>(CODIFICACION_VACIA)
  const [saving, setSaving] = useState(false)
  // Fase K: edición de la cobertura del paciente.
  const [editCob, setEditCob] = useState<Cobertura | null>(null)
  const [savingCob, setSavingCob] = useState(false)
  const [fichaOs, setFichaOs] = useState(false)
  const [enviarAcceso, setEnviarAcceso] = useState(false)

  async function guardarCobertura() {
    if (!paciente || !editCob) return
    if (!editCob.idObraSocial) {
      toast.warning("Elegí la obra social.")
      return
    }
    setSavingCob(true)
    try {
      await api.put("/pacient/cobertura", { dni: paciente.dni, ...coberturaPayload(editCob) })
      toast.success("Cobertura actualizada")
      setEditCob(null)
      setPaciente(await api.post<Paciente>("/pacient/get-data-pacient", { dni: paciente.dni }))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar la cobertura.")
    } finally {
      setSavingCob(false)
    }
  }

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    if (!dni) return
    setLoading(true)
    try {
      const data = await api.post<Paciente>("/pacient/get-data-pacient", { dni })
      setPaciente(data)
      // Cargar el último odontograma conocido, si existe.
      const last = data.history?.[data.history.length - 1]
      setDientes(last?.dientes || [])
    } catch {
      toast.error("Datos incorrectos. Asegurate de que el paciente esté registrado.")
    } finally {
      setLoading(false)
    }
  }

  async function guardarConsulta() {
    if (!paciente) return
    if (!sintomas && !diagnostico && !tratamiento && !codificacion.diagnosticos.length && !codificacion.practicas.length) {
      toast.warning("Cargá al menos un dato de la consulta.")
      return
    }
    setSaving(true)
    try {
      await api.post("/pacient/save-data-pacient", {
        dni: paciente.dni,
        area,
        profesional,
        sintomas,
        diagnostico,
        tratamiento,
        fecha: new Date(),
        ...(isOdonto ? { dientes } : {}),
        ...codificacionPayload(codificacion),
      })
      toast.success("Consulta guardada")
      setSintomas("")
      setDiagnostico("")
      setTratamiento("")
      setCodificacion(CODIFICACION_VACIA)
      // Refrescar ficha
      const data = await api.post<Paciente>("/pacient/get-data-pacient", {
        dni: paciente.dni,
      })
      setPaciente(data)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? `No guardado: ${err.message}` : "No se pudo guardar."
      )
    } finally {
      setSaving(false)
    }
  }

  if (!paciente) {
    return (
      <div className="mt-6 max-w-lg">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft /> Volver
        </Button>
        <Card>
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={buscar} className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="number"
                inputMode="numeric"
                placeholder="DNI del paciente"
                className="h-10"
                value={dni}
                onChange={(e) => setDni(e.target.value)}
              />
              <Button type="submit" size="lg" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" /> : <Search />}
                Buscar
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const datos: [string, React.ReactNode][] = [
    ["Teléfono", paciente.telefono],
    ["Email", paciente.email],
    ["DNI", paciente.dni],
    ["Sexo", paciente.sexo],
    ["Dirección", paciente.direccion],
    ["Fecha de nacimiento", paciente.fechaNacimiento],
    ["Edad", paciente.edad],
    ["Obra social", paciente.obraSocial],
    ["N.º de afiliado", paciente.nroAfiliado],
    ["Plan", paciente.plan],
    ["Fecha de apertura", paciente.fechaApertura],
  ]

  return (
    <div className="mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setPaciente(null)}>
          <ArrowLeft /> Nueva búsqueda
        </Button>
        <div className="flex flex-wrap gap-2">
          {tieneFeature(user?.plan, "autorizaciones") && (
            <Button variant="outline" asChild>
              <Link to={`/dashboard/autorizaciones?dni=${encodeURIComponent(paciente.dni)}`}>
                <ShieldCheck /> Solicitar autorización
              </Link>
            </Button>
          )}
          {paciente.tieneCuenta === false && (
            <Button variant="outline" onClick={() => setEnviarAcceso(true)}>
              <Mail /> Enviar acceso
            </Button>
          )}
          <Button variant="outline" onClick={() => setFichaOs(true)}>
            <ClipboardList /> Ficha obra social
          </Button>
          <Button variant="outline" onClick={() => downloadPatientHistoryPdf(paciente)}>
            <Download /> Descargar PDF
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <User className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xl font-semibold">{paciente.fullName}</h2>
              <p className="text-sm text-muted-foreground">Ficha del paciente</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setEditCob({
                  idObraSocial: paciente.idObraSocial ? String(paciente.idObraSocial) : "",
                  nroAfiliado: paciente.nroAfiliado || "",
                  plan: paciente.plan || "",
                })
              }
            >
              <Pencil /> Cobertura
            </Button>
          </div>
          <dl className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {datos.map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="text-sm">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Nueva consulta */}
      <Card className="mt-6">
        <CardContent className="p-4 sm:p-6">
          <h3 className="flex items-center gap-2 font-semibold">
            <Stethoscope className="size-5 text-primary" /> Nueva consulta
          </h3>
          <div className="mt-4 space-y-4">
            <Field label="Síntomas" htmlFor="s-sintomas">
              <DictationTextarea id="s-sintomas" rows={2} value={sintomas} onValueChange={setSintomas} />
            </Field>
            <Field label="Diagnóstico" htmlFor="s-diagnostico">
              <DictationTextarea id="s-diagnostico" rows={2} value={diagnostico} onValueChange={setDiagnostico} />
            </Field>
            <Field label="Tratamiento" htmlFor="s-tratamiento">
              <DictationTextarea id="s-tratamiento" rows={2} value={tratamiento} onValueChange={setTratamiento} />
            </Field>
            <CodificacionEditor value={codificacion} onChange={setCodificacion} dni={paciente.dni} />
            {isOdonto && (
              <div>
                <p className="mb-2 text-sm font-medium">Odontograma</p>
                <Odontogram value={dientes} onChange={setDientes} />
              </div>
            )}
            <Button onClick={guardarConsulta} disabled={saving} size="lg">
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Guardar consulta
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Historial */}
      <h3 className="mt-8 flex items-center gap-2 text-lg font-semibold">
        <FileText className="size-5 text-primary" /> Historial de consultas
      </h3>
      {paciente.history?.length ? (
        <div className="mt-4 space-y-4">
          {paciente.history.map((e, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex flex-wrap justify-between gap-2 border-b border-border pb-3 text-sm">
                  <span>
                    <span className="font-medium text-muted-foreground">Profesional: </span>
                    {e.profesional}
                    {e.importado && (
                      <Badge
                        variant="outline"
                        className="ml-2 font-normal"
                        title="Vino de otro sistema: la fecha y el profesional son los del archivo importado."
                      >
                        Importado
                      </Badge>
                    )}
                  </span>
                  <span>
                    <span className="font-medium text-muted-foreground">Área: </span>
                    {e.area}
                  </span>
                  <span>
                    <span className="font-medium text-muted-foreground">Fecha: </span>
                    {e.fecha}hs
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-sm">
                  <p><span className="font-medium text-muted-foreground">Síntomas: </span>{e.sintomas}</p>
                  <p><span className="font-medium text-muted-foreground">Diagnóstico: </span>{e.diagnostico}</p>
                  <p><span className="font-medium text-muted-foreground">Tratamiento: </span>{e.tratamiento}</p>
                </div>
                {((e.diagnosticos?.length ?? 0) > 0 || (e.practicas?.length ?? 0) > 0) && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <Tags className="size-4" /> Codificación
                    </p>
                    <CodificacionResumen diagnosticos={e.diagnosticos} practicas={e.practicas} />
                  </div>
                )}
                {e.auditoria && e.auditoria !== "pendiente" && (
                  <div className="mt-3">
                    <Badge variant={ESTADO_AUDITORIA[e.auditoria as EstadoAuditoria]?.variant ?? "outline"}>
                      Auditoría: {ESTADO_AUDITORIA[e.auditoria as EstadoAuditoria]?.label ?? e.auditoria}
                    </Badge>
                  </div>
                )}
                {e.dientes && e.dientes.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-sm font-medium text-muted-foreground">Odontograma</p>
                    <Odontogram value={e.dientes} readOnly />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">No hay consultas registradas.</p>
      )}

      <EnviarAccesoDialog
        paciente={paciente}
        open={enviarAcceso}
        onOpenChange={setEnviarAcceso}
        onEnviado={() => setPaciente({ ...paciente, tieneCuenta: true })}
      />

      <FichaObraSocialDialog
        open={fichaOs}
        onOpenChange={setFichaOs}
        paciente={paciente}
        idProfesional={user?.idRole}
        odontologica={isOdonto || !!paciente.history?.some((e) => e.dientes?.length)}
      />

      <Dialog open={!!editCob} onOpenChange={(o) => !o && setEditCob(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cobertura del paciente</DialogTitle>
            <DialogDescription>
              Obra social, número de afiliado y plan. Se usan en las autorizaciones y en la
              auditoría.
            </DialogDescription>
          </DialogHeader>
          {editCob && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CoberturaFields
                value={editCob}
                onChange={setEditCob}
                required
                idPrefix="edit-cob"
                textoLegado={!paciente.idObraSocial ? paciente.obraSocial : undefined}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCob(null)} disabled={savingCob}>
              Cancelar
            </Button>
            <Button onClick={guardarCobertura} disabled={savingCob}>
              {savingCob ? <Loader2 className="animate-spin" /> : <Save />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
