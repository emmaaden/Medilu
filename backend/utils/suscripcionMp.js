// Cobro de la suscripción de las clínicas con Mercado Pago (Fase M).
//
// Flujo:
//   1. iniciarContratacion(): el admin elige plan/ciclo/extras. Si ya hay un débito
//      automático AUTORIZADO con el mismo ciclo, se le cambia el monto y el plan se
//      aplica en el acto. Si no, se crea un preapproval en MP y se devuelve el
//      init_point para pagar.
//   2. sincronizarSuscripcion(): se llama desde el webhook, al volver del checkout y
//      desde el panel de plataforma. MP es la fuente de verdad: se consulta el
//      preapproval y sus cobros y se aplican a `suscripcion` / `suscripcion_pago`.
//   3. procesarCobro(): un cobro APROBADO extiende el período pago una sola vez.
//
// Solo cobra a la CLÍNICA. El paciente no le paga nada a la plataforma.

const { supabase } = require('../config/supabaseClient');
const mp = require('./mercadopago');
const planes = require('./planes');

const DIA_MS = 24 * 60 * 60 * 1000;
// Acceso provisorio entre la autorización del débito y el primer cobro aprobado
// (MP acredita el primero dentro de la hora; si falla, el plan vence solo).
const DIAS_PROVISORIOS = 3;

class ErrorNegocio extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const mesesDe = (ciclo) => (ciclo === 'anual' ? 12 : 1);

function sumarMeses(fecha, meses) {
    const d = new Date(fecha);
    d.setUTCMonth(d.getUTCMonth() + meses);
    return d;
}

function maxFecha(...fechas) {
    const ms = fechas.filter(Boolean).map((f) => new Date(f).getTime()).filter((n) => !Number.isNaN(n));
    return ms.length ? new Date(Math.max(...ms)) : null;
}

// Monto por ciclo. El anual aplica a los extras el mismo descuento que al plan.
function calcularMonto(plan, ciclo, extras) {
    const extraMensual = plan.precioProfesionalExtra == null ? 0 : extras * plan.precioProfesionalExtra;
    if (ciclo === 'anual') {
        const factor = plan.precioMensual > 0 ? plan.precioAnual / plan.precioMensual : 12;
        return Math.round(plan.precioAnual + extraMensual * factor);
    }
    return Math.round(plan.precioMensual + extraMensual);
}

// Día del primer débito de una contratación nueva: cuando termina lo que la clínica
// ya tiene (la prueba, el último período pago o una activación manual vigente). Así no
// se cobra durante la prueba ni se paga dos veces el mismo tramo al pasar de mensual a
// anual. null = cobrar ya; siempre así con el pago atrasado (gracia o vencida), aunque
// haya un cobro viejo que diga otra cosa (p. ej. tras una corrección manual).
// (Margen de una hora: MP pide una fecha futura y el checkout tarda unos minutos.)
async function fechaPrimerCobro(clinicaId, sus) {
    if (!sus || ['gracia', 'vencida', 'cancelada'].includes(planes.calcularEstado(sus))) return null;
    const { data: ultimo } = await supabase.from('suscripcion_pago').select('periodo_hasta')
        .eq('clinica_id', clinicaId).not('periodo_hasta', 'is', null)
        .order('periodo_hasta', { ascending: false }).limit(1);
    const fin = maxFecha(
        sus && sus.estado === 'prueba' ? sus.prueba_hasta : null,
        sus && sus.estado === 'activa' ? sus.periodo_hasta : null,
        ultimo && ultimo[0] && ultimo[0].periodo_hasta,
    );
    return fin && fin.getTime() > Date.now() + 60 * 60 * 1000 ? fin : null;
}

async function filaSuscripcion(clinicaId) {
    const { data, error } = await supabase
        .from('suscripcion').select('*').eq('clinica_id', clinicaId).maybeSingle();
    if (error) throw error;
    return data;
}

