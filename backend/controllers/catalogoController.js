// Catálogos (Fase K): obras sociales, CIE-10 y prácticas.
//
//   - Obras sociales: catálogo global + altas propias de la clínica. El listado global
//     es público (lo usa el registro del paciente, que todavía no tiene sesión).
//   - CIE-10: global, solo lectura (subconjunto odontológico cargado por la migración).
//   - Prácticas: catálogo PROPIO de cada clínica; lo administra el admin.
//
// Escrituras con service_role acotadas SIEMPRE por la clínica de la sesión (como el
// panel de administración); el guard de admin está en las rutas.

const { supabase } = require('../config/supabaseClient');
const { listarObrasSociales } = require('../utils/cobertura');
const PRACTICAS_BASE = require('../utils/practicasBase');
const { errorDb } = require('../utils/errores');

// ---------------------------------------------------------------------------
// Obras sociales
// ---------------------------------------------------------------------------

// GET /catalogos/obras-sociales/publicas — catálogo global (sin sesión).
exports.obrasSocialesPublicas = async (req, res) => {
    try {
        return res.json({ obrasSociales: await listarObrasSociales(null) });
    } catch (err) {
        console.error('Error listando obras sociales públicas:', err);
        return res.status(500).json({ error: 'Error al listar las obras sociales' });
    }
};

// GET /catalogos/obras-sociales[?todas=1] — global + propias de la clínica activa.
// `todas=1` (solo admin) incluye las propias dadas de baja, para administrarlas.
exports.obrasSociales = async (req, res) => {
    try {
        const { clinicaId, esAdmin } = req.session.user;
        const todas = esAdmin && req.query.todas === '1';
        return res.json({ obrasSociales: await listarObrasSociales(clinicaId, { todas }) });
    } catch (err) {
        console.error('Error listando obras sociales:', err);
        return res.status(500).json({ error: 'Error al listar las obras sociales' });
    }
};

// POST /catalogos/obras-sociales — alta propia de la clínica (admin).
exports.crearObraSocial = async (req, res) => {
    try {
        const { clinicaId } = req.session.user;
        const nombre = req.body.nombre.trim();
        const sigla = (req.body.sigla || '').trim() || null;

        // No duplicar una global ni una propia con el mismo nombre.
        const { data: dup } = await supabase
            .from('obra_social')
            .select('id, clinica_id')
            .or(`clinica_id.is.null,clinica_id.eq.${clinicaId}`)
            .ilike('nombre', nombre.replace(/[\\%_]/g, (c) => `\\${c}`))
            .limit(1);
        if (dup && dup.length) {
            return res.status(409).json({ error: 'Esa obra social ya está en el catálogo.' });
        }

        const { data, error } = await supabase
            .from('obra_social')
            .insert({ clinica_id: clinicaId, nombre, sigla })
            .select('id, nombre, sigla, activo')
            .single();
        if (error) return errorDb(res, error);
        return res.status(201).json({ obraSocial: { ...data, propia: true } });
    } catch (err) {
        console.error('Error creando obra social:', err);
        return res.status(500).json({ error: 'Error al crear la obra social' });
    }
};

// PATCH /catalogos/obras-sociales/:id — activar/desactivar una propia (admin).
// Las globales no se editan desde una clínica.
exports.actualizarObraSocial = async (req, res) => {
    try {
        const { clinicaId } = req.session.user;
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Obra social inválida.' });

        const patch = {};
        if (req.body.activo !== undefined) patch.activo = !!req.body.activo;
        if (req.body.nombre !== undefined) patch.nombre = req.body.nombre.trim();
        if (req.body.sigla !== undefined) patch.sigla = (req.body.sigla || '').trim() || null;
        if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para actualizar.' });

        const { data, error } = await supabase
            .from('obra_social')
            .update(patch)
            .eq('id', id)
            .eq('clinica_id', clinicaId) // solo las propias
            .select('id, nombre, sigla, activo')
            .maybeSingle();
        if (error) {
            if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una obra social con ese nombre.' });
            return errorDb(res, error);
        }
        if (!data) return res.status(404).json({ error: 'Solo se pueden editar las obras sociales propias de la clínica.' });

        // Mantener el snapshot de texto de los pacientes si cambió el nombre.
        if (patch.nombre) {
            await supabase.from('paciente').update({ obra_social: data.nombre }).eq('id_obra_social', data.id);
        }
        return res.json({ obraSocial: { ...data, propia: true } });
    } catch (err) {
        console.error('Error actualizando obra social:', err);
        return res.status(500).json({ error: 'Error al actualizar la obra social' });
    }
};

// ---------------------------------------------------------------------------
// CIE-10
// ---------------------------------------------------------------------------

// GET /catalogos/cie10 — catálogo completo (es chico: el cliente filtra localmente).
exports.cie10 = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cie10')
            .select('codigo, descripcion, categoria')
            .order('codigo', { ascending: true });
        if (error) return errorDb(res, error);
        return res.json({ cie10: data || [] });
    } catch (err) {
        console.error('Error listando CIE-10:', err);
        return res.status(500).json({ error: 'Error al listar los diagnósticos' });
    }
};

