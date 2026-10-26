import { useEffect, useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { toast } from "sonner"
import { Loader2, Download, FileText, User, ArrowLeft, FileJson, Eye, Tags, Building2, KeyRound, Link2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field } from "@/components/form/Field"
import { Container, PageHero } from "@/components/site/Section"
import { api, ApiError } from "@/lib/api"
import { useUser } from "@/hooks/useUser"
import { downloadPatientHistoryPdf, type Paciente } from "@/lib/patientPdf"
import { Odontogram } from "@/components/dashboard/Odontogram"
import { TarjetaPediatrica } from "@/components/dashboard/pediatria/PanelPediatrico"
import type { DatosPediatricos } from "@/lib/pediatria/tipos"
import { CodificacionResumen } from "@/components/form/CodificacionEditor"
import { ACCION_LABEL } from "@/lib/auditoria"
import { formatFechaHora } from "@/lib/fecha"

type Acceso = { id: number; fecha: string; actor: string; rol: string; accion: string; clinica?: string }

const ROL_LABEL: Record<string, string> = {
  admin: "Administración",
  profesional: "Profesional",
  auditor: "Auditoría médica",
  recepcion: "Recepción",
}

/** Fase Z: curvas de crecimiento, vacunas y desarrollo (solo lectura, si hay datos). */
function CrecimientoYVacunas() {
  const [datos, setDatos] = useState<
    (DatosPediatricos & { nombre: string; sexo: string; fechaNacimientoIso: string }) | null
  >(null)

  useEffect(() => {
    api
      .get<DatosPediatricos & { nombre: string; sexo: string; fechaNacimientoIso: string }>("/api/mi-cuenta/pediatria")
      .then(setDatos)
      .catch(() => setDatos(null))
  }, [])

  if (!datos || !datos.fechaNacimientoIso) return null
  const hay = datos.perinatal || datos.mediciones.length || datos.vacunas.length || datos.hitos.length
  if (!hay) return null
  return (
    <TarjetaPediatrica
      nombre={datos.nombre}
      nacimiento={datos.fechaNacimientoIso}
      sexo={datos.sexo}
      datos={datos}
      readOnly
    />
  )
}

/** Fase K: quién accedió a la historia clínica del paciente (bitácora). */
function AccesosHistoria() {
  const [accesos, setAccesos] = useState<Acceso[] | null>(null)

  useEffect(() => {
    api
      .get<{ accesos: Acceso[] }>("/api/mi-cuenta/accesos")
      .then((d) => setAccesos(d.accesos || []))
      .catch(() => setAccesos([]))
  }, [])

  return (
    <>
      <h3 className="mt-8 flex items-center gap-2 text-lg font-semibold">
        <Eye className="size-5 text-primary" />
        Quién accedió a tu historia clínica
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Cada vez que alguien de una clínica abre, carga o audita tu historia queda registrado.
      </p>
      {accesos === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      ) : accesos.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Todavía no hay accesos registrados.</p>
      ) : (
        <Card className="mt-4">
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {accesos.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                  <span>
                    <span className="font-medium">{a.actor || "Personal de la clínica"}</span>
                    {a.rol && <span className="text-muted-foreground"> · {ROL_LABEL[a.rol] ?? a.rol}</span>}
                    <span className="block text-muted-foreground">
                      {ACCION_LABEL[a.accion] ?? a.accion}
                      {a.clinica && ` · ${a.clinica}`}
                    </span>
                  </span>
                  <span className="text-xs whitespace-nowrap text-muted-foreground">{formatFechaHora(a.fecha)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}

/**
 * Fase V: el paciente suma la historia que le cargaron en un consultorio sin su email,
 * con el código que le dio el profesional. Se muestra siempre (no depende del DNI).
 */
function VincularHistoria({ onVinculada }: { onVinculada: () => void }) {
  const [open, setOpen] = useState(false)
  const [codigo, setCodigo] = useState("")
  const [enviando, setEnviando] = useState(false)

  async function vincular(e: React.FormEvent) {
    e.preventDefault()
    if (!codigo.trim()) {
      toast.warning("Ingresá el código que te dio tu profesional.")
      return
    }
    setEnviando(true)
    try {
      const r = await api.post<{ clinica?: string }>("/api/mi-cuenta/vincular-historia", { codigo: codigo.trim() })
      toast.success(r.clinica ? `Sumamos tu historia de ${r.clinica}.` : "Sumamos tu historia clínica.")
      setOpen(false)
      setCodigo("")
      onVinculada()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo vincular la historia clínica.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      <Card className="mt-8">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="font-medium">¿Te atendiste en un consultorio que usa Medilu?</p>
            <p className="text-sm text-muted-foreground">
              Si no ves esa historia acá, pedile a tu profesional tu código de vinculación.
            </p>
          </div>
          <Button variant="outline" onClick={() => setOpen(true)}>
            <Link2 /> Vincular historia
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular historia clínica</DialogTitle>
            <DialogDescription>
              Ingresá el código que te dio tu profesional. Tiene que ser de una historia cargada con tu
              mismo DNI.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={vincular} className="space-y-4">
            <Field label="Código de vinculación" htmlFor="codigo-vinculacion" required>
              <Input
                id="codigo-vinculacion"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABCD-1234"
                className="h-10 font-mono uppercase tracking-wider"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? <Loader2 className="animate-spin" /> : <KeyRound />}
                Vincular
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function MiHistoria() {
  const { user, loading: loadingUser } = useUser()
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [loading, setLoading] = useState(true)

  const esPaciente = user?.role === "paciente"

  function cargarHistoria() {
    api
      .get<Paciente>("/api/mi-cuenta/historia")
      .then((d) => setPaciente(d))
      .catch(() => toast.error("No se pudo cargar tu historia clínica."))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!esPaciente) return
    cargarHistoria()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esPaciente])

  async function descargarJson() {
    try {
      const res = await fetch("/api/mi-cuenta/historia/export", {
        credentials: "include",
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const cd = res.headers.get("Content-Disposition") || ""
      const m = cd.match(/filename="?([^"]+)"?/)
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = m?.[1] || "mi-historia-clinica.json"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error("No se pudo descargar el archivo.")
    }
  }

  if (loadingUser) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }
  if (!user || !esPaciente) {
    return <Navigate to="/login" replace />
  }

  const datos = paciente
    ? [
        ["Teléfono", paciente.telefono],
        ["Email", paciente.email],
        ["DNI", paciente.dni],
        ["Dirección", paciente.direccion],
        ["Fecha de nacimiento", paciente.fechaNacimiento],
        ["Edad", paciente.edad],
        ["Obra social", paciente.obraSocial],
        ["N.º de afiliado", paciente.nroAfiliado],
        ["Plan", paciente.plan],
        ["Sexo", paciente.sexo],
        ["Fecha de apertura", paciente.fechaApertura],
        // Fase O: la historia junta los registros de todas sus clínicas.
        ...((paciente.clinicas?.length ?? 0) > 1 ? [["Clínicas", paciente.clinicas?.join(", ")]] : []),
      ]
    : []

  return (
    <>
      <PageHero
        eyebrow="Mi cuenta"
        title="Mi historia clínica"
        description="Tu ficha, el historial de tus consultas y quién accedió a ellos."
      />

      <Container className="py-12">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="ghost">
              <Link to="/mis-turnos">
                <ArrowLeft /> Volver a mi cuenta
              </Link>
            </Button>
            {paciente && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={descargarJson}>
                  <FileJson /> Descargar JSON
                </Button>
                <Button onClick={() => downloadPatientHistoryPdf(paciente)}>
                  <Download /> Descargar PDF
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : !paciente ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                No pudimos cargar tu historia clínica.
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-center gap-3">
                    <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                      <User className="size-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">
                        {paciente.fullName}
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Datos del paciente
                      </p>
                    </div>
                  </div>
                  <dl className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {datos.map(([label, value]) => (
                      <div key={String(label)} className="flex flex-col">
                        <dt className="text-xs font-medium text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="text-sm">{value || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>

              <CrecimientoYVacunas />

              <h3 className="mt-8 flex items-center gap-2 text-lg font-semibold">
                <FileText className="size-5 text-primary" />
                Historial de consultas
              </h3>

              {paciente.history?.length ? (
                <div className="mt-4 space-y-4">
                  {paciente.history.map((e, i) => (
                    <Card key={i}>
                      <CardContent className="p-5">
                        {e.clinica && (
                          <Badge variant="secondary" className="mb-3 font-normal">
                            <Building2 /> {e.clinica}
                          </Badge>
                        )}
                        <div className="flex flex-col gap-1 border-b border-border pb-3 sm:flex-row sm:flex-wrap sm:justify-between sm:gap-2">
                          <span className="text-sm">
                            <span className="font-medium text-muted-foreground">
                              Profesional:{" "}
                            </span>
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
                          <span className="text-sm">
                            <span className="font-medium text-muted-foreground">
                              Área:{" "}
                            </span>
                            {e.area}
                          </span>
                          <span className="text-sm">
                            <span className="font-medium text-muted-foreground">
                              Fecha:{" "}
                            </span>
                            {e.fecha}hs
                          </span>
                        </div>
                        <div className="mt-3 space-y-2 text-sm">
                          <p>
                            <span className="font-medium text-muted-foreground">
                              Síntomas:{" "}
                            </span>
                            {e.sintomas}
                          </p>
                          <p>
                            <span className="font-medium text-muted-foreground">
                              Diagnóstico:{" "}
                            </span>
                            {e.diagnostico}
                          </p>
                          <p>
                            <span className="font-medium text-muted-foreground">
                              Tratamiento:{" "}
                            </span>
                            {e.tratamiento}
                          </p>
                        </div>
                        {((e.diagnosticos?.length ?? 0) > 0 || (e.practicas?.length ?? 0) > 0) && (
                          <div className="mt-4 border-t border-border pt-4">
                            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                              <Tags className="size-4" /> Codificación
                            </p>
                            <CodificacionResumen diagnosticos={e.diagnosticos} practicas={e.practicas} />
                          </div>
                        )}
                        {e.dientes && e.dientes.length > 0 && (
                          <div className="mt-4 border-t border-border pt-4">
                            <p className="mb-2 text-sm font-medium text-muted-foreground">
                              Odontograma
                            </p>
                            <Odontogram value={e.dientes} readOnly />
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No hay consultas registradas.
                </p>
              )}

              <VincularHistoria onVinculada={cargarHistoria} />

              <AccesosHistoria />
            </>
          )}
        </div>
      </Container>
    </>
  )
}
