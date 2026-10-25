import { useState } from "react"
import { toast } from "sonner"
import { Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { VistaSesion } from "@/hooks/useUser"
import { VerComoDialog } from "@/components/VerComoDialog"
import { describirVista, salirDeVista } from "@/lib/vista"

// Fase Z: franja fija arriba del header mientras la plataforma usa "Ver como".
export function VistaBanner({ vista }: { vista: VistaSesion | null | undefined }) {
  const [cambiar, setCambiar] = useState(false)
  const [saliendo, setSaliendo] = useState(false)
  if (!vista) return null

  async function volver() {
    setSaliendo(true)
    try {
      await salirDeVista()
    } catch {
      toast.error("No se pudo volver a tu cuenta.")
      setSaliendo(false)
    }
  }

  return (
    <div className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1.5 text-sm sm:px-6">
        <p className="flex min-w-0 items-center gap-2">
          <Eye className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            Viendo como <strong className="font-semibold">{describirVista(vista)}</strong>
          </span>
        </p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 hover:bg-primary-foreground/15 hover:text-primary-foreground" onClick={() => setCambiar(true)}>
            Cambiar
          </Button>
          <Button size="sm" variant="secondary" className="h-7" onClick={volver} disabled={saliendo}>
            Volver a mi cuenta
          </Button>
        </div>
      </div>
      <VerComoDialog open={cambiar} onOpenChange={setCambiar} vista={vista} />
    </div>
  )
}
