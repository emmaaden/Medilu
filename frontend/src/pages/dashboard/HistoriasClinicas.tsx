import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  Loader2,
  Download,
  Upload,
  FileJson,
  FileText,
  Users,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Container } from "@/components/site/Section"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"
import { downloadPatientHistoryPdf, type Paciente } from "@/lib/patientPdf"
import { SkeletonLista } from "@/components/site/Skeletons"

type PacienteAlcance = { dni: string | null; nombre: string | null; registros: number }
type Resumen = {
  pacientesCreados: number
  pacientesExistentes: number
  registrosImportados: number
  registrosOmitidos: number
  errores: string[]
}

// Descarga una respuesta autenticada como archivo (usa el filename del backend).
async function descargarArchivo(path: string, fallbackName: string) {
  const res = await fetch(path, { credentials: "include" })
  if (!res.ok) throw new Error("descarga fallida")
  const blob = await res.blob()
  const cd = res.headers.get("Content-Disposition") || ""
  const m = cd.match(/filename="?([^"]+)"?/)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = m?.[1] || fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function HistoriasClinicas() {
  const { user } = useAuth()
  const esAdmin = !!user?.esAdmin

  const [pacientes, setPacientes] = useState<PacienteAlcance[]>([])
  const [cargando, setCargando] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [pdfDni, setPdfDni] = useState<string | null>(null)
  const importInput = useRef<HTMLInputElement>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const d = await api.get<{ pacientes: PacienteAlcance[] }>("/hc/pacientes")
      setPacientes(d.pacientes || [])
    } catch {
      toast.error("No se pudieron cargar los pacientes.")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  async function exportar() {
    setExportando(true)
    try {
      await descargarArchivo("/hc/export", "historias-clinicas.json")
      toast.success("Exportación descargada.")
    } catch {
      toast.error("No se pudo exportar.")
    } finally {
      setExportando(false)
    }
  }

  async function importar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (importInput.current) importInput.current.value = ""
    if (!file) return
    setImportando(true)
    setResumen(null)
    try {
      const texto = await file.text()
      let doc: unknown
      try {
        doc = JSON.parse(texto)
      } catch {
        toast.error("El archivo no es un JSON válido.")
        return
      }
      const r = await api.post<{ resumen: Resumen }>("/hc/import", doc as Record<string, unknown>)
      setResumen(r.resumen)
      toast.success("Importación finalizada.")
      await cargar()
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "No se pudo importar el archivo."
      toast.error(msg)
    } finally {
      setImportando(false)
    }
  }

  async function pdfPaciente(dni: string | null) {
    if (!dni) return
    setPdfDni(dni)
    try {
      const data = await api.post<Paciente>("/pacient/get-data-pacient", { dni })
      downloadPatientHistoryPdf(data)
    } catch {
      toast.error("No se pudo generar el PDF.")
    } finally {
      setPdfDni(null)
    }
  }

  return (
    <Container className="py-8 sm:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">Historias clínicas</h1>
        <p className="mt-1 text-muted-foreground">
          Exportá e importá historias clínicas.{" "}
          {esAdmin
            ? "Como administrador/a, alcanzás a toda la clínica."
            : "Alcanzás las historias de los pacientes que atendiste."}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Export */}
        <Card>
          <CardContent className="flex h-full flex-col p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Download className="size-6" />
              </span>
              <div>
                <h2 className="font-semibold">Exportar</h2>
                <p className="text-sm text-muted-foreground">
                  Un archivo <span className="font-medium">JSON</span> estructurado (portable y
                  reimportable).
                </p>
              </div>
            </div>
            <div className="mt-auto pt-5">
              <Button onClick={exportar} disabled={exportando}>
                {exportando ? <Loader2 className="animate-spin" /> : <FileJson />}
                Exportar todo (JSON)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Import */}
        <Card>
          <CardContent className="flex h-full flex-col p-6">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Upload className="size-6" />
              </span>
              <div>
                <h2 className="font-semibold">Importar</h2>
                <p className="text-sm text-muted-foreground">
                  {esAdmin
                    ? "Desde un JSON exportado. Empareja por DNI y no duplica registros ya cargados."
                    : "Solo el administrador de la clínica puede importar historias clínicas."}
                </p>
              </div>
            </div>
            <div className="mt-auto pt-5">
              <input
                ref={importInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={importar}
              />
              <Button
                variant="outline"
                onClick={() => importInput.current?.click()}
                disabled={importando || !esAdmin}
              >
                {importando ? <Loader2 className="animate-spin" /> : <Upload />}
                Elegir archivo…
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumen de importación */}
      {resumen && (
        <Card className="mt-6">
          <CardContent className="p-4 sm:p-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-5 text-primary" /> Resultado de la importación
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">Pacientes nuevos: {resumen.pacientesCreados}</Badge>
              <Badge variant="secondary">Pacientes existentes: {resumen.pacientesExistentes}</Badge>
              <Badge>Registros importados: {resumen.registrosImportados}</Badge>
              <Badge variant="outline">Registros omitidos: {resumen.registrosOmitidos}</Badge>
            </div>
            {resumen.errores.length > 0 && (
              <div className="mt-4">
                <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                  <ShieldAlert className="size-4" /> {resumen.errores.length} con problemas
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {resumen.errores.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pacientes en alcance */}
      <Card className="mt-6">
        <CardContent className="p-4 sm:p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Users className="size-5 text-primary" /> Pacientes en alcance
            <Badge variant="secondary" className="ml-1 font-normal">
              {pacientes.length}
            </Badge>
          </h2>
          {cargando ? (
            <SkeletonLista />
          ) : (
            <ul className="mt-4 divide-y divide-border rounded-lg border border-border">
              {pacientes.map((p) => (
                <li key={p.dni} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.nombre || "Sin nombre"}</p>
                    <p className="text-xs text-muted-foreground">
                      DNI {p.dni} · {p.registros} consulta(s)
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => pdfPaciente(p.dni)}
                    disabled={pdfDni === p.dni}
                  >
                    {pdfDni === p.dni ? <Loader2 className="animate-spin" /> : <FileText />}
                    PDF
                  </Button>
                </li>
              ))}
              {pacientes.length === 0 && (
                <li className="px-4 py-3 text-sm text-muted-foreground">
                  No hay pacientes en tu alcance todavía.
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </Container>
  )
}
