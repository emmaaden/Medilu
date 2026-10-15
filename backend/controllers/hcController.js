// Exportación / Importación de Historias Clínicas (Fase D).
//
// Marco legal: Ley 26.529 (copia de la HC), Ley 27.706 (digitalización) y
// Res. 1840/2018 (interoperabilidad). El export estructurado (JSON) permite portar
// y re-importar la información.
//
// Alcance (rol dentro de la clínica activa):
//   - admin:       todas las HC de la clínica.
//   - profesional: solo las de pacientes que ATENDIÓ él (registros con su id_profesional).
//
// Se usa service_role acotado SIEMPRE por la clínica de la sesión (y, si no es admin,
// por el id del profesional). El guard requireRole('profesional') protege las rutas.

const { supabase } = require('../config/supabaseClient');
const { filasParaRegistro, serializarDiente } = require('../utils/odontograma');
const { registrarAcceso } = require('../utils/bitacora');
const { puedeSumarFicha } = require('../utils/membresias');
const { serializarCodificacion, SELECT_CODIFICACION } = require('../utils/codificacion');

const FORMATO = 'medilu.hc';
// Exports generados con los nombres anteriores (AgendaSalud, Agenlu); se siguen aceptando al importar.
const FORMATOS_ACEPTADOS = [FORMATO, 'agenlu.hc', 'agendasalud.hc'];
const VERSION = '1.0';

// Ids de pacientes dentro del alcance del usuario.
async function pacienteIdsEnAlcance(clinicaId, esAdmin, idProfesional) {
    if (esAdmin) {
        const { data, error } = await supabase
            .from('paciente')
            .select('id, persona:id_persona!inner ( clinica_id )')
            .eq('persona.clinica_id', clinicaId);
        if (error) throw error;
        return (data || []).map((p) => p.id);
    }
    const { data, error } = await supabase
        .from('registro_clinico')
        .select('id_paciente')
        .eq('clinica_id', clinicaId)
        .eq('id_profesional', idProfesional);
    if (error) throw error;
    return [...new Set((data || []).map((r) => r.id_paciente))];
}

// Arma el objeto de exportación (pacientes + registros + odontograma) para un set de ids.
async function construirExport(clinicaId, pacienteIds, meta) {
    let pacientes = [];
    let registrosPorPaciente = new Map();

    if (pacienteIds.length) {
        const { data: pacs, error: pErr } = await supabase
            .from('paciente')
            .select('id, obra_social, nro_afiliado, plan, persona:id_persona ( dni, nombre, apellido, fecha_nacimiento, sexo, telefono, email, direccion )')
            .in('id', pacienteIds);
        if (pErr) throw pErr;
        pacientes = pacs || [];

        const { data: regs, error: rErr } = await supabase
            .from('registro_clinico')
            .select(`id, id_paciente, fecha, profesional_nombre, area, sintomas, diagnostico, tratamiento, origen,
                registro_diente ( numero, condicion, cara, estado, notas ), ${SELECT_CODIFICACION}`)
            .in('id_paciente', pacienteIds)
            .eq('clinica_id', clinicaId)
            .order('fecha', { ascending: true });
        if (rErr) throw rErr;
        for (const r of regs || []) {
            if (!registrosPorPaciente.has(r.id_paciente)) registrosPorPaciente.set(r.id_paciente, []);
            registrosPorPaciente.get(r.id_paciente).push({
                origenId: r.id, // id del registro en ESTE sistema (para dedupe al re-importar)
                fecha: r.fecha,
                importado: !!r.origen, // vino de otro sistema: fecha y autor no los cargó Medilu
                profesional: r.profesional_nombre || null,
                area: r.area || null,
                sintomas: r.sintomas || null,
                diagnostico: r.diagnostico || null,
                tratamiento: r.tratamiento || null,
                odontograma: (r.registro_diente || []).map(serializarDiente),
                ...serializarCodificacion(r), // Fase K: diagnósticos CIE-10 y prácticas
            });
        }
    }

    const pacientesOut = pacientes.map((p) => {
        const per = Array.isArray(p.persona) ? p.persona[0] : p.persona;
        return {
            dni: per?.dni || null,
            nombre: per?.nombre || null,
            apellido: per?.apellido || null,
            fechaNacimiento: per?.fecha_nacimiento || null,
            sexo: per?.sexo || null,
            telefono: per?.telefono || null,
            email: per?.email || null,
            direccion: per?.direccion || null,
            obraSocial: p.obra_social || null,
            nroAfiliado: p.nro_afiliado || null,
            plan: p.plan || null,
            registros: registrosPorPaciente.get(p.id) || [],
        };
    });

    return {
        formato: FORMATO,
        version: VERSION,
        generadoEn: new Date().toISOString(),
        ...meta,
        totalPacientes: pacientesOut.length,
        pacientes: pacientesOut,
    };
}

