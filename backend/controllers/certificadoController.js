// Certificados médicos (Fase C).
// - El profesional carga su firma/sello y emite certificados (generado | subido).
// - El paciente descarga los suyos.
//
// Storage: buckets PRIVADOS ('firmas' y 'certificados'). Los objetos se suben/bajan
// por el backend con service_role y se entregan como URLs firmadas de corta duración.
// La tabla `certificado_medico` lleva la RLS (profesional por clínica activa; paciente
// dueño), así que las lecturas/altas de filas se hacen con el cliente por-JWT.

const crypto = require('crypto');
const { supabase } = require('../config/supabaseClient');       // service_role (storage)
const { getUserSupabase } = require('../middleware/userSupabase'); // por-JWT (RLS de la tabla)
const { misPacienteIds } = require('../utils/fichasPaciente');
const { generarCertificadoPdf } = require('../utils/certificadoPdf');
const { errorDb } = require('../utils/errores');

const FIRMA_BUCKET = 'firmas';
const CERT_BUCKET = 'certificados';
const SIGNED_TTL = 120; // segundos de validez de la URL firmada

function extDeMime(mime) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (m.includes('pdf')) return 'pdf';
    return 'bin';
}

// Datos del profesional autenticado (perfil + firma) por su id de sesión.
async function getProfesional(idRole) {
    const { data, error } = await supabase
        .from('profesional')
        .select('id, matricula, firma_path, firma_mime, persona:id_persona ( nombre, apellido )')
        .eq('id', idRole)
        .maybeSingle();
    if (error) throw error;
    const per = data?.persona;
    const persona = Array.isArray(per) ? per[0] : per;
    return data
        ? {
              id: data.id,
              matricula: data.matricula,
              firmaPath: data.firma_path,
              firmaMime: data.firma_mime,
              nombre: [persona?.nombre, persona?.apellido].filter(Boolean).join(' '),
          }
        : null;
}

// Resuelve un paciente por DNI dentro de la clínica activa (RLS por-JWT lo acota).
async function resolverPaciente(db, dni) {
    const { data, error } = await db
        .from('persona')
        .select('id, nombre, apellido, dni, paciente ( id )')
        .eq('dni', String(dni).trim())
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const pac = Array.isArray(data.paciente) ? data.paciente[0] : data.paciente;
    if (!pac?.id) return null;
    return {
        idPaciente: pac.id,
        nombre: [data.nombre, data.apellido].filter(Boolean).join(' '),
        dni: data.dni,
    };
}

// GET /certificados/firma — ¿el profesional ya cargó su firma?
exports.estadoFirma = async (req, res) => {
    try {
        const prof = await getProfesional(req.session.user.idRole);
        return res.json({ tieneFirma: !!prof?.firmaPath });
    } catch (err) {
        console.error('Error en estadoFirma:', err);
        return res.status(500).json({ error: 'Error al consultar la firma' });
    }
};

// POST /certificados/firma — sube/reemplaza la firma o sello del profesional.
exports.subirFirma = async (req, res) => {
    try {
        const idRole = req.session.user.idRole;
        const authId = req.session.user.id;
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No se subió ninguna imagen.' });

        const ext = extDeMime(file.mimetype);
        if (!['png', 'jpg'].includes(ext)) {
            return res.status(400).json({ error: 'La firma debe ser una imagen PNG o JPG.' });
        }

        const path = `${authId}.${ext}`;
        const { error: upErr } = await supabase.storage
            .from(FIRMA_BUCKET)
            .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });
        if (upErr) throw upErr;

        const { error: updErr } = await supabase
            .from('profesional')
            .update({ firma_path: path, firma_mime: file.mimetype })
            .eq('id', idRole);
        if (updErr) throw updErr;

        return res.json({ message: 'Firma cargada', tieneFirma: true });
    } catch (err) {
        console.error('Error subiendo firma:', err);
        return res.status(500).json({ error: 'Error al subir la firma' });
    }
};

