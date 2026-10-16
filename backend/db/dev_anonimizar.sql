-- =============================================================================
-- DEV-Medilu — Anonimizar la copia de prod
--
-- Lo corre copiar_prod_a_dev.ps1 contra DEV-Medilu, en la misma transacción que
-- la copia: los datos reales nunca quedan guardados en DEV.
--
-- Mantiene la estructura y todas las relaciones (ids, clínicas, membresías,
-- turnos, historias, fichas de una misma cuenta en varias clínicas). Cambia:
--   - Personas: nombre, apellido, DNI, teléfono, dirección y email falsos. La
--     fecha de nacimiento se corre unos días. Fichas con el mismo DNI (la misma
--     persona en dos clínicas) siguen compartiendo DNI y nombre.
--   - Cuentas de Auth: email usuarioN@medilu.test y una contraseña de dev común.
--     Las de PLATAFORMA_ADMIN_EMAILS (variable psql `admins`) quedan como están.
--   - Nombres copiados en otras tablas (paciente_nombre, profesional_nombre,
--     auditor_nombre, actor_nombre...): se recalculan desde la persona falsa.
--   - Texto clínico libre, motivos, notas y comentarios: texto de prueba.
--   - Clínicas: "Clínica Dev N".
--   - Mercado Pago y Google Calendar: ids falsos o vacíos, para que dev nunca
--     toque una suscripción o un calendario reales.
--   - Bitácora (hc_acceso): IP y user agent genéricos.
-- Los archivos de Storage no se copian: las rutas quedan, los archivos no.
--
-- Corre con session_replication_role = replica (lo pone el script): así los
-- triggers que protegen la bitácora y las historias no frenan la anonimización.
--
-- Variables psql: admins (emails separados por coma, puede ser vacío).
-- Variable de entorno: MEDILU_CLAVE_DEV (contraseña de las cuentas de dev).
-- =============================================================================

-- El volcado de datos que corre antes deja el search_path vacío.
SET search_path = public, extensions;

\getenv clave_dev MEDILU_CLAVE_DEV

CREATE TEMP TABLE _admins AS
    SELECT lower(trim(x)) AS email
    FROM unnest(string_to_array(:'admins', ',')) x
    WHERE trim(x) <> '';

CREATE TEMP TABLE _clave AS SELECT :'clave_dev'::text AS clave;

DO $$
BEGIN
    IF length(coalesce((SELECT clave FROM _clave), '')) < 10 THEN
        RAISE EXCEPTION 'Falta MEDILU_CLAVE_DEV o tiene menos de 10 caracteres.';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Cuentas de Auth.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _cuenta AS
    SELECT u.id,
           'usuario' || row_number() OVER (ORDER BY u.created_at, u.id) || '@medilu.test' AS email
    FROM auth.users u
    WHERE lower(u.email) NOT IN (SELECT email FROM _admins) OR u.email IS NULL;

UPDATE auth.users u
SET email = c.email,
    encrypted_password = extensions.crypt((SELECT clave FROM _clave), extensions.gen_salt('bf')),
    raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('email', c.email),
    phone = NULL,
    -- GoTrue no acepta NULL en estos campos: van vacíos.
    confirmation_token = '',
    recovery_token = '',
    email_change = '',
    email_change_token_new = '',
    email_change_token_current = '',
    reauthentication_token = '',
    phone_change = '',
    phone_change_token = ''
FROM _cuenta c
WHERE c.id = u.id;

UPDATE auth.identities i
SET identity_data = coalesce(i.identity_data, '{}'::jsonb) || jsonb_build_object('email', c.email)
FROM _cuenta c
WHERE c.id = i.user_id;

-- -----------------------------------------------------------------------------
-- 2. Personas. Un número por DNI distinto: misma persona en varias clínicas,
--    mismos datos falsos.
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _num AS
    SELECT dni, (dense_rank() OVER (ORDER BY dni))::int AS n
    FROM (SELECT DISTINCT dni FROM persona) d;

CREATE TEMP TABLE _lista AS SELECT
    ARRAY['Ana','Bruno','Carla','Diego','Elena','Facundo','Gabriela','Hernán','Inés','Julián',
          'Lucía','Martín','Natalia','Octavio','Paula','Ramiro','Sofía','Tomás','Valeria','Walter',
          'Agustina','Benjamín','Camila','Damián','Florencia','Gonzalo','Julieta','Lautaro','Micaela','Nicolás'] AS nombres,
    ARRAY['García','Rodríguez','Gómez','Fernández','López','Díaz','Martínez','Pérez','Romero','Sánchez',
          'Álvarez','Torres','Ruiz','Ramírez','Flores','Acosta','Benítez','Medina','Herrera','Suárez',
          'Aguirre','Giménez','Gutiérrez','Pereyra','Molina','Castro','Ortiz','Silva','Núñez','Luna'] AS apellidos;

