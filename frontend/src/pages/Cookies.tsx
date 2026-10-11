import { Link } from "react-router-dom"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LegalArticle } from "@/components/site/LegalArticle"
import { LEGAL_UPDATED } from "@/lib/site"

const LINK = "font-medium text-primary underline-offset-2 hover:underline"

// Inventario REAL de lo que el sitio guarda en el navegador. Si agregás una cookie o
// una clave de almacenamiento (o un servicio de analítica), actualizá esta tabla y
// evaluá si pasa a hacer falta un aviso con consentimiento previo.
const ITEMS = [
  {
    nombre: "connect.sid",
    tipo: "Cookie propia",
    finalidad: "Mantener tu sesión iniciada. Solo se crea al iniciar sesión. No es accesible desde JavaScript.",
    duracion: "24 horas",
    categoria: "Necesaria",
  },
  {
    nombre: "sb-…-auth-token",
    tipo: "Almacenamiento local",
    finalidad: "Validar el enlace de recuperación de contraseña. Solo se usa en esa página.",
    duracion: "Hasta cerrar la sesión de recuperación",
    categoria: "Necesaria",
  },
  {
    nombre: "medilu-theme",
    tipo: "Almacenamiento local",
    finalidad: "Recordar si elegiste el tema claro u oscuro. Solo se guarda si lo cambiás.",
    duracion: "Hasta que lo borres",
    categoria: "Preferencia",
  },
]

export default function Cookies() {
  return (
    <LegalArticle
      updated={LEGAL_UPDATED}
      title="Política de cookies"
      intro={
        <p>
          Las cookies y el almacenamiento local son pequeños archivos que un sitio
          guarda en tu navegador. Acá te contamos exactamente cuáles usa Medilu.
        </p>
      }
      sections={[
        {
          title: "Resumen",
          body: (
            <p>
              <strong>No usamos cookies de analítica, de publicidad ni de redes
              sociales</strong>, y no cargamos contenido de terceros que las instale.
              Solo usamos lo indispensable para que el sitio funcione y para recordar
              tu preferencia de tema. Por eso no te pedimos que aceptes cookies.
            </p>
          ),
        },
        {
          title: "Qué guardamos",
          body: (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Nombre</TableHead>
                  <TableHead scope="col">Para qué</TableHead>
                  <TableHead scope="col">Duración</TableHead>
                  <TableHead scope="col">Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ITEMS.map((c) => (
                  <TableRow key={c.nombre}>
                    <TableCell className="align-top font-mono text-xs text-foreground">
                      {c.nombre}
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      {c.finalidad}
                      <span className="block text-xs">{c.tipo}</span>
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">{c.duracion}</TableCell>
                    <TableCell className="align-top">{c.categoria}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ),
        },
        {
          title: "Enlaces externos",
          body: (
            <p>
              Los botones de WhatsApp y los enlaces a sitios oficiales abren esos
              servicios en otra pestaña. A partir de ahí rigen sus propias políticas de
              privacidad y cookies.
            </p>
          ),
        },
        {
          title: "Cómo borrarlas o bloquearlas",
          body: (
            <p>
              Podés borrar o bloquear las cookies y el almacenamiento local desde la
              configuración de tu navegador. Si bloqueás la cookie de sesión no vas a
              poder iniciar sesión; el resto del sitio sigue funcionando. Para saber más
              sobre cómo tratamos tus datos, leé la{" "}
              <Link to="/privacidad" className={LINK}>
                Política de privacidad
              </Link>
              .
            </p>
          ),
        },
      ]}
    />
  )
}
