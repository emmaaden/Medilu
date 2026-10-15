// Planes y permisos por plan (Fase L).
//
// Una clínica tiene UNA suscripción (tabla `suscripcion`) a un plan (tabla `plan`).
// Lo que un usuario puede hacer = lo que permite su ROL en la clínica (middleware/auth)
// ∩ lo que incluye el PLAN de esa clínica (este módulo + middleware/plan).
//
// Sin plan gratis: la clínica nueva arranca con DIAS_PRUEBA días del plan PLAN_PRUEBA.
// Vencida la prueba, o el período pago + DIAS_GRACIA, la clínica queda en SOLO
// LECTURA: ve y exporta sus datos, pero no carga nada nuevo ni recibe turnos online.
//
// Asientos: cuentan solo los profesionales (membresías activas admin | profesional).

const { supabase } = require('../config/supabaseClient');
const { vigenteDesde } = require('./codigoActivacion');

// Catálogo de features. La clave es lo que se guarda en `plan.features`; el texto es
// el que ve el usuario. Espejo en frontend/src/lib/planes.ts (mantener alineados).
const FEATURES = {
    agenda: 'Agenda, turnos online y recordatorios por email',
    historia_clinica: 'Historia clínica con CIE-10 y obras sociales',
    certificados: 'Certificados médicos con firma',
    odontologia: 'Odontograma por caras',
    dictado: 'Dictado por voz en la consulta',
    estudios: 'Estudios que comparten los pacientes',
    importar_hc: 'Importación de historias clínicas',
    recepcion: 'Recepción que gestiona la agenda',
    catalogos: 'Catálogos propios de obras sociales y prácticas',
    autorizaciones: 'Autorizaciones previas de prácticas',
    auditoria: 'Auditoría médica y bitácora de accesos',
};

const DIAS_PRUEBA = 14;
const DIAS_GRACIA = 5;
const PLAN_PRUEBA = 'clinica';
const DIA_MS = 24 * 60 * 60 * 1000;

const ROLES_PROFESIONAL = ['admin', 'profesional'];

// ---------------------------------------------------------------------------
// Caché en memoria. La suscripción se consulta en casi cada request del staff;
// 30 s alcanza para que un cambio de plan se vea enseguida sin golpear la base.
// Quien modifica una suscripción o un plan llama a invalidar().
// ---------------------------------------------------------------------------
const TTL_MS = 30 * 1000;
let cachePlanes = null; // { at, planes: Map<id, plan> }
const cacheSuscripcion = new Map(); // clinicaId -> { at, fila }

function invalidar(clinicaId) {
    if (clinicaId) cacheSuscripcion.delete(clinicaId);
    else cacheSuscripcion.clear();
    cachePlanes = null;
}

function mapPlan(p) {
    return {
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioMensual: Number(p.precio_mensual),
        precioAnual: Number(p.precio_anual),
        profesionalesIncluidos: p.profesionales_incluidos,
        precioProfesionalExtra: p.precio_profesional_extra == null ? null : Number(p.precio_profesional_extra),
        maxRecepcion: p.max_recepcion,
        features: p.features || [],
        orden: p.orden,
        destacado: p.destacado,
        activo: p.activo,
    };
}

// Todos los planes (activos o no: una clínica puede seguir en un plan discontinuado).
async function getPlanes() {
    if (cachePlanes && Date.now() - cachePlanes.at < TTL_MS) return cachePlanes.planes;
    const { data, error } = await supabase.from('plan').select('*').order('orden');
    if (error) throw error;
    const planes = new Map((data || []).map((p) => [p.id, mapPlan(p)]));
    cachePlanes = { at: Date.now(), planes };
    return planes;
}

// Crea la prueba de una clínica (alta de clínica nueva). Idempotente.
async function crearPrueba(clinicaId) {
    const { error } = await supabase
        .from('suscripcion')
        .upsert({
            clinica_id: clinicaId,
            plan_id: PLAN_PRUEBA,
            estado: 'prueba',
            prueba_hasta: new Date(Date.now() + DIAS_PRUEBA * DIA_MS).toISOString(),
        }, { onConflict: 'clinica_id', ignoreDuplicates: true });
    if (error) throw error;
    invalidar(clinicaId);
}

async function getSuscripcionFila(clinicaId) {
    const c = cacheSuscripcion.get(clinicaId);
    if (c && Date.now() - c.at < TTL_MS) return c.fila;
    let { data, error } = await supabase
        .from('suscripcion')
        .select('*')
        .eq('clinica_id', clinicaId)
        .maybeSingle();
    if (error) throw error;
    // Clínica sin suscripción (creada antes de la Fase L o por fuera del registro):
    // arranca su prueba en el primer uso en vez de quedar bloqueada.
    if (!data) {
        await crearPrueba(clinicaId);
        ({ data, error } = await supabase
            .from('suscripcion').select('*').eq('clinica_id', clinicaId).maybeSingle());
        if (error) throw error;
    }
    cacheSuscripcion.set(clinicaId, { at: Date.now(), fila: data });
    return data;
}

