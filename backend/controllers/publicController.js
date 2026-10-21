// Endpoints públicos usados por la página de turnos (paciente sin autenticar).
// Solo exponen datos necesarios para elegir profesional y calcular horarios.
//
// Fase 2 (aislamiento por tenant): cuando la página de turnos incluye ?clinica=<slug>,
// el listado se filtra a los profesionales de ESA clínica. Sin slug se mantiene el
// comportamiento anterior (listar todo), útil para un despliegue de una sola clínica.

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const { clinicasSinTurnosOnline } = require('../utils/turnosOnline'); // Fase N2
const membresias = require('../utils/membresias');

// Resuelve un slug de clínica a su fila (id, nombre, slug). Devuelve null si no existe.
async function resolverClinicaPorSlug(slug) {
    const s = slug && String(slug).trim();
    if (!s) return null;
    const { data, error } = await supabase
        .from('clinica')
        .select('id, nombre, slug, direccion, descripcion')
        .eq('slug', s)
        .eq('activa', true)
        .maybeSingle();
    if (error) throw error;
    return data || null;
}

// Ids de profesional que atienden en una clínica (Fase U: por membresía).
function profesionalIdsDeClinica(clinicaId) {
    return membresias.profesionalIdsDeClinica(supabase, clinicaId);
}

// GET /clinica-publica?clinica=<slug>
// Info mínima de una clínica para el encabezado de su página de turnos.
exports.clinicaPublica = async (req, res) => {
    try {
        const clinica = await resolverClinicaPorSlug(req.query.clinica);
        if (!clinica) return res.status(404).json({ error: 'Clínica no encontrada.' });
        // Fase L/N2: sin suscripción vigente o con los turnos online apagados, no recibe reservas.
        const sinServicio = await clinicasSinTurnosOnline();
        return res.json({
            id: clinica.id, nombre: clinica.nombre, slug: clinica.slug,
            direccion: clinica.direccion || null, descripcion: clinica.descripcion || null,
            recibeTurnos: !sinServicio.has(clinica.id),
        });
    } catch (err) {
        console.error('Error en clinica-publica:', err);
        return res.status(500).json({ error: 'Error al obtener la clínica.' });
    }
};

// Minúsculas y sin tildes, para buscar «clinica» y encontrar «Clínica».
const normalizar = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const CLINICAS_POR_PAGINA = 8;

// GET /clinica-publica/lista[?q=<texto>&page=<n>]
// Fase N: clínicas donde el paciente puede sacar turno (activas, con slug y con la
// suscripción vigente y con los turnos online prendidos), para elegir una antes de reservar.
// `q` filtra por nombre o dirección (sin distinguir tildes). Se filtra y pagina acá
// porque las que no reciben turnos se descartan después de la consulta.
// Respuesta: { clinicas: [ { slug, nombre, direccion, descripcion } ], total, page, pageSize }
exports.listarClinicas = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('clinica')
            .select('id, nombre, slug, direccion, descripcion')
            .eq('activa', true)
            .not('slug', 'is', null)
            .order('nombre', { ascending: true });
        if (error) throw error;
        const sinServicio = await clinicasSinTurnosOnline();
        const palabras = normalizar(req.query.q).split(/\s+/).filter(Boolean);
        const todas = (data || [])
            .filter((c) => !sinServicio.has(c.id))
            .filter((c) => {
                if (!palabras.length) return true;
                const texto = normalizar(`${c.nombre} ${c.direccion || ''}`);
                return palabras.every((p) => texto.includes(p));
            });

        const total = todas.length;
        const paginas = Math.max(1, Math.ceil(total / CLINICAS_POR_PAGINA));
        const page = Math.min(Math.max(1, Number.parseInt(req.query.page, 10) || 1), paginas);
        const desde = (page - 1) * CLINICAS_POR_PAGINA;
        return res.json({
            clinicas: todas.slice(desde, desde + CLINICAS_POR_PAGINA).map((c) => ({
                slug: c.slug, nombre: c.nombre,
                direccion: c.direccion || null, descripcion: c.descripcion || null,
            })),
            total,
            page,
            pageSize: CLINICAS_POR_PAGINA,
        });
    } catch (err) {
        console.error('Error listando clínicas:', err);
        return res.status(500).json({ error: 'Error al obtener las clínicas.' });
    }
};

