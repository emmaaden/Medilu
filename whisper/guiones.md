# Guiones para medir el dictado

Textos de prueba para leer en voz alta con `DICTADO_GUARDAR_MUESTRAS=1` (ver `whisper/benchmark.js`).
Son casos inventados: **nunca dictar datos de pacientes reales** en el modo muestras.

Cómo grabar cada guion:

1. En la app, abrí un registro clínico y apretá el micrófono de un campo vacío.
2. Leé el guion completo a ritmo normal, con las pausas naturales, y apretá el micrófono para terminar.
3. En `whisper/muestras/`, la carpeta más reciente es esa sesión: copiá el guion en `referencia.txt`
   dentro de esa carpeta. Si te equivocaste al leer, corregí la referencia para que diga exactamente
   lo que dijiste.

Para que las mediciones signifiquen algo, grabá cada guion al menos una vez (mejor con más de una voz
y con el micrófono que se usa de verdad en el consultorio). Para comparar el procesado del navegador,
grabalos de nuevo después de correr en la consola del navegador
`localStorage.setItem("medilu:dictado-procesado", "off")` (con `removeItem` vuelve al valor normal).

## 1. Clínica general

Paciente de 45 años que consulta por cefalea frontal de tres días de evolución, acompañada de
congestión nasal y fiebre de 38,2 °C. Niega vómitos. Al examen: orofaringe congestiva, sin
adenopatías. Diagnóstico presuntivo: sinusitis aguda. Se indica amoxicilina 875 mg cada 12 horas
por 7 días, paracetamol 500 mg cada 8 horas si hay dolor y control en una semana.

## 2. Odontología

Paciente refiere dolor espontáneo en la pieza 36 desde hace una semana, que aumenta con el frío.
Al examen, caries profunda distal con compromiso pulpar. Radiografía periapical sin lesión apical.
Se realiza apertura cameral y se indica tratamiento de conducto. Ibuprofeno 400 mg cada 8 horas.
Próximo turno para instrumentación y obturación con resina compuesta.

## 3. Pediatría

Niño de 3 años traído por su madre por tos y rinorrea de cinco días. Fiebre de 38,5 °C el primer
día. Vacunas al día. Peso 14 kg, percentil 50. Auscultación con rales subcrepitantes bilaterales.
Saturación 96 %. Diagnóstico: bronquiolitis. Se indican nebulizaciones con solución fisiológica,
paracetamol 15 mg/kg cada 6 horas y pautas de alarma.

## 4. Cardiología

Paciente hipertenso en tratamiento con enalapril 10 mg cada 12 horas. Tensión arterial 150/95 mmHg,
frecuencia cardíaca 82 latidos por minuto. Electrocardiograma en ritmo sinusal, sin alteraciones
agudas. Se aumenta la dosis de enalapril a 20 mg cada 12 horas, se agrega amlodipina 5 mg por día
y se solicita ecocardiograma y laboratorio con perfil lipídico.
