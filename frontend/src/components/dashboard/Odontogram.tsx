import { useMemo, useState, type KeyboardEvent } from "react"
import { Eraser, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "cn"
import {
  CONDICIONES,
  CARA_LABEL,
  ESTADO_COLOR,
  ESTADO_LABEL,
  PERMANENTES,
  TEMPORALES,
  carasDelDiente,
  condicionLabel,
  esTemporal,
  type Diente,
  type Estado,
} from "@/lib/odontograma"

import { useMediaQuery } from "@/hooks/useMediaQuery"

export type { Diente } from "@/lib/odontograma"

// --- Geometría del dibujo ---
const S = 30 // lado de la cajita del diente
const STRIDE = 38 // separación horizontal entre dientes
const PADX = 12
const IN = 10 // inset de la cara oclusal (centro)

const UP_NUM_Y = 11
const UP_BOX_Y = 16
const UP_CODE_Y = UP_BOX_Y + S + 12
const ARCH_H = UP_CODE_Y + 8
const GAP_ARCH = 8
const LO_CODE_Y = ARCH_H + GAP_ARCH + 10
const LO_BOX_Y = LO_CODE_Y + 6
const LO_NUM_Y = LO_BOX_Y + S + 12
const TOTAL_H = LO_NUM_Y + 6

const CONDICIONES_CARA = Object.entries(CONDICIONES).filter(([, c]) => c.scope === "cara")
const CONDICIONES_DIENTE = Object.entries(CONDICIONES).filter(([, c]) => c.scope === "diente")

// Condiciones de diente completo que se dibujan como símbolo (el resto va como código).
const CON_SIMBOLO = new Set(["ausente", "extraccion", "corona", "endodoncia"])

function poly(pts: number[][]) {
  return pts.map((p) => p.join(",")).join(" ")
}

// Enter / Espacio activan los elementos SVG con role="button" (igual que un <button>).
function onActivate(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      fn()
    }
  }
}

