const { createClient } = require('@supabase/supabase-js');
const { slugify } = require('../utils/slug');
const { getMembresiasActivas, roleSinProfesional } = require('../utils/membresias');
const { columnasCobertura } = require('../utils/cobertura');
const planes = require('../utils/planes');
const { fichasPaciente } = require('../utils/fichasPaciente');
const { sendMail } = require('../utils/mailer');
require('dotenv').config();

// service_role: SALTEA la RLS. Se usa SOLO para operaciones sobre tablas.
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// anon (sin sesión persistida): se usa para las operaciones de auth (signUp / signIn /
// reset). IMPORTANTE: no se deben hacer los signIn/signUp sobre el cliente `supabase`
// service_role, porque supabase-js le adjunta la sesión del usuario a ese cliente y las
// consultas posteriores dejarían de correr como service_role (pasarían a estar bajo RLS).
const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY_PUBLIC, {
    auth: { persistSession: false, autoRefreshToken: false },
});

exports.register = async (req, res) => {
    const {
        email, password, activationCode, nombreClinica,
        dni, nombre, apellido, fechaNacimiento, telefono, telefono_profesional,
        direccion, direccion_profesional, obraSocial, sexo, especialidad, matricula, role, area
    } = req.body;

    try {
        // --- Fase 2: resolver la clínica del profesional ANTES de crear el usuario ---
        // Dos vías de onboarding:
        //   a) código de activación -> se une a una clínica existente (no admin).
        //   b) nombre de clínica     -> crea una clínica nueva y queda como admin.
        let clinicaId = null;
        let esAdmin = false;
        let codigoRow = null;
        const tieneCodigo = activationCode && String(activationCode).trim();
        const tieneNombreClinica = nombreClinica && String(nombreClinica).trim();

        // Resuelve un código de activación validando que apunte al rol esperado.
        // Fase E: el código lleva `rol` ('profesional' | 'recepcion'). Un código de
        // recepción no puede usarse para crear un profesional, y viceversa.
        // Fase J: el alta sin matrícula (formulario de staff) acepta también 'auditor'.
        async function resolverCodigo(...rolesEsperados) {
            const { data: cod, error: codErr } = await supabase
                .from("codigo_activacion")
                .select("id, clinica_id, usado, rol, alcance_obra_social, alcance_id_obra_social")
                .eq("codigo", String(activationCode).trim())
                .maybeSingle();
            if (codErr) throw codErr;
            if (!cod || cod.usado) {
                return { error: "Código de activación inválido o ya utilizado." };
            }
            // Compat: los códigos previos a la Fase E no tienen rol -> 'profesional'.
            if (!rolesEsperados.includes(cod.rol || 'profesional')) {
                return { error: "El código no corresponde a este tipo de cuenta." };
            }
            return { cod };
        }

        if (role === "PROFESIONAL") {
            if (tieneCodigo) {
                const r = await resolverCodigo('profesional');
                if (r.error) return res.status(400).json({ error: r.error });
                clinicaId = r.cod.clinica_id;
                codigoRow = r.cod;
            } else if (!tieneNombreClinica) {
                return res.status(400).json({ error: "Debés crear una clínica nueva o ingresar un código de activación." });
            }
        }

        if (role === "RECEPCION") {
            // La recepción SOLO se une por código (no crea clínicas).
            if (!tieneCodigo) {
                return res.status(400).json({ error: "La recepción se une con un código de activación." });
            }
            const r = await resolverCodigo('recepcion', 'auditor');
            if (r.error) return res.status(400).json({ error: r.error });
            clinicaId = r.cod.clinica_id;
            codigoRow = r.cod;
        }

        // Fase L: unirse con código ocupa un lugar del plan de la clínica (profesionales,
        // recepción) o requiere la función (auditoría). Se verifica ANTES de crear el
        // usuario para no dejar cuentas a medias.
        if (codigoRow) {
            const bloqueo = await planes.verificarAlta(clinicaId, codigoRow.rol || 'profesional');
            if (bloqueo) {
                return res.status(bloqueo.status).json({
                    error: `La clínica no puede sumar esta cuenta: ${bloqueo.error} Pedile al administrador que lo revise.`,
                    code: bloqueo.code,
                });
            }
        }

        // Creamos usuario en Supabase Auth (cliente anon: si el signUp devolviera sesión
        // —confirmación de email desactivada— no debe adjuntarse al cliente service_role,
        // porque los INSERT siguientes dejarían de saltear la RLS).
        // Prueba del consentimiento (Ley 25.326): qué versión de los textos legales aceptó
        // y cuándo. Va en los metadatos del usuario de Auth (sin cambios de esquema).
        const consentimiento = {
            acepta_terminos: true,
            version_legal: req.body.versionLegal || null,
            aceptado_at: new Date().toISOString(),
        };
        const { data, error } = await supabaseAuth.auth.signUp({
            email,
            password,
            options: { data: { consentimiento } },
        });
        if (error) { return res.status(400).json({ error: error.message }); }

        const user = data.user;
        if (!user) {
            return res.status(200).json({
                message: "Usuario registrado, pero falta confirmar el email antes de insertar en la tabla",
            });
        }

        const userId = data.user.id;

        // Crear la clínica nueva (vía b) una vez confirmado el usuario.
        if (role === "PROFESIONAL" && !clinicaId && tieneNombreClinica) {
            const nombreLimpio = String(nombreClinica).trim();
            const base = slugify(nombreLimpio);
            let slug = base;
            let cli = null, cliErr = null;
            // Reintentar con sufijo aleatorio si el slug ya existe (unique).
            for (let intento = 0; intento < 5; intento++) {
                ({ data: cli, error: cliErr } = await supabase
                    .from("clinica")
                    .insert([{ nombre: nombreLimpio, slug }])
                    .select("id")
                    .single());
                if (!cliErr) break;
                if (cliErr.code !== '23505') throw cliErr; // 23505 = unique_violation
                slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
                cli = null;
            }
            if (!cli) throw cliErr || new Error('No se pudo crear la clínica');
            clinicaId = cli.id;
            esAdmin = true;
            // Fase L: toda clínica nueva arranca con la prueba del plan completo.
            await planes.crearPrueba(clinicaId);
        }

        const { data: persona_data, error: persona_error } = await supabase
            .from("persona")
            .insert([{
                id_auth: userId,
                dni,
                nombre,
                apellido,
                // Campos opcionales (minimización): un string vacío se guarda como NULL
                // (una fecha vacía, además, rompería el INSERT en la columna date).
                fecha_nacimiento: fechaNacimiento || null,
                telefono: telefono || null,
                direccion: direccion || null,
                sexo: sexo || null,
                clinica_id: clinicaId
            }])
            .select()
            .single();

        if (persona_error) throw persona_error;

        const id_persona = persona_data.id;

        if (role === "PACIENTE") {
            // Fase K: cobertura del catálogo global (el paciente aún no tiene clínica).
            // Si no eligió del catálogo, se conserva el texto libre (compatibilidad).
            const cob = await columnasCobertura(req.body, null);
            const cols = cob.ok ? cob.cols : {};
            const { error: err } = await supabase
                .from("paciente")
                .insert([{ id_persona, obra_social: obraSocial || null, ...cols }]);
            if (err) throw err;
        }

        if (role === "PROFESIONAL") {
            const { data: data_prof, error: err_prof } = await supabase
                .from("profesional")
                .insert([{
                    id_persona,
                    telefono: telefono_profesional,
                    direccion: direccion_profesional,
                    matricula,
                    es_admin: esAdmin
                }])
                .select()
                .single();
            if (err_prof) throw err_prof;

            const { error: err_esp } = await supabase
                .from("especialidad_profesional")
                .insert([{
                    id_profesional: data_prof.id,
                    id_especialidad: especialidad
                }]);
            if (err_esp) throw err_esp;

            // Fase A: crear la membresía (pertenencia + rol en la clínica).
            //   - alta con código  -> rol 'profesional'
            //   - clínica nueva     -> rol 'admin' (esAdmin=true)
            const { error: err_mem } = await supabase
                .from("membresia")
                .insert([{
                    id_persona,
                    clinica_id: clinicaId,
                    rol: esAdmin ? 'admin' : 'profesional',
                    activo: true,
                }]);
            if (err_mem) throw err_mem;

            // Marcar el código de activación como usado.
            if (codigoRow) {
                await supabase
                    .from("codigo_activacion")
                    .update({ usado: true, usado_por: userId })
                    .eq("id", codigoRow.id);
            }
        }

        if (role === "RECEPCION") {
            // Fase E: la recepción NO tiene fila en `profesional` (no es un profesional:
            // sin matrícula ni especialidad). Su pertenencia y permisos viven en la
            // membresía. La clínica activa se resuelve luego a partir de ella.
            // Fase J: con un código de auditor queda como 'auditor' (con el alcance del código).
            const esAuditor = codigoRow && codigoRow.rol === 'auditor';
            const { error: err_mem } = await supabase
                .from("membresia")
                .insert([{
                    id_persona,
                    clinica_id: clinicaId,
                    rol: esAuditor ? 'auditor' : 'recepcion',
                    alcance_obra_social: esAuditor ? (codigoRow.alcance_obra_social || null) : null,
                    alcance_id_obra_social: esAuditor ? (codigoRow.alcance_id_obra_social || null) : null,
                    activo: true,
                }]);
            if (err_mem) throw err_mem;

            if (codigoRow) {
                await supabase
                    .from("codigo_activacion")
                    .update({ usado: true, usado_por: userId })
                    .eq("id", codigoRow.id);
            }
        }

        // Con la confirmación de email activada, signUp no devuelve sesión: el usuario
        // tiene que confirmar antes de poder iniciar sesión (el cliente se lo avisa).
        res.json({
            message: "Registro exitoso",
            user: { id: userId, email: user.email, role },
            requiereConfirmacion: !data.session,
        });

    } catch (err) {
        console.error("Error detallado en registro:", err);
        res.status(500).json({ error: "Error en el registro" });
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Autenticación con Supabase Auth (cliente anon, para no adjuntar la sesión
        //    del usuario al cliente service_role).
        const { data, error } = await supabaseAuth.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            // Supabase solo devuelve `email_not_confirmed` con la contraseña correcta,
            // así que avisarlo no revela si el email existe.
            if (error.code === "email_not_confirmed") {
                return res.status(403).json({
                    error: "Todavía no confirmaste tu email. Revisá tu bandeja de entrada (y el spam).",
                    code: "EMAIL_NO_CONFIRMADO",
                });
            }
            return res.status(401).json({ error: "Credenciales inválidas" });
        }

        const userId = data.user.id;

        // 2. Guardar los tokens de Supabase (Fase 2c: operar por-JWT bajo RLS).
        if (data.session) {
            req.session.sb = {
                accessToken: data.session.access_token,
                refreshToken: data.session.refresh_token,
                expiresAt: data.session.expires_at, // epoch en segundos
            };
        }
        req.session.isAuthenticated = true;

        // 3. Detectar los perfiles desde la base (NO se confía en un rol enviado por el
        //    cliente). Un mismo formulario de login sirve para staff y paciente.
        //    Fase O: una cuenta puede ser staff y además paciente (en otra clínica o en
        //    la suya); en ese caso elige con qué perfil entrar (POST /auth/select-perfil).
        const auth = { id: userId, email: data.user.email };
        const perfiles = await perfilesDeCuenta(userId);

        if (perfiles.staff && perfiles.fichas.length > 0) {
            req.session.user = {
                idRole: null, id: userId, personaId: null, email: auth.email, role: null,
                clinicaId: null, rol: null, esAdmin: false, perfiles: ['staff', 'paciente'],
            };
            return res.json({
                message: "Elegí con qué perfil entrar",
                needsProfileSelection: true,
                user: req.session.user,
            });
        }
        if (perfiles.staff) return iniciarStaff(req, res, auth, perfiles.staff, ['staff']);
        if (perfiles.fichas.length > 0) return iniciarPaciente(req, res, auth, perfiles.fichas, ['paciente']);

        // Sin perfil: dado de baja en todas sus clínicas, cuenta legacy sin backfill, o
        // un usuario sin ningún rol. No puede operar.
        req.session.destroy(() => {});
        return res.status(403).json({
            error: perfiles.profesionalSinClinica
                ? "No tenés una clínica activa asignada. Contactá al administrador."
                : "El usuario no tiene rol asignado",
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al iniciar sesión" });
    }
};

// Fase O — perfiles de una cuenta de Auth:
//   staff: { persona, profRow, membresias } si es profesional/recepción/auditor con al
//          menos una membresía activa (una cuenta tiene una sola persona de staff).
//   fichas: sus fichas de paciente (una por clínica; ver utils/fichasPaciente).
async function perfilesDeCuenta(userId) {
    const { data: personas, error } = await supabase
        .from("persona")
        .select("id, profesional(id)")
        .eq("id_auth", userId)
        .order("id", { ascending: true });
    if (error) console.error("Error al buscar las personas en login:", error);

    // Profesional primero; si no hay, la persona con membresías (recepción/auditoría).
    const lista = [...(personas || [])].sort((a, b) => !!b.profesional?.[0] - !!a.profesional?.[0]);
    let staff = null;
    for (const p of lista) {
        let membresias = [];
        try {
            membresias = await getMembresiasActivas(supabase, p.id);
        } catch (e) {
            console.error("Error obteniendo membresías en login:", e.message);
        }
        if (membresias.length > 0) {
            staff = { persona: p, profRow: p.profesional?.[0] || null, membresias };
            break;
        }
    }

    return {
        staff,
        profesionalSinClinica: !staff && lista.some((p) => p.profesional?.[0]),
        fichas: await fichasPaciente(userId),
    };
}

// Sesión de paciente: la ficha "principal" (autoregistro o la más vieja) da idRole y
// personaId por compatibilidad; lo del paciente se arma con todas sus fichas.
function iniciarPaciente(req, res, auth, fichas, perfiles) {
    const principal = fichas[0];
    req.session.user = {
        idRole: principal.paciente.id, id: auth.id, personaId: principal.persona.id,
        email: auth.email, role: "paciente",
        clinicaId: principal.clinicaId, rol: null, esAdmin: false, perfiles,
    };
    return res.json({ message: "Login exitoso", user: req.session.user });
}

// Sesión de staff (Fase A): la clínica activa sale de las MEMBRESÍAS.
function iniciarStaff(req, res, auth, staff, perfiles) {
    const { persona, profRow, membresias } = staff;
    // Fase E: sin fila en `profesional` => RECEPCIÓN (Fase J: o AUDITOR).
    const role = profRow ? "profesional" : roleSinProfesional(membresias);
    const base = {
        idRole: profRow ? profRow.id : null, id: auth.id, personaId: persona.id,
        email: auth.email, role, perfiles,
    };

    if (membresias.length === 1) {
        const m = membresias[0];
        req.session.user = {
            ...base, clinicaId: m.clinicaId, rol: m.rol, esAdmin: m.esAdmin,
            alcanceObraSocial: m.alcanceObraSocial, alcanceIdObraSocial: m.alcanceIdObraSocial,
        };
        return res.json({ message: "Login exitoso", user: req.session.user });
    }

    // Varias clínicas: no se fija ninguna todavía; el cliente debe elegir.
    req.session.user = {
        ...base, clinicaId: null, rol: null, esAdmin: false, alcanceObraSocial: null, alcanceIdObraSocial: null,
    };
    return res.json({
        message: "Elegí la clínica para trabajar",
        needsClinicSelection: true,
        clinicas: membresias.map((m) => ({ clinicaId: m.clinicaId, nombre: m.nombre, rol: m.rol })),
        user: req.session.user,
    });
}

// Fase O — GET /auth/perfiles: con qué perfiles puede entrar la cuenta (para el
// selector), con las clínicas de cada uno.
exports.misPerfiles = async (req, res) => {
    try {
        const { staff, fichas } = await perfilesDeCuenta(req.session.user.id);
        return res.json({
            activo: req.session.user.role === "paciente" ? "paciente" : (req.session.user.role ? "staff" : null),
            staff: staff && {
                role: staff.profRow ? "profesional" : roleSinProfesional(staff.membresias),
                clinicas: staff.membresias.map((m) => m.nombre).filter(Boolean),
            },
            paciente: fichas.length > 0 ? { clinicas: fichas.map((f) => f.clinica).filter(Boolean) } : null,
        });
    } catch (err) {
        console.error("Error en perfiles:", err);
        return res.status(500).json({ error: "Error al obtener tus perfiles" });
    }
};

// Fase O — POST /auth/select-perfil { perfil: 'staff' | 'paciente' }: entra (o cambia)
// con ese perfil. Se recalcula desde la base: no se confía en la sesión ni en el cliente.
exports.selectPerfil = async (req, res) => {
    try {
        const u = req.session.user;
        const auth = { id: u.id, email: u.email };
        const { staff, fichas } = await perfilesDeCuenta(u.id);
        const disponibles = [staff && "staff", fichas.length > 0 && "paciente"].filter(Boolean);
        if (!disponibles.includes(req.body.perfil)) {
            return res.status(403).json({ error: "Tu cuenta no tiene ese perfil." });
        }
        return req.body.perfil === "staff"
            ? iniciarStaff(req, res, auth, staff, disponibles)
            : iniciarPaciente(req, res, auth, fichas, disponibles);
    } catch (err) {
        console.error("Error en select-perfil:", err);
        return res.status(500).json({ error: "Error al elegir el perfil" });
    }
};

// Reenvía el email de confirmación de la cuenta. Respuesta genérica siempre: no se
// revela si el email existe ni si ya estaba confirmado (anti-enumeración).
exports.reenviarConfirmacion = async (req, res) => {
    const respuestaGenerica = {
        message: 'Si el email tiene una cuenta pendiente de confirmar, te reenviamos el enlace.'
    };
    try {
        const { email } = req.body;
        const { error } = await supabaseAuth.auth.resend({ type: 'signup', email });
        if (error) {
            // Se loguea pero no se expone al cliente (incluye el límite de envíos de Supabase).
            console.error('Error en resend de confirmación:', error.message);
        }
        return res.json(respuestaGenerica);
    } catch (err) {
        console.error('Error en reenviar-confirmacion:', err);
        return res.json(respuestaGenerica);
    }
};

exports.logout = (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ error: 'Error al cerrar sesión', err });
        }
        res.status(200).json({ message: 'Sesión cerrada exitosamente' });
    });
};

