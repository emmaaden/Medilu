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
//
// Fase O: la cuenta puede tener una ficha de paciente en cada clínica donde la
// atendieron (utils/fichasPaciente). La historia junta los registros de todas, con la
// clínica de cada uno; los datos personales se muestran de la ficha principal y al
// editarlos se copian a todas.

const { supabase } = require('../config/supabaseClient');
const { serializarDiente } = require('../utils/odontograma');
const { columnasCobertura } = require('../utils/cobertura');
const { serializarCodificacion, SELECT_CODIFICACION } = require('../utils/codificacion');
const { fichasPaciente } = require('../utils/fichasPaciente');
const { canjearCodigoVinculacion } = require('../utils/cuentaPaciente');
const { registrarAcceso } = require('../utils/bitacora');
const { parseFechaNacimiento, calcEdad } = require('../utils/fechaNacimiento');

// Campos de persona que el paciente puede editar (NO dni / id_auth / clinica_id).
const CAMPOS_PERSONA = ['nombre', 'apellido', 'telefono', 'direccion', 'sexo'];

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

// Fichas de paciente de la cuenta de la sesión (la principal primero).
function getFichas(session) {
    return fichasPaciente(session.user.id);
}

// Registros clínicos de todas las fichas, con la clínica de cada uno (más viejo primero).
async function registrosDeFichas(fichas) {
    const clinicaDe = new Map(fichas.map((f) => [f.paciente.id, f.clinica]));
    const { data, error } = await supabase
        .from('registro_clinico')
        .select(`id, id_paciente, fecha, profesional_nombre, area, sintomas, diagnostico, tratamiento, origen,
            clinica(nombre), registro_diente(numero, condicion, cara, estado, notas), ${SELECT_CODIFICACION}`)
        .in('id_paciente', fichas.map((f) => f.paciente.id))
        .order('fecha', { ascending: true });
    if (error) throw error;
    return (data || []).map((r) => ({
        ...r,
        clinicaNombre: (r.clinica && r.clinica.nombre) || clinicaDe.get(r.id_paciente) || null,
    }));
}

