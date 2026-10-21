import { useCallback, useEffect, useState } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { toast } from "sonner"
import {
  Loader2,
  MessageCircle,
  Users,
  ClipboardList,
  ClipboardCheck,
  CreditCard,
  Receipt,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { PlanCard, type Ciclo } from "@/components/site/PlanCard"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import {
  ESTADO_LABEL,
  formatoPesos,
  mesesDeRegalo,
  montoPlan,
  waContratar,
  type Descuento,
  type EstadoPlan,
  type Plan as PlanCatalogo,
} from "@/lib/planes"

type PlanClinica = {
  planId: string | null
  planNombre: string | null
  estado: EstadoPlan
  soloLectura: boolean
  diasRestantes: number | null
  pruebaHasta: string | null
  periodoHasta: string | null
  ciclo: Ciclo
  features: string[]
  maxProfesionales: number
  profesionalesExtra: number
  maxRecepcion: number | null
  /** Descuento manual vigente (Fase X). */
  descuento: Descuento | null
}

/** Débito automático de Mercado Pago (Fase M). */
type Debito = {
  estado: "pending" | "authorized" | "paused" | "cancelled"
  payerEmail: string | null
  monto: number | null
  renovacionAutomatica: boolean
  proximoCobro: string | null
  /** Nuevo precio ya avisado: rige desde `desde` (Fase M2). */
  cambioPrecio: { monto: number; desde: string | null } | null
}

type Pago = {
  id: number
  fecha: string
  monto: number | null
  estado: string
  planId: string | null
  ciclo: Ciclo | null
  periodoDesde: string | null
  periodoHasta: string | null
}

type MiClinica = {
  plan: PlanClinica
  uso: { profesionales: number; recepcion: number; auditores: number }
  planes: PlanCatalogo[]
  features: Record<string, string>
  diasGracia: number
  pagoOnline: boolean
  /** Si se contrata ahora, día del primer débito (fin de la prueba o de lo pagado). */
  primerCobro: string | null
  /** Hay un intento de pago de la última hora sin confirmar. */
  pagoPendiente: boolean
  /** El plan se puede cambiar tocando solo el monto del débito (al día, mismo ciclo). */
  cambioSinCheckout: boolean
  debito: Debito | null
  pagos: Pago[]
}

function fecha(iso: string | null) {
  if (!iso) return ""
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function fechaCorta(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })
}

const ESTADO_VARIANTE: Record<EstadoPlan, "default" | "secondary" | "destructive" | "outline"> = {
  activa: "default",
  prueba: "secondary",
  gracia: "outline",
  vencida: "destructive",
  cancelada: "destructive",
}

const PAGO_LABEL: Record<string, string> = {
  approved: "Aprobado",
  rejected: "Rechazado",
  pending: "Pendiente",
  in_process: "En proceso",
  cancelled: "Cancelado",
  refunded: "Reintegrado",
}

/** Barra de uso de un tipo de asiento. `max` null = sin tope. */
function Uso({
  icon: Icon,
  label,
  usados,
  max,
}: {
  icon: typeof Users
  label: string
  usados: number
  max: number | null
}) {
  // Estar en el tope es normal (p. ej. 1 de 1); en rojo solo si se pasó (tras bajar de plan).
  const excedido = max != null && usados > max
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2 font-medium">
          <Icon className="size-4 text-muted-foreground" aria-hidden /> {label}
        </span>
        <span className={excedido ? "font-medium text-destructive" : "text-muted-foreground"}>
          {max == null ? `${usados} · sin tope` : `${usados} de ${max}`}
        </span>
      </div>
      {max != null && (
        <Progress
          value={Math.min(100, max === 0 ? 100 : (usados / max) * 100)}
          className="mt-2"
          aria-label={`${label}: ${usados} de ${max}`}
        />
      )}
    </div>
  )
}

type Eleccion = { plan: PlanCatalogo; ciclo: Ciclo }