// Fase A — Lista las membresías (clínicas + rol) del usuario autenticado.
// Sirve para el selector de clínica y para el switch dentro del dashboard.
exports.misClinicas = async (req, res) => {
    try {
        const personaId = req.session.user?.personaId;
        if (!personaId) return res.json({ clinicas: [], activa: null });
        const membresias = await getMembresiasActivas(supabase, personaId);
        return res.json({
            clinicas: membresias.map((m) => ({ clinicaId: m.clinicaId, nombre: m.nombre, rol: m.rol })),
            activa: req.session.user?.clinicaId || null,
        });
    } catch (err) {
        console.error('Error en mis-clinicas:', err);
        return res.status(500).json({ error: 'Error al obtener las clínicas' });
    }
};

// Fase A — Fija la clínica activa de la sesión. Valida que el usuario tenga una
// membresía ACTIVA en la clínica pedida (no se confía en el cliente).
exports.selectClinica = async (req, res) => {
    try {
        const personaId = req.session.user?.personaId;
        const { clinicaId } = req.body;
        if (!personaId) return res.status(403).json({ error: 'Sesión sin identidad.' });
        // Fase O: la clínica activa es del perfil de staff; el paciente no la elige.
        if (req.session.user.role === 'paciente') {
            return res.status(403).json({ error: 'Entrá con tu perfil de profesional para elegir una clínica.' });
        }
        if (!clinicaId) return res.status(400).json({ error: 'Debés indicar una clínica.' });

        const membresias = await getMembresiasActivas(supabase, personaId);
        const elegida = membresias.find((m) => m.clinicaId === clinicaId);
        if (!elegida) {
            return res.status(403).json({ error: 'No tenés una membresía activa en esa clínica.' });
        }

        req.session.user.clinicaId = elegida.clinicaId;
        req.session.user.rol = elegida.rol;
        req.session.user.esAdmin = elegida.esAdmin;
        req.session.user.alcanceObraSocial = elegida.alcanceObraSocial;
        req.session.user.alcanceIdObraSocial = elegida.alcanceIdObraSocial;
        // Fase J: una cuenta sin fila en `profesional` es auditor o recepción según
        // la clínica elegida (puede ser auditor en una y recepción en otra).
        if (!req.session.user.idRole) {
            req.session.user.role = roleSinProfesional([elegida]);
        }

        return res.json({
            message: 'Clínica seleccionada',
            clinica: { clinicaId: elegida.clinicaId, nombre: elegida.nombre, rol: elegida.rol },
            user: req.session.user,
        });
    } catch (err) {
        console.error('Error en select-clinica:', err);
        return res.status(500).json({ error: 'Error al seleccionar la clínica' });
    }
};

