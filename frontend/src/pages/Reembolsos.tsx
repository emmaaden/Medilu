import { Link } from "react-router-dom"
import { LegalArticle } from "@/components/site/LegalArticle"
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site"

const LINK = "font-medium text-primary underline-offset-2 hover:underline"

export default function Reembolsos() {
  return (
    <LegalArticle
      updated={LEGAL_UPDATED}
      title="Política de reembolsos"
      intro={
        <p>
          Cómo funcionan el arrepentimiento, la baja y los reintegros de los planes
          pagos de Medilu. Esta política se suma a tus derechos como consumidor
          (Ley 24.240 y Código Civil y Comercial) y nunca los reduce.
        </p>
      }
      sections={[
        {
          title: "Pacientes",
          body: (
            <p>
              Reservar turnos en Medilu es gratuito: no te cobramos nada. Lo que
              pagues por una consulta lo cobra el profesional o la clínica, y los
              reintegros de ese pago se rigen por sus condiciones. Si tenés un problema
              con ese cobro, reclamale a quien te lo cobró.
            </p>
          ),
        },
        {
          title: "Arrepentimiento: 10 días para cancelar sin costo",
          body: (
            <>
              <p>
                Si contrataste un plan a distancia (WhatsApp, email o el sitio), podés
                revocar la contratación dentro de los <strong>10 días corridos</strong>{" "}
                desde que la celebraste, sin dar explicaciones y sin costo (art. 34 de
                la Ley 24.240 y art. 1110 del Código Civil y Comercial).
              </p>
              <p>
                Te devolvemos el <strong>100 % de lo pagado</strong> por el mismo medio
                de pago, a más tardar dentro de los 10 días hábiles de recibida la
                solicitud.
              </p>
            </>
          ),
        },
        {
          title: "Baja del plan",
          body: (
            <ul>
              <li>
                Podés dar de baja tu plan cuando quieras, sin penalidades: desde el panel
                (Plan → «Dar de baja la renovación»), con el Botón de baja de servicio o
                por el mismo medio por el que contrataste.
              </li>
              <li>
                Si usás el Botón de baja con la sesión iniciada como administrador de la
                clínica, el débito automático se cancela en el acto; sin sesión, lo
                cancelamos nosotros y te confirmamos por email.
              </li>
              <li>
                La baja corta los cobros siguientes. El plan sigue activo hasta el final
                del período (mes o año) que ya pagaste; ese período no se reintegra, salvo lo indicado en
                «Fallas del servicio».
              </li>
              <li>
                Antes de que se borren los datos de tu clínica te damos la posibilidad
                de exportar las historias clínicas.
              </li>
            </ul>
          ),
        },
        {
          title: "Fallas del servicio y cobros erróneos",
          body: (
            <ul>
              <li>
                Si por una causa nuestra no pudiste usar el servicio, te reintegramos o
                acreditamos la parte proporcional al tiempo sin servicio.
              </li>
              <li>
                Si te cobramos dos veces o un importe distinto al publicado, te
                devolvemos la diferencia completa.
              </li>
            </ul>
          ),
        },
        {
          title: "Cómo pedirlo",
          body: (
            <>
              <p>
                Sin necesidad de iniciar sesión, desde el{" "}
                <Link to="/arrepentimiento" className={LINK}>
                  Botón de arrepentimiento
                </Link>{" "}
                o el{" "}
                <Link to="/baja" className={LINK}>
                  Botón de baja de servicio
                </Link>
                , o escribiendo a{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
                  {CONTACT_EMAIL}
                </a>
                . También por el mismo medio por el que contrataste.
              </p>
              <p>
                Dentro de las 24 horas te informamos un{" "}
                <strong>código de identificación</strong> de tu solicitud por el mismo
                medio.
              </p>
            </>
          ),
        },
      ]}
    />
  )
}
