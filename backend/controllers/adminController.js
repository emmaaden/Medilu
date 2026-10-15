// Panel de administración de la clínica (Fase B).
// Solo el ADMIN de la clínica activa (requireClinicaAdmin) puede operar acá.
//
// Se usa el cliente service_role acotado SIEMPRE por `req.session.user.clinicaId`
// (la clínica activa, derivada del servidor). Motivo: el listado de miembros necesita
// datos de personas cuya clínica de ORIGEN puede ser otra (un profesional multi-clínica),
// y la RLS por clínica activa no expone esas filas. La seguridad la dan el guard de admin
// + el scoping explícito por la clínica de la sesión. La RLS de `membresia` queda como
// respaldo para el camino por-JWT.

const { supabase } = require('../config/supabaseClient');
const { resolverObraSocial } = require('../utils/cobertura');
const planes = require('../utils/planes');
const { invalidarMembresias } = require('../middleware/sesionVigente');

// GET /admin/miembros — profesionales/recepción/auditores/admins de la clínica activa.
exports.listarMiembros = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        const personaIdActual = req.session.user.personaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        const { data, error } = await supabase
            .from('membresia')
            .select(`
                id, rol, activo, creada_en, id_persona, alcance_obra_social, alcance_id_obra_social,
                os:alcance_id_obra_social ( nombre ),
                persona:id_persona ( nombre, apellido, email, dni,
                                      profesional ( matricula ) )
            `)
            .eq('clinica_id', clinicaId)
            .order('creada_en', { ascending: true });
        if (error) return res.status(400).json({ error: error.message });

        const miembros = (data || []).map((m) => {
            // PostgREST puede devolver el embed 1:1 como objeto o como array.
            const profRaw = m.persona?.profesional;
            const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;
            return {
                id: m.id,
                personaId: m.id_persona,
                nombre: m.persona?.nombre ?? null,
                apellido: m.persona?.apellido ?? null,
                email: m.persona?.email ?? null,
                dni: m.persona?.dni ?? null,
                matricula: prof?.matricula ?? null,
                rol: m.rol,
                alcanceObraSocial: (Array.isArray(m.os) ? m.os[0] : m.os)?.nombre ?? m.alcance_obra_social ?? null,
                alcanceIdObraSocial: m.alcance_id_obra_social ?? null,
                activo: m.activo,
                esYo: m.id_persona === personaIdActual,
            };
        });

        return res.json({ miembros });
    } catch (err) {
        console.error('Error listando miembros:', err);
        return res.status(500).json({ error: 'Error al listar los miembros' });
    }
};

// GET /admin/clinica — Fase N: datos públicos de la clínica activa.
exports.obtenerClinica = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        const { data, error } = await supabase
            .from('clinica')
            .select('nombre, slug, direccion, descripcion, turnos_online')
            .eq('id', clinicaId)
            .maybeSingle();
        if (error) return res.status(400).json({ error: error.message });
        if (!data) return res.status(404).json({ error: 'Clínica no encontrada.' });

        return res.json({ clinica: data });
    } catch (err) {
        console.error('Error obteniendo la clínica:', err);
        return res.status(500).json({ error: 'Error al obtener la clínica' });
    }
};

// PUT /admin/clinica — Fase N: dirección y descripción (opcional) que ve el paciente.
exports.actualizarClinica = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        // validate() no muta el body: el trim se repite acá.
        const direccion = String(req.body.direccion ?? '').trim();
        const descripcion = String(req.body.descripcion ?? '').trim();
        const { data, error } = await supabase
            .from('clinica')
            .update({ direccion: direccion || null, descripcion: descripcion || null })
            .eq('id', clinicaId)
            .select('nombre, slug, direccion, descripcion, turnos_online')
            .single();
        if (error) return res.status(400).json({ error: error.message });

        return res.json({ message: 'Clínica actualizada', clinica: data });
    } catch (err) {
        console.error('Error actualizando la clínica:', err);
        return res.status(500).json({ error: 'Error al actualizar la clínica' });
    }
};

// PUT /admin/clinica/turnos-online — Fase N2: aparecer (o no) en la reserva pública.
// Apagado, la clínica sigue usando el sistema y el staff carga los turnos desde el panel.
exports.actualizarTurnosOnline = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        const { data, error } = await supabase
            .from('clinica')
            .update({ turnos_online: req.body.activo === true })
            .eq('id', clinicaId)
            .select('nombre, slug, direccion, descripcion, turnos_online')
            .single();
        if (error) return res.status(400).json({ error: error.message });

        return res.json({ message: 'Turnos online actualizados', clinica: data });
    } catch (err) {
        console.error('Error actualizando los turnos online:', err);
        return res.status(500).json({ error: 'Error al actualizar los turnos online' });
    }
};

