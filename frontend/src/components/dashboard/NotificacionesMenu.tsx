import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, BellOff, CalendarPlus, CalendarX, UserCheck } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SkeletonLista } from "@/components/site/Skeletons"
import { api } from "@/lib/api"

/**
 * Fase AB: campana del panel con el centro de notificaciones.
 * - El indicador muestra cuántas hay sin leer (se consulta cada minuto y al volver a
 *   la pestaña).
 * - Al abrir el centro se marcan como leídas; las que eran nuevas quedan resaltadas
 *   mientras está abierto.
 * Ver backend/controllers/notificacionController.js.
 */

type Tipo = "turno_nuevo" | "turno_cancelado" | "datos_paciente"

type Notificacion = {
  id: number
  tipo: Tipo
  titulo: string
  cuerpo: string
  url: string | null
  datos: Record<string, unknown> | null
  creadoEn: string
  leida: boolean
}

const ICONO: Record<Tipo, typeof Bell> = {
  turno_nuevo: CalendarPlus,
  turno_cancelado: CalendarX,
  datos_paciente: UserCheck,
}

const CADA_MS = 60_000

function hace(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return "Recién"
  if (min < 60) return `Hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `Hace ${h} h`
  const d = Math.round(h / 24)
  if (d === 1) return "Ayer"
  if (d < 7) return `Hace ${d} días`
  return new Date(iso).toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "short",
  })
}

export function NotificacionesMenu() {
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)
  const [noLeidas, setNoLeidas] = useState(0)
  const [lista, setLista] = useState<Notificacion[] | null>(null)
  const [error, setError] = useState(false)

  const contar = useCallback(() => {
    if (document.hidden) return
    api
      .get<{ noLeidas: number }>("/notificaciones?conteo=1")
      .then((d) => setNoLeidas(d.noLeidas))
      .catch(() => {})
  }, [])

  useEffect(() => {
    contar()
    const t = setInterval(contar, CADA_MS)
    document.addEventListener("visibilitychange", contar)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", contar)
    }
  }, [contar])

  async function abrir(o: boolean) {
    setAbierto(o)
    if (!o) return
    setError(false)
    try {
      const d = await api.get<{ notificaciones: Notificacion[]; noLeidas: number }>("/notificaciones")
      setLista(d.notificaciones)
      if (d.noLeidas > 0) {
        // Las que se acaban de ver quedan como leídas (en la lista siguen resaltadas).
        const r = await api.post<{ noLeidas: number }>("/notificaciones/leer", {})
        setNoLeidas(r.noLeidas)
      } else {
        setNoLeidas(0)
      }
    } catch {
      setError(true)
    }
  }

  function ir(n: Notificacion) {
    setAbierto(false)
    if (n.url) navigate(n.url, { state: n.datos ?? undefined })
  }

  const etiqueta = noLeidas > 9 ? "9+" : String(noLeidas)

  return (
    <Popover open={abierto} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative"
          aria-label={noLeidas ? `Notificaciones (${noLeidas} sin leer)` : "Notificaciones"}
        >
          <Bell />
          {noLeidas > 0 && (
            <span className="absolute -top-1.5 -right-1.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-background">
              {etiqueta}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notificaciones</p>
        </div>

        <div className="max-h-[min(28rem,70dvh)] overflow-y-auto">
          {error ? (
            <p className="px-4 py-6 text-center text-sm text-destructive">
              No se pudieron cargar las notificaciones.
            </p>
          ) : !lista ? (
            <div className="p-3">
              <SkeletonLista filas={3} accion={false} bordes={false} />
            </div>
          ) : lista.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <BellOff className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">No tenés notificaciones</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Acá vas a ver los turnos online y los datos que carguen tus pacientes.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {lista.map((n) => {
                const Icono = ICONO[n.tipo] ?? Bell
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => ir(n)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60",
                        !n.leida && "bg-primary/5"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                          n.tipo === "turno_cancelado"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-primary/10 text-primary"
                        )}
                      >
                        <Icono className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium">{n.titulo}</span>
                          {!n.leida && (
                            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Nueva" />
                          )}
                        </span>
                        {n.cuerpo && (
                          <span className="mt-0.5 block text-sm text-muted-foreground">{n.cuerpo}</span>
                        )}
                        <span className="mt-1 block text-xs text-muted-foreground">{hace(n.creadoEn)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
