// Mis estudios (Fase I) — "Drive médico" del paciente.
// - El PACIENTE sube sus estudios (labos, imágenes, informes), es el dueño.
// - Comparte cada estudio con PROFESIONALES puntuales de la plataforma (cross-clínica).
// - El PROFESIONAL destinatario los ve en su bandeja "Compartidos conmigo".
//
// Storage: bucket PRIVADO 'estudios'. Los objetos se suben/bajan por el backend con
// service_role y se entregan como URLs firmadas de corta duración. La tabla `estudio`
// lleva la RLS (paciente dueño para todo; profesional destinatario para lectura), así
// que las lecturas/altas de filas se hacen con el cliente por-JWT.
//
// NOTA de RLS: `persona`/`profesional` tienen RLS por clínica, así que un paciente no
// puede leer por-JWT el nombre de un profesional de otra clínica (ni viceversa). Por eso
// los nombres se snapshotean al subir/compartir (columnas paciente_nombre /
// profesional_nombre) y el buscador de profesionales usa service_role acotado.

const crypto = require('crypto');
const { supabase } = require('../config/supabaseClient');       // service_role (storage / búsqueda)
const { getUserSupabase } = require('../middleware/userSupabase'); // por-JWT (RLS de las tablas)
const { misPacienteIds } = require('../utils/fichasPaciente');
const { errorDb } = require('../utils/errores');

const BUCKET = 'estudios';
const SIGNED_TTL = 120; // segundos de validez de la URL firmada

function extDeMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('pdf')) return 'pdf';
    return 'bin';
}

const CATEGORIAS = ['laboratorio', 'imagen', 'informe', 'receta', 'otro'];

// Nombre visible de un paciente por su id (service_role: salta la RLS de persona).
async function nombrePaciente(idPaciente) {
    const { data } = await supabase
        .from('paciente')
        .select('persona:id_persona ( nombre, apellido )')
        .eq('id', idPaciente)
        .maybeSingle();
    const per = Array.isArray(data?.persona) ? data.persona[0] : data?.persona;
    return [per?.nombre, per?.apellido].filter(Boolean).join(' ') || null;
}

// Datos visibles de un profesional por su id (service_role).
async function resolverProfesional(idProfesional) {
    const { data } = await supabase
        .from('profesional')
        .select('id, matricula, persona:id_persona ( nombre, apellido )')
        .eq('id', idProfesional)
        .maybeSingle();
    if (!data) return null;
    const per = Array.isArray(data.persona) ? data.persona[0] : data.persona;
    return {
        id: data.id,
        matricula: data.matricula || null,
        nombre: [per?.nombre, per?.apellido].filter(Boolean).join(' ') || 'Profesional',
    };
}

// Mapea una fila de estudio a la vista pública (sin el path interno del storage).
function vistaEstudio(e) {
    return {
        id: e.id,
        titulo: e.titulo,
        descripcion: e.descripcion,
        categoria: e.categoria,
        fechaEstudio: e.fecha_estudio,
        archivoNombre: e.archivo_nombre,
        archivoSize: e.archivo_size,
        esImagen: (e.archivo_mime || '').startsWith('image/'),
        pacienteNombre: e.paciente_nombre,
        subidoEn: e.subido_en,
        compartidos: (e.estudio_compartido || []).map((c) => ({
            idProfesional: c.id_profesional,
            profesionalNombre: c.profesional_nombre,
            compartidoEn: c.compartido_en,
        })),
    };
}

// GET /estudios — el paciente lista sus estudios (con quién los compartió).
exports.listar = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const { data, error } = await db
            .from('estudio')
            .select(
                'id, titulo, descripcion, categoria, fecha_estudio, archivo_mime, archivo_nombre, archivo_size, paciente_nombre, subido_en, ' +
                'estudio_compartido ( id_profesional, profesional_nombre, compartido_en )'
            )
            // Fase O: los de todas sus fichas, y solo los propios (la RLS también deja ver
            // los compartidos con la cuenta si además es profesional).
            .in('id_paciente', await misPacienteIds(req.session.user.id))
            .order('subido_en', { ascending: false });
        if (error) return errorDb(res, error);

        return res.json({ estudios: (data || []).map(vistaEstudio) });
    } catch (err) {
        console.error('Error listando estudios:', err);
        return res.status(500).json({ error: 'Error al obtener tus estudios' });
    }
};

