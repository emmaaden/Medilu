// Cumplimiento legal del sitio público:
//   - Botón de arrepentimiento y botón de baja de servicio (Disp. SSDCyLC 954/2025):
//     el consumidor lo pide SIN registrarse y recibe un código de identificación.
//   - robots.txt y sitemap.xml (generados con APP_URL para no hardcodear el dominio).

const crypto = require('crypto');
const { sendMail } = require('../utils/mailer');
const { layoutMail, parrafo, fuerte, datos, aviso, nota, esc } = require('../utils/emailLayout');
const { supabase } = require('../config/supabaseClient');
const suscripcionMp = require('../utils/suscripcionMp');

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function baseUrl(req) {
    return (process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

// Código legible e irrepetible en la práctica: ARR-20261006-7K3QXZ / BAJ-... / SUP-...
const PREFIJOS = { arrepentimiento: 'ARR', baja: 'BAJ', suplantacion: 'SUP' };
function generarCodigo(tipo) {
    const prefijo = PREFIJOS[tipo];
    const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const azar = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    return `${prefijo}-${fecha}-${azar}`;
}

const TITULOS = {
    arrepentimiento: 'Solicitud de arrepentimiento (revocación)',
    baja: 'Solicitud de baja de servicio',
};

// POST /api/solicitudes-consumo
// Responde SIEMPRE con el código en pantalla. Además intenta avisar por email al titular
// del sitio y al consumidor; si el mailer no está configurado, `notificado` = false y el
// frontend ofrece enviar la solicitud por email (para que no se pierda).
// Baja en el acto (Fase M): si quien pide la baja es el ADMIN de una clínica con la
// sesión iniciada y lo pidió, se cancela el débito de Mercado Pago ya mismo (tan
// simple como contratar). Sin sesión, la solicitud se gestiona a mano como siempre.
// Devuelve { clinica, efectiva, periodoHasta, motivo } o null si no aplica.
async function bajaEnElActo(req) {
    const u = req.session && req.session.isAuthenticated && req.session.user;
    if (!u || u.role !== 'profesional' || !u.esAdmin || !u.clinicaId) return null;
    const { data: cli } = await supabase.from('clinica').select('nombre').eq('id', u.clinicaId).maybeSingle();
    const clinica = { id: u.clinicaId, nombre: cli ? cli.nombre : null };
    try {
        const r = await suscripcionMp.cancelarRenovacion(u.clinicaId);
        return { clinica, efectiva: true, periodoHasta: r.periodoHasta || null };
    } catch (err) {
        if (err instanceof suscripcionMp.ErrorNegocio) {
            return { clinica, efectiva: false, motivo: 'La clínica no tenía un débito automático activo.' };
        }
        console.error('[baja] no se pudo cancelar el débito en el acto:', err.message);
        return { clinica, efectiva: false, motivo: 'No se pudo cancelar el débito en el acto; lo gestionamos a mano.' };
    }
}

function fechaAR(iso) {
    return iso
        ? new Date(iso).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'long' })
        : null;
}

