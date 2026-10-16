require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const session = require('express-session');

const authRoutes = require('./routes/authRoutes');
const horariosRoutes = require('./routes/horarios');
const pacienteRoutes = require('./routes/pacienteRoutes'); // Fase 1: historia clínica en Supabase
const especialidadesRoutes = require('./routes/especialidadesRoutes');
const profesionalRoutes = require('./routes/profesionalRoutes');
const avatarsRoutes = require('./routes/avatarsRoutes');
const publicRoutes = require('./routes/publicRoutes'); // Fase 1: /professionals, /api/get-hours
const clinicaRoutes = require('./routes/clinicaRoutes'); // Fase 2: gestión de clínica
const adminRoutes = require('./routes/adminRoutes'); // Fase B: administración (miembros)
const turnosRoutes = require('./routes/turnosRoutes'); // Fase 3: turnos del paciente (/api/turnos)
const miCuentaRoutes = require('./routes/miCuentaRoutes'); // Fase 3: autogestión del paciente (/api/mi-cuenta)
const certificadoRoutes = require('./routes/certificadoRoutes'); // Fase C: certificados médicos
const hcRoutes = require('./routes/hcRoutes'); // Fase D: export/import de historias clínicas
const staffRoutes = require('./routes/staffRoutes'); // Fase E: gestión de turnos por el staff (/staff)
const estudioRoutes = require('./routes/estudioRoutes'); // Fase I: mis estudios del paciente (/estudios)
const dictadoRoutes = require('./routes/dictadoRoutes'); // dictado por voz con whisper.cpp local (/dictado)
const auditoriaRoutes = require('./routes/auditoriaRoutes'); // Fase J: auditoría médica (bandeja, revisiones, bitácora)
const catalogoRoutes = require('./routes/catalogoRoutes'); // Fase K: obras sociales, CIE-10 y prácticas
const autorizacionRoutes = require('./routes/autorizacionRoutes'); // Fase K: autorizaciones previas
const legalRoutes = require('./routes/legalRoutes'); // robots/sitemap + botón de arrepentimiento y de baja
const planRoutes = require('./routes/planRoutes'); // Fase L: catálogo de planes y plan de la clínica
const plataformaRoutes = require('./routes/plataformaRoutes'); // Fase L: activación de planes (equipo de la plataforma)
const pagoRoutes = require('./routes/pagoRoutes'); // Fase M: suscripción de la clínica con Mercado Pago
// (los guards de auth se aplican en cada router; el dashboard pasó al SPA)
const { supabase } = require('./config/supabaseClient');
const { getMembresiasActivas, clinicasDeProfesional } = require('./utils/membresias');
const { fichasPaciente } = require('./utils/fichasPaciente'); // Fase O
const { generarTokenGestion } = require('./utils/turnoToken');
const { sendMail, isMailerConfigured } = require('./utils/mailer');
const { mailTurno } = require('./utils/mailTurno');
const {
    franjasDeFecha, slotsDisponibles, validarHorarioTurno, estaLibre, esSolapeTurno,
    horariosDeProfesional,
} = require('./utils/disponibilidad');
const { turnosOnlineApagados } = require('./utils/turnosOnline'); // Fase N2
const { validate } = require('./middleware/validate');
const schemas = require('./validators/schemas');
const planes = require('./utils/planes');
const { soloLectura } = require('./middleware/plan');
const { sesionVigente } = require('./middleware/sesionVigente');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ---------------------------------------------------------------------------
// Seguridad base
// ---------------------------------------------------------------------------
if (isProd) {
    app.set('trust proxy', 1); // necesario para cookies 'secure' detrás de un proxy/https
}

// Health check liviano: lo usan Render y los pings de keep-alive (ver "Keep-alive"
// abajo). Va antes del rate limit y de la sesión para no gastar cupo ni crear sesiones.
app.get('/healthz', (req, res) => {
    res.set('Cache-Control', 'no-store').json({ ok: true, uptime: Math.round(process.uptime()) });
});

// Helmet para las cabeceras de seguridad; la CSP la definimos aparte (abajo) para
// declararla explícitamente (estricta para todo el sitio).
app.use(helmet({ contentSecurityPolicy: false }));

