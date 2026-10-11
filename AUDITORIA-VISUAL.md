# Auditoría de bugs visuales — Medilu (frontend)

**Fecha:** 2026-09-25 · **Rama:** `dev` (`8b33330`) · **Alcance:** `frontend/src` completo (63 archivos, ~10.800 líneas)

**Método.** Lectura del código + compilación de la hoja de estilos real (`vite build`) para resolver
conflictos de utilidades + medición en navegador (Chromium, 1440×900 / 768×1024 / 375×812, temas claro
y oscuro). `tsc -b` pasa sin errores; `oxlint` no reporta errores (solo avisos, ninguno visual).

Los hallazgos marcados **[medido]** se verificaron con `getBoundingClientRect()` / `getComputedStyle()`
sobre la app corriendo, no por inspección.

> **Estado — 2026-09-25:** la **Tanda 1 está aplicada y verificada** (A1, A4, A5, A6, B2 y el `100dvh`
> de `RegisterRole`). 8 archivos, +11/−8 líneas. `tsc -b` y `oxlint` limpios; sin scroll horizontal en
> 9 rutas × 375 px y 1024 px. Los ítems resueltos quedan documentados abajo con sus medidas
> antes/después, tachados en el índice. **Quedan abiertos:** A2, A3 y todos los medios y bajos.

---

## Nota metodológica importante

El proyecto usa `cn` (paquete `cn@0.3.0`, reemplazo de `clsx + tailwind-merge`), no un `clsx` simple.
Eso cambia cómo se resuelven los `className` que se pasan a los componentes de `@/components/ui`:

| Caso | Qué pasa | Resultado |
|---|---|---|
| `h-10` sobre base `h-8` | mismo grupo → `cn` **borra** `h-8` | el override funciona ✅ |
| `p-6` sobre base `px-(--card-spacing)` | mismo grupo → `cn` **borra** la base | el override funciona ✅ |
| `max-w-lg` sobre base `sm:max-w-sm` | **variantes distintas** → `cn` conserva ambas | gana la variante ❌ |
| `h-10` sobre base `data-[size=default]:h-8` | **variantes distintas** → conserva ambas | gana la variante ❌ |
| `bg-transparent` sobre base `dark:bg-input/30` | **variantes distintas** → conserva ambas | gana la variante en oscuro ❌ |

**Regla práctica:** un `className` sin variante nunca puede vencer a una clase base que sí tenga
variante (`dark:`, `sm:`, `data-[…]:`), porque Tailwind v4 emite las variantes después en el CSS.
Tres de los bugs altos de abajo son exactamente esto.

---

## Resumen

| Severidad | Total | Resueltos | Abiertos |
|---|---|---|---|
| Alta | 6 | 4 | 2 (A2, A3) |
| Media | 10 | 0 | 10 |
| Baja / consistencia | 9 | 1 | 8 |

Los dos problemas de mayor impacto son **alturas de controles de formulario inconsistentes** (afecta
prácticamente todos los formularios de la app) y el **desborde del navbar del dashboard** (afecta a
profesionales y administradores en cualquier ancho de pantalla).

---

# Severidad alta

## ~~A1~~ · Alturas de controles inconsistentes en todos los formularios ✅ RESUELTO **[medido]**

Medición de las alturas reales que produce la hoja de estilos compilada:

| Componente | Altura (puntero fino) |
|---|---|
| `Input` con `h-10` | **40 px** |
| `SelectField` | **32 px** |
| `Button size="lg"` | **36 px** |
| `Button size="sm"` | **28 px** |
| `Button size="icon"` | **32 px** |

**Causa raíz.** [`SelectField`](frontend/src/components/form/SelectField.tsx:37) pasa `h-10`, pero
`SelectTrigger` trae `data-[size=default]:h-8` en su base. Como la variante `data-[…]` se emite
después en el CSS, el `h-10` **nunca se aplica**: es código muerto. Todos los `<Input>` de la app
llevan `h-10` explícito (49 de 63), así que el desajuste es de 8 px en cada fila mixta.

