// Helper de membresías (Fase A: multi-clínica).
// Una membresía = pertenencia de una persona a una clínica con un rol
// (admin | profesional | recepcion | auditor). La "clínica activa" de la sesión se elige
// entre las membresías ACTIVAS del usuario.

// Devuelve las membresías activas de una persona, con datos de la clínica.
// `db` es un cliente Supabase (service_role para login/sistema; por-JWT si aplica).
const COLS_BASE = 'clinica_id, rol, clinica:clinica_id ( id, nombre, slug )';

function consultarMembresias(db, personaId, cols) {
    return db
        .from('membresia')
        .select(cols)
        .eq('id_persona', personaId)
        .eq('activo', true)
        .order('creada_en', { ascending: true });
}

async function getMembresiasActivas(db, personaId) {
    if (!personaId) return [];
    let { data, error } = await consultarMembresias(
        db, personaId,
        `${COLS_BASE}, alcance_obra_social, alcance_id_obra_social, os:alcance_id_obra_social ( nombre )`
    );
    // Base sin las migraciones de auditoría (faseJ/faseK): el login NO debe romperse por
    // eso; se leen las membresías sin el alcance.
    if (error && (error.code === '42703' || error.code === 'PGRST200' || /alcance_/.test(error.message || ''))) {
        console.warn('[membresias] faltan columnas de alcance: aplicá backend/db/faseJ_auditoria.sql y faseK_auditoria2.sql');
        ({ data, error } = await consultarMembresias(db, personaId, COLS_BASE));
    }
    if (error) throw error;
    return (data || []).map((m) => ({
        clinicaId: m.clinica_id,
        rol: m.rol,
        esAdmin: m.rol === 'admin',
        // Fase J/K: alcance del auditor (NULL = interno, toda la clínica). El nombre sale
        // del catálogo si está vinculado; si no, del texto legado.
        alcanceObraSocial: m.rol === 'auditor'
            ? ((Array.isArray(m.os) ? m.os[0] : m.os)?.nombre || m.alcance_obra_social || null)
            : null,
        alcanceIdObraSocial: m.rol === 'auditor' ? (m.alcance_id_obra_social || null) : null,
        nombre: m.clinica?.nombre ?? null,
        slug: m.clinica?.slug ?? null,
    }));
}

// Rol de SESIÓN (`req.session.user.role`) para una cuenta sin fila en `profesional`
// ni en `paciente`: su tipo lo define la membresía. Fase J: si es auditor en la clínica
// (o en todas, mientras no eligió una) es 'auditor'; si no, 'recepcion' (Fase E).
function roleSinProfesional(membresias) {
    if (!membresias || membresias.length === 0) return 'recepcion';
    return membresias.every((m) => m.rol === 'auditor') ? 'auditor' : 'recepcion';
}

// ¿Se le puede agregar la ficha de paciente a una persona de la clínica que no la tiene?
// Sí si no tiene cuenta (una ficha sin vincular) o si es del equipo de la clínica
// (membresía activa en ella). Una persona CON cuenta y SIN membresía no es del equipo:
// es lo que dejaba una persona "plantada" con el DNI de un paciente para quedarse con
// su HC (auditoría 2026-10-15, #2). `db` es un cliente service_role.
async function puedeSumarFicha(db, persona, clinicaId) {
    if (!persona.id_auth) return true;
    const { data, error } = await db
        .from('membresia')
        .select('id')
        .eq('id_persona', persona.id)
        .eq('clinica_id', clinicaId)
        .eq('activo', true)
        .limit(1);
    if (error) throw error;
    return !!(data && data.length);
}

// Fase U: los profesionales de una clínica salen de la MEMBRESÍA (activa, como admin o
// profesional), no de persona.clinica_id (que es solo la clínica de origen): un
// profesional puede atender en varias. `db` es un cliente service_role.
const ROLES_ATIENDEN = ['admin', 'profesional'];

async function profesionalIdsDeClinica(db, clinicaId) {
    const { data: mem, error: memErr } = await db
        .from('membresia')
        .select('id_persona')
        .eq('clinica_id', clinicaId)
        .eq('activo', true)
        .in('rol', ROLES_ATIENDEN);
    if (memErr) throw memErr;
    const personas = [...new Set((mem || []).map((m) => m.id_persona))];
    if (personas.length === 0) return [];
    const { data, error } = await db.from('profesional').select('id').in('id_persona', personas);
    if (error) throw error;
    return (data || []).map((p) => p.id);
}

// Clínicas donde atiende un profesional (membresía activa como admin o profesional).
async function clinicasDeProfesional(db, profId) {
    const { data: prof, error: profErr } = await db
        .from('profesional').select('id_persona').eq('id', profId).maybeSingle();
    if (profErr) throw profErr;
    if (!prof) return [];
    const { data, error } = await db
        .from('membresia')
        .select('clinica_id')
        .eq('id_persona', prof.id_persona)
        .eq('activo', true)
        .in('rol', ROLES_ATIENDEN);
    if (error) throw error;
    return (data || []).map((m) => m.clinica_id);
}

async function profesionalEnClinica(db, profId, clinicaId) {
    if (!profId || !clinicaId) return false;
    return (await clinicasDeProfesional(db, profId)).includes(clinicaId);
}

module.exports = {
    getMembresiasActivas, roleSinProfesional, puedeSumarFicha,
    profesionalIdsDeClinica, clinicasDeProfesional, profesionalEnClinica,
};
