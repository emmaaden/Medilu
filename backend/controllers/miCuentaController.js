// Autogestión del paciente logueado (Fase 3): ver/editar sus datos y ver su
// propia historia clínica (solo lectura).
//
// SEGURIDAD: la identidad se toma SIEMPRE de la sesión del servidor, nunca del body:
//   - req.session.user.id     -> persona.id_auth (auth.users)
//   - req.session.user.idRole -> paciente.id
// Se usa el cliente service_role filtrando por esos ids de la sesión. No se usa el
// cliente "como usuario" (RLS por JWT) porque el paciente no tiene clinica_id y las
// políticas por tenant no lo habilitarían; el filtrado por id de sesión es el control.
// Las rutas pasan por requireRole('paciente') (ver routes/miCuentaRoutes.js).

const { supabase } = require('../config/supabaseClient');
const { serializarDiente } = require('../utils/odontograma');
const { columnasCobertura } = require('../utils/cobertura');
const { serializarCodificacion, SELECT_CODIFICACION } = require('../utils/codificacion');

// Campos de persona que el paciente puede editar (NO dni / id_auth / clinica_id).
const CAMPOS_PERSONA = ['nombre', 'apellido', 'telefono', 'direccion', 'sexo'];

// Normaliza fecha de nacimiento a ISO 'YYYY-MM-DD' (acepta 'dd/mm/yyyy' o ISO).
function parseFechaNacimiento(f) {
    if (!f) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(f)) return f.slice(0, 10);
    const m = String(f).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
        const [, d, mo, y] = m;
        const yr = y.length === 2 ? `20${y}` : y;
        return `${yr}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return null;
}

function calcEdad(fnac) {
    if (!fnac) return '';
    const b = new Date(fnac);
    if (isNaN(b.getTime())) return '';
    const t = new Date();
    let edad = t.getFullYear() - b.getFullYear();
    const mm = t.getMonth() - b.getMonth();
    if (mm < 0 || (mm === 0 && t.getDate() < b.getDate())) edad--;
    return String(edad);
}

function fmtFechaHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
    });
}

function fmtFecha(iso) {
    if (!iso) return '';
    const s = String(iso);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
}

// Persona (por id_auth de la sesión) + su fila paciente. Devuelve null si no existe.
async function getPersonaPaciente(session) {
    const authId = session.user.id;
    const { data, error } = await supabase
        .from('persona')
        .select('id, clinica_id, nombre, apellido, dni, telefono, direccion, sexo, fecha_nacimiento, email, paciente(id, obra_social, id_obra_social, nro_afiliado, plan)')
        .eq('id_auth', authId)
        .maybeSingle();
    if (error) throw error;
    return data || null;
}

// ---------------------------------------------------------------------------
// GET /api/mi-cuenta/perfil  -> datos del paciente para mostrar/editar.
// ---------------------------------------------------------------------------
exports.getPerfil = async (req, res) => {
    try {
        const persona = await getPersonaPaciente(req.session);
        if (!persona) return res.status(404).json({ error: 'No encontramos tus datos.' });
        const paciente = persona.paciente && persona.paciente[0];

        return res.json({
            nombre: persona.nombre || '',
            apellido: persona.apellido || '',
            dni: persona.dni || '',          // solo lectura en el front
            telefono: persona.telefono || '',
            direccion: persona.direccion || '',
            sexo: persona.sexo || '',
            email: persona.email || '',
            fechaNacimiento: persona.fecha_nacimiento || '', // ISO 'YYYY-MM-DD'
            obraSocial: (paciente && paciente.obra_social) || '',
            // Fase K: cobertura estructurada.
            idObraSocial: (paciente && paciente.id_obra_social) || null,
            nroAfiliado: (paciente && paciente.nro_afiliado) || '',
            plan: (paciente && paciente.plan) || '',
        });
    } catch (err) {
        console.error('Error en mi-cuenta/perfil (GET):', err);
        return res.status(500).json({ error: 'Error al obtener tus datos.' });
    }
};

// ---------------------------------------------------------------------------
// PUT /api/mi-cuenta/perfil  -> actualiza los datos editables del paciente.
// ---------------------------------------------------------------------------
exports.updatePerfil = async (req, res) => {
    try {
        const persona = await getPersonaPaciente(req.session);
        if (!persona) return res.status(404).json({ error: 'No encontramos tus datos.' });

        // Solo campos permitidos (el dni y la identidad NO se tocan).
        const updatePersona = {};
        for (const campo of CAMPOS_PERSONA) {
            if (req.body[campo] !== undefined) updatePersona[campo] = req.body[campo] || null;
        }
        if (req.body.email !== undefined) updatePersona.email = req.body.email || null;
        if (req.body.fechaNacimiento !== undefined) {
            updatePersona.fecha_nacimiento = parseFechaNacimiento(req.body.fechaNacimiento);
        }

        if (Object.keys(updatePersona).length > 0) {
            const { error } = await supabase
                .from('persona')
                .update(updatePersona)
                .eq('id', persona.id);
            if (error) throw error;
        }

        // Obra social vive en paciente. Fase K: del catálogo (global o de su clínica)
        // + afiliado + plan; el texto libre queda solo por compatibilidad.
        const paciente = persona.paciente && persona.paciente[0];
        if (paciente) {
            const cob = await columnasCobertura(req.body, persona.clinica_id || null);
            if (!cob.ok) return res.status(400).json({ error: cob.error });
            const cols = { ...cob.cols };
            if (req.body.obraSocial !== undefined && cols.id_obra_social === undefined) {
                cols.obra_social = req.body.obraSocial || null;
                cols.id_obra_social = null;
            }
            if (Object.keys(cols).length) {
                const { error } = await supabase.from('paciente').update(cols).eq('id', paciente.id);
                if (error) throw error;
            }
        }

        return res.json({ message: 'Datos actualizados.' });
    } catch (err) {
        console.error('Error en mi-cuenta/perfil (PUT):', err);
        return res.status(500).json({ error: 'Error al guardar tus datos.' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/mi-cuenta/historia/export  -> HC propia en formato estructurado (JSON),
// mismo formato 'medilu.hc' que el export del profesional (portable/re-importable).
// Ley 26.529: derecho del paciente a una copia de su información.
// ---------------------------------------------------------------------------
exports.exportHistoria = async (req, res) => {
    try {
        const persona = await getPersonaPaciente(req.session);
        if (!persona) return res.status(404).json({ error: 'No encontramos tus datos.' });
        const paciente = persona.paciente && persona.paciente[0];
        if (!paciente) return res.status(404).json({ error: 'No encontramos tu ficha de paciente.' });

        const { data: registros, error } = await supabase
            .from('registro_clinico')
            .select(`id, fecha, profesional_nombre, area, sintomas, diagnostico, tratamiento,
                registro_diente(numero, condicion, cara, estado, notas), ${SELECT_CODIFICACION}`)
            .eq('id_paciente', paciente.id)
            .order('fecha', { ascending: true });
        if (error) throw error;

        const doc = {
            formato: 'medilu.hc',
            version: '1.0',
            generadoEn: new Date().toISOString(),
            alcance: 'paciente',
            totalPacientes: 1,
            pacientes: [{
                dni: persona.dni || null,
                nombre: persona.nombre || null,
                apellido: persona.apellido || null,
                fechaNacimiento: persona.fecha_nacimiento || null,
                sexo: persona.sexo || null,
                telefono: persona.telefono || null,
                email: persona.email || null,
                direccion: persona.direccion || null,
                obraSocial: paciente.obra_social || null,
                nroAfiliado: paciente.nro_afiliado || null,
                plan: paciente.plan || null,
                registros: (registros || []).map((r) => ({
                    origenId: r.id,
                    fecha: r.fecha,
                    profesional: r.profesional_nombre || null,
                    area: r.area || null,
                    sintomas: r.sintomas || null,
                    diagnostico: r.diagnostico || null,
                    tratamiento: r.tratamiento || null,
                    odontograma: (r.registro_diente || []).map(serializarDiente),
                    ...serializarCodificacion(r),
                })),
            }],
        };

        const fecha = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="mi-historia-clinica-${fecha}.json"`);
        return res.send(JSON.stringify(doc, null, 2));
    } catch (err) {
        console.error('Error en mi-cuenta/historia/export:', err);
        return res.status(500).json({ error: 'Error al exportar tu historia clínica.' });
    }
};

