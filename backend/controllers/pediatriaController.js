// Pediatría (Fase Z): antecedentes perinatales, mediciones de crecimiento, vacunas e
// hitos del desarrollo de un paciente de la clínica activa.
//
// Lecturas y escrituras con el cliente "como usuario" (RLS de db/faseZ_pediatria.sql:
// miembro de la clínica para leer; quien puede escribir HC, como sí mismo, para
// escribir). Que el paciente sea de la clínica activa se verifica antes con
// service_role (la RLS no lo exige). Las mediciones y vacunas no se borran: se anulan.

const { supabase } = require('../config/supabaseClient');
const { getUserSupabase } = require('../middleware/userSupabase');
const { registrarAcceso } = require('../utils/bitacora');
const { errorDb } = require('../utils/errores');
const ped = require('../utils/pediatria');

const ERR_SESION = { error: 'Tu sesión expiró. Iniciá sesión de nuevo.' };

// Paciente de la clínica activa (o null). Devuelve también nombre/DNI para la bitácora.
async function pacienteDeLaClinica(req) {
    const id = Number.parseInt(req.params.pacienteId, 10);
    const clinicaId = req.session.user.clinicaId;
    if (!Number.isInteger(id) || id <= 0 || !clinicaId) return null;
    const { data, error } = await supabase
        .from('paciente')
        .select('id, persona:id_persona ( nombre, apellido, dni, clinica_id )')
        .eq('id', id)
        .maybeSingle();
    if (error) throw error;
    if (!data || !data.persona || data.persona.clinica_id !== clinicaId) return null;
    return {
        id: data.id,
        snapshot: { nombre: [data.persona.nombre, data.persona.apellido].filter(Boolean).join(' '), dni: data.persona.dni },
    };
}

async function contexto(req, res) {
    const paciente = await pacienteDeLaClinica(req);
    if (!paciente) {
        res.status(404).json({ error: 'Paciente no encontrado en tu clínica.' });
        return null;
    }
    const db = await getUserSupabase(req);
    if (!db) {
        res.status(401).json(ERR_SESION);
        return null;
    }
    return { paciente, db, clinicaId: req.session.user.clinicaId, idProfesional: req.session.user.idRole };
}

function registrar(req, paciente, tipo) {
    return registrarAcceso(req, {
        accion: 'cargar_pediatria',
        idPaciente: paciente.id,
        paciente: paciente.snapshot,
        detalle: { tipo },
    });
}

// Todo lo pediátrico de una lista de fichas (lo usa también el portal del paciente,
// con service_role y los ids de la sesión).
async function datosPediatricos(db, idsPaciente) {
    const [peri, med, vac, hit] = await Promise.all([
        db.from('antecedente_perinatal').select('*').in('id_paciente', idsPaciente),
        db.from('medicion_crecimiento').select('*').in('id_paciente', idsPaciente).eq('anulada', false)
            .order('fecha', { ascending: true }).order('creado_en', { ascending: true }),
        db.from('vacuna_aplicada').select('*').in('id_paciente', idsPaciente).eq('anulada', false)
            .order('fecha', { ascending: true }),
        db.from('hito_desarrollo').select('*').in('id_paciente', idsPaciente),
    ]);
    const error = peri.error || med.error || vac.error || hit.error;
    if (error) throw error;
    // Varias fichas (portal): el perinatal más reciente; los hitos, la última evaluación.
    const perinatal = [...(peri.data || [])].sort((a, b) => String(b.actualizado_en).localeCompare(String(a.actualizado_en)))[0];
    const hitos = new Map();
    for (const h of [...(hit.data || [])].sort((a, b) => String(a.fecha_evaluacion).localeCompare(String(b.fecha_evaluacion)))) {
        hitos.set(h.hito, h);
    }
    return {
        perinatal: ped.serializarPerinatal(perinatal),
        mediciones: (med.data || []).map(ped.serializarMedicion),
        vacunas: (vac.data || []).map(ped.serializarVacuna),
        hitos: [...hitos.values()].map(ped.serializarHito),
        catalogo: ped.CATALOGO,
    };
}
exports.datosPediatricos = datosPediatricos;

// GET /pediatria/:pacienteId
exports.getDatos = async (req, res) => {
    try {
        const ctx = await contexto(req, res);
        if (!ctx) return undefined;
        const datos = await datosPediatricos(ctx.db, [ctx.paciente.id]);
        return res.json({ ...datos, idProfesional: ctx.idProfesional });
    } catch (err) {
        console.error('Error en pediatria/get:', err);
        return res.status(500).json({ error: 'No se pudieron cargar los datos pediátricos.' });
    }
};

// PUT /pediatria/:pacienteId/perinatal
exports.guardarPerinatal = async (req, res) => {
    try {
        const ctx = await contexto(req, res);
        if (!ctx) return undefined;
        const fila = {
            id_paciente: ctx.paciente.id,
            clinica_id: ctx.clinicaId,
            id_profesional: ctx.idProfesional,
            actualizado_en: new Date().toISOString(),
            ...ped.columnasPerinatal(req.body),
        };
        const { data, error } = await ctx.db
            .from('antecedente_perinatal')
            .upsert(fila, { onConflict: 'id_paciente' })
            .select('*')
            .single();
        if (error) return errorDb(res, error);
        await registrar(req, ctx.paciente, 'perinatal');
        return res.json({ perinatal: ped.serializarPerinatal(data) });
    } catch (err) {
        console.error('Error en pediatria/perinatal:', err);
        return res.status(500).json({ error: 'No se pudieron guardar los antecedentes.' });
    }
};

