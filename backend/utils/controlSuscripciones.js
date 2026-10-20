// Control diario de las suscripciones (Fase M2). Respaldo de los webhooks de Mercado
// Pago: si una notificación se pierde, ninguna clínica que pagó queda bloqueada y
// ningún cambio de precio queda sin aplicar. Todo es idempotente: correrlo de más no
// cambia el resultado.
//
//   0. Programa el fin de los descuentos con fecha (Fase X).
//   1. Aplica los cambios de precio avisados cuya fecha llegó.
//   2. Manda los avisos de precio pendientes (si el email está configurado).
//   3. Sincroniza con MP los débitos activos con el período por vencer o vencido, o
//      con el próximo cobro ya pasado.
//   4. Sincroniza los intentos de pago de la última semana que siguen pendientes.

const { supabase } = require('../config/supabaseClient');
const mp = require('./mercadopago');
const suscripcionMp = require('./suscripcionMp');

const DIA_MS = 24 * 60 * 60 * 1000;

async function controlDiario() {
    if (!mp.configurado()) return { omitido: 'Mercado Pago no está configurado' };
    const ahora = Date.now();
    const resultado = { descuentos: null, precios: null, avisos: null, sincronizados: 0, errores: 0 };

    resultado.descuentos = await suscripcionMp.revisarDescuentos(); // Fase X
    resultado.precios = await suscripcionMp.aplicarCambiosDePrecio();
    resultado.avisos = await suscripcionMp.enviarAvisosPrecio();

    const pronto = new Date(ahora + 3 * DIA_MS).toISOString();
    const [{ data: debitos, error: dErr }, { data: intentos, error: iErr }] = await Promise.all([
        supabase.from('suscripcion').select('mp_preapproval_id')
            .eq('mp_estado', 'authorized').not('mp_preapproval_id', 'is', null)
            .or(`periodo_hasta.lt.${pronto},proximo_cobro.lt.${new Date(ahora).toISOString()}`),
        supabase.from('suscripcion_checkout').select('mp_preapproval_id')
            .eq('estado', 'pending')
            .gte('creado_en', new Date(ahora - 7 * DIA_MS).toISOString())
            .lte('creado_en', new Date(ahora - 60 * 60 * 1000).toISOString()),
    ]);
    if (dErr) throw dErr;
    if (iErr) throw iErr;

    const ids = new Set([...(debitos || []), ...(intentos || [])].map((r) => r.mp_preapproval_id));
    for (const id of ids) {
        try {
            await suscripcionMp.sincronizarSuscripcion(id);
            resultado.sincronizados++;
        } catch (e) {
            resultado.errores++;
            console.error('[control] no se pudo sincronizar', id, e.message);
        }
    }
    return resultado;
}

module.exports = { controlDiario };
