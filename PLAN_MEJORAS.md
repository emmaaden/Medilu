# Medilu — Plan de mejoras (roles por clínica, administración y certificados)

> Hoja de ruta por **fases** para tres mejoras pedidas. Cada fase es un entregable
> independiente que se puede correr y verificar antes de pasar a la siguiente.
>
> **Rama:** `dev` · **Creado:** 2026-09-19 · Complementa a `CONTEXT.md`.

---

## 0. Resumen de lo pedido

1. **Roles por clínica (multi-clínica real).** Cada usuario tiene un rol *en cada clínica*.
   Un profesional puede pertenecer a **varias clínicas con roles distintos**. Al loguearse,
   si está en más de una, **elige en cuál va a trabajar**.
2. **Administrador de la clínica.** Gestiona a los profesionales (**alta / baja**). Es el
   **único** que puede **crear** códigos de activación y **eliminarlos** (solo si el código
   **no está en uso**; si ya se usó, no se borra).
3. **Certificados médicos.** El paciente los descarga desde su panel. El profesional puede:
   - **Crearlo desde cero** (requiere haber cargado antes su **firma digital / sello**), o
   - **Subir la foto** de un certificado físico ya emitido.

---

## 1. Estado actual relevante (lo que ya existe)

- **Identidad:** `persona` (1 fila por `id_auth`) con `persona.clinica_id` → **una sola clínica por persona**.
  `DNI` es único **por clínica** (`persona_clinica_dni_key`).
- **Roles:** se derivan de la existencia de fila en `profesional` o `paciente`.
  El admin es un **booleano** `profesional.es_admin`.
- **RLS (Fase 2c):** todas las políticas filtran por `clinica_id` usando
  `app_current_clinica_id()`, que hoy devuelve `persona.clinica_id` del `auth.uid()`.
- **Códigos de activación:** tabla `codigo_activacion` (`codigo`, `clinica_id`, `usado`, `usado_por`).
  `clinicaController` ya tiene `generarCodigo` / `listarCodigos` (por-JWT, RLS). **Falta:** restringir
  a admin de forma dura y **eliminar** códigos no usados.
- **Sesión (`authController.login`):** `req.session.user = { idRole, id, email, role, clinicaId, esAdmin }`
  + `req.session.sb` (tokens Supabase para operar por-JWT).
- **Frontend:** SPA React. `AuthContext` lee `/api/user`. Dashboard con `Home`, `Config`,
  `RegistroClinico`. Storage ya se usa para avatars (patrón de bucket + RLS por `auth.uid()`).

### Decisión de diseño clave (a confirmar antes de la Fase A)

Para soportar "un profesional en varias clínicas con distinto rol" se introduce una tabla de
**membresía** que desacopla *identidad* de *pertenencia+rol a una clínica*:

```
membresia (
  id           bigint PK,
  id_persona   bigint  -> persona(id),
  clinica_id   uuid    -> clinica(id),
  rol          text CHECK (rol IN ('admin','profesional','recepcion')),  -- extensible
  activo       boolean NOT NULL DEFAULT true,                 -- alta/baja por el admin
  creada_en    timestamptz DEFAULT now(),
  UNIQUE (id_persona, clinica_id)
)
```

- `persona` pasa a ser la **identidad global** del profesional (1 por `id_auth`);
  `persona.clinica_id` queda como *legacy* (clínica "de origen") y se mantiene por compatibilidad.
- `profesional` sigue 1:1 con `persona` (perfil: matrícula, calendario, descripción…): son datos
  **de la persona**, no de la clínica. `es_admin` se migra a `membresia.rol`.
- **Clínica activa por sesión:** el backend, al operar por-JWT, envía un header `x-clinica-id`.
  `app_current_clinica_id()` se redefine para **devolver esa clínica solo si el `auth.uid()` tiene
  una `membresia` activa en ella** (si no, `NULL`). Así el aislamiento lo sigue garantizando
  Postgres y el resto de las políticas RLS **no cambian** (siguen comparando `clinica_id`).
- **Pacientes:** por ahora siguen atados a una sola clínica (`persona.clinica_id`). La membresía
  multi-clínica se modela solo para profesionales/admins en esta etapa.

> **Alternativa descartada:** duplicar la fila `persona` por clínica. Es menos invasiva para la RLS
> pero duplica identidad/DNI y ensucia el login. La membresía es más limpia y a futuro permite más roles.

---

## FASE A — Membresía y roles por clínica + selector al login  ✅ IMPLEMENTADA (pendiente correr SQL + verificar)