// POST /pediatria/:pacienteId/mediciones
exports.crearMedicion = async (req, res) => {
    try {
        const ctx = await contexto(req, res);
        if (!ctx) return undefined;
        const b = req.body;
        const { data, error } = await ctx.db
            .from('medicion_crecimiento')
            .insert({
                id_paciente: ctx.paciente.id,
                clinica_id: ctx.clinicaId,
                id_profesional: ctx.idProfesional,
                fecha: b.fecha,
                peso_kg: b.pesoKg ?? null,
                talla_cm: b.tallaCm ?? null,
                posicion: b.tallaCm != null ? (b.posicion ?? null) : null,
                pc_cm: b.pcCm ?? null,
                notas: b.notas || null,
            })
            .select('*')
            .single();
        if (error) return errorDb(res, error);
        await registrar(req, ctx.paciente, 'medicion');
        return res.status(201).json({ medicion: ped.serializarMedicion(data) });
    } catch (err) {
        console.error('Error en pediatria/mediciones:', err);
        return res.status(500).json({ error: 'No se pudo guardar la medición.' });
    }
};

// POST /pediatria/:pacienteId/vacunas
exports.crearVacuna = async (req, res) => {
    try {
        const b = req.body;
        if (!ped.CODIGOS_VACUNA.has(b.vacuna)) return res.status(400).json({ error: 'Vacuna inválida.' });
        if (b.vacuna === 'otra' && !b.vacunaOtra) {
            return res.status(400).json({ error: 'Indicá el nombre de la vacuna.' });
        }
        const ctx = await contexto(req, res);
        if (!ctx) return undefined;
        const { data, error } = await ctx.db
            .from('vacuna_aplicada')
            .insert({
                id_paciente: ctx.paciente.id,
                clinica_id: ctx.clinicaId,
                id_profesional: ctx.idProfesional,
                vacuna: b.vacuna,
                vacuna_otra: b.vacuna === 'otra' ? b.vacunaOtra : null,
                dosis: b.dosis || null,
                fecha: b.fecha,
                lote: b.lote || null,
                lugar: b.lugar || null,
                notas: b.notas || null,
            })
            .select('*')
            .single();
        if (error) return errorDb(res, error);
        await registrar(req, ctx.paciente, 'vacuna');
        return res.status(201).json({ vacuna: ped.serializarVacuna(data) });
    } catch (err) {
        console.error('Error en pediatria/vacunas:', err);
        return res.status(500).json({ error: 'No se pudo guardar la vacuna.' });
    }
};

// PUT /pediatria/:pacienteId/hitos { fecha?, hitos: [{ hito, estado }] }
exports.guardarHitos = async (req, res) => {
    try {
        const { hitos, fecha } = req.body;
        if (hitos.some((h) => !ped.CODIGOS_HITO.has(h.hito))) {
            return res.status(400).json({ error: 'Hito inválido.' });
        }
        const ctx = await contexto(req, res);
        if (!ctx) return undefined;
        const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
        const filas = hitos.map((h) => ({
            id_paciente: ctx.paciente.id,
            hito: h.hito,
            clinica_id: ctx.clinicaId,
            id_profesional: ctx.idProfesional,
            estado: h.estado,
            fecha_evaluacion: fecha || hoy,
            actualizado_en: new Date().toISOString(),
        }));
        const { data, error } = await ctx.db
            .from('hito_desarrollo')
            .upsert(filas, { onConflict: 'id_paciente,hito' })
            .select('*');
        if (error) return errorDb(res, error);
        await registrar(req, ctx.paciente, 'hitos');
        return res.json({ hitos: (data || []).map(ped.serializarHito) });
    } catch (err) {
        console.error('Error en pediatria/hitos:', err);
        return res.status(500).json({ error: 'No se pudieron guardar los hitos.' });
    }
};

// PATCH /pediatria/{mediciones|vacunas}/:id/anular — solo el autor (RLS).
function anular(tabla, tipo) {
    return async (req, res) => {
        try {
            const db = await getUserSupabase(req);
            if (!db) return res.status(401).json(ERR_SESION);
            const { data, error } = await db
                .from(tabla)
                .update({ anulada: true })
                .eq('id', req.params.id)
                .eq('clinica_id', req.session.user.clinicaId)
                .select('id, id_paciente')
                .maybeSingle();
            if (error) return errorDb(res, error);
            if (!data) return res.status(404).json({ error: 'No encontrado, o no lo cargaste vos.' });
            await registrarAcceso(req, { accion: 'cargar_pediatria', idPaciente: data.id_paciente, detalle: { tipo, anulada: data.id } });
            return res.json({ ok: true });
        } catch (err) {
            console.error(`Error anulando en ${tabla}:`, err);
            return res.status(500).json({ error: 'No se pudo anular.' });
        }
    };
}
exports.anularMedicion = anular('medicion_crecimiento', 'medicion');
exports.anularVacuna = anular('vacuna_aplicada', 'vacuna');
