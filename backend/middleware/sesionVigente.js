// Revalida la sesión del staff contra sus membresías (auditoría 2026-10-15, #7).
//
// req.session.user (clinicaId, rol, esAdmin, alcance) se fija en el login y vive hasta
// 24 h. Muchos controllers usan service_role y confían en esos datos, así que sin esto
// un miembro dado de baja seguía operando (p. ej. exportando todas las HC) hasta que
// vencía la cookie. En cada request de staff se comparan con las membresías activas:
//   - sin ninguna membresía activa, o sin la de la clínica de la sesión -> se cierra
//     la sesión (401, code SESION_REVOCADA);
//   - si cambió el rol o el alcance en la clínica activa -> se actualiza la sesión.
//
// Las membresías se cachean SESION_TTL_MS por persona para no consultar la base en
// cada request: un cambio tarda como mucho eso en aplicarse (el panel de
// administración invalida la caché de la persona tocada, así que en esa instancia es
// inmediato).

const { supabase } = require('../config/supabaseClient');
const { getMembresiasActivas, roleSinProfesional } = require('../utils/membresias');
const { usuarioReal, vistaActiva, salirDeVista } = require('../utils/vista');

const SESION_TTL_MS = 60 * 1000;
const ROLES_STAFF = ['profesional', 'recepcion', 'auditor'];

const cache = new Map(); // personaId -> { hasta, membresias }

async function membresiasCacheadas(personaId) {
    const hit = cache.get(personaId);
    if (hit && hit.hasta > Date.now()) return hit.membresias;
    const membresias = await getMembresiasActivas(supabase, personaId);
    cache.set(personaId, { hasta: Date.now() + SESION_TTL_MS, membresias });
    return membresias;
}

// Olvida las membresías cacheadas de una persona (después de cambiarlas).
function invalidarMembresias(personaId) {
    cache.delete(personaId);
}

function revocar(req, res) {
    req.session.destroy(() => {
        res.status(401).json({
            error: 'Tu acceso a la clínica cambió. Iniciá sesión de nuevo.',
            code: 'SESION_REVOCADA',
        });
    });
}

async function sesionVigente(req, res, next) {
    // Fase Z ("Ver como"): con una vista activa se valida la identidad REAL
    // (vistaReal) y se actualiza esa; session.user tiene los valores simulados.
    const u = req.session && req.session.isAuthenticated && usuarioReal(req);
    if (!u || !ROLES_STAFF.includes(u.role) || !u.personaId) return next();

    let membresias;
    try {
        membresias = await membresiasCacheadas(u.personaId);
    } catch (err) {
        console.error('[sesion] no se pudieron verificar las membresías:', err.message);
        return res.status(503).json({ error: 'No se pudo verificar tu sesión. Probá de nuevo en un momento.' });
    }

    if (membresias.length === 0) return revocar(req, res);
    if (!u.clinicaId) return next(); // todavía no eligió clínica: elige entre las vigentes

    const actual = membresias.find((m) => m.clinicaId === u.clinicaId);
    if (!actual) return revocar(req, res);

    if (
        actual.rol !== u.rol
        || actual.esAdmin !== !!u.esAdmin
        || (actual.alcanceIdObraSocial || null) !== (u.alcanceIdObraSocial || null)
        || (actual.alcanceObraSocial || null) !== (u.alcanceObraSocial || null)
    ) {
        u.rol = actual.rol;
        u.esAdmin = actual.esAdmin;
        u.alcanceObraSocial = actual.alcanceObraSocial;
        u.alcanceIdObraSocial = actual.alcanceIdObraSocial;
        // Sin fila en `profesional` el tipo de cuenta sale de la membresía (Fase E/J).
        if (!u.idRole) u.role = roleSinProfesional([actual]);
        // Una vista armada con el rol anterior (p. ej. admin) ya no vale: se vuelve a
        // la cuenta real.
        if (vistaActiva(req)) salirDeVista(req);
    }
    return next();
}

module.exports = { sesionVigente, invalidarMembresias };