// POST /certificados/generar — arma un PDF (con la firma embebida) y lo guarda.
exports.generar = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const { dni, motivo, diagnostico, indicaciones, diasReposo } = req.body;
        if (!dni) return res.status(400).json({ error: 'Indicá el DNI del paciente.' });

        const prof = await getProfesional(req.session.user.idRole);
        if (!prof) return res.status(400).json({ error: 'No se encontró tu perfil profesional.' });
        if (!prof.firmaPath) {
            return res.status(400).json({ error: 'Cargá tu firma o sello antes de generar un certificado.' });
        }

        const paciente = await resolverPaciente(db, dni);
        if (!paciente) return res.status(404).json({ error: 'No se encontró un paciente con ese DNI en tu clínica.' });

        // Nombre de la clínica (para el encabezado del PDF).
        const { data: cli } = await db.from('clinica').select('nombre').eq('id', clinicaId).maybeSingle();

        // Descargar la firma (bucket privado, service_role).
        const { data: firmaBlob, error: firmaErr } = await supabase.storage
            .from(FIRMA_BUCKET)
            .download(prof.firmaPath);
        if (firmaErr) throw firmaErr;
        const firmaBuffer = Buffer.from(await firmaBlob.arrayBuffer());

        const pdfBytes = await generarCertificadoPdf({
            clinicaNombre: cli?.nombre || 'Clínica',
            pacienteNombre: paciente.nombre,
            pacienteDni: paciente.dni,
            profesionalNombre: prof.nombre,
            matricula: prof.matricula,
            motivo, diagnostico, indicaciones,
            diasReposo: diasReposo ? Number(diasReposo) : null,
            fecha: new Date(),
            firmaBuffer,
            firmaMime: prof.firmaMime,
        });

        const path = `${clinicaId}/${crypto.randomUUID()}.pdf`;
        const { error: upErr } = await supabase.storage
            .from(CERT_BUCKET)
            .upload(path, Buffer.from(pdfBytes), { contentType: 'application/pdf', upsert: false });
        if (upErr) throw upErr;

        const { data: row, error: insErr } = await db
            .from('certificado_medico')
            .insert({
                clinica_id: clinicaId,
                id_profesional: prof.id,
                id_paciente: paciente.idPaciente,
                tipo: 'generado',
                archivo_path: path,
                archivo_mime: 'application/pdf',
                motivo: motivo || null,
                diagnostico: diagnostico || null,
                indicaciones: indicaciones || null,
                dias_reposo: diasReposo ? Number(diasReposo) : null,
                paciente_nombre: paciente.nombre,
                profesional_nombre: prof.nombre,
            })
            .select('id')
            .single();
        if (insErr) {
            // Compensación: si no se pudo registrar, borrar el archivo huérfano.
            await supabase.storage.from(CERT_BUCKET).remove([path]).catch(() => {});
            throw insErr;
        }

        return res.status(201).json({ message: 'Certificado generado', id: row.id });
    } catch (err) {
        console.error('Error generando certificado:', err);
        return res.status(500).json({ error: 'Error al generar el certificado' });
    }
};

