// Fase AA: link para que el paciente cargue sus datos personales.
//
// El profesional genera un link (POST /pacient/link-datos) y se lo manda al paciente
// por WhatsApp, email o como quiera. El paciente lo abre SIN cuenta (/completar-datos)
// y carga sus datos personales y su cobertura, que quedan en la ficha de la clínica.
//
//   - Link "nuevo" (sin paciente): crea la ficha (persona + paciente) en la clínica
//     del link. Si ya hay un paciente con ese DNI en la clínica, SOLO completa los
//     datos que le faltan (no pisa nada ni toca el email): el link no prueba que
//     quien lo abre sea ese paciente.
//   - Link de un paciente existente: hay que escribir el DNI de la ficha (a los 5
//     intentos fallidos el link se anula). Lo cargado reemplaza los datos de la
//     ficha, salvo el DNI (identifica la ficha) y, si tiene cuenta en Medilu, el
//     email (es su acceso; lo cambia él desde su perfil).
//
// SEGURIDAD
//   - En la base se guarda SOLO el hash del token (utils/turnoToken.js): si se filtrara
//     la tabla, los links no se pueden reconstruir.
//   - Un solo uso y vencimiento a los DIAS_VIGENCIA días. El link se "reclama" con un
//     UPDATE condicional antes de escribir nada, así dos envíos a la vez no cargan
//     dos veces. Si la carga falla, se libera para que el paciente reintente.
//   - La vista pública no devuelve datos del paciente: solo el nombre de la clínica y
//     del profesional (quien tiene el link ya sabe a quién se lo pidieron).
//   - Las rutas públicas tienen un rate limit propio (routes/linkDatosRoutes.js).
//   - Todo lo público corre con service_role, acotado a la clínica del link.

const { supabase } = require('../config/supabaseClient');
const { getUserSupabase } = require('../middleware/userSupabase');
const { generarTokenGestion, hashToken } = require('../utils/turnoToken');
const { registrarAcceso, registrarAccesoPaciente, nombreActor } = require('../utils/bitacora');
const { columnasCobertura, listarObrasSociales } = require('../utils/cobertura');
const { parseFechaNacimiento } = require('../utils/fechaNacimiento');
const { crearCuentaPaciente, enviarAlPaciente, nombreClinica } = require('../utils/cuentaPaciente');
const { isMailerConfigured } = require('../utils/mailer');
const { layoutMail, parrafo, boton, nota, esc } = require('../utils/emailLayout');
const { notificar } = require('../utils/notificaciones');

const DIAS_VIGENCIA = 7;
const MAX_INTENTOS_DNI = 5;
const ERR_LINK = 'El link no es válido o ya venció. Pedile uno nuevo al profesional.';
const ERR_USADO = 'Este link ya se usó. Si necesitás corregir algo, pedile uno nuevo al profesional.';

