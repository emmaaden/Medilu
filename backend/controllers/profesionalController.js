// Datos y ajustes del profesional autenticado.
// Fase 2c: opera con el cliente por-JWT (RLS por clinica_id a nivel Postgres).
// La identidad se toma de la sesión (id = auth.users; idRole = profesional.id).
const { getUserSupabase } = require('../middleware/userSupabase');
const { errorDb, registrarError } = require('../utils/errores');

const ERR_SESION = { error: 'Tu sesión expiró. Iniciá sesión de nuevo.' };

// Datos del profesional
exports.getDatosProf = async (req, res) => {
    try {
        // Fase O: la cuenta puede tener además fichas de paciente (otras personas con el
        // mismo id_auth): se usa la persona de staff de la sesión.
        const personaId = req.session.user.personaId;

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { data, error } = await db
            .from("persona")
            .select(`
                nombre,
                apellido,
                dni,
                profesional (
                    direccion,
                    telefono,
                    matricula,
                    descripcion,
                    precio,
                    turnos_online
                )
            `)
            .eq("id", personaId)
            .maybeSingle();

        if (error) {
            console.error("Error obteniendo el profesional:", error);
            return errorDb(res, error);
        }

        if (!data) {
            return res.status(404).json({ error: "Profesional no encontrado" });
        }
        return res.json({
            nombre: data.nombre,
            apellido: data.apellido,
            dni: data.dni,
            descripcion: data.profesional[0].descripcion,
            precio: data.profesional[0].precio,
            direccion: data.profesional[0].direccion,
            turnos_online: data.profesional[0].turnos_online !== false,
        });
    } catch (err) {
        console.error("Error interno del servidor:", err);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
};

// Especialidad Profesioanl
exports.getEspProf = async (req, res) => {
    try {
        const user_id = req.session.user.idRole; // profesional.id

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { data, error } = await db
            .from('especialidad_profesional')
            .select(`
                id_profesional,
                id_especialidad (
                    nombre
                )
            `)
            .eq('id_profesional', user_id);
        if (error) {
            console.error("Error obteniendo el profesional:", error)
            return errorDb(res, error);
        }

        if (!data) {
            return res.status(404).json({ error: "Especialidad del profesional no encontrada" })
        }

        return res.json({ especialidad_profesional: data[0]?.id_especialidad.nombre })
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el área' });
    }
};

// Descripcion
exports.saveDesc = async (req, res) => {
    try {
        const { descripcion } = req.body;
        const user_id = req.session.user.idRole; // profesional.id

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { data, error } = await db
            .from("profesional")
            .update({ descripcion: descripcion })
            .eq("id", user_id)
            .select();

        if (error) {
            return errorDb(res, error);
        }
        if (!data) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.status(200).json({ message: 'Descripcion guardada exitosamente', descripcion });
    } catch (error) {
        registrarError(error, 'Error al guardar la Descripcion');
        res.status(500).json({ error: 'Error al guardar la Descripcion' });
    }
};

// Fase N3: aparecer (o no) en la reserva pública de turnos.
// Apagado, el staff sigue pudiendo cargarle turnos desde el panel.
exports.saveTurnosOnline = async (req, res) => {
    try {
        const activo = req.body.activo === true;
        const user_id = req.session.user.idRole; // profesional.id

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { data, error } = await db
            .from("profesional")
            .update({ turnos_online: activo })
            .eq("id", user_id)
            .select("turnos_online");

        if (error) {
            return errorDb(res, error);
        }
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'Profesional no encontrado' });
        }

        res.status(200).json({ message: 'Turnos online actualizados', turnos_online: data[0].turnos_online });
    } catch (error) {
        registrarError(error, 'Error al actualizar los turnos online');
        res.status(500).json({ error: 'Error al actualizar los turnos online' });
    }
};

// Precio
exports.savePrecio = async (req, res) => {
    try {
        const { precio } = req.body;
        const user_id = req.session.user.idRole; // profesional.id

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { data, error } = await db
            .from("profesional")
            .update({ precio: precio })
            .eq("id", user_id)
            .select();

        if (error) {
            return errorDb(res, error);
        }
        if (!data) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.status(200).json({ message: 'Precio guardado exitosamente', precio });
    } catch (error) {
        registrarError(error, 'Error al guardar el Precio');
        res.status(500).json({ error: 'Error al guardar el Precio' });
    }
};

// Direccion
exports.saveDirec = async (req, res) => {
    try {
        const { direccion } = req.body;
        const user_id = req.session.user.idRole; // profesional.id

        const db = await getUserSupabase(req);
        if (!db) return res.status(401).json(ERR_SESION);

        const { data, error } = await db
            .from("profesional")
            .update({ direccion: direccion })
            .eq("id", user_id)
            .select();

        if (error) {
            return errorDb(res, error);
        }
        if (!data) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.status(200).json({ message: 'Direccion guardada exitosamente', direccion });
    } catch (error) {
        registrarError(error, 'Error al guardar la Direccion');
        res.status(500).json({ error: 'Error al guardar la Direccion' });
    }
};

