/**
 * Auditoría médica (Fase J): tipos y etiquetas compartidas entre el panel del
 * auditor (/dashboard/auditoria) y las observaciones que ve el profesional.
 */
import type { Diente } from "@/lib/odontograma"
import type { CodificacionRegistro } from "@/lib/catalogos"

export type EstadoAuditoria =
  | "pendiente"
  | "aprobado"
  | "observado"
  | "rechazado"
  | "respondido"

export type EstadoRevision = "aprobado" | "observado" | "rechazado"

export const ESTADO_AUDITORIA: Record<
  EstadoAuditoria,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  pendiente: { label: "Pendiente", variant: "outline" },
  aprobado: { label: "Aprobado", variant: "default" },
  observado: { label: "Observado", variant: "destructive" },
  rechazado: { label: "Rechazado", variant: "destructive" },
  respondido: { label: "Respondido", variant: "secondary" },
}

/** Ítems del checklist (mismas claves que CHECKLIST en auditoriaController). */
export const CHECKLIST_LABEL: Record<string, string> = {
  diagnostico: "Diagnóstico registrado",
  tratamiento: "Tratamiento registrado",
  coherencia: "Diagnóstico y tratamiento coherentes",
  codificacion: "Codificación (CIE-10 y prácticas) correcta",
  odontograma: "Odontograma completo (si aplica)",
  identificacion: "Fecha y profesional identificados",
}

export const ACCION_LABEL: Record<string, string> = {
  ver_hc: "Abrió la historia clínica",
  crear_registro: "Cargó un registro",
  registrar_paciente: "Registró un paciente",
  exportar_hc: "Exportó historias clínicas",
  importar_hc: "Importó historias clínicas",
  ver_registro_auditoria: "Abrió un registro para auditar",
  revisar: "Auditó un registro",
  responder: "Respondió una observación",
  solicitar_autorizacion: "Pidió una autorización previa",
  ver_autorizacion: "Abrió una autorización previa",
  resolver_autorizacion: "Resolvió una autorización previa",
  ver_adjunto_autorizacion: "Abrió un adjunto de autorización",
  editar_cobertura: "Actualizó la cobertura del paciente",
  codigo_vinculacion: "Pidió el código de vinculación",
  vincular_historia: "El paciente vinculó su historia a su cuenta",
}

export type Revision = {
  id: number
  estado: EstadoRevision
  checklist: Record<string, boolean>
  comentario: string
  auditor: string
  creadoEn: string
  respuesta: string | null
  respondidoEn: string | null
}

export type RegistroBandeja = {
  id: string
  fecha: string
  area: string
  profesional: string
  idProfesional: number | null
  diagnostico: string
  codigos?: string[]
  estado: EstadoAuditoria
  paciente: { id: number | null; nombre: string; dni: string; obraSocial: string }
}

export type DetalleRegistro = {
  registro: {
    id: string
    fecha: string
    area: string
    profesional: string
    sintomas: string
    diagnostico: string
    tratamiento: string
    estado: EstadoAuditoria
    dientes: Diente[]
  } & CodificacionRegistro
  paciente: {
    id: number
    nombre: string
    dni: string
    edad: number | null
    sexo: string
    obraSocial: string
    nroAfiliado?: string
    plan?: string
  }
  revisiones: Revision[]
  historial: {
    id: string
    fecha: string
    area: string
    profesional: string
    diagnostico: string
    tratamiento: string
    estado: EstadoAuditoria
  }[]
  checklist: string[]
}

export type Acceso = {
  id: number
  fecha: string
  actor: string
  rol: string
  accion: string
  paciente: string
  dni: string
  idRegistro: string | null
  detalle: Record<string, unknown> | null
  ip: string
}

export type Observacion = {
  registro: {
    id: string
    fecha: string
    area: string
    diagnostico: string
    tratamiento: string
    estado: EstadoAuditoria
  }
  paciente: { nombre: string; dni: string }
  revision: Revision
  pendienteRespuesta: boolean
}

export type Paginado = { total: number; page: number; pageSize: number }