**Dónde se ve.** Cualquier fila que mezcle `Input` y `SelectField`:

- [Turnos.tsx:451](frontend/src/pages/dashboard/Turnos.tsx:451) — "Fecha" (40 px) junto a
  "Horario disponible" (32 px), en un `sm:grid-cols-2`. Es el caso más visible.
- [Config.tsx:539](frontend/src/pages/dashboard/Config.tsx:539) — el peor: `grid items-end`
  con "Día" (select, 32) + "Inicio" (input, 40) + "Fin" (input, 40) + botones `size="lg"` (36).
  **Cuatro alturas distintas alineadas al borde inferior en una sola fila.**
- [dashboard/Turnos.tsx:198](frontend/src/pages/dashboard/Turnos.tsx:198) — buscador (40) junto al
  filtro de estado (32) con `sm:items-center`.
- [Turnos.tsx:189](frontend/src/pages/Turnos.tsx:189), [RegisterPaciente.tsx](frontend/src/pages/RegisterPaciente.tsx),
  [RegisterProfesional.tsx](frontend/src/pages/RegisterProfesional.tsx),
  [RegistroClinico.tsx](frontend/src/pages/dashboard/RegistroClinico.tsx).

**Arreglo aplicado.** [`SelectField.tsx:37`](frontend/src/components/form/SelectField.tsx:37):
`h-10` → `data-[size=default]:h-10`. Al compartir modificador con la clase base, `cn` ahora sí
elimina `data-[size=default]:h-8`, y `pointer-coarse:…:h-11` (44 px en táctil) se conserva intacto.

**Verificado [medido]** en `/turnos`: los selects "Especialidad" y "Profesional" pasaron de **32 px
a 40 px**, iguales a los `Input` contiguos. Ningún caller pasa `className` a `SelectField`, así que
no hay conflictos nuevos. Un cambio de una línea corrige las ~15 pantallas listadas arriba.

---

## A2 · El navbar del dashboard no entra en su contenedor **[medido]**

[`DashboardNavbar.tsx:127`](frontend/src/components/dashboard/DashboardNavbar.tsx:127) usa
`max-w-6xl` (1152 px) con `px-6`, lo que deja **1104 px** de pista útil.

Ancho necesario medido con la tipografía real (Geist Variable, 14 px / 500):

| Bloque | Ancho |
|---|---|
| Logo | 150 px |
| `gap-6` | 24 px |
| 8 enlaces (perfil admin) | **942 px** |
| `gap-4` + bloque derecho (tema + Ayuda + chip de usuario) | ≥188 px |
| **Total** | **≈1304 px** |

**Desborda ≥200 px, y aumentar el ancho de pantalla no ayuda** porque `max-w-6xl` fija el tope. Con
7 enlaces (profesional no admin) sigue sin entrar. Los `NavLink` no tienen `whitespace-nowrap`, así
que las etiquetas largas ("Configuración", "Registro clínico", "Administración") rompen en dos
líneas y se salen del `h-16`.

Solo el rol **recepción** (1 enlace) se salva.

**Arreglo.** Opciones: subir a `max-w-7xl` y mover parte de los enlaces a un menú "Más"; o pasar a
navegación lateral en el dashboard; o mostrar solo iconos con tooltip entre `md` y `xl`.

---

## A3 · Campos de 32 px en las pantallas de autenticación **[medido]**

14 `<Input>` no llevan `h-10` y quedan en 32 px, mientras el resto de la app usa 40 px:

| Archivo | Líneas |
|---|---|
| [Login.tsx](frontend/src/pages/Login.tsx:76) | 76, 92 |
| [ForgotPassword.tsx](frontend/src/pages/ForgotPassword.tsx:83) | 83 |
| [ResetPassword.tsx](frontend/src/pages/ResetPassword.tsx:164) | 164, 178 |
| [dashboard/Certificados.tsx](frontend/src/pages/dashboard/Certificados.tsx:226) | 226, 270, 278, 291, 319 |
| [MisEstudios.tsx](frontend/src/pages/MisEstudios.tsx:402) | 402, 413, 443, 617 |

