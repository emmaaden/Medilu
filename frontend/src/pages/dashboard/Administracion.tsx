import { useCallback, useEffect, useState } from "react"
import { Navigate } from "react-router-dom"
import { toast } from "sonner"
import {
  Users,
  KeyRound,
  Plus,
  Trash2,
  Loader2,
  ShieldCheck,
  Stethoscope,
  ClipboardList,
  MoreVertical,
  Copy,
  Check,
  ClipboardCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Container } from "@/components/site/Section"
import { SelectField } from "@/components/form/SelectField"
import { CatalogosClinica } from "@/components/dashboard/CatalogosClinica"
import { DatosClinica } from "@/components/dashboard/DatosClinica"
import { useObrasSociales } from "@/lib/catalogos"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { tieneFeature } from "@/lib/planes"
import { FeatureGate } from "@/components/dashboard/PlanGate"

type Rol = "admin" | "profesional" | "recepcion" | "auditor"

type Miembro = {
  id: number
  personaId: number
  nombre: string | null
  apellido: string | null
  email: string | null
  dni: string | null
  matricula: string | null
  rol: Rol
  alcanceObraSocial: string | null
  alcanceIdObraSocial: number | null
  activo: boolean
  esYo: boolean
}

type Codigo = {
  id: number
  codigo: string
  usado: boolean
  /** Sin usar y con más de 30 días: ya no sirve para registrarse. */
  vencido?: boolean
  rol?: "profesional" | "recepcion" | "auditor"
  alcance_obra_social?: string | null
  creado_en?: string
}

type RolCodigo = NonNullable<Codigo["rol"]>

const ROL_CODIGO_LABEL: Record<RolCodigo, string> = {
  profesional: "Profesional",
  recepcion: "Recepción",
  auditor: "Auditoría",
}

// Fase J: el alcance del auditor se define para un miembro (al asignarle el rol o
// después) o para un código de auditor (lo hereda quien se registre con él).
type AlcanceDestino = { tipo: "miembro"; miembro: Miembro } | { tipo: "codigo" }

// Texto del alcance para listar. null = auditor interno (toda la clínica).
const alcanceLabel = (os: string | null | undefined) =>
  os ? `solo ${os}` : "interna (toda la clínica)"

const ROL_META: Record<Rol, { label: string; icon: typeof ShieldCheck }> = {
  admin: { label: "Administrador/a", icon: ShieldCheck },
  profesional: { label: "Profesional", icon: Stethoscope },
  recepcion: { label: "Recepción", icon: ClipboardList },
  auditor: { label: "Auditoría", icon: ClipboardCheck },
}

