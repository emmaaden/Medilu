import { useEffect, useMemo, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import {
  CalendarPlus,
  ListChecks,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CalendarClock,
  Building2,
  LogIn,
  MapPin,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Field } from "@/components/form/Field"
import { SelectField } from "@/components/form/SelectField"
import { Container, PageHero } from "@/components/site/Section"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { api, ApiError } from "@/lib/api"
import { useUser } from "@/hooks/useUser"
import { AR_TZ, hoyAR, sumarDias } from "@/lib/fecha"
import { LEGAL_VERSION } from "@/lib/site"
import { Consentimiento, CONSENTIMIENTO_REQUERIDO } from "@/components/form/Consentimiento"

type Professional = { id: number | string; nombre: string; id_calendario?: string }
type ProfArea = { area: string; professionals: Professional[] }
// Fase N: el paciente elige la clínica (con su dirección y descripción) antes de reservar.
type ClinicaPublica = {
  slug: string
  nombre: string
  direccion: string | null
  descripcion: string | null
}

const mapsUrl = (direccion: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`

const COUNTRIES = [
  { name: "Argentina", code: "+54" },
  { name: "Chile", code: "+56" },
  { name: "Uruguay", code: "+598" },
  { name: "Paraguay", code: "+595" },
  { name: "Bolivia", code: "+591" },
  { name: "Brasil", code: "+55" },
  { name: "Perú", code: "+51" },
  { name: "Colombia", code: "+57" },
  { name: "México", code: "+52" },
  { name: "España", code: "+34" },
  { name: "Estados Unidos", code: "+1" },
]

function formatSlotLocal(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    timeZone: AR_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

type View = "menu" | "clinica" | "reservar"

export default function Turnos() {
  const [params, setParams] = useSearchParams()
  const clinica = params.get("clinica") || ""
  const { user } = useUser()

  const [view, setView] = useState<View>("menu")
  const [areas, setAreas] = useState<ProfArea[]>([])
  const [clinicaInfo, setClinicaInfo] = useState<ClinicaPublica | null>(null)
  // Fase L: una clínica con la suscripción vencida no recibe turnos online.
  const [recibeTurnos, setRecibeTurnos] = useState(true)

  const [area, setArea] = useState("")
  const [profId, setProfId] = useState("")

  useEffect(() => {
    setArea("")
    setProfId("")
    setAreas([])
    setClinicaInfo(null)
    setRecibeTurnos(true)
    // Sin clínica elegida no se listan profesionales: primero se elige la clínica.
    if (!clinica) return

    api
      .get<ProfArea[]>(`/professionals?clinica=${encodeURIComponent(clinica)}`)
      .then((d) => setAreas(Array.isArray(d) ? d : []))
      .catch(() => toast.error("No se pudieron cargar los profesionales"))

    api
      .get<ClinicaPublica & { recibeTurnos?: boolean }>(
        `/clinica-publica?clinica=${encodeURIComponent(clinica)}`
      )
      .then((d) => {
        if (d?.nombre) setClinicaInfo(d)
        setRecibeTurnos(d?.recibeTurnos !== false)
      })
      .catch(() => {})
  }, [clinica])

  function elegirClinica(slug: string) {
    setParams({ clinica: slug })
    setView("reservar")
  }

  function cambiarClinica() {
    setParams({})
    setView("clinica")
  }

  const clinicaNombre = clinicaInfo?.nombre ?? null

  const areaOptions = useMemo(
    () => areas.map((a) => ({ value: a.area, label: a.area })),
    [areas]
  )
  const profOptions = useMemo(() => {
    const found = areas.find((a) => a.area === area)
    return (found?.professionals || []).map((p) => ({
      value: String(p.id),
      label: p.nombre,
    }))
  }, [areas, area])

  function reset() {
    setView("menu")
    setArea("")
    setProfId("")
  }

  const profName =
    areas
      .find((a) => a.area === area)
      ?.professionals.find((p) => String(p.id) === profId)?.nombre || ""

  // Si se pierde la clínica de la URL (p. ej. con el botón Atrás), se vuelve a elegir.
  const paso: View = view === "reservar" && !clinica ? "clinica" : view

  return (
    <>
      <PageHero
        eyebrow="Turnos"
        title={clinicaNombre ? `Turnos · ${clinicaNombre}` : "Reservá tu turno"}
        description="Elegí la clínica, la especialidad y el profesional para ver la disponibilidad en tiempo real."
      />

      <Container className="py-12">
        <div className="mx-auto max-w-2xl">
          {clinicaNombre && paso === "menu" && (
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1 text-sm text-muted-foreground">
              <Building2 className="size-4 text-primary" /> {clinicaNombre}
            </div>
          )}

          {!recibeTurnos && (
            <p className="mb-6 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="status">
              Esta clínica no está tomando turnos online por el momento. Comunicate
              directamente con la clínica para reservar.
            </p>
          )}

          {paso === "menu" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {recibeTurnos && (
              <button
                type="button"
                onClick={() => setView(clinica ? "reservar" : "clinica")}
                className="group rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className="h-full transition-[translate,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:ring-primary/40 motion-reduce:group-hover:translate-y-0">
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <CalendarPlus className="size-6" />
                    </div>
                    <h2 className="mt-4 text-lg font-semibold">Agendar turno</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Reservá una nueva consulta con el profesional que elijas.
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      Continuar <ArrowRight className="size-4" />
                    </span>
                  </CardContent>
                </Card>
              </button>
              )}

              <Link
                to={user?.role === "paciente" ? "/mis-turnos" : "/login"}
                className="group rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className="h-full transition-[translate,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:ring-primary/40 motion-reduce:group-hover:translate-y-0">
                  <CardContent className="p-4 sm:p-6">
                    <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      {user?.role === "paciente" ? (
                        <ListChecks className="size-6" />
                      ) : (
                        <LogIn className="size-6" />
                      )}
                    </div>
                    <h2 className="mt-4 text-lg font-semibold">Mis turnos</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {user?.role === "paciente"
                        ? "Consultá o cancelá tus turnos desde tu cuenta."
                        : "Iniciá sesión para ver tus turnos. Si reservaste como invitado, usá el enlace que te llegó por email."}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      {user?.role === "paciente"
                        ? "Ver mis turnos"
                        : "Iniciar sesión"}{" "}
                      <ArrowRight className="size-4" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </div>
          )}

          {paso === "clinica" && (
            <>
              <Button variant="ghost" onClick={reset} className="mb-4">
                <ArrowLeft /> Volver
              </Button>
              <ClinicaPicker onPick={elegirClinica} />
            </>
          )}

          {paso === "reservar" && (
            <>
              <Button variant="ghost" onClick={reset} className="mb-4">
                <ArrowLeft /> Volver
              </Button>

              {clinicaInfo && (
                <ClinicaResumen clinica={clinicaInfo} onCambiar={cambiarClinica} />
              )}

              <Card className="mt-6">
                <CardContent className="space-y-4 p-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Especialidad" htmlFor="area" required>
                      <SelectField
                        id="area"
                        value={area}
                        onValueChange={(v) => {
                          setArea(v)
                          setProfId("")
                        }}
                        options={areaOptions}
                        placeholder={
                          areaOptions.length ? "Seleccionar…" : "Cargando…"
                        }
                      />
                    </Field>
                    <Field label="Profesional" htmlFor="prof" required>
                      <SelectField
                        id="prof"
                        value={profId}
                        onValueChange={setProfId}
                        options={profOptions}
                        disabled={!area}
                        placeholder={
                          area ? "Seleccionar…" : "Elegí una especialidad"
                        }
                      />
                    </Field>
                  </div>
                </CardContent>
              </Card>

              {profId && (
                <ReservarForm
                  profId={profId}
                  profName={profName}
                  clinica={clinica}
                  clinicaInfo={clinicaInfo}
                  prefillName={user?.fullName || ""}
                  prefillEmail={user?.email || ""}
                  lockEmail={!!user}
                  // El paciente logueado ya prestó el consentimiento al registrarse.
                  pideConsentimiento={user?.role !== "paciente"}
                />
              )}
            </>
          )}
        </div>
      </Container>
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Elegir clínica (Fase N)                                                    */
/* -------------------------------------------------------------------------- */
function ClinicaPicker({ onPick }: { onPick: (slug: string) => void }) {
  const [clinicas, setClinicas] = useState<ClinicaPublica[] | null>(null)

  useEffect(() => {
    api
      .get<ClinicaPublica[]>("/clinica-publica/lista")
      .then((d) => setClinicas(Array.isArray(d) ? d : []))
      .catch(() => {
        setClinicas([])
        toast.error("No se pudieron cargar las clínicas")
      })
  }, [])

  return (
    <div>
      <h2 className="text-lg font-semibold">Elegí la clínica</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Revisá dónde queda antes de reservar tu turno.
      </p>

      {clinicas === null ? (
        <div className="mt-5 grid gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : clinicas.length === 0 ? (
        <p className="mt-5 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground" role="status">
          No hay clínicas tomando turnos online por el momento.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3">
          {clinicas.map((c) => (
            <li key={c.slug}>
              <button
                type="button"
                onClick={() => onPick(c.slug)}
                className="group w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card className="transition-[translate,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:ring-primary/40 motion-reduce:group-hover:translate-y-0">
                  <CardContent className="flex items-start gap-4 p-4 sm:p-5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Building2 className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold">{c.nombre}</h3>
                      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0 break-words">
                          {c.direccion || "Dirección no informada"}
                        </span>
                      </p>
                      {c.descripcion && (
                        <p className="mt-2 line-clamp-3 text-sm break-words whitespace-pre-line">
                          {c.descripcion}
                        </p>
                      )}
                    </div>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-primary" />
                  </CardContent>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ClinicaResumen({
  clinica,
  onCambiar,
}: {
  clinica: ClinicaPublica
  onCambiar: () => void
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-start gap-4 p-4 sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-lg font-semibold">{clinica.nombre}</h2>
          {clinica.direccion ? (
            <a
              href={mapsUrl(clinica.direccion)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-start gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
            >
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">{clinica.direccion}</span>
              <span className="sr-only"> (abre Google Maps)</span>
            </a>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" /> Dirección no informada
            </p>
          )}
          {clinica.descripcion && (
            <p className="mt-3 text-sm break-words whitespace-pre-line text-muted-foreground">
              {clinica.descripcion}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onCambiar}>
          Cambiar clínica
        </Button>
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Reservar                                                                   */
/* -------------------------------------------------------------------------- */
function ReservarForm({
  profId,
  profName,
  clinica,
  clinicaInfo,
  prefillName,
  prefillEmail,
  lockEmail,
  pideConsentimiento,
}: {
  profId: string
  profName: string
  clinica: string
  clinicaInfo: ClinicaPublica | null
  prefillName: string
  prefillEmail: string
  lockEmail: boolean
  pideConsentimiento: boolean
}) {
  // Fecha de HOY en Argentina (no en UTC: después de las 21 h, toISOString ya da mañana).
  const today = hoyAR()
  const [date, setDate] = useState("")
  const [slots, setSlots] = useState<string[]>([])
  const [slot, setSlot] = useState("")
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [nearest, setNearest] = useState("")

  const [name, setName] = useState(prefillName)
  const [email, setEmail] = useState(prefillEmail)
  const [code, setCode] = useState("+54")
  const [number, setNumber] = useState("")
  const [acepta, setAcepta] = useState(false)
  const [aceptaError, setAceptaError] = useState<string | undefined>()

  // La sesión (useUser) llega async: si aparece un dato de perfil, lo prellenamos.
  useEffect(() => {
    if (prefillName) setName(prefillName)
  }, [prefillName])
  useEffect(() => {
    if (prefillEmail) setEmail(prefillEmail)
  }, [prefillEmail])

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!date) return
    setLoadingSlots(true)
    setSlot("")
    api
      .get<string[]>(
        `/available-slots?date=${encodeURIComponent(date)}&profId=${encodeURIComponent(profId)}`
      )
      .then((s) => {
        const arr = Array.isArray(s) ? [...s].sort() : []
        setSlots(arr)
        if (arr.length) setNearest(`Turno más cercano: ${formatSlotLocal(arr[0])}hs`)
        else {
          setNearest("No hay turnos ese día. Buscando el más cercano…")
          searchNearest()
        }
      })
      .catch(() => toast.error("No se pudieron cargar los horarios"))
      .finally(() => setLoadingSlots(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, profId])

  async function searchNearest() {
    let d = hoyAR()
    for (let i = 0; i < 60; i++) {
      try {
        const s = await api.get<string[]>(
          `/available-slots?date=${encodeURIComponent(d)}&profId=${encodeURIComponent(profId)}`
        )
        if (Array.isArray(s) && s.length) {
          setNearest(`Turno más cercano: ${formatSlotLocal([...s].sort()[0])}hs`)
          return
        }
      } catch {
        return
      }
      d = sumarDias(d, 1)
    }
    setNearest("No se encontraron turnos disponibles próximamente.")
  }

  function openConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !slot) {
      toast.warning("Completá nombre, email y elegí un horario.")
      return
    }
    if (pideConsentimiento && !acepta) {
      setAceptaError(CONSENTIMIENTO_REQUERIDO)
      document.getElementById("consentimiento-turno")?.focus()
      return
    }
    if (new Date(slot) < new Date()) {
      toast.error("No podés elegir una fecha pasada.")
      return
    }
    setConfirmOpen(true)
  }

  async function confirmar() {
    setSubmitting(true)
    const start = new Date(slot)
    try {
      const res = await api.post<{ success?: boolean }>("/create-event", {
        summary: `Cita con ${name}`,
        name,
        start: {
          dateTime: start.toISOString(),
          timeZone: "America/Argentina/Buenos_Aires",
        },
        end: {
          dateTime: new Date(start.getTime() + 30 * 60000).toISOString(),
          timeZone: "America/Argentina/Buenos_Aires",
        },
        email,
        // Teléfono opcional: solo se envía si se cargó (minimización de datos).
        number: number.trim() || undefined,
        numberCode: number.trim() ? code : undefined,
        profId,
        clinica: clinica || undefined,
        aceptaTerminos: pideConsentimiento ? acepta : undefined,
        versionLegal: pideConsentimiento ? LEGAL_VERSION : undefined,
      })
      if (res.success) {
        setConfirmOpen(false)
        toast.success("¡Turno agendado con éxito!")
        setDate("")
        setSlot("")
        setSlots([])
        setName("")
        setEmail("")
        setNumber("")
        setAcepta(false)
      } else {
        toast.error("Turno no agendado. Intentá de nuevo.")
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Turno no agendado."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="mt-6">
      <CardContent className="p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Datos del turno</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Con {profName}. Elegí la fecha y completá tus datos.
        </p>

        <form onSubmit={openConfirm} className="mt-5 space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fecha" htmlFor="date" required>
              <Input
                id="date"
                type="date"
                min={today}
                className="h-10"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Horario disponible" htmlFor="slot" required>
              <SelectField
                id="slot"
                value={slot}
                onValueChange={setSlot}
                options={slots.map((s) => ({
                  value: s,
                  label: formatSlotLocal(s),
                }))}
                disabled={!date || loadingSlots || !slots.length}
                placeholder={
                  !date
                    ? "Elegí una fecha"
                    : loadingSlots
                      ? "Cargando…"
                      : slots.length
                        ? "Seleccionar…"
                        : "Sin turnos ese día"
                }
              />
            </Field>
          </div>
          {nearest && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarClock className="size-4 text-primary" /> {nearest}
            </p>
          )}

          <Field label="Nombre y apellido" htmlFor="name" required>
            <Input
              id="name"
              autoComplete="name"
              className="h-10"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              className="h-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              readOnly={lockEmail}
              aria-readonly={lockEmail}
            />
            {lockEmail && (
              <p className="mt-1 text-xs text-muted-foreground">
                Usamos el email de tu cuenta. El turno queda asociado a ella.
              </p>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_1fr]">
            <Field label="Código de país" htmlFor="code">
              <SelectField
                id="code"
                value={code}
                onValueChange={setCode}
                options={COUNTRIES.map((c) => ({
                  value: c.code,
                  label: `${c.name} (${c.code})`,
                }))}
              />
            </Field>
            <Field
              label="Teléfono (opcional)"
              htmlFor="number"
              hint="Para que el consultorio pueda avisarte si hay cambios."
            >
              <Input
                id="number"
                type="tel"
                autoComplete="tel-national"
                className="h-10"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
              />
            </Field>
          </div>

          {pideConsentimiento && (
            <Consentimiento
              id="consentimiento-turno"
              checked={acepta}
              onCheckedChange={(v) => {
                setAcepta(v)
                if (v) setAceptaError(undefined)
              }}
              error={aceptaError}
              salud
            />
          )}

          <Button type="submit" size="lg" className="w-full">
            <CalendarPlus />
            Revisar y confirmar turno
          </Button>
        </form>
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmá tu turno</DialogTitle>
            <DialogDescription>
              Revisá que los datos sean correctos antes de agendar.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            {clinicaInfo && <Row label="Clínica" value={clinicaInfo.nombre} />}
            {clinicaInfo?.direccion && (
              <Row label="Dirección" value={clinicaInfo.direccion} />
            )}
            <Row label="Profesional" value={profName} />
            <Row label="Fecha y hora" value={slot ? `${formatSlotLocal(slot)}hs` : "—"} />
            <Row label="Nombre" value={name} />
            <Row label="Email" value={email} />
            <Row label="Teléfono" value={number.trim() ? `${code} ${number}` : "—"} />
          </dl>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              Volver
            </Button>
            <Button onClick={confirmar} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
              Confirmar turno
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}