Verificado en `/login`: campos de **32 px** con un botón de envío de **36 px** debajo. El contraste
es fuerte porque *Registro* (a un clic de distancia, mismo `AuthShell`) usa 40 px.

Además, los dos `type="file"` (MisEstudios:402, Certificados:319) quedan apretados: el botón nativo
del archivo mide 24 px dentro de una caja de 32 px.

---

## ~~A4~~ · Botón fantasma sobre la banda azul en modo oscuro ✅ RESUELTO **[medido]**

[`Home.tsx:475-482`](frontend/src/pages/Home.tsx:475) — el botón "Pedir turno" del CTA final define
`border-white/30 bg-transparent hover:bg-white/10`, pero la variante `outline` del `Button` trae
`dark:border-input dark:bg-input/30 dark:hover:bg-input/50`. `cn` conserva ambas y la variante `dark:`
gana.

Valores computados en la app, tema oscuro:

```
background-color : oklab(1 0 0 / 0.048)   ← dark:bg-input/30  (se esperaba transparent)
border-color     : oklch(1 0 0 / 0.16)    ← dark:border-input (se esperaba white/30)
```

Sobre la banda `bg-primary` (celeste claro en oscuro), un borde blanco al 16 % es **invisible**: el
botón se lee como texto suelto, no como botón. Verificado en captura.

**Arreglo aplicado.** [`Home.tsx:479`](frontend/src/pages/Home.tsx:479): se agregaron
`dark:border-white/30 dark:bg-transparent dark:hover:bg-white/10`. Al compartir el modificador
`dark:`, `cn` elimina las tres clases de la variante `outline`.

**Verificado [medido]**, tema oscuro:

```
antes   background: oklab(1 0 0 / 0.048)   borde: oklch(1 0 0 / 0.16)
después background: rgba(0, 0, 0, 0)       borde: oklab(1 ... / 0.3)
```

**Pendiente de decisión:** sigue siendo un parche puntual. La solución sostenible es una variante
`on-primary` en `buttonVariants`, porque el mismo patrón reaparece en
[AuthShell](frontend/src/components/site/AuthShell.tsx:25).

---

## ~~A5~~ · Los diálogos de "Mis estudios" ignoran su ancho ✅ RESUELTO **[medido]**

[`MisEstudios.tsx:391`](frontend/src/pages/MisEstudios.tsx:391) y
[`MisEstudios.tsx:566`](frontend/src/pages/MisEstudios.tsx:566) usan `DialogContent className="max-w-lg"`
(512 px esperados). Medido: **384 px** — `sm:max-w-sm` de la base gana.

Y hay un efecto secundario peor: `cn` **sí** elimina `max-w-[calc(100%-2rem)]` de la base (mismo
grupo). Medido a 375 px de ancho: el diálogo ocupa de `left: 0` a `right: 375` — **pegado a ambos
bordes, sin el margen de 16 px** que tienen todos los demás diálogos de la app.

**Arreglo aplicado.** [`MisEstudios.tsx:391`](frontend/src/pages/MisEstudios.tsx:391) y
[`:566`](frontend/src/pages/MisEstudios.tsx:566): `max-w-lg` → `sm:max-w-lg`.

**Verificado [medido]:** `max-width` pasó de **384 px a 512 px**. Y como `sm:max-w-lg` ya no colisiona
con `max-w-[calc(100%-2rem)]`, **el margen lateral de 16 px en móvil vuelve solo** — los dos síntomas
con un solo cambio.

---

## ~~A6~~ · `AuthShell` calcula mal el alto de la pantalla ✅ RESUELTO **[medido]**

[`AuthShell.tsx:20`](frontend/src/components/site/AuthShell.tsx:20) usa `min-h-[calc(100vh-4rem)]`,
que descuenta el navbar (`h-16`) pero **no el footer**. Las páginas de auth viven dentro de
`PublicLayout`, que sí renderiza footer. Medido en `/login` a 1440×768:

