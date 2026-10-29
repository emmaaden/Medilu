import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { toast } from "sonner"
import { Loader2, Pencil, Building2, Tags } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Container } from "@/components/site/Section"
import { SelectField } from "@/components/form/SelectField"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { ESTADO_LABEL, formatoPesos, montoPlan, type EstadoPlan, type Plan } from "@/lib/planes"
import { PageSkeleton } from "@/components/site/Skeletons"

type Suscripcion = {
  planId: string
  estadoGuardado: "prueba" | "activa" | "vencida" | "cancelada"
  estado: EstadoPlan
  ciclo: "mensual" | "anual"
  profesionalesExtra: number
  pruebaHasta: string | null
  periodoHasta: string | null
  notas: string | null
  // Fase M: débito automático de Mercado Pago.
  mpEstado: "pending" | "authorized" | "paused" | "cancelled" | null
  mpPayerEmail: string | null
  monto: number | null
  proximoCobro: string | null
  // Fase M2: cambio de precio programado.
  montoNuevo: number | null
  montoNuevoDesde: string | null
  avisoPrecioEnviadoEn: string | null
  // Fase X: descuento manual (pct null = ninguno; vigente 0 = vencido o ninguno).
  descuentoPct: number | null
  descuentoHasta: string | null
  descuentoVigente: number
}

const MP_LABEL: Record<string, string> = {
  pending: "Pendiente",
  authorized: "Débito activo",
  paused: "En pausa",
  cancelled: "Dado de baja",
}

type ClinicaPlataforma = {
  id: string
  nombre: string
  slug: string | null
  creadaEn: string
  suscripcion: Suscripcion | null
  uso: { profesionales: number; recepcion: number; auditores: number }
}

type Datos = { clinicas: ClinicaPlataforma[]; planes: Plan[]; pagoOnline: boolean }

/** Formulario de suscripción (fechas como YYYY-MM-DD para <input type="date">). */
type FormSub = {
  planId: string
  estado: Suscripcion["estadoGuardado"]
  ciclo: Suscripcion["ciclo"]
  profesionalesExtra: string
  pruebaHasta: string
  periodoHasta: string
  notas: string
  descuentoPct: string
  descuentoHasta: string
}

const ESTADOS_GUARDADOS = [
  { value: "prueba", label: "Prueba" },
  { value: "activa", label: "Activa" },
  { value: "vencida", label: "Vencida" },
  { value: "cancelada", label: "Cancelada" },
]

const CICLOS = [
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
]

const aInputFecha = (iso: string | null) => (iso ? iso.slice(0, 10) : "")
// Fin del día en Argentina para que «vence el 10» incluya todo el 10.
const deInputFecha = (v: string) => (v ? `${v}T23:59:59-03:00` : null)

function fechaCorta(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })
}

const ESTADO_VARIANTE: Record<EstadoPlan, "default" | "secondary" | "destructive" | "outline"> = {
  activa: "default",
  prueba: "secondary",
  gracia: "outline",
  vencida: "destructive",
  cancelada: "destructive",
}

/** Suma meses al vencimiento actual (si sigue vigente) o a hoy. */
function extenderPeriodo(periodoHasta: string | null, meses: number) {
  const base = periodoHasta && new Date(periodoHasta) > new Date() ? new Date(periodoHasta) : new Date()
  base.setMonth(base.getMonth() + meses)
  return base.toISOString().slice(0, 10)
}