// Área/especialidad del profesional AUTENTICADO (se deriva de la sesión, no del body).
// Usado por la historia clínica y los dashboards. Requiere sesión (ver authRoutes).
exports.getArea = async (req, res) => {
    try {
        const idRole = req.session.user.idRole; // profesional.id
        let area = null;
        if (idRole) {
            const { data, error } = await supabase
                .from('especialidad_profesional')
                .select('id_especialidad ( nombre )')
                .eq('id_profesional', idRole)
                .limit(1);
            if (error) {
                console.error('Error obteniendo el área:', error);
                return res.status(400).json({ error: error.message });
            }
            if (data && data[0] && data[0].id_especialidad) area = data[0].id_especialidad.nombre;
        }
        return res.json({ area });
    } catch (err) {
        console.error('Error en get-area:', err);
        return res.status(500).json({ error: 'Error al obtener el área' });
    }
};

// Solicitud de recuperación de contraseña.
// Dispara el email de recuperación de Supabase Auth (mismo mecanismo que el botón
// "Send recovery" del dashboard). El enlace del email redirige a /reset-password.html,
// donde el usuario define su nueva contraseña.
// Respuesta genérica siempre: no se revela si el email existe (anti-enumeración).
exports.forgotPassword = async (req, res) => {
    const respuestaGenerica = {
        message: 'Si el email está registrado, te enviamos un enlace para restablecer tu contraseña.'
    };
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Debe indicar un email.' });

        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        // Ruta del SPA (React). Se conserva compatibilidad con el legacy .html vía
        // un redirect en el router del frontend.
        const redirectTo = `${baseUrl}/reset-password`;

        const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) {
            // Se loguea pero no se expone al cliente.
            console.error('Error en resetPasswordForEmail:', error.message);
        }

        return res.json(respuestaGenerica);
    } catch (err) {
        console.error('Error en forgot-password:', err);
        return res.json(respuestaGenerica);
    }
};

