import { useCallback, useEffect, useState } from "react"
import { Baby, Download, TriangleAlert } from "lucide-react"
import { api } from "@/lib/api"
import { hoyAR } from "@/lib/fecha"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SelectField } from "@/components/form/SelectField"
import {
  INDICADORES,
  edadMaxima,
  edadMeses,
  formatoEdad,
  formatoPercentil,
  interpretacion,
  sexoOms,
  type Indicador,
  type SexoOms,
} from "@/lib/pediatria/oms"
import { carnet, estadoHito } from "@/lib/pediatria/estado"
import { descargarPdfPediatrico } from "@/lib/pediatria/curvaPdf"
import type { DatosPediatricos } from "@/lib/pediatria/tipos"
import { Crecimiento } from "./Crecimiento"
import { puntosPaciente } from "./comun"
import { CarnetVacunas } from "./CarnetVacunas"
import { HitosDesarrollo } from "./HitosDesarrollo"
import { AntecedentesPerinatales } from "./AntecedentesPerinatales"
import { CalculadoraDosis } from "./CalculadoraDosis"
import { SkeletonIndicadores } from "@/components/site/Skeletons"

/**
 * Fase Z: panel pediátrico de un paciente. En el registro clínico carga y edita
 * (`pacienteId`); en el portal del paciente recibe `datos` y es solo lectura.
 */
