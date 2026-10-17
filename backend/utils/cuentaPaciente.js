// Cuenta de acceso para el paciente que da de alta un profesional.
//
// Cuando un profesional carga un paciente nuevo con email, se le crea un usuario de
// Supabase Auth con una contraseña temporal aleatoria, se vincula a su persona
// (persona.id_auth) y se le envían los datos de acceso por email. Así el paciente
// entra con su email y ve la historia clínica que ya le cargaron.
//
// El usuario se crea ya confirmado (email_confirm): la contraseña solo llega a ese
// email, así que quien la recibe es quien controla la casilla. Por eso el profesional
// tiene que cargar el email REAL del paciente (el formulario se lo advierte).
//
// Fase O: si el email ya tiene cuenta (el paciente se atiende en otra clínica de
// Medilu, o es profesional), la ficha nueva se vincula a ESA cuenta cuando el DNI y el
// email coinciden, y se le avisa por mail. Así ve la historia de todas sus clínicas.
//
// Usa el cliente service_role (auth.admin y el UPDATE de persona.id_auth).

const crypto = require('crypto');
const { supabase } = require('../config/supabaseClient');
const { sendMail, isMailerConfigured } = require('./mailer');
const { layoutMail, parrafo, fuerte, link, boton, datos, aviso, nota, esc } = require('./emailLayout');

// Sin caracteres ambiguos (0/O, 1/l/I) para que sea fácil de tipear desde el mail.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generarContrasena(longitud = 10) {
    let out = '';
    for (let i = 0; i < longitud; i++) out += ALFABETO[crypto.randomInt(ALFABETO.length)];
    return out;
}

function baseUrl() {
    return (process.env.APP_URL || '').replace(/\/+$/, '');
}

function esEmailEnUso(error) {
    return error && (error.code === 'email_exists' || /already (been )?registered/i.test(error.message || ''));
}

async function nombreClinica(clinicaId) {
    if (!clinicaId) return '';
    const { data } = await supabase.from('clinica').select('nombre').eq('id', clinicaId).maybeSingle();
    return (data && data.nombre) || '';
}

// Mails al paciente. Con MAIL_PRUEBA en el entorno (para probar sin escribirle a
// pacientes reales) se mandan a esa casilla, con el destinatario real en el asunto.
// La cuenta se crea igual con el email del paciente: es con el que inicia sesión.
function enviarAlPaciente(mail) {
    const prueba = (process.env.MAIL_PRUEBA || '').trim();
    if (!prueba) return sendMail(mail);
    return sendMail({ ...mail, to: prueba, subject: `[PRUEBA para ${mail.to}] ${mail.subject}` });
}

// Manda un mail sin esperarlo: conectarse a Gmail tarda ~2 s y el alta no tiene por qué
// esperarlo. Si falla queda en el log; el paciente igual puede entrar con "¿Olvidaste tu
// contraseña?" (la cuenta se crea confirmada).
function enSegundoPlano(enviar, que) {
    Promise.resolve()
        .then(enviar)
        .catch((e) => console.error(`Cuenta paciente: no se pudo enviar ${que}:`, e.message || e));
}

async function enviarDatosAcceso({ email, nombre, clave, clinica }) {
    const url = baseUrl();
    const login = url ? `${url}/login` : '';
    const misDatos = url ? `${url}/mi-perfil` : '';
    const de = clinica ? ` en ${clinica}` : '';
    const hola = nombre ? `Hola ${nombre},` : 'Hola,';
    const pasoClave = 'Andá a "Mis datos" y, abajo del todo, en "Cambiar contraseña" elegí una nueva.';
    return enviarAlPaciente({
        to: email,
        subject: 'Tus datos de acceso a Medilu',
        text: [
            hola,
            '',
            `Te registraron como paciente${de}. Con esta cuenta podés ver tu historia clínica, tus estudios y tus turnos.`,
            '',
            `Email: ${email}`,
            `Contraseña temporal: ${clave}`,
            login ? `Ingresá en: ${login}` : '',
            '',
            `Por seguridad, cambiá la contraseña después de entrar. ${pasoClave}`,
            misDatos ? `Mis datos: ${misDatos}` : '',
            '',
            'Si no te atendiste en este lugar, ignorá este email.',
            '',
            'Medilu.',
        ].join('\n'),
        html: layoutMail({
            titulo: 'Ya tenés tu cuenta en Medilu',
            resumen: 'Tus datos para entrar y ver tu historia clínica.',
            cuerpo: [
                parrafo(`${esc(hola)} te registraron como paciente${clinica ? ` en ${fuerte(clinica)}` : ''}. Con tu cuenta podés ver tu historia clínica, tus estudios y tus turnos.`),
                datos([
                    { etiqueta: 'Email', valor: email },
                    { etiqueta: 'Contraseña temporal', valor: clave, mono: true },
                ]),
                login ? boton(login, 'Ingresar a Medilu') : '',
                aviso(
                    'Después de entrar, cambiá tu contraseña',
                    `Andá a ${misDatos ? link(misDatos, 'Mis datos') : fuerte('Mis datos')} y, abajo del todo, en ${fuerte('Cambiar contraseña')} elegí una nueva.`
                ),
                nota(`Si no te atendiste${clinica ? ` en ${esc(clinica)}` : ' en este lugar'}, ignorá este email.`),
            ].join('\n'),
        }),
    });
}

