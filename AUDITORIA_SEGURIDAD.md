# Auditoría de seguridad — Medilu

**Fecha:** 2026-09-20
**Alcance:** backend (Express + Supabase), políticas RLS (`backend/db/*.sql`), flujo de
autenticación/autorización y exposición de datos. Revisión estática de código.
**Objetivo:** detectar accesos indebidos por rol insuficiente y filtración de datos (PII/PHI).

---

## Resumen ejecutivo

La aplicación está **bien diseñada en el camino "por backend"**: la identidad siempre se
toma de la sesión del servidor (no del body), los controladores que usan `service_role`
acotan por `clinica_id` de la sesión, los tokens de gestión de turno se guardan hasheados,
los buckets de certificados/firmas son privados con URLs firmadas, y hay validación de
entrada con zod y rate-limiting en login/registro.

**Sin embargo, existe una falla sistémica en las políticas RLS** que rompe el aislamiento
por clínica en el camino "por JWT" (acceso directo a la API de Supabase). El equipo ya
identificó y corrigió este patrón para `certificado_medico` y `membresia`
(ver `faseC2_fix_rls_miembro.sql`), **pero la corrección nunca se aplicó a las tablas más
sensibles**: `turno`, `persona`, `paciente`, `registro_clinico`, `registro_diente`,
`horario_profesional`, `especialidad_profesional`, `pacientes_ortodoncia` y
`codigo_activacion`.

El impacto principal: un integrante del staff **dado de baja** (membresía `activo=false`),
o cualquier cuenta autenticada cuyo `persona.clinica_id` apunte a una clínica sin membresía
activa, **conserva acceso de lectura completo a la PII y a TODAS las historias clínicas de
esa clínica**, autenticándose directamente contra Supabase con la clave `anon` (que es
pública por diseño). El bloqueo de login del backend **no** es la frontera de seguridad en
este escenario.

| # | Severidad | Hallazgo |
|---|-----------|----------|
| 1 | **ALTA** | RLS de tablas tenant (`persona`, `paciente`, `registro_clinico`, …) sin verificar membresía activa → fuga masiva de PII/PHI a ex-staff vía API directa |
| 2 | **ALTA** | RLS `turno_clinica_select` sin guard de miembro → fuga de todos los turnos de la clínica |
| 3 | **MEDIA** | `codigo_activacion_tenant` (FOR ALL) permite a cualquier miembro crear/ver códigos → escalada: auto-aprovisionar cuentas |
| 4 | **MEDIA** | `horario_profesional_tenant` (FOR ALL) permite a cualquier miembro alterar horarios de otros profesionales |
| 5 | **MEDIA** | CORS abierto a cualquier origen con `credentials` cuando `ALLOWED_ORIGINS` está vacío |
| 6 | **MEDIA** | `/create-event` público: abuso del mailer (spam / email-bombing) |
| 7 | **BAJA** | CSP deshabilitada, fuga de `error.message`, password mínimo 6, otros (ver detalle) |

---

## Contexto clave: la clave `anon` es pública y PostgREST es accesible

El endpoint `GET /api/public-config` (`backend/index.js:136`) expone `SUPABASE_URL` y
`SUPABASE_KEY_PUBLIC` (correctamente — la `anon key` es segura de exponer). Pero esto
significa que **cualquier usuario registrado puede autenticarse directamente contra
Supabase Auth desde el navegador** (`signInWithPassword` con su email/contraseña) y luego
consultar la **API REST de PostgREST directamente**, sin pasar por el backend Express.

**Consecuencia:** para cualquier usuario autenticado, **la RLS es la única frontera de
seguridad**. Los guards de Express (`requireRole`, `requireClinicaAdmin`, etc.) protegen
únicamente los endpoints del backend; no protegen la base si el atacante habla directo con
Supabase. Todo lo que sigue parte de esta premisa.

---