// ---------------------------------------------------------------------------
// Content-Security-Policy
// ---------------------------------------------------------------------------
// El SPA (build de Vite) sirve TODOS sus scripts desde el mismo origen (/assets/*.js,
// sin scripts inline), así que recibe una política ESTRICTA (script-src 'self'). Ya no
// se publican páginas .html legacy, por lo que no hace falta una política más laxa.
// Las fuentes son locales (@fontsource): ningún recurso de terceros carga en el navegador.
// Supabase se agrega a connect-src/img-src para el flujo de auth (reset de contraseña)
// y para las URLs públicas de avatares.
const SUPABASE_ORIGIN = (() => {
    try { return new URL(process.env.SUPABASE_URL).origin; } catch { return ''; }
})();

const CSP_STRICT = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React/Radix inyectan estilos inline en runtime
    "font-src 'self' data:",
    `img-src 'self' data: blob: ${SUPABASE_ORIGIN}`.trim(),
    `connect-src 'self' ${SUPABASE_ORIGIN}`.trim(),
    "worker-src 'self' blob:",
].join('; ');

app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', CSP_STRICT);
    next();
});

// CORS con lista blanca de orígenes (ALLOWED_ORIGINS separados por coma).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

// En producción la lista es OBLIGATORIA: con credentials:true no se puede reflejar
// un origen arbitrario (permitiría requests autenticadas cross-origin). Falla cerrado.
if (isProd && allowedOrigins.length === 0) {
    console.error('⛔ ALLOWED_ORIGINS no está definido en producción: se rechazará todo origen cross-origin.');
}

// Formato "delegado" para poder comparar el Origin contra el propio host (same-origin):
// el SPA se sirve del mismo origen que la API, y esas requests deben permitirse SIEMPRE.
// El cross-origin real requiere estar en ALLOWED_ORIGINS (en prod falla cerrado).
// Se responde origin:false (sin cabeceras CORS) en vez de lanzar Error, para que el
// navegador bloquee la respuesta sin ensuciar los logs con stack traces.
app.use(cors((req, cb) => {
    const origin = req.header('Origin');
    const permitir = { origin: true, credentials: true };

    // Sin Origin = navegación GET same-origin / herramientas locales (curl, apps).
    if (!origin) return cb(null, permitir);

    // Mismo origen que el servidor (el propio SPA): siempre permitido.
    const selfOrigin = `${req.protocol}://${req.get('host')}`;
    if (origin === selfOrigin) return cb(null, permitir);

    // En desarrollo, sin lista configurada, se permite cualquier origen (comodidad local).
    if (!isProd && allowedOrigins.length === 0) return cb(null, permitir);

    // Cross-origin: solo si está en la lista blanca.
    if (allowedOrigins.includes(origin)) return cb(null, permitir);

    return cb(null, { origin: false }); // origen no permitido: el navegador lo bloquea
}));

// JSON con el límite por defecto (100 KB), salvo el import de HC, que trae su propio
// parser de 20 MB (routes/hcRoutes.js): si este lo leía primero, todo archivo de más
// de 100 KB daba 413 antes de llegar a la ruta.
const jsonParser = express.json();
app.use((req, res, next) => (req.path === '/hc/import' ? next() : jsonParser(req, res, next)));
app.use(express.urlencoded({ extended: true }));

// Rate limiting general. El limiter estricto de login/register vive en routes/authRoutes.js.
// /dictado tiene su propio limiter (manda un tramo de audio cada pocos segundos).
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    skip: (req) => req.path.startsWith('/dictado'),
});
app.use(generalLimiter);

// Limiter estricto para la reserva pública de turnos: al crear un turno se dispara un
// email de confirmación a la dirección indicada, por lo que sin este límite el endpoint
// podría abusarse para spam / email-bombing con la reputación del dominio remitente.
const createEventLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// ---------------------------------------------------------------------------
// Sesiones
// ---------------------------------------------------------------------------
// En producción no se arranca sin SESSION_SECRET: con el valor por defecto (público en
// el repo) cualquiera podría firmar cookies de sesión válidas (auditoría 2026-10-15, #12).
if (!process.env.SESSION_SECRET) {
    if (isProd) {
        console.error('⛔ SESSION_SECRET no está definido: el servidor no arranca en producción sin él.');
        process.exit(1);
    }
    console.warn('⚠️  SESSION_SECRET no está definido en .env');
}