async function avisarVinculacion({ email, nombre, clinica }) {
    const url = baseUrl();
    const login = url ? `${url}/login` : '';
    const hola = nombre ? `Hola ${nombre},` : 'Hola,';
    const de = clinica || 'Un centro de salud';
    return enviarAlPaciente({
        to: email,
        subject: 'Tu historia clínica ya está en tu cuenta de Medilu',
        text: `${hola}\n\n${de} te registró como paciente. Lo que te carguen ahí lo vas a ver en tu cuenta de Medilu, con tu email y contraseña de siempre.${login ? `\n\n${login}` : ''}\n\nMedilu.`,
        html: layoutMail({
            titulo: 'Sumaste un nuevo lugar de atención',
            resumen: `${de} te registró como paciente.`,
            cuerpo: [
                parrafo(`${esc(hola)} ${clinica ? fuerte(clinica) : 'un centro de salud'} te registró como paciente.`),
                parrafo('Lo que te carguen ahí lo vas a ver en tu cuenta de Medilu, junto con el resto de tu historia clínica. Entrás con tu email y tu contraseña de siempre.'),
                login ? boton(login, 'Ver mi historia clínica') : '',
                nota('Si no te atendiste en este lugar, ignorá este email.'),
            ].join('\n'),
        }),
    });
}

// Crea la cuenta del paciente y la vincula a su persona. Nunca lanza: el alta del
// paciente ya ocurrió y no debe fallar por la cuenta. Devuelve:
//   { estado: 'creada', mailEnviado, claveTemporal? }  (la clave solo si el mail NO salió,
//                                                        para que el profesional se la dé)
//   { estado: 'creada', mailEnCurso: true }  con `esperarMail: false`: el mail sale en
//                                            segundo plano y la clave no se devuelve
//   { estado: 'vinculada', mailEnviado | mailEnCurso }  ya tenía cuenta (mismo DNI y
//                                                       email): se vinculó
//   { estado: 'email_en_uso' }  ese email es de otra cuenta (otro DNI): no se vincula
//   { estado: 'sin_email' }
//   { estado: 'error' }
// Sin mailer configurado se espera igual (no hay nada que mandar) y se devuelve la clave.
async function crearCuentaPaciente({ personaId, email, nombre, clinicaId, esperarMail = true }) {
    const mail = String(email || '').trim().toLowerCase();
    if (!mail) return { estado: 'sin_email' };

    const segundoPlano = !esperarMail && isMailerConfigured();
    try {
        const clave = generarContrasena();
        const { data, error } = await supabase.auth.admin.createUser({
            email: mail,
            password: clave,
            email_confirm: true,
            user_metadata: { origen: 'alta_profesional', clinica_id: clinicaId || null },
        });
        if (error) {
            if (esEmailEnUso(error)) {
                return (await vincularCuentaExistente({ personaId, email: mail, nombre, clinicaId, segundoPlano }))
                    || { estado: 'email_en_uso' };
            }
            throw error;
        }

        // Vincular solo si la persona sigue sin cuenta (evita pisar un vínculo previo).
        const { data: upd, error: updErr } = await supabase
            .from('persona')
            .update({ id_auth: data.user.id })
            .eq('id', personaId)
            .is('id_auth', null)
            .select('id');
        if (updErr || !upd || upd.length === 0) {
            await supabase.auth.admin.deleteUser(data.user.id).catch(() => {});
            if (updErr) throw updErr;
            return { estado: 'error' };
        }

        if (segundoPlano) {
            enSegundoPlano(async () => enviarDatosAcceso({
                email: mail, nombre, clave, clinica: await nombreClinica(clinicaId),
            }), 'el email de acceso');
            return { estado: 'creada', mailEnCurso: true };
        }

        let mailEnviado = false;
        try {
            mailEnviado = await enviarDatosAcceso({
                email: mail, nombre, clave, clinica: await nombreClinica(clinicaId),
            });
        } catch (e) {
            console.error('Cuenta paciente: no se pudo enviar el email de acceso:', e.message);
        }
        return mailEnviado ? { estado: 'creada', mailEnviado } : { estado: 'creada', mailEnviado, claveTemporal: clave };
    } catch (e) {
        console.error('Cuenta paciente: error creando la cuenta:', e.message || e);
        return { estado: 'error' };
    }
}