## Hallazgo 1 — [ALTA] Políticas RLS tenant sin verificar membresía activa

**Archivos:** `backend/db/fase2c_rls_jwt.sql`, `fase2c2_rls_ortodoncia_clinica.sql`,
`fase2c3_rls_horarios_avatars.sql` · **Corrección de referencia ya existente:** `faseC2_fix_rls_miembro.sql`

### Descripción

La función `app_current_clinica_id()` (`faseA_membresia.sql:69`) devuelve, para un usuario
**sin membresías activas**, su clínica de origen por *fallback*:

```sql
WHEN (SELECT count(*) FROM mine) = 0 THEN
    (SELECT clinica_id FROM persona WHERE id_auth = auth.uid() LIMIT 1)
```

El propio proyecto documenta que esto es peligroso (`faseC2_fix_rls_miembro.sql:6-15`):

> `app_current_clinica_id()` devuelve, para los PACIENTES (que no tienen membresía), su
> clínica de origen por FALLBACK. Por eso una política con la rama
> `clinica_id = app_current_clinica_id()` daba verdadero también para cualquier paciente de
> esa clínica → un paciente veía los certificados de TODA la clínica.

El fix consistió en exigir además `app_is_clinica_member()` (membresía activa). **Ese fix
se aplicó solo a `certificado_medico` y `membresia`.** Las siguientes políticas quedaron
con el patrón vulnerable `clinica_id = app_current_clinica_id()` **sin** `app_is_clinica_member()`:

| Tabla | Política | Archivo | Modo |
|-------|----------|---------|------|
| `persona` | `persona_tenant` | fase2c / faseA | FOR ALL |
| `paciente` | `paciente_tenant` | fase2c | FOR ALL |
| `registro_clinico` | `registro_clinico_tenant` | fase2c | FOR ALL |
| `registro_diente` | `registro_diente_tenant` | fase2c | FOR ALL |
| `especialidad_profesional` | `especialidad_profesional_tenant` | fase2c / faseA | FOR ALL |
| `horario_profesional` | `horario_profesional_tenant` | fase2c3 | FOR ALL |
| `pacientes_ortodoncia` | `pacientes_ortodoncia_tenant` | fase2c2 | FOR ALL |
| `codigo_activacion` | `codigo_activacion_tenant` | fase2c2 | FOR ALL |

### Escenario de explotación (concreto y realista)

1. Un/a recepcionista o profesional trabaja en la Clínica X. Su `persona.clinica_id = X` y
   tiene `membresia(activo=true)`.
2. El admin lo/a **da de baja**: `membresia.activo = false` (panel de administración, Fase B).
   El backend, a partir de ese momento, le **niega el login** (`authController.login:291`,
   "sin membresía activa" → 403 y `session.destroy`).
3. **Pero su cuenta de Supabase Auth sigue siendo válida.** Autentica directamente contra
   Supabase con la `anon key` pública → obtiene un JWT válido.
4. Como no tiene membresías activas, `app_current_clinica_id()` cae al *fallback* y devuelve
   `X` (su clínica de origen). `app_is_clinica_member()` devuelve `false`.
5. Las políticas de arriba solo comprueban `clinica_id = X` → **todas dan verdadero**.
   El ex-integrante puede hacer `SELECT` (y en las `FOR ALL`, también `UPDATE`/`DELETE`/`INSERT`)
   sobre:
   - `persona` → **PII completa** de todos los pacientes y profesionales de X (nombre, DNI,
     teléfono, email, dirección, fecha de nacimiento).
   - `registro_clinico` + `registro_diente` → **todas las historias clínicas** de X
     (síntomas, diagnósticos, tratamientos, odontograma).
   - `horario_profesional`, `pacientes_ortodoncia`, etc.

En contraste, `certificado_medico`, `membresia` y `bloqueo_horario` **sí** le niegan el
acceso (porque exigen `app_is_clinica_member()`), lo que demuestra la inconsistencia.