**Objetivo:** el modelo de datos soporta N clínicas por profesional con rol por clínica, y el
usuario elige la clínica activa al iniciar sesión.

> **⚠️ Orden de despliegue:** correr `db/faseA_membresia.sql` en Supabase **antes** (o junto con) de
> desplegar este código. El backfill crea una `membresia` por cada profesional existente; sin él,
> `getMembresiasActivas` no encuentra membresías y el login de profesional responde 403.

**Cambios hechos:**
- DB: `backend/db/faseA_membresia.sql` (tabla `membresia`, backfill, `app_current_clinica_id()`
  por clínica activa vía header, `app_is_clinica_admin()`, RLS de `membresia`, DELETE de códigos libres).
- Backend: `utils/membresias.js`; `config/supabaseClient.js` (header `x-clinica-id`);
  `middleware/userSupabase.js` (pasa la clínica activa); `authController` (login por membresías +
  `selectClinica` + `misClinicas`; `register` crea membresía); `routes/authRoutes.js`
  (`GET /auth/mis-clinicas`, `POST /auth/select-clinica`); `/api/user` expone `clinicas`, `rol`,
  `esAdmin`, `needsClinicSelection`; `validators/schemas.js` (`selectClinica`).
- Frontend: `pages/SeleccionarClinica.tsx` (+ ruta `/seleccionar-clinica`, con modo `?cambiar=1`);
  `Login.tsx` redirige al selector si `needsClinicSelection`; `DashboardLayout` guarda ese caso;
  `DashboardNavbar` muestra clínica activa + rol y "Cambiar de clínica"; tipos en `hooks/useUser.ts`.

**Verificación:**
- [x] Migración aplicada en Supabase (proyecto Emma Project) vía MCP — 2026-09-19.
- [x] Backfill correcto: 2 membresías (1 admin, 1 profesional) en "Clínica Principal", ambas activas.
- [x] Advisors de seguridad: sin hallazgos nuevos (solo WARN preexistentes de exposición GraphQL / auth / Postgres).
- [ ] *(pendiente, requiere 2ª clínica)* Usuario con 2 clínicas: login → selector → aislamiento por RLS + cambio de clínica.
      Hoy ambos profesionales tienen 1 sola clínica → login directo. Se podrá probar el selector al sumar una 2ª membresía (Fase B).

### A1 · Base de datos (`db/faseA_membresia.sql`, idempotente)
- Crear tabla `membresia` (arriba). Índices por `id_persona`, `clinica_id`.
- **Backfill:** una `membresia` por cada `profesional` existente, con
  `clinica_id = persona.clinica_id` y `rol = CASE WHEN profesional.es_admin THEN 'admin' ELSE 'profesional' END`.
- Redefinir `app_current_clinica_id()`:
  ```sql
  SELECT m.clinica_id
  FROM membresia m
  JOIN persona pe ON pe.id = m.id_persona
  WHERE pe.id_auth = auth.uid()
    AND m.activo = true
    AND m.clinica_id = NULLIF(current_setting('request.headers', true)::json->>'x-clinica-id','')::uuid
  LIMIT 1;
  ```
  (Fallback: si no viene el header, se puede devolver la única membresía activa cuando haya solo una,
  para no romper flujos existentes; a decidir en implementación.)
- RLS de `membresia`: el usuario ve/gestiona las membresías **de su clínica activa** (para el panel admin);
  cada uno puede leer las suyas para el selector.
- **Rollback** documentado en el header del `.sql`.

### A2 · Backend
- `config/supabaseClient.js`: `userClientFromToken(accessToken, clinicaId?)` agrega el header
  `x-clinica-id` cuando hay clínica seleccionada. `middleware/userSupabase.js`: leer la clínica
  activa de la sesión (`req.session.user.clinicaId`) y pasarla.
- `authController.login`:
  - Buscar **todas** las membresías activas del usuario (join `membresia`).
  - Si hay **0** → error (sin clínica asignada). Si hay **1** → fijarla como activa (comportamiento actual).
    Si hay **>1** → devolver la lista y **no** fijar clínica todavía (`needsClinicSelection: true`).
  - `req.session.user.rol` pasa a ser el rol **de la clínica activa** (no `es_admin` global).
- Nuevo `POST /auth/select-clinica` (requiere sesión): valida que la clínica esté entre las
  membresías activas del usuario, la fija en la sesión (`clinicaId`, `rol`, `esAdmin`).
- `authController.register` (alta con código): crear la `membresia` (`rol='profesional'`) además
  de la fila `profesional`. Alta con nombre de clínica nueva → `membresia` con `rol='admin'`.
- `/api/user`: incluir `clinicas` (las membresías activas: id, nombre, rol) y la `clinicaActiva`.