UPDATE persona p
SET nombre = l.nombres[1 + (m.n - 1) % 30],
    apellido = l.apellidos[1 + ((m.n - 1) / 30 + (m.n - 1) * 7) % 30],
    dni = (30000000 + m.n)::text,
    telefono = CASE WHEN p.telefono IS NULL THEN NULL ELSE '11' || (50000000 + m.n)::text END,
    direccion = CASE WHEN p.direccion IS NULL THEN NULL ELSE 'Calle de Prueba ' || (100 + m.n) END,
    fecha_nacimiento = p.fecha_nacimiento + ((m.n * 37) % 200 - 100),
    email = coalesce(
        (SELECT u.email FROM auth.users u WHERE u.id = p.id_auth),
        CASE WHEN p.email IS NULL THEN NULL ELSE 'persona' || m.n || '@medilu.test' END)
FROM _num m, _lista l
WHERE m.dni = p.dni;

CREATE TEMP TABLE _nom AS
    SELECT id AS id_persona, trim(nombre || ' ' || coalesce(apellido, '')) AS nombre, dni
    FROM persona;
CREATE TEMP TABLE _nom_prof AS
    SELECT pr.id, n.nombre FROM profesional pr JOIN _nom n ON n.id_persona = pr.id_persona;
CREATE TEMP TABLE _nom_pac AS
    SELECT pa.id, n.nombre, n.dni FROM paciente pa JOIN _nom n ON n.id_persona = pa.id_persona;

-- -----------------------------------------------------------------------------
-- 3. Profesionales, pacientes y clínicas.
-- -----------------------------------------------------------------------------
UPDATE profesional
SET telefono = CASE WHEN telefono IS NULL THEN NULL ELSE '11' || (40000000 + id)::text END,
    direccion = CASE WHEN direccion IS NULL THEN NULL ELSE 'Consultorio de Prueba ' || id END,
    matricula = CASE WHEN matricula IS NULL THEN NULL ELSE 'MP-DEV-' || id END,
    descripcion = CASE WHEN descripcion IS NULL THEN NULL ELSE 'Profesional de prueba.' END,
    id_calendario = NULL;

UPDATE paciente
SET nro_afiliado = CASE WHEN nro_afiliado IS NULL THEN NULL ELSE lpad((900000 + id)::text, 10, '0') END;

CREATE TEMP TABLE _clin AS
    SELECT id, (row_number() OVER (ORDER BY creada_en, id))::int AS n FROM clinica;
UPDATE clinica c
SET nombre = 'Clínica Dev ' || k.n,
    slug = 'clinica-dev-' || k.n,
    direccion = CASE WHEN c.direccion IS NULL THEN NULL ELSE 'Av. de Prueba ' || (1000 + k.n) END,
    descripcion = CASE WHEN c.descripcion IS NULL THEN NULL ELSE 'Clínica de prueba.' END
FROM _clin k
WHERE k.id = c.id;

-- -----------------------------------------------------------------------------
-- 4. Nombres copiados en otras tablas.
-- -----------------------------------------------------------------------------
UPDATE turno t SET profesional_nombre = n.nombre FROM _nom_prof n WHERE n.id = t.id_profesional;
UPDATE turno t
SET paciente_nombre = n.nombre,
    paciente_email = CASE WHEN t.paciente_email IS NULL THEN NULL ELSE p.email END,
    paciente_telefono = CASE WHEN t.paciente_telefono IS NULL THEN NULL ELSE p.telefono END
FROM _nom_pac n
JOIN paciente pa ON pa.id = n.id
JOIN persona p ON p.id = pa.id_persona
WHERE n.id = t.id_paciente;
-- Invitados (turno sin ficha de paciente).
UPDATE turno
SET paciente_nombre = 'Invitado ' || id,
    paciente_email = CASE WHEN paciente_email IS NULL THEN NULL ELSE 'invitado' || id || '@medilu.test' END,
    paciente_telefono = CASE WHEN paciente_telefono IS NULL THEN NULL ELSE '11' || (60000000 + id)::text END
WHERE id_paciente IS NULL;
UPDATE turno SET google_event_id = NULL, google_calendar_id = NULL;

