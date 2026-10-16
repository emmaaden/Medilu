// Autorizaciones previas de prácticas (Fase K).
//
// Flujo: el profesional pide autorizar una práctica del catálogo de la clínica para un
// paciente (fundamento, diagnóstico CIE-10, pieza, adjuntos y, opcionalmente, el
// odontograma vigente) -> el auditor la aprueba (con n.º de autorización y vencimiento)
// o la rechaza con motivo. Al cargar el registro clínico, la práctica realizada se
// vincula a una autorización aprobada (ver utils/codificacion.js).
//
// Roles (membresía de la clínica activa):
//   - profesional/admin: solicitan, ven y cancelan las PROPIAS (el admin ve todas).
//   - auditor: bandeja y resolución, acotado a su alcance por la RLS.
//
// Lecturas por-JWT (la RLS aplica el alcance del auditor); escrituras y archivos con
// service_role tras validar. Los adjuntos van al bucket privado 'autorizaciones' y se
// entregan con URLs firmadas de corta duración.

const crypto = require('crypto');
const { supabase } = require('../config/supabaseClient');
const { getUserSupabase } = require('../middleware/userSupabase');
const { serializarDiente } = require('../utils/odontograma');
const { registrarAcceso, nombreActor } = require('../utils/bitacora');
const { hoyAR } = require('../utils/fechaAR');
const { errorDb } = require('../utils/errores');

const BUCKET = 'autorizaciones';
const SIGNED_TTL = 120; // segundos
const PAGE_SIZE = 20;
const ERR_SESION = { status: 401, body: { error: 'Tu sesión expiró. Iniciá sesión de nuevo.' } };

const SELECT_AUT = `
    id, estado, numero, creado_en, resuelta_en, vence_en,
    id_paciente, paciente_nombre, id_profesional, profesional_nombre,
    id_practica, practica_codigo, practica_descripcion, pieza, cantidad,
    diagnostico_cie10, fundamento, odontograma,
    obra_social_nombre, nro_afiliado, motivo, auditor_nombre,
    cie10:diagnostico_cie10 ( descripcion ),
    paciente:id_paciente ( persona:id_persona ( dni ) ),
    autorizacion_adjunto ( id, archivo_nombre, archivo_mime, archivo_size, subido_en )
`;

const uno = (x) => (Array.isArray(x) ? x[0] : x) || null;

function extDeMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('pdf')) return 'pdf';
    return null;
}

function vencida(a) {
    return a.estado === 'aprobada' && a.vence_en && a.vence_en < hoyAR();
}

function mapAutorizacion(a, { detalle = false } = {}) {
    const out = {
        id: a.id,
        estado: a.estado,
        vencida: !!vencida(a),
        numero: a.numero || null,
        creadoEn: a.creado_en,
        resueltaEn: a.resuelta_en || null,
        venceEn: a.vence_en || null,
        paciente: {
            id: a.id_paciente,
            nombre: a.paciente_nombre || '',
            dni: uno(uno(a.paciente)?.persona)?.dni || '',
            obraSocial: a.obra_social_nombre || '',
            nroAfiliado: a.nro_afiliado || '',
        },
        profesional: a.profesional_nombre || '',
        practica: {
            id: a.id_practica,
            codigo: a.practica_codigo,
            descripcion: a.practica_descripcion,
            pieza: a.pieza || '',
            cantidad: a.cantidad || 1,
        },
        diagnostico: a.diagnostico_cie10
            ? { codigo: a.diagnostico_cie10, descripcion: uno(a.cie10)?.descripcion || '' }
            : null,
        motivo: a.motivo || '',
        auditor: a.auditor_nombre || '',
        adjuntos: (a.autorizacion_adjunto || []).map((f) => ({
            id: f.id,
            nombre: f.archivo_nombre || 'archivo',
            mime: f.archivo_mime || '',
            size: f.archivo_size || null,
        })),
    };
    if (detalle) {
        out.fundamento = a.fundamento || '';
        out.odontograma = Array.isArray(a.odontograma) ? a.odontograma : [];
    }
    return out;
}

// Un profesional que no es admin solo opera sobre las autorizaciones que pidió.
function puedeVerComoProfesional(user, a) {
    if (user.rol === 'auditor' || user.rol === 'admin') return true;
    return a.id_profesional != null && a.id_profesional === user.idRole;
}

async function cargarAutorizacion(db, id, clinicaId) {
    const { data, error } = await db
        .from('autorizacion')
        .select(SELECT_AUT)
        .eq('id', id)
        .eq('clinica_id', clinicaId)
        .maybeSingle();
    if (error) throw error;
    return data || null;
}