```
alto del documento : 1071 px
alto de ventana    :  768 px   → siempre hay scroll, el footer nunca entra
```

En móvil (375×812) es más visible: el `justify-center` centra el formulario en un bloque de 748 px,
dejando **~220 px de vacío** entre el navbar y el logo antes de que empiece el contenido.

Dos problemas adicionales: `100vh` en vez de `100dvh` (en iOS Safari la barra de direcciones corta el
contenido), y el mismo error aparece en [RegisterRole.tsx:32](frontend/src/pages/RegisterRole.tsx:32).

**Arreglo aplicado.** [`AuthShell.tsx:20`](frontend/src/components/site/AuthShell.tsx:20):
`min-h-[calc(100vh-4rem)]` → `lg:min-h-[calc(100dvh-4rem)]`. Dos cambios en uno: `dvh` arregla iOS, y
restringir la regla a `lg:` elimina la altura forzada en móvil, que era la causa del vacío. En
escritorio el split-screen se mantiene como estaba diseñado.

**Verificado [medido]:**

| | antes | después |
|---|---|---|
| Hueco sobre el logo (375 px) | ~220 px | **40 px** (el `py-10` intencional) |
| Alto del documento (375 px) | 1559 px | **1328 px** |
| Alto del aside (1024×768) | — | **704 px** = viewport − navbar (703) ✓ |

También se aplicó `100vh` → `100dvh` en
[`RegisterRole.tsx:32`](frontend/src/pages/RegisterRole.tsx:32), que tenía el mismo problema de unidad.

---

# Severidad media

## M1 · Padding vertical desbalanceado en todas las tarjetas **[medido]**

`Card` ya aplica `py-(--card-spacing)` (16 px) y casi todas las páginas le agregan `p-6` al
`CardContent`. Medido sobre una tarjeta real:

```
padding superior total : 40 px  (16 de Card + 24 de CardContent)
padding lateral total  : 24 px
```

Relación 1,67 : 1 donde el diseño pedía 1 : 1. Afecta **59 sitios**
(`grep -rn 'CardContent className="[^"]*p[xytb]\?-'`), con variantes peores: `p-8` → 48/32,
`p-10` → 56/40 en los estados vacíos de [dashboard/Turnos.tsx:225](frontend/src/pages/dashboard/Turnos.tsx:225).

**Arreglo.** Quitar los `p-*` de `CardContent` y controlar el espaciado con
`[--card-spacing:--spacing(6)]` en el `Card`, que es para lo que existe el token.

---

## M2 · Odontograma con colores fijos, ilegible en modo oscuro

[`lib/odontograma.ts:47`](frontend/src/lib/odontograma.ts:47) define `#2563eb` (realizado) y
`#dc2626` (a tratar) como hex literales. Sobre `--card` claro el contraste es ~6,3:1; sobre `--card`
oscuro (`oklch(0.235)`) cae a **~2,2:1**.

Peor: el relleno base de cada cara es `var(--card)` con `stroke="var(--border)"`, y en oscuro
`--border` es `oklch(1 0 0 / 12%)` — un blanco al 12 %. **El contorno de los dientes casi desaparece.**

Afecta [`Odontogram.tsx`](frontend/src/components/dashboard/Odontogram.tsx:254) líneas 254, 268, 282,
292, 303, 311, 328, 439, 469, 555, 559.

**Arreglo.** Mover los dos colores a tokens (`--odonto-realizado` / `--odonto-pendiente`) con valor
propio en `:root` y en `.dark`, y subir el `stroke` de las caras a algo como `var(--muted-foreground)`.

---

## M3 · El velo de los modales casi no se ve en modo oscuro