// Fase O: el email ya tiene cuenta. Si alguna persona con el MISMO DNI está vinculada
// a una cuenta con ESE email, es la misma persona: la ficha nueva se ata a esa cuenta
// (una persona por clínica por cuenta) y se le avisa. Devuelve null si no corresponde.
async function vincularCuentaExistente({ personaId, email, nombre, clinicaId, segundoPlano }) {
    const { data: persona, error } = await supabase
        .from('persona')
        .select('dni, id_auth')
        .eq('id', personaId)
        .maybeSingle();
    if (error) throw error;
    if (!persona || !persona.dni || persona.id_auth) return null;

    const { data: mismas, error: dniErr } = await supabase
        .from('persona')
        .select('id_auth')
        .eq('dni', persona.dni)
        .neq('id', personaId)
        .not('id_auth', 'is', null);
    if (dniErr) throw dniErr;

    for (const authId of new Set((mismas || []).map((p) => p.id_auth))) {
        const { data } = await supabase.auth.admin.getUserById(authId);
        if (!data || !data.user || String(data.user.email || '').toLowerCase() !== email) continue;

        // Solo si la ficha sigue sin cuenta. Si la cuenta ya tiene otra persona en esta
        // clínica (índice único id_auth+clinica_id), no se vincula.
        const { data: upd, error: updErr } = await supabase
            .from('persona')
            .update({ id_auth: authId })
            .eq('id', personaId)
            .is('id_auth', null)
            .select('id');
        if (updErr) {
            if (updErr.code === '23505') return null;
            throw updErr;
        }
        if (!upd || upd.length === 0) return null;

        if (segundoPlano) {
            enSegundoPlano(async () => avisarVinculacion({ email, nombre, clinica: await nombreClinica(clinicaId) }), 'el aviso de vinculación');
            return { estado: 'vinculada', mailEnCurso: true };
        }

        let mailEnviado = false;
        try {
            mailEnviado = await avisarVinculacion({ email, nombre, clinica: await nombreClinica(clinicaId) });
        } catch (e) {
            console.error('Cuenta paciente: no se pudo avisar la vinculación:', e.message);
        }
        return { estado: 'vinculada', mailEnviado };
    }
    return null;
}

// Paciente que se registró solo (persona sin clínica, con cuenta) con ese DNI.
// Si el email que cargó el profesional coincide con el de su cuenta, devuelve la
// persona para sumarla a la clínica; si no coincide, lo informa sin revelar el email.
async function buscarAutoregistrado(dni, email) {
    const { data: personas, error } = await supabase
        .from('persona')
        .select('id, id_auth, nombre, apellido, telefono, direccion, sexo, fecha_nacimiento, email, paciente(id, id_obra_social)')
        .eq('dni', dni)
        .is('clinica_id', null)
        .not('id_auth', 'is', null);
    if (error) throw error;
    const candidatas = (personas || []).filter((p) => p.paciente && p.paciente[0]);
    if (candidatas.length === 0) return null;

    const mail = String(email || '').trim().toLowerCase();
    for (const p of candidatas) {
        const { data } = await supabase.auth.admin.getUserById(p.id_auth);
        if (mail && data && data.user && String(data.user.email || '').toLowerCase() === mail) {
            return { coincide: true, persona: p };
        }
    }
    return { coincide: false };
}

// ---------------------------------------------------------------------------
// Fase V: código de vinculación. Para el paciente que se cargó sin email: el
// profesional le da el código y el paciente, ya registrado y con sesión, lo carga en
// "Mi historia" para atar la ficha a su cuenta. No alcanza con el DNI (cualquiera
// puede registrarse con un DNI ajeno): hace falta el código Y que la cuenta tenga
// una ficha con el mismo DNI. Un código vigente por ficha, de un solo uso.
// ---------------------------------------------------------------------------

// Solo mayúsculas y sin ambiguos: se dicta por teléfono o se copia de un papel.
const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LARGO_CODIGO = 8;
const DIAS_VIGENCIA_VINCULO = 30;