// Sin MP_WEBHOOK_SECRET los webhooks de Mercado Pago no se validan por firma (igual se
// re-consulta cada recurso en MP, pero la firma evita procesar avisos falsos).
if (isProd && process.env.MP_ACCESS_TOKEN && !process.env.MP_WEBHOOK_SECRET) {
    console.warn('⚠️  MP_WEBHOOK_SECRET no está definido: los webhooks de Mercado Pago no se validan por firma.');
}

let sessionStore; // undefined => MemoryStore (solo desarrollo)
if (process.env.DATABASE_URL) {
    const pgSession = require('connect-pg-simple')(session);
    // Tabla en el esquema `sesiones` (no expuesto por la API de Supabase), creada por
    // db/faseS_sesiones.sql. DATABASE_URL usa el rol medilu_sesiones, que solo puede
    // leer y escribir esa tabla (no crearla).
    sessionStore = new pgSession({
        conString: process.env.DATABASE_URL,
        schemaName: 'sesiones',
        tableName: 'session',
        createTableIfMissing: false
    });
} else {
    console.warn('⚠️  DATABASE_URL no configurada: usando MemoryStore (no apto para producción).');
}

app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'cambia-esto-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24 horas
        secure: isProd,              // solo por HTTPS en producción
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Auditoría 2026-10-15 (#7): la sesión del staff se revalida contra sus membresías
// (baja o cambio de rol se aplican sin esperar a que venza la cookie).
app.use(sesionVigente);

// ---------------------------------------------------------------------------
// Estáticos y rutas
// ---------------------------------------------------------------------------
// SPA (React): en producción servimos el build de /frontend/dist desde la raíz.
// Se registra ANTES del static legacy para que "/" sea el index.html del SPA.
// robots.txt / sitemap.xml (dinámicos, con APP_URL) y botón de arrepentimiento/baja.
// Van antes del static para que ningún archivo los pise.
app.use('/', legalRoutes);

const spaDist = path.join(__dirname, '..', 'frontend', 'dist');
if (isProd) {
    app.use(express.static(spaDist));
}

// Las páginas .html legacy de backend/public YA NO se publican: todas tienen su
// reemplazo en el SPA, y seguir sirviéndolas exponía versiones viejas (política de
// privacidad, planes y formularios desactualizados, fotos sin licencia verificada) y
// cargaba recursos de terceros (Google Fonts, jsDelivr) sin informarlo. Los archivos
// se conservan en el repo solo como referencia, igual que backend/dashboard/.

// Fase L: con la suscripción vencida, el staff solo lee y exporta. Se monta sobre los
// datos de la CLÍNICA; quedan afuera /auth, el perfil propio (/profesional, /avatars),
// /admin (dar de baja miembros para volver al cupo) y todo lo del paciente.
app.use([
    '/hour', '/pacient', '/clinica', '/certificados', '/hc', '/staff',
    '/dictado', '/auditoria', '/catalogos', '/autorizaciones',
], soloLectura);

app.use('/auth', authRoutes);
app.use('/hour', horariosRoutes);
app.use('/pacient', pacienteRoutes); // Fase 1: historia clínica (rol profesional)
app.use('/especialidades', especialidadesRoutes); // público: usado en el registro
app.use('/profesional', profesionalRoutes);
app.use('/avatars', avatarsRoutes);
app.use('/clinica', clinicaRoutes); // Fase 2: gestión de clínica (rol profesional)
app.use('/admin', adminRoutes); // Fase B: administración de la clínica (solo admin)
app.use('/certificados', certificadoRoutes); // Fase C: certificados médicos
app.use('/hc', hcRoutes); // Fase D: export/import de historias clínicas
app.use('/staff', staffRoutes); // Fase E: gestión de turnos por el staff (recepción/profesional/admin)
app.use('/estudios', estudioRoutes); // Fase I: repositorio de estudios del paciente + compartir
app.use('/dictado', dictadoRoutes); // dictado por voz (proxy al whisper.cpp local)
app.use('/auditoria', auditoriaRoutes); // Fase J: auditoría médica (auditor/admin + respuestas del profesional)
app.use('/catalogos', catalogoRoutes); // Fase K: catálogos (obras sociales, CIE-10, prácticas)
app.use('/autorizaciones', autorizacionRoutes); // Fase K: autorizaciones previas de prácticas
app.use('/api/turnos', turnosRoutes); // Fase 3: turnos del paciente (mis turnos / gestión por token)
app.use('/api/mi-cuenta', miCuentaRoutes); // Fase 3: autogestión del paciente (perfil / historia)
app.use('/api/planes', planRoutes); // Fase L: catálogo público + plan y uso de la clínica activa
app.use('/api/pagos', pagoRoutes); // Fase M: contratar/cancelar con Mercado Pago + webhook (fuera del guard de solo lectura)
app.use('/plataforma', plataformaRoutes); // Fase L: panel de la plataforma (PLATAFORMA_ADMIN_EMAILS)
app.use('/', publicRoutes); // público: /professionals, /api/get-hours (página de turnos)

// Config pública para el cliente (solo datos NO sensibles).
// La anon/public key de Supabase es segura de exponer; la service_role NUNCA se envía.
app.get('/api/public-config', (req, res) => {
    res.json({
        supabaseUrl: process.env.SUPABASE_URL || null,
        supabaseAnonKey: process.env.SUPABASE_KEY_PUBLIC || null,
    });
});

app.get('/api/user', async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'No autenticado' });
    }
    const u = req.session.user;

    // Nombre completo desde persona (para dashboards). Best-effort: no bloquea si falla.
    // Fase O: una cuenta puede tener varias personas (una por clínica): se usa la de la
    // sesión (staff, o la ficha principal del paciente).
    let fullName = null;
    try {
        const { data } = u.personaId
            ? await supabase.from('persona').select('nombre, apellido').eq('id', u.personaId).maybeSingle()
            : { data: null };
        if (data) fullName = [data.nombre, data.apellido].filter(Boolean).join(' ');
    } catch (err) {
        console.error('Error obteniendo nombre en /api/user:', err.message);
    }

    // Fase A (multi-clínica): clínicas del staff + estado de selección.
    // Fase E: la recepción también es staff con membresías (sin fila en profesional).
    // Fase J: ídem el auditor.
    const esStaff = u.role === 'profesional' || u.role === 'recepcion' || u.role === 'auditor';
    let clinicas = [];
    if (esStaff && u.personaId) {
        try {
            const membresias = await getMembresiasActivas(supabase, u.personaId);
            clinicas = membresias.map((m) => ({ clinicaId: m.clinicaId, nombre: m.nombre, rol: m.rol }));
        } catch (err) {
            console.error('Error obteniendo clínicas en /api/user:', err.message);
        }
    }
    // Necesita elegir clínica si tiene varias y todavía no fijó ninguna.
    const needsClinicSelection = esStaff && !u.clinicaId && clinicas.length > 1;

    // Fase L: plan de la clínica activa (qué funciones incluye y si está vigente).
    let plan = null;
    if (esStaff && u.clinicaId) {
        try {
            const pc = await planes.getPlanClinica(u.clinicaId);
            plan = pc && {
                id: pc.planId,
                nombre: pc.planNombre,
                estado: pc.estado,
                soloLectura: pc.soloLectura,
                diasRestantes: pc.diasRestantes,
                features: pc.features,
            };
        } catch (err) {
            console.error('Error obteniendo el plan en /api/user:', err.message);
        }
    }

    res.json({
        user: u.email,
        email: u.email,
        fullName,
        idRole: u.idRole,
        id: u.id,
        role: u.role,
        // Clínica activa y rol dentro de ella (admin | profesional | recepcion | auditor).
        clinicaId: u.clinicaId || null,
        rol: u.rol || null,
        esAdmin: !!u.esAdmin,
        // Fase J: alcance del auditor (obra social) en la clínica activa; null = interno.
        alcanceObraSocial: u.alcanceObraSocial || null,
        alcanceIdObraSocial: u.alcanceIdObraSocial || null,
        clinicas,
        needsClinicSelection,
        // Fase O: perfiles de la cuenta (staff y/o paciente). Con los dos y sin elegir
        // todavía (role null), el cliente muestra el selector de perfil.
        perfiles: u.perfiles || [],
        needsProfileSelection: !u.role && (u.perfiles || []).length > 1,
        plan,
        // Fase L: equipo de la plataforma (activa planes y edita precios).
        esPlataforma: planes.esAdminPlataforma(u.email),
    });
});

