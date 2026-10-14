import { useLayoutEffect, useRef } from "react"
import { Mic, MicOff } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useDictado } from "@/hooks/useDictado"
import { useAuth } from "@/contexts/AuthContext"
import { tieneFeature } from "@/lib/planes"

/**
 * Puntuación dictada: "punto", "coma", "punto y aparte", etc. Whisper ya
 * puntúa solo ("fiebre, punto y aparte."), así que cada comando absorbe la
 * puntuación que lo rodea para no duplicarla.
 */
function aplicarComandos(texto: string) {
  // \b de JS no entiende acentos ("puntó"): delimitamos por letras Unicode.
  const cmd = (palabras: string, despues = "[.,;:]?") =>
    new RegExp(String.raw`[\s.,;:]*(?<!\p{L})(?:${palabras})(?!\p{L})` + despues, "giu")
  return texto
    .replace(cmd("punto y aparte|nueva l[ií]nea", String.raw`[\s.,;:]*`), "\n")
    .replace(cmd("punto y coma"), ";")
    .replace(cmd("dos puntos"), ":")
    .replace(cmd("punto"), ".")
    .replace(cmd("coma"), ",")
}

/** Agrega una frase dictada al texto existente con espacios y mayúsculas. */
function unirDictado(previo: string, frase: string) {
  let t = aplicarComandos(frase.trim())
  if (!t) return previo
  const base = previo.replace(/[ \t]+$/, "")
  if (base === "" || /[.!?\n]$/.test(base))
    t = t.replace(/^\s*(\p{L})/u, (c) => c.toUpperCase())
  t = t.replace(/([.!?]\s+|\n)(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase())
  const espacio = base === "" || base.endsWith("\n") || /^[.,;:\n]/.test(t) ? "" : " "
  return base + espacio + t
}

/** Textarea con botón de micrófono para dictar (motor propio, ver useDictado). */
export function DictationTextarea({
  value,
  onValueChange,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
}) {
  const { supported: soportado, listening, interim, start, stop } = useDictado()
  // Fase L: el dictado depende del plan de la clínica.
  const { user } = useAuth()
  const supported = soportado && tieneFeature(user?.plan, "dictado")
  // El reconocedor vive más que un render: leemos siempre el valor actual.
  const valueRef = useRef(value)
  useLayoutEffect(() => {
    valueRef.current = value
  }, [value])

  if (!supported)
    return (
      <Textarea
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={className}
        {...props}
      />
    )

  return (
    <div className="grid gap-1.5">
      <div className="relative">
        <Textarea
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          className={cn("pr-11", className)}
          {...props}
        />
        <Button
          type="button"
          variant={listening ? "destructive" : "ghost"}
          size="icon-sm"
          aria-pressed={listening}
          aria-label={listening ? "Detener dictado" : "Dictar"}
          title={listening ? "Detener dictado" : "Dictar"}
          className={cn(
            "absolute top-1.5 right-1.5",
            listening && "animate-pulse motion-reduce:animate-none"
          )}
          onClick={() =>
            listening
              ? stop()
              : void start((frase) => {
                  // Puede llegar más de una frase antes del próximo render.
                  valueRef.current = unirDictado(valueRef.current, frase)
                  onValueChange(valueRef.current)
                }, () => valueRef.current)
          }
        >
          {listening ? <MicOff /> : <Mic />}
        </Button>
      </div>
      {(listening || interim) && (
        <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground italic">
          {interim || "Escuchando…"}
        </p>
      )}
    </div>
  )
}
