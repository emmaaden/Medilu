import { Link } from "react-router-dom"
import { LegalArticle } from "@/components/site/LegalArticle"
import {
  DEFENSA_CONSUMIDOR_TEXTO,
  DEFENSA_CONSUMIDOR_URL,
  LEGAL_UPDATED,
} from "@/lib/site"

const LINK = "font-medium text-primary underline-offset-2 hover:underline"

export default function Terminos() {
  return (
    <LegalArticle
      updated={LEGAL_UPDATED}
      title="Términos y condiciones"
      intro={
        <p>
          Estos términos regulan el uso de Medilu. Al crear una cuenta, reservar un
          turno o contratar un plan, los aceptás. Si no estás de acuerdo, no uses el
          servicio. Nada de lo que dicen limita los derechos que te reconocen la Ley
          24.240 de Defensa del Consumidor y el Código Civil y Comercial.
        </p>
      }
      sections={[
        {
          title: "1. Qué es Medilu",
          body: (
            <>
              <p>
                Medilu es una plataforma de software para reservar turnos y para
                que profesionales y clínicas gestionen su agenda e historias clínicas.
              </p>
              <p>
                <strong>Medilu no presta servicios médicos</strong>: la atención,
                los diagnósticos, los tratamientos y los certificados son
                responsabilidad exclusiva del profesional que los realiza.{" "}
                <strong>
                  No es un servicio de emergencias: ante una urgencia llamá al 107 o al
                  911.
                </strong>
              </p>
            </>
          ),
        },
        {
          title: "2. Cuentas",
          body: (
            <ul>
              <li>Los datos que cargues tienen que ser verdaderos y estar actualizados.</li>
              <li>Tu contraseña es personal: no la compartas. Si sospechás un uso indebido, avisanos.</li>
              <li>
                Si el paciente es menor de 18 años, la cuenta debe crearla su madre,
                padre o representante legal.
              </li>
            </ul>
          ),
        },
        {
          title: "3. Turnos (pacientes)",
          body: (
            <ul>
              <li>Reservar un turno en Medilu es gratuito.</li>
              <li>
                La disponibilidad la define cada profesional. El turno queda confirmado
                cuando ves el mensaje de éxito en pantalla; además te enviamos el
                detalle por email.
              </li>
              <li>
                Podés cancelarlo desde «Mis turnos» o con el enlace del email. Si no vas
                a asistir, cancelalo para liberar el horario.
              </li>
              <li>
                El precio de la consulta, la cobertura y las condiciones de atención las
                fija y cobra el profesional o la clínica, no Medilu.
              </li>
            </ul>
          ),
        },
        {
          title: "4. Planes para profesionales y clínicas",
          body: (
            <ul>
              <li>
                Los planes, sus precios y lo que incluye cada uno se publican en{" "}
                <Link to="/planes" className={LINK}>
                  Planes
                </Link>
                . El precio es mensual y no cambia durante el período ya pagado.
              </li>
              <li>
                Las clínicas nuevas tienen 14 días de prueba sin costo y sin medio de
                pago. Para el paciente el servicio es siempre gratuito.
              </li>
              <li>
                Si al terminar la prueba o el período pago no se contrata o renueva un
                plan, la clínica queda en modo solo lectura: podés ver y exportar todos tus
                datos, pero no cargar datos nuevos ni recibir turnos online. Exportar las
                historias clínicas nunca depende del plan.
              </li>
              <li>
                El plan se contrata desde el panel de la clínica y se paga con Mercado
                Pago mediante débito automático, que se renueva en cada período (mensual o
                anual) hasta que lo des de baja. También podés contratar por WhatsApp o
                email; en ese caso te enviamos la confirmación por escrito.
              </li>
              <li>
                Si cambiás de plan con el mismo período de pago, el cambio rige en el acto
                y el nuevo precio se cobra desde el débito siguiente.
              </li>
              <li>
                Si actualizamos el precio de tu plan, te avisamos por email con al menos 30
                días de anticipación. Hasta esa fecha se te cobra el precio anterior, y si no
                estás de acuerdo podés dar de baja la renovación antes, sin costo.
              </li>
              <li>
                Si un débito no se puede cobrar, tenés 5 días de gracia para pagar desde el
                panel con otro medio; después la clínica queda en solo lectura hasta que se
                pague.
              </li>
              <li>
                Podés arrepentirte dentro de los 10 días corridos y dar de baja el plan
                cuando quieras, por el mismo medio por el que contrataste o con el{" "}
                <Link to="/arrepentimiento" className={LINK}>
                  Botón de arrepentimiento
                </Link>{" "}
                y el{" "}
                <Link to="/baja" className={LINK}>
                  Botón de baja de servicio
                </Link>
                . Las condiciones están en la{" "}
                <Link to="/reembolsos" className={LINK}>
                  Política de reembolsos
                </Link>
                .
              </li>
              <li>
                El profesional declara tener matrícula vigente, es responsable de la
                información clínica que registra, del secreto profesional y de informar
                a sus pacientes sobre el tratamiento de sus datos.
              </li>
            </ul>
          ),
        },
        {
          title: "5. Uso aceptable",
          body: (
            <p>
              No podés usar el servicio para fines ilegales, cargar datos de terceros
              sin autorización, reservar turnos falsos, intentar acceder a cuentas o
              datos ajenos ni afectar el funcionamiento del sitio. Si eso ocurre,
              podemos suspender la cuenta, previo aviso salvo que la gravedad del caso
              exija actuar de inmediato.
            </p>
          ),
        },
        {
          title: "6. Propiedad intelectual",
          body: (
            <>
              <p>
                El software, la marca Medilu y su logo son de su titular. Los datos
                y archivos que cargás siguen siendo tuyos (o de tu paciente): solo los
                usamos para prestarte el servicio.
              </p>
              <p>
                El sitio usa íconos de{" "}
                <a href="https://lucide.dev/license" target="_blank" rel="noreferrer" className={LINK}>
                  Lucide
                  <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>{" "}
                (licencia ISC) y la tipografía Geist (SIL Open Font License), ambos de
                uso libre. No usamos fotografías de terceros.
              </p>
            </>
          ),
        },
        {
          title: "7. Disponibilidad y responsabilidad",
          body: (
            <>
              <p>
                Trabajamos para que el servicio funcione de forma continua, pero puede
                haber interrupciones por mantenimiento o por fallas de proveedores. Si
                una interrupción afecta un plan pago, podés pedir la compensación que
                corresponda según la{" "}
                <Link to="/reembolsos" className={LINK}>
                  Política de reembolsos
                </Link>
                .
              </p>
              <p>
                Respondemos por los daños que causemos conforme a la ley. No respondemos
                por los actos médicos de los profesionales ni por el uso que terceros
                hagan de tu contraseña si no la resguardaste.
              </p>
            </>
          ),
        },
        {
          title: "8. Cambios en estos términos",
          body: (
            <p>
              Si cambiamos estos términos publicamos la nueva versión con su fecha y, si
              tenés una cuenta o un plan, te avisamos por email antes de que entre en
              vigencia. Si no estás de acuerdo, podés dar de baja tu cuenta o tu plan
              sin costo.
            </p>
          ),
        },
        {
          title: "9. Ley aplicable y reclamos",
          body: (
            <>
              <p>
                Se aplican las leyes de la República Argentina. Si sos consumidor, son
                competentes los tribunales de tu domicilio.
              </p>
              <p>
                Antes de reclamar podés escribirnos y lo resolvemos. También podés
                hacer tu reclamo ante la autoridad de consumo:{" "}
                <a
                  href={DEFENSA_CONSUMIDOR_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={LINK}
                >
                  {DEFENSA_CONSUMIDOR_TEXTO}
                  <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
                .
              </p>
            </>
          ),
        },
      ]}
    />
  )
}
