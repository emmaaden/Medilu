// Fase AB: centro de notificaciones del panel. Cada usuario ve SOLO las suyas en la
// clínica activa: la persona y la clínica salen siempre de la sesión, nunca del body.
// Ver utils/notificaciones.js (quién las crea) y db/faseAB_notificaciones.sql.

const { supabase } = require('../config/supabaseClient');

const LIMITE = 30;

function destino(req) {
    const u = req.session.user;
    return { personaId: u.personaId || null, clinicaId: u.clinicaId || null };
}

async function contarNoLeidas(personaId, clinicaId) {
    const { count, error } = await supabase
        .from('notificacion')
        .select('id', { count: 'exact', head: true })
        .eq('id_persona', personaId)
        .eq('clinica_id', clinicaId)
        .is('leida_en', null);
    if (error) throw error;
    return count || 0;
}

// GET /notificaciones            -> { notificaciones: [...], noLeidas }
// GET /notificaciones?conteo=1   -> { noLeidas }  (lo que consulta la campana cada tanto)
exports.listar = async (req, res) => {
    try {
        const { personaId, clinicaId } = destino(req);
        if (!personaId || !clinicaId) return res.json({ notificaciones: [], noLeidas: 0 });

        if (req.query.conteo) return res.json({ noLeidas: await contarNoLeidas(personaId, clinicaId) });

        const [lista, noLeidas] = await Promise.all([
            supabase
                .from('notificacion')
                .select('id, tipo, titulo, cuerpo, url, datos, creado_en, leida_en')
                .eq('id_persona', personaId)
                .eq('clinica_id', clinicaId)
                .order('creado_en', { ascending: false })
                .limit(LIMITE),
            contarNoLeidas(personaId, clinicaId),
        ]);
        if (lista.error) throw lista.error;

        return res.json({
            notificaciones: (lista.data || []).map((n) => ({
                id: n.id,
                tipo: n.tipo,
                titulo: n.titulo,
                cuerpo: n.cuerpo || '',
                url: n.url || null,
                datos: n.datos || null,
                creadoEn: n.creado_en,
                leida: !!n.leida_en,
            })),
            noLeidas,
        });
    } catch (err) {
        console.error('Error listando notificaciones:', err);
        return res.status(500).json({ error: 'No se pudieron cargar las notificaciones.' });
    }
};

// POST /notificaciones/leer  { ids?: number[] }  -> sin ids, marca todas.
exports.marcarLeidas = async (req, res) => {
    try {
        const { personaId, clinicaId } = destino(req);
        if (!personaId || !clinicaId) return res.json({ noLeidas: 0 });

        let q = supabase
            .from('notificacion')
            .update({ leida_en: new Date().toISOString() })
            .eq('id_persona', personaId)
            .eq('clinica_id', clinicaId)
            .is('leida_en', null);
        if (Array.isArray(req.body.ids) && req.body.ids.length) q = q.in('id', req.body.ids.map(Number));
        const { error } = await q;
        if (error) throw error;

        return res.json({ noLeidas: await contarNoLeidas(personaId, clinicaId) });
    } catch (err) {
        console.error('Error marcando notificaciones:', err);
        return res.status(500).json({ error: 'No se pudieron marcar las notificaciones.' });
    }
};