// ---------------------------------------------------------------------------
// GET /api/mi-cuenta/historia  -> historia clínica propia (solo lectura).
// Mismo shape que /pacient/get-data-pacient, para reutilizar el PDF en el front.
// ---------------------------------------------------------------------------
exports.getHistoria = async (req, res) => {
    try {
        const persona = await getPersonaPaciente(req.session);
        if (!persona) return res.status(404).json({ error: 'No encontramos tus datos.' });
        const paciente = persona.paciente && persona.paciente[0];
        if (!paciente) return res.status(404).json({ error: 'No encontramos tu ficha de paciente.' });

        const { data: registros, error: regError } = await supabase
            .from('registro_clinico')
            .select(`id, profesional_nombre, area, fecha, sintomas, diagnostico, tratamiento,
                registro_diente(numero, condicion, cara, estado, notas), ${SELECT_CODIFICACION}`)
            .eq('id_paciente', paciente.id)
            .order('fecha', { ascending: true });
        if (regError) throw regError;

        const history = (registros || []).map(r => ({
            profesional: r.profesional_nombre || '',
            area: r.area || '',
            fecha: fmtFechaHora(r.fecha),
            sintomas: r.sintomas || '',
            diagnostico: r.diagnostico || '',
            tratamiento: r.tratamiento || '',
            dientes: (r.registro_diente || []).map(serializarDiente),
            ...serializarCodificacion(r),
        }));

        const fechaApertura = registros && registros.length > 0 ? fmtFecha(registros[0].fecha) : '';

        return res.json({
            fullName: [persona.nombre, persona.apellido].filter(Boolean).join(' '),
            telefono: persona.telefono || '',
            email: persona.email || '',
            dni: persona.dni || '',
            sexo: persona.sexo || '',
            direccion: persona.direccion || '',
            fechaNacimiento: fmtFecha(persona.fecha_nacimiento),
            edad: calcEdad(persona.fecha_nacimiento),
            obraSocial: paciente.obra_social || '',
            nroAfiliado: paciente.nro_afiliado || '',
            plan: paciente.plan || '',
            fechaApertura,
            history,
        });
    } catch (err) {
        console.error('Error en mi-cuenta/historia:', err);
        return res.status(500).json({ error: 'Error al obtener tu historia clínica.' });
    }
};