// El dashboard es ahora parte del SPA (React, rutas /dashboard*). Ya no se
// sirven los HTML legacy de /dashboard: el SPA controla esas rutas y protege
// el acceso en el cliente (los datos siguen protegidos por sesión en la API).
// Los .html legacy de backend/dashboard/ se conservan como referencia.

// ---------------------------------------------------------------------------
// Turnos (Fase F): la disponibilidad se calcula contra la base (utils/disponibilidad),
// no contra Google Calendar. La lógica de slots/solapamiento vive en ese módulo.
// ---------------------------------------------------------------------------

// Fase U — Clínica de un turno: un profesional puede atender en varias, y cada una
// tiene sus horarios. Se toma, en orden: la de la página (?clinica=<slug>), la clínica
// activa del staff logueado, o la única donde atiende el profesional.
// Devuelve { clinicaId } o { status, error } para responder tal cual.
async function clinicaDelTurno(req, profId, slug) {
    const clinicas = await clinicasDeProfesional(supabase, profId);
    const s = slug && String(slug).trim();
    if (s) {
        const { data: cli, error } = await supabase
            .from('clinica').select('id').eq('slug', s).eq('activa', true).maybeSingle();
        if (error) throw error;
        if (!cli) return { status: 404, error: 'Clínica no encontrada.' };
        if (!clinicas.includes(cli.id)) return { status: 403, error: 'El profesional no pertenece a esta clínica.' };
        return { clinicaId: cli.id };
    }
    const activa = req.session?.isAuthenticated && req.session.user?.role !== 'paciente'
        ? req.session.user?.clinicaId : null;
    if (activa && clinicas.includes(activa)) return { clinicaId: activa };
    if (clinicas.length === 1) return { clinicaId: clinicas[0] };
    if (clinicas.length === 0) return { status: 404, error: 'Profesional no encontrado' };
    return { status: 400, error: 'El profesional atiende en varias clínicas: elegí la clínica primero.' };
}