UPDATE registro_clinico r SET profesional_nombre = n.nombre FROM _nom_prof n WHERE n.id = r.id_profesional;
UPDATE estudio_compartido e SET profesional_nombre = n.nombre FROM _nom_prof n WHERE n.id = e.id_profesional;
UPDATE estudio e SET paciente_nombre = n.nombre FROM _nom_pac n WHERE n.id = e.id_paciente;

UPDATE certificado_medico c SET profesional_nombre = n.nombre FROM _nom_prof n WHERE n.id = c.id_profesional;
UPDATE certificado_medico c SET paciente_nombre = n.nombre FROM _nom_pac n WHERE n.id = c.id_paciente;

UPDATE autorizacion a SET profesional_nombre = n.nombre FROM _nom_prof n WHERE n.id = a.id_profesional;
UPDATE autorizacion a SET paciente_nombre = n.nombre FROM _nom_pac n WHERE n.id = a.id_paciente;
UPDATE autorizacion a SET auditor_nombre = 'Auditor de prueba' WHERE auditor_nombre IS NOT NULL;
UPDATE autorizacion a SET auditor_nombre = n.nombre FROM _nom n WHERE n.id_persona = a.id_persona_auditor;

UPDATE auditoria_revision a SET auditor_nombre = 'Auditor de prueba' WHERE auditor_nombre IS NOT NULL;
UPDATE auditoria_revision a SET auditor_nombre = n.nombre FROM _nom n WHERE n.id_persona = a.id_persona_auditor;

UPDATE hc_acceso SET actor_nombre = 'Usuario de prueba' WHERE actor_nombre IS NOT NULL;
UPDATE hc_acceso h SET actor_nombre = n.nombre FROM _nom n WHERE n.id_persona = h.id_persona_actor;
UPDATE hc_acceso
SET paciente_nombre = CASE WHEN paciente_nombre IS NULL THEN NULL ELSE 'Paciente de prueba' END,
    paciente_dni = NULL;
UPDATE hc_acceso h SET paciente_nombre = n.nombre, paciente_dni = n.dni FROM _nom_pac n WHERE n.id = h.id_paciente;
UPDATE hc_acceso
SET ip = CASE WHEN ip IS NULL THEN NULL ELSE '127.0.0.1' END,
    user_agent = CASE WHEN user_agent IS NULL THEN NULL ELSE 'dev' END;

-- Lo que no se pudo cruzar (persona borrada, etc.): genérico.
UPDATE turno SET profesional_nombre = 'Profesional de prueba'
    WHERE profesional_nombre IS NOT NULL AND (id_profesional IS NULL OR id_profesional NOT IN (SELECT id FROM _nom_prof));
UPDATE registro_clinico SET profesional_nombre = 'Profesional de prueba'
    WHERE profesional_nombre IS NOT NULL AND (id_profesional IS NULL OR id_profesional NOT IN (SELECT id FROM _nom_prof));
UPDATE estudio_compartido SET profesional_nombre = 'Profesional de prueba'
    WHERE profesional_nombre IS NOT NULL AND (id_profesional IS NULL OR id_profesional NOT IN (SELECT id FROM _nom_prof));
UPDATE certificado_medico SET profesional_nombre = 'Profesional de prueba'
    WHERE profesional_nombre IS NOT NULL AND (id_profesional IS NULL OR id_profesional NOT IN (SELECT id FROM _nom_prof));
UPDATE autorizacion SET profesional_nombre = 'Profesional de prueba'
    WHERE profesional_nombre IS NOT NULL AND (id_profesional IS NULL OR id_profesional NOT IN (SELECT id FROM _nom_prof));
UPDATE estudio SET paciente_nombre = 'Paciente de prueba'
    WHERE paciente_nombre IS NOT NULL AND id_paciente NOT IN (SELECT id FROM _nom_pac);
UPDATE certificado_medico SET paciente_nombre = 'Paciente de prueba'
    WHERE paciente_nombre IS NOT NULL AND id_paciente NOT IN (SELECT id FROM _nom_pac);
UPDATE autorizacion SET paciente_nombre = 'Paciente de prueba'
    WHERE paciente_nombre IS NOT NULL AND (id_paciente IS NULL OR id_paciente NOT IN (SELECT id FROM _nom_pac));

