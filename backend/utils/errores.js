// Respuestas de error sin detalles técnicos.
// El mensaje crudo de Supabase/Postgres (nombres de tablas, constraints, políticas RLS)
// no se manda al navegador: se registra completo en el log del servidor con una
// referencia corta, y al usuario le llega un mensaje entendible (más la referencia,
// para poder buscarlo en el log si lo reporta).

const crypto = require('crypto');

// Código de Postgres / PostgREST / Supabase Auth → [status, mensaje para el usuario].
const MENSAJES = {
    '23505': [409, 'Ya existe un registro con esos datos.'],
    '23503': [409, 'No se puede completar: hay datos relacionados que lo impiden.'],
    '23502': [400, 'Faltan datos obligatorios.'],
    '23514': [400, 'Algún dato no tiene un valor permitido.'],
    '22001': [400, 'Algún dato es demasiado largo.'],
    '22P02': [400, 'Algún dato no tiene el formato correcto.'],
    '22007': [400, 'Alguna fecha u hora no es válida.'],
    '22008': [400, 'Alguna fecha u hora no es válida.'],
    '42501': [403, 'No tenés permiso para hacer esto.'],
    PGRST116: [404, 'No se encontró lo que buscabas.'],
    user_already_exists: [409, 'Ese email ya está registrado.'],
    email_exists: [409, 'Ese email ya está registrado.'],
    weak_password: [400, 'La contraseña es muy débil. Usá una más larga o con más variedad de caracteres.'],
    email_address_invalid: [400, 'El email no es válido.'],
    over_email_send_rate_limit: [429, 'Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.'],
    over_request_rate_limit: [429, 'Hubo demasiados intentos. Esperá unos minutos y probá de nuevo.'],
};

const GENERICO = 'No se pudo completar la operación. Probá de nuevo en unos minutos.';

function nuevaRef() {
    return crypto.randomBytes(4).toString('hex');
}

/** Deja el error completo en el log y devuelve la referencia para cruzarlo. */
function registrarError(error, contexto) {
    const ref = nuevaRef();
    const detalle = error && typeof error === 'object'
        ? {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
            status: error.status,
        }
        : { message: String(error) };
    console.error(`[error ${ref}] ${contexto}:`, JSON.stringify(detalle));
    if (error && error.stack && !error.code) console.error(error.stack);
    return ref;
}

/**
 * Responde un error de base de datos (o de Supabase Auth) sin exponer el detalle.
 * Uso: `if (error) return errorDb(res, error);`
 */
function errorDb(res, error) {
    const req = res.req || {};
    const ref = registrarError(error, `${req.method} ${req.originalUrl}`);
    const rls = /row-level security/i.test((error && error.message) || '');
    const [status, mensaje] = MENSAJES[error && error.code]
        || (rls ? MENSAJES['42501'] : [500, GENERICO]);
    return res.status(status).json({ error: mensaje, ref });
}

/** Manejador final de Express: errores no capturados en rutas y middlewares. */
// eslint-disable-next-line no-unused-vars
function manejadorErrores(err, req, res, next) {
    if (res.headersSent) return next(err);
    // Errores del parser de JSON / formularios (body-parser).
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Los datos enviados no tienen un formato válido.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Los datos enviados son demasiado grandes.' });
    }
    const ref = registrarError(err, `${req.method} ${req.originalUrl}`);
    const status = err.status >= 400 && err.status < 500 ? err.status : 500;
    return res.status(status).json({ error: GENERICO, ref });
}

module.exports = { errorDb, registrarError, manejadorErrores };