function generarCodigo() {
    let out = '';
    for (let i = 0; i < LARGO_CODIGO; i++) out += ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)];
    return out;
}

// Acepta el código con guion, espacios o en minúsculas.
function normalizarCodigo(codigo) {
    return String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizarDni(dni) {
    return String(dni || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Devuelve el código vigente de la ficha o crea uno (con `regenerar`, siempre uno
// nuevo: el anterior deja de valer). { codigo, venceEn }
async function obtenerCodigoVinculacion({ personaId, creadoPor = null, regenerar = false }) {
    if (!regenerar) {
        const { data, error } = await supabase
            .from('codigo_vinculacion')
            .select('codigo, vence_en')
            .eq('id_persona', personaId)
            .maybeSingle();
        if (error) throw error;
        if (data && new Date(data.vence_en) > new Date()) return { codigo: data.codigo, venceEn: data.vence_en };
    }

    const venceEn = new Date(Date.now() + DIAS_VIGENCIA_VINCULO * 24 * 60 * 60 * 1000).toISOString();
    // Reintenta si el código choca con el de otra ficha (UNIQUE).
    for (let i = 0; i < 5; i++) {
        const codigo = generarCodigo();
        const { error } = await supabase
            .from('codigo_vinculacion')
            .upsert({
                id_persona: personaId,
                codigo,
                creado_por: creadoPor,
                creado_en: new Date().toISOString(),
                vence_en: venceEn,
            }, { onConflict: 'id_persona' });
        if (!error) return { codigo, venceEn };
        if (error.code !== '23505') throw error;
    }
    throw new Error('No se pudo generar un código de vinculación único.');
}

// Canjea el código para la cuenta `authId`. Devuelve null ante cualquier problema
// (no existe, venció, la ficha ya tiene cuenta, el DNI no coincide…): quien llama
// responde siempre lo mismo para no revelar nada. Si sale bien:
//   { idPaciente, clinicaId, clinica, paciente: { nombre, dni } }
async function canjearCodigoVinculacion({ authId, codigo }) {
    const cod = normalizarCodigo(codigo);
    if (!authId || cod.length !== LARGO_CODIGO) return null;

    const { data: vin, error } = await supabase
        .from('codigo_vinculacion')
        .select('id_persona, vence_en')
        .eq('codigo', cod)
        .maybeSingle();
    if (error) throw error;
    if (!vin || new Date(vin.vence_en) <= new Date()) return null;

    const { data: ficha, error: fErr } = await supabase
        .from('persona')
        .select('id, dni, id_auth, clinica_id, nombre, apellido, paciente(id)')
        .eq('id', vin.id_persona)
        .maybeSingle();
    if (fErr) throw fErr;
    if (!ficha || ficha.id_auth || !ficha.dni || !(ficha.paciente && ficha.paciente[0])) return null;

    // La cuenta tiene que ser de la misma persona: alguna de sus fichas con ese DNI.
    const { data: mias, error: mErr } = await supabase
        .from('persona')
        .select('dni')
        .eq('id_auth', authId);
    if (mErr) throw mErr;
    const dni = normalizarDni(ficha.dni);
    if (!(mias || []).some((p) => normalizarDni(p.dni) === dni)) return null;

    // Solo si la ficha sigue sin cuenta. Si la cuenta ya tiene otra ficha en esa
    // clínica (índice único id_auth+clinica_id), no se vincula.
    const { data: upd, error: updErr } = await supabase
        .from('persona')
        .update({ id_auth: authId })
        .eq('id', ficha.id)
        .is('id_auth', null)
        .select('id');
    if (updErr) {
        if (updErr.code === '23505') return null;
        throw updErr;
    }
    if (!upd || upd.length === 0) return null;

    const { error: delErr } = await supabase.from('codigo_vinculacion').delete().eq('id_persona', ficha.id);
    if (delErr) console.error('Vinculación: no se pudo borrar el código usado:', delErr.message);

    return {
        idPaciente: ficha.paciente[0].id,
        clinicaId: ficha.clinica_id || null,
        clinica: await nombreClinica(ficha.clinica_id),
        paciente: { nombre: [ficha.nombre, ficha.apellido].filter(Boolean).join(' '), dni: ficha.dni },
    };
}

module.exports = {
    enSegundoPlano,
    crearCuentaPaciente,
    buscarAutoregistrado,
    avisarVinculacion,
    nombreClinica,
    obtenerCodigoVinculacion,
    canjearCodigoVinculacion,
};
