// Disponibilidad de turnos (Fase F): fuente ÚNICA = la base, sin Google Calendar.
//
// Un horario está disponible si cae dentro del `horario_profesional` del día y NO
// se solapa con un `turno` reservado ni con un `bloqueo_horario` del profesional.
// Todo se consulta con el cliente service_role (estas funciones también sirven al
// endpoint público de reserva, que no tiene sesión).

const { supabase } = require('../config/supabaseClient');

// Argentina es UTC-3 (sin horario de verano): offset fijo.
const AR_OFFSET = '-03:00';
const SLOT_MINUTOS = 30;

// Fin efectivo de un turno: su `fin`, o inicio + 30' si no lo tiene (histórico/invitado).
function finEfectivo(inicioISO, finISO) {
    if (finISO) return new Date(finISO);
    return new Date(new Date(inicioISO).getTime() + SLOT_MINUTOS * 60000);
}

// Intervalos [inicio, fin) ocupados de un profesional en una fecha (YYYY-MM-DD):
// turnos no cancelados (reservados, atendidos o ausentes) + bloqueos del día.
async function intervalosOcupadosDia(profId, dateStr) {
    const dayStart = new Date(`${dateStr}T00:00:00${AR_OFFSET}`);
    const dayEnd = new Date(`${dateStr}T23:59:59${AR_OFFSET}`);

    const [turnosRes, bloqueosRes] = await Promise.all([
        supabase
            .from('turno')
            .select('inicio, fin')
            .eq('id_profesional', profId)
            .neq('estado', 'cancelado')
            .gte('inicio', dayStart.toISOString())
            .lte('inicio', dayEnd.toISOString()),
        supabase
            .from('bloqueo_horario')
            .select('inicio, fin')
            .eq('id_profesional', profId)
            .lte('inicio', dayEnd.toISOString())
            .gte('fin', dayStart.toISOString()),
    ]);

    const intervalos = [];
    for (const t of turnosRes.data || []) {
        intervalos.push([new Date(t.inicio), finEfectivo(t.inicio, t.fin)]);
    }
    for (const b of bloqueosRes.data || []) {
        intervalos.push([new Date(b.inicio), new Date(b.fin)]);
    }
    return intervalos;
}