// GET /professionals[?clinica=<slug>]
// Lista, agrupado por área/especialidad, los profesionales disponibles.
// Con ?clinica=<slug> filtra a los profesionales de esa clínica (aislamiento por tenant).
// Respuesta: [ { area, professionals: [ { id, nombre } ] } ]
exports.listProfessionals = async (req, res) => {
    try {
        // Filtro por clínica (si viene el slug).
        let idsPermitidos = null;
        let clinica = null;
        if (req.query.clinica) {
            clinica = await resolverClinicaPorSlug(req.query.clinica);
            if (!clinica) return res.status(404).json({ error: 'Clínica no encontrada.' });
            idsPermitidos = new Set(await profesionalIdsDeClinica(clinica.id));
            if (idsPermitidos.size === 0) return res.json([]); // clínica sin profesionales
        }

        const { data, error } = await supabase
            .from('especialidad_profesional')
            .select(`
                especialidad:id_especialidad ( nombre ),
                profesional:id_profesional ( id, turnos_online, persona ( nombre, apellido, clinica_id ) )
            `);
        if (error) throw error;
        // Fase L/N2: fuera los profesionales de clínicas que no reciben turnos online.
        const sinServicio = await clinicasSinTurnosOnline();

        const porArea = new Map();
        for (const row of data || []) {
            const area = row.especialidad && row.especialidad.nombre;
            const p = row.profesional;
            if (!area || !p) continue;
            if (idsPermitidos && !idsPermitidos.has(p.id)) continue; // fuera de la clínica
            // Con slug, la clínica es la de la página (Fase U: puede no ser la de origen).
            const clinicaTurno = clinica ? clinica.id : p.persona && p.persona.clinica_id;
            if (sinServicio.has(clinicaTurno)) continue; // no recibe turnos online
            if (p.turnos_online === false) continue; // Fase N3: el profesional no toma turnos online

            const nombre = [p.persona && p.persona.nombre, p.persona && p.persona.apellido]
                .filter(Boolean)
                .join(' ');

            if (!porArea.has(area)) porArea.set(area, []);
            porArea.get(area).push({ id: p.id, nombre });
        }

        const result = [...porArea.entries()].map(([area, professionals]) => ({ area, professionals }));
        return res.json(result);
    } catch (err) {
        console.error('Error listando profesionales:', err);
        return res.status(500).json({ error: 'Error al obtener los profesionales.' });
    }
};

// GET /api/get-hours[?clinica=<slug>]
// Horario global (inicio más temprano / fin más tardío) de cada profesional,
// usado por el frontend para calcular las franjas de turnos.
// Respuesta: [ { id, fullName, startHour, endHour } ]
exports.getBookingHours = async (req, res) => {
    try {
        // Filtro por clínica (si viene el slug).
        let idsPermitidos = null;
        let clinica = null;
        if (req.query.clinica) {
            clinica = await resolverClinicaPorSlug(req.query.clinica);
            if (!clinica) return res.status(404).json({ error: 'Clínica no encontrada.' });
            idsPermitidos = new Set(await profesionalIdsDeClinica(clinica.id));
            if (idsPermitidos.size === 0) return res.json([]);
        }

        let consulta = supabase
            .from('horario_profesional')
            .select(`
                id_profesional,
                clinica_id,
                horario_inicio,
                horario_fin,
                profesional:id_profesional ( id, turnos_online, persona ( nombre, apellido, clinica_id ) )
            `);
        // Fase U: con slug, solo las franjas que el profesional atiende en esa clínica.
        if (clinica) consulta = consulta.eq('clinica_id', clinica.id);
        const { data, error } = await consulta;
        if (error) throw error;
        const sinServicio = await clinicasSinTurnosOnline();

        const agg = new Map();
        for (const h of data || []) {
            const id = h.id_profesional;
            if (id == null) continue;
            if (idsPermitidos && !idsPermitidos.has(id)) continue;

            const persona = h.profesional && h.profesional.persona;
            if (sinServicio.has(h.clinica_id)) continue; // no recibe turnos online
            if (h.profesional && h.profesional.turnos_online === false) continue; // Fase N3
            const fullName = [persona && persona.nombre, persona && persona.apellido]
                .filter(Boolean)
                .join(' ');

            const cur = agg.get(id) || {
                id,
                fullName,
                startHour: h.horario_inicio,
                endHour: h.horario_fin,
            };
            // Comparación lexicográfica de 'HH:MM' equivale a comparación temporal.
            if (h.horario_inicio < cur.startHour) cur.startHour = h.horario_inicio;
            if (h.horario_fin > cur.endHour) cur.endHour = h.horario_fin;
            agg.set(id, cur);
        }

        return res.json([...agg.values()]);
    } catch (err) {
        console.error('Error obteniendo horarios:', err);
        return res.status(500).json({ error: 'Error al obtener los horarios.' });
    }
};
