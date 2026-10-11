import { Link } from "react-router-dom"
import { LegalArticle } from "@/components/site/LegalArticle"
import { AvisoDatosPersonales } from "@/components/form/Consentimiento"
import { AAIP_URL, CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site"

const LINK = "font-medium text-primary underline-offset-2 hover:underline"

export default function Privacidad() {
  return (
    <LegalArticle
      updated={LEGAL_UPDATED}
      title="Política de privacidad"
      intro={
        <p>
          En esta política te explicamos qué datos personales tratamos en Medilu,
          para qué, con quién los compartimos, cuánto tiempo los guardamos y cómo podés
          ejercer tus derechos, de acuerdo con la Ley 25.326 de Protección de los Datos
          Personales, su Decreto reglamentario 1558/2001 y la Ley 26.529 de Derechos del
          Paciente.
        </p>
      }
      sections={[
        {
          title: "1. Quién es responsable de tus datos",
          body: (
            <>
              <p>
                El responsable de los datos de las cuentas, de las reservas de turnos y de
                las solicitudes que se hacen desde este sitio es el titular de
                Medilu, cuyos datos figuran al pie de esta página.
              </p>
              <p>
                La <strong>historia clínica</strong> y demás información de salud que
                cargan los profesionales pertenece al paciente y es responsabilidad del
                profesional o la clínica que la registra (Ley 26.529). Respecto de esos
                datos, Medilu actúa como prestador del servicio de tratamiento por
                cuenta de la clínica (art. 25 de la Ley 25.326): los usa solo para
                prestar el servicio y no los aplica a otra finalidad.
              </p>
            </>
          ),
        },
        {
          title: "2. Qué datos tratamos",
          body: (
            <ul>
              <li>
                <strong>Si reservás un turno sin cuenta:</strong> nombre y apellido,
                email, teléfono (opcional), profesional, especialidad, fecha y hora del
                turno.
              </li>
              <li>
                <strong>Si creás una cuenta de paciente:</strong> DNI, nombre, apellido,
                sexo, fecha de nacimiento, teléfono, email, dirección (opcional) y
                cobertura médica (obra social o prepaga, número de afiliado y plan). La
                contraseña la gestiona nuestro proveedor de autenticación: nunca la
                vemos ni la guardamos en texto legible.
              </li>
              <li>
                <strong>Si sos profesional, recepción o auditor:</strong> nombre,
                apellido, DNI, teléfono, email, clínica y, en el caso de profesionales,
                matrícula y especialidad.
              </li>
              <li>
                <strong>Datos de salud:</strong> lo que registran los profesionales
                (historia clínica, diagnósticos, odontograma, certificados,
                autorizaciones) y los estudios que vos subas y decidas compartir.
              </li>
              <li>
                <strong>Registro de accesos:</strong> quién consultó tu historia
                clínica y cuándo. Podés verlo desde tu cuenta.
              </li>
              <li>
                <strong>Dictado por voz (solo profesionales):</strong> el audio se
                transcribe en un servidor propio y se procesa en memoria; no se guarda
                ni se envía a terceros.
              </li>
              <li>
                <strong>Solicitudes de arrepentimiento o baja:</strong> nombre, email y
                el detalle que escribas.
              </li>
              <li>
                <strong>Datos técnicos:</strong> una cookie de sesión y la dirección IP,
                que se usa de forma transitoria para limitar intentos abusivos. Ver la{" "}
                <Link to="/cookies" className={LINK}>
                  Política de cookies
                </Link>
                .
              </li>
            </ul>
          ),
        },
        {
          title: "3. Para qué los usamos",
          body: (
            <ul>
              <li>Gestionar tus turnos y enviarte la confirmación y el recordatorio por email.</li>
              <li>Crear y mantener tu cuenta, y permitirte consultar tu historia clínica, certificados y estudios.</li>
              <li>Permitir que los profesionales y la clínica que elegiste registren y consulten tu atención.</li>
              <li>Atender consultas, reclamos y solicitudes de arrepentimiento o baja.</li>
              <li>Proteger la seguridad del servicio y cumplir obligaciones legales.</li>
            </ul>
          ),
        },
        {
          title: "4. Base legal y datos sensibles",
          body: (
            <>
              <p>
                Tratamos tus datos con tu <strong>consentimiento libre, expreso e
                informado</strong>, que prestás al marcar la casilla de los formularios
                (arts. 5 y 7 de la Ley 25.326). Podés revocarlo en cualquier momento,
                sin efecto retroactivo.
              </p>
              <p>
                Los datos de salud son <strong>datos sensibles</strong>. Solo acceden
                a ellos los profesionales y el personal autorizado de la clínica que te
                atiende, sujetos al secreto profesional (art. 8 de la Ley 25.326 y Ley
                26.529). Nadie está obligado a proporcionar datos sensibles.
              </p>
            </>
          ),
        },
        {
          title: "5. Con quién los compartimos",
          body: (
            <>
              <p>
                <strong>No vendemos ni alquilamos tus datos</strong>, ni los usamos para
                publicidad. Solo los compartimos con:
              </p>
              <ul>
                <li>El profesional y la clínica con quienes reservás o te atendés.</li>
                <li>
                  Proveedores que nos prestan servicios técnicos y tratan los datos
                  solo por nuestra cuenta: Supabase Inc. (base de datos, autenticación y
                  almacenamiento de archivos), el proveedor de alojamiento del servidor
                  y el proveedor de envío de emails.
                </li>
                <li>
                  Si contratás un plan para tu clínica: Mercado Pago, que procesa el pago
                  y el débito automático. Le enviamos el email que indiques para pagar, el
                  plan y el monto; los datos de la tarjeta los cargás directamente en
                  Mercado Pago y nunca pasan por Medilu. A los pacientes no se les
                  cobra nada.
                </li>
                <li>Autoridades judiciales o administrativas, cuando la ley lo exija.</li>
              </ul>
            </>
          ),
        },
        {
          title: "6. Transferencia internacional",
          body: (
            <p>
              La base de datos y los archivos se alojan en servidores de Supabase
              ubicados en <strong>Estados Unidos</strong>. Como ese país no está
              reconocido como de protección adecuada, la transferencia se hace con tu
              consentimiento expreso (art. 12 de la Ley 25.326 y su reglamentación),
              que prestás al aceptar esta política en los formularios.
            </p>
          ),
        },
        {
          title: "7. Cuánto tiempo los guardamos",
          body: (
            <ul>
              <li>
                <strong>Historia clínica:</strong> como mínimo 10 años desde la última
                actuación registrada, porque así lo exige el art. 18 de la Ley 26.529.
                Durante ese plazo no puede eliminarse, aunque lo pidas.
              </li>
              <li>
                <strong>Cuenta:</strong> mientras esté activa. Si pedís la baja,
                suprimimos los datos que no estemos obligados a conservar.
              </li>
              <li>
                <strong>Turnos y solicitudes:</strong> el tiempo necesario para
                prestar el servicio y atender eventuales reclamos.
              </li>
            </ul>
          ),
        },
        {
          title: "8. Tus derechos",
          body: (
            <>
              <p>Como titular de los datos podés:</p>
              <ul>
                <li>
                  <strong>Acceder</strong> a ellos en forma gratuita cada seis meses
                  (antes, si acreditás un interés legítimo). Respondemos dentro de los
                  10 días corridos (art. 14 de la Ley 25.326).
                </li>
                <li>
                  <strong>Rectificarlos, actualizarlos o pedir su supresión.</strong>{" "}
                  Lo resolvemos dentro de los 5 días hábiles (art. 16), salvo los datos
                  que la ley obliga a conservar, como la historia clínica.
                </li>
                <li>
                  <strong>Revocar tu consentimiento</strong> en cualquier momento.
                </li>
              </ul>
              <p>
                Desde tu cuenta podés ver y editar tu perfil, descargar tu historia
                clínica y ver quién accedió a ella. Para el resto, escribinos a{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
                  {CONTACT_EMAIL}
                </a>{" "}
                desde el email de tu cuenta. Si no quedás conforme, podés reclamar ante
                la{" "}
                <a href={AAIP_URL} target="_blank" rel="noreferrer" className={LINK}>
                  Agencia de Acceso a la Información Pública
                  <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
                .
              </p>
            </>
          ),
        },
        {
          title: "9. Seguridad",
          body: (
            <p>
              Aplicamos medidas técnicas y organizativas para proteger tus datos: acceso
              solo con usuario y contraseña, separación de los datos de cada clínica a
              nivel de base de datos, registro de los accesos a la historia clínica y
              límites contra intentos abusivos. Ningún sistema es infalible: si
              detectamos un incidente que afecte tus datos, te lo vamos a informar.
            </p>
          ),
        },
        {
          title: "10. Menores de edad",
          body: (
            <p>
              Si el paciente es menor de 18 años, la cuenta debe crearla y usarla su
              madre, padre o representante legal, que presta el consentimiento en su
              nombre, sin perjuicio de los derechos que la ley reconoce a los
              adolescentes sobre el cuidado de su propia salud.
            </p>
          ),
        },
        {
          title: "11. Cambios en esta política",
          body: (
            <p>
              Si la modificamos, publicamos la nueva versión con su fecha. Si el cambio
              afecta cómo usamos tus datos, te lo vamos a avisar y, cuando corresponda,
              te pediremos un nuevo consentimiento.
            </p>
          ),
        },
        {
          title: "12. Aviso legal (Disposición 10/2008)",
          body: <AvisoDatosPersonales className="text-sm leading-relaxed" />,
        },
      ]}
    />
  )
}
