import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Save } from "lucide-react"
import { api, ApiError } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SelectField } from "@/components/form/SelectField"
import { PREMATURO_SEMANAS } from "@/lib/pediatria/oms"
import { PERINATAL_VACIO, type Perinatal } from "@/lib/pediatria/tipos"
import { numero, textoNumero } from "./comun"

const TIPO_PARTO = [
  { value: "vaginal", label: "Vaginal" },
  { value: "cesarea", label: "Cesárea" },
  { value: "forceps", label: "Fórceps" },
  { value: "otro", label: "Otro" },
]
const ESTUDIO = [
  { value: "normal", label: "Normal" },
  { value: "alterada", label: "Alterada" },
  { value: "pendiente", label: "Pendiente" },
  { value: "no_realizada", label: "No realizada" },
]
const LACTANCIA = [
  { value: "exclusiva", label: "Pecho exclusivo" },
  { value: "mixta", label: "Mixta" },
  { value: "formula", label: "Fórmula" },
  { value: "destete", label: "Destete" },
]

function etiqueta(opciones: { value: string; label: string }[], v: string | null) {
  return opciones.find((o) => o.value === v)?.label ?? "—"
}

/** Peso de nacimiento: clasificación habitual. */
function clasePeso(g: number | null) {
  if (g == null) return null
  if (g < 1000) return "Extremadamente bajo peso"
  if (g < 1500) return "Muy bajo peso"
  if (g < 2500) return "Bajo peso"
  if (g > 4000) return "Macrosómico"
  return null
}

export function AntecedentesPerinatales({
  pacienteId,
  perinatal,
  readOnly,
  onGuardado,
}: {
  pacienteId?: number
  perinatal: Perinatal | null
  readOnly?: boolean
  onGuardado?: (p: Perinatal) => void
}) {
  const [f, setF] = useState<Perinatal>(perinatal ?? PERINATAL_VACIO)
  // Los numéricos se editan como texto (coma decimal) y se convierten al guardar.
  const [txt, setTxt] = useState({
    sem: textoNumero(f.edadGestacionalSem),
    dias: textoNumero(f.edadGestacionalDias),
    peso: textoNumero(f.pesoNacerG),
    talla: textoNumero(f.tallaNacerCm),
    pc: textoNumero(f.pcNacerCm),
    apgar1: textoNumero(f.apgar1),
    apgar5: textoNumero(f.apgar5),
  })
  const [guardando, setGuardando] = useState(false)
  const sem = numero(txt.sem)
  const prematuro = sem != null && sem < PREMATURO_SEMANAS

  if (readOnly) {
    const p = perinatal
    if (!p) return <p className="text-sm text-muted-foreground">Sin antecedentes perinatales cargados.</p>
    const filas: [string, string][] = [
      ["Edad gestacional", p.edadGestacionalSem ? `${p.edadGestacionalSem} sem${p.edadGestacionalDias ? ` ${p.edadGestacionalDias} d` : ""}` : "—"],
      ["Peso al nacer", p.pesoNacerG ? `${p.pesoNacerG} g` : "—"],
      ["Talla al nacer", p.tallaNacerCm ? `${textoNumero(p.tallaNacerCm)} cm` : "—"],
      ["PC al nacer", p.pcNacerCm ? `${textoNumero(p.pcNacerCm)} cm` : "—"],
      ["Apgar", p.apgar1 != null || p.apgar5 != null ? `${p.apgar1 ?? "—"} / ${p.apgar5 ?? "—"}` : "—"],
      ["Parto", etiqueta(TIPO_PARTO, p.tipoParto)],
      ["Grupo y factor", p.grupoSanguineo || "—"],
      ["Pesquisa neonatal", etiqueta(ESTUDIO, p.pesquisaNeonatal)],
      ["Otoemisiones", etiqueta(ESTUDIO, p.otoemisiones)],
      ["Alimentación", etiqueta(LACTANCIA, p.lactancia)],
    ]
    return (
      <div>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {filas.map(([l, v]) => (
            <div key={l}>
              <dt className="text-xs font-medium text-muted-foreground">{l}</dt>
              <dd className="text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        {p.notas && <p className="mt-4 whitespace-pre-line text-sm">{p.notas}</p>}
      </div>
    )
  }

  async function guardar() {
    if (!pacienteId) return
    const body = {
      ...f,
      edadGestacionalSem: numero(txt.sem),
      edadGestacionalDias: numero(txt.dias),
      pesoNacerG: numero(txt.peso),
      tallaNacerCm: numero(txt.talla),
      pcNacerCm: numero(txt.pc),
      apgar1: numero(txt.apgar1),
      apgar5: numero(txt.apgar5),
    }
    setGuardando(true)
    try {
      const r = await api.put<{ perinatal: Perinatal }>(`/pediatria/${pacienteId}/perinatal`, body)
      toast.success("Antecedentes guardados")
      setF(r.perinatal)
      onGuardado?.(r.perinatal)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo guardar.")
    } finally {
      setGuardando(false)
    }
  }

  const campo = (k: keyof typeof txt, label: string, placeholder?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`peri-${k}`}>{label}</Label>
      <Input
        id={`peri-${k}`}
        inputMode="decimal"
        value={txt[k]}
        placeholder={placeholder}
        onChange={(e) => setTxt((t) => ({ ...t, [k]: e.target.value }))}
      />
    </div>
  )
  const opcion = (k: "tipoParto" | "pesquisaNeonatal" | "otoemisiones" | "lactancia", label: string, opciones: typeof ESTUDIO) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`peri-${k}`}>{label}</Label>
      <SelectField
        id={`peri-${k}`}
        value={f[k] ?? ""}
        onValueChange={(v) => setF((x) => ({ ...x, [k]: v }))}
        options={opciones}
      />
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {campo("sem", "Edad gestacional (semanas)", "39")}
        {campo("dias", "+ días", "0")}
        {campo("peso", "Peso al nacer (g)", "3200")}
        {campo("talla", "Talla al nacer (cm)", "49,5")}
        {campo("pc", "PC al nacer (cm)", "34")}
        {campo("apgar1", "Apgar 1'", "9")}
        {campo("apgar5", "Apgar 5'", "10")}
        <div className="grid gap-1.5">
          <Label htmlFor="peri-grupo">Grupo y factor</Label>
          <Input
            id="peri-grupo"
            value={f.grupoSanguineo ?? ""}
            maxLength={10}
            placeholder="0+"
            onChange={(e) => setF((x) => ({ ...x, grupoSanguineo: e.target.value }))}
          />
        </div>
        {opcion("tipoParto", "Parto", TIPO_PARTO)}
        {opcion("pesquisaNeonatal", "Pesquisa neonatal", ESTUDIO)}
        {opcion("otoemisiones", "Otoemisiones", ESTUDIO)}
        {opcion("lactancia", "Alimentación", LACTANCIA)}
      </div>
      {(prematuro || clasePeso(numero(txt.peso))) && (
        <p className="text-sm text-muted-foreground">
          {[prematuro && `Prematuro (${sem} sem): las curvas usan edad corregida hasta los 2 años.`, clasePeso(numero(txt.peso))]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="peri-notas">Notas (internación neonatal, patologías, etc.)</Label>
        <Textarea
          id="peri-notas"
          rows={3}
          maxLength={2000}
          value={f.notas ?? ""}
          onChange={(e) => setF((x) => ({ ...x, notas: e.target.value }))}
        />
      </div>
      <Button onClick={guardar} disabled={guardando}>
        {guardando ? <Loader2 className="animate-spin" /> : <Save />} Guardar antecedentes
      </Button>
    </div>
  )
}
