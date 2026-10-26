# Semana 2 · Turnos (lunes 26 de octubre al domingo 1 de noviembre de 2026)

> Sale de `PLAN_MARKETING.md` §6. Misma regla: nada de testimonios, cifras ni clientes inventados.
> Lo que muestran las piezas está verificado en el código: reserva con clínica → profesional →
> horario, confirmación por mail, recordatorio por mail ~24 h antes y cancelación desde el link del mail.

## Antes de publicar

- [ ] **Recordatorio por mail en producción:** el reel y el post del lunes lo mencionan. Sacar un
  turno de prueba para pasado mañana en producción y confirmar que el recordatorio llega
  (necesita el mailer configurado y, si el hosting se duerme, un cron externo que llame a
  `POST /internal/send-reminders` con `REMINDERS_TOKEN`).
  Si no llega, sacar esa línea del caption del lunes y regenerar el reel sin la escena 3.
- [ ] Cuenta **@medilu.app** creada (sigue pendiente en `PLAN_MARKETING.md` §8).
- [ ] Respuesta para PRUEBA lista (abajo), para contestar el mismo día.

## Calendario

Horario de Argentina. El horario pesa mucho menos que los dos primeros segundos del reel.

| Día | Hora | Pieza | Tipo | Archivo |
|---|---|---|---|---|
| LUN 26 | 21:00 | Post «Sacá turno sin llamar» (para pacientes) | Enseñar | `instagram/posts/paciente-turnos-sin-llamar.png` |
| MAR 27 | — | Solo historias + interacción | | |
| MIÉ 28 | 21:00 | Reel «23:14» (36 s, voz en off y subtítulos) | Prueba · hook #18 Cold Open Demo | `video/reel-turno.mp4` (portada: `video/reel-turno-portada.png`) |
| JUE 29 | — | Solo historias + interacción | | |
| VIE 30 | 13:00 | Carrusel «Cómo contratar» (7 placas) | Oferta | `instagram/carrusel-contratar/01.png` … `07.png` |
| SÁB 31 / DOM 1 | — | Nada | | |

El reel se publica a las 21:00 para que la escena de las 23:14 caiga esa misma noche.

## Captions

### LUN 26 · Post para pacientes

```
Si tu profesional usa Medilu, el turno lo sacás vos, desde el celular y a la hora que quieras.

Elegís la clínica, el profesional y el horario. Te llega la confirmación por mail y, un día antes, el recordatorio. Si no podés ir, lo cancelás desde ese mismo mail.

Para vos es gratis. Siempre.

¿Tu profesional todavía da turnos por teléfono? Mandale este post.

#turnosonline #mendoza #salud
```

### MIÉ 28 · Reel «23:14»

```
23:14. Una paciente sacó turno con vos. Vos estabas durmiendo, y a la mañana el turno ya estaba en tu agenda.

Así funcionan los turnos online en Medilu:
→ el paciente elige clínica, profesional y horario desde el celular
→ le llega la confirmación por mail, y el recordatorio un día antes
→ si no puede venir, cancela desde ese mismo mail
→ el turno aparece en tu agenda

Nadie atendió el teléfono. Ni vos ni tu recepción.

Lo probás 14 días con todo, sin tarjeta. Comentá PRUEBA y te escribimos.

#consultorio #turnosonline #softwaremedico
```

Guion de la voz en off: `video/reel-turno-guion.txt`. Para cambiarlo, editar `ESCENAS_TURNO`
en `video/build_video.py` y correr `python build_video.py reel-turno`.

### VIE 30 · Carrusel «Cómo contratar»

```
Contratar Medilu son 4 pasos, y los primeros 14 días no pagás nada.

1. Creás tu cuenta de profesional desde el link de la bio.
2. Cargás tu especialidad y tus horarios. Desde ahí ya recibís turnos online.
3. Usás el plan Clínica completo 14 días, sin tarjeta.
4. Si te sirve, elegís tu plan desde Panel → Plan.

Si no contratás, no se borra nada: tus datos quedan en solo lectura y los podés exportar.

Planes desde $14.900 por mes, con IVA incluido.

¿Te ayudamos a arrancar? Comentá PRUEBA o escribinos al 261 772-5639.

#consultorio #softwaremedico #mendoza
```

## Historias (lunes a viernes, de 3 a 5 por día)

Las capturas de pantalla, siempre de **DEV-Medilu** con datos de prueba.

**LUN 26**
1. Compartir el post del día con el texto «Esta semana: turnos».
2. Sticker de **quiz**: «¿Cuánto paga el paciente por sacar turno en Medilu?» → $0 ✅ / $500 / Depende de la clínica.
3. «Si tu profesional todavía te atiende el teléfono para darte turno, compartile esto.» + reenviar el post.

**MAR 27**
1. Grabación de pantalla corta del lado del paciente: `/turnos` → elegir clínica → horario. Texto: «Así se ve del lado del paciente».
2. **Encuesta** de 4 opciones: «¿Cuántas veces por día te interrumpe el teléfono por un turno?» → 0 a 2 / 3 a 5 / 6 a 10 / Más de 10.
3. «Mañana te muestro qué pasa a las 23:14.»

**MIÉ 28** (la encuesta del plan)
1. **Encuesta**: «¿Cómo das turnos hoy?» → Por teléfono / Por WhatsApp / Los da mi secretaria / Ya son online.
2. Compartir el reel con el texto «Nuevo reel: 23:14».
3. Captura del mail de confirmación de un turno de prueba (sin datos reales).

**JUE 29**
1. Resultados reales de las dos encuestas, tal cual salieron (si votan pocos, decir «de los que votaron»). Nada de redondear para arriba.
2. Captura de la agenda del panel con un turno marcado «Online».
3. **Caja de preguntas**: «¿Qué te frena para dar turnos online?». Las respuestas alimentan el post de la semana 4 («qué pasa con tus datos») y la destacada Preguntas.

**VIE 30**
1. Compartir el carrusel: «Contratar son 4 pasos».
2. Reusar `instagram/destacadas/contratar/06.png` («Sin letra chica»).
3. Reusar `instagram/destacadas/contratar/07.png` (WhatsApp) con el sticker de mención @medilu.app.

## Respuesta para quien comenta PRUEBA

Primero, responder el comentario con «¡Te escribimos por privado!». Después, el DM:

```
¡Hola! Gracias por comentar 🙂 Te cuento cómo arrancar:

1. Entrá al link de la bio y creá tu cuenta como profesional.
2. Cargá tus horarios. Desde ese momento tus pacientes ya pueden sacar turno online.
3. Tenés 14 días con todo, sin tarjeta.

Si preferís, te lo muestro en una videollamada de 15 minutos. ¿Qué día te queda bien?
¿Cuál es tu especialidad?
```

## Interacción (20 minutos por día, antes de publicar)

Misma lista de la semana 1 (5 cuentas de alcance, 3 pares y 2 consultorios de Mendoza). Esta
semana, comentar sobre todo en publicaciones que hablen de **ausentismo, turnos o secretaria**:
es el tema del reel. A los consultorios de la lista no se les manda DM todavía.

## Cómo medir la semana

Anotarlo el domingo 1 en una línea por pieza: alcance, guardados, compartidos y cuántos comentaron PRUEBA.
Lo que más importa: **cuántas clínicas nuevas arrancaron la prueba** (Panel de admin).