> **Nota sobre pacientes auto-registrados:** hoy el registro público de paciente
> (`authController.register`, rol `PACIENTE`) deja `persona.clinica_id = NULL`, por lo que
> el *fallback* devuelve `NULL` y estas políticas **no** matchean para ellos. Es decir, la
> fuga hacia pacientes está mitigada **solo por casualidad** de ese invariante. Es frágil:
> si en el futuro un paciente obtiene un `clinica_id` (o se reutiliza una `persona` con
> login), la fuga se vuelve masiva e inmediata. La corrección correcta no debe depender de
> ese invariante.

### Remediación

Aplicar el mismo patrón de `faseC2` a todas las tablas de la tabla anterior: la rama "por
clínica" debe exigir `app_is_clinica_member()`, y el acceso a datos propios debe expresarse
explícitamente (paciente dueño / identidad propia). Ver `backend/db/faseG_fix_rls.sql`
propuesto al final de este documento.

---

## Hallazgo 2 — [ALTA] `turno_clinica_select` sin guard de miembro

**Archivo:** `backend/db/fase3_turnos.sql:109-113`

```sql
CREATE POLICY turno_clinica_select ON turno
    FOR SELECT TO authenticated
    USING (clinica_id = public.app_current_clinica_id());   -- ← falta app_is_clinica_member()
```

Es el mismo defecto del Hallazgo 1 aplicado a `turno`. `faseE_recepcion.sql:17` confirma que
esta política se dejó a propósito para la lectura por-JWT, pero sin el guard de miembro.

**Impacto:** un ex-integrante del staff (o cualquier cuenta con `clinica_id` de la clínica y
sin membresía activa) puede leer **todos los turnos de la clínica** vía API directa:
`paciente_nombre`, `paciente_email`, `paciente_telefono`, `profesional_nombre`,
`especialidad`, fecha/hora. Esto revela quién es paciente de quién y cuándo (dato sensible,
p. ej. atención con determinada especialidad).

> El acceso legítimo del paciente a sus propios turnos usa `turno_paciente_select`
> (`id_paciente = app_current_paciente_id()`), que es correcto y debe conservarse.

**Remediación:** añadir `AND public.app_is_clinica_member()` a `turno_clinica_select`
(incluido en el SQL propuesto).

---

## Hallazgo 3 — [MEDIA] Gestión de códigos de activación abierta a todo el staff

**Archivo:** `backend/db/fase2c2_rls_ortodoncia_clinica.sql:52-56`

```sql
CREATE POLICY codigo_activacion_tenant ON codigo_activacion
    FOR ALL TO authenticated
    USING (clinica_id = public.app_current_clinica_id())
    WITH CHECK (clinica_id = public.app_current_clinica_id());
```

En el backend, generar/listar/eliminar códigos exige `requireClinicaAdmin`
(`clinicaRoutes.js`). Pero esta política RLS es `FOR ALL` y solo comprueba la clínica: **por
API directa, cualquier miembro de la clínica** (profesional no-admin o recepción) puede
`SELECT`/`INSERT`/`UPDATE`/`DELETE` códigos de activación.

**Impacto (escalada de privilegios dentro de la clínica):** un profesional no-admin puede
crear códigos de activación y así **aprovisionar nuevas cuentas de profesional o recepción**
en la clínica sin autorización del admin. También puede leer los códigos existentes.

> La política `codigo_activacion_admin_delete` de `faseA` (admin + `usado=false`) es correcta,
> pero es **aditiva**: convive con la `FOR ALL` permisiva, que la deja sin efecto práctico.

**Remediación:** reemplazar `codigo_activacion_tenant` por políticas separadas que exijan
`app_is_clinica_admin()` para `INSERT/UPDATE/DELETE` y (como mínimo) `app_is_clinica_member()`
para `SELECT`.

---

