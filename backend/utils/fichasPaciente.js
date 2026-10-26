// Fichas de paciente de una cuenta (Fase O).
//
// `persona` es por clínica: una misma cuenta de Auth (persona.id_auth) puede tener una
// ficha de paciente en cada clínica donde la atendieron, más la del autoregistro (sin
// clínica). La cuenta de un profesional/recepción también puede tener fichas de
// paciente en otras clínicas. Todo lo del paciente (mi historia, mis turnos, estudios,
// certificados) se arma con TODAS sus fichas.
//
// Usa el cliente service_role filtrando por el id de Auth de la sesión.

const { supabase } = require('../config/supabaseClient');

const SELECT_FICHA =
    'id, clinica_id, nombre, apellido, dni, telefono, direccion, sexo, fecha_nacimiento, email, ' +
    'clinica(nombre), paciente(id, obra_social, id_obra_social, nro_afiliado, plan)';

// Fichas de paciente de la cuenta, la "principal" primero: la del autoregistro (sin
// clínica) o, si no hay, la más vieja. Cada una: { persona, paciente, clinicaId, clinica }.
async function fichasPaciente(authId) {
    if (!authId) return [];
    const { data, error } = await supabase
        .from('persona')
        .select(SELECT_FICHA)
        .eq('id_auth', authId);
    if (error) throw error;
    return (data || [])
        .filter((p) => p.paciente && p.paciente[0])
        .map((p) => ({
            persona: p,
            paciente: p.paciente[0],
            clinicaId: p.clinica_id || null,
            clinica: (p.clinica && p.clinica.nombre) || null,
        }))
        .sort((a, b) => {
            if ((a.clinicaId === null) !== (b.clinicaId === null)) return a.clinicaId === null ? -1 : 1;
            return a.paciente.id - b.paciente.id;
        });
}

// Fichas del paciente de la SESIÓN. Con "Ver como paciente" (Fase Z, utils/vista) la
// sesión apunta a una sola ficha elegida por la plataforma, no a la cuenta de Auth.
async function fichasDeSesion(user) {
    const pacienteId = user && user.vista && user.vista.pacienteId;
    if (!pacienteId) return fichasPaciente(user && user.id);
    const { data: pac, error: errPac } = await supabase
        .from('paciente')
        .select('id_persona')
        .eq('id', pacienteId)
        .maybeSingle();
    if (errPac) throw errPac;
    if (!pac) return [];
    const { data, error } = await supabase
        .from('persona')
        .select(SELECT_FICHA)
        .eq('id', pac.id_persona);
    if (error) throw error;
    return (data || [])
        .filter((p) => p.paciente && p.paciente[0])
        .map((p) => ({
            persona: p,
            paciente: p.paciente[0],
            clinicaId: p.clinica_id || null,
            clinica: (p.clinica && p.clinica.nombre) || null,
        }));
}

// ids de paciente de la sesión (para filtrar turnos, estudios, certificados, etc.).
async function misPacienteIds(user) {
    return (await fichasDeSesion(user)).map((f) => f.paciente.id);
}

module.exports = { fichasPaciente, fichasDeSesion, misPacienteIds };