exports.solicitudConsumo = async (req, res) => {
    const { tipo, nombre, email, servicio, detalle, cancelarDebito } = req.body;
    const codigo = generarCodigo(tipo);
    const titulo = TITULOS[tipo];
    const baja = tipo === 'baja' && cancelarDebito === true ? await bajaEnElActo(req) : null;
    let estadoBaja = null;
    if (baja && baja.efectiva) {
        estadoBaja = 'Efectivizada en el acto: se canceló el débito automático en Mercado Pago'
            + (baja.periodoHasta ? `; el plan sigue vigente hasta el ${fechaAR(baja.periodoHasta)}.` : '.');
    } else if (baja) {
        estadoBaja = `Pendiente: ${baja.motivo}`;
    }
    const fecha = new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        dateStyle: 'full',
        timeStyle: 'short',
    });

    const resumenTxt = [
        `${titulo}`,
        `Código: ${codigo}`,
        `Fecha: ${fecha} hs`,
        `Nombre: ${nombre}`,
        `Email: ${email}`,
        `Servicio/plan: ${servicio || '—'}`,
        `Detalle: ${detalle || '—'}`,
        ...(baja ? [`Clínica: ${baja.clinica.nombre || '—'} (${baja.clinica.id})`, `Estado de la baja: ${estadoBaja}`] : []),
    ].join('\n');
    const resumenFilas = [
        { etiqueta: 'Código', valor: codigo, mono: true },
        { etiqueta: 'Fecha', valor: `${fecha} hs` },
        { etiqueta: 'Nombre', valor: nombre },
        { etiqueta: 'Email', valor: email },
        { etiqueta: 'Servicio/plan', valor: servicio || '—' },
        { etiqueta: 'Detalle', valor: detalle || '—' },
        ...(baja ? [
            { etiqueta: 'Clínica', valor: baja.clinica.nombre || '—' },
            { etiqueta: 'Estado de la baja', valor: estadoBaja },
        ] : []),
    ];

    const destinoTitular = process.env.LEGAL_NOTIFY_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
    let notificado = false;
    try {
        if (destinoTitular) {
            notificado = await sendMail({
                to: destinoTitular,
                subject: `[${codigo}] ${titulo}`,
                text: `${resumenTxt}\n\nPlazo: responder y efectivizar sin demoras (Disp. 954/2025).`,
                html: layoutMail({
                    titulo,
                    resumen: `${codigo} · ${nombre}`,
                    cuerpo: [
                        parrafo(`Nueva ${esc(titulo.toLowerCase())} recibida desde el sitio.`),
                        datos(resumenFilas),
                        aviso('Plazo', 'Responder y efectivizar sin demoras (Disp. 954/2025).'),
                    ].join('\n'),
                }),
            });
        }
        if (notificado) {
            await sendMail({
                to: email,
                subject: `Recibimos tu solicitud (${codigo}) - Medilu`,
                text: `Hola ${nombre},\n\nRecibimos tu ${titulo.toLowerCase()}.\nTu código de identificación es ${codigo}. Guardalo para cualquier consulta.\n\n${resumenTxt}\n\nMedilu`,
                html: layoutMail({
                    titulo: 'Recibimos tu solicitud',
                    resumen: `Tu código de identificación es ${codigo}.`,
                    cuerpo: [
                        parrafo(`Hola ${esc(nombre)}, recibimos tu ${esc(titulo.toLowerCase())}. Tu código de identificación es ${fuerte(codigo)}.`),
                        datos(resumenFilas),
                        nota('Guardá este código: te lo vamos a pedir para cualquier consulta sobre tu solicitud.'),
                    ].join('\n'),
                }),
            });
        }
    } catch (err) {
        // El código ya se generó y se muestra en pantalla: un fallo de envío no debe
        // impedir que el consumidor deje constancia (el frontend ofrece el email manual).
        console.error('Solicitud de consumo: fallo enviando email:', err.message);
        notificado = false;
    }

    console.log(`Solicitud de consumo ${codigo} (${tipo}) registrada. Notificada: ${notificado}`
        + (baja ? `. Baja en el acto: ${baja.efectiva ? 'sí' : 'no'}` : ''));
    res.json({
        codigo,
        notificado,
        ...(baja ? { bajaEfectiva: baja.efectiva, periodoHasta: baja.periodoHasta || null, motivo: baja.motivo || null } : {}),
    });
};

const SITUACIONES = {
    cuenta: 'Alguien creó o usa una cuenta con mis datos',
    historia: 'Alguien accedió o vinculó mi historia clínica',
    turnos: 'Sacaron turnos a mi nombre',
    otra: 'Otra situación',
};

// POST /api/reportes-suplantacion
// Mismo circuito que la solicitud de consumo: el código sale SIEMPRE en pantalla, se
// avisa al titular del sitio y se le manda el acuse a quien reporta. Si el mailer no
// está configurado, `notificado` = false y el frontend ofrece mandarlo por email.
// No bloquea nada solo: el equipo revisa el caso (bitácora hc_acceso, persona.id_auth).
exports.reporteSuplantacion = async (req, res) => {
    const { nombre, apellido, dni, email, telefono, situacion, clinica, detalle } = req.body;
    const codigo = generarCodigo('suplantacion');
    const titulo = 'Reporte de suplantación de identidad';
    const nombreCompleto = `${nombre} ${apellido}`;
    const fecha = new Date().toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        dateStyle: 'full',
        timeStyle: 'short',
    });

    const filas = [
        { etiqueta: 'Código', valor: codigo, mono: true },
        { etiqueta: 'Fecha', valor: `${fecha} hs` },
        { etiqueta: 'Nombre', valor: nombreCompleto },
        { etiqueta: 'DNI', valor: dni },
        { etiqueta: 'Email', valor: email },
        { etiqueta: 'Teléfono', valor: telefono || '—' },
        { etiqueta: 'Qué pasó', valor: SITUACIONES[situacion] },
        { etiqueta: 'Clínica o profesional', valor: clinica || '—' },
        { etiqueta: 'Detalle', valor: detalle },
    ];
    const resumenTxt = [titulo, ...filas.map((f) => `${f.etiqueta}: ${f.valor}`)].join('\n');

    const destinoTitular = process.env.LEGAL_NOTIFY_EMAIL || process.env.EMAIL_FROM || process.env.EMAIL_USER;
    let notificado = false;
    try {
        if (destinoTitular) {
            notificado = await sendMail({
                to: destinoTitular,
                subject: `[${codigo}] ${titulo}`,
                text: `${resumenTxt}\n\nRevisar la cuenta y los accesos a la historia clínica de ese DNI.`,
                html: layoutMail({
                    titulo,
                    resumen: `${codigo} · ${nombreCompleto} · DNI ${dni}`,
                    cuerpo: [
                        parrafo('Nuevo reporte de suplantación de identidad recibido desde el sitio.'),
                        datos(filas),
                        aviso('Qué revisar', 'Las cuentas atadas a ese DNI (persona.id_auth) y la bitácora de accesos a su historia clínica.'),
                    ].join('\n'),
                }),
            });
        }
        if (notificado) {
            await sendMail({
                to: email,
                subject: `Recibimos tu reporte (${codigo}) - Medilu`,
                text: `Hola ${nombre},\n\nRecibimos tu reporte de suplantación de identidad.\nTu código es ${codigo}. Guardalo para cualquier consulta.\n\n${resumenTxt}\n\nMedilu`,
                html: layoutMail({
                    titulo: 'Recibimos tu reporte',
                    resumen: `Tu código es ${codigo}.`,
                    cuerpo: [
                        parrafo(`Hola ${esc(nombre)}, recibimos tu reporte de suplantación de identidad. Tu código es ${fuerte(codigo)}.`),
                        datos(filas),
                        nota('Vamos a revisar el caso y te escribimos a este email. Guardá el código para cualquier consulta.'),
                    ].join('\n'),
                }),
            });
        }
    } catch (err) {
        console.error('Reporte de suplantación: fallo enviando email:', err.message);
        notificado = false;
    }

    console.log(`Reporte de suplantación ${codigo} registrado. Notificado: ${notificado}`);
    res.json({ codigo, notificado });
};