// ---------------------------------------------------------------------------
// Prácticas
// ---------------------------------------------------------------------------

function mapPractica(p) {
    return {
        id: p.id,
        codigo: p.codigo,
        descripcion: p.descripcion,
        requiereAutorizacion: p.requiere_autorizacion,
        activo: p.activo,
    };
}

// GET /catalogos/practicas[?todas=1] — prácticas de la clínica activa.
exports.practicas = async (req, res) => {
    try {
        const { clinicaId, esAdmin } = req.session.user;
        let q = supabase
            .from('practica')
            .select('id, codigo, descripcion, requiere_autorizacion, activo')
            .eq('clinica_id', clinicaId)
            .order('codigo', { ascending: true });
        if (!(esAdmin && req.query.todas === '1')) q = q.eq('activo', true);
        const { data, error } = await q;
        if (error) return errorDb(res, error);
        return res.json({ practicas: (data || []).map(mapPractica) });
    } catch (err) {
        console.error('Error listando prácticas:', err);
        return res.status(500).json({ error: 'Error al listar las prácticas' });
    }
};

// Inserta prácticas omitiendo los códigos que la clínica ya tiene. Devuelve la cantidad.
async function insertarPracticas(clinicaId, items) {
    const { data: existentes, error: eErr } = await supabase
        .from('practica')
        .select('codigo')
        .eq('clinica_id', clinicaId);
    if (eErr) throw eErr;
    const ya = new Set((existentes || []).map((p) => p.codigo.toLowerCase()));
    const vistos = new Set();
    const filas = [];
    for (const it of items) {
        const codigo = String(it.codigo || '').trim();
        const descripcion = String(it.descripcion || '').trim();
        const k = codigo.toLowerCase();
        if (!codigo || !descripcion || ya.has(k) || vistos.has(k)) continue;
        vistos.add(k);
        filas.push({
            clinica_id: clinicaId,
            codigo: codigo.slice(0, 30),
            descripcion: descripcion.slice(0, 200),
            requiere_autorizacion: !!it.requiereAutorizacion,
        });
    }
    if (filas.length) {
        const { error } = await supabase.from('practica').insert(filas);
        if (error) throw error;
    }
    return { agregadas: filas.length, omitidas: items.length - filas.length };
}

// POST /catalogos/practicas — alta de una práctica (admin).
exports.crearPractica = async (req, res) => {
    try {
        const { clinicaId } = req.session.user;
        const r = await insertarPracticas(clinicaId, [req.body]);
        if (!r.agregadas) return res.status(409).json({ error: 'Ya existe una práctica con ese código.' });
        return res.status(201).json({ message: 'Práctica agregada' });
    } catch (err) {
        console.error('Error creando práctica:', err);
        return res.status(500).json({ error: 'Error al crear la práctica' });
    }
};

// POST /catalogos/practicas/base — carga la lista base (omite códigos existentes).
exports.cargarPracticasBase = async (req, res) => {
    try {
        const r = await insertarPracticas(req.session.user.clinicaId, PRACTICAS_BASE);
        return res.status(201).json({ message: 'Lista base cargada', ...r });
    } catch (err) {
        console.error('Error cargando prácticas base:', err);
        return res.status(500).json({ error: 'Error al cargar la lista base' });
    }
};

// POST /catalogos/practicas/importar — { items: [{codigo, descripcion, requiereAutorizacion}] }
// (el cliente parsea el CSV). Omite códigos repetidos o ya existentes.
exports.importarPracticas = async (req, res) => {
    try {
        const r = await insertarPracticas(req.session.user.clinicaId, req.body.items);
        return res.status(201).json({ message: 'Importación finalizada', ...r });
    } catch (err) {
        console.error('Error importando prácticas:', err);
        return res.status(500).json({ error: 'Error al importar las prácticas' });
    }
};

// PATCH /catalogos/practicas/:id — editar descripción, autorización o estado (admin).
exports.actualizarPractica = async (req, res) => {
    try {
        const { clinicaId } = req.session.user;
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Práctica inválida.' });

        const patch = {};
        if (req.body.descripcion !== undefined) patch.descripcion = req.body.descripcion.trim();
        if (req.body.requiereAutorizacion !== undefined) patch.requiere_autorizacion = !!req.body.requiereAutorizacion;
        if (req.body.activo !== undefined) patch.activo = !!req.body.activo;
        if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para actualizar.' });

        const { data, error } = await supabase
            .from('practica')
            .update(patch)
            .eq('id', id)
            .eq('clinica_id', clinicaId)
            .select('id, codigo, descripcion, requiere_autorizacion, activo')
            .maybeSingle();
        if (error) return errorDb(res, error);
        if (!data) return res.status(404).json({ error: 'Práctica no encontrada.' });
        return res.json({ practica: mapPractica(data) });
    } catch (err) {
        console.error('Error actualizando práctica:', err);
        return res.status(500).json({ error: 'Error al actualizar la práctica' });
    }
};