// ---------------------------------------------------------------------------
// POST /autorizaciones (multipart) — el profesional solicita.
// ---------------------------------------------------------------------------
exports.solicitar = async (req, res) => {
    const subidos = [];
    try {
        const { clinicaId, idRole } = req.session.user;
        if (!idRole) return res.status(403).json({ error: 'Solo un profesional puede solicitar autorizaciones.' });

        const archivos = req.files || [];
        for (const f of archivos) {
            if (!extDeMime(f.mimetype)) {
                return res.status(400).json({ error: 'Los adjuntos deben ser imágenes PNG/JPG o PDF.' });
            }
        }

        // Paciente de la clínica (por DNI) con su cobertura actual.
        const { data: persona, error: pErr } = await supabase
            .from('persona')
            .select('nombre, apellido, paciente ( id, obra_social, id_obra_social, nro_afiliado )')
            .eq('clinica_id', clinicaId)
            .eq('dni', String(req.body.dni).trim())
            .maybeSingle();
        if (pErr) throw pErr;
        const paciente = uno(persona?.paciente);
        if (!paciente) return res.status(404).json({ error: 'No se encontró un paciente con ese DNI en tu clínica.' });

        // Práctica del catálogo activo de la clínica.
        const { data: practica, error: prErr } = await supabase
            .from('practica')
            .select('id, codigo, descripcion')
            .eq('id', Number(req.body.idPractica))
            .eq('clinica_id', clinicaId)
            .eq('activo', true)
            .maybeSingle();
        if (prErr) throw prErr;
        if (!practica) return res.status(400).json({ error: 'La práctica no está en el catálogo de la clínica.' });

        // Diagnóstico CIE-10 (opcional).
        const dx = (req.body.diagnosticoCie10 || '').trim() || null;
        if (dx) {
            const { data: c } = await supabase.from('cie10').select('codigo').eq('codigo', dx).maybeSingle();
            if (!c) return res.status(400).json({ error: 'El código CIE-10 no existe.' });
        }

        // Odontograma vigente (último registro del paciente con dientes), si se pidió.
        let odontograma = null;
        if (req.body.adjuntarOdontograma === 'true') {
            const { data: regs } = await supabase
                .from('registro_clinico')
                .select('fecha, registro_diente ( numero, condicion, cara, estado, notas )')
                .eq('id_paciente', paciente.id)
                .eq('clinica_id', clinicaId)
                .order('fecha', { ascending: false })
                .limit(20);
            const conDientes = (regs || []).find((r) => (r.registro_diente || []).length > 0);
            odontograma = conDientes ? conDientes.registro_diente.map(serializarDiente) : null;
        }

        const { data: prof } = await supabase
            .from('persona')
            .select('nombre, apellido')
            .eq('id', req.session.user.personaId)
            .maybeSingle();

        const pacienteNombre = [persona.nombre, persona.apellido].filter(Boolean).join(' ');
        const { data: aut, error: iErr } = await supabase
            .from('autorizacion')
            .insert({
                clinica_id: clinicaId,
                id_paciente: paciente.id,
                id_profesional: idRole,
                profesional_nombre: prof ? [prof.nombre, prof.apellido].filter(Boolean).join(' ') : null,
                paciente_nombre: pacienteNombre,
                id_practica: practica.id,
                practica_codigo: practica.codigo,
                practica_descripcion: practica.descripcion,
                pieza: (req.body.pieza || '').trim() || null,
                cantidad: Number(req.body.cantidad) || 1,
                diagnostico_cie10: dx,
                fundamento: req.body.fundamento.trim(),
                odontograma,
                id_obra_social: paciente.id_obra_social || null,
                obra_social_nombre: paciente.obra_social || null,
                nro_afiliado: paciente.nro_afiliado || null,
            })
            .select('id')
            .single();
        if (iErr) throw iErr;

        // Adjuntos: si alguno falla, se borra la solicitud y los ya subidos.
        try {
            for (const f of archivos) {
                const path = `${clinicaId}/${aut.id}/${crypto.randomUUID()}.${extDeMime(f.mimetype)}`;
                const { error: upErr } = await supabase.storage
                    .from(BUCKET)
                    .upload(path, f.buffer, { contentType: f.mimetype, upsert: false });
                if (upErr) throw upErr;
                subidos.push(path);
                const { error: aErr } = await supabase.from('autorizacion_adjunto').insert({
                    id_autorizacion: aut.id,
                    archivo_path: path,
                    archivo_mime: f.mimetype,
                    archivo_nombre: String(f.originalname || 'archivo').slice(0, 200),
                    archivo_size: f.size,
                });
                if (aErr) throw aErr;
            }
        } catch (eAdj) {
            if (subidos.length) await supabase.storage.from(BUCKET).remove(subidos).catch(() => {});
            await supabase.from('autorizacion').delete().eq('id', aut.id);
            throw eAdj;
        }

        await registrarAcceso(req, {
            accion: 'solicitar_autorizacion',
            idPaciente: paciente.id,
            paciente: { nombre: pacienteNombre, dni: String(req.body.dni).trim() },
            detalle: { autorizacion: aut.id, practica: practica.codigo, adjuntos: archivos.length },
        });

        return res.status(201).json({ message: 'Autorización solicitada', id: aut.id });
    } catch (err) {
        console.error('Error solicitando autorización:', err);
        return res.status(500).json({ error: 'Error al solicitar la autorización' });
    }
};

