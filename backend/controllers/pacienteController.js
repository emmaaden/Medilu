// Historia clínica sobre Supabase (Fase 1).
//
// SEGURIDAD: la identidad del profesional SIEMPRE se toma de la sesión, nunca del body.
//   - req.session.user.id     -> persona.id_auth (auth.users)
//   - req.session.user.idRole -> profesional.id
// El nombre del profesional y su área se derivan de la sesión y se guardan como
// snapshot en cada registro_clinico. El body NO puede sobrescribir quién firma el registro.
//
// Las rutas que usan este controller pasan por requireRole('profesional') (ver routes/pacienteRoutes.js).
//
// Fase 2c: este controller opera "como el usuario" (anon key + JWT), de modo que la
// RLS por clinica_id se aplica a nivel Postgres. El cliente se obtiene por-request con
// getUserSupabase(req); el scoping por clinica_id en la app se mantiene como defensa en
// profundidad (y para dar errores claros), pero ya no es lo único que aísla los datos.

const { getUserSupabase } = require('../middleware/userSupabase');
const { filasParaRegistro, serializarDiente } = require('../utils/odontograma');
const { registrarAcceso, nombreActor } = require('../utils/bitacora');
const { columnasCobertura } = require('../utils/cobertura');
const { supabase } = require('../config/supabaseClient');
const {
    enSegundoPlano,
    crearCuentaPaciente,
    buscarAutoregistrado,
    avisarVinculacion,
    nombreClinica,
    obtenerCodigoVinculacion,
} = require('../utils/cuentaPaciente');
const { puedeSumarFicha } = require('../utils/membresias');
const {
    prepararCodificacion,
    insertarCodificacion,
    serializarCodificacion,
    SELECT_CODIFICACION,
} = require('../utils/codificacion');
const { parseFechaNacimiento, calcEdad } = require('../utils/fechaNacimiento');

// Mensaje uniforme cuando la sesión no tiene (o perdió) el token de Supabase.
const ERR_SESION = { status: 401, body: { error: 'Tu sesión expiró. Iniciá sesión de nuevo.' } };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Devuelve un ISO válido para timestamptz o null (para dejar el default now()).
function toIso(v) {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
}


// Fecha + hora legible para la historia clínica.
function fmtFechaHora(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
    });
}

// Fecha (sin hora) legible.
function fmtFecha(iso) {
    if (!iso) return '';
    const s = String(iso);
    // Fecha pura 'YYYY-MM-DD' (ej: fecha_nacimiento): reformatear SIN conversión de
    // zona horaria, para no correr el día. Los timestamptz (con 'T') sí usan tz.
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
}

// Datos del profesional autenticado (nombre + área) tomados de la sesión.
// Son datos del propio profesional (ids de la sesión), así que se leen con service_role:
// la RLS de especialidad_profesional recorre todos los profesionales y tardaba ~800 ms.
// El nombre sale de nombreActor (persona de staff, cacheado en la sesión).
async function getProfContext(req) {
    const idRole = req.session.user.idRole; // profesional.id

    const [nombre, area] = await Promise.all([
        nombreActor(req),
        idRole
            ? supabase
                .from('especialidad_profesional')
                .select('id_especialidad ( nombre )')
                .eq('id_profesional', idRole)
                .limit(1)
                .then(({ data: esp }) => (esp && esp[0] && esp[0].id_especialidad ? esp[0].id_especialidad.nombre : ''))
            : '',
    ]);

    return { idProfesional: idRole || null, nombre: nombre || '', area, clinicaId: req.session.user.clinicaId || null };
}

