// Sesiones del backend (express-session) de una cuenta (auditoría 2026-10-15, #7).
//
// En producción viven en la tabla `sesiones.session` de connect-pg-simple (DATABASE_URL); en
// desarrollo, en el MemoryStore. Se usa para cerrar las demás sesiones abiertas de
// una cuenta cuando cambia su contraseña.

const { Pool } = require('pg');

let pool = null;
function getPool() {
    if (!process.env.DATABASE_URL) return null;
    if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    return pool;
}

// Cierra todas las sesiones de la cuenta `authId` menos la del request. Devuelve
// cuántas cerró.
async function cerrarOtrasSesiones(req, authId) {
    const sidActual = req.sessionID;
    const p = getPool();
    if (p) {
        const r = await p.query(
            `DELETE FROM sesiones.session WHERE sess->'user'->>'id' = $1 AND sid <> $2`,
            [String(authId), sidActual]
        );
        return r.rowCount;
    }

    // MemoryStore (desarrollo).
    const store = req.sessionStore;
    if (!store || typeof store.all !== 'function') return 0;
    const todas = await new Promise((ok, ko) => store.all((e, s) => (e ? ko(e) : ok(s || {}))));
    let cerradas = 0;
    for (const [sid, s] of Object.entries(todas)) {
        if (sid === sidActual || !s || !s.user || s.user.id !== authId) continue;
        await new Promise((ok) => store.destroy(sid, () => ok()));
        cerradas++;
    }
    return cerradas;
}

// Promesa sobre req.session.regenerate (sesión nueva con otro id).
function regenerarSesion(req) {
    return new Promise((ok, ko) => req.session.regenerate((e) => (e ? ko(e) : ok())));
}

module.exports = { cerrarOtrasSesiones, regenerarSesion };
