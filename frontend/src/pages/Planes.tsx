import { useState } from "react"
import { Link } from "react-router-dom"
import { ArrowRight, MessageCircle, HeartHandshake } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Container, PageHero } from "@/components/site/Section"
import { PlanCard, type Ciclo } from "@/components/site/PlanCard"
import { WHATSAPP_URL } from "@/lib/site"
import { mesesDeRegalo, useCatalogoPlanes, waContratar } from "@/lib/planes"
import { SkeletonPlanes } from "@/components/site/Skeletons"

export default function Planes() {
  const { catalogo, error } = useCatalogoPlanes()
  const [ciclo, setCiclo] = useState<Ciclo>("mensual")
  const regalo = catalogo?.planes[0] ? mesesDeRegalo(catalogo.planes[0]) : 0
  const dias = catalogo?.diasPrueba ?? 14

  return (
    <>
      <PageHero
        eyebrow="Planes"
        title="Todo tu consultorio en una sola app"
        description={`Agenda, historia clínica, certificados y obras sociales en el mismo lugar. Probalo ${dias} días sin costo y sin tarjeta, con todas las funciones.`}
      />

      <Container className="py-16">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Precio final en pesos argentinos, con IVA incluido.
          </p>
          <Tabs value={ciclo} onValueChange={(v) => setCiclo(v as Ciclo)}>
            <TabsList>
              <TabsTrigger value="mensual">Mensual</TabsTrigger>
              <TabsTrigger value="anual">
                Anual{regalo > 0 ? ` · ${regalo} meses de regalo` : ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {!catalogo && !error && (
          <SkeletonPlanes />
        )}
        {error && (
          <p className="mt-10 text-center text-sm text-muted-foreground" role="alert">
            No pudimos cargar los planes. Probá de nuevo en un rato o{" "}
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              escribinos por WhatsApp
            </a>
            .
          </p>
        )}

        {catalogo && (
          <div className="mt-10 grid items-stretch gap-6 md:grid-cols-2 lg:grid-cols-3">
            {catalogo.planes.map((p, i) => (
              <PlanCard
                key={p.id}
                plan={p}
                anterior={catalogo.planes[i - 1]}
                features={catalogo.features}
                ciclo={ciclo}
                accion={
                  <div className="grid gap-2">
                    <Button asChild size="lg" variant={p.destacado ? "default" : "outline"} className="w-full">
                      <Link to="/register/profesional">
                        Probar {dias} días gratis <ArrowRight aria-hidden />
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm" className="w-full">
                      <a href={waContratar(p.nombre, null, ciclo)} target="_blank" rel="noreferrer">
                        <MessageCircle aria-hidden /> Consultar por WhatsApp
                        <span className="sr-only"> sobre el plan {p.nombre} (se abre en una pestaña nueva)</span>
                      </a>
                    </Button>
                  </div>
                }
              />
            ))}
          </div>
        )}

        <div className="mx-auto mt-12 flex max-w-2xl items-start gap-3 rounded-xl border border-border bg-muted/30 p-5">
          <HeartHandshake className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Para el paciente es siempre gratis.</span>{" "}
            Con su cuenta reserva turnos, guarda y comparte sus estudios, y ve sus
            certificados y su historia clínica.
          </p>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
          Al terminar la prueba elegís un plan; si no, la clínica queda en solo lectura (ves y
          exportás tus datos, pero no cargás nuevos). Tenés 10 días corridos desde la
          contratación para arrepentirte sin costo y podés dar de baja el plan cuando quieras.
          Leé los{" "}
          <Link to="/terminos" className="font-medium text-primary hover:underline">
            Términos y condiciones
          </Link>{" "}
          y la{" "}
          <Link to="/reembolsos" className="font-medium text-primary hover:underline">
            Política de reembolsos
          </Link>{" "}
          antes de contratar.
        </p>
      </Container>
    </>
  )
}