// Inserta el registro clínico + el estado del odontograma (si viene) + la
// codificación ya validada (`cod`, de prepararCodificacion).
async function insertRegistro(db, idPaciente, prof, body, cod) {
    const { sintomas, diagnostico, tratamiento, fecha, dientes, area } = body;

    const registro = {
        id_paciente: idPaciente,
        id_profesional: prof.idProfesional,
        clinica_id: prof.clinicaId,
        profesional_nombre: prof.nombre || null,
        area: prof.area || area || null,
        sintomas: sintomas || null,
        diagnostico: diagnostico || null,
        tratamiento: tratamiento || null,
    };
    const fechaIso = toIso(fecha);
    if (fechaIso) registro.fecha = fechaIso;

    const { data: reg, error: regError } = await db
        .from('registro_clinico')
        .insert(registro)
        .select('id')
        .single();
    if (regError) throw regError;

    const rows = filasParaRegistro(reg.id, dientes);
    if (rows.length > 0) {
        const { error: dienteError } = await db.from('registro_diente').insert(rows);
        if (dienteError) throw dienteError;
    }

    if (cod) await insertarCodificacion(db, reg.id, cod);

    return reg.id;
}

// Fase V: paciente cargado sin email (no tiene cuenta): se le genera el código de
// vinculación para que el profesional se lo dé. No rompe el alta si falla (el
// código se puede pedir después desde la ficha).
async function conCodigoSiFaltaEmail(req, personaId, cuenta) {
    if (cuenta.estado !== 'sin_email') return cuenta;
    try {
        const vinculo = await obtenerCodigoVinculacion({ personaId, creadoPor: req.session.user.personaId || null });
        return { ...cuenta, ...vinculo };
    } catch (e) {
        console.error('No se pudo generar el código de vinculación:', e.message || e);
        return cuenta;
    }
}

