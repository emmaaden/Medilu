import { useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, TriangleAlert, X } from "lucide-react"
import { cn } from "cn"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { edadRecomendada, estadoHito, type EstadoHito } from "@/lib/pediatria/estado"
import { fechaCorta, type Catalogo, type HitoEvaluado } from "@/lib/pediatria/tipos"

type Marca = "logrado" | "no_logrado"

/** Pautas madurativas por edad: logrado / no logrado, con alerta si se pasó el margen. */
export function HitosDesarrollo({
  pacienteId,
  catalogo,
  hitos,
  edadMeses,
  readOnly,
  onCambio,
}: {
  pacienteId?: number
  catalogo: Catalogo
  hitos: HitoEvaluado[]
  /** Edad (corregida si es prematuro). */
  edadMeses: number
  readOnly?: boolean
  onCambio?: () => void
}) {
  const [cambios, setCambios] = useState<Record<string, Marca>>({})
  const [guardando, setGuardando] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const evaluados = new Map(hitos.map((h) => [h.hito, h]))

  // Hasta la próxima franja de edad (o todos).
  const limite = verTodos ? Infinity : edadMeses + 3
  const edades = [...new Set(catalogo.hitos.map((h) => h.edad))].filter((e) => e <= limite)
  const alertas = catalogo.hitos.filter(
    (h) => estadoHito(h.edad, evaluados.get(h.codigo), edadMeses) === "alerta"
  ).length

  async function guardar() {
    const lista = Object.entries(cambios).map(([hito, estado]) => ({ hito, estado }))
    if (!lista.length || !pacienteId) return
    setGuardando(true)
    try {
      await api.put(`/pediatria/${pacienteId}/hitos`, { hitos: lista })
      toast.success("Evaluación guardada")
      setCambios({})
      onCambio?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar.")
    } finally {
      setGuardando(false)
    }
  }

  function marcar(codigo: string, m: Marca) {
    setCambios((c) => {
      const actual = c[codigo] ?? evaluados.get(codigo)?.estado
      const next = { ...c }
      if (actual === m) delete next[codigo]
      else next[codigo] = m
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {alertas > 0 ? (
          <Badge variant="destructive">
            <TriangleAlert /> {alertas} pauta{alertas > 1 ? "s" : ""} no lograda{alertas > 1 ? "s" : ""} para la edad
          </Badge>
        ) : (
          <Badge variant="outline">Sin alertas</Badge>
        )}
        <Button variant="ghost" size="sm" onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? "Ver hasta la edad actual" : "Ver todas las edades"}
        </Button>
        {!readOnly && (
          <Button className="ml-auto" onClick={guardar} disabled={guardando || !Object.keys(cambios).length}>
            {guardando && <Loader2 className="animate-spin" />} Guardar evaluación
          </Button>
        )}
      </div>

      {edades.length === 0 && <p className="text-sm text-muted-foreground">Sin pautas para esta edad.</p>}

      {[...edades].reverse().map((edad) => (
        <div key={edad} className="rounded-xl border border-border">
          <p className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">{edadRecomendada(edad)}</p>
          <ul className="divide-y divide-border">
            {catalogo.hitos
              .filter((h) => h.edad === edad)
              .map((h) => {
                const ev = evaluados.get(h.codigo)
                const marca = cambios[h.codigo] ?? ev?.estado
                const estado: EstadoHito = cambios[h.codigo]
                  ? estadoHito(h.edad, { hito: h.codigo, estado: cambios[h.codigo], fechaEvaluacion: "" }, edadMeses)
                  : estadoHito(h.edad, ev, edadMeses)
                return (
                  <li key={h.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      {h.texto}
                      <span className="block text-xs text-muted-foreground">
                        {catalogo.areasHito[h.area] ?? h.area}
                        {ev && !cambios[h.codigo] && ` · evaluado ${fechaCorta(ev.fechaEvaluacion)}`}
                      </span>
                    </span>
                    {estado === "alerta" && <TriangleAlert className="size-4 text-destructive" aria-label="Alerta" />}
                    {readOnly ? (
                      <Badge variant={marca === "logrado" ? "default" : marca === "no_logrado" ? "destructive" : "outline"}>
                        {marca === "logrado" ? "Logrado" : marca === "no_logrado" ? "No logrado" : "Sin evaluar"}
                      </Badge>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={marca === "logrado" ? "default" : "outline"}
                          onClick={() => marcar(h.codigo, "logrado")}
                          aria-pressed={marca === "logrado"}
                        >
                          <Check /> Logrado
                        </Button>
                        <Button
                          size="sm"
                          variant={marca === "no_logrado" ? "destructive" : "outline"}
                          onClick={() => marcar(h.codigo, "no_logrado")}
                          aria-pressed={marca === "no_logrado"}
                          className={cn(marca !== "no_logrado" && "text-muted-foreground")}
                        >
                          <X /> No
                        </Button>
                      </div>
                    )}
                  </li>
                )
              })}
          </ul>
        </div>
      ))}

      <p className="text-xs text-muted-foreground">
        Pautas orientativas. Ante dudas o alertas, evaluar con una prueba de tamizaje (p. ej. PRUNAPE).
      </p>
    </div>
  )
}
