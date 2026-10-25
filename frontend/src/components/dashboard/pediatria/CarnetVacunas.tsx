import { useState } from "react"
import { toast } from "sonner"
import { Check, Loader2, Plus, Syringe, Trash2 } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { hoyAR } from "@/lib/fecha"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { SelectField } from "@/components/form/SelectField"
import {
  ESTADO_DOSIS_LABEL,
  carnet,
  edadRecomendada,
  fueraDeCarnet,
  type EstadoDosis,
} from "@/lib/pediatria/estado"
import { fechaCorta, nombreVacuna, type Catalogo, type VacunaAplicada } from "@/lib/pediatria/tipos"

const VARIANTE: Record<EstadoDosis, "default" | "secondary" | "destructive" | "outline"> = {
  aplicada: "default",
  corresponde: "secondary",
  atrasada: "destructive",
  fuera_de_edad: "outline",
  proxima: "outline",
  zona: "outline",
}

export function CarnetVacunas({
  pacienteId,
  catalogo,
  vacunas,
  edadMeses,
  nacimiento,
  idProfesional,
  readOnly,
  onCambio,
}: {
  pacienteId?: number
  catalogo: Catalogo
  vacunas: VacunaAplicada[]
  /** Edad cronológica (las vacunas no se corrigen por prematurez). */
  edadMeses: number
  nacimiento: string
  idProfesional?: number | null
  readOnly?: boolean
  onCambio?: () => void
}) {
  const [alta, setAlta] = useState<{ vacuna: string; dosis: string } | null>(null)
  const filas = carnet(catalogo, vacunas, edadMeses)
  const extra = fueraDeCarnet(catalogo, vacunas)
  const atrasadas = filas.filter((f) => f.estado === "atrasada").length
  const corresponden = filas.filter((f) => f.estado === "corresponde").length

  async function anular(id: string) {
    try {
      await api.patch(`/pediatria/vacunas/${id}/anular`)
      toast.success("Vacuna anulada")
      onCambio?.()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo anular.")
    }
  }

  // Calendario agrupado por vacuna, solo hasta lo que viene en los próximos 2 años.
  const porVacuna = catalogo.vacunas
    .filter((v) => !v.fueraDeCalendario)
    .map((v) => ({ v, dosis: filas.filter((f) => f.vacuna.codigo === v.codigo) }))
    .filter(({ dosis }) => dosis.some((d) => d.estado !== "proxima" || d.dosis.edad <= edadMeses + 24))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {atrasadas > 0 && <Badge variant="destructive">{atrasadas} atrasada{atrasadas > 1 ? "s" : ""}</Badge>}
        {corresponden > 0 && <Badge variant="secondary">{corresponden} para aplicar ahora</Badge>}
        {atrasadas === 0 && corresponden === 0 && <Badge variant="outline"><Check /> Al día para la edad</Badge>}
        {!readOnly && (
          <Button className="ml-auto" onClick={() => setAlta({ vacuna: "", dosis: "" })}>
            <Plus /> Registrar vacuna
          </Button>
        )}
      </div>

      <div className="divide-y divide-border rounded-xl border border-border">
        {porVacuna.map(({ v, dosis }) => (
          <div key={v.codigo} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start">
            <p className="flex items-center gap-2 text-sm font-medium sm:w-64 sm:shrink-0">
              <Syringe className="size-4 shrink-0 text-muted-foreground" />
              {v.nombre}
            </p>
            <div className="flex flex-wrap gap-2">
              {dosis.map((d) => (
                <button
                  key={d.dosis.dosis}
                  type="button"
                  disabled={readOnly || d.estado === "aplicada"}
                  onClick={() => setAlta({ vacuna: v.codigo, dosis: d.dosis.dosis })}
                  className="text-left disabled:cursor-default"
                  title={d.aplicada?.lote ? `Lote ${d.aplicada.lote}` : undefined}
                >
                  <Badge variant={VARIANTE[d.estado]} className="h-auto flex-col items-start gap-0 py-1">
                    <span>
                      {d.dosis.dosis} · {edadRecomendada(d.dosis.edad)}
                    </span>
                    <span className="text-[0.7rem] font-normal opacity-80">
                      {d.aplicada ? fechaCorta(d.aplicada.fecha) : ESTADO_DOSIS_LABEL[d.estado]}
                    </span>
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {vacunas.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Registro de aplicaciones</p>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {[...vacunas].reverse().map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="w-24 shrink-0 text-muted-foreground">{fechaCorta(a.fecha)}</span>
                <span className="min-w-0 flex-1">
                  {nombreVacuna(a, catalogo)}
                  {a.dosis && <span className="text-muted-foreground"> · {a.dosis}</span>}
                  {extra.includes(a) && <span className="text-muted-foreground"> (fuera de calendario)</span>}
                  {(a.lote || a.lugar) && (
                    <span className="block text-xs text-muted-foreground">
                      {[a.lote && `Lote ${a.lote}`, a.lugar].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                {!readOnly && a.idProfesional === idProfesional && (
                  <Button variant="ghost" size="icon" aria-label="Anular vacuna" onClick={() => anular(a.id)}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Calendario Nacional de Vacunación (Argentina). Las de zona de riesgo se indican según residencia o viaje.
      </p>

      {alta && pacienteId && (
        <AltaVacuna
          pacienteId={pacienteId}
          catalogo={catalogo}
          inicial={alta}
          nacimiento={nacimiento}
          onClose={() => setAlta(null)}
          onGuardada={() => {
            setAlta(null)
            onCambio?.()
          }}
        />
      )}
    </div>
  )
}

function AltaVacuna({
  pacienteId,
  catalogo,
  inicial,
  nacimiento,
  onClose,
  onGuardada,
}: {
  pacienteId: number
  catalogo: Catalogo
  inicial: { vacuna: string; dosis: string }
  nacimiento: string
  onClose: () => void
  onGuardada: () => void
}) {
  const [vacuna, setVacuna] = useState(inicial.vacuna)
  const [dosis, setDosis] = useState(inicial.dosis)
  const [otra, setOtra] = useState("")
  const [fecha, setFecha] = useState(hoyAR())
  const [lote, setLote] = useState("")
  const [lugar, setLugar] = useState("")
  const [guardando, setGuardando] = useState(false)
  const cat = catalogo.vacunas.find((v) => v.codigo === vacuna)

  async function guardar() {
    if (!vacuna || (vacuna === "otra" && !otra.trim())) {
      toast.warning("Elegí la vacuna.")
      return
    }
    if (fecha < nacimiento || fecha > hoyAR()) {
      toast.warning("La fecha tiene que estar entre el nacimiento y hoy.")
      return
    }
    setGuardando(true)
    try {
      await api.post(`/pediatria/${pacienteId}/vacunas`, {
        vacuna,
        vacunaOtra: vacuna === "otra" ? otra.trim() : null,
        dosis: dosis || null,
        fecha,
        lote: lote.trim() || null,
        lugar: lugar.trim() || null,
      })
      toast.success("Vacuna registrada")
      onGuardada()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar.")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar vacuna</DialogTitle>
          <DialogDescription>
            Podés pasar también las del carnet previo: indicá dónde se aplicaron.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="vac-vacuna">Vacuna</Label>
            <SelectField
              id="vac-vacuna"
              value={vacuna}
              onValueChange={(v) => {
                setVacuna(v)
                setDosis("")
              }}
              options={[
                ...catalogo.vacunas.map((v) => ({ value: v.codigo, label: v.nombre })),
                { value: "otra", label: "Otra…" },
              ]}
            />
          </div>
          {vacuna === "otra" && (
            <div className="grid gap-1.5">
              <Label htmlFor="vac-otra">Nombre</Label>
              <Input id="vac-otra" value={otra} onChange={(e) => setOtra(e.target.value)} maxLength={120} />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="vac-dosis">Dosis</Label>
              {cat && cat.dosis.length > 0 ? (
                <SelectField
                  id="vac-dosis"
                  value={dosis}
                  onValueChange={setDosis}
                  options={[...cat.dosis.map((d) => ({ value: d.dosis, label: d.dosis })), ...(cat.anual ? [{ value: "Anual", label: "Anual" }] : [])]}
                />
              ) : (
                <Input id="vac-dosis" value={dosis} onChange={(e) => setDosis(e.target.value)} maxLength={40} placeholder="1ra, refuerzo…" />
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vac-fecha">Fecha</Label>
              <Input id="vac-fecha" type="date" value={fecha} min={nacimiento} max={hoyAR()} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="vac-lote">Lote (opcional)</Label>
              <Input id="vac-lote" value={lote} onChange={(e) => setLote(e.target.value)} maxLength={60} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vac-lugar">Dónde (opcional)</Label>
              <Input id="vac-lugar" value={lugar} onChange={(e) => setLugar(e.target.value)} maxLength={120} placeholder="Vacunatorio…" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
