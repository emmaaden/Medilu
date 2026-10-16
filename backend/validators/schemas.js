// Schemas zod de validación de entrada, agrupados por área.
// Nota: los objetos zod ignoran (no rechazan) campos extra, así el frontend puede
// seguir enviando campos adicionales. La validación es un gate (no muta el request).

const { z } = require('zod');

// --- Piezas reutilizables ---
const dni = z.string().trim().min(1, 'DNI requerido').max(20, 'DNI demasiado largo');
const nombre = z.string().trim().min(1, 'Nombre requerido').max(120, 'Nombre demasiado largo');
const emailOpcional = z.union([z.email('Email inválido'), z.literal('')]).optional();
const textoOpcional = z.string().max(4000, 'Texto demasiado largo').optional();
const idFlexible = z.union([z.string().min(1), z.number()]);
// Query string: fecha 'YYYY-MM-DD' opcional y número de página (1..10000).
const fechaQuery = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (formato YYYY-MM-DD)').optional();
const paginaQuery = z.string().regex(/^\d{1,4}$/, 'Página inválida').optional();

// Fase K: cobertura (obra social del catálogo + afiliado + plan) y codificación.
const idCatalogo = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]);
const cobertura = {
    idObraSocial: idCatalogo.nullable().optional(),
    nroAfiliado: z.string().trim().max(40).optional(),
    plan: z.string().trim().max(60).optional(),
};
const codigoCie10 = z.string().trim().regex(/^[A-Z]\d{2}(\.\d{1,2})?$/, 'Código CIE-10 inválido');
const codificacion = {
    diagnosticos: z.array(z.object({
        codigo: codigoCie10,
        principal: z.boolean().optional(),
    })).max(10, 'Demasiados diagnósticos').optional(),
    practicas: z.array(z.object({
        idPractica: idCatalogo,
        pieza: z.string().trim().max(40).optional(),
        cantidad: z.number().int().min(1).max(99).optional(),
        idAutorizacion: idCatalogo.nullable().optional(),
    })).max(30, 'Demasiadas prácticas').optional(),
};

// Un hallazgo del odontograma. Permisivo a propósito: el backend hace clamp de
// `condicion`/`cara`/`estado` contra las listas válidas (ver pacienteController).
// Se acepta el `estado` legacy (sano/caries/tratado/falta) por compatibilidad.
const dienteSchema = z.object({
    numero: z.union([z.string(), z.number()]),
    condicion: z.string().max(40).optional(),
    cara: z.string().max(20).nullable().optional(),
    estado: z.string().max(20).optional(),
    notas: z.string().max(1000).optional(),
});