// ¿Entra la clínica, tal como está hoy, en el plan elegido? (no se baja a nadie solo)
async function verificarQueEntra(clinicaId, plan, extras) {
    const uso = await planes.usoClinica(clinicaId);
    const capacidad = plan.profesionalesIncluidos + extras;
    if (uso.profesionales > capacidad) {
        throw new ErrorNegocio(409,
            `La clínica tiene ${uso.profesionales} profesionales activos y el plan ${plan.nombre} así admite ${capacidad}. `
            + (plan.precioProfesionalExtra != null
                ? 'Sumá profesionales extra o dá de baja a alguien en Administración.'
                : 'Elegí un plan con más profesionales o dá de baja a alguien en Administración.'));
    }
    if (plan.maxRecepcion != null && uso.recepcion > plan.maxRecepcion) {
        throw new ErrorNegocio(409,
            `El plan ${plan.nombre} admite ${plan.maxRecepcion} de recepción y la clínica tiene ${uso.recepcion}. Dá de baja a alguien en Administración o elegí otro plan.`);
    }
    if (uso.auditores > 0 && !plan.features.includes('auditoria')) {
        throw new ErrorNegocio(409,
            `El plan ${plan.nombre} no incluye auditoría y la clínica tiene ${uso.auditores} auditor${uso.auditores === 1 ? '' : 'es'}. Dalos de baja en Administración o elegí el plan Clínica.`);
    }
}

// ¿Se puede cambiar el plan tocando solo el monto del débito actual?
function puedeCambiarSinCheckout(sus, ciclo) {
    return !!sus && !!sus.mp_preapproval_id && sus.mp_estado === 'authorized'
        && sus.ciclo === ciclo && planes.calcularEstado(sus) === 'activa';
}

async function iniciarContratacion({ clinicaId, clinicaNombre, personaId, planId, ciclo, profesionalesExtra, payerEmail, backUrl }) {
    const plan = (await planes.getPlanes()).get(planId);
    if (!plan || !plan.activo) throw new ErrorNegocio(400, 'El plan elegido no existe.');
    const extras = plan.precioProfesionalExtra == null ? 0 : (profesionalesExtra || 0);
    await verificarQueEntra(clinicaId, plan, extras);
    const monto = calcularMonto(plan, ciclo, extras);

    // Débito vigente con el mismo ciclo y el plan AL DÍA: se cambia el monto y el plan
    // rige ya (sin prorrateo: el nuevo monto se cobra desde el próximo débito).
    // Con el pago atrasado (gracia/vencida) no: el débito actual está fallando, así que
    // se pasa por el checkout para pagar con otro medio (y se cancela el anterior).
    const sus = await filaSuscripcion(clinicaId);
    if (puedeCambiarSinCheckout(sus, ciclo)) {
        await mp.cambiarMonto(sus.mp_preapproval_id, monto);
        const { error } = await supabase.from('suscripcion').update({
            plan_id: plan.id, profesionales_extra: extras, monto, monto_nuevo: null, monto_nuevo_desde: null, aviso_precio_enviado_en: null,
            actualizada_en: new Date().toISOString(),
        }).eq('clinica_id', clinicaId);
        if (error) throw error;
        planes.invalidar(clinicaId);
        return { aplicado: true, monto };
    }

    if (!payerEmail) throw new ErrorNegocio(400, 'Ingresá el email de tu cuenta de Mercado Pago.');
    const inicio = await fechaPrimerCobro(clinicaId, sus);
    const pre = await mp.crearSuscripcion({
        reason: `Medilu · Plan ${plan.nombre} (${ciclo}) · ${clinicaNombre || 'Clínica'}`.slice(0, 250),
        externalReference: clinicaId,
        payerEmail,
        monto,
        meses: mesesDe(ciclo),
        backUrl,
        inicio,
    });
    if (!pre || !pre.id || !pre.init_point) throw new ErrorNegocio(502, 'Mercado Pago no devolvió el enlace de pago.');

    const { error } = await supabase.from('suscripcion_checkout').insert({
        mp_preapproval_id: pre.id,
        clinica_id: clinicaId,
        plan_id: plan.id,
        ciclo,
        profesionales_extra: extras,
        monto,
        payer_email: payerEmail,
        init_point: pre.init_point,
        estado: pre.status || 'pending',
        creado_por: personaId || null,
    });
    if (error) throw error;
    return { initPoint: pre.init_point, monto, primerCobro: inicio ? inicio.toISOString() : null };
}

