# Auditoría de flujos, bugs y seguridad — Medilu

**Fecha:** 2026-10-15 · **Rama:** `dev` (f0b711f)
**Alcance:** backend completo (rutas, middleware, controllers, utils), políticas RLS y permisos
**leídos en vivo** en la base de producción (`rpdrgmvcxhxuwxkwixyy`, solo lectura), frontend
(sinks de XSS, redirecciones, uso de Supabase). Continúa la auditoría del 2026-09-20.

> Nada se ejecutó contra producción salvo consultas de lectura. Los ataques sobre RLS están
> confirmados leyendo las políticas, los GRANT por columna y los triggers reales, **no** se
> probaron escribiendo datos. Conviene reproducirlos en un branch de Supabase al corregir.
>
> Estado de los datos: 5 personas, 2 clínicas; no se encontraron rastros de explotación
> (personas huérfanas con cuenta, `id_auth` inexistentes, turnos largos o solapados).

## Lo que ya está bien (verificado en vivo)

- Las correcciones de `faseG_fix_rls.sql` **están aplicadas**: `turno_clinica_select`,
  `persona_select`, `registro_clinico_select`, etc. exigen `app_is_clinica_member()`.
- `codigo_activacion` y `membresia` solo los escribe el admin; `horario_profesional` solo su dueño.
- Buckets privados (`estudios`, `certificados`, `firmas`, `autorizaciones`) con URLs firmadas de 120 s y paths con UUID.
- Tokens de gestión de turno hasheados; webhook de MP re-consulta el recurso en MP.
- Frontend: sin `dangerouslySetInnerHTML`, sin redirecciones abiertas, CSP estricta.

## Resumen

| # | Sev. | Hallazgo |
|---|------|----------|
| 1 | **CRÍTICA** | Un profesional (no admin) se hace **admin** de su clínica —y de las otras clínicas del admin— cambiando `persona.id_auth` por la API de Supabase |
| 2 | **ALTA** | Cualquier cuenta (registro abierto) "planta" una persona con el DNI de un paciente en cualquier clínica y **recibe su historia clínica** cuando la clínica lo da de alta |
| 3 | **ALTA** | `/create-event` (anónimo) acepta cualquier `start`/`end`: un turno de un año **bloquea toda la agenda** del profesional |
| 4 | MEDIA | El paciente puede editar cualquier columna de su turno (mover a otra clínica/profesional/hora, cambiar email) |
| 5 | MEDIA | `profesional` / `especialidad_profesional`: cualquier miembro (incluida recepción) edita médicos ajenos; cualquier cuenta se publica como "profesional" en la página de turnos de otra clínica |
| 6 | MEDIA | Un profesional puede modificar o borrar registros de HC de otros profesionales por la API (inviolabilidad, Ley 26.529) |
| 7 | MEDIA | La sesión del backend no se invalida al dar de baja/cambiar rol: hasta 24 h el ex-admin puede exportar todas las HC |
| 8 | MEDIA | Registro: con un email ya existente se crean persona/clínica/membresía con un `id_auth` falso y se quema el código de activación |
| 9 | MEDIA | Importar HC (cualquier profesional) permite inyectar registros con fecha y nombre de profesional arbitrarios |
| 10 | MEDIA | Cambio de plan sin checkout: upgrade inmediato y se cobra recién en el próximo débito (abusable) |
| 11 | BAJA | Descargas: el backend firma con service_role un `archivo_path` que el usuario puede escribir |
| 12 | BAJA | Endurecimiento varios (ver lista) |

---

## 1 — [CRÍTICA] Escalada a admin vía `persona.id_auth`

**Dónde:** política `persona_tenant` (última versión en `backend/db/faseJ_auditoria.sql:180`) +
`GRANT UPDATE` de todas las columnas de `persona` a `authenticated` (sin trigger que las proteja).

```
persona_tenant [ALL]  USING/CHECK:
  (app_puede_escribir_hc() AND clinica_id = app_current_clinica_id()) OR (id_auth = auth.uid())
```

Un profesional de la clínica A, autenticado directo contra Supabase con la anon key (pública
en `/api/public-config`):

1. `UPDATE persona SET clinica_id = NULL WHERE id = <su persona>` — pasa por la rama
   `id_auth = auth.uid()`. Sirve para liberar el índice único `(id_auth, clinica_id)`. Sus
   membresías siguen colgando de esa persona, así que sigue siendo profesional en A.