// Normaliza un nombre de día (minúsculas, sin acentos) para comparar.
function normalizarDia(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Fecha (YYYY-MM-DD) en Argentina de un instante.
function fechaAR(fecha) {
    return new Date(fecha.getTime() - 3 * 3600000).toISOString().slice(0, 10);
}

// Franjas de atención (`horario_profesional`) que corresponden al día de la semana de
// una fecha YYYY-MM-DD.
function franjasDeFecha(horarios, dateStr) {
    const diaSemana = normalizarDia(
        new Date(`${dateStr}T12:00:00${AR_OFFSET}`)
            .toLocaleDateString('es-AR', { weekday: 'long', timeZone: 'America/Argentina/Buenos_Aires' })
    );
    return (horarios || []).filter(h => normalizarDia(h.dia) === diaSemana);
}

// Inicio de cada slot de 30' que entra en las franjas de una fecha (libres o no).
function iniciosDeSlots(dateStr, franjas) {
    const inicios = [];
    for (const franja of franjas || []) {
        let actual = new Date(`${dateStr}T${franja.horario_inicio}${AR_OFFSET}`);
        const fin = new Date(`${dateStr}T${franja.horario_fin}${AR_OFFSET}`);
        while (actual < fin) {
            inicios.push(actual);
            actual = new Date(actual.getTime() + SLOT_MINUTOS * 60000);
        }
    }
    return inicios;
}

// Genera las franjas de 30' disponibles de un profesional para una fecha, dadas sus
// franjas de atención de ese día (`franjas` = [{ horario_inicio, horario_fin }]).
// Devuelve un array de ISO strings (inicio de cada slot libre y futuro).
async function slotsDisponibles(profId, dateStr, franjas) {
    if (!franjas || franjas.length === 0) return [];
    const ocupados = await intervalosOcupadosDia(profId, dateStr);
    const ahora = new Date();
    const slots = [];

    for (const actual of iniciosDeSlots(dateStr, franjas)) {
        const slotFin = new Date(actual.getTime() + SLOT_MINUTOS * 60000);
        const ocupado = ocupados.some(([s, e]) => s < slotFin && e > actual);
        if (!ocupado && actual > ahora) slots.push(actual.toISOString());
    }
    return slots;
}

// Valida el horario pedido para un turno ANTES de mirar si está libre: fechas válidas,
// 30' exactos, en el futuro y en uno de los slots del horario de atención (los mismos
// que ofrece /available-slots). Devuelve null si está bien o { status: 400, error }.
// Lo usan la reserva pública y el staff: ninguno de los dos ofrece hoy horarios
// fuera de la atención ni en el pasado.
// Fase U: los horarios son por clínica; `clinicaId` es la clínica del turno.
async function validarHorarioTurno(profId, inicioISO, finISO, clinicaId) {
    const inicio = new Date(inicioISO);
    const fin = new Date(finISO);
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
        return { status: 400, error: 'La fecha u hora del turno no es válida.' };
    }
    if (fin.getTime() - inicio.getTime() !== SLOT_MINUTOS * 60000) {
        return { status: 400, error: `El turno tiene que durar ${SLOT_MINUTOS} minutos.` };
    }
    if (inicio <= new Date()) {
        return { status: 400, error: 'Ese horario ya pasó. Elegí uno futuro.' };
    }

    const horarios = await horariosDeProfesional(profId, clinicaId);
    const dateStr = fechaAR(inicio);
    const enHorario = iniciosDeSlots(dateStr, franjasDeFecha(horarios, dateStr))
        .some(s => s.getTime() === inicio.getTime());
    if (!enHorario) {
        return { status: 400, error: 'Ese horario está fuera de la atención del profesional.' };
    }
    return null;
}

// Franjas de atención de un profesional en una clínica (Fase U: cada horario es de
// una clínica; sin clínica no hay a qué horarios atenerse).
async function horariosDeProfesional(profId, clinicaId) {
    if (!clinicaId) return [];
    const { data, error } = await supabase
        .from('horario_profesional')
        .select('dia, horario_inicio, horario_fin')
        .eq('id_profesional', profId)
        .eq('clinica_id', clinicaId);
    if (error) throw error;
    return data || [];
}

// ¿El error de Postgres es la restricción de exclusión de turnos (Fase Q)?
function esSolapeTurno(err) {
    return err?.code === '23P01';
}

// ¿El intervalo [inicioISO, finISO) está libre para el profesional?
// Considera turnos reservados (excepto `excluirTurnoId`, útil al reprogramar) y bloqueos.
async function estaLibre(profId, inicioISO, finISO, excluirTurnoId = null) {
    const s = new Date(inicioISO);
    const e = new Date(finISO);

    const { data: turnos } = await supabase
        .from('turno')
        .select('id, inicio, fin')
        .eq('id_profesional', profId)
        .neq('estado', 'cancelado')
        .lt('inicio', e.toISOString());
    for (const t of turnos || []) {
        if (excluirTurnoId != null && Number(t.id) === Number(excluirTurnoId)) continue;
        if (new Date(t.inicio) < e && finEfectivo(t.inicio, t.fin) > s) return false;
    }

    const { data: bloqueos } = await supabase
        .from('bloqueo_horario')
        .select('inicio, fin')
        .eq('id_profesional', profId)
        .lt('inicio', e.toISOString());
    for (const b of bloqueos || []) {
        if (new Date(b.inicio) < e && new Date(b.fin) > s) return false;
    }

    return true;
}

module.exports = {
    SLOT_MINUTOS, normalizarDia, franjasDeFecha, slotsDisponibles, validarHorarioTurno,
    estaLibre, esSolapeTurno, intervalosOcupadosDia, horariosDeProfesional,
};