## Hallazgo 4 — [MEDIA] Cualquier miembro puede editar horarios de otros profesionales

**Archivo:** `backend/db/fase2c3_rls_horarios_avatars.sql:22-32`

`horario_profesional_tenant` es `FOR ALL` acotada solo por clínica. El backend
(`horarioController`) siempre filtra por `id_profesional = req.session.user.idRole` (correcto),
pero por API directa **cualquier miembro de la clínica** —incluida la recepción, que no es
profesional— puede insertar/modificar/borrar los horarios de **cualquier** profesional de la
clínica.

**Impacto:** manipulación de disponibilidad ajena (no hay fuga de datos personales). Menor
que 1–3 pero rompe el principio de menor privilegio.

**Remediación:** restringir la escritura al profesional dueño
(`id_profesional` correspondiente a `auth.uid()`); dejar la lectura por clínica si se desea.

---

## Hallazgo 5 — [MEDIA] CORS permite cualquier origen con credenciales si `ALLOWED_ORIGINS` está vacío

**Archivo:** `backend/index.js:55-65`

```js
if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    return cb(null, true);
}
```

Con `credentials: true`, si `ALLOWED_ORIGINS` no está configurado (el `.env.example` indica
"Dejar vacío en desarrollo permite cualquier origen"), **en producción** cualquier sitio web
podría realizar peticiones autenticadas cross-origin contra la API y leer las respuestas,
usando la cookie de sesión de la víctima.

**Impacto:** exfiltración de datos de sesión / acciones cross-origin si la variable no se
setea en el deploy. La mitigación actual es `sameSite: 'lax'` en la cookie (bloquea el envío
de cookies en la mayoría de requests cross-site), lo que reduce el riesgo, pero la config no
debería **fallar abierta**.

**Remediación:** en `NODE_ENV=production`, si `ALLOWED_ORIGINS` está vacío, **denegar** por
defecto (o exigir la variable al arrancar). Nunca reflejar un origen arbitrario con
`credentials`.

---

## Hallazgo 6 — [MEDIA] `/create-event` público: abuso del mailer

**Archivo:** `backend/index.js:247-344`

La reserva pública de turnos no requiere autenticación (correcto para el negocio) y envía un
email de confirmación a la dirección que venga en el body. Solo la protege el limiter general
(`300 req / 15 min` por IP, `index.js:71`).

**Impacto:** un atacante puede crear turnos en masa y **usar el mailer de la clínica para
enviar emails a direcciones arbitrarias** (spam / email-bombing), dañando la reputación del
dominio remitente. También puede llenar la agenda con turnos basura.

**Remediación:** limiter dedicado más estricto para `/create-event` (por IP y por email),
verificación tipo captcha en la página de reserva, y/o confirmación por doble opt-in antes de
ocupar el slot.

---

## Hallazgo 7 — [BAJA] Endurecimiento varios

- **CSP deshabilitada** — `helmet({ contentSecurityPolicy: false })` (`index.js:47`). Sin
  Content-Security-Policy la superficie de XSS es mayor. Definir una CSP explícita (ya está
  anotado como TODO en el código).
- **Fuga de detalles de error** — `/create-event` y `/available-slots` responden
  `details: error.message` (`index.js:238,342`). Puede revelar estructura interna/DB. Quitar
  `details` en producción.
- **Password mínimo 6 caracteres** — `schemas.auth.register` (`schemas.js:24`). Débil para
  datos de salud; subir a ≥10 y/o exigir complejidad. (Supabase Auth permite políticas.)
- **Inyección HTML en email de confirmación** — `summary` (controlado por el cliente) se
  interpola en el HTML del email (`index.js:336`). Impacto bajo (el email va a la propia
  dirección indicada por quien reserva), pero conviene escapar.
- **Código muerto de autorización** — `requireAdmin` / `EMAIL_AUTORIZADO`
  (`middleware/auth.js:31`) ya no se usan (el admin es por `requireClinicaAdmin`). Eliminar
  para evitar confusión y un futuro uso incorrecto.
