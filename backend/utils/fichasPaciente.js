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

// ids de paciente de la cuenta (para filtrar turnos, estudios, certificados, etc.).
async function misPacienteIds(authId) {
    return (await fichasPaciente(authId)).map((f) => f.paciente.id);
}

module.exports = { fichasPaciente, misPacienteIds };