### A3 · Frontend
- Tras login, si `needsClinicSelection`, mostrar **pantalla/selector de clínica** (una card por clínica
  con su rol). Al elegir → `POST /auth/select-clinica` → `refresh()` del `AuthContext`.
- Mostrar la **clínica activa** en el layout del dashboard con opción de **cambiar de clínica**
  (vuelve al selector sin desloguear).
- `AuthContext` / `useUser`: exponer `clinicas`, `clinicaActiva`, `rol`.

**Verificación:** usuario con 2 membresías (admin en A, profesional en B) → elige, y la RLS lo aísla
a la clínica elegida; cambiar de clínica cambia lo que ve. Usuario con 1 sola clínica: login directo, sin fricción.

---

## FASE B — Panel de administración de la clínica  ✅ IMPLEMENTADA (pendiente verificar UI logueado)

**Objetivo:** el admin de la clínica gestiona profesionales (alta/baja) y los códigos de activación
(crear / eliminar los no usados). Todo restringido al rol `admin` **en la clínica activa**.

**Cambios hechos:**
- Backend: `controllers/adminController.js` (`listarMiembros`, `actualizarMiembro` con salvaguarda de
  "último admin") + `routes/adminRoutes.js` montado en `/admin` (guard `requireRole('profesional')` +
  `requireClinicaAdmin`); `clinicaController.eliminarCodigo` (409 si `usado`) + `listarCodigos` ahora
  devuelve `id`; ruta `DELETE /clinica/codigos/:id`; validador `admin.actualizarMiembro`.
- Frontend: `pages/dashboard/Administracion.tsx` (ruta `/dashboard/admin`): tabla de profesionales
  (alta/baja + cambio de rol vía menú) y códigos (generar / copiar / eliminar los libres). Enlace
  "Administración" en el navbar solo si `esAdmin`; el Home ya no duplica los códigos (enlaza al panel).
  `api.patch` agregado al cliente HTTP.

**Verificación:** backend arranca OK; endpoints nuevos responden 401 sin sesión (routing + guards);
consulta de miembros y salvaguarda de último admin validadas contra la base (1 admin activo).
Pendiente: probar el panel logueado como admin (listar, alta/baja, cambiar rol, generar/eliminar código).

### B1 · Backend — guard de admin
- `middleware/auth.js`: nuevo `requireClinicAdmin` que exige `req.session.user.esAdmin === true`
  **para la clínica activa** (derivado en A2). Aplicar a todas las rutas de administración.

### B2 · Gestión de profesionales (`controllers/adminController.js` + `routes/adminRoutes.js`)
- `GET /admin/miembros`: lista los profesionales/admins de la clínica activa
  (join `membresia` + `persona` + `profesional`: nombre, matrícula, rol, `activo`).
- `PATCH /admin/miembros/:id`: **alta/baja** (`membresia.activo = true|false`). Reglas:
  - No permitir que el admin se dé de baja a sí mismo si es el **único admin activo** (evita clínica sin admin).
  - (Opcional) cambiar `rol` admin↔profesional con la misma salvaguarda.
- Efecto de la baja: `activo=false` → no puede elegir esa clínica al login y la RLS deja de reconocerlo
  como miembro (no ve datos de esa clínica). No se borra su historia ni sus registros.

### B3 · Códigos de activación
- Restringir `generarCodigo` / `listarCodigos` a `requireClinicAdmin`.
- `listarCodigos`: devolver también `id` y `usado_por` (para poder eliminar y auditar).
- Nuevo `DELETE /clinica/codigos/:id`: elimina **solo si `usado = false`**; si está usado → `409` y no borra.
  (Guard en backend + respaldo en RLS/constraint.)

### B4 · Frontend — página **Administración** (dashboard, visible solo si `rol==='admin'`)
- Tabla de **profesionales**: nombre, rol, estado; toggle **Activar / Dar de baja** (con confirmación).
- Sección **Códigos de activación**: listar (código, estado usado/libre, fecha), botón **Generar**
  y **Eliminar** (deshabilitado / oculto si está usado). Copiar código al portapapeles.

**Verificación:** admin da de baja a un profesional → ese profesional ya no puede operar en la clínica;
admin genera y elimina un código libre (ok) e intenta eliminar uno usado (rechazado 409).

---

## FASE C — Certificados médicos  ✅ IMPLEMENTADA (pendiente verificar UI logueado)

**Objetivo:** el profesional emite certificados (generados o foto de físico); el paciente los
descarga desde su panel. Emitir "desde cero" exige tener cargada la **firma/sello**.

