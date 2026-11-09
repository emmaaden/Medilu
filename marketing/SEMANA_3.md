# Semana 3 · Consulta (lunes 9 al domingo 15 de noviembre de 2026)

> Sale de `PLAN_MARKETING.md` §6. Misma regla: nada de testimonios, cifras ni clientes inventados.
> La semana del 2 al 8 de noviembre quedó sin contenido nuevo, así que el calendario se corre una
> semana: la semana 4 («Precio y confianza») pasa al 16-22 de noviembre.
>
> Lo que muestran las piezas está verificado en el código y en la tabla `plan` de producción (2026-11-09):
> - **Dictado:** se toca el micrófono en la historia clínica; el texto aparece frase por frase (whisper
>   transcribe en cada pausa); entiende «punto», «coma», «punto y aparte»; el prompt trae vocabulario
>   por especialidad (`backend/utils/dictado.js`); el audio se transcribe en un servidor propio, se
>   procesa en memoria y no se guarda ni se envía a terceros (`Privacidad.tsx`); anda en cualquier
>   navegador moderno.
> - **Certificados:** firma o sello cargado una vez (PNG/JPG) → búsqueda por DNI entre los pacientes
>   de la clínica → motivo, días de reposo, diagnóstico e indicaciones → PDF con la firma embebida, que
>   el paciente descarga desde «Mis certificados». También se puede subir la foto de uno en papel.
> - **Odontograma:** por caras, rojo realizado / azul a tratar, corona, endodoncia, ausente, extracción
>   indicada, implante, prótesis y movilidad; dentición permanente y temporal (FDI); cada consulta
>   arranca del último odontograma; sale en el PDF de la historia y en la ficha para la obra social;
>   el paciente lo ve en «Mi historia».
> - Los **3 planes** incluyen `dictado`, `certificados` y `odontologia`.

## Antes de publicar

- [ ] **Dictado en producción (bloqueante para el lunes):** con una cuenta de prueba en producción,
  dictar dos frases en una historia clínica y confirmar que el texto aparece. Si el servidor de whisper
  no responde, **no publicar el reel**: cambiar el orden (lunes carrusel, miércoles post, viernes reel)
  y avisar para levantarlo.
- [ ] **Certificado de prueba en DEV-Medilu:** generar uno y abrir el PDF desde la cuenta del paciente
  (que salga con la firma). Sirve también para grabar las historias del miércoles.
- [ ] **Resultados de la semana 2** anotados (abajo, en «Cómo medir»): sin eso no se puede comparar.
- [ ] Cuenta **@medilu.app** creada (sigue pendiente en `PLAN_MARKETING.md` §8).

## Calendario

Horario de Argentina.

| Día | Hora | Pieza | Tipo | Archivo |
|---|---|---|---|---|
| LUN 9 | 21:00 | Reel «La historia clínica, sin tipear» (39 s, dos voces, subtítulos) | Prueba · abre con la demo | `video/reel-dictado.mp4` (portada: `video/reel-dictado-portada.png`) |
| MAR 10 | — | Solo historias + interacción | | |
| MIÉ 11 | 13:00 | Carrusel «Certificado con firma en 3 pasos» (6 placas) | Enseñar | `instagram/carrusel-certificado/01.png` … `06.png` |
| JUE 12 | — | Solo historias + interacción (caja de preguntas) | | |
| VIE 13 | 13:00 | Post «El odontograma, por caras y sin papel» | Enseñar · para odontología | `instagram/posts/odontograma.png` |
| SÁB 14 / DOM 15 | — | Nada (el domingo, medir) | | |

Los dos posts van a las 13:00: es el hueco del mediodía entre turnos. El reel, a la noche, como el
de la semana 2, para comparar con el mismo horario.

Después de publicar el reel, sumarlo a la destacada **Funciones**.

## Captions

### LUN 9 · Reel «La historia clínica, sin tipear»

```
«Paciente refiere dolor al frío en la pieza 36. Caries oclusal profunda. Se indica obturación con resina compuesta.»

Eso no se tipeó: se dictó en la consulta.

Así funciona el dictado en Medilu:
→ tocás el micrófono en la historia clínica y hablás
→ el texto aparece en la ficha frase por frase
→ decís «punto y aparte» y cambia de renglón
→ viene preparado con el vocabulario de tu especialidad
→ funciona desde la compu o el celular
→ el audio no se guarda ni se envía a terceros: se transcribe en un servidor propio

Lo probás 14 días con todo, sin tarjeta. Comentá PRUEBA y te escribimos.

#historiaclinica #consultorio #softwaremedico
```

Guion de las voces: `video/reel-dictado-guion.txt` (la primera escena es la voz del profesional que
dicta, `es-AR-TomasNeural`; el resto, la voz de siempre). Para cambiarlo, editar `ESCENAS_DICTADO`
en `video/build_video.py` y correr `python build_video.py reel-dictado`.

### MIÉ 11 · Carrusel «Certificado con firma en 3 pasos»

```
Un certificado con tu firma, en 3 pasos:

1. Cargás tu firma o tu sello una sola vez (una imagen PNG o JPG).
2. Buscás al paciente por DNI.
3. Completás motivo, días de reposo, diagnóstico e indicaciones, y tocás Generar.

Sale un PDF con tu firma y le queda al paciente en su cuenta, en Mis certificados. Si lo pierde, lo vuelve a bajar de ahí.

¿Tenés un certificado en papel? Subís la foto y también le queda en la cuenta.

Está en todos los planes, desde $14.900 por mes con IVA incluido. Comentá PRUEBA y te escribimos.

#certificadomedico #consultorio #softwaremedico
```

