import { cn } from "cn"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { Container } from "@/components/site/Section"

/**
 * Esqueletos de carga. Regla de la app: la carga de una pantalla o sección muestra
 * un esqueleto con la forma del contenido; el spinner queda para las acciones
 * (botones, guardar, enviar, abrir).
 */

/** Envoltorio accesible: anuncia "Cargando…" a lectores de pantalla una sola vez. */
function Cargando({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div role="status" aria-busy="true" {...props}>
      <span className="sr-only">Cargando…</span>
      <div aria-hidden className={className}>
        {children}
      </div>
    </div>
  )
}

/** Anchos variados para que las filas no se vean todas iguales. */
const ANCHOS = ["w-2/5", "w-1/2", "w-1/3", "w-3/5", "w-2/5"]
const ancho = (i: number) => ANCHOS[i % ANCHOS.length]

/** Un bloque suelto (código, imagen, recuadro) con el anuncio de carga. */
export function SkeletonBloque({ className }: { className?: string }) {
  return (
    <Cargando>
      <Skeleton className={className} />
    </Cargando>
  )
}

/**
 * Lista con divisores: título + subtítulo y un botón a la derecha. Sin `bordes`
 * cuando ya va dentro de un recuadro (resultados de búsqueda).
 */
export function SkeletonLista({
  filas = 4,
  accion = true,
  bordes = true,
  className,
}: {
  filas?: number
  accion?: boolean
  bordes?: boolean
  className?: string
}) {
  return (
    <Cargando className={cn(bordes && "mt-4", className)}>
      <ul className={cn("divide-y divide-border", bordes && "rounded-lg border border-border")}>
        {Array.from({ length: filas }, (_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn("h-4", ancho(i))} />
              <Skeleton className="h-3 w-1/4" />
            </div>
            {accion && <Skeleton className="h-8 w-16 shrink-0" />}
          </li>
        ))}
      </ul>
    </Cargando>
  )
}

/** Tabla: fila de encabezado y filas de celdas. */
export function SkeletonTabla({
  filas = 5,
  columnas = 4,
  className,
}: {
  filas?: number
  columnas?: number
  className?: string
}) {
  const cols = Array.from({ length: columnas }, (_, c) => c)
  return (
    <Cargando className={cn("w-full", className)}>
      <div className="flex gap-4 border-b border-border py-3">
        {cols.map((c) => (
          <Skeleton key={c} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: filas }, (_, f) => (
        <div key={f} className="flex items-center gap-4 border-b border-border py-3.5">
          {cols.map((c) => (
            <div key={c} className="flex-1">
              <Skeleton className={cn("h-4", (f + c) % 3 ? "w-4/5" : "w-3/5")} />
            </div>
          ))}
        </div>
      ))}
    </Cargando>
  )
}

/** Tarjetas apiladas (turnos, estudios, certificados): ícono, dos líneas y acción. */
export function SkeletonTarjetas({
  cantidad = 3,
  icono = true,
  className,
}: {
  cantidad?: number
  icono?: boolean
  className?: string
}) {
  return (
    <Cargando className={cn("space-y-3", className)}>
      {Array.from({ length: cantidad }, (_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-4 p-4">
            {icono && <Skeleton className="size-10 shrink-0 rounded-lg" />}
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn("h-4", ancho(i))} />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="hidden h-8 w-20 shrink-0 sm:block" />
          </CardContent>
        </Card>
      ))}
    </Cargando>
  )
}

/** Grilla de indicadores (números grandes) y un bloque debajo para el detalle. */
export function SkeletonIndicadores({
  cantidad = 5,
  className,
}: {
  cantidad?: number
  className?: string
}) {
  return (
    <Cargando className={cn("space-y-6", className)}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: cantidad }, (_, i) => (
          <Card key={i}>
            <CardContent className="space-y-2 p-4">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-7 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
    </Cargando>
  )
}

/** Formulario: pares etiqueta + campo en dos columnas y el botón de guardar. */
export function SkeletonFormulario({
  campos = 6,
  className,
}: {
  campos?: number
  className?: string
}) {
  return (
    <Cargando className={cn("space-y-4", className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: campos }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-32" />
    </Cargando>
  )
}

/** Detalle dentro de un panel lateral: estado, recuadro del paciente, datos y texto. */
export function SkeletonDetalle({ className }: { className?: string }) {
  return (
    <Cargando className={cn("grid gap-5 px-4 pb-8", className)}>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </Cargando>
  )
}

/** Opciones grandes para elegir (perfil, clínica): ícono, nombre y etiqueta. */
export function SkeletonOpciones({
  cantidad = 2,
  className,
}: {
  cantidad?: number
  className?: string
}) {
  return (
    <Cargando className={cn("space-y-3", className)}>
      {Array.from({ length: cantidad }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border bg-background p-4"
        >
          <Skeleton className="size-11 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className={cn("h-4", ancho(i))} />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
          <Skeleton className="size-5 shrink-0" />
        </div>
      ))}
    </Cargando>
  )
}

/** Grilla de planes (precios): tarjetas altas lado a lado. */
export function SkeletonPlanes({ className }: { className?: string }) {
  return (
    <Cargando className={cn("mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i}>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-4 w-full" />
            <div className="space-y-3 pt-2">
              {Array.from({ length: 5 }, (_, f) => (
                <Skeleton key={f} className={cn("h-4", ancho(f + i))} />
              ))}
            </div>
            <Skeleton className="h-11 w-full" />
          </CardContent>
        </Card>
      ))}
    </Cargando>
  )
}

/** Página genérica del panel o de la cuenta: título, bajada y dos bloques de contenido. */
export function PageSkeleton({ className }: { className?: string }) {
  return (
    <Container className={cn("py-8 sm:py-12", className)}>
      <Cargando>
        <div className="mb-8 space-y-3">
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="space-y-6">
          {[4, 3].map((filas, i) => (
            <Card key={i}>
              <CardContent className="space-y-4 p-4 sm:p-6">
                <Skeleton className="h-5 w-40" />
                {Array.from({ length: filas }, (_, f) => (
                  <Skeleton key={f} className={cn("h-4", f % 2 ? "w-3/4" : "w-full")} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </Cargando>
    </Container>
  )
}

/** Pantalla completa sin layout (antes de saber la sesión): barra superior y página. */
export function PantallaSkeleton() {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <div className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Skeleton className="h-7 w-28" />
          <div className="hidden flex-1 gap-4 md:flex">
            {["w-16", "w-20", "w-24", "w-16"].map((w, i) => (
              <Skeleton key={i} className={cn("h-4", w)} />
            ))}
          </div>
          <Skeleton className="ml-auto size-9 rounded-full" />
        </div>
      </div>
      <PageSkeleton />
    </div>
  )
}

/** Pantalla de elección (perfil, clínica): barra con el logo, título y opciones. */
export function EleccionSkeleton({ logo, opciones = 2 }: { logo: React.ReactNode; opciones?: number }) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">{logo}</div>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-10">
        <div aria-hidden className="mb-8 flex flex-col items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-7 w-64 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <SkeletonOpciones cantidad={opciones} />
      </main>
    </div>
  )
}