**Cambios hechos:**
- DB (`db/faseC_certificados.sql`, aplicada en Supabase): `profesional.firma_path/firma_mime`;
  tabla `certificado_medico` con RLS (profesional por clínica activa; paciente dueño); buckets
  privados `firmas` y `certificados` (acceso mediado por el backend, URLs firmadas).
- Backend: `utils/certificadoPdf.js` (pdf-lib, firma embebida); `controllers/certificadoController.js`
  (`estadoFirma`, `subirFirma`, `generar`, `subir`, `listarPorPaciente`, `misCertificados`, `descargar`);
  `routes/certificadoRoutes.js` en `/certificados` + `GET /api/mi-cuenta/certificados`; validador
  `certificado.generar`; dependencia `pdf-lib`.
- Frontend: `pages/dashboard/Certificados.tsx` (firma + búsqueda por DNI + generar/subir + descargar)
  con enlace en el navbar; `pages/MisCertificados.tsx` (paciente) + ruta y acceso desde "Mi cuenta".

**Verificación:** migración aplicada; generación de PDF validada en aislamiento (PDF válido con firma);
backend arranca y los endpoints responden 401 sin sesión; frontend typecheck + build de producción OK;
advisors sin errores nuevos.

**Verificación E2E de RLS (simulando la sesión JWT de cada usuario en Postgres) — 2026-09-19:**
- ✅ Profesional (Carlos, staff): inserta y ve el certificado de su clínica.
- ✅ Paciente dueño: ve su certificado.
- ✅ Paciente ajeno: **NO** lo ve; y no puede auto-emitirse uno (INSERT bloqueado 42501).
- 🐞 **Bug encontrado y corregido:** el fallback de `app_current_clinica_id()` (para pacientes sin
  membresía) hacía que la rama "por clínica" de la RLS diera verdadero para cualquier paciente,
  exponiéndole los certificados de toda la clínica. **Fix:** helper `app_is_clinica_member()` +
  gate en las políticas de `certificado_medico` y `membresia` (`db/faseC2_fix_rls_miembro.sql`,
  aplicado; faseA/faseC actualizados). Re-testeado: ajeno pasa a ver 0.

Pendiente (necesita credenciales del usuario): probar la UI logueado — cargar firma, generar/subir,
y la descarga por URL firmada (capa Storage/HTTP, no cubierta por el test de datos).

### C1 · Base de datos y storage (`db/faseC_certificados.sql`)
- **Firma/sello del profesional:** columna `profesional.firma_path text` (o tabla `firma_profesional`).
  Bucket privado `firmas` en Storage con RLS `firma_rw_own` (cada quien escribe/lee `firmas/<auth.uid()>...`).
- Tabla `certificado_medico`:
  ```
  id            bigint PK,
  clinica_id    uuid   -> clinica(id),          -- tenant (RLS)
  id_profesional bigint -> profesional(id),
  id_paciente   bigint -> paciente(id),
  tipo          text CHECK (tipo IN ('generado','subido')),
  archivo_path  text,                            -- PDF/imagen en Storage
  motivo        text, diagnostico text, indicaciones text, dias_reposo int,  -- datos del generado
  emitido_en    timestamptz DEFAULT now()
  ```
- Bucket privado `certificados`. RLS de `certificado_medico`:
  - Profesional: ve/crea los de **su clínica activa** (`clinica_id = app_current_clinica_id()`).
  - Paciente: ve **los suyos** (`id_paciente = app_current_paciente_id()`), solo lectura.

### C2 · Backend (`controllers/certificadoController.js` + rutas)
- `POST /certificados/firma`: sube la firma/sello del profesional al bucket `firmas` (por-JWT).
- `GET /certificados/firma`: indica si ya cargó firma (para el gate del "crear desde cero").
- `POST /certificados` (profesional):
  - `tipo='generado'`: **exige firma cargada** (si no → 400). Genera el **PDF** (datos del paciente +
    profesional + matrícula + contenido + firma embebida), lo guarda en `certificados/…` y crea la fila.
  - `tipo='subido'`: recibe la **imagen/PDF** del certificado físico, la guarda y crea la fila.
  - Dependencia sugerida: `pdf-lib` o `pdfkit` para el generado (a confirmar en implementación).
- `GET /certificados?paciente=:id` (profesional): lista los del paciente en su clínica.
- `GET /mis-certificados` (paciente): lista los propios.
- `GET /certificados/:id/descargar`: devuelve el archivo (Signed URL de Storage o stream), validando
  por RLS que quien pide es dueño (paciente) o profesional de la clínica.

