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
// Usa el cliente service_role (auth.admin y el UPDATE de persona.id_auth).

const crypto = require('crypto');
const { supabase } = require('../config/supabaseClient');
const { sendMail } = require('./mailer');

// Sin caracteres ambiguos (0/O, 1/l/I) para que sea fácil de tipear desde el mail.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function generarContrasena(longitud = 10) {
    let out = '';
    for (let i = 0; i < longitud; i++) out += ALFABETO[crypto.randomInt(ALFABETO.length)];
    return out;
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
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

async function enviarDatosAcceso({ email, nombre, clave, clinica }) {
    const url = baseUrl();
    const login = url ? `${url}/login` : '';
    const de = clinica ? ` en ${clinica}` : '';
    const hola = nombre ? `Hola ${nombre},` : 'Hola,';
    return sendMail({
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
            'Por seguridad, cambiá la contraseña después de entrar (desde "¿Olvidaste tu contraseña?" en el inicio de sesión podés elegir una nueva).',
            'Si no te atendiste en este lugar, ignorá este email.',
            '',
            'Medilu.',
        ].filter((l) => l !== null).join('\n'),
        html: `<p>${escapeHtml(hola)}</p>
<p>Te registraron como paciente${escapeHtml(de)}. Con esta cuenta podés ver tu historia clínica, tus estudios y tus turnos.</p>
<p><strong>Email:</strong> ${escapeHtml(email)}<br><strong>Contraseña temporal:</strong> <code>${escapeHtml(clave)}</code></p>
${login ? `<p><a href="${login}">Ingresá a Medilu</a></p>` : ''}
<p>Por seguridad, cambiá la contraseña después de entrar (desde “¿Olvidaste tu contraseña?” en el inicio de sesión podés elegir una nueva).</p>
<p>Si no te atendiste en este lugar, ignorá este email.</p>
<p>Medilu.</p>`,
    });
}

async function avisarVinculacion({ email, nombre, clinica }) {
    const url = baseUrl();
    const hola = nombre ? `Hola ${nombre},` : 'Hola,';
    const de = clinica || 'Un centro de salud';
    return sendMail({
        to: email,
        subject: 'Tu historia clínica ya está en tu cuenta de Medilu',
        text: `${hola}\n\n${de} te registró como paciente. Lo que te carguen ahí lo vas a ver en tu cuenta de Medilu, con tu email y contraseña de siempre.${url ? `\n\n${url}/login` : ''}\n\nMedilu.`,
        html: `<p>${escapeHtml(hola)}</p><p>${escapeHtml(de)} te registró como paciente. Lo que te carguen ahí lo vas a ver en tu cuenta de Medilu, con tu email y contraseña de siempre.</p>${url ? `<p><a href="${url}/login">Ingresá a Medilu</a></p>` : ''}<p>Medilu.</p>`,
    });
}

// Crea la cuenta del paciente y la vincula a su persona. Nunca lanza: el alta del
// paciente ya ocurrió y no debe fallar por la cuenta. Devuelve:
//   { estado: 'creada', mailEnviado, claveTemporal? }  (la clave solo si el mail NO salió,
//                                                        para que el profesional se la dé)
//   { estado: 'email_en_uso' }  ese email ya tiene una cuenta en Medilu (no se vincula)
//   { estado: 'sin_email' }
//   { estado: 'error' }
async function crearCuentaPaciente({ personaId, email, nombre, clinicaId }) {
    const mail = String(email || '').trim().toLowerCase();
    if (!mail) return { estado: 'sin_email' };

    try {
        const clave = generarContrasena();
        const { data, error } = await supabase.auth.admin.createUser({
            email: mail,
            password: clave,
            email_confirm: true,
            user_metadata: { origen: 'alta_profesional', clinica_id: clinicaId || null },
        });
        if (error) {
            if (esEmailEnUso(error)) return { estado: 'email_en_uso' };
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

module.exports = { crearCuentaPaciente, buscarAutoregistrado, avisarVinculacion, nombreClinica };