// PATCH /admin/miembros/:id — alta/baja (activo) y/o cambio de rol de un miembro.
// Salvaguarda: la clínica no puede quedar SIN ningún admin activo.
exports.actualizarMiembro = async (req, res) => {
    try {
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'No tenés una clínica activa.' });

        const membresiaId = Number(req.params.id);
        if (!Number.isInteger(membresiaId)) return res.status(400).json({ error: 'Miembro inválido.' });

        const { activo, rol, alcanceObraSocial, alcanceIdObraSocial } = req.body;
        if (activo === undefined && rol === undefined && alcanceObraSocial === undefined
            && alcanceIdObraSocial === undefined) {
            return res.status(400).json({ error: 'Nada para actualizar.' });
        }
        if (rol !== undefined && !['admin', 'profesional', 'recepcion', 'auditor'].includes(rol)) {
            return res.status(400).json({ error: 'Rol inválido.' });
        }

        // La membresía debe pertenecer a la clínica activa.
        const { data: target, error: tErr } = await supabase
            .from('membresia')
            .select('id, id_persona, rol, activo, clinica_id')
            .eq('id', membresiaId)
            .eq('clinica_id', clinicaId)
            .maybeSingle();
        if (tErr) return res.status(400).json({ error: tErr.message });
        if (!target) return res.status(404).json({ error: 'Miembro no encontrado en esta clínica.' });

        // Fase L: reactivar a alguien, o pasarlo a un rol que ocupa otro tipo de lugar
        // (p. ej. recepción → profesional), tiene que entrar en el plan.
        const rolNuevo = rol !== undefined ? rol : target.rol;
        const activoNuevo = activo !== undefined ? activo === true : target.activo;
        const tipoLugar = (r) => (planes.ROLES_PROFESIONAL.includes(r) ? 'profesional' : r);
        const ocupaLugarNuevo = activoNuevo && (!target.activo || tipoLugar(rolNuevo) !== tipoLugar(target.rol));
        if (ocupaLugarNuevo) {
            const bloqueo = await planes.verificarAlta(clinicaId, rolNuevo);
            if (bloqueo) return res.status(bloqueo.status).json(bloqueo);
        }

        // ¿La operación deja a este miembro sin ser admin activo?
        const quedaAdminActivo =
            (rol !== undefined ? rol === 'admin' : target.rol === 'admin') &&
            (activo !== undefined ? activo === true : target.activo === true);
        const eraAdminActivo = target.rol === 'admin' && target.activo === true;

        // Si estaba aportando un admin activo y deja de hacerlo, exigir que quede otro.
        if (eraAdminActivo && !quedaAdminActivo) {
            const { count, error: cErr } = await supabase
                .from('membresia')
                .select('id', { count: 'exact', head: true })
                .eq('clinica_id', clinicaId)
                .eq('rol', 'admin')
                .eq('activo', true)
                .neq('id', membresiaId);
            if (cErr) return res.status(400).json({ error: cErr.message });
            if (!count || count === 0) {
                return res.status(409).json({
                    error: 'No podés dejar la clínica sin ningún administrador activo.',
                });
            }
        }

        const patch = {};
        if (activo !== undefined) patch.activo = !!activo;
        if (rol !== undefined) patch.rol = rol;
        // Fase J: el alcance solo aplica al auditor; al dejar de serlo se limpia.
        const rolFinal = rol !== undefined ? rol : target.rol;
        if (rolFinal !== 'auditor') {
            if (rol !== undefined) {
                patch.alcance_obra_social = null;
                patch.alcance_id_obra_social = null;
            }
        } else if (alcanceIdObraSocial !== undefined) {
            // Fase K: alcance por obra social del catálogo (null = interno).
            if (alcanceIdObraSocial === null || alcanceIdObraSocial === '') {
                patch.alcance_id_obra_social = null;
                patch.alcance_obra_social = null;
            } else {
                const os = await resolverObraSocial(alcanceIdObraSocial, clinicaId);
                if (!os) return res.status(400).json({ error: 'La obra social elegida no es válida.' });
                patch.alcance_id_obra_social = os.id;
                patch.alcance_obra_social = os.nombre;
            }
        } else if (alcanceObraSocial !== undefined) {
            patch.alcance_obra_social = (alcanceObraSocial || '').trim() || null;
            patch.alcance_id_obra_social = null;
        }
        if (Object.keys(patch).length === 0) {
            return res.status(400).json({ error: 'Nada para actualizar.' });
        }

        const { data: updated, error: uErr } = await supabase
            .from('membresia')
            .update(patch)
            .eq('id', membresiaId)
            .eq('clinica_id', clinicaId)
            .select('id, rol, activo, alcance_obra_social, alcance_id_obra_social')
            .single();
        if (uErr) return res.status(400).json({ error: uErr.message });
        // La sesión de esa persona toma el cambio en su próxima request (#7).
        invalidarMembresias(target.id_persona);

        return res.json({ message: 'Miembro actualizado', miembro: updated });
    } catch (err) {
        console.error('Error actualizando miembro:', err);
        return res.status(500).json({ error: 'Error al actualizar el miembro' });
    }
};