// ---------------------------------------------------------------------------
// GET /autorizaciones?estado=&page= — bandeja (auditor/admin: todas las del alcance;
// profesional: las propias).
// ---------------------------------------------------------------------------
exports.listar = async (req, res) => {
    try {
        const user = req.session.user;
        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const page = Math.max(1, Number(req.query.page) || 1);
        const from = (page - 1) * PAGE_SIZE;

        let q = db
            .from('autorizacion')
            .select(SELECT_AUT, { count: 'exact' })
            .eq('clinica_id', user.clinicaId);
        if (req.query.estado) q = q.eq('estado', req.query.estado);
        if (user.rol === 'profesional') q = q.eq('id_profesional', user.idRole || -1);

        const { data, error, count } = await q
            .order('creado_en', { ascending: false })
            .range(from, from + PAGE_SIZE - 1);
        if (error) return errorDb(res, error);

        return res.json({
            autorizaciones: (data || []).map((a) => mapAutorizacion(a)),
            total: count || 0,
            page,
            pageSize: PAGE_SIZE,
        });
    } catch (err) {
        console.error('Error listando autorizaciones:', err);
        return res.status(500).json({ error: 'Error al listar las autorizaciones' });
    }
};

// ---------------------------------------------------------------------------
// GET /autorizaciones/vigentes?dni= — aprobadas y no vencidas de un paciente, para
// vincularlas a las prácticas al cargar el registro clínico (profesional/admin).
// ---------------------------------------------------------------------------
exports.vigentes = async (req, res) => {
    try {
        const { clinicaId } = req.session.user;
        const dni = String(req.query.dni || '').trim();
        if (!dni) return res.json({ autorizaciones: [] });

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const { data: persona } = await db
            .from('persona')
            .select('paciente ( id )')
            .eq('clinica_id', clinicaId)
            .eq('dni', dni)
            .maybeSingle();
        const paciente = uno(persona?.paciente);
        if (!paciente) return res.json({ autorizaciones: [] });

        const { data, error } = await db
            .from('autorizacion')
            .select('id, numero, id_practica, practica_codigo, practica_descripcion, pieza, vence_en')
            .eq('clinica_id', clinicaId)
            .eq('id_paciente', paciente.id)
            .eq('estado', 'aprobada')
            .or(`vence_en.is.null,vence_en.gte.${hoyAR()}`)
            .order('resuelta_en', { ascending: false });
        if (error) return errorDb(res, error);

        return res.json({
            autorizaciones: (data || []).map((a) => ({
                id: a.id,
                numero: a.numero,
                idPractica: a.id_practica,
                practica: `${a.practica_codigo} · ${a.practica_descripcion}`,
                pieza: a.pieza || '',
                venceEn: a.vence_en || null,
            })),
        });
    } catch (err) {
        console.error('Error listando autorizaciones vigentes:', err);
        return res.status(500).json({ error: 'Error al listar las autorizaciones' });
    }
};

// ---------------------------------------------------------------------------
// GET /autorizaciones/:id — detalle.
// ---------------------------------------------------------------------------
exports.detalle = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Autorización inválida.' });
        const user = req.session.user;

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const a = await cargarAutorizacion(db, id, user.clinicaId);
        if (!a || !puedeVerComoProfesional(user, a)) {
            return res.status(404).json({ error: 'Autorización no encontrada.' });
        }

        if (user.rol !== 'profesional') {
            await registrarAcceso(req, {
                accion: 'ver_autorizacion',
                idPaciente: a.id_paciente,
                paciente: { nombre: a.paciente_nombre, dni: uno(uno(a.paciente)?.persona)?.dni || null },
                detalle: { autorizacion: a.id },
            });
        }

        return res.json({ autorizacion: mapAutorizacion(a, { detalle: true }) });
    } catch (err) {
        console.error('Error obteniendo la autorización:', err);
        return res.status(500).json({ error: 'Error al obtener la autorización' });
    }
};