module.exports = {
    auth: {
        register: z.object({
            email: z.email('Email inválido'),
            password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
            dni,
            nombre,
            role: z.enum(['PACIENTE', 'PROFESIONAL', 'RECEPCION'], 'Rol inválido'),
            // Consentimiento expreso (Ley 25.326 arts. 5, 7 y 12): sin él no se crea la cuenta.
            aceptaTerminos: z.literal(true, 'Tenés que aceptar los Términos y la Política de privacidad'),
            versionLegal: z.string().trim().max(20).optional(),
            ...cobertura,
            // Fase 2: onboarding del profesional (una de las dos).
            nombreClinica: z.string().trim().max(120).optional(),
            activationCode: z.string().trim().max(40).optional(),
        }).refine(
            d => d.role !== 'PROFESIONAL'
                || (d.nombreClinica && d.nombreClinica.length > 0)
                || (d.activationCode && d.activationCode.length > 0),
            { message: 'Indicá el nombre de la clínica nueva o un código de activación', path: ['nombreClinica'] }
        ).refine(
            // Fase E: la recepción SOLO se une por código (no crea clínicas).
            d => d.role !== 'RECEPCION' || (d.activationCode && d.activationCode.length > 0),
            { message: 'La recepción se une con un código de activación', path: ['activationCode'] }
        ),
        login: z.object({
            email: z.email('Email inválido'),
            password: z.string().min(1, 'Contraseña requerida'),
            role: z.string().optional(),
        }),
        forgotPassword: z.object({
            email: z.email('Email inválido'),
        }),
        cambiarContrasena: z.object({
            actual: z.string().min(1, 'Ingresá tu contraseña actual').max(200),
            nueva: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(200),
        }),
        reenviarConfirmacion: z.object({
            email: z.email('Email inválido'),
        }),
        saveArea: z.object({
            especialidad: idFlexible,
        }),
        selectClinica: z.object({
            clinicaId: z.uuid('Clínica inválida'),
        }),
        unirseClinica: z.object({
            codigo: z.string().trim().min(1, 'Ingresá el código de activación').max(40),
        }),
        crearConsultorio: z.object({
            nombre: z.string().trim().min(2, 'Ingresá el nombre del consultorio').max(120),
        }),
        selectPerfil: z.object({
            perfil: z.enum(['staff', 'paciente'], 'Perfil inválido'),
        }),
    },

    admin: {
        actualizarMiembro: z.object({
            activo: z.boolean().optional(),
            rol: z.enum(['admin', 'profesional', 'recepcion', 'auditor']).optional(),
            // Fase J: alcance del auditor. null/'' = interno (toda la clínica).
            alcanceObraSocial: z.string().trim().max(120).nullable().optional(),
            // Fase K: alcance por obra social del catálogo (null = interno).
            alcanceIdObraSocial: idCatalogo.nullable().optional(),
        }),
        // Fase N: '' borra el dato (la descripción es opcional).
        actualizarClinica: z.object({
            direccion: z.string().trim().max(200),
            descripcion: z.string().trim().max(1000),
        }),
        // Fase N2: aparecer (o no) en la reserva pública de turnos.
        turnosOnline: z.object({ activo: z.boolean() }),
    },

    clinica: {
        // Fase E: el código puede apuntar a un rol (profesional | recepcion).
        // Fase J: o a 'auditor', con su alcance opcional por obra social.
        generarCodigo: z.object({
            rol: z.enum(['profesional', 'recepcion', 'auditor']).optional(),
            alcanceObraSocial: z.string().trim().max(120).nullable().optional(),
            alcanceIdObraSocial: idCatalogo.nullable().optional(),
        }),
    },

    // Fase E: gestión de turnos por el staff (recepción/profesional/admin).
    staff: {
        // Fase K: asistencia. 'reservado' deshace una marca equivocada.
        asistencia: z.object({
            estado: z.enum(['atendido', 'ausente', 'reservado'], 'Estado inválido'),
        }),
        crearTurno: z.object({
            profId: idFlexible,
            start: z.object({ dateTime: z.string().min(1, 'Fecha/hora de inicio requerida').max(40) }),
            end: z.object({ dateTime: z.string().min(1, 'Fecha/hora de fin requerida').max(40) }),
            nombre: z.string().trim().min(1, 'Nombre del paciente requerido').max(120),
            email: z.email('Email inválido'),
            telefono: z.union([z.string().max(30), z.number()]).optional(),
            dni: z.string().trim().max(20).optional(),
        }),
        reprogramar: z.object({
            start: z.object({ dateTime: z.string().min(1, 'Fecha/hora de inicio requerida').max(40) }),
            end: z.object({ dateTime: z.string().min(1, 'Fecha/hora de fin requerida').max(40) }),
        }),
        crearBloqueo: z.object({
            profId: idFlexible,
            inicio: z.string().min(1, 'Inicio requerido'),
            fin: z.string().min(1, 'Fin requerido'),
            motivo: z.string().max(200).optional(),
        }),
    },

    certificado: {
        generar: z.object({
            dni: z.string().trim().min(1, 'DNI requerido').max(20),
            motivo: z.string().max(2000).optional(),
            diagnostico: z.string().max(2000).optional(),
            indicaciones: z.string().max(2000).optional(),
            diasReposo: z.union([z.string(), z.number()]).optional(),
        }).refine(
            (d) => d.motivo || d.diagnostico || d.indicaciones ||
                   (d.diasReposo !== undefined && d.diasReposo !== '' && Number(d.diasReposo) > 0),
            { message: 'Completá al menos el motivo, el diagnóstico, las indicaciones o los días de reposo.' }
        ),
    },

    pacient: {
        regis: z.object({
            fullName: nombre,
            dni,
            email: emailOpcional,
            telefono: z.string().max(30).optional(),
            sexo: z.string().max(20).optional(),
            direccion: z.string().max(200).optional(),
            fechaNacimiento: z.string().max(40).optional(),
            obraSocial: z.string().max(100).optional(),
            ...cobertura,
            sintomas: textoOpcional,
            diagnostico: textoOpcional,
            tratamiento: textoOpcional,
            dientes: z.array(dienteSchema).optional(),
            ...codificacion,
        }),
        saveData: z.object({
            dni,
            sintomas: textoOpcional,
            diagnostico: textoOpcional,
            tratamiento: textoOpcional,
            dientes: z.array(dienteSchema).optional(),
            ...codificacion,
        }),
        // Fase K: el profesional actualiza la cobertura del paciente.
        cobertura: z.object({ dni, ...cobertura }),
        getData: z.object({
            dni,
        }),
        enviarAcceso: z.object({
            dni,
            email: emailOpcional,
        }),
        codigoVinculacion: z.object({
            dni,
            regenerar: z.boolean().optional(),
        }),
    },

    miCuenta: {
        updatePerfil: z.object({
            nombre: z.string().trim().max(120).optional(),
            apellido: z.string().trim().max(120).optional(),
            telefono: z.string().max(30).optional(),
            direccion: z.string().max(200).optional(),
            sexo: z.string().max(20).optional(),
            email: emailOpcional,
            fechaNacimiento: z.string().max(40).optional(),
            obraSocial: z.string().max(100).optional(),
            ...cobertura,
        }),
        vincularHistoria: z.object({
            codigo: z.string().trim().min(1, 'Ingresá el código').max(20, 'Código demasiado largo'),
        }),
    },

    profesional: {
        saveDesc: z.object({ descripcion: z.string().max(2000, 'Descripción demasiado larga') }),
        savePrecio: z.object({ precio: z.union([z.string().max(50), z.number()]) }),
        // Fase N3: aparecer (o no) en la reserva pública de turnos.
        saveTurnosOnline: z.object({ activo: z.boolean() }),
        saveDirec: z.object({ direccion: z.string().max(200, 'Dirección demasiado larga') }),
    },

    horario: {
        save: z.object({
            id: idFlexible,
            dia: z.string().min(1, 'Día requerido').max(20),
            startHour: z.string().min(1, 'Hora de inicio requerida').max(8),
            endHour: z.string().min(1, 'Hora de fin requerida').max(8),
        }),
        insert: z.object({
            dia: z.string().min(1, 'Día requerido').max(20),
            startHour: z.string().min(1, 'Hora de inicio requerida').max(8),
            endHour: z.string().min(1, 'Hora de fin requerida').max(8),
        }),
        delete: z.object({ id: idFlexible }),
    },

    calendar: {
        availableSlots: z.object({
            date: z.string()
                .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (formato YYYY-MM-DD)')
                .refine(v => !Number.isNaN(new Date(v).getTime()), 'Fecha inexistente'),
            profId: idFlexible,
            clinica: z.string().trim().max(60).optional(), // Fase U: slug de la clínica del turno
        }),
        createEvent: z.object({
            summary: z.string().min(1, 'Resumen requerido'),
            email: z.email('Email inválido'),
            // Teléfono opcional (minimización de datos): el email alcanza para confirmar
            // y gestionar el turno. Si viene, se guarda con su código de país.
            number: z.union([z.string().trim().max(30), z.number()]).optional(),
            numberCode: z.string().trim().regex(/^\+\d{1,4}$/, 'Código de país inválido').optional(),
            name: z.string().max(120).optional(),
            // Obligatorio para invitados (se exige en el handler: el paciente logueado ya
            // lo prestó al registrarse).
            aceptaTerminos: z.boolean().optional(),
            // El calendario se deriva del profesional en el server (no se confía en el
            // cliente). Se exige profId; calendarId queda como legacy y se ignora.
            profId: idFlexible,
            clinica: z.string().trim().max(60).optional(),
            calendarId: z.string().optional(),
            start: z.object({ dateTime: z.string().min(1, 'Fecha/hora de inicio requerida').max(40) }),
            end: z.object({ dateTime: z.string().min(1, 'Fecha/hora de fin requerida').max(40) }),
        }),
        // Nota: el buscador público por email y el borrado directo por eventId se
        // eliminaron en la Fase 3 (permitían enumerar/cancelar turnos ajenos). La
        // gestión segura vive en /api/turnos (ver turnosController).
    },

    // Fase J: auditoría médica (bandeja, revisiones, bitácora).
    auditoria: {
        listar: z.object({
            desde: fechaQuery,
            hasta: fechaQuery,
            idProfesional: z.string().regex(/^\d+$/, 'Profesional inválido').optional(),
            obraSocial: z.string().trim().max(120).optional(),
            idObraSocial: z.string().regex(/^\d+$/, 'Obra social inválida').optional(),
            cie10: z.string().trim().max(8).optional(),
            estado: z.enum(['pendiente', 'aprobado', 'observado', 'rechazado', 'respondido']).optional(),
            page: paginaQuery,
        }),
        revisar: z.object({
            estado: z.enum(['aprobado', 'observado', 'rechazado'], 'Estado inválido'),
            checklist: z.record(z.string().max(40), z.boolean()).optional(),
            comentario: z.string().trim().max(4000, 'Comentario demasiado largo').optional(),
        }).refine(
            d => d.estado === 'aprobado' || (d.comentario && d.comentario.length > 0),
            { message: 'Indicá el motivo de la observación o el rechazo', path: ['comentario'] }
        ),
        responder: z.object({
            respuesta: z.string().trim().min(1, 'Escribí una respuesta').max(4000, 'Respuesta demasiado larga'),
        }),
        bitacora: z.object({
            desde: fechaQuery,
            hasta: fechaQuery,
            accion: z.string().max(40).optional(),
            dni: z.string().trim().max(20).optional(),
            actor: z.string().trim().max(120).optional(),
            page: paginaQuery,
        }),
        resumen: z.object({
            desde: fechaQuery,
            hasta: fechaQuery,
        }),
        cruce: z.object({
            desde: fechaQuery,
            hasta: fechaQuery,
        }),
    },

    // Fase K: catálogos (obras sociales y prácticas de la clínica).
    catalogo: {
        obraSocial: z.object({
            nombre: z.string().trim().min(1, 'Nombre requerido').max(120),
            sigla: z.string().trim().max(30).optional(),
        }),
        obraSocialPatch: z.object({
            nombre: z.string().trim().min(1).max(120).optional(),
            sigla: z.string().trim().max(30).optional(),
            activo: z.boolean().optional(),
        }),
        practica: z.object({
            codigo: z.string().trim().min(1, 'Código requerido').max(30),
            descripcion: z.string().trim().min(1, 'Descripción requerida').max(200),
            requiereAutorizacion: z.boolean().optional(),
        }),
        practicaPatch: z.object({
            descripcion: z.string().trim().min(1).max(200).optional(),
            requiereAutorizacion: z.boolean().optional(),
            activo: z.boolean().optional(),
        }),
        importarPracticas: z.object({
            items: z.array(z.object({
                codigo: z.string().trim().min(1).max(30),
                descripcion: z.string().trim().min(1).max(200),
                requiereAutorizacion: z.boolean().optional(),
            })).min(1, 'El archivo no tiene prácticas').max(2000, 'Máximo 2000 prácticas por archivo'),
        }),
    },

    // Fase K: autorizaciones previas. La solicitud llega como multipart (campos texto).
    // Botón de arrepentimiento / botón de baja de servicio (Disp. SSDCyLC 954/2025):
    // sin registración previa, solo los datos mínimos para identificar la contratación.
    legal: {
        solicitudConsumo: z.object({
            tipo: z.enum(['arrepentimiento', 'baja'], 'Tipo de solicitud inválido'),
            nombre: z.string().trim().min(2, 'Ingresá tu nombre').max(120, 'Nombre demasiado largo'),
            email: z.email('Email inválido'),
            servicio: z.string().trim().max(120, 'Texto demasiado largo').optional(),
            detalle: z.string().trim().max(1000, 'Texto demasiado largo').optional(),
            // Fase M: el admin con sesión puede dar de baja el débito en el acto.
            cancelarDebito: z.boolean().optional(),
        }),
    },

    autorizacion: {
        solicitar: z.object({
            dni,
            idPractica: z.string().regex(/^\d+$/, 'Práctica inválida'),
            pieza: z.string().trim().max(40).optional(),
            cantidad: z.string().regex(/^\d{1,2}$/, 'Cantidad inválida').optional(),
            diagnosticoCie10: z.union([codigoCie10, z.literal('')]).optional(),
            fundamento: z.string().trim().min(1, 'Explicá el fundamento clínico').max(4000),
            adjuntarOdontograma: z.enum(['true', 'false']).optional(),
        }),
        resolver: z.object({
            estado: z.enum(['aprobada', 'rechazada'], 'Estado inválido'),
            motivo: z.string().trim().max(4000).optional(),
            venceEn: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'), z.literal('')]).optional(),
        }).refine(
            d => d.estado === 'aprobada' || (d.motivo && d.motivo.length > 0),
            { message: 'Indicá el motivo del rechazo', path: ['motivo'] }
        ),
        listar: z.object({
            estado: z.enum(['pendiente', 'aprobada', 'rechazada', 'cancelada']).optional(),
            page: paginaQuery,
        }),
    },
    // Fase M: contratación del plan de la clínica con Mercado Pago.
    pagos: {
        contratar: z.object({
            planId: z.string().trim().min(1).max(40),
            ciclo: z.enum(['mensual', 'anual'], 'Ciclo inválido'),
            profesionalesExtra: z.number().int().min(0).max(500).optional(),
            // Obligatorio solo si hay que pasar por el checkout (lo exige el servicio).
            payerEmail: z.email('Ingresá el email de tu cuenta de Mercado Pago').optional(),
        }),
    },

    // Fase L: panel de la plataforma (activación manual de planes y precios).
    plataforma: {
        suscripcion: z.object({
            planId: z.string().trim().min(1).max(40).optional(),
            estado: z.enum(['prueba', 'activa', 'vencida', 'cancelada'], 'Estado inválido').optional(),
            ciclo: z.enum(['mensual', 'anual'], 'Ciclo inválido').optional(),
            profesionalesExtra: z.number().int().min(0).max(500).optional(),
            // ISO (YYYY-MM-DD o fecha-hora). null = sin vencimiento.
            pruebaHasta: z.string().trim().max(40).nullable().optional(),
            periodoHasta: z.string().trim().max(40).nullable().optional(),
            notas: z.string().trim().max(2000).nullable().optional(),
        }),
        plan: z.object({
            nombre: z.string().trim().min(1).max(60).optional(),
            descripcion: z.string().trim().max(500).nullable().optional(),
            precioMensual: z.number().min(0).max(100000000).optional(),
            precioAnual: z.number().min(0).max(1000000000).optional(),
            profesionalesIncluidos: z.number().int().min(1).max(1000).optional(),
            precioProfesionalExtra: z.number().min(0).max(100000000).nullable().optional(),
            maxRecepcion: z.number().int().min(0).max(1000).nullable().optional(),
            features: z.array(z.string().trim().min(1).max(40)).max(50).optional(),
            destacado: z.boolean().optional(),
            activo: z.boolean().optional(),
        }),
        // Fase M2: llevar los débitos vigentes al precio actual del plan.
        aplicarPrecios: z.object({
            dias: z.number().int().min(30, 'El aviso tiene que ser de al menos 30 días').max(365),
        }),
    },
};
