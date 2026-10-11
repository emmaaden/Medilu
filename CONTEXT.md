# Medilu — Documento de Contexto y Hoja de Ruta (rama `dev`)

> Referencia técnica para llevar Medilu a un producto vendible a clínicas y
> profesionales de la salud.
>
> **Autor:** Emmanuel Denis · **Rama:** `dev` · **Actualizado:** 2026-09-14

> ## 📌 Estado
> - **Consolidado en Supabase**, MongoDB eliminado. ✅
> - Modelo de datos central: tabla **`persona`** + roles `paciente` / `profesional`.
> - Modelo de venta objetivo: **SaaS multi-clínica** (Fase 2).
> - **Fase 0 (seguridad) aplicada sobre `dev`.** Ver §7 (changelog).
> - **Fase 1 aplicada sobre `dev`:** historia clínica reconstruida en Supabase + endpoints de reservas. Ver §7.
> - ⚠️ **Requiere correr en Supabase** la Sección B de `db/esquema_supabase.sql` (tablas `registro_clinico`, `registro_diente` y `ALTER persona ADD email`) antes de usar historia clínica.

---

## 1. Qué es
Plataforma web de **turnos médicos** + **registro clínico**, con módulo de **odontología**
(odontograma + valor/aumento de ortodoncia). Usuarios: paciente, profesional y admin.

## 2. Stack
- Node.js 22 · Express 5 · **Supabase** (PostgreSQL + Auth + Storage).
- Frontend: HTML + CSS + JS vanilla, estático desde `/public`.
- Integraciones: Google Calendar (Service Account), Twilio (WhatsApp, hoy inactivo), Nodemailer.

## 3. Modelo de datos (Supabase, "persona")
Detalle y DDL en **`db/esquema_supabase.sql`**.

| Tabla | Rol |
|-------|-----|
| `persona` | Datos comunes: `id`, `id_auth`→auth.users, `dni`, `nombre`, `apellido`, `fecha_nacimiento`, `telefono`, `direccion`, `sexo` |
| `paciente` | `id`, `id_persona`, `obra_social` |
| `profesional` | `id`, `id_persona`, `telefono`, `direccion`, `matricula`, `id_calendario`, `descripcion`, `precio` |
| `especialidad` / `especialidad_profesional` | Catálogo de áreas y su relación N:M con profesional |
| `horario_profesional` | Agenda del profesional (`id_profesional`, `dia`, `horario_inicio`, `horario_fin`) |
| `pacientes_ortodoncia` | `id_paciente`, `valor`, `aumento` |
| `registro_clinico` / `registro_diente` | **Nuevas (Fase 1):** historia clínica + odontograma |

**Dos identificadores en sesión** (`authController.login`): `req.session.user.id` = auth
(`persona.id_auth`), y `req.session.user.idRole` = `profesional.id`. Cada controller usa el
que corresponde: `get-datos-prof` y avatars → `id`; `get-esp-prof`, `save-*` y horarios → `idRole`.

## 4. Seguridad (estado tras Fase 0)
- ✅ Middleware `middleware/auth.js` (`requireAuth`/`requireRole`/`requireAdmin`) en rutas privadas.
- ✅ El `user_id` se toma de la **sesión**, no del body → IDOR cerrado.
- ✅ `helmet`, CORS con lista blanca (`ALLOWED_ORIGINS`), rate-limit, cookies seguras en prod, `sameSite`.
- ✅ Sin variable global `CALENDAR_ID`: el `calendarId` viaja por request.
- ✅ Credenciales de Google desde memoria (no se escribe JSON a disco).
- ✅ Validación de entrada con **zod** (`middleware/validate.js` + `validators/schemas.js`) en
  auth, historia clínica, profesional, horarios, ortodoncia y endpoints de calendario.