// Base pública de los links: APP_URL en producción; en desarrollo, el origen del
// panel que lo pidió (el front corre en otro puerto que el backend).
function urlBase(req) {
    return (process.env.APP_URL || req.get('origin') || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

const nombreCompleto = (p) => [p.nombre, p.apellido].filter(Boolean).join(' ');
const limpio = (v) => (v === undefined || v === null ? '' : String(v).trim());

// Link vigente (sin usar y sin vencer) por su token, o { error, status }.
async function buscarLink(token) {
    const { data: link, error } = await supabase
        .from('link_datos_paciente')
        .select('id, clinica_id, id_paciente, creado_por, creado_por_nombre, vence_en, usado_en, intentos')
        .eq('token_hash', hashToken(String(token).trim()))
        .maybeSingle();
    if (error) throw error;
    if (!link || new Date(link.vence_en) <= new Date()) return { status: 404, error: ERR_LINK };
    if (link.usado_en) return { status: 410, error: ERR_USADO };
    return { link };
}

// ---------------------------------------------------------------------------
// POST /pacient/link-datos  { dni?, email? }  (rol profesional)
// Genera el link. Con `dni`, para completar la ficha de ese paciente de la clínica.
// Con `email`, además se lo manda por mail. Respuesta: { url, venceEn, mailEnviado? }
// ---------------------------------------------------------------------------
exports.crearLink = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'Tu usuario no tiene una clínica asignada.' });

        const dni = limpio(req.body.dni);
        const email = limpio(req.body.email).toLowerCase();

        let paciente = null; // { id, nombre, dni }
        if (dni) {
            const db = await getUserSupabase(req);
            if (!db) return res.status(401).json({ error: 'Tu sesión expiró. Iniciá sesión de nuevo.' });
            const { data: persona, error } = await db
                .from('persona')
                .select('nombre, apellido, dni, paciente(id)')
                .eq('dni', dni)
                .eq('clinica_id', clinicaId)
                .maybeSingle();
            if (error) throw error;
            if (!persona || !persona.paciente || !persona.paciente[0]) {
                return res.status(404).json({ error: 'Paciente no encontrado.' });
            }
            paciente = { id: persona.paciente[0].id, nombre: nombreCompleto(persona), pila: persona.nombre || '', dni: persona.dni };
        }

        const profesional = await nombreActor(req);
        const { token, hash } = generarTokenGestion();
        const venceEn = new Date(Date.now() + DIAS_VIGENCIA * 24 * 60 * 60 * 1000).toISOString();

        const { error: insErr } = await supabase.from('link_datos_paciente').insert({
            token_hash: hash,
            clinica_id: clinicaId,
            id_paciente: paciente ? paciente.id : null,
            creado_por: req.session.user.personaId || null,
            creado_por_nombre: profesional || null,
            vence_en: venceEn,
        });
        if (insErr) throw insErr;

        const url = `${urlBase(req)}/completar-datos?token=${encodeURIComponent(token)}`;

        let mailEnviado;
        if (email) {
            mailEnviado = isMailerConfigured()
                ? await mandarMail({
                    email,
                    nombre: paciente ? paciente.pila : '',
                    clinica: await nombreClinica(clinicaId),
                    profesional,
                    url,
                }).then(() => true, (e) => {
                    console.error('Link de datos: no se pudo mandar el mail:', e.message || e);
                    return false;
                })
                : false;
        }

        await registrarAcceso(req, {
            accion: 'link_datos',
            idPaciente: paciente ? paciente.id : null,
            paciente: paciente ? { nombre: paciente.nombre, dni: paciente.dni } : null,
            detalle: { nuevo: !paciente, ...(email ? { porEmail: true } : {}) },
        });

        return res.status(201).json({ url, venceEn, ...(mailEnviado !== undefined ? { mailEnviado } : {}) });
    } catch (err) {
        console.error('Error generando el link de datos:', err);
        return res.status(500).json({ error: 'No se pudo generar el link.' });
    }
};

function mandarMail({ email, nombre, clinica, profesional, url }) {
    const quien = profesional ? `${profesional}${clinica ? ` (${clinica})` : ''}` : clinica || 'Tu profesional';
    const hola = nombre ? `Hola ${nombre},` : 'Hola,';
    const text = [
        hola,
        `${quien} te pide que completes tus datos personales para tu historia clínica.`,
        `Completalos acá: ${url}`,
        `El link es personal y vence en ${DIAS_VIGENCIA} días.`,
        'Medilu.',
    ].join('\n\n');
    const cuerpo = [
        parrafo(`${esc(hola)} ${esc(quien)} te pide que completes tus datos personales para tu historia clínica. Te lleva un par de minutos.`),
        boton(url, 'Completar mis datos'),
        nota(`El link es personal: no lo reenvíes. Vence en ${DIAS_VIGENCIA} días y se puede usar una sola vez.`),
    ].join('\n');
    return enviarAlPaciente({
        to: email,
        subject: 'Completá tus datos - Medilu',
        text,
        html: layoutMail({ titulo: 'Completá tus datos', resumen: `${quien} te pide tus datos para la historia clínica.`, cuerpo }),
    });
}