// Franjas horarias disponibles de un profesional para una fecha dada.
// Respeta horario_profesional (por día de la semana, de la clínica del turno) y
// excluye los turnos y bloqueos ya cargados.
app.get('/available-slots', validate(schemas.calendar.availableSlots, 'query'), async (req, res) => {
    const { date, profId, clinica } = req.query;

    try {
        // 1. Horarios de atención del profesional en la clínica (por día de la semana).
        const cli = await clinicaDelTurno(req, profId, clinica);
        if (cli.error) return res.status(cli.status).json({ error: cli.error });
        const horarios = await horariosDeProfesional(profId, cli.clinicaId);

        // 2. Franjas del día de la semana pedido.
        const franjas = franjasDeFecha(horarios, date);
        if (franjas.length === 0) return res.json([]); // no atiende ese día

        // 3. Slots libres = franjas − turnos reservados − bloqueos (Fase F, contra la base).
        const slots = await slotsDisponibles(profId, date, franjas);
        res.json(slots);
    } catch (error) {
        console.error('Error obteniendo slots disponibles:', error.message);
        res.status(500).json({ error: 'Error al obtener los turnos disponibles' });
    }
});

// Crear un turno (reserva pública desde la página de turnos).
// El profesional se toma del body y se valida contra la base; la clínica del turno se
// DERIVA del profesional. La disponibilidad se chequea contra la base (Fase F): si el
// horario ya está reservado o bloqueado, se rechaza. Si la reserva viene de la página
// de una clínica (?clinica=<slug>), el profesional debe pertenecer a ella (Fase 2).
app.post('/create-event', createEventLimiter, validate(schemas.calendar.createEvent), async (req, res) => {
    const { start, end, email, number, numberCode, profId, clinica, name } = req.body;

    // Consentimiento expreso del invitado (Ley 25.326): el turno revela datos de salud
    // (especialidad/profesional) y se aloja en servidores fuera del país. El paciente
    // logueado ya lo prestó al registrarse.
    const esPacienteLogueado = req.session?.isAuthenticated && req.session.user?.role === 'paciente';
    if (!esPacienteLogueado && req.body.aceptaTerminos !== true) {
        return res.status(400).json({ error: 'Tenés que aceptar los Términos y la Política de privacidad para reservar.' });
    }

    // Teléfono opcional; si viene, se guarda con su código de país.
    const telefono = number != null && String(number).trim()
        ? [numberCode, String(number).trim()].filter(Boolean).join(' ')
        : null;

    try {
        // 1. Profesional -> clínica + snapshot (nombre/especialidad) desde la base.
        const { data: prof, error: profError } = await supabase
            .from('profesional')
            .select(`
                turnos_online,
                persona:id_persona ( nombre, apellido ),
                especialidad_profesional ( especialidad:id_especialidad ( nombre ) )
            `)
            .eq('id', profId)
            .maybeSingle();
        if (profError) throw profError;
        if (!prof) return res.status(404).json({ error: 'Profesional no encontrado' });
        // Fase N3: el profesional puede no ofrecer reservas online.
        if (prof.turnos_online === false) {
            return res.status(403).json({ error: 'Este profesional no toma turnos online. Comunicate directamente con la clínica.' });
        }

        // clinica_id del turno (Fase U): la de la página (?clinica=<slug>), validando que
        // el profesional atienda ahí; sin slug, la única clínica donde atiende.
        const cli = await clinicaDelTurno(req, profId, clinica);
        if (cli.error) return res.status(cli.status).json({ error: cli.error });
        const clinicaProf = cli.clinicaId;

        // Fase L: una clínica con la suscripción vencida no recibe turnos online.
        if (clinicaProf && (await planes.getPlanClinica(clinicaProf)).soloLectura) {
            return res.status(403).json({ error: 'Este profesional no está tomando turnos online por el momento.' });
        }
        // Fase N2: la clínica puede usar el sistema sin ofrecer reservas online.
        if (await turnosOnlineApagados(clinicaProf)) {
            return res.status(403).json({ error: 'Esta clínica no toma turnos online. Comunicate directamente con la clínica.' });
        }

        // 2. El horario tiene que ser uno de los slots que ofrece la página: 30', futuro
        //    y dentro de la atención del profesional (auditoría 2026-10-15, #3).
        const invalido = await validarHorarioTurno(profId, start.dateTime, end.dateTime, clinicaProf);
        if (invalido) return res.status(invalido.status).json({ error: invalido.error });

        // 3. Verificar que el horario siga libre (turnos reservados + bloqueos).
        if (!(await estaLibre(profId, start.dateTime, end.dateTime))) {
            return res.status(409).json({ error: 'Ese horario ya no está disponible. Elegí otro.' });
        }

        // 4. Registrar el turno (fuente de verdad del vínculo con la persona).
        //    - Paciente logueado -> se ata a su paciente.id (id_paciente).
        //    - Invitado          -> id_paciente NULL + manage_token para gestionarlo.
        //    Fase O: si el paciente tiene ficha en la clínica del turno, se ata a esa.
        let idPaciente = null;
        if (esPacienteLogueado) {
            const fichas = await fichasPaciente(req.session.user.id);
            const deLaClinica = fichas.find((f) => f.clinicaId === clinicaProf);
            idPaciente = deLaClinica ? deLaClinica.paciente.id : (req.session.user.idRole || null);
        }

        const profNombre = [prof.persona?.nombre, prof.persona?.apellido].filter(Boolean).join(' ') || null;
        const especialidad = prof.especialidad_profesional?.[0]?.especialidad?.nombre || null;

        let manageToken = null;
        const turnoRow = {
            id_profesional: profId,
            id_paciente: idPaciente,
            clinica_id: clinicaProf,
            profesional_nombre: profNombre,
            especialidad,
            paciente_nombre: name || null,
            paciente_email: email || null,
            paciente_telefono: telefono,
            inicio: start.dateTime,
            fin: end.dateTime,
        };
        if (!idPaciente) {
            const { token, hash } = generarTokenGestion();
            manageToken = token;
            turnoRow.manage_token_hash = hash;
        }

        const { error: insError } = await supabase.from('turno').insert(turnoRow);
        // Otra reserva ganó el mismo horario entre el chequeo y el insert (Fase Q).
        if (esSolapeTurno(insError)) {
            return res.status(409).json({ error: 'Ese horario ya no está disponible. Elegí otro.' });
        }
        if (insError) throw insError;

        // 5. Email de confirmación (best-effort: no bloquea la reserva).
        // Enlace de gestión: los invitados reciben su token; los logueados van a "Mis turnos".
        sendMail({
            to: email,
            ...mailTurno({
                tipo: 'confirmacion',
                nombre: name,
                inicio: start.dateTime,
                profesional: profNombre,
                especialidad,
                baseUrl: process.env.APP_URL || `${req.protocol}://${req.get('host')}`,
                manageToken,
                misTurnos: 'boton',
            }),
        }).catch(err => console.error('Error enviando email de confirmación:', err.message));

        res.json({ success: true });
    } catch (error) {
        console.error('Error creando turno:', error.message);
        res.status(500).json({ error: 'Error al crear el turno' });
    }
});