// Registra un cobro (factura de MP). Si está aprobado y todavía no tiene período,
// lo asigna y extiende la suscripción. Idempotente por mp_authorized_payment_id.
async function procesarCobro(cobro, { clinicaId, planId, ciclo, meses }) {
    if (!cobro || !cobro.id) return;
    const estadoPago = (cobro.payment && cobro.payment.status) || cobro.status || 'desconocido';
    const fecha = cobro.debit_date || cobro.date_created || new Date().toISOString();

    const { error: upErr } = await supabase.from('suscripcion_pago').upsert({
        clinica_id: clinicaId,
        mp_authorized_payment_id: String(cobro.id),
        mp_payment_id: cobro.payment && cobro.payment.id ? String(cobro.payment.id) : null,
        mp_preapproval_id: String(cobro.preapproval_id || ''),
        monto: cobro.transaction_amount ?? null,
        estado: estadoPago,
        fecha,
        plan_id: planId || null,
        ciclo: ciclo || null,
        actualizado_en: new Date().toISOString(),
    }, { onConflict: 'mp_authorized_payment_id' });
    if (upErr) throw upErr;
    if (estadoPago !== 'approved') return;

    // ¿Ya tiene período? (otro webhook pudo haberlo asignado)
    const { data: fila } = await supabase.from('suscripcion_pago')
        .select('id, periodo_hasta').eq('mp_authorized_payment_id', String(cobro.id)).single();
    if (!fila || fila.periodo_hasta) return;

    const [{ data: previos }, sus] = await Promise.all([
        supabase.from('suscripcion_pago').select('periodo_hasta')
            .eq('clinica_id', clinicaId).not('periodo_hasta', 'is', null)
            .order('periodo_hasta', { ascending: false }).limit(1),
        filaSuscripcion(clinicaId),
    ]);
    // El período arranca cuando termina lo ya pagado o la prueba (no se pierden días).
    const desde = maxFecha(fecha, previos && previos[0] && previos[0].periodo_hasta, sus && sus.prueba_hasta);
    const hasta = sumarMeses(desde, meses || mesesDe(ciclo));

    const { data: asignado, error: asErr } = await supabase.from('suscripcion_pago')
        .update({ periodo_desde: desde.toISOString(), periodo_hasta: hasta.toISOString() })
        .eq('id', fila.id).is('periodo_hasta', null).select('id');
    if (asErr) throw asErr;
    if (!asignado || asignado.length === 0) return; // lo asignó otra ejecución

    const nuevoFin = maxFecha(sus && sus.periodo_hasta, hasta);
    const { error: sErr } = await supabase.from('suscripcion').update({
        estado: 'activa', periodo_hasta: nuevoFin.toISOString(), actualizada_en: new Date().toISOString(),
    }).eq('clinica_id', clinicaId);
    if (sErr) throw sErr;
}