export function Odontogram({
  value,
  onChange,
  readOnly = false,
}: {
  value: Diente[]
  onChange?: (d: Diente[]) => void
  readOnly?: boolean
}) {
  const compacto = useMediaQuery("(max-width: 639px)")
  const [tool, setTool] = useState<string>("caries")
  const [estado, setEstado] = useState<Estado>("pendiente")
  const [denticion, setDenticion] = useState<"adulto" | "nino">("adulto")
  const [detalle, setDetalle] = useState<string | null>(null)

  // En solo-lectura mostramos la dentición temporal únicamente si hay hallazgos en ella.
  const hayTemporales = useMemo(() => value.some((d) => esTemporal(d.numero)), [value])
  const mostrarTemporal = readOnly ? hayTemporales : denticion === "nino"
  const filas = mostrarTemporal ? TEMPORALES : PERMANENTES

  const byTooth = useMemo(() => {
    const m = new Map<string, Diente[]>()
    for (const d of value) {
      if (!m.has(d.numero)) m.set(d.numero, [])
      m.get(d.numero)!.push(d)
    }
    return m
  }, [value])

  function seleccionarTool(t: string) {
    setTool(t)
    if (t !== "borrar" && CONDICIONES[t]) setEstado(CONDICIONES[t].estadoDefault)
  }

  function aplicarCara(numero: string, cara: string) {
    if (readOnly || !onChange) return
    if (tool === "borrar") {
      onChange(value.filter((d) => !(d.numero === numero && d.cara === cara)))
      return
    }
    const cfg = CONDICIONES[tool]
    if (!cfg) return
    if (cfg.scope === "cara") {
      const next = value.filter((d) => !(d.numero === numero && d.cara === cara))
      next.push({ numero, condicion: tool, cara, estado })
      onChange(next)
    } else {
      // Diente completo: alterna. Si ya existe con el mismo estado, lo quita.
      const idx = value.findIndex(
        (d) => d.numero === numero && d.condicion === tool && (d.cara == null)
      )
      if (idx >= 0) {
        if (value[idx].estado === estado) {
          onChange(value.filter((_, i) => i !== idx))
        } else {
          onChange(value.map((d, i) => (i === idx ? { ...d, estado } : d)))
        }
      } else {
        onChange([...value, { numero, condicion: tool, cara: null, estado }])
      }
    }
  }

  function quitarHallazgo(d: Diente) {
    if (!onChange) return
    onChange(
      value.filter(
        (x) => !(x.numero === d.numero && x.condicion === d.condicion && x.cara === d.cara)
      )
    )
  }

  function setNota(d: Diente, notas: string) {
    if (!onChange) return
    onChange(
      value.map((x) =>
        x.numero === d.numero && x.condicion === d.condicion && x.cara === d.cara
          ? { ...x, notas }
          : x
      )
    )
  }

  const width = PADX * 2 + filas.superior.length * STRIDE
  const dividerX = PADX + (filas.superior.length / 2) * STRIDE - (STRIDE - S) / 2

  // En pantallas angostas la arcada completa obligaría a un scroll horizontal de más
  // del doble del ancho: la partimos por la línea media y apilamos las dos mitades.
  const mitad = filas.superior.length / 2
  const mitades: {
    key: string
    label: string | null
    superior: string[]
    inferior: string[]
  }[] = compacto
    ? [
        {
          key: "derecha",
          label: "Lado derecho del paciente",
          superior: filas.superior.slice(0, mitad),
          inferior: filas.inferior.slice(0, mitad),
        },
        {
          key: "izquierda",
          label: "Lado izquierdo del paciente",
          superior: filas.superior.slice(mitad),
          inferior: filas.inferior.slice(mitad),
        },
      ]
    : [
        {
          key: "completo",
          label: null,
          superior: filas.superior,
          inferior: filas.inferior,
        },
      ]

  function renderDiente(numero: string, i: number, isUpper: boolean) {
    const x = PADX + i * STRIDE
    const boxY = isUpper ? UP_BOX_Y : LO_BOX_Y
    const numY = isUpper ? UP_NUM_Y : LO_NUM_Y
    const codeY = isUpper ? UP_CODE_Y : LO_CODE_Y
    const meta = carasDelDiente(numero)
    const findings = byTooth.get(numero) || []

    const ausente = findings.find((f) => f.condicion === "ausente")
    const extrac = findings.find((f) => f.condicion === "extraccion")
    const corona = findings.find((f) => f.condicion === "corona")
    const endo = findings.find((f) => f.condicion === "endodoncia")
    const codigos = findings.filter(
      (f) => f.cara == null && !CON_SIMBOLO.has(f.condicion)
    )

    const l = x
    const r = x + S
    const t = boxY
    const b = boxY + S
    const ci1 = x + IN
    const ci2 = x + S - IN
    const cj1 = boxY + IN
    const cj2 = boxY + S - IN

    const zonas = [
      { cara: meta.arriba, pts: [[l, t], [r, t], [ci2, cj1], [ci1, cj1]] },
      { cara: meta.abajo, pts: [[l, b], [r, b], [ci2, cj2], [ci1, cj2]] },
      { cara: meta.izquierda, pts: [[l, t], [l, b], [ci1, cj2], [ci1, cj1]] },
      { cara: meta.derecha, pts: [[r, t], [r, b], [ci2, cj2], [ci2, cj1]] },
    ]

    function fillCara(cara: string) {
      if (ausente) return "var(--muted)"
      const f = findings.find((d) => d.cara === cara)
      return f ? ESTADO_COLOR[(f.estado as Estado) || "realizado"] || "var(--card)" : "var(--card)"
    }

    function describirCara(cara: string) {
      const base = `Diente ${numero}, cara ${CARA_LABEL[cara] ?? cara}`
      if (ausente) return `${base}: ausente`
      const f = findings.find((d) => d.cara === cara)
      return f
        ? `${base}: ${condicionLabel(f.condicion)}, ${ESTADO_LABEL[(f.estado as Estado) || "realizado"]}`
        : base
    }

    const cursor = readOnly ? "default" : "pointer"
    // Solo las caras editables entran al orden de tabulación.
    const caraProps = (cara: string) =>
      readOnly
        ? {}
        : {
            role: "button",
            tabIndex: 0,
            "aria-label": describirCara(cara),
            onKeyDown: onActivate(() => aplicarCara(numero, cara)),
            className: "outline-none focus-visible:stroke-ring focus-visible:stroke-2",
          }

    return (
      <g key={numero} role="group" aria-label={`Diente ${numero}`}>
        {/* Número (abre el detalle) */}
        <g
          role="button"
          tabIndex={0}
          aria-label={`Ver detalle del diente ${numero}${
            findings.length ? ` (${findings.length} hallazgos)` : ""
          }`}
          className="group outline-none"
          style={{ cursor: "pointer" }}
          onClick={() => setDetalle(numero)}
          onKeyDown={onActivate(() => setDetalle(numero))}
        >
          <rect
            x={x}
            y={numY - 10}
            width={S}
            height={14}
            rx={3}
            fill="transparent"
            strokeWidth={1.5}
            className="stroke-transparent group-focus-visible:stroke-ring"
          />
          <text
            x={x + S / 2}
            y={numY}
            textAnchor="middle"
            fontSize="11"
            fontWeight={findings.length ? 700 : 400}
            fill="currentColor"
          >
            {numero}
          </text>
        </g>

        {/* Caras triangulares */}
        {zonas.map((z, k) => (
          <polygon
            key={k}
            points={poly(z.pts)}
            fill={fillCara(z.cara)}
            stroke="var(--border)"
            strokeWidth={1}
            style={{ cursor }}
            onClick={() => aplicarCara(numero, z.cara)}
            {...caraProps(z.cara)}
          />
        ))}
        {/* Cara central (oclusal / incisal) */}
        <rect
          x={ci1}
          y={cj1}
          width={S - IN * 2}
          height={S - IN * 2}
          fill={fillCara(meta.centro)}
          stroke="var(--border)"
          strokeWidth={1}
          style={{ cursor }}
          onClick={() => aplicarCara(numero, meta.centro)}
          {...caraProps(meta.centro)}
        />

        {/* Símbolos de diente completo (no interceptan el click) */}
        {corona && (
          <circle
            cx={x + S / 2}
            cy={boxY + S / 2}
            r={S / 2 + 2}
            fill="none"
            stroke={ESTADO_COLOR[(corona.estado as Estado) || "realizado"]}
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
        {/* Endodoncia: línea vertical que atraviesa todo el diente (azul a tratar, roja realizada) */}
        {endo && (
          <line
            x1={x + S / 2}
            y1={t - 3}
            x2={x + S / 2}
            y2={b + 3}
            stroke={ESTADO_COLOR[(endo.estado as Estado) || "realizado"]}
            strokeWidth={2.5}
            strokeLinecap="round"
            pointerEvents="none"
          />
        )}
        {(ausente || extrac) && (
          <g pointerEvents="none">
            <line
              x1={l + 3}
              y1={t + 3}
              x2={r - 3}
              y2={b - 3}
              stroke={ESTADO_COLOR[((extrac || ausente)!.estado as Estado) || "realizado"]}
              strokeWidth={2}
            />
            <line
              x1={r - 3}
              y1={t + 3}
              x2={l + 3}
              y2={b - 3}
              stroke={ESTADO_COLOR[((extrac || ausente)!.estado as Estado) || "realizado"]}
              strokeWidth={2}
            />
          </g>
        )}

        {/* Códigos de diente completo (implante, prótesis, movilidad) */}
        {codigos.length > 0 && (
          <text
            x={x + S / 2}
            y={codeY}
            textAnchor="middle"
            fontSize="9"
            fontWeight={600}
            pointerEvents="none"
          >
            {codigos.map((f, k) => (
              <tspan key={k} fill={ESTADO_COLOR[(f.estado as Estado) || "realizado"]}>
                {(k ? " " : "") + CONDICIONES[f.condicion].corto}
              </tspan>
            ))}
          </text>
        )}
      </g>
    )
  }

  const detalleFindings = detalle ? byTooth.get(detalle) || [] : []

  return (
    <div>
      {!readOnly && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Estado */}
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {(["realizado", "pendiente"] as Estado[]).map((e) => (
                <button
                  key={e}
                  type="button"
                  aria-pressed={estado === e}
                  onClick={() => setEstado(e)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11",
                    estado === e ? "text-white" : "bg-background hover:bg-muted"
                  )}
                  style={estado === e ? { background: ESTADO_COLOR[e] } : undefined}
                >
                  {ESTADO_LABEL[e]}
                </button>
              ))}
            </div>

            {/* Dentición */}
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              {(["adulto", "nino"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={denticion === d}
                  onClick={() => setDenticion(d)}
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11",
                    denticion === d
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  )}
                >
                  {d === "adulto" ? "Adulto" : "Niño"}
                </button>
              ))}
            </div>
          </div>

          {/* Herramientas */}
          <div className="mt-3 space-y-2">
            <ToolGroup
              titulo="Por cara"
              items={CONDICIONES_CARA}
              tool={tool}
              onPick={seleccionarTool}
            />
            <ToolGroup
              titulo="Diente completo"
              items={CONDICIONES_DIENTE}
              tool={tool}
              onPick={seleccionarTool}
            />
            <div>
              <button
                type="button"
                aria-pressed={tool === "borrar"}
                onClick={() => seleccionarTool("borrar")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors pointer-coarse:min-h-11",
                  tool === "borrar"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background hover:bg-muted"
                )}
              >
                <Eraser className="size-4" /> Borrar cara
              </button>
            </div>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Elegí un estado y una condición, y tocá una cara del diente (o el diente,
            para condiciones completas). Tocá el número del diente para ver el detalle
            y agregar notas. Con teclado: Tab para moverte y Enter para aplicar.
          </p>
        </div>
      )}

      <div className={cn("space-y-4 overflow-x-auto", !readOnly && "mt-4")}>
        {mitades.map((m) => (
          <div key={m.key}>
            {m.label && (
              <p className="mb-1 text-center text-xs font-medium text-muted-foreground">
                {m.label}
              </p>
            )}
            <svg
              id={m.key === "completo" ? "odontogramaSVG" : undefined}
              viewBox={`0 0 ${PADX * 2 + m.superior.length * STRIDE} ${TOTAL_H}`}
              role="group"
              aria-label={m.label ? `Odontograma — ${m.label}` : "Odontograma"}
              className="mx-auto block max-w-full text-muted-foreground"
              style={compacto ? undefined : { minWidth: Math.min(width, 620) }}
            >
              {m.key === "completo" && (
                <line
                  x1={dividerX}
                  y1={4}
                  x2={dividerX}
                  y2={TOTAL_H - 4}
                  stroke="var(--border)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              )}
              {m.superior.map((n, i) => renderDiente(n, i, true))}
              {m.inferior.map((n, i) => renderDiente(n, i, false))}
            </svg>
          </div>
        ))}
      </div>

      <Legend />

      {/* Detalle del diente */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Diente {detalle}</DialogTitle>
            <DialogDescription>
              {detalleFindings.length
                ? "Hallazgos registrados en este diente."
                : "Este diente no tiene hallazgos registrados."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {detalleFindings.map((d, k) => (
              <div key={k} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="inline-block size-3 rounded-sm"
                      style={{ background: ESTADO_COLOR[(d.estado as Estado) || "realizado"] }}
                    />
                    <span className="text-sm font-medium">{condicionLabel(d.condicion)}</span>
                    {d.cara && (
                      <Badge variant="secondary">{CARA_LABEL[d.cara] ?? d.cara}</Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {d.estado === "pendiente" ? ESTADO_LABEL.pendiente : ESTADO_LABEL.realizado}
                    </span>
                  </div>
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => quitarHallazgo(d)}
                    >
                      Quitar
                    </Button>
                  )}
                </div>
                {readOnly ? (
                  d.notas ? <p className="mt-2 text-sm text-muted-foreground">{d.notas}</p> : null
                ) : (
                  <Textarea
                    className="mt-2"
                    rows={2}
                    placeholder="Notas (opcional)"
                    value={d.notas || ""}
                    onChange={(e) => setNota(d, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button onClick={() => setDetalle(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ToolGroup({
  titulo,
  items,
  tool,
  onPick,
}: {
  titulo: string
  items: [string, (typeof CONDICIONES)[string]][]
  tool: string
  onPick: (t: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{titulo}</span>
      <div className="flex flex-wrap gap-1.5">
        {items.map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tool === key}
            onClick={() => onPick(key)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-10 pointer-coarse:px-3",
              tool === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted"
            )}
          >
            {cfg.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Legend() {
  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: ESTADO_COLOR.realizado }} />
          Realizado
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-sm" style={{ background: ESTADO_COLOR.pendiente }} />
          A tratar
        </span>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        ○ Corona · | Endodoncia · ✕ Ausente/Extracción · Im Implante · PF/PR Prótesis · Mov Movilidad
      </p>
    </div>
  )
}