### C3 · Frontend
- **Profesional (dashboard):**
  - Ajustes → **Cargar firma/sello** (upload de imagen). Estado "firma cargada ✓".
  - En la ficha del paciente / nueva sección **Certificados**: botón **Nuevo certificado** con dos modos:
    (a) *Generar* (formulario: motivo, diagnóstico, días de reposo, indicaciones → PDF; bloqueado si no hay firma),
    (b) *Subir foto* (adjuntar archivo). Listado de certificados emitidos con descarga.
- **Paciente (panel):** sección **Mis certificados** (probablemente junto a `MiHistoria`) con lista y
  botón **Descargar**.

**Verificación:** profesional sin firma no puede generar (sí subir foto); con firma genera un PDF válido;
el paciente ve y descarga solo los suyos; un paciente no puede acceder a los de otro (RLS).

---

## FASE D — Exportación / Importación de Historias Clínicas  ✅ IMPLEMENTADA (pendiente verificar UI logueado)

**Objetivo (cumplimiento legal):** poder **exportar** e **importar** la información de HC.
Marco: **Ley 26.529** (derecho del paciente a copia de su HC), **Ley 27.706** (digitalización),
**Res. 1840/2018** (interoperabilidad). Formato de export **JSON estructurado** (`medilu.hc` v1.0; se siguen importando los `agenlu.hc` y `agendasalud.hc`),
portable y re-importable, + **PDF** legible.

**Decisiones:** export JSON + PDF; alcance del profesional = **solo pacientes que atendió**
(`registro_clinico.id_profesional`), admin = **toda la clínica**; import empareja por **DNI** y
**deduplica** registros por `origen_id`.

**Cambios hechos:**
- DB (`db/faseD_hc_export.sql`, aplicada): `registro_clinico.origen` + `origen_id` + índice único
  parcial `(id_paciente, origen_id)` para deduplicar importaciones.
- Backend: `controllers/hcController.js` (`exportar`, `pacientesEnAlcance`, `importar` con resumen)
  + `routes/hcRoutes.js` en `/hc` (rol profesional; parser JSON 20 MB para import). Export del
  propio paciente: `GET /api/mi-cuenta/historia/export` (mismo formato). Alcance por sesión con
  service_role acotado (admin = clínica; profesional = sus registros).
- Frontend: `pages/dashboard/HistoriasClinicas.tsx` (`/dashboard/historias`): exportar JSON, importar
  con resumen, lista de pacientes en alcance con **PDF por paciente** (reusa `patientPdf`). Enlace
  "Historias" en el navbar. Paciente: botón **Descargar JSON** en `MiHistoria` (el PDF ya existía).
  `/hc` agregado al proxy de Vite.

**Verificación:** consultas del export validadas contra la base real (admin ve [1,2,3]; profesional
ve solo los que atendió; embeds de count y odontograma OK); backend arranca y los endpoints responden
401 sin sesión; frontend typecheck + build OK. Pendiente: probar logueado (exportar, importar un JSON,
PDF por paciente, y el JSON del paciente). **Requiere reiniciar backend y frontend** (código + proxy nuevos).

## 2. Orden sugerido y dependencias

1. **Fase A** (base de todo; sin esto no hay "rol por clínica"). ⚠️ Migración + cambio de RLS.
2. **Fase B** (depende de A: usa `membresia.rol` y clínica activa).
3. **Fase C** (independiente de B; se puede hacer después de A, o incluso en paralelo).

Cada fase entrega su `db/faseX_*.sql` **idempotente y con rollback**, y se verifica con JWTs reales
en 2 clínicas antes de mergear, siguiendo el estándar de `CONTEXT.md`.

## 3. Decisiones abiertas (confirmar al arrancar cada fase)

- **[A]** ✅ Confirmado: modelo con **tabla `membresia`**.
- **[A]** ✅ Confirmado: roles iniciales **`admin` + `profesional` + `recepcion`** (enum extensible).
      Permisos granulares de `recepcion` (p. ej. sin historia clínica, solo turnos) a definir en implementación.
- **[A]** Los **pacientes** quedan mono-clínica por ahora (la membresía multi-clínica es solo para profesionales/admins/recepción).
- **[C]** Formato del certificado generado: **PDF server-side** con `pdf-lib`/`pdfkit` (recomendado).
- **[C]** ¿La firma es a nivel **persona/profesional** (una sola, sirve para todas sus clínicas)?
  (recomendado sí, es del profesional).

## 4. Changelog del plan
- **2026-09-19** — Documento inicial. Tres mejoras divididas en Fases A (membresía/roles), B
  (administración: profesionales + códigos) y C (certificados médicos).
