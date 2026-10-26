import { useState } from "react"
import { ClipboardPlus, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SelectField } from "@/components/form/SelectField"
import { FARMACOS, calcularDosis, rango, redondear } from "@/lib/pediatria/dosis"
import { numero, textoNumero } from "./comun"

const OTRA = "__otra"

/** Dosis por peso (orientativa). Toma el último peso cargado; se puede cambiar. */
export function CalculadoraDosis({
  pesoKg,
  onCopiar,
}: {
  pesoKg: number | null
  /** Agrega la indicación al tratamiento de la nueva consulta. */
  onCopiar?: (texto: string) => void
}) {
  const [codigo, setCodigo] = useState(FARMACOS[0].codigo)
  const [peso, setPeso] = useState(textoNumero(pesoKg))
  const f = FARMACOS.find((x) => x.codigo === codigo)!
  const [presentacion, setPresentacion] = useState<string>(f.presentaciones[0]?.nombre ?? OTRA)
  const [concentracion, setConcentracion] = useState("")

  const kg = numero(peso)
  const r = kg ? calcularDosis(f, kg) : null
  const mgPorMl =
    presentacion === OTRA ? numero(concentracion) : f.presentaciones.find((p) => p.nombre === presentacion)?.mgPorMl ?? null
  const ml = r && mgPorMl ? ([r.mgToma[0] / mgPorMl, r.mgToma[1] / mgPorMl] as [number, number]) : null

  function elegir(c: string) {
    setCodigo(c)
    const nuevo = FARMACOS.find((x) => x.codigo === c)!
    setPresentacion(nuevo.presentaciones[0]?.nombre ?? OTRA)
  }

  const indicacion =
    r &&
    `${f.nombre}: ${rango(r.mgToma, "mg")}${ml ? ` (${rango(ml, "ml")} de ${presentacion === OTRA ? `${concentracion} mg/ml` : presentacion})` : ""} ${f.intervalo}.`

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="dosis-farmaco">Fármaco</Label>
          <SelectField
            id="dosis-farmaco"
            value={codigo}
            onValueChange={elegir}
            options={FARMACOS.map((x) => ({ value: x.codigo, label: x.nombre }))}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="dosis-peso">Peso (kg)</Label>
          <Input id="dosis-peso" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="dosis-presentacion">Presentación</Label>
          <SelectField
            id="dosis-presentacion"
            value={presentacion}
            onValueChange={setPresentacion}
            options={[
              ...f.presentaciones.map((p) => ({ value: p.nombre, label: p.nombre })),
              { value: OTRA, label: "Otra concentración…" },
            ]}
          />
        </div>
        {presentacion === OTRA && (
          <div className="grid gap-1.5">
            <Label htmlFor="dosis-conc">mg por ml</Label>
            <Input id="dosis-conc" inputMode="decimal" value={concentracion} onChange={(e) => setConcentracion(e.target.value)} />
          </div>
        )}
      </div>

      {r ? (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm text-muted-foreground">
            {f.mgKgDosis ? `${rango(f.mgKgDosis, "mg/kg/dosis")}` : `${rango(f.mgKgDia!, "mg/kg/día")} en ${f.tomasDia} toma${f.tomasDia > 1 ? "s" : ""}`}
            {" · "}
            {f.intervalo}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {rango(r.mgToma, "mg")} <span className="text-base font-normal text-muted-foreground">por toma</span>
          </p>
          {ml && <p className="text-lg">{rango(ml, "ml")} por toma</p>}
          <p className="mt-1 text-sm text-muted-foreground">Total diario: {rango(r.mgDia, "mg")}</p>
          {r.topeado && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-destructive">
              <TriangleAlert className="size-4" /> Topeado a la dosis máxima de adulto
              {f.maxDosisMg ? ` (${redondear(f.maxDosisMg)} mg/toma)` : ""}
              {f.maxDiaMg ? ` · ${redondear(f.maxDiaMg)} mg/día` : ""}.
            </p>
          )}
          {f.nota && <p className="mt-2 text-sm">{f.nota}</p>}
          {onCopiar && indicacion && (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => onCopiar(indicacion)}>
              <ClipboardPlus /> Copiar al tratamiento
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Cargá el peso para calcular.</p>
      )}

      <Alert>
        <TriangleAlert />
        <AlertDescription>
          Orientativo: verificá la dosis, la indicación y la presentación disponible antes de indicar.
        </AlertDescription>
      </Alert>
    </div>
  )
}