// ---------------------------------------------------------------------------
// Alta de paciente + primer registro clínico (rol profesional).
// ---------------------------------------------------------------------------
exports.regisPacient = async (req, res) => {
    try {
        const { fullName, dni, telefono, email, sexo, direccion, fechaNacimiento, obraSocial } = req.body;

        if (!dni || !fullName) {
            return res.status(400).json({ error: 'Nombre y DNI son obligatorios.' });
        }
        const fnac = parseFechaNacimiento(fechaNacimiento);
        if (!fnac.ok) return res.status(400).json({ error: fnac.error });

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) {
            return res.status(400).json({ error: 'Tu usuario no tiene una clínica asignada.' });
        }

        // ¿El paciente ya se había registrado solo en Medilu (sin clínica)? Se busca ya,
        // en paralelo, pero solo se usa si no hay nadie con ese DNI en la clínica (abajo).
        const autoP = email ? buscarAutoregistrado(dni, email) : Promise.resolve(null);
        autoP.catch(() => {}); // si no se llega a usar, que su error no quede sin manejar

        // Las verificaciones no dependen entre sí: van en paralelo (cada una es un viaje
        // a Supabase). Se responden en el mismo orden que antes.
        const [prof, cob, cod, { data: existente }] = await Promise.all([
            getProfContext(req),
            // Fase K: cobertura y codificación se validan ANTES de crear nada.
            columnasCobertura(req.body, clinicaId),
            prepararCodificacion({
                clinicaId,
                idPaciente: null, // paciente nuevo: no puede tener autorizaciones todavía
                diagnosticos: req.body.diagnosticos,
                practicas: req.body.practicas,
            }),
            // ¿Ya existe una persona con ese DNI EN ESTA CLÍNICA?
            db
                .from('persona')
                .select('id, id_auth, nombre, apellido, email, paciente(id)')
                .eq('dni', dni)
                .eq('clinica_id', clinicaId)
                .maybeSingle(),
        ]);
        if (!cob.ok) return res.status(400).json({ error: cob.error });
        if (!cod.ok) return res.status(400).json({ error: cod.error });
        // Fase O: es alguien del equipo de la clínica (persona sin ficha de paciente):
        // se le agrega la ficha a esa misma persona en vez de duplicarla.
        if (existente && !(existente.paciente && existente.paciente[0])) {
            // Solo si es del equipo o no tiene cuenta (auditoría 2026-10-15, #2): si no,
            // la HC del paciente quedaría atada a la cuenta de otra persona.
            if (!(await puedeSumarFicha(supabase, existente, prof.clinicaId))) {
                return res.status(409).json({
                    error: 'Ya hay una persona con ese DNI en tu clínica que no es paciente ni del equipo. Escribinos a soporte para revisarlo.',
                    code: 'DNI_EN_REVISION',
                });
            }
            return await sumarPersonaDeLaClinica(req, res, db, prof, cob, cod, existente);
        }
        if (existente) {
            return res.status(409).json({
                error: 'Ya existe un paciente con ese DNI en tu clínica.',
                code: 'PACIENTE_EXISTENTE',
            });
        }

        // Ya se había registrado solo: si el email coincide con el de su cuenta, se suma
        // a la clínica en vez de duplicarlo: así ve en su cuenta lo que le cargan.
        // DNI + email es lo que prueba que es él.
        const auto = await autoP;
        if (auto && !auto.coincide) {
            return res.status(409).json({
                error: 'Este DNI ya tiene una cuenta de paciente en Medilu con otro email. Pedile al paciente el email con el que se registró.',
                code: 'DNI_CON_CUENTA',
            });
        }
        if (auto && auto.coincide) {
            return await sumarAutoregistrado(req, res, db, prof, cob, cod, auto.persona);
        }

        // 1. persona (asignada a la clínica del profesional)
        const { data: persona, error: personaError } = await db
            .from('persona')
            .insert({
                // Explícito: en la base, id_auth tiene DEFAULT auth.uid() y este insert corre
                // con el JWT del profesional, así que sin esto la ficha quedaría atada a SU
                // cuenta. La cuenta del paciente se crea/vincula después (crearCuentaPaciente).
                id_auth: null,
                dni,
                nombre: fullName,
                telefono: telefono || null,
                direccion: direccion || null,
                sexo: sexo || null,
                fecha_nacimiento: fnac.fecha,
                email: email || null,
                clinica_id: prof.clinicaId,
            })
            .select('id')
            .single();
        if (personaError) throw personaError;

        // 2. paciente (si falla, limpiamos la persona huérfana)
        const { data: paciente, error: pacienteError } = await db
            .from('paciente')
            // Sin obra social del catálogo se conserva el texto libre (compatibilidad).
            .insert({ id_persona: persona.id, obra_social: obraSocial || null, ...cob.cols })
            .select('id')
            .single();
        if (pacienteError) {
            await db.from('persona').delete().eq('id', persona.id);
            throw pacienteError;
        }

        // 3. primer registro clínico (+ odontograma)
        const idRegistro = await insertRegistro(db, paciente.id, prof, req.body, cod);

        // 4. Bitácora y, en paralelo, la cuenta de acceso (no rompe el alta si falla; el
        // email con los datos sale en segundo plano).
        const [, cuenta] = await Promise.all([
            registrarAcceso(req, {
                accion: 'registrar_paciente',
                idPaciente: paciente.id,
                idRegistro,
                paciente: { nombre: fullName, dni },
            }),
            crearCuentaPaciente({
                personaId: persona.id, email, nombre: fullName, clinicaId: prof.clinicaId, esperarMail: false,
            }).then((c) => conCodigoSiFaltaEmail(req, persona.id, c)),
        ]);

        return res.status(201).json({ message: 'Paciente registrado con éxito', id_paciente: paciente.id, cuenta });
    } catch (err) {
        console.error('Error en regis-pacient:', err);
        return res.status(500).json({ error: 'Error al registrar el paciente.' });
    }
};

