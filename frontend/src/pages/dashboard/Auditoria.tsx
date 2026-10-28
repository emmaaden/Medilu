import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MessageSquareReply,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Container } from "@/components/site/Section"
import { Odontogram } from "@/components/dashboard/Odontogram"
import { CodificacionResumen } from "@/components/form/CodificacionEditor"
import { AutorizacionesLista } from "@/components/dashboard/AutorizacionesLista"
import { api, ApiError } from "@/lib/api"
import { formatFecha, formatFechaHora, hoyAR, sumarDias } from "@/lib/fecha"
import {
  ACCION_LABEL,
  CHECKLIST_LABEL,
  ESTADO_AUDITORIA,
  type Acceso,
  type DetalleRegistro,
  type EstadoAuditoria,
  type EstadoRevision,
  type Paginado,
  type RegistroBandeja,
  type Revision,
} from "@/lib/auditoria"
import { useAuth } from "@/contexts/AuthContext"
import { SkeletonTabla, SkeletonIndicadores, SkeletonDetalle, PageSkeleton } from "@/components/site/Skeletons"

// Valor "sin filtro" de los Select (Radix no admite value="").
const TODOS = "todos"

/** Arma el query string omitiendo los filtros vacíos o en "todos". */
function qs(params: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "" && v !== TODOS) sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ""
}

