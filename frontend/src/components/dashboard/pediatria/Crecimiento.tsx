import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Plus, Trash2, TriangleAlert } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { cn } from "cn"
import { api, ApiError } from "@/lib/api"
import { hoyAR } from "@/lib/fecha"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SelectField } from "@/components/form/SelectField"
import {
  INDICADORES,
  PERCENTILES,
  curvas,
  edadMaxima,
  edadMeses,
  formatoEdad,
  formatoPercentil,
  interpretacion,
  puntajeZ,
  valorIndicador,
  type Indicador,
  type SexoOms,
} from "@/lib/pediatria/oms"
import { fechaCorta, type MedicionApi, type Perinatal } from "@/lib/pediatria/tipos"
import { decimal, numero, puntosPaciente, type PuntoCrecimiento } from "./comun"

const CONFIG = {
  p3: { label: "P3", color: "var(--muted-foreground)" },
  p15: { label: "P15", color: "var(--muted-foreground)" },
  p50: { label: "P50", color: "var(--chart-2)" },
  p85: { label: "P85", color: "var(--muted-foreground)" },
  p97: { label: "P97", color: "var(--muted-foreground)" },
  valor: { label: "Paciente", color: "var(--primary)" },
} satisfies ChartConfig

type Rango = "0-24" | "0-60" | "60-228"
const RANGOS: Record<Rango, { label: string; desde: number; hasta: number }> = {
  "0-24": { label: "0 a 2 años", desde: 0, hasta: 24 },
  "0-60": { label: "0 a 5 años", desde: 0, hasta: 60 },
  "60-228": { label: "5 a 19 años", desde: 60, hasta: 228 },
}

function rangoInicial(meses: number): Rango {
  return meses < 24 ? "0-24" : meses < 60 ? "0-60" : "60-228"
}

function etiquetaEdad(meses: number) {
  return meses < 24 ? `${meses} m` : `${Math.round((meses / 12) * 10) / 10} a`.replace(".", ",")
}