[`dialog.tsx:42`](frontend/src/components/ui/dialog.tsx:42) y
[`sheet.tsx:38`](frontend/src/components/ui/sheet.tsx:38) usan `bg-black/10` con `backdrop-blur-xs`.
En oscuro el fondo ya es casi negro (`oklch(0.19)`), así que un 10 % de negro no separa nada; y el
panel (`--popover`, `oklch(0.235)`) queda a 0,045 de luminancia del fondo. El modal "flota" sin
jerarquía.

**Arreglo.** `bg-black/10 dark:bg-black/50`, o subir el blur a `backdrop-blur-sm`.

---

## M4 · El botón de cerrar se va con el scroll en diálogos altos

[`dashboard/Turnos.tsx:565`](frontend/src/pages/dashboard/Turnos.tsx:565) —
`<DialogContent className="max-h-[90vh] overflow-y-auto">`. El `✕` de
[`dialog.tsx:74`](frontend/src/components/ui/dialog.tsx:74) es `absolute top-2 right-2` respecto de
ese mismo contenedor, así que al hacer scroll en el formulario "Nuevo turno" **el botón se desplaza
fuera de la vista**.

**Arreglo.** Envolver el cuerpo en un `div` con `overflow-y-auto` y dejar el `DialogContent` sin
scroll, para que header, ✕ y footer queden fijos.

---

## M5 · El diálogo "Nuevo turno" es demasiado angosto para su contenido

Mismo diálogo (384 px de ancho real): contiene dos `grid gap-4 sm:grid-cols-2`, o sea columnas de
~168 px. Ahí adentro hay un `<Input type="date">` (ancho intrínseco mínimo ~150 px en Chrome,
incluido el icono de calendario) y etiquetas como "Horario disponible" y "Nombre del paciente" que
rompen en dos líneas.

Mismo problema en [`FechaYHorario`](frontend/src/pages/dashboard/Turnos.tsx:447) y en
[NuevoBloqueoDialog](frontend/src/pages/dashboard/Turnos.tsx:940).

**Arreglo.** `sm:max-w-2xl` en esos `DialogContent` (con la variante `sm:`, ver A5).

---

## M6 · Select de ancho de contenido junto a un input de ancho completo

[`MisEstudios.tsx:429`](frontend/src/pages/MisEstudios.tsx:429) usa `<SelectTrigger>` pelado en vez
de `SelectField`. La base del trigger es `w-fit`, así que "Categoría" queda del ancho de su texto
mientras "Fecha del estudio", a su lado en el mismo `sm:grid-cols-2`, ocupa el 100 %. Borde derecho
dentado.

**Arreglo.** Usar `SelectField` (que sí pasa `w-full`) o agregar `className="w-full"`.

---

## M7 · Alturas mezcladas en las filas de acciones

`Button size="sm"` mide 28 px y `size="icon"` mide 32 px. Donde se combinan quedan desalineados
verticalmente:

- [MisEstudios.tsx:243-275](frontend/src/pages/MisEstudios.tsx:243) — "Compartir" (sm) + descargar
  (icon) + eliminar (icon).
- [MisTurnos.tsx:137](frontend/src/pages/MisTurnos.tsx:137),
  [Administracion.tsx:215](frontend/src/pages/dashboard/Administracion.tsx:215),
  [DashboardNavbar.tsx:153](frontend/src/components/dashboard/DashboardNavbar.tsx:153).

**Arreglo.** Usar `size="icon-sm"` (28 px) junto a `size="sm"`, o `size="default"` junto a `icon`.

---

## M8 · El avatar solo revela que es editable al pasar el mouse

[`Config.tsx:209`](frontend/src/pages/dashboard/Config.tsx:209) — la capa con el icono de cámara es
`opacity-0 … group-hover:opacity-100`. En táctil **no hay hover**, así que nada indica que la foto se
puede cambiar. Tampoco hay estado de foco visible: el `<button>` tiene `overflow-hidden rounded-full`
y ninguna clase `focus-visible:`.

**Arreglo.** Agregar `group-focus-visible:opacity-100` y, en táctil, un badge de cámara permanente
(`pointer-coarse:opacity-100` con un fondo más chico en una esquina).

---

## M9 · La tabla de horarios no puede hacer scroll

