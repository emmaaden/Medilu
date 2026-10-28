import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AutorizacionSheet,
  EstadoAutorizacionBadge,
  type ModoAutorizacion,
} from "@/components/dashboard/AutorizacionSheet"
import { api, ApiError } from "@/lib/api"
import { formatFechaHora } from "@/lib/fecha"
import {
  ESTADO_AUTORIZACION,
  type EstadoAutorizacion,
  type ListaAutorizaciones,
} from "@/lib/autorizaciones"
import { SkeletonTabla } from "@/components/site/Skeletons"

const TODAS = "todas"

/**
 * Fase K: listado paginado de autorizaciones previas con filtro por estado. El backend
 * acota qué se ve (el profesional, las suyas; el auditor, las de su alcance).
 * `recargar` cambia para forzar un refresco (p. ej. después de pedir una nueva).
 */
export function AutorizacionesLista({
  modo,
  estadoInicial = TODAS,
  recargar = 0,
}: {
  modo: ModoAutorizacion
  estadoInicial?: EstadoAutorizacion | typeof TODAS
  recargar?: number
}) {
  const [estado, setEstado] = useState<string>(estadoInicial)
  const [page, setPage] = useState(1)
  const [datos, setDatos] = useState<ListaAutorizaciones | null>(null)
  const [cargando, setCargando] = useState(true)
  const [abierta, setAbierta] = useState<number | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const qs = new URLSearchParams({ page: String(page) })
      if (estado !== TODAS) qs.set("estado", estado)
      setDatos(await api.get<ListaAutorizaciones>(`/autorizaciones?${qs}`))
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron cargar las autorizaciones.")
    } finally {
      setCargando(false)
    }
  }, [estado, page])

  useEffect(() => {
    cargar()
  }, [cargar, recargar])

  const cerrar = useCallback(() => setAbierta(null), [])
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.pageSize)) : 1

  return (
    <div>
      <div className="mb-4 grid max-w-xs gap-1.5">
        <Label htmlFor={`aut-estado-${modo}`}>Estado</Label>
        <Select
          value={estado}
          onValueChange={(v) => {
            setEstado(v)
            setPage(1)
          }}
        >
          <SelectTrigger id={`aut-estado-${modo}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Todas</SelectItem>
            {(Object.keys(ESTADO_AUTORIZACION) as EstadoAutorizacion[]).map((e) => (
              <SelectItem key={e} value={e}>
                {ESTADO_AUTORIZACION[e].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {cargando && !datos ? (
        <SkeletonTabla columnas={modo !== "profesional" ? 6 : 5} />
      ) : datos && datos.autorizaciones.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pedida</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Práctica</TableHead>
                {modo !== "profesional" && <TableHead>Profesional</TableHead>}
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className={cargando ? "opacity-60" : undefined}>
              {datos.autorizaciones.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">{formatFechaHora(a.creadoEn)}</TableCell>
                  <TableCell>
                    <p className="font-medium">{a.paciente.nombre || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      DNI {a.paciente.dni || "—"} · {a.paciente.obraSocial || "Sin obra social"}
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>{a.practica.descripcion}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.practica.codigo}
                      {a.practica.pieza ? ` · pieza ${a.practica.pieza}` : ""}
                    </p>
                  </TableCell>
                  {modo !== "profesional" && <TableCell>{a.profesional || "—"}</TableCell>}
                  <TableCell>
                    <EstadoAutorizacionBadge a={a} />
                    {a.numero && <p className="mt-1 text-xs text-muted-foreground">{a.numero}</p>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setAbierta(a.id)}>
                      {modo === "auditor" && a.estado === "pendiente" ? "Resolver" : "Ver"} <ChevronRight />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-muted-foreground">
            <span>
              {datos.total} {datos.total === 1 ? "solicitud" : "solicitudes"} · página {datos.page} de{" "}
              {paginas}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= paginas}
                onClick={() => setPage(page + 1)}
              >
                Siguiente <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No hay autorizaciones con este filtro.
        </p>
      )}

      <AutorizacionSheet id={abierta} modo={modo} onClose={cerrar} onCambio={cargar} />
    </div>
  )
}
