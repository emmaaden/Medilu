// Panel de la plataforma (Fase L). Solo el equipo de Medilu
// (PLATAFORMA_ADMIN_EMAILS). Hasta integrar Mercado Pago, la activación y la
// renovación de los planes se hacen a mano desde acá.
//
// service_role: opera sobre TODAS las clínicas (no hay clínica activa que acotar).

const { supabase } = require('../config/supabaseClient');
const planes = require('../utils/planes');
const suscripcionMp = require('../utils/suscripcionMp');
const mp = require('../utils/mercadopago');
const { errorDb } = require('../utils/errores');
const vista_ = require('../utils/vista');

// GET /plataforma/clinicas — todas las clínicas con su suscripción y uso.
exports.listarClinicas = async (req, res) => {
    try {
        const [cRes, sRes, mRes] = await Promise.all([
            supabase.from('clinica').select('id, nombre, slug, activa, creada_en').order('creada_en'),
            supabase.from('suscripcion').select('*'),
            supabase.from('membresia').select('clinica_id, rol').eq('activo', true),
        ]);
        const errorDb = cRes.error || sRes.error || mRes.error;
        if (errorDb) throw errorDb;

        const subPorClinica = new Map((sRes.data || []).map((s) => [s.clinica_id, s]));
        const uso = new Map();
        for (const m of mRes.data || []) {
            const u = uso.get(m.clinica_id) || { profesionales: 0, recepcion: 0, auditores: 0 };
            if (planes.ROLES_PROFESIONAL.includes(m.rol)) u.profesionales++;
            else if (m.rol === 'recepcion') u.recepcion++;
            else if (m.rol === 'auditor') u.auditores++;
            uso.set(m.clinica_id, u);
        }

        const clinicas = (cRes.data || []).map((c) => {
            const s = subPorClinica.get(c.id) || null;
            return {
                id: c.id,
                nombre: c.nombre,
                slug: c.slug,
                creadaEn: c.creada_en,
                suscripcion: s && {
                    planId: s.plan_id,
                    estadoGuardado: s.estado,
                    estado: planes.calcularEstado(s),
                    ciclo: s.ciclo,
                    profesionalesExtra: s.profesionales_extra,
                    pruebaHasta: s.prueba_hasta,
                    periodoHasta: s.periodo_hasta,
                    notas: s.notas,
                    // Fase M: débito automático de Mercado Pago.
                    mpEstado: s.mp_estado,
                    mpPayerEmail: s.mp_payer_email,
                    monto: s.monto == null ? null : Number(s.monto),
                    proximoCobro: s.proximo_cobro,
                    // Fase M2: cambio de precio programado.
                    montoNuevo: s.monto_nuevo == null ? null : Number(s.monto_nuevo),
                    montoNuevoDesde: s.monto_nuevo_desde,
                    avisoPrecioEnviadoEn: s.aviso_precio_enviado_en,
                    // Fase X: descuento manual (null = ninguno).
                    descuentoPct: s.descuento_pct,
                    descuentoHasta: s.descuento_hasta,
                    descuentoVigente: planes.descuentoVigente(s),
                },
                uso: uso.get(c.id) || { profesionales: 0, recepcion: 0, auditores: 0 },
            };
        });

        const todos = await planes.getPlanes();
        return res.json({
            clinicas, planes: [...todos.values()], features: planes.FEATURES, pagoOnline: mp.configurado(),
        });
    } catch (err) {
        console.error('Error en plataforma/clinicas:', err);
        return res.status(500).json({ error: 'No se pudieron listar las clínicas.' });
    }
};