-- -----------------------------------------------------------------------------
-- 5. Texto libre.
-- -----------------------------------------------------------------------------
UPDATE registro_clinico
SET sintomas = CASE WHEN sintomas IS NULL THEN NULL ELSE 'Síntomas de prueba (registro ' || left(id::text, 8) || ').' END,
    diagnostico = CASE WHEN diagnostico IS NULL THEN NULL ELSE 'Diagnóstico de prueba.' END,
    tratamiento = CASE WHEN tratamiento IS NULL THEN NULL ELSE 'Tratamiento de prueba.' END;
UPDATE registro_diente SET notas = CASE WHEN notas IS NULL THEN NULL ELSE 'Nota de prueba.' END;
UPDATE certificado_medico
SET motivo = CASE WHEN motivo IS NULL THEN NULL ELSE 'Motivo de prueba.' END,
    diagnostico = CASE WHEN diagnostico IS NULL THEN NULL ELSE 'Diagnóstico de prueba.' END,
    indicaciones = CASE WHEN indicaciones IS NULL THEN NULL ELSE 'Indicaciones de prueba.' END;
UPDATE autorizacion
SET fundamento = CASE WHEN fundamento IS NULL THEN NULL ELSE 'Fundamento de prueba.' END,
    motivo = CASE WHEN motivo IS NULL THEN NULL ELSE 'Motivo de prueba.' END,
    nro_afiliado = CASE WHEN nro_afiliado IS NULL THEN NULL ELSE lpad((800000 + id)::text, 10, '0') END;
UPDATE autorizacion_adjunto SET archivo_nombre = CASE WHEN archivo_nombre IS NULL THEN NULL ELSE 'adjunto-' || id END;
UPDATE auditoria_revision
SET comentario = CASE WHEN comentario IS NULL THEN NULL ELSE 'Comentario de prueba.' END,
    respuesta = CASE WHEN respuesta IS NULL THEN NULL ELSE 'Respuesta de prueba.' END;
UPDATE estudio
SET titulo = 'Estudio ' || id,
    descripcion = CASE WHEN descripcion IS NULL THEN NULL ELSE 'Descripción de prueba.' END,
    archivo_nombre = CASE WHEN archivo_nombre IS NULL THEN NULL ELSE 'estudio-' || id END;
UPDATE bloqueo_horario SET motivo = CASE WHEN motivo IS NULL THEN NULL ELSE 'Bloqueo de prueba.' END;

-- -----------------------------------------------------------------------------
-- 6. Mercado Pago: ids falsos (mismo id falso para el mismo id real, así las
--    relaciones siguen cerrando) y sin emails.
-- -----------------------------------------------------------------------------
UPDATE suscripcion
SET mp_preapproval_id = CASE WHEN mp_preapproval_id IS NULL THEN NULL ELSE 'dev-' || left(md5(mp_preapproval_id), 16) END,
    mp_payer_email = CASE WHEN mp_payer_email IS NULL THEN NULL ELSE 'pagador@medilu.test' END,
    notas = CASE WHEN notas IS NULL THEN NULL ELSE 'Notas de prueba.' END;
UPDATE suscripcion_checkout
SET mp_preapproval_id = 'dev-' || left(md5(mp_preapproval_id), 16),
    payer_email = CASE WHEN payer_email IS NULL THEN NULL ELSE 'pagador@medilu.test' END,
    init_point = NULL;
UPDATE suscripcion_pago
SET mp_preapproval_id = CASE WHEN mp_preapproval_id IS NULL THEN NULL ELSE 'dev-' || left(md5(mp_preapproval_id), 16) END,
    mp_authorized_payment_id = CASE WHEN mp_authorized_payment_id IS NULL THEN NULL ELSE 'dev-' || left(md5(mp_authorized_payment_id), 16) END,
    mp_payment_id = CASE WHEN mp_payment_id IS NULL THEN NULL ELSE 'dev-' || left(md5(mp_payment_id), 16) END;

-- -----------------------------------------------------------------------------
-- 7. Control: ningún email fuera de @medilu.test salvo los admins.
-- -----------------------------------------------------------------------------
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM auth.users
    WHERE email NOT LIKE '%@medilu.test' AND lower(email) NOT IN (SELECT email FROM _admins);
    IF n > 0 THEN RAISE EXCEPTION 'Quedaron % cuenta(s) con email real.', n; END IF;

    SELECT count(*) INTO n FROM persona p
    WHERE p.email IS NOT NULL AND p.email NOT LIKE '%@medilu.test'
      AND lower(p.email) NOT IN (SELECT email FROM _admins);
    IF n > 0 THEN RAISE EXCEPTION 'Quedaron % persona(s) con email real.', n; END IF;
END $$;