export default function Plan() {
  const { user, loading, refresh } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [datos, setDatos] = useState<MiClinica | null>(null)
  const [ciclo, setCiclo] = useState<Ciclo>("mensual")
  const [eleccion, setEleccion] = useState<Eleccion | null>(null)
  const [confirmarBaja, setConfirmarBaja] = useState(false)
  const [dandoDeBaja, setDandoDeBaja] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const d = await api.get<MiClinica>("/api/planes/mi-clinica")
      setDatos(d)
      setCiclo(d.plan.ciclo)
      return d
    } catch {
      toast.error("No se pudo cargar el plan de la clínica.")
      return null
    }
  }, [])

  // Se le pregunta a Mercado Pago por el pago (en local no llegan webhooks):
  //   - al volver del checkout (?pago=mp; MP agrega ?preapproval_id=…), antes de mostrar;
  //   - si al abrir la página hay un intento de la última hora sin confirmar (el admin
  //     cerró el checkout sin volver por la URL de vuelta), una vez y sin bloquear.
  const volviendoDeMp = searchParams.has("pago") || searchParams.has("preapproval_id")
  useEffect(() => {
    if (!user?.esAdmin) return
    let vivo = true

    async function sincronizar(avisarError: boolean) {
      try {
        await api.post("/api/pagos/suscripcion/sincronizar")
      } catch {
        if (avisarError) toast.error("No pudimos confirmar el pago todavía. Si pagaste, se actualiza en unos minutos.")
      }
      if (vivo) await Promise.all([cargar(), refresh()])
    }

    async function iniciar() {
      if (volviendoDeMp) {
        await sincronizar(true)
        if (vivo) navigate("/dashboard/plan", { replace: true })
        return
      }
      const d = await cargar()
      if (vivo && d?.pagoPendiente) await sincronizar(false)
    }

    iniciar()
    return () => {
      vivo = false
    }
  }, [user?.esAdmin, volviendoDeMp, cargar, refresh, navigate])

  // El plan lo gestiona el admin de la clínica activa.
  if (!loading && user && !user.esAdmin) return <Navigate to="/dashboard" replace />

  if (!datos) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  const { plan, uso, planes, features, debito, pagos, pagoOnline } = datos
  const clinica = user?.clinicas.find((c) => c.clinicaId === user.clinicaId)?.nombre
  const vigente = plan.estado === "activa" || plan.estado === "gracia"
  const regalo = planes[0] ? mesesDeRegalo(planes[0]) : 0
  const debitoActivo = debito?.estado === "authorized"
  // Pago atrasado: el débito falló (gracia) o el plan venció. Se paga de nuevo por el
  // checkout (otro medio de pago); el débito anterior se cancela solo al autorizarse.
  const atrasado = plan.estado === "gracia" || plan.estado === "vencida"
  const planActual = planes.find((p) => p.id === plan.planId)

  let detalle = ""
  if (plan.estado === "prueba") detalle = `La prueba termina el ${fecha(plan.pruebaHasta)}.`
  else if (plan.estado === "activa")
    detalle = plan.periodoHasta
      ? `Pago ${plan.ciclo}. ${debitoActivo ? "Pagado" : "Vigente"} hasta el ${fecha(plan.periodoHasta)}.`
      : `Pago ${plan.ciclo}.`
  else if (plan.estado === "gracia")
    detalle = `Venció el ${fecha(plan.periodoHasta)}. Tenés ${datos.diasGracia} días de gracia para renovarlo.`
  else detalle = "La clínica está en solo lectura: podés ver y exportar los datos."

  async function darDeBaja() {
    setDandoDeBaja(true)
    try {
      await api.post("/api/pagos/suscripcion/cancelar")
      toast.success("Listo: no se te va a cobrar más. El plan sigue hasta el fin del período pago.")
      setConfirmarBaja(false)
      await Promise.all([cargar(), refresh()])
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo dar de baja la renovación.")
    } finally {
      setDandoDeBaja(false)
    }
  }

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">Plan de la clínica</h1>
        <p className="mt-1 text-muted-foreground">
          Qué incluye tu plan, cuánto estás usando y cómo cambiarlo.
        </p>
      </div>

      {atrasado && pagoOnline && planActual && (
        <Card className="mb-6 border-destructive/40">
          <CardContent className="flex flex-col items-start gap-4 p-4 sm:flex-row sm:items-center sm:p-6">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">
                {plan.estado === "gracia" ? "Tenés un pago pendiente" : "Tu plan está vencido"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {plan.estado === "gracia"
                  ? debitoActivo
                    ? `No pudimos cobrar el último débito. Mercado Pago lo reintenta, pero si no se cobra en ${plan.diasRestantes ?? 0} días la clínica pasa a solo lectura. Podés pagar ya con otro medio.`
                    : `Si no se paga en ${plan.diasRestantes ?? 0} días, la clínica pasa a solo lectura.`
                  : "La clínica está en solo lectura. Al pagar se reactiva enseguida, con todos tus datos."}
              </p>
            </div>
            <Button size="lg" onClick={() => setEleccion({ plan: planActual, ciclo: plan.ciclo })}>
              Pagar ahora
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-6 p-4 sm:p-6 md:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">{clinica}</p>
            <h2 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold">
              Plan {plan.planNombre ?? "—"}
              <Badge variant={ESTADO_VARIANTE[plan.estado]}>{ESTADO_LABEL[plan.estado]}</Badge>
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{detalle}</p>
            {plan.profesionalesExtra > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Incluye {plan.profesionalesExtra} profesional
                {plan.profesionalesExtra === 1 ? "" : "es"} extra.
              </p>
            )}
            {plan.descuento && (
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">−{plan.descuento.pct} %</Badge>
                <span className="text-muted-foreground">
                  Tenés un {plan.descuento.pct} % de descuento en el plan
                  {plan.descuento.hasta ? ` hasta el ${fecha(plan.descuento.hasta)}` : ""}.
                </span>
              </p>
            )}

            {debito && (
              <div className="mt-5 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  <CreditCard className="size-4 text-primary" aria-hidden /> Débito automático en Mercado Pago
                </p>
                {debitoActivo ? (
                  <>
                    <p className="mt-1 text-muted-foreground">
                      {debito.monto != null && `${formatoPesos(debito.monto)} por ${plan.ciclo === "anual" ? "año" : "mes"}`}
                      {debito.proximoCobro && ` · próximo cobro el ${fecha(debito.proximoCobro)}`}
                      {debito.payerEmail && ` · ${debito.payerEmail}`}
                    </p>
                    {debito.cambioPrecio && (
                      <p className="mt-1 text-muted-foreground">
                        Desde el {fecha(debito.cambioPrecio.desde)} el débito pasa a{" "}
                        <strong className="text-foreground">{formatoPesos(debito.cambioPrecio.monto)}</strong> por{" "}
                        {plan.ciclo === "anual" ? "año" : "mes"}. Si no estás de acuerdo, podés darlo de baja antes sin costo.
                      </p>
                    )}
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-1 h-auto p-0 text-muted-foreground"
                      onClick={() => setConfirmarBaja(true)}
                    >
                      Dar de baja la renovación
                    </Button>
                  </>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    {debito.estado === "cancelled"
                      ? "Dado de baja: no se cobra más. El plan sigue hasta el fin del período pago."
                      : debito.estado === "paused"
                        ? "En pausa."
                        : "Pendiente de confirmación en Mercado Pago."}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <Uso icon={Users} label="Profesionales" usados={uso.profesionales} max={plan.maxProfesionales} />
            <Uso icon={ClipboardList} label="Recepción" usados={uso.recepcion} max={plan.maxRecepcion} />
            {plan.features.includes("auditoria") && (
              <Uso icon={ClipboardCheck} label="Auditoría" usados={uso.auditores} max={null} />
            )}
            <p className="text-xs text-muted-foreground">
              Solo los profesionales ocupan lugar del plan. Para sumar a alguien, generá un
              código en <Link to="/dashboard/admin" className="font-medium text-primary hover:underline">Administración</Link>.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-12 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {vigente ? "Cambiar de plan" : "Elegí un plan"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Precios finales en pesos argentinos, con IVA incluido.
          </p>
        </div>
        <Tabs value={ciclo} onValueChange={(v) => setCiclo(v as Ciclo)}>
          <TabsList>
            <TabsTrigger value="mensual">Mensual</TabsTrigger>
            <TabsTrigger value="anual">
              Anual{regalo > 0 ? ` · ${regalo} meses de regalo` : ""}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-8 grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
        {planes.map((p, i) => {
          const esActual = vigente && p.id === plan.planId
          const mismoCiclo = ciclo === plan.ciclo
          let accion: React.ReactNode
          if (!pagoOnline) {
            accion = esActual && mismoCiclo ? (
              <Button variant="outline" size="lg" className="w-full" disabled>
                Es tu plan actual
              </Button>
            ) : (
              <Button asChild size="lg" variant={p.destacado ? "default" : "outline"} className="w-full">
                <a href={waContratar(p.nombre, clinica, ciclo)} target="_blank" rel="noreferrer">
                  <MessageCircle aria-hidden /> Contratar {p.nombre}
                  <span className="sr-only"> por WhatsApp (se abre en una pestaña nueva)</span>
                </a>
              </Button>
            )
          } else if (esActual && mismoCiclo && datos.cambioSinCheckout) {
            accion =
              p.precioProfesionalExtra != null ? (
                <Button variant="outline" size="lg" className="w-full" onClick={() => setEleccion({ plan: p, ciclo })}>
                  Cambiar profesionales extra
                </Button>
              ) : (
                <Button variant="outline" size="lg" className="w-full" disabled>
                  Es tu plan actual
                </Button>
              )
          } else {
            const texto = esActual
              ? mismoCiclo
                ? `Pagar el plan ${p.nombre}`
                : `Pasar a pago ${ciclo}`
              : `Contratar ${p.nombre}`
            accion = (
              <Button
                size="lg"
                variant={p.destacado && !vigente ? "default" : "outline"}
                className="w-full"
                onClick={() => setEleccion({ plan: p, ciclo })}
              >
                {texto}
              </Button>
            )
          }
          return (
            <PlanCard
              key={p.id}
              plan={p}
              anterior={planes[i - 1]}
              features={features}
              ciclo={ciclo}
              actual={esActual && mismoCiclo}
              recomendar={!vigente}
              descuentoPct={plan.descuento?.pct}
              accion={accion}
            />
          )
        })}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
        {pagoOnline
          ? "Pagás con Mercado Pago y queda el débito automático: se renueva solo y lo podés dar de baja cuando quieras desde esta página. "
          : "Por ahora la contratación se hace por WhatsApp: te confirmamos por escrito y activamos el plan en tu clínica. "}
        Tenés 10 días corridos para arrepentirte sin costo (ver la{" "}
        <Link to="/reembolsos" className="font-medium text-primary hover:underline">
          Política de reembolsos
        </Link>
        ).
      </p>

      {pagos.length > 0 && (
        <Card className="mt-12">
          <CardContent className="p-4 sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Receipt className="size-5 text-primary" aria-hidden /> Pagos
            </h2>
            <div className="mt-4 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagos.map((pg) => (
                    <TableRow key={pg.id}>
                      <TableCell className="whitespace-nowrap">{fechaCorta(pg.fecha)}</TableCell>
                      <TableCell>
                        {planes.find((p) => p.id === pg.planId)?.nombre ?? pg.planId ?? "—"}
                        {pg.ciclo ? ` (${pg.ciclo})` : ""}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {pg.periodoDesde ? `${fechaCorta(pg.periodoDesde)} al ${fechaCorta(pg.periodoHasta)}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pg.estado === "approved" ? "default" : pg.estado === "rejected" ? "destructive" : "secondary"}>
                          {PAGO_LABEL[pg.estado] ?? pg.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {pg.monto != null ? formatoPesos(pg.monto) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {eleccion && (
        <ContratarDialog
          key={`${eleccion.plan.id}-${eleccion.ciclo}`}
          eleccion={eleccion}
          uso={uso.profesionales}
          extrasActuales={eleccion.plan.id === plan.planId ? plan.profesionalesExtra : 0}
          emailInicial={debito?.payerEmail || user?.email || ""}
          cambioDirecto={datos.cambioSinCheckout && eleccion.ciclo === plan.ciclo}
          primerCobro={datos.primerCobro}
          descuento={plan.descuento}
          onClose={() => setEleccion(null)}
          onAplicado={async () => {
            setEleccion(null)
            await Promise.all([cargar(), refresh()])
          }}
        />
      )}

      <Dialog open={confirmarBaja} onOpenChange={setConfirmarBaja}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Dar de baja la renovación?</DialogTitle>
            <DialogDescription>
              No se te va a cobrar más. El plan sigue activo hasta el {fecha(plan.periodoHasta)}; después
              la clínica queda en solo lectura (podés ver y exportar tus datos).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarBaja(false)} disabled={dandoDeBaja}>
              Volver
            </Button>
            <Button variant="destructive" onClick={darDeBaja} disabled={dandoDeBaja}>
              {dandoDeBaja && <Loader2 className="animate-spin" />} Dar de baja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Container>
  )
}

/**
 * Confirmación de la contratación: profesionales extra, email de Mercado Pago y total.
 * Con un débito vigente del mismo ciclo, el cambio se aplica sin pasar por el checkout.
 */
function ContratarDialog({
  eleccion,
  uso,
  extrasActuales,
  emailInicial,
  cambioDirecto,
  primerCobro,
  descuento,
  onClose,
  onAplicado,
}: {
  eleccion: Eleccion
  uso: number
  extrasActuales: number
  emailInicial: string
  cambioDirecto: boolean
  primerCobro: string | null
  descuento: Descuento | null
  onClose: () => void
  onAplicado: () => void
}) {
  const { plan, ciclo } = eleccion
  const admiteExtra = plan.precioProfesionalExtra != null
  // Mínimo de extras para que entren los profesionales activos de hoy.
  const minimo = admiteExtra ? Math.max(0, uso - plan.profesionalesIncluidos) : 0
  const [extras, setExtras] = useState(String(Math.max(minimo, extrasActuales)))
  const [email, setEmail] = useState(emailInicial)
  const [enviando, setEnviando] = useState(false)

  const nExtras = Number.parseInt(extras, 10)
  const extrasValidos = Number.isInteger(nExtras) && nExtras >= minimo && nExtras <= 500
  const noEntra = !admiteExtra && uso > plan.profesionalesIncluidos
  const extrasTotal = extrasValidos ? nExtras : minimo
  const pct = descuento?.pct ?? 0
  const lista = montoPlan(plan, ciclo, extrasTotal)
  const total = montoPlan(plan, ciclo, extrasTotal, pct)

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    if (!extrasValidos) return
    setEnviando(true)
    try {
      const r = await api.post<{ initPoint?: string; aplicado?: boolean }>("/api/pagos/suscripcion", {
        planId: plan.id,
        ciclo,
        profesionalesExtra: admiteExtra ? nExtras : 0,
        ...(email.trim() ? { payerEmail: email.trim() } : {}),
      })
      if (r.initPoint) {
        window.location.assign(r.initPoint)
        return
      }
      toast.success(`Listo: tu clínica ya está en el plan ${plan.nombre}. El nuevo monto se cobra desde el próximo débito.`)
      onAplicado()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo iniciar el pago.")
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={confirmar} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Plan {plan.nombre} · pago {ciclo}</DialogTitle>
            <DialogDescription>
              {cambioDirecto
                ? "Se cambia tu débito automático: el plan rige ya y el nuevo monto se cobra desde el próximo débito."
                : primerCobro
                  ? `Te llevamos a Mercado Pago para dejar el débito automático. No se te cobra nada hasta el ${fecha(primerCobro)}: ese día es el primer débito. Lo podés dar de baja cuando quieras.`
                  : "Te llevamos a Mercado Pago para pagar. Queda el débito automático y lo podés dar de baja cuando quieras."}
            </DialogDescription>
          </DialogHeader>

          {noEntra && (
            <p className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive" role="alert">
              Tu clínica tiene {uso} profesionales activos y este plan admite {plan.profesionalesIncluidos}. Dá de
              baja a alguien en Administración o elegí un plan más grande.
            </p>
          )}

          {admiteExtra && (
            <div className="grid gap-1.5">
              <Label htmlFor="contratar-extras">Profesionales extra</Label>
              <Input
                id="contratar-extras"
                type="number"
                inputMode="numeric"
                min={minimo}
                max={500}
                value={extras}
                aria-invalid={!extrasValidos}
                aria-describedby="contratar-extras-ayuda"
                onChange={(e) => setExtras(e.target.value)}
              />
              <p id="contratar-extras-ayuda" className="text-xs text-muted-foreground">
                Incluye {plan.profesionalesIncluidos}; cada extra suma{" "}
                {formatoPesos(plan.precioProfesionalExtra ?? 0)} por mes.
                {minimo > 0 && ` Hoy tenés ${uso} activos: necesitás al menos ${minimo}.`}
              </p>
            </div>
          )}

          {!cambioDirecto && (
            <div className="grid gap-1.5">
              <Label htmlFor="contratar-email">Email de tu cuenta de Mercado Pago</Label>
              <Input
                id="contratar-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                aria-describedby="contratar-email-ayuda"
                onChange={(e) => setEmail(e.target.value)}
              />
              <p id="contratar-email-ayuda" className="text-xs text-muted-foreground">
                Tenés que pagar con la cuenta de Mercado Pago de este email.
              </p>
            </div>
          )}

          <div className="grid gap-1 rounded-lg bg-muted/40 px-4 py-3">
            {pct > 0 && (
              <>
                <div className="flex items-baseline justify-between text-sm text-muted-foreground">
                  <span>Precio de lista</span>
                  <s className="tabular-nums">{formatoPesos(lista)}</s>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span>
                    Descuento {pct} %
                    {descuento?.hasta && (
                      <span className="text-muted-foreground"> · hasta el {fecha(descuento.hasta)}</span>
                    )}
                  </span>
                  <span className="tabular-nums">−{formatoPesos(lista - total)}</span>
                </div>
              </>
            )}
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Total por {ciclo === "anual" ? "año" : "mes"}</span>
              <span className="text-xl font-semibold tabular-nums">{formatoPesos(total)}</span>
            </div>
            {pct > 0 && descuento?.hasta && (
              <p className="text-xs text-muted-foreground">
                Al terminar el descuento se cobra el precio de lista; te avisamos por email con 30 días de anticipación.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={enviando || !extrasValidos || noEntra || (!cambioDirecto && !email.trim())}>
              {enviando && <Loader2 className="animate-spin" />}
              {cambioDirecto ? "Confirmar cambio" : "Ir a pagar con Mercado Pago"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