// El buscador público de turnos por email (/search-appointment) y el borrado directo
// por eventId (/delete-appointment) se ELIMINARON en la Fase 3: permitían enumerar y
// cancelar turnos ajenos sin autenticación. Su reemplazo seguro son los endpoints de
// /api/turnos (mis turnos con sesión; gestión por token para invitados).

// ---------------------------------------------------------------------------
// Recordatorios de turnos (~24 h antes)
// Recorre la tabla `turno` (Fase F: ya no Google Calendar): busca los turnos
// reservados que empiezan en ~24 h y todavía no fueron avisados, y envía un email
// de recordatorio al paciente. Marca `recordatorio_enviado` para no repetir.
// ---------------------------------------------------------------------------
const REMINDER_MIN_H = 23; // ventana: entre 23 y 25 h a futuro
const REMINDER_MAX_H = 25;

async function sendUpcomingReminders() {
    if (!isMailerConfigured()) {
        console.warn('Recordatorios: mailer no configurado, se omite.');
        return { sent: 0, reason: 'mailer-no-configurado' };
    }

    const now = new Date();
    const desde = new Date(now.getTime() + REMINDER_MIN_H * 3600 * 1000);
    const hasta = new Date(now.getTime() + REMINDER_MAX_H * 3600 * 1000);

    const { data: turnos, error } = await supabase
        .from('turno')
        .select('id, inicio, id_paciente, paciente_email, paciente_nombre, profesional_nombre, especialidad')
        .eq('estado', 'reservado')
        .eq('recordatorio_enviado', false)
        .gte('inicio', desde.toISOString())
        .lte('inicio', hasta.toISOString());
    if (error) throw error;

    let sent = 0;
    for (const t of turnos || []) {
        if (!t.paciente_email) continue;

        try {
            await sendMail({
                to: t.paciente_email,
                ...mailTurno({
                    tipo: 'recordatorio',
                    nombre: t.paciente_nombre,
                    inicio: t.inicio,
                    profesional: t.profesional_nombre,
                    especialidad: t.especialidad,
                    baseUrl: process.env.APP_URL,
                    misTurnos: t.id_paciente ? 'link' : null,
                }),
            });
            await supabase.from('turno').update({ recordatorio_enviado: true }).eq('id', t.id);
            sent++;
        } catch (e) {
            console.error('Recordatorios: fallo enviando a', t.paciente_email, e.message);
        }
    }

    console.log(`Recordatorios enviados: ${sent}`);
    return { sent };
}

