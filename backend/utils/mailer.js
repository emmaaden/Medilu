// Envío de emails con Nodemailer (best-effort).
// Se configura por variables de entorno; si faltan, sendMail no hace nada y avisa,
// para no romper el flujo (ej: la reserva de un turno igual se concreta).
//
// Variables:
//   EMAIL_HOST, EMAIL_PORT (default 587), EMAIL_USER, EMAIL_PASS
//   EMAIL_SECURE ("true" para SSL/465), EMAIL_FROM (default = EMAIL_USER)
//
// IPv4: Nodemailer resuelve el host a IPv4 e IPv6 y elige una dirección al azar. En
// hostings sin salida IPv6 (Render) la mitad de los envíos fallaban con ENETUNREACH.
// Por eso el host se resuelve acá a IPv4 en cada envío y Nodemailer se conecta a esa
// IP; `tls.servername` mantiene la validación del certificado contra el nombre real.

const net = require('net');
const dns = require('dns').promises;
const nodemailer = require('nodemailer');
require('dotenv').config();

function config() {
    const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
    if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) return null;
    const port = Number(EMAIL_PORT) || 587;
    return {
        host: EMAIL_HOST,
        port,
        secure: String(process.env.EMAIL_SECURE) === 'true' || port === 465,
        auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    };
}

function isMailerConfigured() {
    return !!config();
}

// Una dirección IPv4 del host (al azar entre las que haya). Si el host ya es una IP o
// no tiene registros A, se devuelve tal cual y Nodemailer resuelve como siempre.
async function hostIPv4(host) {
    if (net.isIP(host)) return host;
    try {
        const ips = await dns.resolve4(host);
        if (ips.length) return ips[Math.floor(Math.random() * ips.length)];
    } catch (e) {
        console.warn(`Mailer: no se pudo resolver ${host} a IPv4 (${e.code || e.message}); se usa el nombre.`);
    }
    return host;
}

async function crearTransporte(cfg) {
    const ip = await hostIPv4(cfg.host);
    return nodemailer.createTransport({
        ...cfg,
        host: ip,
        tls: { servername: cfg.host }, // certificado validado contra smtp.gmail.com, no la IP
    });
}

// Envía un email. Devuelve true si se envió, false si el mailer no está configurado.
// Los errores de envío se propagan (el caller decide si los ignora).
async function sendMail({ to, subject, html, text }) {
    const cfg = config();
    if (!cfg) {
        console.warn('Mailer no configurado (faltan EMAIL_HOST/EMAIL_USER/EMAIL_PASS): no se envía email.');
        return false;
    }
    const t = await crearTransporte(cfg);
    const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;
    try {
        await t.sendMail({ from, to, subject, html, text });
    } finally {
        t.close();
    }
    return true;
}

// Prueba de conexión y login SMTP (sin enviar nada).
async function verificarMailer() {
    const cfg = config();
    if (!cfg) return false;
    const t = await crearTransporte(cfg);
    try {
        return await t.verify();
    } finally {
        t.close();
    }
}

module.exports = { isMailerConfigured, sendMail, verificarMailer };