[`Config.tsx:487`](frontend/src/pages/dashboard/Config.tsx:487) — `<div className="overflow-x-auto">`
con `<table className="w-full">` adentro. Una tabla `w-full` nunca excede a su contenedor, así que el
`overflow-x-auto` **nunca se activa**: en pantallas angostas las 4 columnas se comprimen en vez de
desplazarse.

**Arreglo.** `<table className="w-full min-w-[32rem]">`.

---

## M10 · La grilla de estadísticas deja un hueco **[medido]**

[`Home.tsx:283`](frontend/src/pages/Home.tsx:283) — `HeroStats` usa `grid-cols-3` fijo, pero la
tercera estadística ("Especialidades") solo se agrega si `/professionals` responde con datos. Medido
en vivo con el backend caído: **3 columnas, 2 elementos** → una columna vacía de 133 px a la derecha.

Es el estado que ve cualquier visitante si la API falla o si todavía no hay especialidades cargadas.

**Arreglo.** `grid-cols-[repeat(auto-fit,minmax(0,1fr))]` o calcular las columnas según `stats.length`.

---

# Severidad baja / consistencia

## B1 · Componentes nativos donde el proyecto exige `@/components/ui`

`CLAUDE.md` dice *"Usa **siempre** componentes de `@/components/ui`"*. Tres incumplimientos con
consecuencia visual:

| Sitio | Qué hace | Consecuencia |
|---|---|---|
| [dashboard/Home.tsx:143](frontend/src/pages/dashboard/Home.tsx:143) | `<input>` con clases a mano | sin `focus-visible:ring`, y `bg-muted/40` en vez del `dark:bg-input/30` del resto |
| [NotFound.tsx:42](frontend/src/pages/NotFound.tsx:42) | `<button>` con clases a mano | debería ser `<Button variant="link">` |
| [Planes.tsx:66](frontend/src/pages/Planes.tsx:66) | tarjeta a mano | `rounded-2xl` + `border` + `ring-1` vs el `rounded-xl` + solo `ring-1` de `Card`; radio y contorno distintos al resto de la app |

## ~~B2~~ · "Última actualización: 2024" en las páginas legales ✅ RESUELTO

[`LegalArticle.tsx:12`](frontend/src/components/site/LegalArticle.tsx:12) tenía `updated = "2024"` por
defecto y ni [Terminos.tsx](frontend/src/pages/Terminos.tsx) ni
[Privacidad.tsx](frontend/src/pages/Privacidad.tsx) pasaban el prop. Ambas páginas mostraban una fecha
dos años vieja al pie — mala señal en un producto que maneja datos de salud.

**Arreglo aplicado.** No inventé una fecha: `git log` sobre ambos archivos dice que el texto legal no
se toca desde el **15-09-2026** (commit de migración a SPA), así que ese es el valor real. Además
`updated` pasó a ser **prop obligatorio** — sin valor por defecto, TypeScript obliga a pasarlo y la
clase de bug no puede repetirse en una página legal futura.

**Verificado:** ambas páginas renderizan "Última actualización: 15 de septiembre de 2026".

> **Para revisar con vos:** la fecha refleja el último cambio del *texto*, que es lo honesto. Si en
> algún momento un abogado revisó estos términos en otra fecha, ese sería el valor correcto.

## B3 · Placeholder de contraseña con puntos

[`Login.tsx:92`](frontend/src/pages/Login.tsx:92) usa `••••••••` como placeholder. Un campo vacío se
ve idéntico a uno lleno; además los lectores de pantalla lo anuncian como "bullet bullet bullet…".

## B4 · `hs` huérfano bajo la fecha

[`dashboard/Turnos.tsx:283`](frontend/src/pages/dashboard/Turnos.tsx:283) —
`<p className="text-xs text-muted-foreground">hs</p>` en su propia línea debajo de la fecha. Se lee
como una etiqueta suelta; debería ir en línea con la hora.

## B5 · `alt=""` en la foto de perfil