- **Sesión** — `SESSION_SECRET` tiene fallback `'cambia-esto-en-produccion'` y sin
  `DATABASE_URL` se usa `MemoryStore` (ambos ya advertidos por consola). Asegurar en el deploy
  que ambas variables estén definidas.
- **Avatares** — bucket `avatars` público, nombre = `<auth.uid()>.png` (`avatarsController`).
  El `uid` se expone en `/api/user`. Enumerable; impacto bajo (solo la foto de perfil).

---

## Buenas prácticas observadas (a conservar)

- Identidad **siempre** desde `req.session`, nunca del body → evita IDOR en todo el backend
  (`middleware/auth.js`, controladores).
- Controladores con `service_role` **acotados por `clinica_id` de la sesión**
  (`recepcionController`, `adminController`, `hcController`) — bien encapsulado.
- Tokens de gestión de turno para invitados: aleatorios (32 bytes) y **guardados solo como
  hash SHA-256**; sin buscador por email (anti-enumeración) (`utils/turnoToken.js`,
  `turnosController`).
- Buckets `firmas`/`certificados` **privados**, con URLs firmadas de 120 s
  (`certificadoController`).
- Validación de entrada con zod en las rutas sensibles (`validators/schemas.js`).
- `forgot-password` con **respuesta genérica** (anti-enumeración de emails).
- Rate-limit estricto en `login`/`register`/`forgot-password` (`authRoutes.js`).
- `service_role` **solo** en el servidor; el frontend no contiene claves privadas (verificado).

---

## Remediación propuesta (SQL)

Crear `backend/db/faseG_fix_rls.sql` (idempotente) que aplique el guard de miembro a todas
las políticas afectadas. Esqueleto de referencia:

```sql
-- turno: la rama por clínica exige staff activo (Hallazgo 2)
DROP POLICY IF EXISTS turno_clinica_select ON turno;
CREATE POLICY turno_clinica_select ON turno
    FOR SELECT TO authenticated
    USING (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id());

-- persona / paciente / registro_clinico / registro_diente / especialidad_profesional /
-- horario_profesional / pacientes_ortodoncia (Hallazgo 1): en cada USING/WITH CHECK
-- que hoy compara solo clinica_id, anteponer app_is_clinica_member().
-- Conservar la excepción de identidad propia (OR id_auth = auth.uid()) donde ya existe.

-- Ejemplo (persona):
DROP POLICY IF EXISTS persona_tenant ON persona;
CREATE POLICY persona_tenant ON persona
    FOR ALL TO authenticated
    USING ((public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
           OR id_auth = auth.uid())
    WITH CHECK ((public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id())
           OR id_auth = auth.uid());

-- codigo_activacion (Hallazgo 3): separar por operación y exigir admin en escritura.
DROP POLICY IF EXISTS codigo_activacion_tenant ON codigo_activacion;
CREATE POLICY codigo_activacion_select ON codigo_activacion
    FOR SELECT TO authenticated
    USING (public.app_is_clinica_member() AND clinica_id = public.app_current_clinica_id());
CREATE POLICY codigo_activacion_admin_write ON codigo_activacion
    FOR INSERT TO authenticated
    WITH CHECK (public.app_is_clinica_admin() AND clinica_id = public.app_current_clinica_id());
-- (UPDATE/DELETE análogos con app_is_clinica_admin(); la DELETE de usado=false ya existe.)

-- horario_profesional (Hallazgo 4): escritura solo del profesional dueño.
-- (Restringir id_profesional al profesional cuyo persona.id_auth = auth.uid().)
```

> **Importante:** validar los cambios con las pruebas E2E existentes por rol
> (admin / profesional / recepción / paciente / invitado) para no romper accesos legítimos,
> y revisar que el flujo multi-clínica (header `x-clinica-id`) siga funcionando.