// POST /estudios — el paciente sube un estudio (multipart: campo 'archivo').
exports.subir = async (req, res) => {
    try {
        const idPaciente = req.session.user.idRole;
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const file = req.file;
        if (!file) return res.status(400).json({ error: 'Adjuntá el archivo del estudio.' });

        const ext = extDeMime(file.mimetype);
        if (!['png', 'jpg', 'pdf'].includes(ext)) {
            return res.status(400).json({ error: 'El archivo debe ser una imagen (PNG/JPG) o un PDF.' });
        }

        const titulo = String(req.body.titulo || '').trim();
        if (!titulo) return res.status(400).json({ error: 'Poné un título al estudio.' });

        let categoria = String(req.body.categoria || 'otro').trim();
        if (!CATEGORIAS.includes(categoria)) categoria = 'otro';

        const descripcion = req.body.descripcion ? String(req.body.descripcion).slice(0, 4000) : null;
        const fechaEstudio = /^\d{4}-\d{2}-\d{2}$/.test(req.body.fechaEstudio || '') ? req.body.fechaEstudio : null;

        const path = `${idPaciente}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
        if (upErr) throw upErr;

        const pacienteNombre = await nombrePaciente(idPaciente);

        const { data: row, error: insErr } = await db
            .from('estudio')
            .insert({
                id_paciente: idPaciente,
                titulo: titulo.slice(0, 200),
                descripcion,
                categoria,
                fecha_estudio: fechaEstudio,
                archivo_path: path,
                archivo_mime: file.mimetype,
                archivo_nombre: (file.originalname || '').slice(0, 200) || null,
                archivo_size: file.size,
                paciente_nombre: pacienteNombre,
            })
            .select('id')
            .single();
        if (insErr) {
            // Compensación: si no se pudo registrar, borrar el archivo huérfano.
            await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
            throw insErr;
        }

        return res.status(201).json({ message: 'Estudio subido', id: row.id });
    } catch (err) {
        console.error('Error subiendo estudio:', err);
        return res.status(500).json({ error: 'Error al subir el estudio' });
    }
};

// Path del archivo de un estudio, solo si está en la carpeta de su paciente
// (`<id_paciente>/...`). La fila la puede escribir el paciente por la API de Supabase
// y el backend firma y borra con service_role: sin este chequeo, un `archivo_path`
// ajeno daría acceso al archivo de otro paciente (auditoría 2026-10-15, #11).
function pathPropio(fila) {
    const p = fila && fila.archivo_path;
    if (typeof p !== 'string' || fila.id_paciente == null || p.includes('..')) return null;
    return p.startsWith(`${fila.id_paciente}/`) ? p : null;
}

// PUT /estudios/:id — el paciente edita los metadatos de un estudio propio.
exports.actualizar = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Estudio inválido.' });

        const patch = {};
        if (typeof req.body.titulo === 'string' && req.body.titulo.trim()) patch.titulo = req.body.titulo.trim().slice(0, 200);
        if (typeof req.body.descripcion === 'string') patch.descripcion = req.body.descripcion.slice(0, 4000) || null;
        if (typeof req.body.categoria === 'string' && CATEGORIAS.includes(req.body.categoria)) patch.categoria = req.body.categoria;
        if (/^\d{4}-\d{2}-\d{2}$/.test(req.body.fechaEstudio || '')) patch.fecha_estudio = req.body.fechaEstudio;
        if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para actualizar.' });

        // La RLS de UPDATE solo deja al paciente dueño.
        const { data, error } = await db.from('estudio').update(patch).eq('id', id).select('id');
        if (error) return errorDb(res, error);
        if (!data || data.length === 0) return res.status(404).json({ error: 'Estudio no encontrado.' });

        return res.json({ message: 'Estudio actualizado' });
    } catch (err) {
        console.error('Error actualizando estudio:', err);
        return res.status(500).json({ error: 'Error al actualizar el estudio' });
    }
};

// DELETE /estudios/:id — el paciente borra un estudio propio (fila + objeto).
exports.eliminar = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Estudio inválido.' });

        // Tomar el path (visible si es dueño; también si es un pro con acceso, pero el
        // DELETE de abajo lo gatea a dueño vía RLS).
        const { data: fila } = await db.from('estudio').select('id, archivo_path, id_paciente').eq('id', id).maybeSingle();

        const { data: borradas, error } = await db.from('estudio').delete().eq('id', id).select('id, archivo_path, id_paciente');
        if (error) return errorDb(res, error);
        if (!borradas || borradas.length === 0) return res.status(404).json({ error: 'Estudio no encontrado.' });

        // Solo se borra el objeto si está en la carpeta del paciente (#11).
        const path = pathPropio(borradas[0]) || pathPropio(fila);
        if (path) await supabase.storage.from(BUCKET).remove([path]).catch(() => {});

        return res.json({ message: 'Estudio eliminado' });
    } catch (err) {
        console.error('Error eliminando estudio:', err);
        return res.status(500).json({ error: 'Error al eliminar el estudio' });
    }
};

// POST /estudios/:id/compartir — el paciente comparte con un profesional { idProfesional }.
exports.compartir = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const id = Number(req.params.id);
        const idProfesional = Number(req.body.idProfesional);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Estudio inválido.' });
        if (!Number.isInteger(idProfesional)) return res.status(400).json({ error: 'Elegí un profesional.' });

        const prof = await resolverProfesional(idProfesional);
        if (!prof) return res.status(404).json({ error: 'No se encontró ese profesional.' });

        // La RLS de INSERT exige que el estudio sea del paciente autenticado.
        const { error } = await db
            .from('estudio_compartido')
            .insert({ id_estudio: id, id_profesional: idProfesional, profesional_nombre: prof.nombre });
        if (error) {
            // 23505 = ya estaba compartido con ese profesional.
            if (error.code === '23505') return res.json({ message: 'Ya lo habías compartido con ese profesional.' });
            // 23503 / RLS: el estudio no es del paciente (o no existe).
            return res.status(400).json({ error: 'No se pudo compartir el estudio.' });
        }

        return res.status(201).json({ message: `Compartido con ${prof.nombre}.` });
    } catch (err) {
        console.error('Error compartiendo estudio:', err);
        return res.status(500).json({ error: 'Error al compartir el estudio' });
    }
};

// DELETE /estudios/:id/compartir/:idProfesional — el paciente revoca el acceso.
exports.revocar = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const id = Number(req.params.id);
        const idProfesional = Number(req.params.idProfesional);
        if (!Number.isInteger(id) || !Number.isInteger(idProfesional)) {
            return res.status(400).json({ error: 'Datos inválidos.' });
        }

        // La RLS de DELETE solo deja al paciente dueño del estudio.
        const { error } = await db
            .from('estudio_compartido')
            .delete()
            .eq('id_estudio', id)
            .eq('id_profesional', idProfesional);
        if (error) return errorDb(res, error);

        return res.json({ message: 'Acceso revocado' });
    } catch (err) {
        console.error('Error revocando acceso:', err);
        return res.status(500).json({ error: 'Error al revocar el acceso' });
    }
};

// GET /estudios/profesionales/buscar?q=... — el paciente busca profesionales para compartir.
exports.buscarProfesionales = async (req, res) => {
    try {
        const q = String(req.query.q || '').trim().replace(/[%,()]/g, ' ').slice(0, 60);
        if (q.length < 2) return res.json({ profesionales: [] });

        // service_role: búsqueda cross-clínica acotada a datos no sensibles.
        // Por nombre/apellido (embebe profesional!inner) o por matrícula.
        const seleccion =
            'id, matricula, persona:id_persona!inner ( nombre, apellido ), ' +
            'especialidad_profesional ( especialidad:id_especialidad ( nombre ) )';

        const [porNombre, porMatricula] = await Promise.all([
            supabase
                .from('profesional')
                .select(seleccion)
                .or(`nombre.ilike.%${q}%,apellido.ilike.%${q}%`, { referencedTable: 'persona' })
                .limit(20),
            supabase
                .from('profesional')
                .select(seleccion)
                .ilike('matricula', `%${q}%`)
                .limit(20),
        ]);

        const filas = [...(porNombre.data || []), ...(porMatricula.data || [])];
        const vistos = new Set();
        const profesionales = [];
        for (const p of filas) {
            if (vistos.has(p.id)) continue;
            vistos.add(p.id);
            const per = Array.isArray(p.persona) ? p.persona[0] : p.persona;
            const especialidades = (p.especialidad_profesional || [])
                .map((ep) => (Array.isArray(ep.especialidad) ? ep.especialidad[0] : ep.especialidad)?.nombre)
                .filter(Boolean);
            profesionales.push({
                id: p.id,
                nombre: [per?.nombre, per?.apellido].filter(Boolean).join(' ') || 'Profesional',
                matricula: p.matricula || null,
                especialidades,
            });
            if (profesionales.length >= 20) break;
        }

        return res.json({ profesionales });
    } catch (err) {
        console.error('Error buscando profesionales:', err);
        return res.status(500).json({ error: 'Error al buscar profesionales' });
    }
};

// GET /estudios/compartidos-conmigo — bandeja del profesional (estudios que le compartieron).
exports.compartidosConmigo = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        // La RLS de estudio_compartido solo expone al profesional SUS filas, así que el
        // inner join deja únicamente los estudios compartidos con él (compartido_en = su fecha).
        const { data, error } = await db
            .from('estudio')
            .select(
                'id, titulo, descripcion, categoria, fecha_estudio, archivo_mime, archivo_nombre, archivo_size, paciente_nombre, subido_en, ' +
                'estudio_compartido!inner ( compartido_en )'
            )
            .order('subido_en', { ascending: false });
        if (error) return errorDb(res, error);

        const estudios = (data || []).map((e) => {
            const comp = Array.isArray(e.estudio_compartido) ? e.estudio_compartido[0] : e.estudio_compartido;
            return {
                id: e.id,
                titulo: e.titulo,
                descripcion: e.descripcion,
                categoria: e.categoria,
                fechaEstudio: e.fecha_estudio,
                archivoNombre: e.archivo_nombre,
                archivoSize: e.archivo_size,
                esImagen: (e.archivo_mime || '').startsWith('image/'),
                pacienteNombre: e.paciente_nombre,
                subidoEn: e.subido_en,
                compartidoEn: comp?.compartido_en || null,
            };
        });

        return res.json({ estudios });
    } catch (err) {
        console.error('Error en compartidos-conmigo:', err);
        return res.status(500).json({ error: 'Error al obtener los estudios compartidos' });
    }
};

// GET /estudios/:id/descargar — URL firmada del archivo (la RLS valida el acceso).
exports.descargar = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Estudio inválido.' });

        // La RLS de SELECT devuelve la fila solo si el usuario es el paciente dueño
        // o un profesional al que se lo compartieron.
        const { data: est, error } = await db
            .from('estudio')
            .select('id, archivo_path, id_paciente')
            .eq('id', id)
            .maybeSingle();
        if (error) return errorDb(res, error);
        if (!est) return res.status(404).json({ error: 'Estudio no encontrado.' });
        const path = pathPropio(est);
        if (!path) return res.status(404).json({ error: 'Estudio no encontrado.' });

        const { data: signed, error: signErr } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, SIGNED_TTL);
        if (signErr || !signed) return res.status(500).json({ error: 'No se pudo generar el enlace.' });

        return res.json({ url: signed.signedUrl });
    } catch (err) {
        console.error('Error descargando estudio:', err);
        return res.status(500).json({ error: 'Error al descargar el estudio' });
    }
};