// ---------------------------------------------------------------------------
// Fase K: GET /api/mi-cuenta/accesos -> quién accedió a MI historia clínica
// (bitácora hc_acceso). Transparencia para el paciente (Ley 26.529). No expone la IP
// ni el user-agent de quien accedió.
// ---------------------------------------------------------------------------
const ACCIONES_PACIENTE = [
    'ver_hc', 'crear_registro', 'registrar_paciente', 'exportar_hc', 'importar_hc',
    'ver_registro_auditoria', 'revisar', 'responder',
    'solicitar_autorizacion', 'ver_autorizacion', 'resolver_autorizacion',
    'ver_adjunto_autorizacion', 'editar_cobertura',
];

exports.misAccesos = async (req, res) => {
    try {
        const persona = await getPersonaPaciente(req.session);
        const paciente = persona && persona.paciente && persona.paciente[0];
        if (!paciente) return res.json({ accesos: [] });

        const { data, error } = await supabase
            .from('hc_acceso')
            .select('id, creado_en, actor_nombre, actor_rol, accion')
            .eq('id_paciente', paciente.id)
            .in('accion', ACCIONES_PACIENTE)
            .order('creado_en', { ascending: false })
            .limit(200);
        if (error) throw error;

        return res.json({
            accesos: (data || []).map((a) => ({
                id: a.id,
                fecha: a.creado_en,
                actor: a.actor_nombre || '',
                rol: a.actor_rol || '',
                accion: a.accion,
            })),
        });
    } catch (err) {
        console.error('Error en mi-cuenta/accesos:', err);
        return res.status(500).json({ error: 'Error al obtener los accesos a tu historia clínica.' });
    }
};