2. `UPDATE persona SET id_auth = <su uid> WHERE id = <persona del admin de A>` — pasa por la
   rama `app_puede_escribir_hc() AND clinica_id = A`.

Desde ese momento `app_is_clinica_admin()` le da `true` (las membresías del admin cuelgan de esa
persona), incluidas las membresías del admin en **otras clínicas**. El admin real pierde el
acceso. Por el backend también puede entrar como admin (`perfilesDeCuenta` busca personas por
`id_auth` y toma la primera con membresías).

Con la misma rama, un profesional puede atar a su cuenta la ficha de cualquier paciente de la
clínica (el paciente pierde su acceso y la ficha aparece en "Mi historia" del atacante).

**Corrección:** que `authenticated` no pueda tocar `id_auth`, `clinica_id` ni `dni`:
`REVOKE UPDATE ON persona FROM authenticated; GRANT UPDATE (nombre, apellido, telefono, direccion,
sexo, fecha_nacimiento, email) ON persona TO authenticated;` y, para INSERT, sacar la rama
`id_auth = auth.uid()` (exigir `id_auth IS NULL AND clinica_id = app_current_clinica_id() AND
app_puede_escribir_hc()`). El backend no usa esa rama para escribir: el autoregistro, Mi cuenta
y la vinculación de cuentas usan service_role.

## 2 — [ALTA] Persona "plantada" → la HC del paciente va a la cuenta del atacante

**Dónde:** la misma rama `id_auth = auth.uid()` de `persona_tenant` (en INSERT) +
`pacienteController.js:195` (`sumarPersonaDeLaClinica`) + `hcController.js:285` (import).

1. El atacante se registra como paciente (o llama a `signUp` de Supabase directo).
2. Obtiene el UUID de la clínica en `GET /clinica-publica?clinica=<slug>` (devuelve `id`).
3. `INSERT INTO persona (clinica_id, dni, nombre) VALUES (<clínica>, <DNI de la víctima>, <su nombre>)`
   — `id_auth` toma por defecto `auth.uid()`, o sea el atacante.
4. Cuando la clínica da de alta a la víctima, `regisPacient` encuentra una persona con ese DNI
   **sin ficha de paciente**, asume que "es alguien del equipo" y le crea la ficha y la primera
   consulta encima. `existe-pacient` devolvía `existe:false`, así que el profesional no ve nada raro.
5. Le llega al atacante el mail "Tu historia clínica ya está en tu cuenta" y ve todo en `/mi-historia`.

**Corrección:** la del #1 (cerrar la rama en INSERT) y, además, en `regisPacient` e `importar`
tratar la persona existente como "del equipo" **solo si tiene membresía activa en la clínica**.

## 3 — [ALTA] `/create-event` sin validar el horario

**Dónde:** `backend/validators/schemas.js:265` (`start`/`end` son strings cualquiera) e
`index.js:372`.

- `start` = mañana, `end` = dentro de un año → `estaLibre` da `true`, se inserta. Después
  `estaLibre` (`utils/disponibilidad.js:84`) devuelve `false` para **cualquier** horario de ese
  profesional durante el año: nadie puede reservar, ni online ni por recepción. Mientras tanto
  `/available-slots` sigue mostrando los horarios como libres (solo mira turnos que empiezan ese día).
- Se aceptan turnos en el pasado, fuera del horario de atención o con `end < start`.
- Una fecha inválida hace que `toISOString()` lance → 500.
- Sin restricción de exclusión en `turno`: dos reservas simultáneas al mismo horario pasan las dos.

**Corrección:** validar en el server que `start` sea futuro, `end - start = 30 min`, y que el
slot esté en `slotsDisponibles(profId, fecha, franjas)` (la misma función que alimenta la
página). Agregar un `EXCLUDE USING gist (id_profesional WITH =, tstzrange(inicio, fin) WITH &&)
WHERE (estado <> 'cancelado')` para cerrar la carrera. Lo mismo para `crearTurno`/`reprogramar` del staff.

## 4 — [MEDIA] El paciente edita cualquier columna de su turno

