import { useState } from "react"
import { toast } from "sonner"
import { Check, Copy, Link2, Loader2, MailCheck, MessageCircle, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field } from "@/components/form/Field"
import { api, ApiError } from "@/lib/api"
import { useAuth } from "@/contexts/AuthContext"

/**
 * Fase AA: link para que el paciente cargue sus datos personales (sin cuenta).
 * Sin `paciente` es para un paciente nuevo (crea la ficha); con `paciente`, para que
 * complete o actualice la suya (tiene que escribir su DNI). Ver
 * backend/controllers/linkDatosController.js.
 */
type PacienteLink = { dni: string; fullName: string; nombre?: string; email?: string }

type Generado = { url: string; venceEn: string; mailEnviado?: boolean; email: string }

export function LinkDatosDialog({
  paciente,
  open,
  onOpenChange,
}: {
  paciente?: PacienteLink
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  // El contenido se desmonta al cerrar: cada apertura genera un link nuevo.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <Contenido paciente={paciente} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function Contenido({ paciente, onClose }: { paciente?: PacienteLink; onClose: () => void }) {
  const { user } = useAuth()
  const [email, setEmail] = useState(paciente?.email || "")
  const [generando, setGenerando] = useState(false)
  const [generado, setGenerado] = useState<Generado | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function generar(e: React.FormEvent) {
    e.preventDefault()
    const destino = email.trim()
    setGenerando(true)
    try {
      const r = await api.post<{ url: string; venceEn: string; mailEnviado?: boolean }>("/pacient/link-datos", {
        ...(paciente ? { dni: paciente.dni } : {}),
        ...(destino ? { email: destino } : {}),
      })
      setGenerado({ ...r, email: destino })
    } catch (err) {
      const det = err instanceof ApiError ? (err.data as { detalles?: { mensaje: string }[] } | null)?.detalles : null
      toast.error(det?.[0]?.mensaje || (err instanceof ApiError ? err.message : "No se pudo generar el link."))
    } finally {
      setGenerando(false)
    }
  }

  async function copiar() {
    if (!generado) return
    try {
      await navigator.clipboard.writeText(generado.url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      toast.error("No se pudo copiar. Seleccioná el link y copialo a mano.")
    }
  }

  const pila = paciente?.nombre || paciente?.fullName?.split(" ")[0] || ""
  const mensaje = generado
    ? `Hola${pila ? ` ${pila}` : ""}! ${user?.fullName ? `Soy ${user.fullName}. ` : ""}Te pido que completes tus datos para tu historia clínica en este link: ${generado.url}`
    : ""
  const vence = generado
    ? new Date(generado.venceEn).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })
    : ""

  return (
    <>
      <DialogHeader>
        <DialogTitle>Pedir datos al paciente</DialogTitle>
        <DialogDescription>
          {paciente
            ? `${paciente.fullName} completa o actualiza sus datos personales y su cobertura desde el link, sin crear una cuenta. Para abrir su ficha le vamos a pedir su DNI.`
            : "El paciente carga sus datos personales y su cobertura desde el link, sin crear una cuenta, y queda dado de alta en tu clínica."}
        </DialogDescription>
      </DialogHeader>

      {!generado ? (
        <form onSubmit={generar} className="space-y-4">
          <Field
            label="Email del paciente (opcional)"
            htmlFor="ld-email"
            hint="Si lo cargás, además se lo mandamos por email. Si no, lo copiás o lo mandás por WhatsApp."
          >
            <Input
              id="ld-email"
              type="email"
              autoComplete="off"
              className="h-10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={generando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={generando}>
              {generando ? <Loader2 className="animate-spin" /> : <Link2 />}
              Generar link
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <div className="space-y-4">
          {generado.email && generado.mailEnviado && (
            <Alert>
              <MailCheck />
              <AlertDescription>Se lo mandamos a {generado.email}.</AlertDescription>
            </Alert>
          )}
          {generado.email && generado.mailEnviado === false && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>
                No se pudo mandar el email. Copiá el link o mandalo por WhatsApp.
              </AlertDescription>
            </Alert>
          )}

          <Field label="Link para el paciente" htmlFor="ld-url" hint={`Vale hasta el ${vence} y se usa una sola vez.`}>
            <Input
              id="ld-url"
              readOnly
              className="h-10 font-mono text-xs"
              value={generado.url}
              onFocus={(e) => e.currentTarget.select()}
            />
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={copiar}>
              {copiado ? <Check /> : <Copy />}
              {copiado ? "Copiado" : "Copiar"}
            </Button>
            <Button type="button" variant="outline" asChild>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Mandar el link por WhatsApp"
              >
                <MessageCircle /> WhatsApp
              </a>
            </Button>
          </div>

          <DialogFooter>
            <Button onClick={onClose}>Listo</Button>
          </DialogFooter>
        </div>
      )}
    </>
  )
}