export default function Plataforma() {
  const { user, loading } = useAuth()
  const [datos, setDatos] = useState<Datos | null>(null)
  const [editando, setEditando] = useState<ClinicaPlataforma | null>(null)
  const [form, setForm] = useState<FormSub | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [sincronizando, setSincronizando] = useState(false)
  // Fase M: baja del débito pedida por fuera del panel (dos pasos para no tocarlo sin querer).
  const [confirmarCancelacion, setConfirmarCancelacion] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setDatos(await api.get<Datos>("/plataforma/clinicas"))
    } catch {
      toast.error("No se pudo cargar el panel de plataforma.")
    }
  }, [])

  useEffect(() => {
    if (user?.esPlataforma) cargar()
  }, [user?.esPlataforma, cargar])

  if (!loading && user && !user.esPlataforma) return <Navigate to="/dashboard" replace />

  function abrir(c: ClinicaPlataforma) {
    const s = c.suscripcion
    setEditando(c)
    setConfirmarCancelacion(false)
    setForm({
      planId: s?.planId ?? "clinica",
      estado: s?.estadoGuardado ?? "prueba",
      ciclo: s?.ciclo ?? "mensual",
      profesionalesExtra: String(s?.profesionalesExtra ?? 0),
      pruebaHasta: aInputFecha(s?.pruebaHasta ?? null),
      periodoHasta: aInputFecha(s?.periodoHasta ?? null),
      notas: s?.notas ?? "",
      descuentoPct: s?.descuentoPct ? String(s.descuentoPct) : "",
      descuentoHasta: aInputFecha(s?.descuentoHasta ?? null),
    })
  }

  // Atajo: activar (o renovar) por un período, con el ciclo correspondiente.
  function activar(meses: 1 | 12) {
    if (!form || !editando) return
    setForm({
      ...form,
      estado: "activa",
      ciclo: meses === 12 ? "anual" : "mensual",
      periodoHasta: extenderPeriodo(editando.suscripcion?.periodoHasta ?? null, meses),
    })
  }

  async function guardar() {
    if (!form || !editando) return
    const extra = Number(form.profesionalesExtra)
    if (!Number.isInteger(extra) || extra < 0) {
      toast.error("Los profesionales extra tienen que ser un número entero.")
      return
    }
    const pct = form.descuentoPct.trim() === "" ? 0 : Number(form.descuentoPct)
    if (!Number.isInteger(pct) || pct < 0 || pct > 99) {
      toast.error("El descuento tiene que ser un porcentaje entero entre 1 y 99 (vacío = sin descuento).")
      return
    }
    setGuardando(true)
    try {
      const r = await api.patch<{ descuento: { aplicado: boolean; programado: boolean } | null }>(
        `/plataforma/clinicas/${editando.id}/suscripcion`,
        {
        planId: form.planId,
        estado: form.estado,
        ciclo: form.ciclo,
        profesionalesExtra: extra,
        pruebaHasta: deInputFecha(form.pruebaHasta),
        periodoHasta: deInputFecha(form.periodoHasta),
        notas: form.notas.trim() || null,
        descuentoPct: pct || null,
        descuentoHasta: pct ? deInputFecha(form.descuentoHasta) : null,
        }
      )
      toast.success(
        r.descuento?.aplicado
          ? "Suscripción actualizada. El débito de Mercado Pago ya cobra el monto con descuento."
          : r.descuento?.programado
            ? "Suscripción actualizada. El nuevo monto del débito se avisa por email y rige en 30 días."
            : "Suscripción actualizada."
      )
      setEditando(null)
      cargar()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.")
    } finally {
      setGuardando(false)
    }
  }

  async function cancelarDebito() {
    if (!editando) return
    setCancelando(true)
    try {
      await api.post(`/plataforma/clinicas/${editando.id}/cancelar-debito`)
      toast.success("Débito cancelado en Mercado Pago. El plan sigue hasta el fin del período pago.")
      setEditando(null)
      cargar()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cancelar el débito.")
    } finally {
      setCancelando(false)
    }
  }

  async function sincronizar() {
    if (!editando) return
    setSincronizando(true)
    try {
      await api.post(`/plataforma/clinicas/${editando.id}/sincronizar`)
      toast.success("Sincronizado con Mercado Pago.")
      setEditando(null)
      cargar()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo sincronizar.")
    } finally {
      setSincronizando(false)
    }
  }

  if (!datos) return <PageSkeleton />

  const planPorId = new Map(datos.planes.map((p) => [p.id, p]))
  const opcionesPlan = datos.planes.map((p) => ({ value: p.id, label: p.nombre }))
  const planElegido = form ? planPorId.get(form.planId) : undefined

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">Plataforma</h1>
        <p className="mt-1 text-muted-foreground">
          Activá y renová los planes de las clínicas, y actualizá los precios.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Building2 className="size-5 text-primary" aria-hidden /> Clínicas
          </h2>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clínica</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Vence</TableHead>
                  <TableHead>Mercado Pago</TableHead>
                  <TableHead className="text-right">Profesionales</TableHead>
                  <TableHead className="sr-only">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.clinicas.map((c) => {
                  const s = c.suscripcion
                  const plan = s ? planPorId.get(s.planId) : undefined
                  const max = plan
                    ? plan.profesionalesIncluidos + (plan.precioProfesionalExtra != null ? s?.profesionalesExtra ?? 0 : 0)
                    : 0
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <p className="font-medium">{c.nombre}</p>
                        <p className="text-xs text-muted-foreground">{c.slug}</p>
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap items-center gap-1.5">
                          {plan?.nombre ?? "—"}
                          {s && s.descuentoVigente > 0 && (
                            <Badge variant="secondary" title={s.descuentoHasta ? `Hasta el ${fechaCorta(s.descuentoHasta)}` : "Sin vencimiento"}>
                              −{s.descuentoVigente} %
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        {s ? (
                          <Badge variant={ESTADO_VARIANTE[s.estado]}>{ESTADO_LABEL[s.estado]}</Badge>
                        ) : (
                          <Badge variant="outline">Sin suscripción</Badge>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {fechaCorta(s?.estadoGuardado === "prueba" ? s.pruebaHasta : s?.periodoHasta ?? null)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {s?.mpEstado ? MP_LABEL[s.mpEstado] ?? s.mpEstado : "Manual"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.uso.profesionales} / {max}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => abrir(c)}>
                          <Pencil aria-hidden /> Editar
                          <span className="sr-only"> la suscripción de {c.nombre}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PreciosPlanes planes={datos.planes} onGuardado={cargar} />

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Suscripción de {editando?.nombre}</DialogTitle>
            <DialogDescription>
              Activá el plan cuando se confirme el pago. Las fechas vencen al final del día.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="grid gap-4">
              {editando?.suscripcion?.mpEstado && (
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">
                    Mercado Pago: {MP_LABEL[editando.suscripcion.mpEstado] ?? editando.suscripcion.mpEstado}
                  </p>
                  <p className="text-muted-foreground">
                    {editando.suscripcion.monto != null && `${formatoPesos(editando.suscripcion.monto)} por ciclo`}
                    {editando.suscripcion.proximoCobro && ` · próximo cobro ${fechaCorta(editando.suscripcion.proximoCobro)}`}
                    {editando.suscripcion.mpPayerEmail && ` · ${editando.suscripcion.mpPayerEmail}`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Con débito activo, los cobros extienden el período solos: editá a mano solo para corregir.
                  </p>
                  {editando.suscripcion.montoNuevo != null && (
                    <p className="mt-1 text-xs">
                      Nuevo precio programado: {formatoPesos(editando.suscripcion.montoNuevo)} desde el{" "}
                      {fechaCorta(editando.suscripcion.montoNuevoDesde)}
                      {editando.suscripcion.avisoPrecioEnviadoEn
                        ? ` (avisado el ${fechaCorta(editando.suscripcion.avisoPrecioEnviadoEn)}).`
                        : " (sin avisar: no se aplica hasta que salga el email)."}
                    </p>
                  )}
                  {editando.suscripcion.mpEstado === "authorized" &&
                    (confirmarCancelacion ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2" role="alert">
                        <span className="text-sm">¿Cancelar el débito? No se le cobra más; el plan sigue hasta el fin del período pago.</span>
                        <Button type="button" variant="destructive" size="sm" onClick={cancelarDebito} disabled={cancelando}>
                          {cancelando && <Loader2 className="animate-spin" />} Sí, cancelar
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => setConfirmarCancelacion(false)} disabled={cancelando}>
                          No
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setConfirmarCancelacion(true)}
                      >
                        Cancelar débito en Mercado Pago
                      </Button>
                    ))}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => activar(1)}>
                  Activar 1 mes
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => activar(12)}>
                  Activar 1 año
                </Button>
                {datos.pagoOnline && (
                  <Button type="button" variant="outline" size="sm" onClick={sincronizar} disabled={sincronizando}>
                    {sincronizando && <Loader2 className="animate-spin" />} Sincronizar con Mercado Pago
                  </Button>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="sub-plan">Plan</Label>
                  <SelectField
                    id="sub-plan"
                    value={form.planId}
                    onValueChange={(v) => setForm({ ...form, planId: v })}
                    options={opcionesPlan}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sub-estado">Estado</Label>
                  <SelectField
                    id="sub-estado"
                    value={form.estado}
                    onValueChange={(v) => setForm({ ...form, estado: v as FormSub["estado"] })}
                    options={ESTADOS_GUARDADOS}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sub-ciclo">Ciclo de pago</Label>
                  <SelectField
                    id="sub-ciclo"
                    value={form.ciclo}
                    onValueChange={(v) => setForm({ ...form, ciclo: v as FormSub["ciclo"] })}
                    options={CICLOS}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sub-extra">Profesionales extra</Label>
                  <Input
                    id="sub-extra"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={form.profesionalesExtra}
                    disabled={planElegido?.precioProfesionalExtra == null}
                    onChange={(e) => setForm({ ...form, profesionalesExtra: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sub-prueba">Prueba hasta</Label>
                  <Input
                    id="sub-prueba"
                    type="date"
                    value={form.pruebaHasta}
                    onChange={(e) => setForm({ ...form, pruebaHasta: e.target.value })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="sub-periodo">Período pago hasta</Label>
                  <Input
                    id="sub-periodo"
                    type="date"
                    value={form.periodoHasta}
                    onChange={(e) => setForm({ ...form, periodoHasta: e.target.value })}
                  />
                </div>
              </div>
              <p className="-mt-2 text-xs text-muted-foreground">
                Sin «período pago hasta», un plan activo no vence (cuentas de cortesía).
              </p>
              <DescuentoCampos form={form} setForm={setForm} plan={planElegido} />
              <div className="grid gap-1.5">
                <Label htmlFor="sub-notas">Notas internas</Label>
                <Textarea
                  id="sub-notas"
                  rows={3}
                  value={form.notas}
                  placeholder="Por ejemplo: pagó por transferencia el 6/10."
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  )
}

/**
 * Fase X: descuento manual de la clínica sobre su plan (lanzamiento, convenio). Muestra
 * cuánto queda el monto por ciclo con el plan, el ciclo y los extras del formulario.
 */
function DescuentoCampos({
  form,
  setForm,
  plan,
}: {
  form: FormSub
  setForm: (f: FormSub) => void
  plan: Plan | undefined
}) {
  const pct = Number(form.descuentoPct)
  const valido = Number.isInteger(pct) && pct >= 1 && pct <= 99
  const extras = plan?.precioProfesionalExtra != null ? Number(form.profesionalesExtra) || 0 : 0
  const periodo = form.ciclo === "anual" ? "año" : "mes"
  return (
    <fieldset className="grid gap-3 rounded-lg border border-border p-3">
      <legend className="px-1 text-sm font-medium">Descuento</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="sub-descuento">Porcentaje</Label>
          <div className="relative">
            <Input
              id="sub-descuento"
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              className="pr-8"
              placeholder="Sin descuento"
              value={form.descuentoPct}
              onChange={(e) => setForm({ ...form, descuentoPct: e.target.value })}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
              %
            </span>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sub-descuento-hasta">Hasta (inclusive)</Label>
          <Input
            id="sub-descuento-hasta"
            type="date"
            value={form.descuentoHasta}
            disabled={!valido}
            onChange={(e) => setForm({ ...form, descuentoHasta: e.target.value })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {valido && plan ? (
          <>
            Queda en{" "}
            <strong className="text-foreground">{formatoPesos(montoPlan(plan, form.ciclo, extras, pct))}</strong> por{" "}
            {periodo} (lista {formatoPesos(montoPlan(plan, form.ciclo, extras))})
            {form.descuentoHasta ? "" : ", sin vencimiento"}.{" "}
          </>
        ) : (
          "Vacío = sin descuento. "
        )}
        Con débito de Mercado Pago, bajar el monto rige desde el próximo cobro; subirlo (al quitar el
        descuento o al vencer) se avisa por email con 30 días.
      </p>
    </fieldset>
  )
}

/** Precios y asientos de cada plan (se actualizan sin deploy, p. ej. por inflación). */
function PreciosPlanes({ planes, onGuardado }: { planes: Plan[]; onGuardado: () => void }) {
  return (
    <Card className="mt-8">
      <CardContent className="p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Tags className="size-5 text-primary" aria-hidden /> Precios
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Precio final con IVA. Un cambio rige para lo que se contrate desde ahora; los
          períodos ya pagados no cambian.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {planes.map((p) => (
            <PrecioPlan key={p.id} plan={p} onGuardado={onGuardado} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function PrecioPlan({ plan, onGuardado }: { plan: Plan; onGuardado: () => void }) {
  const [v, setV] = useState({
    precioMensual: String(plan.precioMensual),
    precioAnual: String(plan.precioAnual),
    precioProfesionalExtra: plan.precioProfesionalExtra == null ? "" : String(plan.precioProfesionalExtra),
    profesionalesIncluidos: String(plan.profesionalesIncluidos),
  })
  const [guardando, setGuardando] = useState(false)
  // Fase M2: llevar los débitos vigentes al precio de hoy, con aviso previo.
  const [dias, setDias] = useState("30")
  const [aplicando, setAplicando] = useState(false)

  async function aplicarAVigentes() {
    const d = Number.parseInt(dias, 10)
    if (!Number.isInteger(d) || d < 30) {
      toast.error("El aviso tiene que ser de al menos 30 días.")
      return
    }
    setAplicando(true)
    try {
      const r = await api.post<{ programadas: number; avisadas: number; sinAvisar: number }>(
        `/plataforma/planes/${plan.id}/aplicar-precios`,
        { dias: d }
      )
      if (r.programadas === 0 && r.sinAvisar === 0) {
        toast.success(`Todos los débitos del plan ${plan.nombre} ya cobran el precio de hoy.`)
      } else {
        toast.success(
          `Programado en ${r.programadas} clínica${r.programadas === 1 ? "" : "s"}. ` +
            `Avisadas por email: ${r.avisadas}.` +
            (r.sinAvisar > 0 ? ` Sin avisar: ${r.sinAvisar} (configurá el email; sin aviso no se aplica).` : "")
        )
      }
      onGuardado()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron programar los precios.")
    } finally {
      setAplicando(false)
    }
  }

  async function guardar() {
    const n = (s: string) => Number(s.replace(/\./g, "").replace(",", "."))
    const body = {
      precioMensual: n(v.precioMensual),
      precioAnual: n(v.precioAnual),
      precioProfesionalExtra: v.precioProfesionalExtra.trim() === "" ? null : n(v.precioProfesionalExtra),
      profesionalesIncluidos: Math.trunc(n(v.profesionalesIncluidos)),
    }
    if (Object.values(body).some((x) => x !== null && (!Number.isFinite(x) || x < 0))) {
      toast.error("Revisá los importes: tienen que ser números positivos.")
      return
    }
    setGuardando(true)
    try {
      await api.patch(`/plataforma/planes/${plan.id}`, body)
      toast.success(`Plan ${plan.nombre} actualizado.`)
      onGuardado()
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.")
    } finally {
      setGuardando(false)
    }
  }

  const campo = (k: keyof typeof v, label: string, ayuda?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`${plan.id}-${k}`}>{label}</Label>
      <Input
        id={`${plan.id}-${k}`}
        inputMode="decimal"
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  )

  return (
    <div className="grid gap-3 rounded-lg border border-border p-4">
      <p className="font-medium">
        {plan.nombre}{" "}
        <span className="text-sm font-normal text-muted-foreground">
          · hoy {formatoPesos(plan.precioMensual)} por mes
        </span>
      </p>
      {campo("precioMensual", "Precio mensual")}
      {campo("precioAnual", "Precio anual")}
      {campo("profesionalesIncluidos", "Profesionales incluidos")}
      {campo("precioProfesionalExtra", "Profesional extra (por mes)", "Vacío = el plan no admite extras.")}
      <Button variant="outline" onClick={guardar} disabled={guardando}>
        {guardando && <Loader2 className="animate-spin" />} Guardar {plan.nombre}
      </Button>
      <div className="grid gap-1.5 border-t border-border pt-3">
        <Label htmlFor={`${plan.id}-dias`}>Aplicar a los débitos vigentes en (días)</Label>
        <div className="flex gap-2">
          <Input
            id={`${plan.id}-dias`}
            type="number"
            inputMode="numeric"
            min={30}
            className="w-24"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
          <Button variant="outline" className="flex-1" onClick={aplicarAVigentes} disabled={aplicando}>
            {aplicando && <Loader2 className="animate-spin" />} Avisar y programar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Guardá primero el precio. Avisa por email a cada clínica y el débito cambia al cumplirse el plazo
          (mínimo 30 días); hasta entonces puede darse de baja sin costo.
        </p>
      </div>
    </div>
  )
}