**Dónde:** `turno_paciente_update` (`faseO_paciente_multiclinica.sql:83`) + `GRANT UPDATE` de
todas las columnas. El backend solo necesita `estado`.

Por la API el paciente puede cambiar `inicio`, `fin`, `id_profesional` y `clinica_id` (mete
turnos en la agenda de cualquier clínica sin chequeo de disponibilidad), y `paciente_email` +
`recordatorio_enviado=false` (el recordatorio sale a una dirección de terceros).

**Corrección:** `REVOKE UPDATE ON turno FROM authenticated; GRANT UPDATE (estado) ON turno TO authenticated;`
y en la política exigir `estado = 'cancelado'` en el `WITH CHECK`.

## 5 — [MEDIA] Filas `profesional` editables por toda la clínica y "profesionales falsos"

**Dónde:** `profesional_tenant` y `especialidad_profesional_tenant` (`faseG_fix_rls.sql:58,112`),
FOR ALL, con `GRANT INSERT/UPDATE` de todas las columnas.

- Cualquier miembro de la clínica, incluida recepción, puede cambiar `matricula`, `firma_path`,
  `precio`, `turnos_online` o incluso `id_persona` de otro profesional.
- Cualquier cuenta puede insertarse una fila `profesional` + especialidad + horario para su
  propia persona y poner su `persona.clinica_id` en otra clínica (#1). Como la página pública
  (`publicController.js:28`) y `/create-event` deciden la clínica por `persona.clinica_id` y no por
  membresía, aparece como profesional en la página de turnos de esa clínica y los turnos caen en su agenda.

**Corrección:** UPDATE solo sobre la fila propia y solo columnas de perfil (`direccion`,
`telefono`, `precio`, `descripcion`, `turnos_online`, `firma_path`, `firma_mime`); sin INSERT
para `authenticated`. En el listado público y en `/create-event`, exigir membresía activa del
profesional en la clínica.

## 6 — [MEDIA] HC modificable/borrable por la API

**Dónde:** `registro_clinico_tenant` FOR ALL (`faseJ_auditoria.sql:228`), y las equivalentes de
`registro_diente`, `registro_diagnostico`, `registro_practica`.

Un profesional puede hacer `UPDATE`/`DELETE` sobre registros de **otros** profesionales de la
clínica, sin pasar por la bitácora `hc_acceso`. El backend nunca edita ni borra registros. El
trigger existente solo protege las columnas de auditoría.

**Corrección:** dejar solo INSERT (con `id_profesional = app_current_profesional_id()`) y
un trigger que bloquee UPDATE/DELETE fuera de service_role.

## 7 — [MEDIA] Sesiones que sobreviven a la baja o al cambio de rol

`req.session.user` (`clinicaId`, `rol`, `esAdmin`) se fija en el login y no se vuelve a validar.
Los controllers con service_role confían en la sesión: un admin dado de baja puede seguir hasta
24 h en `/hc/export` (todas las HC de la clínica, `hcController.js:109`), gestionando turnos (`/staff`),
etc. Lo mismo después de un cambio o reseteo de contraseña.

**Corrección:** revalidar la membresía activa en un middleware para las rutas de staff (con
caché corta), o guardar una "versión de sesión" por persona que se incremente al dar de baja,
cambiar rol o contraseña. Llamar a `req.session.regenerate()` en el login (hoy no se hace: fixation).

## 8 — [MEDIA] Registro con email ya existente

**Dónde:** `authController.js:114-128`.

Con la confirmación de email activa, `signUp` con un email ya registrado **no da error**:
devuelve un usuario ofuscado con un `id` aleatorio y `identities: []`. El backend lo toma como
nuevo y crea persona, clínica con prueba, profesional, membresía de admin y marca el código de
activación como usado, todo atado a un `id_auth` que no existe.

Además: no hay rollback si falla un paso intermedio (quedan usuarios de Auth o clínicas a medias),
y el código de activación se valida al principio y se marca al final sin condición (`.eq('usado', false)`),
así que dos registros simultáneos pueden usar el mismo código.

**Corrección:** si `user.identities?.length === 0`, responder el mensaje genérico de "revisá tu
mail" sin crear nada. Marcar el código con `update ... .eq('usado', false).select()` **antes**
de crear filas y abortar si no actualizó ninguna.

## 9 — [MEDIA] Importar HC permite falsificar autoría y fecha

**Dónde:** `hcController.js:335-349`. Cualquier profesional (no solo admin) puede importar, y el
JSON fija `profesional_nombre` y `fecha`. Se pueden agregar registros con fecha anterior y el nombre
de otro médico en pacientes existentes, y aparecen en "Mi historia" del paciente.

**Corrección:** importar solo el admin, guardar quién importó (`importado_por`) y mostrar los
registros importados como tales en la HC y en el PDF.

## 10 — [MEDIA] Cambio de plan sin pagar la diferencia

**Dónde:** `suscripcionMp.js:119-127`. Con débito autorizado y el mismo ciclo, el cambio de plan rige
**ya** y el monto nuevo se cobra en el próximo débito. Con ciclo anual: se paga el plan más barato,
se sube al más caro el mismo día y se baja antes de la renovación. Es una decisión de negocio, pero
conviene que los upgrades rijan desde el próximo débito o cobren la diferencia.

## 11 — [BAJA] Firma de paths controlados por el usuario

`estudioController.js:393` y `certificadoController.js:332` firman con service_role el `archivo_path`
de una fila que el usuario puede escribir (`estudio` INSERT/UPDATE para el paciente; `certificado_medico`
INSERT para miembros). Hoy lo frena que los paths llevan UUID, pero un paciente que conoce un path
(p. ej. un profesional al que le compartieron un estudio y se lo revocaron) lo vuelve a firmar.
**Corrección:** validar el prefijo (`<idPaciente>/` o `<clinicaId>/`) antes de firmar y quitar
`archivo_path`/`id_paciente` de los GRANT UPDATE.

## 12 — [BAJA] Endurecimiento

- `index.js:168`: `SESSION_SECRET` tiene valor por defecto; en producción debería abortar el arranque.
- `MP_WEBHOOK_SECRET` no está en el `.env`: configurarlo (hoy lo mitiga la re-consulta a MP).
- Códigos de activación con `Math.random` y sin vencimiento (`clinicaController.js:13`): usar `crypto.randomInt` y caducar.
- Avatares: se acepta cualquier `image/*`, incluido SVG, en un bucket público (`avatarsRoutes.js`).
- Errores internos al cliente: `pacienteController.js:270,515,598` (`err.message`), `authController.js:565,683,696`, `index.js:571`.
- `anon` tiene `SELECT` sobre `estudio` y `estudio_compartido` (advisor de Supabase): revocar.
- Supabase Auth: "Leaked password protection" desactivado.
- El `.env` conserva credenciales de la service account de Google Calendar y de Twilio que ya no se usan: revocarlas en origen y quitarlas.
- `DNI_CON_CUENTA` (`pacienteController.js:209`) y la vinculación por DNI+email confirman a cualquier dueño de clínica (registro abierto) si un DNI tiene cuenta y con qué email.
- Si falla el mail, el profesional recibe la contraseña temporal del paciente y nada obliga a cambiarla.
- `/create-event` y `/api/solicitudes-consumo` mandan mails con texto del atacante a cualquier dirección (con límite de 10 y 5 cada 15 min por IP).

---

## Estado de remediación

| # | Estado | Detalle |
|---|--------|---------|
| 1, 2, 4, 5, 6 | ✅ Aplicado en producción (2026-10-15) | `backend/db/faseP_endurecer_rls.sql`. Verificado con `faseP_prueba_en_seco.sql` contra producción: ataques A1–A11 bloqueados, flujos L1–L7 OK y lecturas R1–R4 sin cambios. Reversión: `faseP_revertir.sql`. No quedó registrada en `supabase_migrations` (se corrió desde el SQL Editor). |
| 3, 7–12 | Pendiente | — |

Defensa en profundidad pendiente para el #2 (código): en `regisPacient` e `importar`, tratar una persona existente sin ficha como "del equipo" solo si tiene membresía activa en la clínica.

## Orden sugerido

1. **#1, #2, #4, #5, #6 juntos en una migración de RLS/GRANT** (`faseP_endurecer_rls.sql`): cierran
   la superficie de la API directa, que es lo más grave. Probarla primero en un branch de Supabase.
2. **#3** (validación de turnos + restricción de exclusión) y **#8** (registro).
3. **#7** (revalidar membresía en sesión + `regenerate`).
4. El resto.