// null/'' → null (sin fecha); inválida → undefined (error); válida → ISO.
function fechaONull(v) {
    if (v === null || v === '') return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// PATCH /plataforma/clinicas/:id/suscripcion — activar, renovar o cambiar de plan.
exports.actualizarSuscripcion = async (req, res) => {
    try {
        const clinicaId = req.params.id;
        const { planId, estado, ciclo, profesionalesExtra, pruebaHasta, periodoHasta, notas, descuentoPct, descuentoHasta } = req.body;

        const { data: cli, error: cliErr } = await supabase
            .from('clinica').select('id').eq('id', clinicaId).maybeSingle();
        if (cliErr) return errorDb(res, cliErr);
        if (!cli) return res.status(404).json({ error: 'Clínica no encontrada.' });

        const patch = { actualizada_en: new Date().toISOString() };
        if (planId !== undefined) {
            const todos = await planes.getPlanes();
            if (!todos.has(planId)) return res.status(400).json({ error: 'Plan inexistente.' });
            patch.plan_id = planId;
        }
        if (estado !== undefined) patch.estado = estado;
        if (ciclo !== undefined) patch.ciclo = ciclo;
        if (profesionalesExtra !== undefined) patch.profesionales_extra = profesionalesExtra;
        if (notas !== undefined) patch.notas = notas || null;
        // Fase X: descuento manual. null / 0 = sin descuento.
        if (descuentoPct !== undefined) {
            const pct = descuentoPct === null || descuentoPct === '' ? 0 : Number(descuentoPct);
            if (!Number.isInteger(pct) || pct < 0 || pct > 99) {
                return res.status(400).json({ error: 'El descuento tiene que ser un porcentaje entero entre 1 y 99.' });
            }
            patch.descuento_pct = pct || null;
            if (!pct) patch.descuento_hasta = null;
        }
        const fechas = [['pruebaHasta', 'prueba_hasta', pruebaHasta], ['periodoHasta', 'periodo_hasta', periodoHasta]];
        if (patch.descuento_pct) fechas.push(['descuentoHasta', 'descuento_hasta', descuentoHasta]);
        for (const [campo, col, valor] of fechas) {
            if (valor === undefined) continue;
            const f = fechaONull(valor);
            if (f === undefined) return res.status(400).json({ error: `Fecha inválida en ${campo}.` });
            patch[col] = f;
        }

        const { data: actual, error: aErr } = await supabase
            .from('suscripcion').select('clinica_id').eq('clinica_id', clinicaId).maybeSingle();
        if (aErr) return errorDb(res, aErr);

        // Una clínica sin suscripción (legacy) la obtiene acá.
        const q = actual
            ? supabase.from('suscripcion').update(patch).eq('clinica_id', clinicaId)
            : supabase.from('suscripcion').insert({ clinica_id: clinicaId, plan_id: planes.PLAN_PRUEBA, ...patch });
        const { data, error } = await q.select('*').single();
        if (error) return errorDb(res, error);

        planes.invalidar(clinicaId);

        // Con débito de Mercado Pago, el descuento se lleva al monto que se cobra.
        let descuento = null;
        if ((descuentoPct !== undefined || descuentoHasta !== undefined) && mp.configurado()) {
            try {
                descuento = await suscripcionMp.ajustarDescuento(clinicaId);
            } catch (e) {
                console.error('Error ajustando el descuento en MP:', e);
                return res.status(502).json({
                    error: 'Se guardó el descuento, pero no se pudo cambiar el monto en Mercado Pago. Probá de nuevo.',
                });
            }
        }
        return res.json({ message: 'Suscripción actualizada', estado: planes.calcularEstado(data), descuento });
    } catch (err) {
        console.error('Error en plataforma/suscripcion:', err);
        return res.status(500).json({ error: 'No se pudo actualizar la suscripción.' });
    }
};

// PATCH /plataforma/planes/:id — precios, asientos y features de un plan.
exports.actualizarPlan = async (req, res) => {
    try {
        const b = req.body;
        if (b.features) {
            const invalidas = b.features.filter((f) => !planes.FEATURES[f]);
            if (invalidas.length) return res.status(400).json({ error: `Funciones desconocidas: ${invalidas.join(', ')}` });
        }
        const columnas = {
            nombre: 'nombre', descripcion: 'descripcion', precioMensual: 'precio_mensual',
            precioAnual: 'precio_anual', profesionalesIncluidos: 'profesionales_incluidos',
            precioProfesionalExtra: 'precio_profesional_extra', maxRecepcion: 'max_recepcion',
            features: 'features', destacado: 'destacado', activo: 'activo',
        };
        const patch = { actualizado_en: new Date().toISOString() };
        for (const [k, col] of Object.entries(columnas)) if (b[k] !== undefined) patch[col] = b[k];

        const { data, error } = await supabase
            .from('plan').update(patch).eq('id', req.params.id).select('id').maybeSingle();
        if (error) return errorDb(res, error);
        if (!data) return res.status(404).json({ error: 'Plan no encontrado.' });

        planes.invalidar();
        return res.json({ message: 'Plan actualizado' });
    } catch (err) {
        console.error('Error en plataforma/planes:', err);
        return res.status(500).json({ error: 'No se pudo actualizar el plan.' });
    }
};

// POST /plataforma/clinicas/:id/sincronizar — Fase M: vuelve a leer de Mercado Pago el
// débito y los cobros de la clínica (p. ej. si un webhook no llegó).
exports.sincronizarMp = async (req, res) => {
    try {
        if (!mp.configurado()) return res.status(503).json({ error: 'Mercado Pago no está configurado (MP_ACCESS_TOKEN).' });
        await suscripcionMp.sincronizarClinica(req.params.id);
        return res.json({ message: 'Sincronizado con Mercado Pago' });
    } catch (err) {
        console.error('Error en plataforma/sincronizar:', err);
        return res.status(502).json({ error: 'No se pudo sincronizar con Mercado Pago.' });
    }
};

// POST /plataforma/clinicas/:id/cancelar-debito — Fase M: baja pedida por fuera del
// panel (Botón de baja sin sesión, email, WhatsApp). Corta los débitos siguientes; el
// plan sigue hasta el fin del período pago.
exports.cancelarDebito = async (req, res) => {
    try {
        if (!mp.configurado()) return res.status(503).json({ error: 'Mercado Pago no está configurado (MP_ACCESS_TOKEN).' });
        const r = await suscripcionMp.cancelarRenovacion(req.params.id);
        return res.json({ message: 'Débito cancelado', ...r });
    } catch (err) {
        if (err instanceof suscripcionMp.ErrorNegocio) return res.status(err.status).json({ error: err.message });
        console.error('Error en plataforma/cancelar-debito:', err);
        return res.status(502).json({ error: 'No se pudo cancelar el débito en Mercado Pago.' });
    }
};

// POST /plataforma/planes/:id/aplicar-precios — Fase M2: programa el precio actual del
// plan para los débitos vigentes que cobran otro monto, y avisa a cada clínica. Rige
// `dias` días después del aviso (mínimo 30).
exports.aplicarPrecios = async (req, res) => {
    try {
        const r = await suscripcionMp.programarActualizacionPrecios(req.params.id, req.body.dias);
        return res.json(r);
    } catch (err) {
        if (err instanceof suscripcionMp.ErrorNegocio) return res.status(err.status).json({ error: err.message });
        console.error('Error en plataforma/aplicar-precios:', err);
        return res.status(500).json({ error: 'No se pudieron programar los nuevos precios.' });
    }
};

// ---------------------------------------------------------------------------
// "Ver como" (Fase Z): ver el sistema como otro rol/especialidad (utils/vista).
// ---------------------------------------------------------------------------

// POST /plataforma/vista { rol, especialidad?, pacienteId?, alcanceIdObraSocial? }
exports.entrarVista = async (req, res) => {
    try {
        const vista = await vista_.entrarEnVista(req, req.body);
        return res.json({ vista });
    } catch (err) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        console.error('Error en plataforma/vista:', err);
        return res.status(500).json({ error: 'No se pudo cambiar la vista.' });
    }
};