// Endpoint protegido para disparar los recordatorios desde un cron EXTERNO
// (útil en hostings que duermen, ej. onrender free). Requiere REMINDERS_TOKEN.
app.post('/internal/send-reminders', async (req, res) => {
    const token = req.get('x-reminders-token');
    if (!process.env.REMINDERS_TOKEN || token !== process.env.REMINDERS_TOKEN) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        const result = await sendUpcomingReminders();
        res.json({ ok: true, ...result });
    } catch (error) {
        console.error('Error en send-reminders:', error.message);
        res.status(500).json({ error: 'Error al enviar recordatorios' });
    }
});

// Scheduler in-process: corre cada hora (solo si el mailer está configurado).
// En hostings que duermen puede no dispararse; usar además el endpoint + cron externo.
if (isMailerConfigured()) {
    setInterval(() => {
        sendUpcomingReminders().catch(e => console.error('Recordatorios (scheduler):', e.message));
    }, 60 * 60 * 1000);
    console.log('Scheduler de recordatorios activo (cada 60 min).');
}

// ---------------------------------------------------------------------------
// Fase M2: control diario de las suscripciones (respaldo de los webhooks de MP,
// cambios de precio programados). Corre al minuto de arrancar y después cada 24 h.
// Para hostings que duermen: POST /internal/control-suscripciones desde un cron
// externo, con el header x-cron-token = CRON_TOKEN (o REMINDERS_TOKEN).
// ---------------------------------------------------------------------------
const { controlDiario } = require('./utils/controlSuscripciones');