// POST /certificados/subir — guarda la foto/PDF de un certificado físico.
exports.subir = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const file = req.file;
        const { dni } = req.body;
        if (!dni) return res.status(400).json({ error: 'Indicá el DNI del paciente.' });
        if (!file) return res.status(400).json({ error: 'Adjuntá la imagen o el PDF del certificado.' });

        const ext = extDeMime(file.mimetype);
        if (!['png', 'jpg', 'pdf'].includes(ext)) {
            return res.status(400).json({ error: 'El archivo debe ser una imagen (PNG/JPG) o un PDF.' });
        }

        const prof = await getProfesional(req.session.user.idRole);
        const paciente = await resolverPaciente(db, dni);
        if (!paciente) return res.status(404).json({ error: 'No se encontró un paciente con ese DNI en tu clínica.' });

        const path = `${clinicaId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
            .from(CERT_BUCKET)
            .upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
        if (upErr) throw upErr;

        const { data: row, error: insErr } = await db
            .from('certificado_medico')
            .insert({
                clinica_id: clinicaId,
                id_profesional: prof?.id || null,
                id_paciente: paciente.idPaciente,
                tipo: 'subido',
                archivo_path: path,
                archivo_mime: file.mimetype,
                paciente_nombre: paciente.nombre,
                profesional_nombre: prof?.nombre || null,
            })
            .select('id')
            .single();
        if (insErr) {
            await supabase.storage.from(CERT_BUCKET).remove([path]).catch(() => {});
            throw insErr;
        }

        return res.status(201).json({ message: 'Certificado subido', id: row.id });
    } catch (err) {
        console.error('Error subiendo certificado:', err);
        return res.status(500).json({ error: 'Error al subir el certificado' });
    }
};

// Mapea una fila a la vista pública (sin el path interno del storage).
function vista(c) {
    return {
        id: c.id,
        tipo: c.tipo,
        motivo: c.motivo,
        diagnostico: c.diagnostico,
        indicaciones: c.indicaciones,
        diasReposo: c.dias_reposo,
        pacienteNombre: c.paciente_nombre,
        profesionalNombre: c.profesional_nombre,
        emitidoEn: c.emitido_en,
        esImagen: (c.archivo_mime || '').startsWith('image/'),
    };
}

// GET /certificados?dni=... — lista los certificados de un paciente (profesional).
exports.listarPorPaciente = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const { dni } = req.query;
        if (!dni) return res.status(400).json({ error: 'Indicá el DNI del paciente.' });

        const paciente = await resolverPaciente(db, dni);
        if (!paciente) return res.json({ paciente: null, certificados: [] });

        const { data, error } = await db
            .from('certificado_medico')
            .select('id, tipo, motivo, diagnostico, indicaciones, dias_reposo, paciente_nombre, profesional_nombre, archivo_mime, emitido_en')
            .eq('id_paciente', paciente.idPaciente)
            .order('emitido_en', { ascending: false });
        if (error) return errorDb(res, error);

        return res.json({
            paciente: { nombre: paciente.nombre, dni: paciente.dni },
            certificados: (data || []).map(vista),
        });
    } catch (err) {
        console.error('Error listando certificados:', err);
        return res.status(500).json({ error: 'Error al listar los certificados' });
    }
};

// GET /mis-certificados — el paciente autenticado lista los suyos.
exports.misCertificados = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const { data, error } = await db
            .from('certificado_medico')
            .select('id, tipo, motivo, diagnostico, indicaciones, dias_reposo, paciente_nombre, profesional_nombre, archivo_mime, emitido_en')
            // Fase O: los de todas sus fichas; solo los propios aunque la cuenta sea staff.
            .in('id_paciente', await misPacienteIds(req.session.user))
            .order('emitido_en', { ascending: false });
        if (error) return errorDb(res, error);

        return res.json({ certificados: (data || []).map(vista) });
    } catch (err) {
        console.error('Error en mis-certificados:', err);
        return res.status(500).json({ error: 'Error al obtener tus certificados' });
    }
};

// GET /certificados/:id/descargar — URL firmada del archivo, validando acceso por RLS.
exports.descargar = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });

        const id = Number(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: 'Certificado inválido.' });

        // La RLS de SELECT devuelve la fila solo si el usuario es el paciente dueño
        // o un profesional de la clínica del certificado.
        const { data: cert, error } = await db
            .from('certificado_medico')
            .select('id, archivo_path, clinica_id')
            .eq('id', id)
            .maybeSingle();
        if (error) return errorDb(res, error);
        if (!cert) return res.status(404).json({ error: 'Certificado no encontrado.' });
        // El archivo tiene que estar en la carpeta de la clínica del certificado: la fila
        // la puede insertar un miembro por la API y acá se firma con service_role (#11).
        const p = cert.archivo_path;
        if (typeof p !== 'string' || !cert.clinica_id || p.includes('..') || !p.startsWith(`${cert.clinica_id}/`)) {
            return res.status(404).json({ error: 'Certificado no encontrado.' });
        }

        // Firmar con service_role (bucket privado).
        const { data: signed, error: signErr } = await supabase.storage
            .from(CERT_BUCKET)
            .createSignedUrl(p, SIGNED_TTL);
        if (signErr || !signed) return res.status(500).json({ error: 'No se pudo generar el enlace.' });

        return res.json({ url: signed.signedUrl });
    } catch (err) {
        console.error('Error descargando certificado:', err);
        return res.status(500).json({ error: 'Error al descargar el certificado' });
    }
};