// Cambiar la contraseña estando logueado (cualquier rol). Pide la actual: si alguien
// agarra una sesión abierta no puede cambiarla sin saberla. El usuario se toma de la
// sesión, nunca del body. La sesión actual sigue válida.
exports.cambiarContrasena = async (req, res) => {
    try {
        const { actual, nueva } = req.body;
        const userId = req.session.user.id;
        if (actual === nueva) {
            return res.status(400).json({ error: 'La contraseña nueva tiene que ser distinta de la actual.' });
        }

        const { data: u, error: uErr } = await supabase.auth.admin.getUserById(userId);
        const email = u && u.user && u.user.email;
        if (uErr || !email) return res.status(400).json({ error: 'No encontramos tu cuenta.' });

        // Verificar la contraseña actual (cliente anon, sin adjuntar la sesión al service_role).
        const { data: check, error: checkErr } = await supabaseAuth.auth.signInWithPassword({ email, password: actual });
        if (checkErr) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
        // Esa verificación abrió una sesión de Supabase que no se usa: se cierra.
        if (check && check.session) {
            supabase.auth.admin.signOut(check.session.access_token, 'local').catch(() => {});
        }

        const { error } = await supabase.auth.admin.updateUserById(userId, { password: nueva });
        if (error) {
            if (error.code === 'weak_password' || error.code === 'same_password') {
                return res.status(400).json({ error: 'Elegí una contraseña más segura (y distinta de la anterior).' });
            }
            throw error;
        }

        // Aviso por mail (best-effort): si no fue el titular, se entera.
        const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        sendMail({
            to: email,
            subject: 'Tu contraseña de Medilu se cambió',
            text: `Hola,\n\nLa contraseña de tu cuenta de Medilu se cambió recién.\n\nSi no fuiste vos, restablecela ya desde ${baseUrl}/forgot-password.\n\nMedilu.`,
            html: `<p>Hola,</p><p>La contraseña de tu cuenta de Medilu se cambió recién.</p><p>Si no fuiste vos, <a href="${baseUrl}/forgot-password">restablecela ya</a>.</p><p>Medilu.</p>`,
        }).catch((e) => console.error('No se pudo avisar el cambio de contraseña:', e.message));

        return res.json({ message: 'Contraseña actualizada.' });
    } catch (err) {
        console.error('Error en cambiar-contrasena:', err);
        return res.status(500).json({ error: 'No se pudo cambiar la contraseña.' });
    }
};

