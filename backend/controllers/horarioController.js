// Agenda del profesional autenticado (horario_profesional).
// Fase 2c: opera con el cliente por-JWT (RLS por clinica_id a nivel Postgres).
// Fase U: cada horario es de una clínica (la activa de la sesión): un profesional que
// atiende en varias tiene una agenda por clínica, que no se pueden superponer.
const { getUserSupabase } = require('../middleware/userSupabase');
const { supabase } = require('../config/supabaseClient');
const { normalizarDia } = require('../utils/disponibilidad');

const ERR_SESION = { error: 'Tu sesión expiró. Iniciá sesión de nuevo.' };
const ERR_CLINICA = { error: 'Elegí una clínica para cargar tus horarios.' };

// Franja de OTRA clínica del profesional que se superpone con [inicio, fin) el mismo
// día, o null. Se mira con service_role: la RLS solo deja ver la clínica activa.
async function solapeEnOtraClinica(profId, clinicaId, dia, inicio, fin) {
    const { data, error } = await supabase
        .from('horario_profesional')
        .select('dia, horario_inicio, horario_fin, clinica:clinica_id ( nombre )')
        .eq('id_profesional', profId)
        .neq('clinica_id', clinicaId);
    if (error) throw error;
    const hhmm = (t) => String(t || '').slice(0, 5);
    return (data || []).find((h) =>
        normalizarDia(h.dia) === normalizarDia(dia)
        && hhmm(h.horario_inicio) < hhmm(fin)
        && hhmm(h.horario_fin) > hhmm(inicio)) || null;
}

function errorSolape(h) {
    const nombre = h.clinica?.nombre ? ` en ${h.clinica.nombre}` : ' en otra clínica';
    return {
        error: `Se superpone con tu horario del ${h.dia}${nombre} `
            + `(${String(h.horario_inicio).slice(0, 5)} a ${String(h.horario_fin).slice(0, 5)}).`,
    };
}

exports.saveHours = async (req, res) => {
    try {
        const { id, dia, startHour, endHour } = req.body;
        const user_id = req.session.user.idRole; // profesional.id
        const clinicaId = req.session.user.clinicaId;

        if (!id || !user_id || !dia || !startHour || !endHour) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }
        if (!clinicaId) return res.status(400).json(ERR_CLINICA);

        const solape = await solapeEnOtraClinica(user_id, clinicaId, dia, startHour, endHour);
        if (solape) return res.status(409).json(errorSolape(solape));

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { data, error } = await db
            .from('horario_profesional')
            .update({
                dia,
                horario_inicio: startHour,
                horario_fin: endHour
            })
            .eq('id', id)
            .eq('id_profesional', user_id)
            .eq('clinica_id', clinicaId)
            .select();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Horario no encontrado' });
        }

        res.status(200).json({
            success: true,
            message: 'Horario actualizado correctamente.',
            horario: data[0]
        });
    } catch (err) {
        console.error('Error al actualizar el horario:', err);
        res.status(500).json({ error: 'Error al actualizar el horario.' });
    }
};

exports.insertHours = async (req, res) => {
    try {
        const { dia, startHour, endHour } = req.body;
        const user_id = req.session.user.idRole; // profesional.id
        const clinicaId = req.session.user.clinicaId;

        if (!user_id || !dia || !startHour || !endHour) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }
        if (!clinicaId) return res.status(400).json(ERR_CLINICA);

        const solape = await solapeEnOtraClinica(user_id, clinicaId, dia, startHour, endHour);
        if (solape) return res.status(409).json(errorSolape(solape));

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { data, error } = await db
            .from('horario_profesional')
            .insert({
                id_profesional: user_id,
                clinica_id: clinicaId,
                dia,
                horario_inicio: startHour,
                horario_fin: endHour
            })
            .select();

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.status(201).json({
            success: true,
            message: 'Horario insertado correctamente.',
            horario: data[0]
        });
    } catch (err) {
        console.error('Error al insertar el horario:', err);
        res.status(500).json({ error: 'Error al insertar el horario.' });
    }
};

// Obtener horarios del profesional
exports.getHours = async (req, res) => {
    try {
        const user_id = req.session.user.idRole; // profesional.id
        if (!user_id) {
            return res.status(400).json({ error: "Falta el user_id" });
        }
        if (!req.session.user.clinicaId) return res.json([]); // sin clínica elegida no hay agenda

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { data, error } = await db
            .from("horario_profesional")
            .select("*")
            .eq("id_profesional", user_id)
            .eq("clinica_id", req.session.user.clinicaId);

        if (error) {
            console.error("Error obteniendo el horario del profesional:", error);
            return res.status(400).json({ error: error.message });
        }

        if (data.length === 0) {
            return res.json([]); // 🔹 Devuelve array vacío si no hay horarios
        }

        return res.json(data); // 🔹 Devuelve array directo
    } catch (err) {
        console.error("Error al obtener los horarios:", err);
        res.status(500).json({ error: "Error al obtener los horarios." });
    }
};

exports.deleteHours = async (req, res) => {
    try {
        const { id } = req.body;
        const user_id = req.session.user.idRole; // profesional.id
        if (!req.session.user.clinicaId) return res.status(400).json(ERR_CLINICA);

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { error } = await db
            .from('horario_profesional')
            .delete()
            .eq('id', id)
            .eq('id_profesional', user_id)
            .eq('clinica_id', req.session.user.clinicaId);

        if (error) {
            console.error("Error obteniendo el horario del profesional:", error);
            return res.status(400).json({ error: error.message });
        }

        return res.status(200).json({ success: true, message: 'Horario borrado con exito' });

    } catch (err) {
        console.error("Error al borrar el horario:", err);
        res.status(500).json({ error: "Error al borrar el horario." });
    }
};