// ---------------------------------------------------------------------------
// GET /autorizaciones/:id/adjuntos/:adjuntoId — URL firmada del adjunto.
// ---------------------------------------------------------------------------
exports.adjunto = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const adjuntoId = Number(req.params.adjuntoId);
        if (!Number.isInteger(id) || !Number.isInteger(adjuntoId)) {
            return res.status(400).json({ error: 'Adjunto inválido.' });
        }
        const user = req.session.user;
        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const a = await cargarAutorizacion(db, id, user.clinicaId);
        if (!a || !puedeVerComoProfesional(user, a)) {
            return res.status(404).json({ error: 'Autorización no encontrada.' });
        }

        const { data: adj, error } = await db
            .from('autorizacion_adjunto')
            .select('id, archivo_path')
            .eq('id', adjuntoId)
            .eq('id_autorizacion', id)
            .maybeSingle();
        if (error) return errorDb(res, error);
        if (!adj) return res.status(404).json({ error: 'Adjunto no encontrado.' });

        const { data: signed, error: sErr } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(adj.archivo_path, SIGNED_TTL);
        if (sErr || !signed) return res.status(500).json({ error: 'No se pudo generar el enlace.' });

        if (user.rol !== 'profesional') {
            await registrarAcceso(req, {
                accion: 'ver_adjunto_autorizacion',
                idPaciente: a.id_paciente,
                paciente: { nombre: a.paciente_nombre, dni: uno(uno(a.paciente)?.persona)?.dni || null },
                detalle: { autorizacion: a.id, adjunto: adj.id },
            });
        }

        return res.json({ url: signed.signedUrl });
    } catch (err) {
        console.error('Error firmando adjunto de autorización:', err);
        return res.status(500).json({ error: 'Error al abrir el adjunto' });
    }
};

// ---------------------------------------------------------------------------
// POST /autorizaciones/:id/resolver — el auditor aprueba o rechaza.
// ---------------------------------------------------------------------------
exports.resolver = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Autorización inválida.' });
        const { clinicaId, personaId } = req.session.user;

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        // Lectura por-JWT: fuera del alcance del auditor => 404.
        const a = await cargarAutorizacion(db, id, clinicaId);
        if (!a) return res.status(404).json({ error: 'Autorización no encontrada.' });
        if (a.estado !== 'pendiente') {
            return res.status(409).json({ error: 'La autorización ya fue resuelta o cancelada.' });
        }

        const { estado, motivo } = req.body;
        const venceEn = estado === 'aprobada' ? (req.body.venceEn || null) : null;
        if (venceEn && venceEn < hoyAR()) {
            return res.status(400).json({ error: 'El vencimiento no puede ser anterior a hoy.' });
        }

        const patch = {
            estado,
            motivo: (motivo || '').trim() || null,
            vence_en: venceEn,
            id_persona_auditor: personaId,
            auditor_nombre: await nombreActor(req),
            resuelta_en: new Date().toISOString(),
        };
        if (estado === 'aprobada') {
            patch.numero = `AUT-${hoyAR().slice(0, 4)}-${String(a.id).padStart(6, '0')}`;
        }

        const { data: upd, error } = await supabase
            .from('autorizacion')
            .update(patch)
            .eq('id', id)
            .eq('clinica_id', clinicaId)
            .eq('estado', 'pendiente') // evita resolver dos veces en paralelo
            .select('id')
            .maybeSingle();
        if (error) return errorDb(res, error);
        if (!upd) return res.status(409).json({ error: 'La autorización ya fue resuelta.' });

        await registrarAcceso(req, {
            accion: 'resolver_autorizacion',
            idPaciente: a.id_paciente,
            paciente: { nombre: a.paciente_nombre, dni: uno(uno(a.paciente)?.persona)?.dni || null },
            detalle: { autorizacion: a.id, estado, numero: patch.numero || null },
        });

        const actual = await cargarAutorizacion(db, id, clinicaId);
        return res.json({ message: 'Autorización resuelta', autorizacion: mapAutorizacion(actual, { detalle: true }) });
    } catch (err) {
        console.error('Error resolviendo autorización:', err);
        return res.status(500).json({ error: 'Error al resolver la autorización' });
    }
};

// ---------------------------------------------------------------------------
// POST /autorizaciones/:id/cancelar — el profesional que la pidió (si sigue pendiente).
// ---------------------------------------------------------------------------
exports.cancelar = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Autorización inválida.' });
        const { clinicaId, idRole } = req.session.user;

        const { data, error } = await supabase
            .from('autorizacion')
            .update({ estado: 'cancelada', resuelta_en: new Date().toISOString() })
            .eq('id', id)
            .eq('clinica_id', clinicaId)
            .eq('id_profesional', idRole || -1)
            .eq('estado', 'pendiente')
            .select('id')
            .maybeSingle();
        if (error) return errorDb(res, error);
        if (!data) return res.status(409).json({ error: 'Solo podés cancelar una solicitud tuya que siga pendiente.' });
        return res.json({ message: 'Solicitud cancelada' });
    } catch (err) {
        console.error('Error cancelando autorización:', err);
        return res.status(500).json({ error: 'Error al cancelar la solicitud' });
    }
};
