// "Ver como" (Fase Z): el equipo de la plataforma (PLATAFORMA_ADMIN_EMAILS) puede ver
// el sistema como otro rol y/o especialidad sin tocar sus datos reales.
//
// Cómo funciona: la identidad real se guarda en req.session.vistaReal y
// req.session.user pasa a tener los valores simulados (role, rol, esAdmin, idRole...).
// Así todos los guards existentes (requireRole, requireClinicaAdmin, el layout del
// panel) se comportan como para ese rol sin tocarlos. La RLS de Supabase sigue usando
// el JWT real, así que nunca se gana acceso a datos que la cuenta no tenga.
//
// Reglas:
//   - Solo la plataforma. Si el email deja de estar en la lista, la vista se descarta.
//   - Admin solo si la cuenta real es admin de la clínica activa (no se escala).
//   - Profesional/Admin requieren cuenta real de profesional (fila en `profesional`).
//   - Paciente: una ficha de la clínica activa, en SOLO LECTURA (vistaSoloLectura).
//   - En los roles de staff las acciones son reales (el banner del cliente lo avisa).
//   - La especialidad simulada la devuelven las lecturas de área (areaEfectiva).

const { supabase } = require('../config/supabaseClient');
const planes = require('./planes');

const ROLES_VISTA = ['admin', 'profesional', 'recepcion', 'auditor', 'paciente'];

function vistaActiva(req) {
    return !!(req.session && req.session.vistaReal);
}

// Identidad real de la sesión (con o sin vista).
function usuarioReal(req) {
    return req.session && (req.session.vistaReal || req.session.user);
}

// Especialidad a usar para el área del profesional: la simulada o la real.
function areaEfectiva(req, areaReal) {
    const v = req.session && req.session.user && req.session.user.vista;
    return (v && v.especialidad) || areaReal;
}

function salirDeVista(req) {
    if (!vistaActiva(req)) return;
    req.session.user = req.session.vistaReal;
    delete req.session.vistaReal;
}

function errorVista(mensaje) {
    const e = new Error(mensaje);
    e.status = 400;
    return e;
}

// Entra (o cambia) de vista. Siempre parte de la identidad REAL.
async function entrarEnVista(req, { rol, especialidad = null, pacienteId = null, alcanceIdObraSocial = null }) {
    const real = usuarioReal(req);
    if (!real || !planes.esAdminPlataforma(real.email)) {
        const e = new Error('No autorizado para esta acción');
        e.status = 403;
        throw e;
    }
    if (!ROLES_VISTA.includes(rol)) throw errorVista('Rol inválido.');
    if (!real.clinicaId) throw errorVista('Elegí una clínica antes de usar "Ver como".');

    let nombreEspecialidad = null;
    if (especialidad) {
        const { data, error } = await supabase
            .from('especialidad')
            .select('nombre')
            .eq('nombre', especialidad)
            .maybeSingle();
        if (error) throw error;
        if (!data) throw errorVista('Esa especialidad no existe.');
        nombreEspecialidad = data.nombre;
    }

    const u = {
        ...real,
        rol: null,
        esAdmin: false,
        alcanceObraSocial: null,
        alcanceIdObraSocial: null,
        vista: { rol, especialidad: nombreEspecialidad, pacienteId: null, pacienteNombre: null },
    };

    if (rol === 'admin' || rol === 'profesional') {
        if (!real.idRole) throw errorVista('Tu cuenta no es de profesional: no puede verse como profesional.');
        if (rol === 'admin' && !real.esAdmin) throw errorVista('Solo podés verte como admin en una clínica donde lo seas.');
        u.role = 'profesional';
        u.rol = rol;
        u.esAdmin = rol === 'admin';
    } else if (rol === 'recepcion' || rol === 'auditor') {
        // Sin fila en `profesional`, como una cuenta real de recepción/auditoría.
        u.role = rol;
        u.idRole = null;
        u.rol = rol;
        u.vista.especialidad = null;
        if (rol === 'auditor' && alcanceIdObraSocial) {
            const { data, error } = await supabase
                .from('obra_social')
                .select('id, nombre')
                .eq('id', alcanceIdObraSocial)
                .maybeSingle();
            if (error) throw error;
            if (!data) throw errorVista('Esa obra social no existe.');
            u.alcanceIdObraSocial = data.id;
            u.alcanceObraSocial = data.nombre;
        }
    } else {
        // Paciente: una ficha de la clínica activa (la persona sigue siendo la real, así
        // la bitácora registra quién miró).
        if (!pacienteId) throw errorVista('Elegí qué paciente querés ver.');
        const { data, error } = await supabase
            .from('paciente')
            .select('id, persona:id_persona ( nombre, apellido, clinica_id )')
            .eq('id', pacienteId)
            .maybeSingle();
        if (error) throw error;
        if (!data || !data.persona || data.persona.clinica_id !== real.clinicaId) {
            throw errorVista('Ese paciente no es de tu clínica.');
        }
        u.role = 'paciente';
        u.idRole = data.id;
        u.vista.especialidad = null;
        u.vista.pacienteId = data.id;
        u.vista.pacienteNombre = [data.persona.nombre, data.persona.apellido].filter(Boolean).join(' ');
    }

    req.session.vistaReal = real;
    req.session.user = u;
    return u.vista;
}

// En la vista de paciente todo es solo lectura: no se reservan turnos, ni se editan
// datos, ni se suben estudios de un paciente real. Quedan las rutas para salir.
const RUTAS_LIBRES = ['/plataforma/vista', '/auth/logout', '/auth/select-perfil', '/auth/select-clinica'];

function vistaSoloLectura(req, res, next) {
    if (!vistaActiva(req)) return next();
    // La lista puede cambiar (env): sin permiso de plataforma, se vuelve a la cuenta real.
    if (!planes.esAdminPlataforma(req.session.vistaReal.email)) {
        salirDeVista(req);
        return next();
    }
    if (req.session.user.role !== 'paciente') return next();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const ruta = req.originalUrl.split('?')[0];
    if (RUTAS_LIBRES.includes(ruta)) return next();
    return res.status(403).json({
        error: 'Estás en modo "Ver como paciente": es solo lectura.',
        code: 'VISTA_SOLO_LECTURA',
    });
}

module.exports = {
    ROLES_VISTA,
    vistaActiva,
    usuarioReal,
    areaEfectiva,
    entrarEnVista,
    salirDeVista,
    vistaSoloLectura,
};