[`Config.tsx:203`](frontend/src/pages/dashboard/Config.tsx:203) y
[Config.tsx:222](frontend/src/pages/dashboard/Config.tsx:222) — la foto de perfil no es decorativa.
Con `alt=""` un lector de pantalla no anuncia nada donde debería decir "Foto de perfil".

## B6 · Marcador de rol actual poco claro

[`Administracion.tsx:255`](frontend/src/pages/dashboard/Administracion.tsx:255) — el rol vigente se
marca concatenando `" ·"` al final del texto. Un punto medio suelto no comunica "actual"; debería ser
un icono de check.

## B7 · `sm:ml-auto` dentro de una fila que envuelve

[`MisTurnos.tsx:157`](frontend/src/pages/MisTurnos.tsx:157) — el botón "Pedir turno" lleva
`sm:ml-auto` en un contenedor `flex flex-wrap`. Cuando los 5 botones envuelven, el `ml-auto` empuja el
último al extremo derecho de *su propia línea*, dejando un hueco grande e irregular.

## B8 · `URL.createObjectURL` sin liberar

[`Config.tsx:160`](frontend/src/pages/dashboard/Config.tsx:160) crea una object URL para la vista
previa del avatar y nunca llama a `revokeObjectURL`. Las otras dos descargas de la app
([MiHistoria.tsx:45](frontend/src/pages/MiHistoria.tsx:45),
[HistoriasClinicas.tsx:44](frontend/src/pages/dashboard/HistoriasClinicas.tsx:44)) sí lo hacen.

## B9 · Componentes de UI sin uso

`components/ui/accordion.tsx` y `components/ui/separator.tsx` no se importan desde ninguna página.

---

# Plan de acción sugerido

**~~Tanda 1~~ — aplicada y verificada el 2026-09-25** ✅

| # | Cambio | Archivo |
|---|---|---|
| 1 | `h-10` → `data-[size=default]:h-10` *(A1)* | `components/form/SelectField.tsx` |
| 2 | `min-h` → `lg:min-h-[calc(100dvh-4rem)]` *(A6)* | `components/site/AuthShell.tsx` |
| 2b | `100vh` → `100dvh` *(A6)* | `pages/RegisterRole.tsx` |
| 3 | `max-w-lg` → `sm:max-w-lg` ×2 *(A5)* | `pages/MisEstudios.tsx` |
| 4 | overrides `dark:` en el CTA *(A4)* | `pages/Home.tsx` |
| 5 | `updated` obligatorio + fecha real *(B2)* | `components/site/LegalArticle.tsx`, `Terminos.tsx`, `Privacidad.tsx` |

8 archivos, +11/−8. `tsc -b` y `oxlint` sin errores. Regresión: sin scroll horizontal en 9 rutas
públicas a 375 px y 1024 px.

**Tanda 2 — requiere decisión de diseño:**
6. Navbar del dashboard: elegir estrategia de navegación *(A2)*
7. Tokens de color del odontograma *(M2)*
8. Pasar los 14 inputs de auth/certificados a 40 px *(A3)*

**Tanda 3 — barrido de consistencia:**
9. Quitar los `p-*` de los 59 `CardContent` y usar `--card-spacing` *(M1)*
10. Velo de modales, diálogos altos, anchos de diálogo *(M3, M4, M5)*
11. El resto de los medios y bajos.

---

## Verificaciones que quedaron fuera

- **Páginas tras login** (dashboard, mis-turnos, mi-historia, certificados, estudios): auditadas por
  código y por medición de sus componentes aislados, pero no vistas renderizadas con datos reales —
  el backend no estaba corriendo. Conviene una segunda pasada visual con sesión iniciada.
- **Navegadores no-Chromium.** `field-sizing: content` (en `Textarea`) y `pointer-coarse` tienen
  soporte parcial en Safari/Firefox; no se verificó ahí.
- **Impresión / PDF** (`patientPdf.ts`, `jspdf`): fuera del alcance de una auditoría de UI en pantalla.