- ✅ **RLS real por JWT (Fase 2c) — rollout completo:** políticas por `clinica_id` en
  Postgres, aplicadas al operar con el JWT del usuario (rol `authenticated`). **Todos los
  controllers autenticados** migrados: historia clínica (`pacienteController`), ortodoncia
  (`ortPacienteController`), clínica (`clinicaController`), profesional
  (`profesionalController`), horarios (`horarioController`) y avatars (`avatarsController`,
  política de storage). El `service_role` queda solo para lo público/sistema: registro,
  página de turnos, recordatorios (cron) y `/api/user`.
- ✅ **`SUPABASE_KEY` = `service_role`, no expuesta:** verificado (2026-09-15) — la clave secreta
  solo se usa en backend; `/api/public-config` expone únicamente `SUPABASE_KEY_PUBLIC` (anon);
  `.env` gitignoreado y nunca commiteado; sin tokens JWT hardcodeados en el repo.

## 5. Bugs conocidos de `dev`
- ✅ `authController.login`: typo `rol`→`role` corregido (Fase 1). El login web sigue forzando
  `role = "profesional"` (por diseño actual: los pacientes no inician sesión en la web).
- ✅ `pacienteController` reescrito sobre Supabase (Fase 1).
- ✅ `main.js` ya no tiene IP hardcodeada: usa rutas relativas (Fase 1).

## 6. Fase 1 — Plan (reconstrucción sobre Supabase)

### 6.1 Endpoints que el frontend llama y NO existen (crear)
| Endpoint | Método | Lo usa | Qué debe hacer |
|----------|--------|--------|----------------|
| `/professionals` | GET | `select-prof.js`, `main.js` | Listar especialidades + profesionales (join `especialidad_profesional`+`profesional`+`persona`). |
| `/auth/get-area` | POST | `registroclinico*.js` | Especialidad del profesional autenticado (usar **sesión**). |
| `/auth/save-area` | POST | `main.js` | Asignar especialidad a un profesional. |
| `/auth/get-calenID` | POST | `select-prof.js` | `id_calendario` del profesional elegido (recibir id, no nombre). |
| `/api/get-hours` | GET | `main.js` | Horarios de profesionales para calcular slots. |
| `/pacient/regis-pacient` | POST | `registroclinico*.js` | Alta de `persona`+`paciente` + primer `registro_clinico` (+dientes). Rol profesional. |
| `/pacient/save-data-pacient` | POST | `registroclinico*.js` | Nuevo `registro_clinico` para un paciente (busca por DNI). Rol profesional. |
| `/pacient/get-data-pacient` | POST | `registroclinico*.js`, `historiaclinica.js` | Paciente + historial. **Sin** `password`; acceso por sesión del profesional. |

### 6.2 Frontend
1. Quitar IP hardcodeada de `main.js` (usar rutas relativas).
2. Enviar `calendarId` por request en `/available-slots`, `/create-event`, `/search-appointment`, `/delete-appointment` (ya no hay `/set-calendar`).
3. Reconstruir `select-prof.js` contra el nuevo `/professionals`.
4. Historia clínica: dejar de usar `dni + password`.

