# Plan de marketing de Medilu

> Octubre de 2026. Precios verificados contra la tabla `plan` de producción el 2026-10-17.
> Regla: **no inventar** testimonios, cifras de clientes ni resultados (ver `PRODUCT.md`).

## 1. Objetivo

Que **consultorios de 1 a 10 profesionales** de Argentina (entrada por odontología, en
Mendoza primero) **prueben Medilu 14 días y contraten un plan**.

| Etapa | Qué tiene que pasar | Cómo se mide |
|---|---|---|
| Descubrir | El profesional ve Medilu en Instagram, en un grupo o por un colega/paciente | Alcance, visitas al perfil |
| Probar | Crea su cuenta profesional y arranca la prueba de 14 días (plan Clínica, sin tarjeta) | Clínicas nuevas por semana |
| Activarse | Carga horarios y recibe su **primer turno online** o carga su primera historia | % de clínicas en prueba con ≥ 1 turno o ≥ 1 registro |
| Contratar | Elige un plan desde **Panel → Plan** | % de pruebas que contratan |
| Recomendar | Sus pacientes usan la app y otros profesionales la conocen | Clínicas que llegan «por un colega / un paciente» |

Meta inicial razonable para medir (no es una promesa): **10 clínicas en prueba en el primer
mes**, y aprender qué porcentaje contrata antes de poner plata en anuncios.

## 2. A quién le hablamos

### Profesional (el que paga) — 80 % del contenido
- **Dolor:** la agenda en un cuaderno, las fichas en un cajón y los turnos en el WhatsApp
  personal; atender el teléfono entre paciente y paciente; certificados a mano.
- **Promesa:** *«Tu consultorio entero en una app»*: turnos online, historia clínica con
  dictado por voz, certificados con firma, estudios compartidos, odontograma, obras sociales.
- **Objeciones a responder:** precio (desde $14.900, IVA incluido), «no tengo tiempo de
  aprender» (prueba de 14 días con todo + soporte por WhatsApp), «¿y mis datos si dejo de
  pagar?» (quedan en solo lectura: los ves y los exportás), seguridad de la información.

### Paciente (gratis, siempre) — 20 % del contenido
- **Rol en el plan:** es el **canal de difusión**. Cada turno que saca, cada estudio que
  comparte y cada certificado que recibe muestran Medilu a su profesional y a su entorno.
- **Promesa:** sacá turno desde el celular sin llamar; tus estudios, certificados e historia
  en tu cuenta; gratis.
- **Pedido concreto:** «¿Tu profesional todavía da turnos por teléfono? Contale de Medilu».

## 3. Mensajes clave

| Para | Mensaje | Prueba que lo respalda (existe hoy) |
|---|---|---|
| Profesional | Tus pacientes sacan turno solos | Turnos online + confirmación por mail |
| Profesional | La historia clínica se dicta | Dictado por voz con vocabulario por especialidad |
| Profesional | Certificados con tu firma en segundos | Firma cargada una vez, búsqueda por DNI |
| Profesional | Para cualquier especialidad (y odontología, con odontograma) | Odontograma por caras |
| Profesional | Atendés en varias clínicas desde una cuenta | Multiclínica |
| Profesional | Precio claro: desde $14.900/mes, IVA incluido; anual = 10 meses | Tabla `plan` |
| Paciente | Gratis, desde el celular, todo en tu cuenta | Mis turnos, Mis estudios, Mis certificados, Mi historia |

**Voz:** voseo, cercana y sobria. Nada de «revolucionario» ni promesas clínicas.

## 4. Canales

1. **Instagram (@medilu.app)** — canal principal y vidriera.
   - 3 posts fijados: *Qué es Medilu* (carrusel 1), *Planes y precios* (carrusel 2), *Video*.
   - **Historias destacadas** (ver §5): son el «cómo contratar» permanente.
   - Ritmo: 3 posts por semana + historias diarias de lunes a viernes.
   - CTA único en todas las piezas: **comentá PRUEBA** o **escribinos por WhatsApp**.
2. **WhatsApp de soporte (261 772-5639)** — donde se cierra la venta: respuesta en el día,
   guía para crear la cuenta y para contratar el plan.
3. **Contacto directo con odontología en Mendoza** — círculo/colegio odontológico, grupos de
   egresados, proveedores dentales. Ofrecer una demo de 15 minutos por videollamada.
4. **Pacientes como canal** — cartel/QR para la sala de espera («Sacá tu próximo turno desde
   el celular») que se le entrega a cada clínica que arranca la prueba.