function mensajeError(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

function EstadoBadge({ estado }: { estado: EstadoAuditoria }) {
  const meta = ESTADO_AUDITORIA[estado] ?? ESTADO_AUDITORIA.pendiente
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

function Paginacion({
  page,
  total,
  pageSize,
  onPage,
}: Paginado & { onPage: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-muted-foreground">
      <span>
        {total} {total === 1 ? "resultado" : "resultados"} · página {page} de {paginas}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft /> Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= paginas}
          onClick={() => onPage(page + 1)}
        >
          Siguiente <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

/* =============================== Página =============================== */

export default function Auditoria() {
  const { user, loading } = useAuth()

  // Solo auditor o admin de la clínica activa. (El backend además lo exige.)
  if (!loading && user && user.rol !== "auditor" && !user.esAdmin) {
    return <Navigate to="/dashboard" replace />
  }
  if (loading || !user) return <PageSkeleton />

  const esAuditor = user.rol === "auditor"
  const alcance = user.alcanceObraSocial

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Auditoría médica</h1>
          <p className="mt-1 text-muted-foreground">
            {esAuditor
              ? "Revisá los registros clínicos y dejá observaciones a los profesionales."
              : "Seguimiento de la auditoría y de los accesos a las historias clínicas."}
          </p>
        </div>
        <Badge variant="outline" className="font-normal">
          <ClipboardCheck />
          {esAuditor
            ? alcance
              ? `Alcance: ${alcance}`
              : "Auditoría interna"
            : "Vista de administración"}
        </Badge>
      </div>

      <Tabs defaultValue="bandeja">
        <TabsList className="mb-6 h-auto flex-wrap">
          <TabsTrigger value="bandeja">Bandeja</TabsTrigger>
          <TabsTrigger value="autorizaciones">Autorizaciones</TabsTrigger>
          <TabsTrigger value="asistencia">Asistencia</TabsTrigger>
          <TabsTrigger value="bitacora">Bitácora</TabsTrigger>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
        </TabsList>
        <TabsContent value="bandeja">
          <Bandeja puedeRevisar={esAuditor} />
        </TabsContent>
        <TabsContent value="autorizaciones">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <AutorizacionesLista
                modo={esAuditor ? "auditor" : "admin"}
                estadoInicial={esAuditor ? "pendiente" : "todas"}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="asistencia">
          <Asistencia />
        </TabsContent>
        <TabsContent value="bitacora">
          <Bitacora />
        </TabsContent>
        <TabsContent value="resumen">
          <Resumen />
        </TabsContent>
      </Tabs>
    </Container>
  )
}

/* =============================== Bandeja =============================== */

type FiltrosBandeja = {
  desde: string
  hasta: string
  idProfesional: string
  idObraSocial: string
  cie10: string
  estado: string
}

type OpcionesFiltro = {
  profesionales: { id: number; nombre: string }[]
  obrasSociales: { id: number | null; nombre: string }[]
  alcanceObraSocial: string | null
}

function Bandeja({ puedeRevisar }: { puedeRevisar: boolean }) {
  const [filtros, setFiltros] = useState<FiltrosBandeja>({
    desde: sumarDias(hoyAR(), -30),
    hasta: hoyAR(),
    idProfesional: TODOS,
    idObraSocial: TODOS,
    cie10: "",
    // El auditor arranca por lo que le falta revisar; el admin ve todo.
    estado: puedeRevisar ? "pendiente" : TODOS,
  })
  const [page, setPage] = useState(1)
  const [datos, setDatos] = useState<({ registros: RegistroBandeja[] } & Paginado) | null>(null)
  const [cargando, setCargando] = useState(true)
  const [opciones, setOpciones] = useState<OpcionesFiltro | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  // El código CIE-10 se aplica al confirmar (Enter o al salir del campo).
  const [cie10Borrador, setCie10Borrador] = useState("")

  useEffect(() => {
    api
      .get<OpcionesFiltro>("/auditoria/filtros")
      .then(setOpciones)
      .catch(() => toast.error("No se pudieron cargar los filtros."))
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const d = await api.get<{ registros: RegistroBandeja[] } & Paginado>(
        `/auditoria/registros${qs({ ...filtros, page })}`
      )
      setDatos(d)
    } catch (err) {
      toast.error(mensajeError(err, "No se pudo cargar la bandeja."))
    } finally {
      setCargando(false)
    }
  }, [filtros, page])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Estable: el panel de detalle lo usa en sus dependencias (evita recargas en bucle).
  const cerrarDetalle = useCallback(() => setAbierto(null), [])

  function setFiltro<K extends keyof FiltrosBandeja>(k: K, v: FiltrosBandeja[K]) {
    setFiltros((f) => ({ ...f, [k]: v }))
    setPage(1)
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="grid gap-1.5">
            <Label htmlFor="b-desde">Desde</Label>
            <Input
              id="b-desde"
              type="date"
              value={filtros.desde}
              max={filtros.hasta || undefined}
              onChange={(e) => setFiltro("desde", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-hasta">Hasta</Label>
            <Input
              id="b-hasta"
              type="date"
              value={filtros.hasta}
              min={filtros.desde || undefined}
              onChange={(e) => setFiltro("hasta", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-prof">Profesional</Label>
            <Select
              value={filtros.idProfesional}
              onValueChange={(v) => setFiltro("idProfesional", v)}
            >
              <SelectTrigger id="b-prof" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {opciones?.profesionales.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.nombre || `Profesional #${p.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-os">Obra social</Label>
            {opciones?.alcanceObraSocial ? (
              <Input id="b-os" value={opciones.alcanceObraSocial} disabled />
            ) : (
              <Select
                value={filtros.idObraSocial}
                onValueChange={(v) => setFiltro("idObraSocial", v)}
              >
                <SelectTrigger id="b-os" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todas</SelectItem>
                  {opciones?.obrasSociales
                    .filter((os) => os.id != null)
                    .map((os) => (
                      <SelectItem key={os.id} value={String(os.id)}>
                        {os.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-cie10">CIE-10</Label>
            <Input
              id="b-cie10"
              value={cie10Borrador}
              placeholder="Ej.: K02"
              maxLength={8}
              onChange={(e) => setCie10Borrador(e.target.value.toUpperCase())}
              onBlur={() => setFiltro("cie10", cie10Borrador.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") setFiltro("cie10", cie10Borrador.trim())
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="b-estado">Estado</Label>
            <Select value={filtros.estado} onValueChange={(v) => setFiltro("estado", v)}>
              <SelectTrigger id="b-estado" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {(Object.keys(ESTADO_AUDITORIA) as EstadoAuditoria[]).map((e) => (
                  <SelectItem key={e} value={e}>
                    {ESTADO_AUDITORIA[e].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Separator className="my-5" />

        {cargando && !datos ? (
          <SkeletonTabla />
        ) : datos && datos.registros.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Obra social</TableHead>
                  <TableHead>Profesional</TableHead>
                  <TableHead>CIE-10</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={cargando ? "opacity-60" : undefined}>
                {datos.registros.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatFechaHora(r.fecha)}</TableCell>
                    <TableCell>
                      <p className="font-medium">{r.paciente.nombre || "—"}</p>
                      <p className="text-xs text-muted-foreground">DNI {r.paciente.dni || "—"}</p>
                    </TableCell>
                    <TableCell>{r.paciente.obraSocial || "—"}</TableCell>
                    <TableCell>
                      <p>{r.profesional || "—"}</p>
                      {r.area && <p className="text-xs text-muted-foreground">{r.area}</p>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.codigos?.length ? r.codigos.join(", ") : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <EstadoBadge estado={r.estado} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setAbierto(r.id)}>
                        {puedeRevisar ? "Auditar" : "Ver"} <ChevronRight />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Paginacion
              page={datos.page}
              total={datos.total}
              pageSize={datos.pageSize}
              onPage={setPage}
            />
          </>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay registros con estos filtros.
          </p>
        )}
      </CardContent>

      <DetalleRegistroSheet
        id={abierto}
        puedeRevisar={puedeRevisar}
        onClose={cerrarDetalle}
        onRevisado={cargar}
      />
    </Card>
  )
}

/* ========================= Detalle + revisión ========================= */

function Campo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {titulo}
      </p>
      <p className="mt-1 text-sm whitespace-pre-wrap">{texto || "—"}</p>
    </div>
  )
}

function RevisionItem({ r }: { r: Revision }) {
  const items = Object.entries(r.checklist || {})
  return (
    <li className="rounded-lg border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <EstadoBadge estado={r.estado} />
        <span className="text-xs text-muted-foreground">
          {r.auditor || "Auditoría"} · {formatFechaHora(r.creadoEn)}
        </span>
      </div>
      {r.comentario && <p className="mt-2 whitespace-pre-wrap">{r.comentario}</p>}
      {items.length > 0 && (
        <ul className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
          {items.map(([k, ok]) => (
            <li key={k}>
              {ok ? "✓" : "✗"} {CHECKLIST_LABEL[k] ?? k}
            </li>
          ))}
        </ul>
      )}
      {r.respuesta && (
        <div className="mt-3 rounded-md bg-muted/50 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <MessageSquareReply className="size-3.5" /> Respuesta del profesional
            {r.respondidoEn ? ` · ${formatFechaHora(r.respondidoEn)}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{r.respuesta}</p>
        </div>
      )}
    </li>
  )
}

function DetalleRegistroSheet({
  id,
  puedeRevisar,
  onClose,
  onRevisado,
}: {
  id: string | null
  puedeRevisar: boolean
  onClose: () => void
  onRevisado: () => void
}) {
  const [det, setDet] = useState<DetalleRegistro | null>(null)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [comentario, setComentario] = useState("")
  const [guardando, setGuardando] = useState<EstadoRevision | null>(null)

  const cargar = useCallback(async (registroId: string) => {
    try {
      setDet(await api.get<DetalleRegistro>(`/auditoria/registros/${registroId}`))
    } catch (err) {
      toast.error(mensajeError(err, "No se pudo abrir el registro."))
      onClose()
    }
  }, [onClose])

  useEffect(() => {
    if (!id) return
    setDet(null)
    setChecks({})
    setComentario("")
    cargar(id)
  }, [id, cargar])

  async function revisar(estado: EstadoRevision) {
    if (!det) return
    if (estado !== "aprobado" && !comentario.trim()) {
      toast.error("Escribí el motivo de la observación o el rechazo.")
      return
    }
    setGuardando(estado)
    try {
      const checklist = Object.fromEntries(det.checklist.map((k) => [k, !!checks[k]]))
      await api.post(`/auditoria/registros/${det.registro.id}/revision`, {
        estado,
        checklist,
        ...(comentario.trim() ? { comentario: comentario.trim() } : {}),
      })
      toast.success(
        estado === "aprobado" ? "Registro aprobado." : "Observación enviada al profesional."
      )
      setChecks({})
      setComentario("")
      onRevisado()
      await cargar(det.registro.id)
    } catch (err) {
      toast.error(mensajeError(err, "No se pudo guardar la revisión."))
    } finally {
      setGuardando(null)
    }
  }

  const reg = det?.registro
  const pac = det?.paciente

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>
            {reg ? `Registro del ${formatFechaHora(reg.fecha)}` : "Registro clínico"}
          </SheetTitle>
          <SheetDescription>
            {reg ? [reg.profesional, reg.area].filter(Boolean).join(" · ") || "—" : "Cargando…"}
          </SheetDescription>
        </SheetHeader>

        {!det || !reg || !pac ? (
          <SkeletonDetalle />
        ) : (
          <div className="grid gap-6 px-4 pb-8">
            {/* Paciente */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{pac.nombre || "—"}</p>
              <p className="text-muted-foreground">
                DNI {pac.dni || "—"}
                {pac.edad !== null ? ` · ${pac.edad} años` : ""}
                {pac.sexo ? ` · ${pac.sexo}` : ""}
                {` · ${pac.obraSocial || "Sin obra social"}`}
                {pac.nroAfiliado ? ` · Afiliado ${pac.nroAfiliado}` : ""}
                {pac.plan ? ` · Plan ${pac.plan}` : ""}
              </p>
              <div className="mt-2">
                <EstadoBadge estado={reg.estado} />
              </div>
            </div>

            {/* Contenido del registro */}
            <div className="grid gap-4">
              <Campo titulo="Síntomas / motivo" texto={reg.sintomas} />
              <Campo titulo="Diagnóstico" texto={reg.diagnostico} />
              <Campo titulo="Tratamiento" texto={reg.tratamiento} />
              {((reg.diagnosticos?.length ?? 0) > 0 || (reg.practicas?.length ?? 0) > 0) ? (
                <div>
                  <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Codificación
                  </p>
                  <CodificacionResumen diagnosticos={reg.diagnosticos} practicas={reg.practicas} />
                </div>
              ) : (
                <Campo titulo="Codificación" texto="Sin diagnósticos ni prácticas codificados." />
              )}
            </div>

            {reg.dientes.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Odontograma
                </p>
                <Odontogram value={reg.dientes} readOnly />
              </div>
            )}

            {/* Historia previa del paciente (contexto para auditar) */}
            {det.historial.length > 0 && (
              <Accordion type="single" collapsible>
                <AccordionItem value="historial">
                  <AccordionTrigger>
                    Otros registros del paciente ({det.historial.length})
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="grid gap-3">
                      {det.historial.map((h) => (
                        <li key={h.id} className="rounded-lg border border-border p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{formatFecha(h.fecha)}</span>
                            <span className="text-xs text-muted-foreground">
                              {[h.profesional, h.area].filter(Boolean).join(" · ")}
                            </span>
                            <EstadoBadge estado={h.estado} />
                          </div>
                          <p className="mt-1.5">
                            <span className="text-muted-foreground">Dx: </span>
                            {h.diagnostico || "—"}
                          </p>
                          <p>
                            <span className="text-muted-foreground">Tto: </span>
                            {h.tratamiento || "—"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* Revisiones anteriores */}
            {det.revisiones.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Revisiones
                </p>
                <ul className="grid gap-3">
                  {det.revisiones.map((r) => (
                    <RevisionItem key={r.id} r={r} />
                  ))}
                </ul>
              </div>
            )}

            {/* Formulario de revisión (solo auditor) */}
            {puedeRevisar && (
              <div className="grid gap-4 rounded-lg border border-border p-4">
                <p className="font-medium">
                  {det.revisiones.length > 0 ? "Nueva revisión" : "Auditar registro"}
                </p>
                <div className="grid gap-2.5">
                  {det.checklist.map((k) => (
                    <div key={k} className="flex items-center gap-2.5">
                      <Checkbox
                        id={`chk-${k}`}
                        checked={!!checks[k]}
                        onCheckedChange={(v) => setChecks((c) => ({ ...c, [k]: v === true }))}
                      />
                      <Label htmlFor={`chk-${k}`} className="font-normal">
                        {CHECKLIST_LABEL[k] ?? k}
                      </Label>
                    </div>
                  ))}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="comentario">Comentario para el profesional</Label>
                  <Textarea
                    id="comentario"
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Obligatorio al observar o rechazar."
                    maxLength={4000}
                    rows={4}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => revisar("aprobado")} disabled={!!guardando}>
                    {guardando === "aprobado" ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                    Aprobar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => revisar("observado")}
                    disabled={!!guardando}
                  >
                    {guardando === "observado" ? <Loader2 className="animate-spin" /> : <AlertTriangle />}
                    Observar
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => revisar("rechazado")}
                    disabled={!!guardando}
                  >
                    {guardando === "rechazado" ? <Loader2 className="animate-spin" /> : <XCircle />}
                    Rechazar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/* =============================== Bitácora =============================== */

type FiltrosBitacora = {
  desde: string
  hasta: string
  accion: string
  dni: string
  actor: string
}

function Bitacora() {
  const inicial: FiltrosBitacora = {
    desde: sumarDias(hoyAR(), -7),
    hasta: hoyAR(),
    accion: TODOS,
    dni: "",
    actor: "",
  }
  // Borrador del formulario; se aplica al enviar (los textos no disparan una
  // consulta por cada tecla).
  const [borrador, setBorrador] = useState<FiltrosBitacora>(inicial)
  const [filtros, setFiltros] = useState<FiltrosBitacora>(inicial)
  const [page, setPage] = useState(1)
  const [datos, setDatos] = useState<({ accesos: Acceso[] } & Paginado) | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    setCargando(true)
    api
      .get<{ accesos: Acceso[] } & Paginado>(
        `/auditoria/bitacora${qs({ ...filtros, dni: filtros.dni.trim(), actor: filtros.actor.trim(), page })}`
      )
      .then((d) => activo && setDatos(d))
      .catch((err) => toast.error(mensajeError(err, "No se pudo cargar la bitácora.")))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [filtros, page])

  function aplicar(e: React.FormEvent) {
    e.preventDefault()
    setFiltros(borrador)
    setPage(1)
  }

  const set = <K extends keyof FiltrosBitacora>(k: K, v: FiltrosBitacora[K]) =>
    setBorrador((b) => ({ ...b, [k]: v }))

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Registro inalterable de quién abrió, cargó, exportó o auditó cada historia
          clínica.
        </p>
        <form onSubmit={aplicar} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="grid gap-1.5">
            <Label htmlFor="l-desde">Desde</Label>
            <Input
              id="l-desde"
              type="date"
              value={borrador.desde}
              onChange={(e) => set("desde", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="l-hasta">Hasta</Label>
            <Input
              id="l-hasta"
              type="date"
              value={borrador.hasta}
              onChange={(e) => set("hasta", e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="l-accion">Acción</Label>
            <Select value={borrador.accion} onValueChange={(v) => set("accion", v)}>
              <SelectTrigger id="l-accion" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {Object.entries(ACCION_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="l-dni">DNI del paciente</Label>
            <Input
              id="l-dni"
              inputMode="numeric"
              value={borrador.dni}
              onChange={(e) => set("dni", e.target.value)}
              maxLength={20}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="l-actor">Usuario</Label>
            <Input
              id="l-actor"
              value={borrador.actor}
              onChange={(e) => set("actor", e.target.value)}
              placeholder="Nombre"
              maxLength={120}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              <Search /> Filtrar
            </Button>
          </div>
        </form>

        <Separator className="my-5" />

        {cargando && !datos ? (
          <SkeletonTabla columnas={5} />
        ) : datos && datos.accesos.length > 0 ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={cargando ? "opacity-60" : undefined}>
                {datos.accesos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">{formatFechaHora(a.fecha)}</TableCell>
                    <TableCell>
                      <p>{a.actor || "—"}</p>
                      {a.rol && <p className="text-xs text-muted-foreground capitalize">{a.rol}</p>}
                    </TableCell>
                    <TableCell>{ACCION_LABEL[a.accion] ?? a.accion}</TableCell>
                    <TableCell>
                      {a.paciente || a.dni ? (
                        <>
                          <p>{a.paciente || "—"}</p>
                          {a.dni && <p className="text-xs text-muted-foreground">DNI {a.dni}</p>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          {typeof a.detalle?.pacientes === "number"
                            ? `${a.detalle.pacientes} pacientes`
                            : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.ip || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Paginacion
              page={datos.page}
              total={datos.total}
              pageSize={datos.pageSize}
              onPage={setPage}
            />
          </>
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No hay accesos registrados con estos filtros.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/* =============================== Resumen =============================== */

type DatosResumen = {
  total: number
  truncado: boolean
  estados: Record<EstadoAuditoria, number>
  profesionales: {
    nombre: string
    total: number
    aprobado: number
    conObservaciones: number
    pendiente: number
    tasaAprobacion: number | null
  }[]
}

function Resumen() {
  const [desde, setDesde] = useState(sumarDias(hoyAR(), -30))
  const [hasta, setHasta] = useState(hoyAR())
  const [datos, setDatos] = useState<DatosResumen | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    setCargando(true)
    api
      .get<DatosResumen>(`/auditoria/resumen${qs({ desde, hasta })}`)
      .then((d) => activo && setDatos(d))
      .catch((err) => toast.error(mensajeError(err, "No se pudo cargar el resumen.")))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [desde, hasta])

  return (
    <div className="grid gap-6">
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="r-desde">Desde</Label>
          <Input id="r-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="r-hasta">Hasta</Label>
          <Input id="r-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
      </div>

      {cargando && !datos ? (
        <SkeletonIndicadores />
      ) : datos ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(ESTADO_AUDITORIA) as EstadoAuditoria[]).map((e) => (
              <Card key={e}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{ESTADO_AUDITORIA[e].label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {datos.estados[e] ?? 0}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <h2 className="text-lg font-semibold">Por profesional</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {datos.total} registros en el período. El % de aprobación se calcula sobre
                los registros ya auditados.
                {datos.truncado ? " Se muestran los primeros 10.000: acotá las fechas." : ""}
              </p>
              {datos.profesionales.length > 0 ? (
                <Table className="mt-4">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Profesional</TableHead>
                      <TableHead className="text-right">Registros</TableHead>
                      <TableHead className="text-right">Aprobados</TableHead>
                      <TableHead className="text-right">Con observaciones</TableHead>
                      <TableHead className="text-right">Pendientes</TableHead>
                      <TableHead className="text-right">% aprobación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {datos.profesionales.map((p, i) => (
                      <TableRow key={`${p.nombre}-${i}`}>
                        <TableCell>{p.nombre}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.aprobado}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.conObservaciones}</TableCell>
                        <TableCell className="text-right tabular-nums">{p.pendiente}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p.tasaAprobacion === null ? "—" : `${p.tasaAprobacion}%`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No hay registros en el período.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

/* =============================== Asistencia =============================== */

type TurnoCruce = {
  id: number
  inicio: string
  estado: string
  profesional: string
  paciente: string
  invitado: boolean
}

type DatosCruce = {
  desde: string
  hasta: string
  resumen: { turnos: number; atendidos: number; ausentes: number; sinMarcar: number; registros: number }
  turnosSinRegistro: TurnoCruce[]
  ausentesConRegistro: TurnoCruce[]
  registrosSinTurno: { id: string; fecha: string; profesional: string; paciente: string }[]
  truncado: boolean
}

const ESTADO_TURNO: Record<string, string> = {
  reservado: "Sin marcar",
  atendido: "Atendido",
  ausente: "Ausente",
}

function ListaCruce({
  titulo,
  descripcion,
  vacio,
  children,
  cantidad,
}: {
  titulo: string
  descripcion: string
  vacio: string
  cantidad: number
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {titulo}
          <Badge variant={cantidad > 0 ? "destructive" : "outline"}>{cantidad}</Badge>
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{descripcion}</p>
        {cantidad === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{vacio}</p>
        ) : (
          <div className="mt-4">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

function Asistencia() {
  const [desde, setDesde] = useState(sumarDias(hoyAR(), -30))
  const [hasta, setHasta] = useState(hoyAR())
  const [datos, setDatos] = useState<DatosCruce | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    setCargando(true)
    api
      .get<DatosCruce>(`/auditoria/cruce${qs({ desde, hasta })}`)
      .then((d) => activo && setDatos(d))
      .catch((err) => toast.error(mensajeError(err, "No se pudo cruzar turnos y registros.")))
      .finally(() => activo && setCargando(false))
    return () => {
      activo = false
    }
  }, [desde, hasta])

  const filaTurno = (t: TurnoCruce) => (
    <TableRow key={t.id}>
      <TableCell className="whitespace-nowrap">{formatFechaHora(t.inicio)}</TableCell>
      <TableCell>
        {t.paciente || "—"}
        {t.invitado && <span className="text-xs text-muted-foreground"> · sin cuenta</span>}
      </TableCell>
      <TableCell>{t.profesional || "—"}</TableCell>
      <TableCell>
        <Badge variant="outline">{ESTADO_TURNO[t.estado] ?? t.estado}</Badge>
      </TableCell>
    </TableRow>
  )

  const cabeceraTurno = (
    <TableHeader>
      <TableRow>
        <TableHead>Turno</TableHead>
        <TableHead>Paciente</TableHead>
        <TableHead>Profesional</TableHead>
        <TableHead>Asistencia</TableHead>
      </TableRow>
    </TableHeader>
  )

  return (
    <div className="grid gap-6">
      <div className="grid max-w-md gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="c-desde">Desde</Label>
          <Input id="c-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="c-hasta">Hasta</Label>
          <Input
            id="c-hasta"
            type="date"
            value={hasta}
            max={hoyAR()}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
      </div>

      {cargando && !datos ? (
        <SkeletonIndicadores />
      ) : datos ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ["Turnos", datos.resumen.turnos],
              ["Atendidos", datos.resumen.atendidos],
              ["Ausentes", datos.resumen.ausentes],
              ["Sin marcar", datos.resumen.sinMarcar],
              ["Registros", datos.resumen.registros],
            ].map(([label, n]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{n}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            Se emparejan por profesional, paciente y día. Los turnos de personas sin cuenta
            se vinculan por email cuando es posible.
            {datos.truncado ? " El período es muy largo: acotá las fechas." : ""}
          </p>

          <ListaCruce
            titulo="Turnos sin registro clínico"
            descripcion="Turnos atendidos o sin marcar en los que no se cargó la consulta."
            vacio="Todos los turnos tienen su registro."
            cantidad={datos.turnosSinRegistro.length}
          >
            <Table>
              {cabeceraTurno}
              <TableBody>{datos.turnosSinRegistro.map(filaTurno)}</TableBody>
            </Table>
          </ListaCruce>

          <ListaCruce
            titulo="Registros sin turno"
            descripcion="Consultas cargadas sin un turno ese día con ese profesional."
            vacio="Todos los registros tienen su turno."
            cantidad={datos.registrosSinTurno.length}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Profesional</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.registrosSinTurno.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatFechaHora(r.fecha)}</TableCell>
                    <TableCell>{r.paciente || "—"}</TableCell>
                    <TableCell>{r.profesional || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ListaCruce>

          <ListaCruce
            titulo="Ausentes con registro"
            descripcion="Turnos marcados como ausente que igual tienen una consulta cargada."
            vacio="No hay inconsistencias."
            cantidad={datos.ausentesConRegistro.length}
          >
            <Table>
              {cabeceraTurno}
              <TableBody>{datos.ausentesConRegistro.map(filaTurno)}</TableBody>
            </Table>
          </ListaCruce>
        </>
      ) : null}
    </div>
  )
}