export function CurvaCrecimiento({
  indicador,
  sexo,
  puntos,
  rango,
}: {
  indicador: Indicador
  sexo: SexoOms
  puntos: PuntoCrecimiento[]
  rango: Rango
}) {
  const r = RANGOS[rango]
  const datos = useMemo(() => curvas(indicador, sexo, r.desde, r.hasta), [indicador, sexo, r.desde, r.hasta])
  const visibles = puntos.filter((p) => p.meses >= r.desde && p.meses <= r.hasta)
  const hasta = Math.min(r.hasta, edadMaxima(indicador))
  const ticks = []
  const paso = hasta - r.desde <= 24 ? 3 : 12
  for (let t = r.desde; t <= hasta; t += paso) ticks.push(t)

  return (
    <ChartContainer config={CONFIG} className="aspect-auto h-72 w-full sm:h-80">
      <LineChart data={datos} margin={{ top: 8, right: 28, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="meses"
          type="number"
          domain={[r.desde, hasta]}
          ticks={ticks}
          tickFormatter={etiquetaEdad}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          domain={["auto", "auto"]}
          width={40}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          cursor={false}
          content={({ active, payload }) => {
            const p = payload?.find((x) => x.dataKey === "valor")?.payload as PuntoCrecimiento | undefined
            if (!active || !p) return null
            return (
              <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-md">
                <p className="font-medium">{fechaCorta(p.fecha)} · {formatoEdad(p.meses)}</p>
                <p>
                  {decimal(p.valor, indicador === "peso" ? 2 : 1)} {INDICADORES[indicador].unidad} ·{" "}
                  {formatoPercentil(p.z)} · z {decimal(p.z, 2)}
                </p>
              </div>
            )
          }}
        />
        {PERCENTILES.map(({ p }) => (
          <Line
            key={p}
            dataKey={`p${p}`}
            type="monotone"
            stroke={`var(--color-p${p})`}
            strokeWidth={p === 50 ? 2 : 1}
            strokeDasharray={p === 50 ? undefined : "4 3"}
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        ))}
        <Line
          data={visibles}
          dataKey="valor"
          type="linear"
          stroke="var(--color-valor)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--color-valor)" }}
          activeDot={{ r: 6 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

export function Crecimiento({
  pacienteId,
  sexo,
  nacimiento,
  mediciones,
  perinatal,
  idProfesional,
  readOnly,
  onCambio,
}: {
  pacienteId?: number
  sexo: SexoOms
  nacimiento: string
  mediciones: MedicionApi[]
  perinatal: Perinatal | null
  idProfesional?: number | null
  readOnly?: boolean
  onCambio?: () => void
}) {
  const gest = perinatal ? { semanas: perinatal.edadGestacionalSem, dias: perinatal.edadGestacionalDias } : null
  const edadHoy = edadMeses(nacimiento, hoyAR(), gest)
  const [indicador, setIndicador] = useState<Indicador>("peso")
  const [rango, setRango] = useState<Rango>(rangoInicial(edadHoy.meses))
  const [nueva, setNueva] = useState(false)

  const indicadores = (Object.keys(INDICADORES) as Indicador[]).filter((i) => edadHoy.meses <= edadMaxima(i) || mediciones.length)
  const rangos = (Object.keys(RANGOS) as Rango[]).filter((r) => RANGOS[r].desde < edadMaxima(indicador))
  const rangoEfectivo = rangos.includes(rango) ? rango : rangos[rangos.length - 1]
  const puntos = puntosPaciente(indicador, sexo, nacimiento, mediciones, perinatal)

  async function anular(id: string) {
    try {
      await api.patch(`/pediatria/mediciones/${id}/anular`)
      toast.success("Medición anulada")
      onCambio?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo anular.")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ped-indicador" className="text-xs text-muted-foreground">Indicador</Label>
          <SelectField
            id="ped-indicador"
            value={indicador}
            onValueChange={(v) => setIndicador(v as Indicador)}
            options={indicadores.map((i) => ({ value: i, label: INDICADORES[i].label }))}
            className="w-56"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ped-rango" className="text-xs text-muted-foreground">Edades</Label>
          <SelectField
            id="ped-rango"
            value={rangoEfectivo}
            onValueChange={(v) => setRango(v as Rango)}
            options={rangos.map((r) => ({ value: r, label: RANGOS[r].label }))}
            className="w-40"
          />
        </div>
        {!readOnly && (
          <Button className="ml-auto" onClick={() => setNueva((v) => !v)} variant={nueva ? "outline" : "default"}>
            <Plus /> Nueva medición
          </Button>
        )}
      </div>

      {nueva && pacienteId && (
        <MedicionForm
          pacienteId={pacienteId}
          sexo={sexo}
          nacimiento={nacimiento}
          perinatal={perinatal}
          onGuardada={() => {
            setNueva(false)
            onCambio?.()
          }}
        />
      )}

      <div className="rounded-xl border border-border p-2 sm:p-4">
        <p className="mb-2 px-2 text-sm font-medium">
          {INDICADORES[indicador].label} ({INDICADORES[indicador].unidad}) · OMS ·{" "}
          {sexo === 1 ? "Varones" : "Mujeres"}
        </p>
        <CurvaCrecimiento indicador={indicador} sexo={sexo} puntos={puntos} rango={rangoEfectivo} />
        <p className="px-2 text-xs text-muted-foreground">
          Líneas: percentiles 3, 15, 50, 85 y 97.
          {edadHoy.corregida && " Edades corregidas por prematurez (hasta los 2 años)."}
        </p>
      </div>

      {mediciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay mediciones cargadas.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Edad</TableHead>
                <TableHead>Peso</TableHead>
                <TableHead>Talla</TableHead>
                <TableHead>PC</TableHead>
                <TableHead>IMC</TableHead>
                {!readOnly && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...mediciones].reverse().map((m) => {
                const { meses } = edadMeses(nacimiento, m.fecha, gest)
                const celda = (ind: Indicador, valor: number | null, dec: number) => {
                  if (valor == null) return "—"
                  const z = meses <= edadMaxima(ind) ? puntajeZ(ind, sexo, meses, valor) : null
                  const alerta = z != null && interpretacion(ind, z).alerta
                  return (
                    <span className="whitespace-nowrap">
                      {decimal(valor, dec)}
                      {z != null && (
                        <span className={cn("ml-1 text-xs text-muted-foreground", alerta && "font-medium text-destructive")}>
                          {formatoPercentil(z)}
                        </span>
                      )}
                    </span>
                  )
                }
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap">{fechaCorta(m.fecha)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatoEdad(meses)}</TableCell>
                    <TableCell>{celda("peso", m.pesoKg, 2)}</TableCell>
                    <TableCell>{celda("talla", valorIndicador("talla", m, meses), 1)}</TableCell>
                    <TableCell>{celda("pc", m.pcCm, 1)}</TableCell>
                    <TableCell>{celda("imc", valorIndicador("imc", m, meses), 1)}</TableCell>
                    {!readOnly && (
                      <TableCell>
                        {m.idProfesional === idProfesional && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Anular medición"
                            onClick={() => anular(m.id)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

/** Alta de una medición, con el percentil de cada valor a medida que se escribe. */
export function MedicionForm({
  pacienteId,
  sexo,
  nacimiento,
  perinatal,
  onGuardada,
}: {
  pacienteId: number
  sexo: SexoOms
  nacimiento: string
  perinatal: Perinatal | null
  onGuardada: () => void
}) {
  const [fecha, setFecha] = useState(hoyAR())
  const [peso, setPeso] = useState("")
  const [talla, setTalla] = useState("")
  const [pc, setPc] = useState("")
  const [guardando, setGuardando] = useState(false)
  const gest = perinatal ? { semanas: perinatal.edadGestacionalSem, dias: perinatal.edadGestacionalDias } : null
  const { meses } = edadMeses(nacimiento, fecha || hoyAR(), gest)
  const [posicion, setPosicion] = useState<"acostado" | "parado">(meses < 24 ? "acostado" : "parado")

  const med = {
    id: "",
    fecha,
    pesoKg: numero(peso),
    tallaCm: numero(talla),
    posicion,
    pcCm: numero(pc),
    notas: null,
  }

  function vivo(ind: Indicador) {
    const v = valorIndicador(ind, med, meses)
    if (v == null || meses > edadMaxima(ind)) return null
    const z = puntajeZ(ind, sexo, meses, v)
    if (z == null) return null
    const i = interpretacion(ind, z)
    return (
      <Badge variant={i.alerta ? "destructive" : "secondary"} className="mt-1">
        {i.alerta && <TriangleAlert />}
        {formatoPercentil(z)} · {i.texto}
      </Badge>
    )
  }

  async function guardar() {
    if (med.pesoKg == null && med.tallaCm == null && med.pcCm == null) {
      toast.warning("Cargá al menos una medida.")
      return
    }
    if (fecha < nacimiento || fecha > hoyAR()) {
      toast.warning("La fecha tiene que estar entre el nacimiento y hoy.")
      return
    }
    setGuardando(true)
    try {
      await api.post(`/pediatria/${pacienteId}/mediciones`, {
        fecha,
        pesoKg: med.pesoKg,
        tallaCm: med.tallaCm,
        posicion: med.tallaCm != null ? posicion : null,
        pcCm: med.pcCm,
      })
      toast.success("Medición guardada")
      onGuardada()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar.")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1.5">
          <Label htmlFor="med-fecha">Fecha</Label>
          <Input id="med-fecha" type="date" value={fecha} max={hoyAR()} min={nacimiento} onChange={(e) => setFecha(e.target.value)} />
          <span className="text-xs text-muted-foreground">Edad: {formatoEdad(meses)}</span>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="med-peso">Peso (kg)</Label>
          <Input id="med-peso" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="9,5" />
          {vivo("peso")}
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="med-talla">Talla (cm)</Label>
          <Input id="med-talla" inputMode="decimal" value={talla} onChange={(e) => setTalla(e.target.value)} placeholder="74" />
          {vivo("talla")}
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="med-posicion">Medido</Label>
          <SelectField
            id="med-posicion"
            value={posicion}
            onValueChange={(v) => setPosicion(v as "acostado" | "parado")}
            options={[
              { value: "acostado", label: "Acostado" },
              { value: "parado", label: "De pie" },
            ]}
          />
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="med-pc">Perímetro cefálico (cm)</Label>
          <Input id="med-pc" inputMode="decimal" value={pc} onChange={(e) => setPc(e.target.value)} placeholder="45" />
          {vivo("pc")}
        </div>
      </div>
      {vivo("imc") && <div className="mt-3 text-sm">IMC {decimal(valorIndicador("imc", med, meses))} {vivo("imc")}</div>}
      <Button className="mt-4" onClick={guardar} disabled={guardando}>
        {guardando && <Loader2 className="animate-spin" />} Guardar medición
      </Button>
    </div>
  )
}