5. **Google Business Profile** (cuando haya dominio y domicilio) — búsquedas tipo
   «software turnos consultorio Mendoza».
6. **Anuncios pagos en Meta** — **después** de medir conversión orgánica del primer mes.
   Antes de pautar: completar CUIT y domicilio en `frontend/src/lib/site.ts` (Ley 24.240).

## 5. Historias destacadas de Instagram

Orden de izquierda a derecha (lo primero que ve un profesional que entra al perfil):

| Destacada | Para | Contenido | Archivos |
|---|---|---|---|
| **Contratar** | Profesional | Cómo contratar en 4 pasos + condiciones + contacto | `instagram/destacadas/contratar/` |
| **Planes** | Profesional | Los 3 planes, extras y pago anual | `instagram/destacadas/planes/` |
| **Funciones** | Profesional | Turnos, HC con dictado, certificados, estudios, odontograma | `instagram/destacadas/funciones/` |
| **Pacientes** | Paciente | Gratis, sacar turno, estudios y certificados, «contale a tu profesional» | `instagram/destacadas/pacientes/` |
| **Preguntas** | Ambos | Tarjeta, datos al terminar la prueba, especialidades, importar historias, seguridad | `instagram/destacadas/preguntas/` |

Portadas: `instagram/destacadas/portadas/` (subirlas como portada al editar cada destacada).

## 6. Calendario de las primeras 4 semanas

| Semana | Lunes | Miércoles | Viernes | Historias |
|---|---|---|---|---|
| 1 — Lanzamiento | Carrusel 1 (fijar) | Carrusel 2 Planes (fijar) | Video (Reel, fijar) | Subir las 5 destacadas |
| 2 — Turnos ([detalle](SEMANA_2.md)) | Post «Turnos sin llamar» (paciente) | Reel «23:14»: una paciente saca turno de noche y a la mañana está en la agenda | Carrusel «Cómo contratar» (la destacada en 7 placas) | Encuesta: «¿Cómo das turnos hoy?» |
| 3 — Consulta | Reel: dictado por voz en una consulta | Carrusel: certificado con firma en 3 pasos | Post: odontograma | Caja de preguntas para profesionales |
| 4 — Precio y confianza | Post: «Qué pasa con tus datos si no contratás» | Carrusel 2 reposteado en historias | Video repost + CTA PRUEBA | Recordatorio: 14 días gratis |

Grabaciones de pantalla para los Reels: usar **DEV-Medilu** con el seed de datos de prueba
(nunca datos reales de producción).

## 7. Piezas de esta entrega

| Pieza | Formato | Dónde | Cómo se regenera |
|---|---|---|---|
| Carrusel 1 «Qué es Medilu» (actualizado) | 9 × 1080×1350 | `instagram/carrusel-fijado-1/` | `python instagram/build.py` |
| Carrusel 2 «Planes» (nuevo) | 6 × 1080×1350 | `instagram/carrusel-planes/` | ídem |
| Post paciente «Turnos sin llamar» | 1080×1350 | `instagram/posts/` | ídem |
| Destacadas (5 grupos) + portadas | 1080×1920 | `instagram/destacadas/` | ídem |
| Video ilustrativo con voz en off (+ portada, guion) | 1080×1920, MP4, 71 s, subtitulado | `video/medilu-video.mp4` | `python video/build_video.py` (ver requisitos en el script) |
| Semana 2: carrusel «Cómo contratar» | 7 × 1080×1350 | `instagram/carrusel-contratar/` | `python instagram/build.py` |
| Semana 2: reel «23:14» (+ portada, guion) | 1080×1920, MP4, 36 s, subtitulado | `video/reel-turno.mp4` | `python video/build_video.py reel-turno` |

Los precios están como constantes al principio de `instagram/build.py`: si cambia la tabla
`plan`, actualizarlos ahí y regenerar.

## 8. Pendientes que no dependen del contenido

- [ ] Confirmar que **@medilu.app** está creado (hoy el Instagram activo sigue siendo
  `@agendasaludmdz`). Las piezas dicen @medilu.app.
- [ ] Dominio público: las piezas dicen «link en la bio» en lugar de una URL, porque
  `medilu.com.ar` todavía no responde.
- [ ] Completar CUIT y domicilio en `site.ts` antes de pautar.
- [ ] Cuando se active Mercado Pago en producción, cambiar `PAGO_ONLINE = True` en
  `instagram/build.py` y regenerar la destacada «Contratar» (paso 4).
- [ ] Imprimir el cartel QR para salas de espera cuando exista el dominio.
