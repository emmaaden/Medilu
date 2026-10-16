// Bitácora de accesos a la historia clínica (Fase J — tabla hc_acceso).
//
// Registra QUIÉN vio/cargó/exportó/auditó QUÉ historia clínica y CUÁNDO (trazabilidad
// de la HC, Ley 26.529). La tabla es append-only: la escribe solo el backend con el
// cliente service_role y un trigger impide UPDATE/DELETE.
//
// El actor, la clínica, la IP y el user-agent se toman SIEMPRE de la sesión/request,
// nunca del body. Si el registro falla NO se rompe el request (solo se loguea): la
// operación principal ya ocurrió y el error queda visible en los logs del servidor.

const { supabase } = require('../config/supabaseClient');

// Nombre del actor (snapshot). Se cachea en la sesión para no consultarlo cada vez.
async function nombreActor(req) {
    const u = req.session.user;
    if (u.nombreBitacora) return u.nombreBitacora;
    if (!u.personaId) return null;
    const { data } = await supabase
        .from('persona')
        .select('nombre, apellido')
        .eq('id', u.personaId)
        .maybeSingle();
    const nombre = data ? [data.nombre, data.apellido].filter(Boolean).join(' ') : null;
    u.nombreBitacora = nombre;
    return nombre;
}

// Snapshot de nombre y DNI del paciente (si el caller no lo trae).
async function snapshotPaciente(idPaciente) {
    const { data } = await supabase
        .from('paciente')
        .select('persona:id_persona ( nombre, apellido, dni )')
        .eq('id', idPaciente)
        .maybeSingle();
    const p = data && data.persona;
    if (!p) return { nombre: null, dni: null };
    return { nombre: [p.nombre, p.apellido].filter(Boolean).join(' '), dni: p.dni || null };
}

// registrarAcceso(req, { accion, idPaciente?, idRegistro?, paciente?: {nombre, dni}, detalle?, clinicaId? })
// `clinicaId` es para cuando la acción es de una clínica distinta de la de la sesión
// (Fase V: el paciente vincula una ficha de una clínica; se registra en ESA clínica
// para que la vea en su auditoría). Lo pone el backend, nunca el body.
async function registrarAcceso(req, { accion, idPaciente = null, idRegistro = null, paciente = null, detalle = null, clinicaId }) {
    try {
        const u = req.session && req.session.user;
        if (!u) return;

        let snap = paciente;
        if (!snap && idPaciente) snap = await snapshotPaciente(idPaciente);

        const { error } = await supabase.from('hc_acceso').insert({
            clinica_id: (clinicaId !== undefined ? clinicaId : u.clinicaId) || null,
            id_persona_actor: u.personaId || null,
            actor_nombre: await nombreActor(req),
            actor_rol: u.rol || u.role || null,
            accion,
            id_paciente: idPaciente,
            paciente_nombre: snap ? snap.nombre : null,
            paciente_dni: snap ? snap.dni : null,
            id_registro: idRegistro,
            detalle,
            ip: req.ip || null,
            user_agent: (req.get('user-agent') || '').slice(0, 300) || null,
        });
        if (error) throw error;
    } catch (err) {
        console.error(`[bitácora] no se pudo registrar "${accion}":`, err.message || err);
    }
}

module.exports = { registrarAcceso, nombreActor };