### 6.3 Otros
- ✅ `/available-slots` respeta `horario_profesional` por día (recibe `profId`, deriva el
  calendario y genera slots de 30' en la franja del día, excluyendo eventos). Fase reservas.
- ✅ Recordatorios por email (Nodemailer): confirmación al reservar + recordatorio ~24 h antes
  (scheduler in-process + endpoint `/internal/send-reminders` para cron externo).
  **Requiere configurar `EMAIL_*` (SMTP)** y, para el cron externo, `REMINDERS_TOKEN`.
  WhatsApp (Twilio) sigue inactivo.

## 7. Changelog

### 2026-10-07 — Ficha para la obra social y odontograma gráfico en los PDF
- **Ficha para la obra social** (botón «Ficha obra social» en la ficha del paciente, Registro clínico):
  PDF con encabezado de la clínica y el profesional (nombre, especialidad, matrícula), datos del
  afiliado, odontograma (permanente + temporal) y registro de prestaciones (fecha, código, pieza,
  caras, firma del paciente) con renglones en blanco y firma/sello del profesional. Sigue el modelo
  de la ficha odontológica de Unimed. Se elige período, qué prácticas van (por defecto solo las del
  profesional que la emite) y las caras, que se proponen a partir de lo que cambió en el odontograma
  de esa consulta. Código en `lib/fichaObraSocialPdf.ts` + `components/dashboard/FichaObraSocialDialog.tsx`.
- **Backend:** `GET /pacient/emisor` (clínica, profesional, especialidad, matrícula) y el historial de
  `get-data-pacient` suma `fechaIso` e `idProfesional` por registro.
- **Historia clínica en PDF:** el odontograma se dibuja con colores y símbolos como en la web
  (`lib/odontogramaPdf.ts`) en lugar del listado de texto; las notas por diente siguen como texto.

### 2026-10-07 — Fase M2: control diario, precios y pago atrasado
- **Control diario** (`utils/controlSuscripciones.js`, al arrancar y cada 24 h; o
  `POST /internal/control-suscripciones` con `x-cron-token`): aplica cambios de precio avisados,
  manda avisos pendientes y sincroniza con MP los débitos con el período por vencer/vencido o el
  próximo cobro pasado, y los intentos de pago pendientes de la última semana. Respaldo de los
  webhooks: idempotente.
- **Precios:** Plataforma → «Avisar y programar» lleva los débitos vigentes de un plan al precio de
  hoy. Columnas `monto_nuevo`, `monto_nuevo_desde`, `aviso_precio_enviado_en`
  (`db/faseM2_precios.sql`). Se avisa por email al admin; rige ≥ 30 días después del aviso (si sale
  tarde, la fecha se corre) y **sin aviso no se aplica**. La página Plan muestra el cambio.
- **Pago atrasado (gracia/vencida):** la página Plan muestra «Pagar ahora»; se paga por el checkout
  con otro medio y el cobro es inmediato; al autorizarse se cancela el débito que fallaba. Ya no se
  «cambia el monto» de un débito que está fallando (`puedeCambiarSinCheckout` exige estado activa).
- **Términos:** aviso de 30 días ante cambios de precio y 5 días de gracia si un débito falla.

### 2026-10-07 — Fase M: baja del débito automático
- **Botón de baja (`/baja`):** si lo usa el admin de la clínica con la sesión iniciada y hay un
  débito activo, se ofrece (marcado) cancelarlo en el acto; el backend lo cancela en Mercado Pago
  dentro de `POST /api/solicitudes-consumo` (`cancelarDebito: true`) y la constancia/email dicen si
  la baja quedó efectiva. Sin sesión, sigue siendo una solicitud con código y gestión manual.
- **Plataforma:** botón «Cancelar débito en Mercado Pago» por clínica
  (`POST /plataforma/clinicas/:id/cancelar-debito`) para las bajas que llegan por fuera del panel.
- En todos los casos el plan sigue hasta el fin del período pago.
- Antes: paginación de `/authorized_payments/search` (MP rechaza limit > ~15), validación de la URL de
  vuelta (MP rechaza localhost), primer débito al terminar la prueba/lo pagado (`start_date`) y
  sincronización automática de la página Plan con un intento de pago pendiente.

### 2026-10-06 — Fase M: suscripción de las clínicas con Mercado Pago
- **Cobro a la clínica, nunca al paciente.** Suscripciones de MP «sin plan asociado, con pago
  pendiente» (`POST /preapproval`): el admin elige plan/ciclo/profesionales extra en
  `/dashboard/plan`, paga en el checkout de MP y queda el débito automático (mensual o anual =
  frecuencia 12 meses). Cliente HTTP propio en `utils/mercadopago.js` (sin SDK).
- **Lógica en `utils/suscripcionMp.js`.** MP es la fuente de verdad: webhook
  (`POST /api/pagos/mp/webhook`, firma `x-signature` validada con `MP_WEBHOOK_SECRET`), la vuelta
  del checkout (`?pago=mp` → `/api/pagos/suscripcion/sincronizar`) y el botón del panel de
  plataforma vuelven a leer el preapproval y sus cobros (`/authorized_payments/search`).
- **Períodos:** al autorizarse el débito se aplica el plan con acceso provisorio (lo que quedaba de
  la prueba/período o 3 días). Cada cobro aprobado se registra una vez (`suscripcion_pago`, UNIQUE por
  id de MP) y extiende desde el mayor entre la fecha del cobro, el fin de lo ya pagado y el fin de la
  prueba: pagar durante la prueba no pierde días.
- **Cambios:** mismo ciclo con débito activo → `PUT` del monto y el plan rige ya (sin prorrateo); cambio
  de ciclo → checkout nuevo y, al autorizarse, se cancela el débito anterior. Se valida que los miembros
  activos entren en el plan elegido. Baja: `PUT status=cancelled`; el plan sigue hasta el fin del período.
- **DB:** `db/faseM_mercadopago.sql` (columnas `mp_*`, `monto`, `renovacion_automatica`, `proximo_cobro`
  en `suscripcion`; tablas `suscripcion_checkout` y `suscripcion_pago`, solo service_role).
- **Legal:** Términos (débito automático, cambio de plan), Reembolsos (baja desde el panel, período
  mensual o anual) y Privacidad (Mercado Pago como procesador de pagos de las clínicas).
- **Pendiente:** credenciales de prueba de MP para el test de punta a punta, facturación ARCA de cada cobro.

### 2026-10-06 — Fase L: planes, suscripciones y permisos por plan
- **Modelo:** tablas `plan` (precio mensual/anual, profesionales incluidos, precio por profesional
  extra, tope de recepción, `features text[]`) y `suscripcion` (una por clínica: plan, estado
  `prueba|activa|vencida|cancelada`, ciclo, profesionales extra, `prueba_hasta`, `periodo_hasta`).
  Se eliminó `clinica.plan`. Migración `db/faseL_planes.sql` (aplicada vía MCP).
- **Permisos = rol ∩ plan.** Catálogo de funciones en `utils/planes.js` (espejo en
  `frontend/src/lib/planes.ts`). `middleware/plan.js`: `requireFeature(f)` (402 `PLAN_FEATURE`),
  `soloLectura` montado sobre los datos de la clínica (402 `PLAN_SOLO_LECTURA` en escrituras; los
  POST de lectura están en una lista blanca) y `requirePlataforma`.
- **Por plan:** Profesional = todo lo clínico + 1 recepción; Equipo = + catálogos propios y
  recepción sin tope; Clínica = + autorizaciones previas y auditoría. Exportar HC nunca se limita.
- **Sin plan gratis:** clínica nueva → 14 días de prueba del plan Clínica (en el registro y, para
  clínicas viejas, en el primer uso). Vencida (o período pago + 5 días de gracia) → solo lectura y
  sin turnos online (se ocultan sus profesionales del listado público y se rechaza la reserva).
- **Asientos:** solo profesionales (admin + profesional). Se verifican al generar códigos (contando
  los pendientes), al canjearlos en el registro y al reactivar/cambiar de rol un miembro.
- **Activación manual** hasta integrar Mercado Pago: panel `/dashboard/plataforma` (env
  `PLATAFORMA_ADMIN_EMAILS`) para activar/renovar suscripciones y editar precios. El admin de la
  clínica ve plan, estado y uso en `/dashboard/plan` y contrata por WhatsApp.
- **UI:** `/planes` lee el catálogo de la base (mensual/anual), aviso de prueba/pago pendiente/solo
  lectura debajo del navbar, `FeatureGate` en Auditoría, Autorizaciones, Certificados y catálogos;
  el navbar, el dictado y los roles/códigos ofrecidos se filtran por plan.

### 2026-10-06 — Cumplimiento legal y accesibilidad del sitio público
- **Legal (AR):** páginas nuevas/reescritas de Privacidad (Ley 25.326, Ley 26.529, transferencia a
  EE. UU. — Supabase `us-east-2`), Términos (sin cláusula de exención total, nula por art. 37
  Ley 24.240), Cookies, Reembolsos y Accesibilidad. **Botón de arrepentimiento** y **Botón de baja
  de servicio** (Disp. 954/2025, que reemplazó a la Res. 424/2020 y la 316/2018) en todas las
  páginas públicas, sin registro y con código (`POST /api/solicitudes-consumo`, avisa por email si
  hay mailer; `LEGAL_NOTIFY_EMAIL`). Leyenda de la Disp. 10/2008 en formularios y footer.
- **Consentimiento expreso** obligatorio en registro (paciente/profesional/recepción) y en la
  reserva como invitado; se exige también en el backend. En el registro queda la prueba
  (`user_metadata.consentimiento`: versión legal + fecha) en Supabase Auth, sin cambios de esquema.
- **Minimización:** el profesional ya no da sexo, fecha de nacimiento ni dirección personal; la
  dirección del paciente es opcional; el teléfono de la reserva es opcional (y ahora se guarda con
  su código de país, que antes se perdía).
- **Ya no se publican** las páginas `.html` legacy de `backend/public` (política vieja, fotos sin
  licencia verificada, Google Fonts/jsDelivr). CSP estricta en todo el sitio. Redirecciones legacy
  conservan `?query` y `#hash`.
- **SEO:** `robots.txt` y `sitemap.xml` dinámicos (usan `APP_URL`).
- **Accesibilidad:** «Saltar al contenido», título por página, `aria-required`/`aria-describedby` y
  errores con `role="alert"` en `Field`, bordes de campos ≥ 3:1, textos de cierre en español.
- **Bugs:** contraseña mínima 6 en el front vs 8 en el back; fecha «hoy» en UTC en la reserva
  (después de las 21 h no dejaba elegir hoy); sesión de recuperación de Supabase que quedaba
  guardada tras cambiar la contraseña; mensajes «Required» en inglés; promesas falsas
  («100 % online», «24/7», «al instante», Google Calendar).

### 2026-09-15 — Fase 2d: revisión y saneamiento de la base
- **Revisión completa** (advisors seguridad/performance + 10 chequeos de integridad, todos en 0).
  Consistencia impecable: sin huérfanos, sin mismatch registro↔clínica, sin duplicados.
- **CRÍTICO resuelto:** las tablas legacy `turno`, `historia_clinica`, `consulta` (modelo viejo,
  vacías, sin uso en el código) tenían **RLS desactivada y expuestas al `anon`**. Se **eliminaron**
  (cierra el agujero y de-normaliza: queda solo `registro_clinico`/`registro_diente`).
- **Seguridad:** `REVOKE EXECUTE app_current_clinica_id() FROM anon, public` (solo `authenticated` la usa).
- **Integridad:** `registro_clinico.clinica_id` → NOT NULL; `especialidad_profesional.id_profesional`
  → NOT NULL + `UNIQUE(id_profesional, id_especialidad)`. `authController.saveArea` ahora hace upsert
  con `onConflict` sobre ese par (idempotente).
- **Performance:** índices sobre las FKs de las tablas activas.
- Aplicado con `db/fase2d_saneamiento.sql` (vía Supabase MCP).
- **Pendiente/decisión:** `persona.clinica_id` NOT NULL — hoy el auto-registro de PACIENTE inserta
  clínica NULL; definir cómo se asigna (o quitar ese flujo) antes de forzarlo. **Dashboard:** activar
  leaked-password protection y aplicar el upgrade de Postgres. **Opcional:** `REVOKE SELECT ... FROM anon`
  en las tablas de datos (la RLS ya bloquea filas; esto solo las saca del schema GraphQL público).

### 2026-09-15 — Bump de dependencias (googleapis, nodemailer)
- `googleapis` ^144 → ^181 y `nodemailer` ^7 → ^10 (majors). Uso verificado sin cambios de
  API: `google.auth.GoogleAuth` + `google.calendar('v3')` (create-event probado en vivo) y
  `nodemailer.createTransport`/`sendMail` (API SMTP estable). Node 24 cumple los engines.
- Eliminado el dep directo **vestigial** `google-auth-library` (^9): no se importaba; el auth de
  Calendar usa el que trae `googleapis` (v11 anidado). Boot sigue conectando a Google Calendar.

### 2026-09-15 — Verificación de claves Supabase
- `SUPABASE_KEY` decodificada: `role=service_role`; `SUPABASE_KEY_PUBLIC`: `role=anon` (mismo proyecto).
- La `service_role` solo se usa en backend; `/api/public-config` expone únicamente la anon.
  `.env` gitignoreado y ausente de toda la historia; sin JWT hardcodeados en el repo.

### 2026-09-15 — Fase 2c (parte 3): RLS por JWT en horarios, profesional y avatars (rollout completo)
- **Rollout RLS completo:** `profesionalController` (datos + ajustes), `horarioController`
  (CRUD de agenda) y `avatarsController` (subida) migrados al cliente por-JWT. Con esto, todos
  los controllers autenticados operan bajo RLS; `service_role` queda solo para lo público/sistema.
- **DB:** `db/fase2c3_rls_horarios_avatars.sql` — RLS por clínica en `horario_profesional` y
  política `avatar_rw_own` en `storage.objects` (cada usuario escribe solo `avatars/<auth.uid()>.png`).
  `profesionalController` no necesitó SQL (usa tablas ya cubiertas por fase2c). Idempotente.
- **Verificado** con JWTs reales en 2 clínicas: horarios y datos de profesional aislados
  (update/insert cross-tenant sin efecto o rechazado 42501), y avatar rechazando la subida a la
  ruta de otro usuario. Flujo de la app OK (horarios, datos/especialidad/descripción, upload de avatar).

### 2026-09-15 — Fase 2c (parte 2): RLS por JWT en ortodoncia y clínica + limpieza Mongo
- **Rollout RLS:** `ortPacienteController` (consulta de ortodoncia) y `clinicaController`
  (`info`, `generar-codigo`, `codigos`) ahora operan con el cliente por-JWT.
- **DB:** `db/fase2c2_rls_ortodoncia_clinica.sql` — políticas por `clinica_id` en
  `pacientes_ortodoncia`, `clinica` (lectura de la propia) y `codigo_activacion`
  (fase2 las había dejado con RLS activa pero sin políticas). Idempotente. **Requiere correrlo.**
- **Limpieza Mongo:** eliminada la línea `MONGODB_URI` del `.env` (tenía credenciales de un
  cluster Mongo — conviene rotarlas en Atlas); comentarios residuales saneados. No quedan
  dependencias ni código de Mongo en el repo.
- **Verificado** con JWTs reales en 2 clínicas: ortodoncia, códigos de activación y clínica
  aislados por tenant, INSERT cross-tenant rechazado (WITH CHECK, 42501), y flujo de la app
  (info/generar/listar códigos + consulta de ortodoncia) correcto por el stack completo.

### 2026-09-15 — Fase 2c: RLS real por JWT de usuario
- **El aislamiento por clínica ahora lo garantiza Postgres**, no solo la app. Para las
  operaciones de usuario autenticado el backend usa la anon key + el JWT del usuario
  (rol `authenticated`) y las políticas RLS filtran por `clinica_id` a partir de `auth.uid()`.
  El `service_role` (resto del backend) saltea la RLS, así que los endpoints no migrados
  siguen igual.
- **DB:** `db/fase2c_rls_jwt.sql` — función `app_current_clinica_id()` (SECURITY DEFINER,
  deriva la clínica del `auth.uid()`) + RLS y políticas en `persona`, `profesional`,
  `paciente`, `registro_clinico`, `registro_diente`, `especialidad_profesional`, y lectura
  del catálogo `especialidad`. Idempotente, con rollback documentado. **Requiere correrlo en Supabase.**
- **App:** `config/supabaseClient.js` expone `supabaseAnon` y `userClientFromToken(jwt)`;
  `authController.login` guarda `access/refresh/expiresAt` en la sesión;
  `middleware/userSupabase.js` (`getUserSupabase(req)`) arma el cliente por-request y refresca
  el token si vence. **Piloto:** `pacienteController` (historia clínica) migrado.
- ⚠️ Las sesiones abiertas de antes de 2c no tienen el token guardado → deben reloguearse
  para usar la historia clínica (el login nuevo captura el JWT).
- **Verificado** con JWTs reales (usuarios descartables en 2 clínicas): lectura aislada,
  bloqueo de lectura cross-tenant, rechazo de INSERT con `clinica_id` ajeno (WITH CHECK,
  error 42501), e historia clínica funcionando por el stack completo login→RLS.

### 2026-09-15 — Fase 2b: turnos públicos por clínica (aislamiento por tenant)
- **Cierra el aislamiento del lado público:** antes `/professionals` mezclaba los
  profesionales de todas las clínicas. Ahora cada clínica tiene su URL de reservas
  `turnos.html?clinica=<slug>` y el listado se filtra a sus profesionales.
- **DB:** `db/fase2b_turnos_publicos.sql` — columna `clinica.slug` (única) + backfill
  de slugs para las clínicas existentes. **Requiere correrlo en Supabase** después de
  `fase2_multiclinica.sql`.
- **Backend:** `publicController` resuelve `?clinica=<slug>` → `clinica_id` y filtra
  `/professionals` y `/api/get-hours`; nuevo `GET /clinica-publica` para el encabezado.
  Sin slug se mantiene el listado completo (despliegue de una sola clínica).
  `authController.register` genera el slug al crear una clínica; `/clinica/info` lo devuelve.
- **Frontend:** `select-prof.js` lee el slug de la URL y muestra el nombre de la clínica;
  `dashboard.js` muestra al admin su link público de turnos con botón de copiar.
- **Endurecimiento `/create-event`:** el calendario ya NO se toma del cliente. El endpoint
  recibe `profId` (+ `clinica` opcional), deriva el `id_calendario` del profesional desde
  la DB y, si viene el slug, valida que el profesional pertenezca a esa clínica (403 si no).
  Cierra dos agujeros: inyección de eventos en un calendario arbitrario y reserva cross-tenant.
  `main.js` ahora envía `profId` + `clinica` (el `calendarId` quedó como legacy ignorado).

### 2026-09-14 — Validación de entrada (zod)
- `middleware/validate.js`: gate que valida `req.body/query/params` con zod y responde 400 con
  el detalle de campos inválidos (no muta el request, para no descartar campos dinámicos).
- `validators/schemas.js`: schemas por área (auth, pacient, profesional, horario, ortodoncia,
  calendar). Aplicados en todas las rutas con entrada del usuario.
- Se quitaron los chequeos manuales de "campo faltante" que ahora cubre el validador.

### 2026-09-14 — Reservas: recordatorio ~24 h antes (§6.3)
- `sendUpcomingReminders()`: recorre los calendarios de los profesionales, busca turnos que
  empiezan en ~24 h, envía email al paciente (email tomado de la descripción) y marca el evento
  (`extendedProperties.reminded`) para no repetir.
- `POST /internal/send-reminders` protegido por `REMINDERS_TOKEN` (para cron externo) +
  scheduler in-process cada 60 min (solo si el mailer está configurado).

### 2026-09-14 — Reservas: slots según horario del profesional (§6.3)
- `/available-slots` ahora recibe `profId` (no `calendarId`): deriva el `id_calendario` y el
  `horario_profesional` del día pedido, genera franjas de 30' dentro del horario real y excluye
  los eventos ya agendados. Devuelve solo turnos futuros. Días sin atención → `[]`.
- Zona horaria fija AR (UTC-3) con offset `-03:00`; se eliminó el hack de `+3` del cliente.
- `main.js`: se sacó la dependencia de `/api/get-hours` y todo el cálculo cliente de slots;
  ahora solo muestra lo que devuelve el servidor. Al cambiar profesional/fecha se refresca.
- `select-prof.js`: al elegir profesional se fija `window.CALENDAR_ID` (para crear el turno).

### 2026-09-14 — Fase 1 sobre `dev`
- **Historia clínica en Supabase:** nuevo `controllers/pacienteController.js` + `routes/pacienteRoutes.js`
  (rol profesional): `/pacient/regis-pacient`, `/pacient/save-data-pacient`, `/pacient/get-data-pacient`.
  El profesional (id, nombre, área) se deriva de la **sesión**, no del body; snapshot en `registro_clinico`.
  Se guarda el odontograma en `registro_diente`. Ya **no** se usa `dni + password` para leer la historia.
- **Reservas:** nuevos `controllers/publicController.js` + `routes/publicRoutes.js` (públicos):
  `GET /professionals` (agrupado por área, con `id` e `id_calendario`) y `GET /api/get-hours`.
- **Auth:** `authController.getArea` (por sesión), `getCalenID` (por **id**, público), `saveArea`;
  corregido el typo `rol`→`role` en `login` (§5). El rate-limit estricto pasó a login/register.
- **`/api/user`** ahora devuelve también `fullName` y `email`.
- **Frontend:** `main.js` sin IP hardcodeada (rutas relativas) y el `calendarId` viaja por request
  (`window.CALENDAR_ID`, publicado por `select-prof.js`); se eliminó `/set-calendar`. El `<select>` de
  profesionales usa el `id` como value. Historia clínica dejó de enviar `password`.
- **DB:** `ALTER TABLE persona ADD COLUMN IF NOT EXISTS email` (aditivo) + Sección B (historia clínica).

### 2026-09-13 — Fase 0 sobre `dev`
- Eliminado MongoDB (`models/`, `config/database.js`, `pacienteController`, `pacienteRoutes`,
  `dashboardConfig copy.js`); quitadas deps `mongoose`/`mongodb`/`connect-mongo`/`node`.
- Nuevo `middleware/auth.js`; rutas privadas protegidas por rol/sesión.
- Controllers: `user_id` desde la sesión (mapeo correcto `id` vs `idRole`) → IDOR cerrado.
- `index.js` endurecido: helmet, CORS allowlist, rate-limit, cookies seguras, store de sesión
  con `connect-pg-simple`; sin `CALENDAR_ID` global; credenciales de Google desde memoria;
  se conservó `/especialidades` (público) e `idRole` en `/api/user`.
- Añadidos `.env.example`, metadata en `package.json`, `db/esquema_supabase.sql`.

## 8. Decisiones
- [x] Todo en Supabase, sin MongoDB.
- [x] Modelo de venta: SaaS multi-clínica.
- [ ] Pasarela de pago: ¿Mercado Pago (AR) o Stripe? *(pendiente)*
- [ ] Frontend: ¿seguir en vanilla JS o migrar a framework? *(pendiente)*

## 9. Cómo correr
```bash
npm install
cp .env.example .env   # completar valores
npm run dev            # o: npm start
```
