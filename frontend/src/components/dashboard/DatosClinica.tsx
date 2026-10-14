import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Building2, Loader2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Field } from "@/components/form/Field"
import { api, ApiError } from "@/lib/api"

// Fase N: dirección y descripción de la clínica. Las ve el paciente al elegir
// la clínica antes de sacar un turno.
type Clinica = {
  nombre: string
  slug: string | null
  direccion: string | null
  descripcion: string | null
  // Fase N2: si aparece en la reserva pública de turnos.
  turnos_online: boolean
}

const MAX_DIRECCION = 200
const MAX_DESCRIPCION = 1000

export function DatosClinica() {
  const [clinica, setClinica] = useState<Clinica | null>(null)
  const [direccion, setDireccion] = useState("")
  const [descripcion, setDescripcion] = useState("")
  const [guardando, setGuardando] = useState(false)
  const [cambiandoOnline, setCambiandoOnline] = useState(false)

  useEffect(() => {
    api
      .get<{ clinica: Clinica }>("/admin/clinica")
      .then((d) => {
        setClinica(d.clinica)
        setDireccion(d.clinica.direccion ?? "")
        setDescripcion(d.clinica.descripcion ?? "")
      })
      .catch(() => toast.error("No se pudieron cargar los datos de la clínica."))
  }, [])

  const sinCambios =
    !!clinica &&
    direccion.trim() === (clinica.direccion ?? "") &&
    descripcion.trim() === (clinica.descripcion ?? "")

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    try {
      const d = await api.put<{ clinica: Clinica }>("/admin/clinica", {
        direccion: direccion.trim(),
        descripcion: descripcion.trim(),
      })
      setClinica(d.clinica)
      setDireccion(d.clinica.direccion ?? "")
      setDescripcion(d.clinica.descripcion ?? "")
      toast.success("Datos de la clínica actualizados.")
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudieron guardar los datos."
      )
    } finally {
      setGuardando(false)
    }
  }

  // Se guarda al instante: es una decisión, no un dato del formulario.
  async function cambiarTurnosOnline(activo: boolean) {
    setCambiandoOnline(true)
    try {
      const d = await api.put<{ clinica: Clinica }>("/admin/clinica/turnos-online", {
        activo,
      })
      setClinica((c) => (c ? { ...c, turnos_online: d.clinica.turnos_online } : c))
      toast.success(
        activo
          ? "Tu clínica ya aparece para sacar turnos online."
          : "Tu clínica dejó de aparecer para sacar turnos online."
      )
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo cambiar la opción."
      )
    } finally {
      setCambiandoOnline(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Building2 className="size-5 text-primary" /> Datos de la clínica
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Los pacientes ven la dirección y la descripción al elegir la clínica para
          sacar un turno.
        </p>

        {!clinica ? (
          <div className="mt-5 grid gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <>
          <div className="mt-5 flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="min-w-0">
              <Label htmlFor="clinica-turnos-online" className="text-sm font-medium">
                Recibir turnos online
              </Label>
              <p id="clinica-turnos-online-hint" className="mt-1 text-sm text-muted-foreground">
                {clinica.turnos_online
                  ? "Los pacientes pueden elegir tu clínica y sacar turno desde la web."
                  : "Tu clínica no aparece en la reserva online. Tu equipo puede seguir cargando turnos desde el panel."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              {cambiandoOnline && (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              )}
              <Switch
                id="clinica-turnos-online"
                aria-describedby="clinica-turnos-online-hint"
                checked={clinica.turnos_online}
                disabled={cambiandoOnline}
                onCheckedChange={cambiarTurnosOnline}
              />
            </div>
          </div>

          <form onSubmit={guardar} className="mt-5 grid gap-4">
            <Field label="Nombre" htmlFor="clinica-nombre">
              <Input
                id="clinica-nombre"
                value={clinica.nombre}
                readOnly
                aria-readonly
                className="h-10 bg-muted/40"
              />
            </Field>
            <Field
              label="Dirección"
              htmlFor="clinica-direccion"
              hint="Calle, número y localidad. Se abre en Google Maps desde la reserva."
            >
              <Input
                id="clinica-direccion"
                autoComplete="street-address"
                maxLength={MAX_DIRECCION}
                value={direccion}
                onChange={(e) => setDireccion(e.target.value)}
                placeholder="Ej.: Av. San Martín 1234, Mendoza"
                className="h-10"
              />
            </Field>
            <Field
              label="Descripción (opcional)"
              htmlFor="clinica-descripcion"
              hint={`Especialidades, cómo llegar, estacionamiento… ${descripcion.length}/${MAX_DESCRIPCION}`}
            >
              <Textarea
                id="clinica-descripcion"
                rows={4}
                maxLength={MAX_DESCRIPCION}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={guardando || sinCambios}>
                {guardando ? <Loader2 className="animate-spin" /> : <Save />}
                Guardar
              </Button>
            </div>
          </form>
          </>
        )}
      </CardContent>
    </Card>
  )
}