---

## Estado de remediación (2026-09-20)

| # | Estado | Acción |
|---|--------|--------|
| 1 | ✅ Corregido (falta correr SQL) | `backend/db/faseG_fix_rls.sql`: guard `app_is_clinica_member()` en `persona`, `paciente`, `registro_clinico`, `registro_diente`, `especialidad_profesional`, `pacientes_ortodoncia`, `clinica` |
| 2 | ✅ Corregido (falta correr SQL) | `faseG_fix_rls.sql`: `turno_clinica_select` ahora exige staff activo |
| 3 | ✅ Corregido (falta correr SQL) | `faseG_fix_rls.sql`: `codigo_activacion` — lectura/escritura solo admin |
| 4 | ✅ Corregido (falta correr SQL) | `faseG_fix_rls.sql`: `horario_profesional` — escritura solo del profesional dueño |
| 5 | ✅ Corregido | `index.js`: CORS falla cerrado en producción si `ALLOWED_ORIGINS` está vacío |
| 6 | ✅ Corregido | `index.js`: limiter dedicado `createEventLimiter` (10 / 15 min) en `/create-event` |
| 7 | ✅ Corregido | Quitado `details: error.message`, escape HTML del `summary` en emails, password mínimo 8, eliminado código muerto `requireAdmin`, y **CSP explícita** (estricta para el SPA, relajada con allowlist de CDNs para las `.html` legacy). Verificado en el navegador: SPA y páginas legacy cargan sin violaciones de CSP. |

> **APLICADO en Supabase (2026-09-20):** se ejecutaron las migraciones
> `faseG_fix_rls` (hallazgos 1–4) y `faseG2_revoke_anon` (defensa en profundidad:
> se revocó todo privilegio del rol `anon` sobre las tablas de negocio; ver
> `backend/db/faseG2_revoke_anon.sql`). Verificado: las 11 políticas quedaron con el
> guard de miembro activo y `anon` ya no tiene grants sobre esas tablas.
>
> **Advisors de Supabase restantes (WARN, opcionales):** activar *leaked password
> protection* en Auth, y programar el upgrade de la versión de Postgres.

---

## Verificación post-remediación (2026-09-20)

Chequeos ejecutados sobre la base de producción tras aplicar las migraciones:

- **Cobertura de RLS:** las **15 tablas** de `public` tienen RLS habilitada y al menos una
  política. No hay tablas con RLS deshabilitada ni con RLS activa pero sin políticas.
- **Rol `anon`:** 0 privilegios sobre las tablas de negocio (verificado en
  `information_schema.role_table_grants`).
- **Políticas nuevas:** las 11 tablas de `faseG` quedaron con el guard de miembro/admin
  activo; desapareció la política permisiva `codigo_activacion_tenant`.
- **Storage:** buckets `certificados` y `firmas` **privados**; la única política de
  `storage.objects` es `avatar_rw_own` (cada usuario solo su propio avatar). Los buckets
  sensibles no tienen políticas para `authenticated`/`anon` → solo accesibles por el backend
  (service_role) vía URLs firmadas.
- **CSP:** verificada en el navegador (SPA y páginas legacy cargan sin violaciones).

Resultado: el plano de datos (RLS + grants + storage) quedó consistente y sin fugas
conocidas para los vectores del informe.

---

## Priorización sugerida

1. **Hallazgos 1 y 2** — aplicar el guard `app_is_clinica_member()` a las políticas RLS
   (fuga de PII/PHI). Máxima prioridad.
2. **Hallazgo 3** — cerrar la gestión de códigos a admin en RLS (escalada de privilegios).
3. **Hallazgo 5** — hacer que CORS falle cerrado en producción.
4. **Hallazgos 4 y 6** — menor privilegio en horarios y anti-abuso del mailer.
5. **Hallazgo 7** — endurecimiento incremental.