export default function Administracion() {
  const { user, loading } = useAuth()

  const [miembros, setMiembros] = useState<Miembro[]>([])
  const [codigos, setCodigos] = useState<Codigo[]>([])
  const [cargando, setCargando] = useState(true)
  const [accion, setAccion] = useState<number | null>(null) // membresiaId en curso
  const [generating, setGenerating] = useState(false)
  const [borrando, setBorrando] = useState<number | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [alcanceDestino, setAlcanceDestino] = useState<AlcanceDestino | null>(null)
  const [alcanceModo, setAlcanceModo] = useState<"interno" | "obra_social">("interno")
  // Fase K: id de la obra social del catálogo ("" = sin elegir).
  const [alcanceOs, setAlcanceOs] = useState("")
  const { datos: obrasSociales } = useObrasSociales()

  // Fase L: solo se ofrecen los roles que el plan de la clínica incluye (el miembro que
  // ya tiene un rol lo conserva aunque el plan cambie).
  const conRecepcion = tieneFeature(user?.plan, "recepcion")
  const conAuditoria = tieneFeature(user?.plan, "auditoria")
  const rolesDisponibles = (Object.keys(ROL_META) as Rol[]).filter(
    (r) => (r !== "recepcion" || conRecepcion) && (r !== "auditor" || conAuditoria)
  )

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [m, c] = await Promise.all([
        api.get<{ miembros: Miembro[] }>("/admin/miembros"),
        api.get<{ codigos: Codigo[] }>("/clinica/codigos"),
      ])
      setMiembros(m.miembros || [])
      setCodigos(c.codigos || [])
    } catch {
      toast.error("No se pudo cargar la administración.")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    if (user?.esAdmin) cargar()
  }, [user?.esAdmin, cargar])

  // Solo el admin de la clínica activa. (El backend además lo exige en cada endpoint.)
  if (!loading && user && !user.esAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  async function cambiar(
    m: Miembro,
    patch: { activo?: boolean; rol?: Rol; alcanceIdObraSocial?: number | null }
  ) {
    setAccion(m.id)
    try {
      await api.patch(`/admin/miembros/${m.id}`, patch)
      toast.success("Miembro actualizado.")
      await cargar()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "No se pudo actualizar el miembro."
      toast.error(msg)
    } finally {
      setAccion(null)
    }
  }

  async function generarCodigo(rol: RolCodigo, alcanceIdObraSocial: number | null = null) {
    setGenerating(true)
    try {
      const d = await api.post<{ codigo?: string }>("/clinica/generar-codigo", {
        rol,
        ...(rol === "auditor" ? { alcanceIdObraSocial } : {}),
      })
      toast.success(`Código generado: ${d.codigo}`)
      await cargar()
    } catch (err) {
      // Fase L: el backend explica si se llegó al tope del plan.
      toast.error(err instanceof ApiError ? err.message : "No se pudo generar el código.")
    } finally {
      setGenerating(false)
    }
  }

  function abrirAlcance(destino: AlcanceDestino) {
    const m = destino.tipo === "miembro" ? destino.miembro : null
    setAlcanceModo(m && (m.alcanceIdObraSocial || m.alcanceObraSocial) ? "obra_social" : "interno")
    setAlcanceOs(m?.alcanceIdObraSocial ? String(m.alcanceIdObraSocial) : "")
    setAlcanceDestino(destino)
  }

  async function confirmarAlcance() {
    if (!alcanceDestino) return
    const os = alcanceModo === "obra_social" && alcanceOs ? Number(alcanceOs) : null
    if (alcanceModo === "obra_social" && !os) {
      toast.error("Elegí la obra social que audita.")
      return
    }
    const destino = alcanceDestino
    setAlcanceDestino(null)
    if (destino.tipo === "codigo") {
      await generarCodigo("auditor", os)
    } else {
      await cambiar(destino.miembro, { rol: "auditor", alcanceIdObraSocial: os })
    }
  }

  async function eliminarCodigo(c: Codigo) {
    setBorrando(c.id)
    try {
      await api.del(`/clinica/codigos/${c.id}`)
      toast.success("Código eliminado.")
      await cargar()
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : "No se pudo eliminar el código."
      toast.error(msg)
    } finally {
      setBorrando(null)
    }
  }

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(codigo)
      setTimeout(() => setCopiado(null), 1500)
    } catch {
      toast.error("No se pudo copiar.")
    }
  }

  if (loading || cargando) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">Administración</h1>
        <p className="mt-1 text-muted-foreground">
          Gestioná los datos de tu clínica, sus profesionales y los códigos de activación.
        </p>
      </div>

      {/* Fase N: dirección y descripción que ve el paciente al reservar */}
      <DatosClinica />

      {/* Profesionales / miembros */}
      <Card className="mt-6">
        <CardContent className="p-4 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="size-5 text-primary" /> Profesionales
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Dá de alta o de baja a los miembros y cambiá su rol en la clínica.
          </p>

          <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
            {miembros.map((m) => {
              const meta = ROL_META[m.rol] ?? ROL_META.profesional
              const Icon = meta.icon
              const enCurso = accion === m.id
              const nombre =
                [m.nombre, m.apellido].filter(Boolean).join(" ") ||
                m.email ||
                "Sin nombre"
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="truncate">{nombre}</span>
                      {m.esYo && (
                        <Badge variant="outline" className="font-normal">
                          Vos
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {meta.label}
                      {m.rol === "auditor" ? ` ${alcanceLabel(m.alcanceObraSocial)}` : ""}
                      {m.matricula ? ` · Mat. ${m.matricula}` : ""}
                      {m.email ? ` · ${m.email}` : ""}
                    </p>
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                  <Badge variant={m.activo ? "default" : "secondary"}>
                    {m.activo ? "Activo" : "De baja"}
                  </Badge>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={enCurso}
                        aria-label="Acciones"
                      >
                        {enCurso ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          <MoreVertical />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuLabel>Estado</DropdownMenuLabel>
                      {m.activo ? (
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => cambiar(m, { activo: false })}
                        >
                          Dar de baja
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onSelect={() => cambiar(m, { activo: true })}
                        >
                          Activar
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>Rol</DropdownMenuLabel>
                      {rolesDisponibles.map((r) => (
                        <DropdownMenuItem
                          key={r}
                          disabled={r === m.rol}
                          onSelect={() =>
                            r === "auditor"
                              ? abrirAlcance({ tipo: "miembro", miembro: m })
                              : cambiar(m, { rol: r })
                          }
                        >
                          {ROL_META[r].label}
                          {r === m.rol ? " ·" : ""}
                        </DropdownMenuItem>
                      ))}
                      {m.rol === "auditor" && (
                        <DropdownMenuItem
                          onSelect={() => abrirAlcance({ tipo: "miembro", miembro: m })}
                        >
                          Cambiar alcance…
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  </div>
                </li>
              )
            })}
            {miembros.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                No hay miembros en la clínica.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {/* Códigos de activación */}
      <Card className="mt-6">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
              <KeyRound className="size-5 shrink-0 text-primary" /> Códigos de
              activación
            </h2>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={generating}>
                  {generating ? <Loader2 className="animate-spin" /> : <Plus />}
                  Generar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Tipo de código</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => generarCodigo("profesional")}>
                  <Stethoscope /> Profesional
                </DropdownMenuItem>
                {conRecepcion && (
                  <DropdownMenuItem onSelect={() => generarCodigo("recepcion")}>
                    <ClipboardList /> Recepción
                  </DropdownMenuItem>
                )}
                {conAuditoria && (
                  <DropdownMenuItem onSelect={() => abrirAlcance({ tipo: "codigo" })}>
                    <ClipboardCheck /> Auditoría
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Compartí un código disponible para que alguien se una a tu clínica al
            registrarse: como profesional, en recepción o en auditoría. Solo se pueden eliminar
            los que no se usaron.
          </p>

          <ul className="mt-5 divide-y divide-border rounded-lg border border-border">
            {codigos.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm"
              >
                <code className="min-w-0 truncate font-mono">{c.codigo}</code>
                <Badge variant="outline" className="font-normal">
                  {ROL_CODIGO_LABEL[c.rol ?? "profesional"]}
                  {c.rol === "auditor" && c.alcance_obra_social
                    ? ` · ${c.alcance_obra_social}`
                    : ""}
                </Badge>
                <Badge variant={c.usado || c.vencido ? "secondary" : "default"}>
                  {c.usado ? "Usado" : c.vencido ? "Vencido" : "Disponible"}
                </Badge>
                <div className="ml-auto flex items-center gap-1">
                  {!c.usado && !c.vencido && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copiar(c.codigo)}
                      aria-label="Copiar código"
                    >
                      {copiado === c.codigo ? <Check /> : <Copy />}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={c.usado || borrando === c.id}
                    onClick={() => eliminarCodigo(c)}
                    aria-label="Eliminar código"
                    title={
                      c.usado
                        ? "No se puede eliminar: ya fue usado"
                        : "Eliminar código"
                    }
                  >
                    {borrando === c.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Trash2 className={c.usado ? "" : "text-destructive"} />
                    )}
                  </Button>
                </div>
              </li>
            ))}
            {codigos.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted-foreground">
                Todavía no generaste códigos.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {/* Fase J: alcance del auditor (al asignar el rol o generar su código) */}
      <Dialog open={!!alcanceDestino} onOpenChange={(o) => !o && setAlcanceDestino(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alcance de la auditoría</DialogTitle>
            <DialogDescription>
              {alcanceDestino?.tipo === "codigo"
                ? "Quien se registre con este código va a quedar en auditoría con este alcance."
                : "Solo va a ver las historias clínicas dentro de este alcance. No puede cargar ni modificar registros."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="alcance-modo">Qué puede auditar</Label>
              <Select
                value={alcanceModo}
                onValueChange={(v) => setAlcanceModo(v as "interno" | "obra_social")}
              >
                <SelectTrigger id="alcance-modo" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="interno">Toda la clínica (auditoría interna)</SelectItem>
                  <SelectItem value="obra_social">Solo pacientes de una obra social</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {alcanceModo === "obra_social" && (
              <div className="grid gap-2">
                <Label htmlFor="alcance-os">Obra social</Label>
                <SelectField
                  id="alcance-os"
                  value={alcanceOs}
                  onValueChange={setAlcanceOs}
                  options={obrasSociales.map((o) => ({ value: String(o.id), label: o.nombre }))}
                  placeholder="Elegí la obra social"
                />
                <p className="text-xs text-muted-foreground">
                  Solo va a ver a los pacientes que tengan esta obra social en su cobertura.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAlcanceDestino(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarAlcance}>
              {alcanceDestino?.tipo === "codigo" ? "Generar código" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fase K: catálogos propios de la clínica (Fase L: desde el plan Equipo). */}
      <FeatureGate feature="catalogos" compacto className="mt-6">
        <CatalogosClinica />
      </FeatureGate>
    </Container>
  )
}