// Asigna una especialidad al profesional AUTENTICADO (se deriva de la sesión).
// Acepta id numérico o nombre de especialidad. Requiere rol profesional (ver authRoutes).
exports.saveArea = async (req, res) => {
    try {
        const idRole = req.session.user.idRole; // profesional.id
        let { especialidad } = req.body;

        if (!idRole) return res.status(400).json({ error: 'Profesional no identificado en la sesión' });
        if (especialidad === undefined || especialidad === null || especialidad === '') {
            return res.status(400).json({ error: 'Debe indicar una especialidad' });
        }

        // Resolver a id si viene un nombre.
        let idEspecialidad = especialidad;
        if (isNaN(Number(especialidad))) {
            const { data, error } = await supabase
                .from('especialidad')
                .select('id')
                .eq('nombre', especialidad)
                .maybeSingle();
            if (error) return res.status(400).json({ error: error.message });
            if (!data) return res.status(404).json({ error: 'Especialidad no encontrada' });
            idEspecialidad = data.id;
        }

        // onConflict sobre el par (id_profesional, id_especialidad): con la UNIQUE
        // de fase2d, reasignar la misma especialidad es idempotente (no duplica).
        const { error } = await supabase
            .from('especialidad_profesional')
            .upsert(
                { id_profesional: idRole, id_especialidad: idEspecialidad },
                { onConflict: 'id_profesional,id_especialidad' }
            );
        if (error) return res.status(400).json({ error: error.message });

        return res.json({ message: 'Área asignada correctamente', especialidad: idEspecialidad });
    } catch (err) {
        console.error('Error en save-area:', err);
        return res.status(500).json({ error: 'Error al guardar el área' });
    }
};