async function correrControl(origen) {
    try {
        const r = await controlDiario();
        console.log(`[control suscripciones] (${origen})`, JSON.stringify(r));
        return r;
    } catch (e) {
        console.error(`[control suscripciones] (${origen}) error:`, e.message);
        throw e;
    }
}

app.post('/internal/control-suscripciones', async (req, res) => {
    const esperado = process.env.CRON_TOKEN || process.env.REMINDERS_TOKEN;
    if (!esperado || req.get('x-cron-token') !== esperado) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    try {
        res.json({ ok: true, ...(await correrControl('cron externo')) });
    } catch {
        res.status(500).json({ error: 'Error en el control de suscripciones' });
    }
});

if (require('./utils/mercadopago').configurado()) {
    setTimeout(() => correrControl('arranque').catch(() => {}), 60 * 1000).unref();
    setInterval(() => correrControl('diario').catch(() => {}), 24 * 60 * 60 * 1000).unref();
    console.log('Control diario de suscripciones activo (al arrancar y cada 24 h).');
}

// ---------------------------------------------------------------------------
// Fallback del SPA (solo producción)
// Cualquier GET de navegación que no sea una ruta de API ni un archivo estático
// devuelve el index.html del build, para que el routing client-side y el 404
// personalizado de React funcionen también al refrescar o entrar por deep-link.
// ---------------------------------------------------------------------------
if (isProd) {
    const API_PREFIXES = [
        '/auth', '/hour', '/pacient', '/especialidades', '/profesional',
        '/avatars', '/clinica', '/clinica-publica',
        '/admin', '/certificados', '/hc', '/staff', '/estudios', '/auditoria',
        '/catalogos', '/autorizaciones',
        '/professionals', '/available-slots', '/create-event',
        '/api', '/internal',
    ];
    const isApiPath = (p) =>
        API_PREFIXES.some((pre) => p === pre || p.startsWith(pre + '/'));

    app.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        if (isApiPath(req.path)) return next();
        if (!req.accepts('html')) return next();
        return res.sendFile(path.join(spaDist, 'index.html'));
    });
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

// ---------------------------------------------------------------------------
// Keep-alive (Render free)
// El plan gratuito de Render apaga el servicio tras 15 min sin tráfico entrante.
// Render define RENDER_EXTERNAL_URL: nos pegamos a la URL pública cada 10 min para
// que cuente como tráfico. Solo mantiene despierta una instancia que ya está viva;
// si igual se durmiera, un monitor externo (UptimeRobot / cron-job.org) a /healthz
// la vuelve a levantar. Se desactiva con KEEP_ALIVE=false.
// ---------------------------------------------------------------------------
const keepAliveUrl = process.env.RENDER_EXTERNAL_URL;
if (keepAliveUrl && process.env.KEEP_ALIVE !== 'false') {
    const url = new URL('/healthz', keepAliveUrl).toString();
    setInterval(() => {
        fetch(url, { signal: AbortSignal.timeout(30 * 1000) })
            .catch(e => console.warn('[keep-alive] ping fallido:', e.message));
    }, 10 * 60 * 1000).unref();
    console.log(`Keep-alive activo: ping a ${url} cada 10 min.`);
}
