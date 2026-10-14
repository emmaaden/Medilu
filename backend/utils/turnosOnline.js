// Fase N2: qué clínicas NO reciben turnos online (reserva pública del paciente).
// Una clínica queda afuera si tiene la suscripción vencida/cancelada (Fase L) o si
// su admin apagó los turnos online (clinica.turnos_online = false). El staff sigue
// cargando turnos desde el panel en ambos casos.

const { supabase } = require('../config/supabaseClient');
const planes = require('./planes');

// Set de clinica_id que no reciben turnos online.
async function clinicasSinTurnosOnline() {
    const sinServicio = await planes.clinicasSinServicio();
    const { data, error } = await supabase
        .from('clinica')
        .select('id')
        .eq('turnos_online', false);
    if (error) throw error;
    const set = new Set(sinServicio);
    for (const c of data || []) set.add(c.id);
    return set;
}

// ¿La clínica apagó los turnos online? (No mira la suscripción.)
async function turnosOnlineApagados(clinicaId) {
    if (!clinicaId) return false;
    const { data, error } = await supabase
        .from('clinica')
        .select('turnos_online')
        .eq('id', clinicaId)
        .maybeSingle();
    if (error) throw error;
    return data ? data.turnos_online === false : false;
}

module.exports = { clinicasSinTurnosOnline, turnosOnlineApagados };