### VIE 13 · Post odontograma

```
Para odontólogos: el odontograma, por caras y sin papel.

→ Marcás cada cara de cada pieza: rojo lo realizado, azul lo que falta tratar.
→ Corona, endodoncia, ausente, extracción indicada, implante, prótesis y movilidad.
→ Dentición permanente y temporal, con numeración FDI.
→ Cada consulta arranca del último odontograma: marcás solo lo nuevo.
→ Sale en el PDF de la historia clínica y en la ficha para la obra social.
→ Tu paciente lo ve en su historia, desde su cuenta.

Lo probás 14 días gratis, sin tarjeta. Comentá PRUEBA y te escribimos.

#odontologia #odontologos #mendoza
```

## Historias (lunes a viernes, de 3 a 5 por día)

Las capturas y grabaciones de pantalla, siempre de **DEV-Medilu** con datos de prueba.

**LUN 9**
1. **Encuesta**: «¿Cuándo escribís la historia clínica?» → Durante la consulta / Entre paciente y paciente / Al final del día / En papel y después la paso.
2. Antes de las 21: «Hoy a la noche te muestro una historia clínica que no se tipeó.»
3. 21:00: compartir el reel con el texto «Nuevo reel: sin tipear».

**MAR 10**
1. Grabación de pantalla **con sonido**, 10 a 15 s: dictar dos frases en una historia de prueba. Texto: «Así se ve en la app. Sin edición.» (es la prueba de que el reel no está armado).
2. Sticker de **quiz**: «¿Qué pasa si decís "punto y aparte" mientras dictás?» → Lo escribe tal cual / Cambia de renglón ✅ / Se corta el dictado.
3. «¿Y el audio? Se transcribe en un servidor propio y no se guarda.»

**MIÉ 11**
1. Compartir el carrusel: «Un certificado con tu firma, en 3 pasos».
2. Grabación de pantalla: DNI → Generar certificado → el PDF abierto (paciente y profesional ficticios).
3. **Encuesta**: «¿Cómo hacés hoy los certificados?» → A mano, en el recetario / En Word, y firmo impreso / Con un sistema / Casi no hago.

**JUE 12** (la caja de preguntas del plan)
1. Resultados reales de las encuestas del lunes y del miércoles, tal cual salieron (si votan pocos, «de los que votaron»).
2. **Caja de preguntas** para profesionales: «¿Qué te gustaría saber antes de probar Medilu?». Las respuestas alimentan la semana 4 (precio y confianza) y la destacada Preguntas.
3. Captura de «Mis certificados» del lado del paciente: «Y el paciente lo tiene acá».

**VIE 13**
1. Compartir el post: «Para odontólogos».
2. Reusar `instagram/destacadas/funciones/05.png` (odontograma).
3. Responder 2 o 3 preguntas reales de la caja, una por historia, solo con lo que está verificado. Si no llegaron preguntas, saltear este punto (no inventar preguntas).

## Respuesta para quien comenta PRUEBA

Primero, responder el comentario con «¡Te escribimos por privado!». Después, el DM:

```
¡Hola! Gracias por comentar 🙂 Te cuento cómo arrancar:

1. Entrá al link de la bio y creá tu cuenta como profesional.
2. Cargá tus horarios. Desde ese momento tus pacientes ya pueden sacar turno online.
3. Tenés 14 días con todo (dictado, certificados y odontograma incluidos), sin tarjeta.

Si preferís, te lo muestro en una videollamada de 15 minutos. ¿Qué día te queda bien?
¿Cuál es tu especialidad?
```

## Contacto directo con odontología (primer paso de `PLAN_MARKETING.md` §4.3)

El viernes, después de publicar el post, mandarles el post por DM a los **2 consultorios
odontológicos de Mendoza** de la lista de interacción. Un solo mensaje, sin insistir:

```
¡Hola! Somos Medilu, una app de Mendoza para consultorios. Les comparto cómo funciona nuestro
odontograma: por caras, y cada consulta arranca del último. Si les interesa, se los muestro en
15 minutos por videollamada, sin compromiso.
```

Si no contestan, no se vuelve a escribir esta semana.

## Interacción (20 minutos por día, antes de publicar)

Misma lista de las semanas anteriores (5 cuentas de alcance, 3 pares y 2 consultorios de Mendoza).
Esta semana, comentar sobre todo en publicaciones que hablen de **historia clínica, papeleo,
certificados u odontología**.

## Cómo medir la semana

Anotarlo el domingo 15, una línea por pieza: alcance, guardados, compartidos y cuántos comentaron PRUEBA.
En el reel, además, la **retención a los 3 segundos** (Estadísticas del reel): dice si abrir con la
demo funcionó mejor que el «23:14». Lo que más importa: **cuántas clínicas nuevas arrancaron la
prueba** (Panel de admin).

| Semana | Pieza | Alcance | Guardados | Compartidos | PRUEBA | Clínicas nuevas en prueba |
|---|---|---|---|---|---|---|
| 2 | Post «Sacá turno sin llamar» | | | | | |
| 2 | Reel «23:14» | | | | | |
| 2 | Carrusel «Cómo contratar» | | | | | |
| 3 | Reel «Sin tipear» | | | | | |
| 3 | Carrusel «Certificado» | | | | | |
| 3 | Post «Odontograma» | | | | | |
