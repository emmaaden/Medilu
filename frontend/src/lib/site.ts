/** Constantes compartidas del sitio público. */

export const WHATSAPP_NUMBER = "2615930274"
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`
export const CONTACT_EMAIL = "emma26228@gmail.com"

/**
 * Datos del titular del sitio (Ley 24.240 art. 4 y Ley 25.326: el usuario tiene
 * que poder identificar a quién le contrata y quién trata sus datos).
 *
 * ⚠️ `cuit` y `domicilio` están vacíos a propósito: no se pueden inventar. Completalos
 * antes de publicar. Mientras estén vacíos, el sitio muestra «a informar» en lugar
 * del dato (nunca un valor falso).
 */
export const BUSINESS = {
  /** Nombre comercial del servicio. */
  marca: "Medilu",
  /** Titular / responsable (persona humana o razón social). */
  titular: "Emmanuel Denis",
  /** CUIT del titular. Formato 20-12345678-9. */
  cuit: "",
  /** Domicilio legal/fiscal completo (calle, número, localidad, provincia). */
  domicilio: "",
  /** Jurisdicción para reclamos y competencia (provincia del domicilio). */
  provincia: "Mendoza",
  email: CONTACT_EMAIL,
  telefono: "+54 9 261 593-0274",
} as const

/** Texto a mostrar cuando un dato del titular todavía no se cargó. */
export function datoNegocio(valor: string) {
  return valor.trim() || "a informar"
}

/**
 * Versión vigente de los textos legales. Se guarda junto al consentimiento del
 * usuario (para poder probar qué versión aceptó). Cambiala al modificar Términos o
 * Privacidad, junto con LEGAL_UPDATED.
 */
export const LEGAL_VERSION = "2026-10-06"
export const LEGAL_UPDATED = "6 de octubre de 2026"

/**
 * Formulario oficial de reclamos de consumo. La Res. SCI 274/2021 que obligaba a
 * publicarlo fue derogada por la Disp. 890/2025, pero se mantiene como buena práctica
 * (informar al consumidor dónde reclamar, Ley 24.240).
 */
export const DEFENSA_CONSUMIDOR_URL =
  "https://www.argentina.gob.ar/produccion/defensadelconsumidor/formulario"
export const DEFENSA_CONSUMIDOR_TEXTO =
  "Defensa de las y los Consumidores. Para reclamos ingrese aquí"

/** Agencia de Acceso a la Información Pública: órgano de control de la Ley 25.326. */
export const AAIP_URL = "https://www.argentina.gob.ar/aaip/datospersonales"

/** Enlaces principales del navbar. */
export const NAV_LINKS = [
  { to: "/", label: "Inicio" },
  { to: "/turnos", label: "Turnos" },
  { to: "/planes", label: "Planes" },
] as const

/** Enlaces de ayuda / secundarios usados en footer y menú móvil. */
export const HELP_URL = `${WHATSAPP_URL}?text=${encodeURIComponent(
  "Hola, necesito ayuda con Medilu"
)}`
