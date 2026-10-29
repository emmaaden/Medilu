import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Search } from "lucide-react"
import { cn } from "cn"
import { api } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { RolVista, VistaSesion } from "@/hooks/useUser"
import { ROL_VISTA_LABEL, entrarEnVista, salirDeVista } from "@/lib/vista"
import { SkeletonLista } from "@/components/site/Skeletons"

// Fase Z: "Ver como" del equipo de la plataforma. Elige rol (y especialidad, o la
// ficha de paciente a mirar) y recarga como lo vería esa persona.

const REAL = "__real"
const INTERNO = "__interno"

type PacienteVista = { pacienteId: number; nombre: string; dni: string | null }

export function VerComoDialog({
  open,
  onOpenChange,
  vista,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  vista: VistaSesion | null
}) {
  const [rol, setRol] = useState<RolVista>(vista?.rol ?? "admin")
  const [especialidad, setEspecialidad] = useState(vista?.especialidad ?? REAL)
  const [obraSocial, setObraSocial] = useState(INTERNO)
  const [paciente, setPaciente] = useState<PacienteVista | null>(null)
  const [q, setQ] = useState("")
  const [pacientes, setPacientes] = useState<PacienteVista[]>([])
  const [buscando, setBuscando] = useState(false)
  const [especialidades, setEspecialidades] = useState<string[]>([])
  const [obras, setObras] = useState<{ id: number; nombre: string }[]>([])
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!open || especialidades.length) return
    api
      .get<{ especialidades: { nombre: string }[] }>("/especialidades/get-especialidades")
      .then((d) =>
        setEspecialidades(
          (d.especialidades || []).map((e) => e.nombre).sort((a, b) => a.localeCompare(b, "es"))
        )
      )
      .catch(() => {})
  }, [open, especialidades.length])

  useEffect(() => {
    if (!open || rol !== "auditor" || obras.length) return
    api
      .get<{ obrasSociales: { id: number; nombre: string }[] }>("/catalogos/obras-sociales")
      .then((d) => setObras(d.obrasSociales || []))
      .catch(() => {})
  }, [open, rol, obras.length])

  // Búsqueda de fichas (con una pequeña espera mientras se escribe).
  useEffect(() => {
    if (!open || rol !== "paciente") return
    let vivo = true
    const t = setTimeout(() => {
      setBuscando(true)
      api
        .get<{ pacientes: PacienteVista[] }>(
          `/plataforma/vista/pacientes?q=${encodeURIComponent(q.trim())}`
        )
        .then((d) => vivo && setPacientes(d.pacientes || []))
        .catch(() => vivo && setPacientes([]))
        .finally(() => vivo && setBuscando(false))
    }, 250)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [open, rol, q])

  const conEspecialidad = rol === "admin" || rol === "profesional"

  async function aplicar() {
    if (rol === "paciente" && !paciente) {
      toast.error("Elegí qué paciente querés ver.")
      return
    }
    setEnviando(true)
    try {
      await entrarEnVista({
        rol,
        especialidad: conEspecialidad && especialidad !== REAL ? especialidad : null,
        pacienteId: rol === "paciente" ? paciente!.pacienteId : null,
        alcanceIdObraSocial: rol === "auditor" && obraSocial !== INTERNO ? Number(obraSocial) : null,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar la vista.")
      setEnviando(false)
    }
  }

  async function volver() {
    setEnviando(true)
    try {
      await salirDeVista()
    } catch {
      toast.error("No se pudo volver a tu cuenta.")
      setEnviando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ver como</DialogTitle>
          <DialogDescription>
            Cambia cómo ves el sistema solo en tu sesión. Tus datos reales no cambian; en los
            roles del equipo las acciones que hagas sí son reales.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="vista-rol">Rol</Label>
            <Select value={rol} onValueChange={(v) => setRol(v as RolVista)}>
              <SelectTrigger id="vista-rol" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROL_VISTA_LABEL) as RolVista[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROL_VISTA_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {conEspecialidad && (
            <div className="grid gap-2">
              <Label htmlFor="vista-esp">Especialidad</Label>
              <Select value={especialidad} onValueChange={setEspecialidad}>
                <SelectTrigger id="vista-esp" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={REAL}>La mía (real)</SelectItem>
                  {especialidades.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {rol === "auditor" && (
            <div className="grid gap-2">
              <Label htmlFor="vista-os">Alcance</Label>
              <Select value={obraSocial} onValueChange={setObraSocial}>
                <SelectTrigger id="vista-os" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={INTERNO}>Interno (todas las obras sociales)</SelectItem>
                  {obras.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {rol === "paciente" && (
            <div className="grid gap-2">
              <Label htmlFor="vista-pac">Paciente de tu clínica</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="vista-pac"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nombre, apellido o DNI"
                  className="pl-8"
                />
              </div>
              <div className="max-h-52 overflow-y-auto rounded-md border border-border">
                {buscando && pacientes.length === 0 ? (
                  <SkeletonLista filas={3} accion={false} bordes={false} />
                ) : pacientes.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">Sin resultados.</p>
                ) : (
                  pacientes.map((p) => (
                    <button
                      key={p.pacienteId}
                      type="button"
                      onClick={() => setPaciente(p)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent",
                        paciente?.pacienteId === p.pacienteId && "bg-accent font-medium"
                      )}
                    >
                      <span className="truncate">{p.nombre || "Sin nombre"}</span>
                      {p.dni && <span className="shrink-0 text-xs text-muted-foreground">{p.dni}</span>}
                    </button>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Ves su portal en solo lectura: no se puede reservar ni editar nada.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {vista && (
            <Button variant="outline" onClick={volver} disabled={enviando}>
              Volver a mi cuenta
            </Button>
          )}
          <Button onClick={aplicar} disabled={enviando}>
            {enviando && <Loader2 className="animate-spin" />} Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