// ---------------------------------------------------------------------------
// GET /api/datos-paciente?token=  (público)
// Qué link es: clínica, profesional, si es de un paciente existente y las obras
// sociales de la clínica. NO devuelve datos del paciente.
// ---------------------------------------------------------------------------
exports.verLink = async (req, res) => {
    try {
        const r = await buscarLink(req.query.token);
        if (r.error) return res.status(r.status).json({ error: r.error, ...(r.status === 410 ? { usado: true } : {}) });
        const { link } = r;

        const [clinica, obrasSociales] = await Promise.all([
            nombreClinica(link.clinica_id),
            listarObrasSociales(link.clinica_id),
        ]);
        return res.json({
            clinica,
            profesional: link.creado_por_nombre || '',
            existente: !!link.id_paciente,
            venceEn: link.vence_en,
            obrasSociales,
        });
    } catch (err) {
        console.error('Error leyendo el link de datos:', err);
        return res.status(500).json({ error: 'No se pudo abrir el link.' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/datos-paciente  (público)
// { token, dni, nombre, apellido, fechaNacimiento, sexo?, telefono?, email?, direccion?,
//   idObraSocial?, nroAfiliado?, plan?, aceptaTerminos, versionLegal? }
// ---------------------------------------------------------------------------
exports.enviarDatos = async (req, res) => {
    try {
        const r = await buscarLink(req.body.token);
        if (r.error) return res.status(r.status).json({ error: r.error });
        const { link } = r;

        const fnac = parseFechaNacimiento(req.body.fechaNacimiento);
        if (!fnac.ok) return res.status(400).json({ error: fnac.error });
        if (!fnac.fecha) return res.status(400).json({ error: 'Cargá tu fecha de nacimiento.' });

        const cob = await columnasCobertura(req.body, link.clinica_id);
        if (!cob.ok) return res.status(400).json({ error: cob.error });

        const dni = limpio(req.body.dni);
        const datos = {
            nombre: limpio(req.body.nombre),
            apellido: limpio(req.body.apellido),
            telefono: limpio(req.body.telefono) || null,
            direccion: limpio(req.body.direccion) || null,
            sexo: limpio(req.body.sexo) || null,
            email: limpio(req.body.email).toLowerCase() || null,
            fecha_nacimiento: fnac.fecha,
        };

        // Link de un paciente existente: el DNI tiene que coincidir con el de la ficha.
        let ficha = null;
        if (link.id_paciente) {
            ficha = await fichaDelLink(link);
            if (!ficha) return res.status(404).json({ error: ERR_LINK });
            if (ficha.dni !== dni) {
                const intentos = (link.intentos || 0) + 1;
                await supabase
                    .from('link_datos_paciente')
                    .update({ intentos, ...(intentos >= MAX_INTENTOS_DNI ? { usado_en: new Date().toISOString() } : {}) })
                    .eq('id', link.id);
                if (intentos >= MAX_INTENTOS_DNI) {
                    return res.status(410).json({ error: 'El DNI no coincidió varias veces y el link se anuló. Pedile uno nuevo al profesional.' });
                }
                return res.status(400).json({ error: 'El DNI no coincide con el de tu ficha. Revisalo (sin puntos).' });
            }
        }

        // Reclamar el link (un solo uso) antes de escribir nada.
        const { data: reclamado, error: recErr } = await supabase
            .from('link_datos_paciente')
            .update({
                usado_en: new Date().toISOString(),
                version_legal: limpio(req.body.versionLegal) || null,
                ip: req.ip || null,
            })
            .eq('id', link.id)
            .is('usado_en', null)
            .gt('vence_en', new Date().toISOString())
            .select('id');
        if (recErr) throw recErr;
        if (!reclamado || reclamado.length === 0) return res.status(410).json({ error: ERR_USADO });

        let resultado;
        try {
            resultado = ficha
                ? await actualizarFicha(ficha, datos, cob.cols)
                : await cargarNuevo(link.clinica_id, dni, datos, cob.cols);
        } catch (err) {
            // Se libera el link para que el paciente pueda reintentar.
            await supabase.from('link_datos_paciente').update({ usado_en: null }).eq('id', link.id);
            if (err && err.respuesta) return res.status(err.respuesta.status).json({ error: err.respuesta.error });
            throw err;
        }

        await Promise.all([
            supabase.from('link_datos_paciente').update({ id_paciente_resultado: resultado.idPaciente }).eq('id', link.id)
                .then(({ error }) => error && console.error('Link de datos: no se guardó la ficha resultado:', error.message)),
            registrarAccesoPaciente(req, {
                accion: 'datos_por_link',
                clinicaId: link.clinica_id,
                idPaciente: resultado.idPaciente,
                paciente: { nombre: nombreCompleto(datos), dni },
                detalle: { nuevo: resultado.nuevo, campos: resultado.campos },
            }),
            // Fase AB: aviso en la campana de quien mandó el link.
            notificar({
                clinicaId: link.clinica_id,
                idPersona: link.creado_por,
                tipo: 'datos_paciente',
                titulo: 'Un paciente cargó sus datos',
                cuerpo: resultado.nuevo
                    ? `${nombreCompleto(datos)} completó sus datos desde el link y ya está en tu lista de pacientes.`
                    : `${nombreCompleto(datos)} actualizó sus datos desde el link.`,
                url: '/dashboard/registro-clinico',
                datos: { dni },
            }),
        ]);

        return res.json({ ok: true, cuenta: resultado.cuenta || null });
    } catch (err) {
        console.error('Error cargando los datos por link:', err);
        return res.status(500).json({ error: 'No se pudieron guardar tus datos. Probá de nuevo en un rato.' });
    }
};

// Error con la respuesta para el paciente (lo traduce enviarDatos).
function errorPaciente(status, error) {
    const e = new Error(error);
    e.respuesta = { status, error };
    return e;
}

const SELECT_FICHA = 'id, id_auth, clinica_id, dni, nombre, apellido, telefono, direccion, sexo, email, fecha_nacimiento';

async function fichaDelLink(link) {
    const { data, error } = await supabase
        .from('paciente')
        .select(`id, id_obra_social, persona:id_persona ( ${SELECT_FICHA} )`)
        .eq('id', link.id_paciente)
        .maybeSingle();
    if (error) throw error;
    const p = data && data.persona;
    if (!p || p.clinica_id !== link.clinica_id) return null;
    return { ...p, idPaciente: data.id, idObraSocial: data.id_obra_social };
}

// Link de un paciente existente: lo cargado reemplaza lo de la ficha (vacío = no se
// toca). Con cuenta en Medilu el email no se cambia desde acá.
async function actualizarFicha(ficha, datos, colsCob) {
    const update = {};
    for (const [k, v] of Object.entries(datos)) {
        if (!v || v === (ficha[k] || null)) continue;
        if (k === 'email' && ficha.id_auth) continue;
        update[k] = v;
    }
    if (Object.keys(update).length) {
        const { error } = await supabase
            .from('persona')
            .update(update)
            .eq('id', ficha.id)
            .eq('clinica_id', ficha.clinica_id);
        if (error) throw error;
    }
    if (Object.keys(colsCob).length) {
        const { error } = await supabase.from('paciente').update(colsCob).eq('id', ficha.idPaciente);
        if (error) throw error;
    }

    // Sin cuenta y ahora con email: se le crea el acceso, como en el alta.
    let cuenta = null;
    const email = update.email || ficha.email;
    if (!ficha.id_auth && email) {
        cuenta = await crearCuentaPaciente({
            personaId: ficha.id, email, nombre: datos.nombre || ficha.nombre, clinicaId: ficha.clinica_id, esperarMail: false,
        }).catch((e) => {
            console.error('Link de datos: no se pudo crear la cuenta:', e.message || e);
            return null;
        });
    }

    return {
        idPaciente: ficha.idPaciente,
        nuevo: false,
        campos: [...Object.keys(update), ...(Object.keys(colsCob).length ? ['cobertura'] : [])],
        cuenta: resumenCuenta(cuenta),
    };
}

// Link "nuevo": crea la ficha. Si el DNI ya es paciente de la clínica, solo completa
// lo que falta (sin pisar ni tocar el email, que es un canal de acceso).
async function cargarNuevo(clinicaId, dni, datos, colsCob) {
    const { data: existente, error } = await supabase
        .from('persona')
        .select(`${SELECT_FICHA}, paciente(id, id_obra_social)`)
        .eq('clinica_id', clinicaId)
        .eq('dni', dni)
        .maybeSingle();
    if (error) throw error;

    if (existente) {
        const pac = existente.paciente && existente.paciente[0];
        // Es alguien del equipo de la clínica, no un paciente: que lo resuelva la clínica.
        if (!pac) throw errorPaciente(409, 'Ya hay una persona con ese DNI en la clínica. Avisale al profesional para que te cargue.');

        const update = {};
        for (const [k, v] of Object.entries(datos)) {
            if (k === 'email' || !v || existente[k]) continue;
            update[k] = v;
        }
        if (Object.keys(update).length) {
            const { error: updErr } = await supabase.from('persona').update(update).eq('id', existente.id).eq('clinica_id', clinicaId);
            if (updErr) throw updErr;
        }
        const cobertura = !pac.id_obra_social && Object.keys(colsCob).length;
        if (cobertura) {
            const { error: cobErr } = await supabase.from('paciente').update(colsCob).eq('id', pac.id);
            if (cobErr) throw cobErr;
        }
        return {
            idPaciente: pac.id,
            nuevo: false,
            campos: [...Object.keys(update), ...(cobertura ? ['cobertura'] : [])],
            cuenta: null,
        };
    }

    const { data: persona, error: perErr } = await supabase
        .from('persona')
        .insert({ id_auth: null, dni, clinica_id: clinicaId, ...datos })
        .select('id')
        .single();
    if (perErr) {
        if (perErr.code === '23505') throw errorPaciente(409, 'Ya hay una persona con ese DNI en la clínica. Avisale al profesional para que te cargue.');
        throw perErr;
    }
    const { data: paciente, error: pacErr } = await supabase
        .from('paciente')
        .insert({ id_persona: persona.id, ...colsCob })
        .select('id')
        .single();
    if (pacErr) {
        await supabase.from('persona').delete().eq('id', persona.id);
        throw pacErr;
    }

    let cuenta = null;
    if (datos.email) {
        cuenta = await crearCuentaPaciente({
            personaId: persona.id, email: datos.email, nombre: datos.nombre, clinicaId, esperarMail: false,
        }).catch((e) => {
            console.error('Link de datos: no se pudo crear la cuenta:', e.message || e);
            return null;
        });
    }

    return {
        idPaciente: paciente.id,
        nuevo: true,
        campos: Object.keys(datos).filter((k) => datos[k]).concat(Object.keys(colsCob).length ? ['cobertura'] : []),
        cuenta: resumenCuenta(cuenta),
    };
}

// Al paciente solo le importa si le llega (o ya tiene) el acceso: nada de claves.
function resumenCuenta(cuenta) {
    if (!cuenta) return null;
    if (cuenta.estado === 'creada') return { estado: 'creada' };
    if (cuenta.estado === 'vinculada') return { estado: 'vinculada' };
    return null;
}