// Rutas públicas e indexables del SPA. Las privadas (panel, cuenta del paciente,
// gestión de turnos por token, reset de contraseña) quedan fuera y bloqueadas en robots.
const RUTAS_PUBLICAS = [
    { path: '/', changefreq: 'monthly', priority: '1.0' },
    { path: '/turnos', changefreq: 'weekly', priority: '0.9' },
    { path: '/planes', changefreq: 'monthly', priority: '0.8' },
    { path: '/register', changefreq: 'yearly', priority: '0.5' },
    { path: '/register/paciente', changefreq: 'yearly', priority: '0.5' },
    { path: '/register/profesional', changefreq: 'yearly', priority: '0.5' },
    { path: '/login', changefreq: 'yearly', priority: '0.3' },
    { path: '/terminos', changefreq: 'yearly', priority: '0.3' },
    { path: '/privacidad', changefreq: 'yearly', priority: '0.3' },
    { path: '/cookies', changefreq: 'yearly', priority: '0.3' },
    { path: '/reembolsos', changefreq: 'yearly', priority: '0.3' },
    { path: '/arrepentimiento', changefreq: 'yearly', priority: '0.3' },
    { path: '/baja', changefreq: 'yearly', priority: '0.3' },
    { path: '/reportar-suplantacion', changefreq: 'yearly', priority: '0.3' },
    { path: '/accesibilidad', changefreq: 'yearly', priority: '0.3' },
];

const RUTAS_PRIVADAS = [
    '/dashboard', '/mis-turnos', '/mi-perfil', '/mi-historia', '/mis-certificados',
    '/mis-estudios', '/gestionar-turno', '/reset-password', '/seleccionar-clinica',
    '/forgot-password', '/confirmar-email', '/register/recepcion',
    // API (no son páginas)
    '/api/', '/auth/', '/hour/', '/pacient/', '/profesional/', '/avatars/',
    '/clinica/', '/admin/', '/certificados/', '/hc/', '/staff/', '/estudios/', '/dictado/',
    '/auditoria/', '/catalogos/', '/autorizaciones/', '/internal/', '/available-slots',
    '/create-event',
];

exports.robots = (req, res) => {
    const lineas = [
        'User-agent: *',
        'Allow: /',
        ...RUTAS_PRIVADAS.map((p) => `Disallow: ${p}`),
        '',
        `Sitemap: ${baseUrl(req)}/sitemap.xml`,
        '',
    ];
    res.type('text/plain').send(lineas.join('\n'));
};

exports.sitemap = (req, res) => {
    const base = baseUrl(req);
    const urls = RUTAS_PUBLICAS.map((r) => [
        '  <url>',
        `    <loc>${escapeHtml(base + r.path)}</loc>`,
        `    <changefreq>${r.changefreq}</changefreq>`,
        `    <priority>${r.priority}</priority>`,
        '  </url>',
    ].join('\n'));
    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        '</urlset>',
        '',
    ].join('\n');
    res.type('application/xml').send(xml);
};
