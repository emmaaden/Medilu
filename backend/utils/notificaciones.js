// Fase AB: notificaciones del panel (campana del navbar).
//
// Cada notificación es para UNA persona en UNA clínica (tabla notificacion, solo
// service_role). Se crean desde el backend cuando pasa algo que el staff no estaba
// mirando: un turno online nuevo o cancelado por el paciente, datos cargados desde
// el link (Fase AA)…
//
// Nunca rompen la operación principal: si fallan, solo queda en el log. Por eso las
// funciones de acá no tiran errores y se pueden llamar sin await.

const { supabase } = require('../config/supabaseClient');

const TZ = 'America/Argentina/Buenos_Aires';

function fechaTurno(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const fecha = d.toLocaleDateString('es-AR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
    const hora = d.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
    return `${fecha} ${hora} hs`;
}

// notificar({ clinicaId, idPersona, tipo, titulo, cuerpo?, url?, datos? })
async function notificar({ clinicaId, idPersona, tipo, titulo, cuerpo = null, url = null, datos = null }) {
    try {
        if (!clinicaId || !idPersona) return;
        const { error } = await supabase.from('notificacion').insert({
            clinica_id: clinicaId,
            id_persona: idPersona,
            tipo,
            titulo: String(titulo).slice(0, 200),
            cuerpo: cuerpo ? String(cuerpo).slice(0, 500) : null,
            url,
            datos,
        });
        if (error) throw error;
    } catch (err) {
        console.error(`[notificaciones] no se pudo crear "${tipo}":`, err.message || err);
    }
}

// Turno reservado online o cancelado por el paciente -> aviso al profesional del turno.
// `tipo`: 'turno_nuevo' | 'turno_cancelado'.
async function notificarTurno(idTurno, tipo) {
    try {
        const { data: t, error } = await supabase
            .from('turno')
            .select('id, clinica_id, inicio, paciente_nombre, profesional:id_profesional ( id_persona )')
            .eq('id', idTurno)
            .maybeSingle();
        if (error) throw error;
        if (!t || !t.profesional) return;

        const quien = t.paciente_nombre || 'Un paciente';
        const cuando = fechaTurno(t.inicio);
        await notificar({
            clinicaId: t.clinica_id,
            idPersona: t.profesional.id_persona,
            tipo,
            titulo: tipo === 'turno_nuevo' ? 'Nuevo turno online' : 'Turno cancelado',
            cuerpo: tipo === 'turno_nuevo'
                ? `${quien} reservó un turno para el ${cuando}.`
                : `${quien} canceló su turno del ${cuando}.`,
            url: '/dashboard/turnos',
            datos: { idTurno: t.id, inicio: t.inicio },
        });
    } catch (err) {
        console.error(`[notificaciones] no se pudo avisar el turno ${idTurno}:`, err.message || err);
    }
}

module.exports = { notificar, notificarTurno };
