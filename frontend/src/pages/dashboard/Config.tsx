import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Loader2,
  Camera,
  Save,
  Plus,
  Pencil,
  Trash2,
  MapPin,
  FileText,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Field } from "@/components/form/Field"
import { SelectField } from "@/components/form/SelectField"
import { Container } from "@/components/site/Section"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { api } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

type Datos = {
  nombre?: string
  apellido?: string
  direccion?: string
  descripcion?: string
}
type Horario = {
  id: string | number
  dia: string
  horario_inicio: string
  horario_fin: string
}

const DIAS = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
].map((d) => ({ value: d, label: d }))

export default function Config() {
  const { user } = useAuth()
  const [datos, setDatos] = useState<Datos>({})
  const [esp, setEsp] = useState("")
  const [avatar, setAvatar] = useState<string>("")

  useEffect(() => {
    if (!user) return
    api
      .post<Datos>("/profesional/get-datos-prof", { user_id: user.id })
      .then(setDatos)
      .catch(() => {})
    api
      .post<{ especialidad_profesional?: string }>("/profesional/get-esp-prof", {
        user_id: user.idRole,
      })
      .then((d) => setEsp(d.especialidad_profesional || ""))
      .catch(() => {})
    api
      .post<{ image?: string }>("/avatars/get-img", { user_id: user.id })
      .then((d) => d.image && setAvatar(d.image))
      .catch(() => {})
  }, [user])

  const nombre = [datos.nombre, datos.apellido].filter(Boolean).join(" ")

  return (
    <Container className="py-8 sm:py-12">
      <h1 className="text-2xl font-semibold sm:text-3xl">Configuración</h1>
      <p className="mt-1 text-muted-foreground">
        Administrá tu perfil y tus horarios de atención.
      </p>

      {/* Cabecera de perfil */}
      <Card className="mt-6">
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center">
          <AvatarUploader
            avatar={avatar}
            userId={user?.id || ""}
            onChange={setAvatar}
            nombre={nombre}
          />
          <div className="text-center sm:text-left">
            <h2 className="text-xl font-semibold">{nombre || "—"}</h2>
            <p className="text-sm text-muted-foreground">
              {esp || "Especialidad no definida"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="perfil" className="mt-6">
        <TabsList>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="horarios">Horarios</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil">
          <PerfilEditor
            datos={datos}
            idRole={user?.idRole ?? 0}
            onSaved={(patch) => setDatos((d) => ({ ...d, ...patch }))}
          />
        </TabsContent>

        <TabsContent value="horarios">
          <HorariosEditor idRole={user?.idRole ?? 0} />
        </TabsContent>
      </Tabs>
    </Container>
  )
}

/* --------------------------- Avatar --------------------------- */
function AvatarUploader({
  avatar,
  userId,
  onChange,
  nombre,
}: {
  avatar: string
  userId: string
  onChange: (url: string) => void
  nombre: string
}) {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<string>("")
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const initials =
    (nombre || "?")
      .split(" ")
      .map((s) => s[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setPreview(URL.createObjectURL(f))
    }
  }

  async function subir() {
    if (!file) {
      toast.warning("Elegí una imagen primero.")
      return
    }
    setSaving(true)
    try {
      const form = new FormData()
      form.append("avatar", file)
      form.append("user_id", userId)
      const d = await api.upload<{ url?: string; error?: string }>(
        "/avatars/upload",
        form
      )
      if (d.url) {
        onChange(d.url)
        setOpen(false)
        setFile(null)
        setPreview("")
        toast.success("Foto actualizada")
      } else {
        toast.error(d.error || "No se pudo subir la imagen.")
      }
    } catch {
      toast.error("No se pudo subir la imagen.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative size-20 shrink-0 overflow-hidden rounded-full ring-2 ring-border"
        aria-label="Cambiar foto de perfil"
      >
        {avatar ? (
          <img src={avatar} alt="" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center bg-primary text-xl font-semibold text-primary-foreground">
            {initials}
          </span>
        )}
        <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-5" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar foto de perfil</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div className="size-32 overflow-hidden rounded-full ring-2 ring-border">
              {preview || avatar ? (
                <img
                  src={preview || avatar}
                  alt="Vista previa de tu foto de perfil"
                  className="size-full object-cover"
                />
              ) : (
                <span className="grid size-full place-items-center bg-muted text-2xl font-semibold text-muted-foreground">
                  {initials}
                </span>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={onPick}
              className="hidden"
            />
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              <Camera /> Elegir imagen
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={subir} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* --------------------------- Perfil --------------------------- */
function PerfilEditor({
  datos,
  idRole,
  onSaved,
}: {
  datos: Datos
  idRole: number
  onSaved: (patch: Partial<Datos>) => void
}) {
  return (
    <div className="mt-4 grid gap-4">
      <SaveRow
        icon={MapPin}
        label="Dirección"
        endpoint="/profesional/save-direc"
        field="direccion"
        idRole={idRole}
        initial={datos.direccion ?? ""}
        onSaved={(v) => onSaved({ direccion: v })}
      />
      <SaveRow
        icon={FileText}
        label="Descripción"
        endpoint="/profesional/save-desc"
        field="descripcion"
        multiline
        idRole={idRole}
        initial={datos.descripcion ?? ""}
        onSaved={(v) => onSaved({ descripcion: v })}
      />
    </div>
  )
}

function SaveRow({
  icon: Icon,
  label,
  endpoint,
  field,
  idRole,
  initial,
  type = "text",
  multiline,
  onSaved,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  endpoint: string
  field: string
  idRole: number
  initial: string
  type?: string
  multiline?: boolean
  onSaved: (value: string) => void
}) {
  const [value, setValue] = useState(initial)
  const [saving, setSaving] = useState(false)
  useEffect(() => setValue(initial), [initial])

  async function guardar() {
    setSaving(true)
    try {
      // Los endpoints usan la clave del campo en el body (direccion/descripcion).
      await api.post(endpoint, { user_id: idRole, [field]: value })
      toast.success(`${label} actualizada`)
      onSaved(value)
    } catch {
      toast.error(`No se pudo guardar ${label.toLowerCase()}.`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <Field label={label} htmlFor={field}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <span className="mt-2 hidden text-muted-foreground sm:block">
              <Icon className="size-5" />
            </span>
            {multiline ? (
              <Textarea
                id={field}
                rows={3}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1"
              />
            ) : (
              <Input
                id={field}
                type={type}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-10 flex-1"
              />
            )}
            <Button onClick={guardar} disabled={saving} size="lg">
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              Guardar
            </Button>
          </div>
        </Field>
      </CardContent>
    </Card>
  )
}

/* --------------------------- Horarios --------------------------- */
function HorariosEditor({ idRole }: { idRole: number }) {
  const [horarios, setHorarios] = useState<Horario[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<string | number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [dia, setDia] = useState("")
  const [startHour, setStartHour] = useState("")
  const [endHour, setEndHour] = useState("")
  const [saving, setSaving] = useState(false)

  function cargar() {
    setLoading(true)
    api
      .get<Horario[]>(`/hour/get-horarios?user_id=${idRole}`)
      .then((d) => setHorarios(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (idRole) cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idRole])

  function nuevo() {
    setEditId(null)
    setDia("")
    setStartHour("")
    setEndHour("")
    setShowForm(true)
  }
  function editar(h: Horario) {
    setEditId(h.id)
    setDia(h.dia)
    setStartHour(h.horario_inicio)
    setEndHour(h.horario_fin)
    setShowForm(true)
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    if (!dia || !startHour || !endHour) {
      toast.warning("Completá día, inicio y fin.")
      return
    }
    setSaving(true)
    const url = editId ? "/hour/save-hours" : "/hour/insert-hours"
    const body = editId
      ? { id: editId, user_id: idRole, dia, startHour, endHour }
      : { user_id: idRole, dia, startHour, endHour }
    try {
      const r = await api.post<{ success?: boolean; message?: string; error?: string }>(
        url,
        body
      )
      if (r.success) {
        toast.success(r.message || "Horario guardado")
        setShowForm(false)
        cargar()
      } else {
        toast.error(r.error || "No se pudo guardar el horario.")
      }
    } catch {
      toast.error("No se pudo guardar el horario.")
    } finally {
      setSaving(false)
    }
  }

  async function borrar(id: string | number) {
    setSaving(true)
    try {
      const r = await api.post<{ success?: boolean; error?: string }>(
        "/hour/delete-hours",
        { id, user_id: idRole }
      )
      if (r.success) {
        toast.success("Horario eliminado")
        cargar()
      } else {
        toast.error(r.error || "No se pudo eliminar.")
      }
    } catch {
      toast.error("No se pudo eliminar.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <Card>
        <CardContent className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <Clock className="size-5 text-primary" /> Horarios de atención
            </h3>
            <Button size="sm" onClick={nuevo}>
              <Plus /> Agregar
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : horarios.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 font-medium">Día</th>
                    <th className="py-2 font-medium">Inicio</th>
                    <th className="py-2 font-medium">Fin</th>
                    <th className="py-2 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {horarios.map((h) => (
                    <tr key={h.id} className="border-b border-border/60">
                      <td className="py-2.5">{h.dia}</td>
                      <td className="py-2.5">{h.horario_inicio}</td>
                      <td className="py-2.5">{h.horario_fin}</td>
                      <td className="py-2.5">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="Editar"
                            onClick={() => editar(h)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon-sm"
                            aria-label="Borrar"
                            onClick={() => borrar(h.id)}
                            disabled={saving}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              No hay horarios cargados.
            </p>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardContent className="p-5">
            <h4 className="mb-4 font-semibold">
              {editId ? "Editar horario" : "Nuevo horario"}
            </h4>
            <form
              onSubmit={guardar}
              className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <Field label="Día" htmlFor="dia">
                <SelectField
                  id="dia"
                  value={dia}
                  onValueChange={setDia}
                  options={DIAS}
                />
              </Field>
              <Field label="Inicio" htmlFor="startHour">
                <Input
                  id="startHour"
                  type="time"
                  value={startHour}
                  onChange={(e) => setStartHour(e.target.value)}
                  className="h-10"
                />
              </Field>
              <Field label="Fin" htmlFor="endHour">
                <Input
                  id="endHour"
                  type="time"
                  value={endHour}
                  onChange={(e) => setEndHour(e.target.value)}
                  className="h-10"
                />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving} size="lg">
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  Guardar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  onClick={() => setShowForm(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
