// Turnos del lado paciente (Fase 3).
//
// La fuente de verdad del vínculo turno↔persona es la tabla `turno` en Supabase
// (ver db/fase3_turnos.sql). Google Calendar sigue siendo el motor del evento.
//
// Dos accesos:
//   - Paciente logueado: opera con getUserSupabase(req) (anon key + JWT), de modo
//     que la RLS `turno_paciente_select/update` lo limita a SUS turnos (id_paciente).
//     Fase O: además se filtra explícitamente por sus fichas (una por clínica): si la
//     cuenta también es staff, la RLS de staff le dejaría ver los de su clínica.
//   - Invitado: gestiona por token; acá se usa el service role (saltea RLS) y se
//     filtra por el hash del token. Nunca se listan turnos por email (anti-enumeración).

const { supabase } = require('../config/supabaseClient');
const { getUserSupabase } = require('../middleware/userSupabase');
const { hashToken } = require('../utils/turnoToken');
const { misPacienteIds } = require('../utils/fichasPaciente');

const ERR_SESION = { status: 401, body: { error: 'Tu sesión expiró. Iniciá sesión de nuevo.' } };

// Campos seguros que se devuelven al cliente (nunca el token ni ids internos).
const SELECT_PACIENTE =
    'id, inicio, fin, estado, profesional_nombre, especialidad, paciente_nombre';

// ---------------------------------------------------------------------------
// GET /api/turnos/mios  (paciente logueado)
// Lista los turnos del paciente, más próximos primero. Incluye reservados y
// cancelados para que tenga historial; el frontend separa próximos de pasados.
// ---------------------------------------------------------------------------
exports.misTurnos = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const { data, error } = await db
            .from('turno')
            .select(SELECT_PACIENTE)
            .in('id_paciente', await misPacienteIds(req.session.user))
            .order('inicio', { ascending: true });
        if (error) throw error;

        return res.json(data || []);
    } catch (err) {
        console.error('Error en mis-turnos:', err);
        return res.status(500).json({ error: 'Error al obtener tus turnos.' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/turnos/proximo  (paciente logueado)
// El próximo turno reservado a futuro, o null. Lo usa la tarjeta del Home.
// ---------------------------------------------------------------------------
exports.proximoTurno = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const { data, error } = await db
            .from('turno')
            .select(SELECT_PACIENTE)
            .in('id_paciente', await misPacienteIds(req.session.user))
            .eq('estado', 'reservado')
            .gte('inicio', new Date().toISOString())
            .order('inicio', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (error) throw error;

        return res.json({ turno: data || null });
    } catch (err) {
        console.error('Error en proximo-turno:', err);
        return res.status(500).json({ error: 'Error al obtener tu próximo turno.' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/turnos/:id/cancelar  (paciente logueado)
// Cancela un turno propio. La RLS garantiza que solo pueda tocar los suyos.
// ---------------------------------------------------------------------------
exports.cancelarPropio = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Turno inválido.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        // La RLS filtra a los turnos del paciente: si no es suyo, no aparece.
        const { data: turno, error } = await db
            .from('turno')
            .select('id, estado')
            .eq('id', id)
            .in('id_paciente', await misPacienteIds(req.session.user))
            .maybeSingle();
        if (error) throw error;
        if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });
        if (turno.estado === 'cancelado') {
            return res.json({ message: 'El turno ya estaba cancelado.' });
        }
        // Fase K: un turno ya atendido (o marcado ausente) no se cancela.
        if (turno.estado !== 'reservado') {
            return res.status(409).json({ error: 'Este turno ya pasó: no se puede cancelar.' });
        }

        const { error: updError } = await db
            .from('turno')
            .update({ estado: 'cancelado' })
            .eq('id', id);
        if (updError) throw updError;

        return res.json({ message: 'Turno cancelado.' });
    } catch (err) {
        console.error('Error cancelando turno propio:', err);
        return res.status(500).json({ error: 'Error al cancelar el turno.' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/turnos/gestionar?token=...  (invitado, público)
// Devuelve el turno asociado al token. No revela nada si el token no existe.
// ---------------------------------------------------------------------------
exports.gestionarPorToken = async (req, res) => {
    try {
        const token = req.query.token && String(req.query.token).trim();
        if (!token) return res.status(400).json({ error: 'Falta el enlace de gestión.' });

        const { data: turno, error } = await supabase
            .from('turno')
            .select(SELECT_PACIENTE)
            .eq('manage_token_hash', hashToken(token))
            .maybeSingle();
        if (error) throw error;
        if (!turno) return res.status(404).json({ error: 'Enlace inválido o vencido.' });

        return res.json({ turno });
    } catch (err) {
        console.error('Error en gestionar-por-token:', err);
        return res.status(500).json({ error: 'Error al obtener el turno.' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/turnos/gestionar/cancelar  { token }  (invitado, público)
// Cancela el turno asociado al token.
// ---------------------------------------------------------------------------
exports.cancelarPorToken = async (req, res) => {
    try {
        const token = req.body.token && String(req.body.token).trim();
        if (!token) return res.status(400).json({ error: 'Falta el enlace de gestión.' });

        const { data: turno, error } = await supabase
            .from('turno')
            .select('id, estado')
            .eq('manage_token_hash', hashToken(token))
            .maybeSingle();
        if (error) throw error;
        if (!turno) return res.status(404).json({ error: 'Enlace inválido o vencido.' });
        if (turno.estado === 'cancelado') {
            return res.json({ message: 'El turno ya estaba cancelado.' });
        }
        // Fase K: un turno ya atendido (o marcado ausente) no se cancela.
        if (turno.estado !== 'reservado') {
            return res.status(409).json({ error: 'Este turno ya pasó: no se puede cancelar.' });
        }

        const { error: updError } = await supabase
            .from('turno')
            .update({ estado: 'cancelado' })
            .eq('id', turno.id);
        if (updError) throw updError;

        return res.json({ message: 'Turno cancelado.' });
    } catch (err) {
        console.error('Error cancelando turno por token:', err);
        return res.status(500).json({ error: 'Error al cancelar el turno.' });
    }
};