// GET /hc/export — descarga la HC (JSON) del alcance del usuario.
exports.exportar = async (req, res) => {
    try {
        const { clinicaId, esAdmin, idRole } = req.session.user;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        const ids = await pacienteIdsEnAlcance(clinicaId, esAdmin, idRole);

        const { data: cli } = await supabase.from('clinica').select('nombre').eq('id', clinicaId).maybeSingle();
        const exportData = await construirExport(clinicaId, ids, {
            clinica: { nombre: cli?.nombre || null },
            alcance: esAdmin ? 'clinica' : 'propios',
        });

        await registrarAcceso(req, {
            accion: 'exportar_hc',
            detalle: { alcance: esAdmin ? 'clinica' : 'propios', pacientes: ids.length },
        });

        const fecha = new Date().toISOString().slice(0, 10);
        const slug = (cli?.nombre || 'clinica').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="hc-${slug}-${fecha}.json"`);
        return res.send(JSON.stringify(exportData, null, 2));
    } catch (err) {
        console.error('Error exportando HC:', err);
        return res.status(500).json({ error: 'Error al exportar las historias clínicas' });
    }
};

// GET /hc/pacientes — lista de pacientes en alcance (para la UI: cantidad + PDF por paciente).
exports.pacientesEnAlcance = async (req, res) => {
    try {
        const { clinicaId, esAdmin, idRole } = req.session.user;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        const ids = await pacienteIdsEnAlcance(clinicaId, esAdmin, idRole);
        if (!ids.length) return res.json({ alcance: esAdmin ? 'clinica' : 'propios', pacientes: [] });

        const { data: pacs, error } = await supabase
            .from('paciente')
            .select('id, persona:id_persona ( dni, nombre, apellido ), registro_clinico ( count )')
            .in('id', ids);
        if (error) return res.status(400).json({ error: error.message });

        const pacientes = (pacs || []).map((p) => {
            const per = Array.isArray(p.persona) ? p.persona[0] : p.persona;
            const cnt = Array.isArray(p.registro_clinico) ? (p.registro_clinico[0]?.count ?? 0) : 0;
            return {
                dni: per?.dni || null,
                nombre: [per?.nombre, per?.apellido].filter(Boolean).join(' ') || null,
                registros: cnt,
            };
        });
        return res.json({ alcance: esAdmin ? 'clinica' : 'propios', pacientes });
    } catch (err) {
        console.error('Error listando pacientes en alcance:', err);
        return res.status(500).json({ error: 'Error al listar los pacientes' });
    }
};

// Normaliza fecha de nacimiento a 'YYYY-MM-DD' (acepta ISO o dd/mm/yyyy).
function normFechaNac(f) {
    if (!f) return null;
    const s = String(f);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
        const [, d, mo, y] = m;
        const yr = y.length === 2 ? `20${y}` : y;
        return `${yr}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return null;
}

// Fase K: columnas de cobertura para un paciente importado. La obra social se empareja
// por nombre con el catálogo visible para la clínica (global o propio); si no está, queda
// solo el texto (como antes).
function coberturaImportada(p, catalogo) {
    const texto = p.obraSocial ? String(p.obraSocial).trim() : '';
    const os = texto ? catalogo.get(texto.toLowerCase()) : null;
    return {
        obra_social: os ? os.nombre : (texto || null),
        id_obra_social: os ? os.id : null,
        nro_afiliado: p.nroAfiliado ? String(p.nroAfiliado).slice(0, 40) : null,
        plan: p.plan ? String(p.plan).slice(0, 60) : null,
    };
}

// Fase K: diagnósticos CIE-10 (solo códigos del catálogo) y prácticas (snapshot, sin
// vínculo al catálogo de la clínica ni a autorizaciones) de un registro importado.
async function importarCodificacion(idRegistro, r, cie10) {
    const dx = (Array.isArray(r.diagnosticos) ? r.diagnosticos : [])
        .filter((d) => d && cie10.has(String(d.codigo)))
        .slice(0, 10);
    if (dx.length) {
        const principal = (dx.find((d) => d.principal) || dx[0]).codigo;
        const vistos = new Set();
        const filas = [];
        for (const d of dx) {
            if (vistos.has(d.codigo)) continue;
            vistos.add(d.codigo);
            filas.push({
                id_registro: idRegistro,
                codigo: d.codigo,
                descripcion: cie10.get(d.codigo),
                principal: d.codigo === principal,
            });
        }
        const { error } = await supabase.from('registro_diagnostico').insert(filas);
        if (error) throw error;
    }
    const px = (Array.isArray(r.practicas) ? r.practicas : [])
        .filter((x) => x && x.codigo && x.descripcion)
        .slice(0, 30)
        .map((x) => ({
            id_registro: idRegistro,
            codigo: String(x.codigo).slice(0, 30),
            descripcion: String(x.descripcion).slice(0, 200),
            pieza: x.pieza ? String(x.pieza).slice(0, 40) : null,
            cantidad: Math.min(99, Math.max(1, Number(x.cantidad) || 1)),
        }));
    if (px.length) {
        const { error } = await supabase.from('registro_practica').insert(px);
        if (error) throw error;
    }
}

// POST /hc/import — importa una HC (JSON del mismo formato de export).
// Empareja pacientes por DNI dentro de la clínica; crea el paciente si no existe;
// deduplica registros por origen_id. Devuelve un resumen (no aborta todo por un error).
exports.importar = async (req, res) => {
    try {
        const { clinicaId } = req.session.user;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        const doc = req.body;
        if (!doc || !FORMATOS_ACEPTADOS.includes(doc.formato) || !Array.isArray(doc.pacientes)) {
            return res.status(400).json({ error: 'Archivo inválido: no es un export de HC de Medilu.' });
        }

        // Todo registro importado queda marcado como tal (`origen` siempre empieza con
        // 'import'): la fecha y el profesional vienen del archivo, no los registró Medilu,
        // y así se muestra en la HC y en los PDF (auditoría 2026-10-15, #9).
        const etiquetaOrigen = String(doc.origen || '').trim().slice(0, 60);
        const origen = etiquetaOrigen ? `import:${etiquetaOrigen}` : 'import';
        const ahora = Date.now();

        // Fase K: catálogos para emparejar obra social y diagnósticos.
        const [{ data: oss }, { data: cies }] = await Promise.all([
            supabase.from('obra_social').select('id, nombre, sigla')
                .or(`clinica_id.is.null,clinica_id.eq.${clinicaId}`).eq('activo', true),
            supabase.from('cie10').select('codigo, descripcion'),
        ]);
        const catalogoOS = new Map();
        for (const o of oss || []) {
            catalogoOS.set(o.nombre.toLowerCase(), o);
            if (o.sigla) catalogoOS.set(o.sigla.toLowerCase(), o);
        }
        const cie10 = new Map((cies || []).map((c) => [c.codigo, c.descripcion]));

        const resumen = {
            pacientesCreados: 0,
            pacientesExistentes: 0,
            registrosImportados: 0,
            registrosOmitidos: 0,
            errores: [],
        };

        for (const p of doc.pacientes) {
            const dni = p?.dni != null ? String(p.dni).trim() : '';
            if (!dni) { resumen.errores.push('Paciente sin DNI: se omitió.'); continue; }

            try {
                // 1. Resolver o crear el paciente por DNI dentro de la clínica.
                const { data: personaEx, error: persErr } = await supabase
                    .from('persona')
                    .select('id, id_auth, paciente ( id )')
                    .eq('clinica_id', clinicaId)
                    .eq('dni', dni)
                    .maybeSingle();
                if (persErr) throw persErr;

                let pacienteId;
                if (personaEx) {
                    const pac = Array.isArray(personaEx.paciente) ? personaEx.paciente[0] : personaEx.paciente;
                    if (pac?.id) {
                        pacienteId = pac.id;
                    } else {
                        // persona existe pero no es paciente: crear su fila paciente, solo si
                        // es del equipo o no tiene cuenta (auditoría 2026-10-15, #2).
                        if (!(await puedeSumarFicha(supabase, personaEx, clinicaId))) {
                            resumen.errores.push(`DNI ${dni}: ya hay una persona con ese DNI en la clínica que no es paciente ni del equipo; se omitió (escribinos a soporte).`);
                            continue;
                        }
                        const { data: nuevoPac, error: e } = await supabase
                            .from('paciente').insert({ id_persona: personaEx.id, ...coberturaImportada(p, catalogoOS) })
                            .select('id').single();
                        if (e) throw e;
                        pacienteId = nuevoPac.id;
                    }
                    resumen.pacientesExistentes++;
                } else {
                    const { data: nuevaPersona, error: e1 } = await supabase
                        .from('persona')
                        .insert({
                            id_auth: null, // sin cuenta (la columna tiene DEFAULT auth.uid())
                            clinica_id: clinicaId,
                            dni,
                            nombre: p.nombre || null,
                            apellido: p.apellido || null,
                            fecha_nacimiento: normFechaNac(p.fechaNacimiento),
                            sexo: p.sexo || null,
                            telefono: p.telefono || null,
                            email: p.email || null,
                            direccion: p.direccion || null,
                        })
                        .select('id').single();
                    if (e1) throw e1;
                    const { data: nuevoPac, error: e2 } = await supabase
                        .from('paciente').insert({ id_persona: nuevaPersona.id, ...coberturaImportada(p, catalogoOS) })
                        .select('id').single();
                    if (e2) throw e2;
                    pacienteId = nuevoPac.id;
                    resumen.pacientesCreados++;
                }

                // 2. Registros que ya se importaron antes (por origen_id) → dedupe.
                const { data: existentes } = await supabase
                    .from('registro_clinico')
                    .select('origen_id')
                    .eq('id_paciente', pacienteId)
                    .not('origen_id', 'is', null);
                const yaImportados = new Set((existentes || []).map((r) => r.origen_id));

                for (const r of Array.isArray(p.registros) ? p.registros : []) {
                    const origenId = r?.origenId != null ? String(r.origenId) : null;
                    if (origenId && yaImportados.has(origenId)) { resumen.registrosOmitidos++; continue; }

                    // Fecha del archivo: tiene que ser válida y no futura. Sin fecha, la del import.
                    let fecha = new Date(ahora).toISOString();
                    if (r?.fecha) {
                        const f = new Date(r.fecha);
                        if (Number.isNaN(f.getTime()) || f.getTime() > ahora) {
                            resumen.registrosOmitidos++;
                            resumen.errores.push(`DNI ${dni}: un registro tiene una fecha inválida o futura (${String(r.fecha).slice(0, 40)}); se omitió.`);
                            continue;
                        }
                        fecha = f.toISOString();
                    }

                    const { data: nuevoReg, error: rErr } = await supabase
                        .from('registro_clinico')
                        .insert({
                            id_paciente: pacienteId,
                            clinica_id: clinicaId,
                            id_profesional: null, // autoría externa; se conserva el nombre snapshot
                            profesional_nombre: r.profesional || null,
                            area: r.area || null,
                            fecha,
                            sintomas: r.sintomas || null,
                            diagnostico: r.diagnostico || null,
                            tratamiento: r.tratamiento || null,
                            origen,
                            origen_id: origenId,
                        })
                        .select('id').single();
                    if (rErr) {
                        // Colisión con el índice único parcial → ya existía: se cuenta como omitido.
                        if (rErr.code === '23505') { resumen.registrosOmitidos++; continue; }
                        throw rErr;
                    }

                    // Odontograma: acepta el formato nuevo (condicion/cara/estado) y el
                    // legacy (estado = sano/caries/tratado/falta) vía normalizarDiente.
                    const rows = filasParaRegistro(nuevoReg.id, r.odontograma);
                    if (rows.length) {
                        const { error: dErr } = await supabase.from('registro_diente').insert(rows);
                        if (dErr) throw dErr;
                    }
                    await importarCodificacion(nuevoReg.id, r, cie10);
                    if (origenId) yaImportados.add(origenId);
                    resumen.registrosImportados++;
                }
            } catch (ePac) {
                console.error('Error importando paciente', dni, ePac.message);
                resumen.errores.push(`DNI ${dni}: ${ePac.message}`);
            }
        }

        await registrarAcceso(req, {
            accion: 'importar_hc',
            detalle: {
                origen,
                pacientesCreados: resumen.pacientesCreados,
                pacientesExistentes: resumen.pacientesExistentes,
                registrosImportados: resumen.registrosImportados,
                errores: resumen.errores.length,
            },
        });

        return res.json({ message: 'Importación finalizada', resumen });
    } catch (err) {
        console.error('Error importando HC:', err);
        return res.status(500).json({ error: 'Error al importar las historias clínicas' });
    }
};