// Trae el preapproval y sus cobros de MP y los aplica. Ignora lo que no es nuestro.
async function sincronizarSuscripcion(preapprovalId) {
    const pre = await mp.obtenerSuscripcion(preapprovalId);
    const { data: chk } = await supabase.from('suscripcion_checkout')
        .select('*').eq('mp_preapproval_id', preapprovalId).maybeSingle();
    let clinicaId = chk && chk.clinica_id;
    if (!clinicaId) {
        const { data: s } = await supabase.from('suscripcion')
            .select('clinica_id').eq('mp_preapproval_id', preapprovalId).maybeSingle();
        clinicaId = s && s.clinica_id;
    }
    if (!clinicaId) return { ignorado: true };
    if (pre.external_reference && pre.external_reference !== clinicaId) {
        console.warn('[mp] external_reference no coincide con la clínica del preapproval', preapprovalId);
        return { ignorado: true };
    }

    const ahora = new Date();
    if (chk) {
        await supabase.from('suscripcion_checkout')
            .update({ estado: pre.status, actualizado_en: ahora.toISOString() })
            .eq('mp_preapproval_id', preapprovalId);
    }

    const sus = await filaSuscripcion(clinicaId);
    const proximoCobro = pre.next_payment_date || null;

    if (pre.status === 'authorized' && chk && sus && sus.mp_preapproval_id !== preapprovalId) {
        // Contratación nueva (o cambio de ciclo): rige lo elegido en el checkout.
        const anterior = sus.mp_preapproval_id;
        // Acceso mientras llega el primer cobro: lo que ya tenía (prueba o período
        // pago) o unos días, lo que sea mayor.
        const provisorio = maxFecha(
            sus.estado === 'activa' ? sus.periodo_hasta : null,
            sus.prueba_hasta,
            new Date(ahora.getTime() + DIAS_PROVISORIOS * DIA_MS),
        );
        const { error } = await supabase.from('suscripcion').update({
            plan_id: chk.plan_id,
            ciclo: chk.ciclo,
            profesionales_extra: chk.profesionales_extra,
            monto: chk.monto,
            mp_preapproval_id: preapprovalId,
            mp_estado: 'authorized',
            mp_payer_email: pre.payer_email || chk.payer_email,
            renovacion_automatica: true,
            proximo_cobro: proximoCobro,
            estado: 'activa',
            periodo_hasta: provisorio.toISOString(),
            monto_nuevo: null, monto_nuevo_desde: null, aviso_precio_enviado_en: null,
            actualizada_en: ahora.toISOString(),
        }).eq('clinica_id', clinicaId);
        if (error) throw error;
        // Un solo débito vigente: se cancela el anterior (el período ya pago se respeta).
        if (anterior && anterior !== preapprovalId) {
            try { await mp.cancelarSuscripcion(anterior); } catch (e) {
                console.error('[mp] no se pudo cancelar el débito anterior', anterior, e.message);
            }
        }
    } else if (sus && sus.mp_preapproval_id === preapprovalId) {
        const { error } = await supabase.from('suscripcion').update({
            mp_estado: pre.status,
            renovacion_automatica: pre.status === 'authorized',
            proximo_cobro: pre.status === 'authorized' ? proximoCobro : null,
            monto: (pre.auto_recurring && pre.auto_recurring.transaction_amount) ?? sus.monto,
            actualizada_en: ahora.toISOString(),
        }).eq('clinica_id', clinicaId);
        if (error) throw error;
    }

    // Cobros del débito (también los de uno anterior: lo pagado cuenta igual).
    let cobros = [];
    try { cobros = await mp.cobrosDeSuscripcion(preapprovalId); } catch (e) {
        console.error('[mp] no se pudieron leer los cobros de', preapprovalId, e.message);
    }
    const meses = (pre.auto_recurring && pre.auto_recurring.frequency) || mesesDe(chk && chk.ciclo);
    for (const cobro of cobros) {
        await procesarCobro(cobro, {
            clinicaId,
            planId: (chk && chk.plan_id) || (sus && sus.plan_id),
            ciclo: (chk && chk.ciclo) || (sus && sus.ciclo),
            meses,
        });
    }

    planes.invalidar(clinicaId);
    return { clinicaId, estado: pre.status };
}

// Un cobro notificado por webhook → se sincroniza su suscripción completa.
async function sincronizarCobro(authorizedPaymentId) {
    const cobro = await mp.obtenerCobro(authorizedPaymentId);
    if (!cobro || !cobro.preapproval_id) return { ignorado: true };
    return sincronizarSuscripcion(cobro.preapproval_id);
}

// Al volver del checkout (o desde el panel): débito vigente + intentos recientes.
async function sincronizarClinica(clinicaId) {
    const desde = new Date(Date.now() - 7 * DIA_MS).toISOString();
    const [sus, { data: pendientes }] = await Promise.all([
        filaSuscripcion(clinicaId),
        supabase.from('suscripcion_checkout').select('mp_preapproval_id')
            .eq('clinica_id', clinicaId).eq('estado', 'pending').gte('creado_en', desde),
    ]);
    const ids = new Set((pendientes || []).map((p) => p.mp_preapproval_id));
    if (sus && sus.mp_preapproval_id) ids.add(sus.mp_preapproval_id);
    for (const id of ids) await sincronizarSuscripcion(id);
    planes.invalidar(clinicaId);
}

// Baja de la renovación: corta los débitos siguientes; el plan sigue hasta el fin
// del período pago (Política de reembolsos).
async function cancelarRenovacion(clinicaId) {
    const sus = await filaSuscripcion(clinicaId);
    if (!sus || !sus.mp_preapproval_id || sus.mp_estado === 'cancelled') {
        throw new ErrorNegocio(409, 'La clínica no tiene un débito automático activo.');
    }
    await mp.cancelarSuscripcion(sus.mp_preapproval_id);
    const { error } = await supabase.from('suscripcion').update({
        mp_estado: 'cancelled', renovacion_automatica: false, proximo_cobro: null,
        actualizada_en: new Date().toISOString(),
    }).eq('clinica_id', clinicaId);
    if (error) throw error;
    planes.invalidar(clinicaId);
    return { periodoHasta: sus.periodo_hasta };
}