// Fase O: la persona ya es de la clínica (alguien del equipo) pero no tiene ficha de
// paciente: se le crea la ficha y la primera consulta. Si tiene cuenta, la ve entrando
// con su perfil de paciente (se le avisa); si no, se le crea como a cualquier paciente.
async function sumarPersonaDeLaClinica(req, res, db, prof, cob, cod, persona) {
    const { obraSocial } = req.body;
    const { data: paciente, error: pacienteError } = await db
        .from('paciente')
        .insert({ id_persona: persona.id, obra_social: obraSocial || null, ...cob.cols })
        .select('id')
        .single();
    if (pacienteError) throw pacienteError;

    const idRegistro = await insertRegistro(db, paciente.id, prof, req.body, cod);
    const nombre = [persona.nombre, persona.apellido].filter(Boolean).join(' ');

    await registrarAcceso(req, {
        accion: 'registrar_paciente',
        idPaciente: paciente.id,
        idRegistro,
        paciente: { nombre, dni: req.body.dni },
    });

    let cuenta;
    if (persona.id_auth) {
        enSegundoPlano(async () => {
            const { data } = await supabase.auth.admin.getUserById(persona.id_auth);
            const email = data && data.user && data.user.email;
            if (email) {
                await avisarVinculacion({
                    email, nombre: persona.nombre, clinica: await nombreClinica(prof.clinicaId),
                });
            }
        }, 'el aviso de vinculación');
        cuenta = { estado: 'vinculada', mailEnCurso: true };
    } else {
        cuenta = await conCodigoSiFaltaEmail(req, persona.id, await crearCuentaPaciente({
            personaId: persona.id, email: req.body.email || persona.email, nombre, clinicaId: prof.clinicaId,
            esperarMail: false,
        }));
    }

    return res.status(201).json({ message: 'Paciente registrado con éxito', id_paciente: paciente.id, cuenta });
}

// Suma a la clínica a un paciente que ya tenía cuenta propia (se registró solo):
// se le asigna la clínica, se completan los datos que le faltaban (sin pisar los
// suyos) y se carga la primera consulta. Usa service_role porque la persona todavía
// no es de la clínica y la RLS no la deja ver.
async function sumarAutoregistrado(req, res, db, prof, cob, cod, persona) {
    const { telefono, email, sexo, direccion, fechaNacimiento, obraSocial } = req.body;
    const nuevos = {
        telefono: telefono || null,
        direccion: direccion || null,
        sexo: sexo || null,
        fecha_nacimiento: parseFechaNacimiento(fechaNacimiento).fecha, // ya validada en regisPacient
        email: String(email).trim().toLowerCase(),
    };
    const update = { clinica_id: prof.clinicaId };
    for (const [k, v] of Object.entries(nuevos)) if (v && !persona[k]) update[k] = v;

    const { data: upd, error: updErr } = await supabase
        .from('persona')
        .update(update)
        .eq('id', persona.id)
        .is('clinica_id', null)
        .select('id');
    if (updErr) throw updErr;
    if (!upd || upd.length === 0) {
        return res.status(409).json({ error: 'El paciente cambió mientras lo cargabas. Probá de nuevo.' });
    }

    // La cobertura que cargó el profesional solo se usa si el paciente no tenía una.
    const paciente = persona.paciente[0];
    if (!paciente.id_obra_social) {
        const cols = { ...cob.cols };
        if (cols.id_obra_social === undefined && obraSocial) cols.obra_social = obraSocial;
        if (Object.keys(cols).length) {
            const { error } = await supabase.from('paciente').update(cols).eq('id', paciente.id);
            if (error) throw error;
        }
    }

    const idRegistro = await insertRegistro(db, paciente.id, prof, req.body, cod);
    const nombre = [persona.nombre, persona.apellido].filter(Boolean).join(' ');

    await registrarAcceso(req, {
        accion: 'registrar_paciente',
        idPaciente: paciente.id,
        idRegistro,
        paciente: { nombre, dni: req.body.dni },
        detalle: { vinculado: true },
    });

    enSegundoPlano(async () => avisarVinculacion({
        email: nuevos.email, nombre: persona.nombre, clinica: await nombreClinica(prof.clinicaId),
    }), 'el aviso de vinculación');

    return res.status(201).json({
        message: 'Paciente registrado con éxito',
        id_paciente: paciente.id,
        cuenta: { estado: 'vinculada', mailEnCurso: true },
    });
}