// Estado EFECTIVO a partir de la fila (las fechas mandan sobre el estado guardado):
// 'prueba' | 'activa' | 'gracia' | 'vencida' | 'cancelada'.
function calcularEstado(s, ahora = Date.now()) {
    if (!s || s.estado === 'cancelada') return s ? 'cancelada' : 'vencida';
    if (s.estado === 'vencida') return 'vencida';
    if (s.estado === 'prueba') {
        return s.prueba_hasta && new Date(s.prueba_hasta).getTime() >= ahora ? 'prueba' : 'vencida';
    }
    if (!s.periodo_hasta) return 'activa'; // sin vencimiento (cortesía)
    const fin = new Date(s.periodo_hasta).getTime();
    if (ahora <= fin) return 'activa';
    if (ahora <= fin + DIAS_GRACIA * DIA_MS) return 'gracia';
    return 'vencida';
}

function diasHasta(fechaMs, ahora = Date.now()) {
    return Math.max(0, Math.ceil((fechaMs - ahora) / DIA_MS));
}

// Resumen del plan de una clínica: lo que consume el resto del backend y /api/user.
async function getPlanClinica(clinicaId) {
    if (!clinicaId) return null;
    const [fila, planes] = await Promise.all([getSuscripcionFila(clinicaId), getPlanes()]);
    const plan = planes.get(fila?.plan_id) || null;
    const estado = calcularEstado(fila);
    const soloLectura = estado === 'vencida' || estado === 'cancelada' || !plan;

    let diasRestantes = null;
    if (estado === 'prueba') diasRestantes = diasHasta(new Date(fila.prueba_hasta).getTime());
    else if (estado === 'activa' && fila.periodo_hasta) diasRestantes = diasHasta(new Date(fila.periodo_hasta).getTime());
    else if (estado === 'gracia') diasRestantes = diasHasta(new Date(fila.periodo_hasta).getTime() + DIAS_GRACIA * DIA_MS);

    const extra = plan && plan.precioProfesionalExtra != null ? (fila?.profesionales_extra || 0) : 0;
    return {
        planId: plan?.id ?? null,
        planNombre: plan?.nombre ?? null,
        estado,
        soloLectura,
        diasRestantes,
        pruebaHasta: fila?.prueba_hasta ?? null,
        periodoHasta: fila?.periodo_hasta ?? null,
        ciclo: fila?.ciclo ?? 'mensual',
        features: plan?.features ?? [],
        maxProfesionales: plan ? plan.profesionalesIncluidos + extra : 0,
        profesionalesExtra: extra,
        admiteExtra: !!plan && plan.precioProfesionalExtra != null,
        maxRecepcion: plan ? plan.maxRecepcion : 0,
    };
}

function tieneFeature(planClinica, feature) {
    return !!planClinica && planClinica.features.includes(feature);
}

// Miembros activos por tipo de asiento.
async function usoClinica(clinicaId) {
    const { data, error } = await supabase
        .from('membresia')
        .select('rol')
        .eq('clinica_id', clinicaId)
        .eq('activo', true);
    if (error) throw error;
    const uso = { profesionales: 0, recepcion: 0, auditores: 0 };
    for (const m of data || []) {
        if (ROLES_PROFESIONAL.includes(m.rol)) uso.profesionales++;
        else if (m.rol === 'recepcion') uso.recepcion++;
        else if (m.rol === 'auditor') uso.auditores++;
    }
    return uso;
}

// Códigos de activación todavía sin usar, por rol (reservan un lugar).
async function codigosPendientes(clinicaId) {
    const { data, error } = await supabase
        .from('codigo_activacion')
        .select('rol')
        .eq('clinica_id', clinicaId)
        .eq('usado', false)
        .gte('creado_en', vigenteDesde()); // los vencidos ya no reservan lugar
    if (error) throw error;
    const pend = { profesionales: 0, recepcion: 0, auditores: 0 };
    for (const c of data || []) {
        const rol = c.rol || 'profesional';
        if (ROLES_PROFESIONAL.includes(rol)) pend.profesionales++;
        else if (rol === 'recepcion') pend.recepcion++;
        else if (rol === 'auditor') pend.auditores++;
    }
    return pend;
}