// ---------------------------------------------------------------------------
// Actualización de precios de los débitos vigentes (Fase M2)
// ---------------------------------------------------------------------------
// Al subir el precio de un plan, los débitos que ya existen siguen con el monto viejo.
// Se PROGRAMA el nuevo monto, se avisa por email al admin de la clínica y rige recién
// DIAS_AVISO_PRECIO días después del aviso. Hasta entonces la clínica puede darse de baja.

const DIAS_AVISO_PRECIO = 30;

const formatoPesos = (n) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
}).format(n);
const fechaLarga = (f) => new Date(f).toLocaleDateString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'long',
});

// Programa el precio actual del plan para los débitos activos que cobran otro monto.
async function programarActualizacionPrecios(planId, dias = DIAS_AVISO_PRECIO) {
    const plan = (await planes.getPlanes()).get(planId);
    if (!plan) throw new ErrorNegocio(404, 'Plan no encontrado.');
    if (dias < DIAS_AVISO_PRECIO) throw new ErrorNegocio(400, `El aviso tiene que ser de al menos ${DIAS_AVISO_PRECIO} días.`);
    const { data: subs, error } = await supabase.from('suscripcion')
        .select('clinica_id, ciclo, profesionales_extra, monto, monto_nuevo')
        .eq('plan_id', planId).eq('mp_estado', 'authorized');
    if (error) throw error;

    const desde = new Date(Date.now() + dias * DIA_MS).toISOString();
    let programadas = 0;
    for (const s of subs || []) {
        const nuevo = calcularMonto(plan, s.ciclo, s.profesionales_extra || 0);
        const actual = s.monto == null ? null : Number(s.monto);
        if (nuevo === actual) continue; // ya cobra el precio vigente
        if (s.monto_nuevo != null && Number(s.monto_nuevo) === nuevo) continue; // ya programado
        const { error: uErr } = await supabase.from('suscripcion').update({
            monto_nuevo: nuevo, monto_nuevo_desde: desde, aviso_precio_enviado_en: null,
            actualizada_en: new Date().toISOString(),
        }).eq('clinica_id', s.clinica_id);
        if (uErr) throw uErr;
        programadas++;
    }
    const avisos = await enviarAvisosPrecio();
    return { programadas, ...avisos };
}

// Emails de los admins activos de una clínica.
async function emailsAdmins(clinicaId) {
    const { data } = await supabase.from('membresia')
        .select('persona:id_persona ( email )')
        .eq('clinica_id', clinicaId).eq('rol', 'admin').eq('activo', true);
    return [...new Set((data || []).map((m) => (Array.isArray(m.persona) ? m.persona[0] : m.persona)?.email).filter(Boolean))];
}