// ---------------------------------------------------------------------------
// ¿Existe ya un paciente con ese DNI en la clínica? Lo usa el alta para ofrecer
// cargar sus datos en vez de duplicarlo. Devuelve solo el nombre (la ficha completa
// se pide después con get-data-pacient, que queda en la bitácora).
// ---------------------------------------------------------------------------
exports.existePaciente = async (req, res) => {
    try {
        const { dni } = req.body;
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'Tu usuario no tiene una clínica asignada.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const { data: persona, error } = await db
            .from('persona')
            .select('nombre, apellido, paciente(id)')
            .eq('dni', dni)
            .eq('clinica_id', clinicaId)
            .maybeSingle();
        if (error) throw error;

        const paciente = persona && persona.paciente && persona.paciente[0];
        if (!paciente) return res.json({ existe: false });
        return res.json({ existe: true, fullName: [persona.nombre, persona.apellido].filter(Boolean).join(' ') });
    } catch (err) {
        console.error('Error en existe-pacient:', err);
        return res.status(500).json({ error: 'No se pudo verificar el DNI.' });
    }
};

// ---------------------------------------------------------------------------
// Enviar los datos de acceso a un paciente de la clínica que todavía no tiene cuenta
// (cargado antes de que existiera esto, o si el mail no salió / el email estaba
// mal). Si viene `email`, se corrige en la ficha antes de crear la cuenta.
// ---------------------------------------------------------------------------
exports.enviarAcceso = async (req, res) => {
    try {
        const { dni } = req.body;
        const email = req.body.email ? String(req.body.email).trim().toLowerCase() : '';
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'Tu usuario no tiene una clínica asignada.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const { data: persona, error } = await db
            .from('persona')
            .select('id, id_auth, nombre, apellido, email, paciente(id)')
            .eq('dni', dni)
            .eq('clinica_id', clinicaId)
            .maybeSingle();
        if (error) throw error;
        if (!persona || !persona.paciente || !persona.paciente[0]) {
            return res.status(404).json({ error: 'Paciente no encontrado.' });
        }
        if (persona.id_auth) {
            return res.status(409).json({
                error: 'El paciente ya tiene cuenta. Si no recuerda la contraseña, puede recuperarla desde "¿Olvidaste tu contraseña?".',
            });
        }

        const destino = email || persona.email;
        if (!destino) return res.status(400).json({ error: 'Cargá el email del paciente.' });
        if (email && email !== persona.email) {
            const { error: updErr } = await db.from('persona').update({ email }).eq('id', persona.id);
            if (updErr) throw updErr;
        }

        const cuenta = await crearCuentaPaciente({
            personaId: persona.id,
            email: destino,
            nombre: [persona.nombre, persona.apellido].filter(Boolean).join(' '),
            clinicaId,
        });
        return res.json({ cuenta });
    } catch (err) {
        console.error('Error en enviar-acceso:', err);
        return res.status(500).json({ error: 'No se pudo enviar el acceso.' });
    }
};

// ---------------------------------------------------------------------------
// Fase V: código de vinculación de un paciente de la clínica que no tiene cuenta (se
// cargó sin email). Devuelve el vigente o, con `regenerar`, uno nuevo (el anterior
// deja de valer). El paciente lo carga en "Mi historia" ya registrado.
// ---------------------------------------------------------------------------
exports.codigoVinculacion = async (req, res) => {
    try {
        const { dni, regenerar } = req.body;
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'Tu usuario no tiene una clínica asignada.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const { data: persona, error } = await db
            .from('persona')
            .select('id, id_auth, nombre, apellido, dni, paciente(id)')
            .eq('dni', dni)
            .eq('clinica_id', clinicaId)
            .maybeSingle();
        if (error) throw error;
        if (!persona || !persona.paciente || !persona.paciente[0]) {
            return res.status(404).json({ error: 'Paciente no encontrado.' });
        }
        if (persona.id_auth) {
            return res.status(409).json({ error: 'El paciente ya tiene cuenta: ve su historia clínica entrando a Medilu.' });
        }

        const vinculo = await obtenerCodigoVinculacion({
            personaId: persona.id,
            creadoPor: req.session.user.personaId || null,
            regenerar: !!regenerar,
        });

        await registrarAcceso(req, {
            accion: 'codigo_vinculacion',
            idPaciente: persona.paciente[0].id,
            paciente: { nombre: [persona.nombre, persona.apellido].filter(Boolean).join(' '), dni: persona.dni },
            detalle: regenerar ? { regenerado: true } : null,
        });

        return res.json(vinculo);
    } catch (err) {
        console.error('Error en codigo-vinculacion:', err);
        return res.status(500).json({ error: 'No se pudo obtener el código de vinculación.' });
    }
};