export function PanelPediatrico({
  pacienteId,
  nombre,
  nacimiento,
  sexo: sexoTexto,
  datos: datosIniciales,
  readOnly,
  onCopiarTratamiento,
}: {
  pacienteId?: number
  nombre: string
  nacimiento: string
  sexo: string
  datos?: DatosPediatricos
  readOnly?: boolean
  onCopiarTratamiento?: (texto: string) => void
}) {
  const [datos, setDatos] = useState<DatosPediatricos | null>(datosIniciales ?? null)
  const [error, setError] = useState(false)
  const sexoFicha = sexoOms(sexoTexto)
  const [sexoElegido, setSexoElegido] = useState<SexoOms | null>(null)
  const sexo = sexoFicha ?? sexoElegido

  const cargar = useCallback(() => {
    if (!pacienteId || datosIniciales) return
    api
      .get<DatosPediatricos>(`/pediatria/${pacienteId}`)
      .then((d) => {
        setDatos(d)
        setError(false)
      })
      .catch(() => setError(true))
  }, [pacienteId, datosIniciales])

  useEffect(cargar, [cargar])

  if (!nacimiento) {
    return (
      <p className="text-sm text-muted-foreground">
        Cargá la fecha de nacimiento del paciente para usar el panel pediátrico.
      </p>
    )
  }
  if (error) return <p className="text-sm text-destructive">No se pudieron cargar los datos pediátricos.</p>
  if (!datos) {
    return <SkeletonIndicadores cantidad={4} />
  }

  const gest = datos.perinatal
    ? { semanas: datos.perinatal.edadGestacionalSem, dias: datos.perinatal.edadGestacionalDias }
    : null
  const hoy = hoyAR()
  const edad = edadMeses(nacimiento, hoy, gest)
  const edadCrono = edadMeses(nacimiento, hoy).meses
  const ultimoPeso = [...datos.mediciones].reverse().find((m) => m.pesoKg != null)?.pesoKg ?? null

  // Resumen: último percentil de cada indicador + alertas de vacunas e hitos.
  const puntos = Object.fromEntries(
    (Object.keys(INDICADORES) as Indicador[]).map((i) => [
      i,
      sexo ? puntosPaciente(i, sexo, nacimiento, datos.mediciones, datos.perinatal) : [],
    ])
  ) as Record<Indicador, ReturnType<typeof puntosPaciente>>
  const atrasadas = carnet(datos.catalogo, datos.vacunas, edadCrono).filter((f) => f.estado === "atrasada").length
  const evaluados = new Map(datos.hitos.map((h) => [h.hito, h]))
  const hitosAlerta = datos.catalogo.hitos.filter(
    (h) => estadoHito(h.edad, evaluados.get(h.codigo), edad.meses) === "alerta"
  ).length

  function pdf() {
    if (!sexo || !datos) return
    descargarPdfPediatrico({
      nombre,
      nacimiento,
      sexo,
      edadMeses: edad.meses,
      edadCorregida: edad.corregida,
      datos,
      puntos,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">
          <Baby /> {formatoEdad(edadCrono)}
          {edad.corregida && ` · corregida ${formatoEdad(edad.meses)}`}
        </Badge>
        {(Object.keys(INDICADORES) as Indicador[]).map((i) => {
          const ult = puntos[i][puntos[i].length - 1]
          if (!ult || edad.meses > edadMaxima(i)) return null
          const alerta = interpretacion(i, ult.z).alerta
          return (
            <Badge key={i} variant={alerta ? "destructive" : "outline"}>
              {alerta && <TriangleAlert />}
              {INDICADORES[i].corto} {formatoPercentil(ult.z)}
            </Badge>
          )
        })}
        {atrasadas > 0 && <Badge variant="destructive">{atrasadas} vacuna{atrasadas > 1 ? "s" : ""} atrasada{atrasadas > 1 ? "s" : ""}</Badge>}
        {hitosAlerta > 0 && <Badge variant="destructive">Alerta de desarrollo</Badge>}
        {sexo && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={pdf}>
            <Download /> PDF para la familia
          </Button>
        )}
      </div>

      {!sexo && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border p-3">
          <p className="text-sm text-muted-foreground">
            La ficha no indica sexo masculino o femenino. Elegí qué referencia de la OMS usar para las curvas:
          </p>
          <div className="grid gap-1.5">
            <Label htmlFor="ped-sexo" className="sr-only">Referencia</Label>
            <SelectField
              id="ped-sexo"
              value={sexoElegido ? String(sexoElegido) : ""}
              onValueChange={(v) => setSexoElegido(Number(v) as SexoOms)}
              options={[
                { value: "1", label: "Varones" },
                { value: "2", label: "Mujeres" },
              ]}
              className="w-40"
            />
          </div>
        </div>
      )}

      <Tabs defaultValue="crecimiento">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="crecimiento">Crecimiento</TabsTrigger>
            <TabsTrigger value="vacunas">Vacunas</TabsTrigger>
            <TabsTrigger value="desarrollo">Desarrollo</TabsTrigger>
            <TabsTrigger value="perinatal">Perinatal</TabsTrigger>
            {!readOnly && <TabsTrigger value="dosis">Dosis</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="crecimiento" className="pt-2">
          {sexo ? (
            <Crecimiento
              pacienteId={pacienteId}
              sexo={sexo}
              nacimiento={nacimiento}
              mediciones={datos.mediciones}
              perinatal={datos.perinatal}
              idProfesional={datos.idProfesional}
              readOnly={readOnly}
              onCambio={cargar}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Elegí la referencia para ver las curvas.</p>
          )}
        </TabsContent>
        <TabsContent value="vacunas" className="pt-2">
          <CarnetVacunas
            pacienteId={pacienteId}
            catalogo={datos.catalogo}
            vacunas={datos.vacunas}
            edadMeses={edadCrono}
            nacimiento={nacimiento}
            idProfesional={datos.idProfesional}
            readOnly={readOnly}
            onCambio={cargar}
          />
        </TabsContent>
        <TabsContent value="desarrollo" className="pt-2">
          <HitosDesarrollo
            pacienteId={pacienteId}
            catalogo={datos.catalogo}
            hitos={datos.hitos}
            edadMeses={edad.meses}
            readOnly={readOnly}
            onCambio={cargar}
          />
        </TabsContent>
        <TabsContent value="perinatal" className="pt-2">
          <AntecedentesPerinatales
            key={datos.perinatal?.actualizadoEn ?? "nuevo"}
            pacienteId={pacienteId}
            perinatal={datos.perinatal}
            readOnly={readOnly}
            onGuardado={cargar}
          />
        </TabsContent>
        {!readOnly && (
          <TabsContent value="dosis" className="pt-2">
            <CalculadoraDosis key={ultimoPeso ?? 0} pesoKg={ultimoPeso} onCopiar={onCopiarTratamiento} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

/** Tarjeta con título para el registro clínico y el portal. */
export function TarjetaPediatrica(props: Parameters<typeof PanelPediatrico>[0]) {
  return (
    <Card className="mt-6">
      <CardContent className="p-4 sm:p-6">
        <h3 className="mb-4 flex items-center gap-2 font-semibold">
          <Baby className="size-5 text-primary" /> Pediatría
        </h3>
        <PanelPediatrico {...props} />
      </CardContent>
    </Card>
  )
}
