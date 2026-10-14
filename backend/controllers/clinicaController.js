// Gestión de la clínica (Fase 2). La clínica se toma de la sesión del profesional.
// Generar/listar códigos de activación es exclusivo del admin de la clínica.

// Fase 2c: opera con el cliente por-JWT (RLS por clinica_id a nivel Postgres).
const { getUserSupabase } = require('../middleware/userSupabase');
const { resolverObraSocial } = require('../utils/cobertura');
const planes = require('../utils/planes');

// Código legible sin caracteres ambiguos (0/O, 1/I).
function generarCodigoAleatorio() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
}

// Info de la clínica del usuario autenticado.
exports.info = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.json({ clinica: null, esAdmin: false });

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const { data, error } = await db
            .from('clinica')
            .select('nombre, slug, turnos_online')
            .eq('id', clinicaId)
            .maybeSingle();
        if (error) return res.status(400).json({ error: error.message });

        return res.json({ clinica: data, esAdmin: !!req.session.user.esAdmin });
    } catch (err) {
        console.error('Error en clinica/info:', err);
        return res.status(500).json({ error: 'Error al obtener la clínica' });
    }
};

// Genera un código de activación nuevo para la clínica del admin.
// Fase E: el código puede apuntar a un rol ('profesional' por defecto | 'recepcion').
// Fase J: o 'auditor', con un alcance opcional por obra social (se copia a la membresía).
exports.generarCodigo = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica asignada.' });

        const rol = ['recepcion', 'auditor'].includes(req.body?.rol) ? req.body.rol : 'profesional';

        // Fase L: cada código reserva un lugar del plan (y el de auditor requiere la función).
        const bloqueo = await planes.verificarAlta(clinicaId, rol, { contarCodigos: true });
        if (bloqueo) return res.status(bloqueo.status).json(bloqueo);
        let alcance = rol === 'auditor' ? (String(req.body?.alcanceObraSocial || '').trim() || null) : null;
        // Fase K: alcance por obra social del catálogo (preferido sobre el texto).
        let alcanceId = null;
        if (rol === 'auditor' && req.body?.alcanceIdObraSocial) {
            const os = await resolverObraSocial(req.body.alcanceIdObraSocial, clinicaId);
            if (!os) return res.status(400).json({ error: 'La obra social elegida no es válida.' });
            alcanceId = os.id;
            alcance = os.nombre;
        }

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        let inserted = null;
        for (let intentos = 0; intentos < 5 && !inserted; intentos++) {
            const codigo = generarCodigoAleatorio();
            const { data, error } = await db
                .from('codigo_activacion')
                .insert({ codigo, clinica_id: clinicaId, rol, alcance_obra_social: alcance, alcance_id_obra_social: alcanceId })
                .select('codigo, usado, rol, alcance_obra_social, creado_en')
                .single();
            if (!error) { inserted = data; break; }
            if (error.code !== '23505') { // 23505 = unique_violation (colisión de código)
                return res.status(400).json({ error: error.message });
            }
        }
        if (!inserted) return res.status(500).json({ error: 'No se pudo generar un código único, reintentá.' });

        return res.status(201).json({ message: 'Código generado', codigo: inserted.codigo, rol: inserted.rol });
    } catch (err) {
        console.error('Error generando código:', err);
        return res.status(500).json({ error: 'Error al generar el código' });
    }
};

// Lista los códigos de la clínica del admin.
exports.listarCodigos = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica asignada.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const { data, error } = await db
            .from('codigo_activacion')
            .select('id, codigo, usado, rol, alcance_obra_social, creado_en')
            .eq('clinica_id', clinicaId)
            .order('creado_en', { ascending: false });
        if (error) return res.status(400).json({ error: error.message });

        return res.json({ codigos: data || [] });
    } catch (err) {
        console.error('Error listando códigos:', err);
        return res.status(500).json({ error: 'Error al listar los códigos' });
    }
};

// Elimina un código de activación de la clínica del admin, SOLO si no está usado.
// Si el código ya fue usado, no se borra (409). El aislamiento por clínica y la
// restricción "usado=false" los refuerza también la RLS (codigo_activacion_admin_delete).
exports.eliminarCodigo = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica asignada.' });

        const codigoId = req.params.id;
        if (!codigoId) return res.status(400).json({ error: 'Código inválido.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        // 1. Verificar estado (la RLS de SELECT ya lo acota a la propia clínica).
        const { data: cod, error: selErr } = await db
            .from('codigo_activacion')
            .select('id, usado')
            .eq('id', codigoId)
            .maybeSingle();
        if (selErr) return res.status(400).json({ error: selErr.message });
        if (!cod) return res.status(404).json({ error: 'Código no encontrado.' });
        if (cod.usado) {
            return res.status(409).json({ error: 'El código ya fue utilizado; no se puede eliminar.' });
        }

        // 2. Eliminar (la RLS de DELETE exige admin + misma clínica + usado=false).
        const { data: del, error: delErr } = await db
            .from('codigo_activacion')
            .delete()
            .eq('id', codigoId)
            .select('id');
        if (delErr) return res.status(400).json({ error: delErr.message });
        if (!del || del.length === 0) {
            // La RLS bloqueó el borrado (p. ej. dejó de estar libre entre el SELECT y el DELETE).
            return res.status(409).json({ error: 'No se pudo eliminar el código.' });
        }

        return res.json({ message: 'Código eliminado' });
    } catch (err) {
        console.error('Error eliminando código:', err);
        return res.status(500).json({ error: 'Error al eliminar el código' });
    }
};