// ---------------------------------------------------------------------------
// Nuevo registro clínico para un paciente existente, buscado por DNI (rol profesional).
// ---------------------------------------------------------------------------
exports.saveDataPacient = async (req, res) => {
    try {
        const { dni } = req.body;
        if (!dni) return res.status(400).json({ error: 'Debe enviar un DNI.' });

        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'Tu usuario no tiene una clínica asignada.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const { data: persona, error: personaError } = await db
            .from('persona')
            .select('id, nombre, apellido, paciente(id)')
            .eq('dni', dni)
            .eq('clinica_id', clinicaId)
            .maybeSingle();
        if (personaError) throw personaError;

        const paciente = persona && persona.paciente && persona.paciente[0];
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente no encontrado.' });
        }

        const cod = await prepararCodificacion({
            clinicaId,
            idPaciente: paciente.id,
            diagnosticos: req.body.diagnosticos,
            practicas: req.body.practicas,
        });
        if (!cod.ok) return res.status(400).json({ error: cod.error });

        const prof = await getProfContext(req);
        const idRegistro = await insertRegistro(db, paciente.id, prof, req.body, cod);

        await registrarAcceso(req, {
            accion: 'crear_registro',
            idPaciente: paciente.id,
            idRegistro,
            paciente: { nombre: [persona.nombre, persona.apellido].filter(Boolean).join(' '), dni },
        });

        return res.status(201).json({ message: 'Registro guardado con éxito' });
    } catch (err) {
        console.error('Error en save-data-pacient:', err);
        return res.status(500).json({ error: 'Error al guardar el registro.' });
    }
};

// ---------------------------------------------------------------------------
// Paciente + historial completo, buscado por DNI (rol profesional).
// NO devuelve contraseña ni datos de auth. Acceso controlado por la sesión del profesional.
// ---------------------------------------------------------------------------
exports.getDataPacient = async (req, res) => {
    try {
        const { dni } = req.body;
        if (!dni) return res.status(400).json({ error: 'Debe enviar un DNI.' });

        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'Tu usuario no tiene una clínica asignada.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const { data: persona, error: personaError } = await db
            .from('persona')
            .select('nombre, apellido, dni, telefono, direccion, sexo, fecha_nacimiento, email, id_auth, paciente(id, obra_social, id_obra_social, nro_afiliado, plan)')
            .eq('dni', dni)
            .eq('clinica_id', clinicaId)
            .maybeSingle();
        if (personaError) throw personaError;

        const paciente = persona && persona.paciente && persona.paciente[0];
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente no encontrado.' });
        }

        const { data: registros, error: regError } = await db
            .from('registro_clinico')
            .select(`id, id_profesional, profesional_nombre, area, fecha, sintomas, diagnostico, tratamiento, auditoria_estado, origen,
                registro_diente(numero, condicion, cara, estado, notas), ${SELECT_CODIFICACION}`)
            .eq('id_paciente', paciente.id)
            .order('fecha', { ascending: true });
        if (regError) throw regError;

        const history = (registros || []).map(r => ({
            profesional: r.profesional_nombre || '',
            area: r.area || '',
            fecha: fmtFechaHora(r.fecha),
            // Crudos para filtrar por período / profesional (ficha para la obra social).
            fechaIso: r.fecha,
            idProfesional: r.id_profesional || null,
            // Vino de otro sistema (import de HC): fecha y profesional son los del archivo.
            importado: !!r.origen,
            sintomas: r.sintomas || '',
            diagnostico: r.diagnostico || '',
            tratamiento: r.tratamiento || '',
            dientes: (r.registro_diente || []).map(serializarDiente),
            ...serializarCodificacion(r),
            auditoria: r.auditoria_estado || 'pendiente',
        }));

        const fechaApertura = registros && registros.length > 0 ? fmtFecha(registros[0].fecha) : '';

        await registrarAcceso(req, {
            accion: 'ver_hc',
            idPaciente: paciente.id,
            paciente: { nombre: [persona.nombre, persona.apellido].filter(Boolean).join(' '), dni: persona.dni },
            detalle: { registros: (registros || []).length },
        });

        return res.status(200).json({
            fullName: [persona.nombre, persona.apellido].filter(Boolean).join(' '),
            telefono: persona.telefono || '',
            email: persona.email || '',
            dni: persona.dni,
            sexo: persona.sexo || '',
            direccion: persona.direccion || '',
            fechaNacimiento: fmtFecha(persona.fecha_nacimiento),
            edad: String(calcEdad(persona.fecha_nacimiento) ?? ''),
            obraSocial: paciente.obra_social || '',
            idObraSocial: paciente.id_obra_social || null,
            nroAfiliado: paciente.nro_afiliado || '',
            plan: paciente.plan || '',
            tieneCuenta: !!persona.id_auth,
            fechaApertura,
            history,
        });
    } catch (err) {
        console.error('Error en get-data-pacient:', err);
        return res.status(500).json({ error: 'Error al obtener los datos del paciente.' });
    }
};