// Avisa los cambios programados que todavía no se avisaron. Si el aviso sale tarde, la
// fecha se corre para respetar los días de anticipación. Sin email configurado no se
// avisa ni se aplica nada (queda pendiente y se ve en el panel de plataforma).
async function enviarAvisosPrecio() {
    const { isMailerConfigured, sendMail } = require('./mailer');
    const { layoutMail, parrafo, fuerte, datos, aviso } = require('./emailLayout');
    const { data: pendientes, error } = await supabase.from('suscripcion')
        .select('clinica_id, plan_id, ciclo, monto, monto_nuevo, monto_nuevo_desde, clinica:clinica_id ( nombre )')
        .not('monto_nuevo', 'is', null).is('aviso_precio_enviado_en', null);
    if (error) throw error;
    if (!pendientes || pendientes.length === 0) return { avisadas: 0, sinAvisar: 0 };
    if (!isMailerConfigured()) return { avisadas: 0, sinAvisar: pendientes.length };

    const todos = await planes.getPlanes();
    let avisadas = 0;
    for (const s of pendientes) {
        const destinos = await emailsAdmins(s.clinica_id);
        if (destinos.length === 0) continue;
        const desde = maxFecha(s.monto_nuevo_desde, new Date(Date.now() + DIAS_AVISO_PRECIO * DIA_MS));
        const plan = todos.get(s.plan_id);
        const clinica = (Array.isArray(s.clinica) ? s.clinica[0] : s.clinica)?.nombre || 'tu clínica';
        const periodo = s.ciclo === 'anual' ? 'año' : 'mes';
        const texto = `Hola,\n\nTe avisamos que desde el ${fechaLarga(desde)} el plan ${plan ? plan.nombre : ''} de ${clinica} `
            + `pasa de ${formatoPesos(Number(s.monto))} a ${formatoPesos(Number(s.monto_nuevo))} por ${periodo}. `
            + 'Hasta esa fecha se te sigue cobrando el precio actual.\n\n'
            + 'Si no estás de acuerdo, podés dar de baja la renovación antes, sin costo, desde el panel (Plan → «Dar de baja la renovación»).\n\nMedilu';
        const ok = await sendMail({
            to: destinos.join(','),
            subject: `Cambio de precio de tu plan desde el ${fechaLarga(desde)} - Medilu`,
            text: texto,
            // El nombre de la clínica lo carga el usuario: los bloques lo escapan en el HTML.
            html: layoutMail({
                titulo: 'Cambia el precio de tu plan',
                resumen: `Desde el ${fechaLarga(desde)} el plan pasa a ${formatoPesos(Number(s.monto_nuevo))} por ${periodo}.`,
                cuerpo: [
                    parrafo(`Hola, te avisamos que cambia el precio del plan${plan ? ` ${fuerte(plan.nombre)}` : ''} de ${fuerte(clinica)}.`),
                    datos([
                        { etiqueta: 'Precio actual', valor: `${formatoPesos(Number(s.monto))} por ${periodo}` },
                        { etiqueta: 'Precio nuevo', valor: `${formatoPesos(Number(s.monto_nuevo))} por ${periodo}` },
                        { etiqueta: 'Desde', valor: fechaLarga(desde) },
                    ]),
                    parrafo('Hasta esa fecha se te sigue cobrando el precio actual.'),
                    aviso('¿No estás de acuerdo?', `Podés dar de baja la renovación antes, sin costo, desde el panel: ${fuerte('Plan')} → ${fuerte('Dar de baja la renovación')}.`),
                ].join('\n'),
            }),
        });
        if (!ok) continue;
        const { error: uErr } = await supabase.from('suscripcion').update({
            aviso_precio_enviado_en: new Date().toISOString(), monto_nuevo_desde: desde.toISOString(),
        }).eq('clinica_id', s.clinica_id);
        if (uErr) throw uErr;
        avisadas++;
    }
    return { avisadas, sinAvisar: pendientes.length - avisadas };
}

// Aplica en Mercado Pago los cambios de precio avisados cuya fecha ya llegó.
async function aplicarCambiosDePrecio() {
    const { data: listos, error } = await supabase.from('suscripcion')
        .select('clinica_id, mp_preapproval_id, mp_estado, monto_nuevo')
        .not('monto_nuevo', 'is', null).not('aviso_precio_enviado_en', 'is', null)
        .lte('monto_nuevo_desde', new Date().toISOString());
    if (error) throw error;
    let aplicados = 0;
    for (const s of listos || []) {
        const limpiar = { monto_nuevo: null, monto_nuevo_desde: null, aviso_precio_enviado_en: null, actualizada_en: new Date().toISOString() };
        if (s.mp_estado !== 'authorized' || !s.mp_preapproval_id) {
            // Se dio de baja antes de la fecha: no hay nada que cambiar.
            await supabase.from('suscripcion').update(limpiar).eq('clinica_id', s.clinica_id);
            continue;
        }
        try {
            await mp.cambiarMonto(s.mp_preapproval_id, Number(s.monto_nuevo));
        } catch (e) {
            console.error('[precios] no se pudo cambiar el monto en MP', s.clinica_id, e.message);
            continue; // se reintenta en el próximo control
        }
        await supabase.from('suscripcion').update({ ...limpiar, monto: Number(s.monto_nuevo) }).eq('clinica_id', s.clinica_id);
        planes.invalidar(s.clinica_id);
        aplicados++;
    }
    return { aplicados };
}

module.exports = {
    ErrorNegocio,
    DIAS_AVISO_PRECIO,
    calcularMonto,
    fechaPrimerCobro,
    puedeCambiarSinCheckout,
    programarActualizacionPrecios,
    enviarAvisosPrecio,
    aplicarCambiosDePrecio,
    iniciarContratacion,
    procesarCobro,
    sincronizarSuscripcion,
    sincronizarCobro,
    sincronizarClinica,
    cancelarRenovacion,
};