// DELETE /plataforma/vista: vuelve a la cuenta real.
exports.salirVista = (req, res) => {
    vista_.salirDeVista(req);
    return res.json({ ok: true });
};

// GET /plataforma/vista/pacientes?q= — fichas de la clínica activa (real) para elegir
// a quién ver en la vista de paciente.
exports.pacientesVista = async (req, res) => {
    try {
        const clinicaId = vista_.usuarioReal(req).clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'Elegí una clínica primero.' });
        let query = supabase
            .from('persona')
            .select('nombre, apellido, dni, fecha_nacimiento, paciente!inner(id)')
            .eq('clinica_id', clinicaId);
        const palabras = String(req.query.q || '')
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().split(/\s+/)
            .map((p) => p.replace(/[^a-z0-9]/g, ''))
            .filter(Boolean).slice(0, 4);
        for (const p of palabras) {
            query = query.or(`nombre.ilike.%${p}%,apellido.ilike.%${p}%,dni.ilike.%${p}%`);
        }
        const { data, error } = await query
            .order('apellido', { ascending: true, nullsFirst: false })
            .limit(20);
        if (error) throw error;
        return res.json({
            pacientes: (data || []).map((p) => ({
                pacienteId: (Array.isArray(p.paciente) ? p.paciente[0] : p.paciente).id,
                nombre: [p.nombre, p.apellido].filter(Boolean).join(' '),
                dni: p.dni,
                fechaNacimiento: p.fecha_nacimiento,
            })),
        });
    } catch (err) {
        console.error('Error en plataforma/vista/pacientes:', err);
        return res.status(500).json({ error: 'No se pudieron cargar los pacientes.' });
    }
};
