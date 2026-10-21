import { Check, Star } from "lucide-react"
import { cn } from "cn"
import { Badge } from "@/components/ui/badge"
import { formatoPesos, mesesDeRegalo, montoPlan, type Plan } from "@/lib/planes"

export type Ciclo = "mensual" | "anual"

/** Líneas de asientos del plan (lo primero que compara quien elige). */
function lineasAsientos(p: Plan) {
  const lineas = [
    p.profesionalesIncluidos === 1
      ? "1 profesional"
      : `${p.profesionalesIncluidos} profesionales incluidos`,
  ]
  if (p.precioProfesionalExtra != null) {
    lineas.push(`Profesional extra: ${formatoPesos(p.precioProfesionalExtra)} por mes`)
  }
  lineas.push(
    p.maxRecepcion == null
      ? "Recepción sin tope"
      : `${p.maxRecepcion} ${p.maxRecepcion === 1 ? "persona" : "personas"} de recepción`
  )
  return lineas
}

/**
 * Tarjeta de un plan. Muestra solo lo que AGREGA respecto del plan anterior
 * (`anterior`), así la comparación se lee de un vistazo. `accion` es el botón.
 */
export function PlanCard({
  plan,
  anterior,
  features,
  ciclo,
  actual = false,
  recomendar = true,
  descuentoPct = 0,
  accion,
}: {
  plan: Plan
  anterior?: Plan
  features: Record<string, string>
  ciclo: Ciclo
  actual?: boolean
  /** Resaltar el plan destacado (en el panel se resalta solo el plan actual). */
  recomendar?: boolean
  /** Descuento manual de la clínica (Fase X): se muestra el precio con descuento. */
  descuentoPct?: number
  accion: React.ReactNode
}) {
  const nuevas = plan.features.filter((f) => !anterior?.features.includes(f) && f !== "recepcion")
  const lista = ciclo === "anual" ? plan.precioAnual : plan.precioMensual
  const precio = montoPlan(plan, ciclo, 0, descuentoPct)
  const regalo = mesesDeRegalo(plan)
  const recomendado = recomendar && plan.destacado && !actual

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border bg-card p-6 ring-1 ring-foreground/5 sm:p-8",
        actual || recomendado ? "border-primary shadow-lg" : "border-border"
      )}
    >
      {actual ? (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Tu plan</Badge>
      ) : (
        recomendado && (
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Star aria-hidden /> Recomendado
          </Badge>
        )
      )}

      <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
        {plan.nombre}
        {descuentoPct > 0 && <Badge variant="secondary">−{descuentoPct} %</Badge>}
      </h2>
      {descuentoPct > 0 && (
        <p className="mt-2 text-sm text-muted-foreground tabular-nums">
          <span className="sr-only">Precio de lista: </span>
          <s>{formatoPesos(lista)}</s>
        </p>
      )}
      <div className={cn("flex flex-wrap items-baseline gap-x-1", descuentoPct > 0 ? "mt-0.5" : "mt-2")}>
        <span className="text-4xl font-semibold tabular-nums">{formatoPesos(precio)}</span>
        <span className="text-sm text-muted-foreground">
          / {ciclo === "anual" ? "año" : "mes"}
        </span>
        <span className="sr-only">, precio final en pesos argentinos</span>
      </div>
      <p className="mt-1 min-h-5 text-xs text-muted-foreground">
        {ciclo === "anual"
          ? `Equivale a ${formatoPesos(Math.round(precio / 12))} por mes${
              regalo > 0 ? ` · ${regalo} meses de regalo` : ""
            }`
          : ""}
      </p>
      {plan.descripcion && (
        <p className="mt-3 text-sm text-muted-foreground">{plan.descripcion}</p>
      )}

      <ul className="mt-6 space-y-2.5 text-sm">
        {lineasAsientos(plan).map((l) => (
          <li key={l} className="flex items-start gap-2.5 font-medium">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {l}
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {anterior ? `Todo lo del plan ${anterior.nombre}, más:` : "Incluye:"}
      </p>
      <ul className="mt-2.5 flex-1 space-y-2.5 text-sm">
        {nuevas.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            {features[f] ?? f}
          </li>
        ))}
      </ul>

      <div className="mt-8">{accion}</div>
    </div>
  )
}
