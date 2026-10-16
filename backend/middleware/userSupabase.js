// Cliente Supabase "como el usuario" para los controllers migrados a RLS por JWT (Fase 2c).
//
// Devuelve un cliente Supabase (anon key + JWT del usuario) cuyas consultas corren
// con el rol `authenticated`, de modo que las políticas RLS por clinica_id se aplican
// a nivel Postgres. Refresca el access_token si está por vencer y actualiza la sesión.
//
// Requiere que el login haya guardado req.session.sb (access/refresh/expiresAt). Las
// sesiones creadas antes de Fase 2c no lo tienen: en ese caso devuelve null y el
// controller debe responder pidiendo reautenticación.

const { supabaseAnon, userClientFromToken } = require('../config/supabaseClient');

const MARGEN_SEG = 60; // refrescar si vence en menos de 1 minuto

// Vencimiento del access_token medido con el reloj de ESTE server (epoch en segundos).
// No se usa expires_at tal cual: viene del reloj de Supabase, y si el del server está
// corrido (p. ej. 3 h adelantado) todo token parece vencido, se refresca en cada
// request y los refrescos en paralelo se pisan el refresh_token (401 intermitentes).
function vencimientoLocal(session) {
    if (session.expires_in) return Math.floor(Date.now() / 1000) + session.expires_in;
    return session.expires_at;
}

async function getUserSupabase(req) {
    const sb = req.session && req.session.sb;
    if (!sb || !sb.accessToken || !sb.refreshToken) return null;

    // Fase A: clínica activa de la sesión (header x-clinica-id para la RLS).
    const clinicaId = req.session.user && req.session.user.clinicaId;

    const ahora = Math.floor(Date.now() / 1000);
    if (sb.expiresAt && ahora < sb.expiresAt - MARGEN_SEG) {
        // Token todavía válido.
        return userClientFromToken(sb.accessToken, clinicaId);
    }

    // Token vencido o por vencer: refrescar con el refresh_token.
    const { data, error } = await supabaseAnon.auth.refreshSession({ refresh_token: sb.refreshToken });
    if (error || !data || !data.session) {
        // Refresh falló (refresh_token revocado/expirado): forzar reautenticación.
        return null;
    }

    req.session.sb = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresAt: vencimientoLocal(data.session),
    };
    return userClientFromToken(data.session.access_token, clinicaId);
}

module.exports = { getUserSupabase, vencimientoLocal };