// ---------------------------------------------------------------------------
// GET /api/mi-cuenta/perfil  -> datos del paciente para mostrar/editar.
// ---------------------------------------------------------------------------
exports.getPerfil = async (req, res) => {
    try {
        const fichas = await getFichas(req.session);
        if (fichas.length === 0) return res.status(404).json({ error: 'No encontramos tus datos.' });
        const { persona, paciente } = fichas[0];

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
        const fnac = parseFechaNacimiento(req.body.fechaNacimiento);
        if (!fnac.ok) return res.status(400).json({ error: fnac.error });

        const fichas = await getFichas(req.session);
        if (fichas.length === 0) return res.status(404).json({ error: 'No encontramos tus datos.' });

        // Solo campos permitidos (el dni y la identidad NO se tocan).
        const updatePersona = {};
        for (const campo of CAMPOS_PERSONA) {
            if (req.body[campo] !== undefined) updatePersona[campo] = req.body[campo] || null;
        }
        if (req.body.email !== undefined) updatePersona.email = req.body.email || null;
        if (req.body.fechaNacimiento !== undefined) {
            updatePersona.fecha_nacimiento = fnac.fecha;
        }

        if (Object.keys(updatePersona).length > 0) {
            // Fase O: es la misma persona en todas sus clínicas.
            const { error } = await supabase
                .from('persona')
                .update(updatePersona)
                .in('id', fichas.map((f) => f.persona.id));
            if (error) throw error;
        }

        // Obra social vive en paciente. Fase K: del catálogo (global o de su clínica)
        // + afiliado + plan; el texto libre queda solo por compatibilidad.
        // Fase O: se valida contra la clínica de la ficha principal (el formulario ofrece
        // ese catálogo) y se copia a las demás fichas donde esa obra social es válida
        // (una propia de otra clínica no se copia; afiliado y plan, sí).
        const principal = await columnasCobertura(req.body, fichas[0].clinicaId);
        if (!principal.ok) return res.status(400).json({ error: principal.error });
        for (const { paciente, clinicaId } of fichas) {
            let cob = await columnasCobertura(req.body, clinicaId);
            const osValida = cob.ok;
            if (!osValida) cob = await columnasCobertura({ ...req.body, idObraSocial: undefined }, clinicaId);
            const cols = { ...cob.cols };
            if (osValida && req.body.obraSocial !== undefined && cols.id_obra_social === undefined) {
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
        const fichas = await getFichas(req.session);
        if (fichas.length === 0) return res.status(404).json({ error: 'No encontramos tu ficha de paciente.' });
        const { persona, paciente } = fichas[0];
        const registros = await registrosDeFichas(fichas);

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
                    clinica: r.clinicaNombre, // Fase O: de qué clínica es cada registro
                    importado: !!r.origen,
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
        const fichas = await getFichas(req.session);
        if (fichas.length === 0) return res.status(404).json({ error: 'No encontramos tu ficha de paciente.' });
        const { persona, paciente } = fichas[0];
        const registros = await registrosDeFichas(fichas);

        const history = registros.map(r => ({
            clinica: r.clinicaNombre || '',
            profesional: r.profesional_nombre || '',
            area: r.area || '',
            fecha: fmtFechaHora(r.fecha),
            importado: !!r.origen, // de otro sistema (import de HC)
            sintomas: r.sintomas || '',
            diagnostico: r.diagnostico || '',
            tratamiento: r.tratamiento || '',
            dientes: (r.registro_diente || []).map(serializarDiente),
            ...serializarCodificacion(r),
        }));

        const fechaApertura = registros.length > 0 ? fmtFecha(registros[0].fecha) : '';

        return res.json({
            fullName: [persona.nombre, persona.apellido].filter(Boolean).join(' '),
            telefono: persona.telefono || '',
            email: persona.email || '',
            dni: persona.dni || '',
            sexo: persona.sexo || '',
            direccion: persona.direccion || '',
            fechaNacimiento: fmtFecha(persona.fecha_nacimiento),
            edad: String(calcEdad(persona.fecha_nacimiento) ?? ''),
            obraSocial: paciente.obra_social || '',
            nroAfiliado: paciente.nro_afiliado || '',
            plan: paciente.plan || '',
            fechaApertura,
            // Fase O: clínicas donde tiene ficha (las de los registros, para el encabezado).
            clinicas: [...new Set(fichas.map((f) => f.clinica).filter(Boolean))],
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
    'codigo_vinculacion', 'vincular_historia',
];

exports.misAccesos = async (req, res) => {
    try {
        const fichas = await getFichas(req.session);
        if (fichas.length === 0) return res.json({ accesos: [] });
        const clinicaDe = new Map(fichas.map((f) => [f.paciente.id, f.clinica]));

        const { data, error } = await supabase
            .from('hc_acceso')
            .select('id, creado_en, actor_nombre, actor_rol, accion, id_paciente')
            .in('id_paciente', [...clinicaDe.keys()])
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
                clinica: clinicaDe.get(a.id_paciente) || '',
            })),
        });
    } catch (err) {
        console.error('Error en mi-cuenta/accesos:', err);
        return res.status(500).json({ error: 'Error al obtener los accesos a tu historia clínica.' });
    }
};

// ---------------------------------------------------------------------------
// Fase V: POST /api/mi-cuenta/vincular-historia -> suma a la cuenta la ficha de un
// consultorio que la cargó sin email, con el código que le dio el profesional.
// Cualquier problema responde lo mismo (no revela si el código existe ni de quién es).
// ---------------------------------------------------------------------------
exports.vincularHistoria = async (req, res) => {
    try {
        const r = await canjearCodigoVinculacion({ authId: req.session.user.id, codigo: req.body.codigo });
        if (!r) {
            return res.status(400).json({
                error: 'El código no es válido o venció. Revisalo o pedile uno nuevo a tu profesional.',
            });
        }
        await registrarAcceso(req, {
            accion: 'vincular_historia',
            idPaciente: r.idPaciente,
            paciente: r.paciente,
            clinicaId: r.clinicaId, // la de la ficha: así la clínica lo ve en su auditoría
        });
        return res.json({ clinica: r.clinica });
    } catch (err) {
        console.error('Error en mi-cuenta/vincular-historia:', err);
        return res.status(500).json({ error: 'No se pudo vincular la historia clínica.' });
    }
};
