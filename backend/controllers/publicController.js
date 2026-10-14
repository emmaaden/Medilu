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

// Ids de profesional que pertenecen a una clínica (vía persona.clinica_id).
async function profesionalIdsDeClinica(clinicaId) {
    const { data, error } = await supabase
        .from('profesional')
        .select('id, persona:id_persona!inner ( clinica_id )')
        .eq('persona.clinica_id', clinicaId);
    if (error) throw error;
    return (data || []).map(p => p.id);
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

// GET /clinica-publica/lista
// Fase N: clínicas donde el paciente puede sacar turno (activas, con slug y con la
// suscripción vigente y con los turnos online prendidos), para elegir una antes de reservar.
// Respuesta: [ { slug, nombre, direccion, descripcion } ]
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
        return res.json(
            (data || [])
                .filter((c) => !sinServicio.has(c.id))
                .map((c) => ({
                    slug: c.slug, nombre: c.nombre,
                    direccion: c.direccion || null, descripcion: c.descripcion || null,
                }))
        );
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
        if (req.query.clinica) {
            const clinica = await resolverClinicaPorSlug(req.query.clinica);
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
            if (p.persona && sinServicio.has(p.persona.clinica_id)) continue; // no recibe turnos online
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
        if (req.query.clinica) {
            const clinica = await resolverClinicaPorSlug(req.query.clinica);
            if (!clinica) return res.status(404).json({ error: 'Clínica no encontrada.' });
            idsPermitidos = new Set(await profesionalIdsDeClinica(clinica.id));
            if (idsPermitidos.size === 0) return res.json([]);
        }

        const { data, error } = await supabase
            .from('horario_profesional')
            .select(`
                id_profesional,
                horario_inicio,
                horario_fin,
                profesional:id_profesional ( id, turnos_online, persona ( nombre, apellido, clinica_id ) )
            `);
        if (error) throw error;
        const sinServicio = await clinicasSinTurnosOnline();

        const agg = new Map();
        for (const h of data || []) {
            const id = h.id_profesional;
            if (id == null) continue;
            if (idsPermitidos && !idsPermitidos.has(id)) continue;

            const persona = h.profesional && h.profesional.persona;
            if (persona && sinServicio.has(persona.clinica_id)) continue; // no recibe turnos online
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