// ---------------------------------------------------------------------------
// Emisor de la ficha para la obra social: clínica activa + profesional autenticado
// (nombre, especialidad y matrícula). Encabeza la ficha que firma el profesional.
// ---------------------------------------------------------------------------
exports.getEmisor = async (req, res) => {
    try {
        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const prof = await getProfContext(req);

        let matricula = '';
        if (prof.idProfesional) {
            const { data } = await db
                .from('profesional')
                .select('matricula')
                .eq('id', prof.idProfesional)
                .maybeSingle();
            matricula = (data && data.matricula) || '';
        }

        let clinica = '';
        if (prof.clinicaId) {
            const { data } = await db
                .from('clinica')
                .select('nombre')
                .eq('id', prof.clinicaId)
                .maybeSingle();
            clinica = (data && data.nombre) || '';
        }

        return res.json({
            clinica,
            profesional: prof.nombre,
            especialidad: prof.area,
            matricula,
            idProfesional: prof.idProfesional,
        });
    } catch (err) {
        console.error('Error en emisor:', err);
        return res.status(500).json({ error: 'No se pudieron obtener los datos del profesional.' });
    }
};

// ---------------------------------------------------------------------------
// Fase K: actualizar la cobertura del paciente (obra social del catálogo + afiliado
// + plan), buscado por DNI dentro de la clínica (rol profesional).
// ---------------------------------------------------------------------------
exports.actualizarCobertura = async (req, res) => {
    try {
        const { dni } = req.body;
        const clinicaId = req.session.user.clinicaId;
        if (!clinicaId) return res.status(400).json({ error: 'Tu usuario no tiene una clínica asignada.' });

        const db = await getUserSupabase(req);
        if (!db) return res.status(ERR_SESION.status).json(ERR_SESION.body);

        const { data: persona, error: personaError } = await db
            .from('persona')
            .select('nombre, apellido, paciente(id)')
            .eq('dni', dni)
            .eq('clinica_id', clinicaId)
            .maybeSingle();
        if (personaError) throw personaError;
        const paciente = persona && persona.paciente && persona.paciente[0];
        if (!paciente) return res.status(404).json({ error: 'Paciente no encontrado.' });

        const cob = await columnasCobertura(req.body, clinicaId);
        if (!cob.ok) return res.status(400).json({ error: cob.error });
        if (!Object.keys(cob.cols).length) return res.status(400).json({ error: 'Nada para actualizar.' });

        const { error } = await db.from('paciente').update(cob.cols).eq('id', paciente.id);
        if (error) throw error;

        await registrarAcceso(req, {
            accion: 'editar_cobertura',
            idPaciente: paciente.id,
            paciente: { nombre: [persona.nombre, persona.apellido].filter(Boolean).join(' '), dni },
            detalle: { obraSocial: cob.cols.obra_social || null },
        });

        return res.json({ message: 'Cobertura actualizada' });
    } catch (err) {
        console.error('Error actualizando la cobertura:', err);
        return res.status(500).json({ error: 'Error al actualizar la cobertura.' });
    }
};