// ¿Puede la clínica sumar (o reactivar) un miembro con este rol?
// Devuelve null si puede, o { status, code, error } para responder tal cual.
// `contarCodigos`: al GENERAR un código se cuentan también los pendientes (cada uno
// reserva un lugar); al CANJEARLO no (el propio código ya está entre los pendientes).
async function verificarAlta(clinicaId, rol, { contarCodigos = false } = {}) {
    const pc = await getPlanClinica(clinicaId);
    if (!pc || pc.soloLectura) {
        return {
            status: 402, code: 'PLAN_SOLO_LECTURA',
            error: 'La suscripción de la clínica no está vigente: no se pueden sumar miembros.',
        };
    }
    for (const [r, feature] of [['auditor', 'auditoria'], ['recepcion', 'recepcion']]) {
        if (rol === r && !tieneFeature(pc, feature)) {
            return errorFeature(pc, feature, await planMinimoCon(feature));
        }
    }

    const [uso, pend] = await Promise.all([
        usoClinica(clinicaId),
        contarCodigos ? codigosPendientes(clinicaId) : Promise.resolve(null),
    ]);
    const ocupados = (k) => uso[k] + (pend ? pend[k] : 0);

    if (ROLES_PROFESIONAL.includes(rol) && ocupados('profesionales') >= pc.maxProfesionales) {
        return {
            status: 402, code: 'PLAN_LIMITE',
            error: `Tu plan ${pc.planNombre} admite ${pc.maxProfesionales} profesional${pc.maxProfesionales === 1 ? '' : 'es'}`
                + (pend && pend.profesionales ? ' (contando los códigos sin usar)' : '')
                + (pc.admiteExtra ? '. Sumá profesionales a tu plan o pasá a uno superior.' : '. Pasá a un plan superior para sumar más.'),
        };
    }
    if (rol === 'recepcion' && pc.maxRecepcion != null && ocupados('recepcion') >= pc.maxRecepcion) {
        return {
            status: 402, code: 'PLAN_LIMITE',
            error: `Tu plan ${pc.planNombre} admite ${pc.maxRecepcion} persona${pc.maxRecepcion === 1 ? '' : 's'} de recepción`
                + (pend && pend.recepcion ? ' (contando los códigos sin usar)' : '')
                + '. Pasá a un plan superior para sumar más.',
        };
    }
    return null;
}

// Plan más barato que incluye una feature (para sugerir a cuál pasar).
async function planMinimoCon(feature) {
    const planes = await getPlanes();
    return [...planes.values()]
        .filter((p) => p.activo && p.features.includes(feature))
        .sort((a, b) => a.orden - b.orden)[0] || null;
}

function errorFeature(pc, feature, planMinimo) {
    const nombre = FEATURES[feature] || feature;
    return {
        status: 402, code: 'PLAN_FEATURE', feature,
        planMinimo: planMinimo ? planMinimo.id : undefined,
        error: `${nombre}: no está incluido en tu plan ${pc?.planNombre || ''}`.trim()
            + (planMinimo ? `. Está disponible desde el plan ${planMinimo.nombre}.` : '.'),
    };
}

// Clínicas que hoy NO reciben turnos online (suscripción no vigente). Para filtrar
// el listado público de profesionales sin consultar clínica por clínica.
let cacheSinServicio = null; // { at, set }
async function clinicasSinServicio() {
    if (cacheSinServicio && Date.now() - cacheSinServicio.at < TTL_MS) return cacheSinServicio.set;
    const { data, error } = await supabase
        .from('suscripcion')
        .select('clinica_id, estado, prueba_hasta, periodo_hasta');
    if (error) throw error;
    const set = new Set((data || []).filter((s) => {
        const e = calcularEstado(s);
        return e === 'vencida' || e === 'cancelada';
    }).map((s) => s.clinica_id));
    cacheSinServicio = { at: Date.now(), set };
    return set;
}

// Emails con acceso al panel de plataforma (activar planes, editar precios).
function esAdminPlataforma(email) {
    if (!email) return false;
    const lista = String(process.env.PLATAFORMA_ADMIN_EMAILS || '')
        .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    return lista.includes(String(email).toLowerCase());
}

module.exports = {
    FEATURES,
    DIAS_PRUEBA,
    DIAS_GRACIA,
    PLAN_PRUEBA,
    ROLES_PROFESIONAL,
    getPlanes,
    getPlanClinica,
    crearPrueba,
    calcularEstado,
    tieneFeature,
    usoClinica,
    verificarAlta,
    planMinimoCon,
    errorFeature,
    clinicasSinServicio,
    esAdminPlataforma,
    invalidar: (clinicaId) => { invalidar(clinicaId); cacheSinServicio = null; },
};
