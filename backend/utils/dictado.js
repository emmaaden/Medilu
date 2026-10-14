// Prompt y limpieza del dictado por voz (whisper.cpp). Lo usan el controller (/dictado)
// y la medición de modelos (whisper/benchmark.js), así ambos transcriben igual.

// Vocabulario por especialidad: frases de ejemplo con la ortografía correcta de los
// términos que más se dictan. Whisper imita el estilo y las palabras del prompt.
const VOCABULARIO = {
    general:
        'Notas de una consulta médica. Paciente refiere cefalea, dolor abdominal, vómitos y fiebre de 38,5 °C. ' +
        'Diagnóstico presuntivo: faringitis. Tratamiento: paracetamol 500 mg, ibuprofeno 400 mg cada 8 horas, amoxicilina 500 mg.',
    odontologia:
        'Notas de una consulta odontológica. Pieza 36 con caries oclusal profunda, sensibilidad al frío. ' +
        'Gingivitis, placa bacteriana, periodontitis. Endodoncia, obturación con resina compuesta, ' +
        'exodoncia del 48, tartrectomía, radiografía periapical. Amoxicilina 500 mg, ibuprofeno 400 mg.',
    pediatria:
        'Notas de una consulta pediátrica. Lactante con fiebre de 38,5 °C, rinorrea y tos. Percentil de peso y talla, ' +
        'vacunas al día. Bronquiolitis, otitis media aguda. Paracetamol 15 mg/kg cada 6 horas, amoxicilina 80 mg/kg/día.',
    cardiologia:
        'Notas de una consulta cardiológica. Paciente hipertenso, tensión arterial 140/90 mmHg, frecuencia cardíaca de 78 latidos por minuto. ' +
        'Electrocardiograma en ritmo sinusal, ecocardiograma, fibrilación auricular, insuficiencia cardíaca. ' +
        'Enalapril 10 mg, atenolol, aspirina 100 mg, atorvastatina.',
    ginecologia:
        'Notas de una consulta ginecológica. Fecha de última menstruación, ciclos regulares. Papanicolaou y colposcopia normales, ' +
        'ecografía transvaginal, mamografía. Embarazo de 12 semanas, gesta 2, para 1. Anticonceptivos orales, ácido fólico.',
    traumatologia:
        'Notas de una consulta traumatológica. Esguince de tobillo, gonalgia, lumbalgia, fractura de radio distal. ' +
        'Radiografía, resonancia magnética, inmovilización con férula, kinesiología. Diclofenac 75 mg, ibuprofeno 600 mg.',
    dermatologia:
        'Notas de una consulta dermatológica. Lesión eritematosa, pruriginosa, descamativa. Dermatitis atópica, psoriasis, ' +
        'acné, nevo, dermatoscopía. Betametasona tópica, isotretinoína, protector solar.',
    psicologia:
        'Notas de una sesión. Paciente refiere ansiedad, insomnio y ánimo deprimido. Ataques de pánico, duelo, ' +
        'estrés laboral. Se trabaja en terapia cognitivo conductual, se acuerdan objetivos para la próxima sesión.',
    psiquiatria:
        'Notas de una consulta psiquiátrica. Trastorno de ansiedad generalizada, depresión, trastorno bipolar, insomnio. ' +
        'Sertralina 50 mg, escitalopram, clonazepam 0,5 mg, quetiapina, litemia.',
    kinesiologia:
        'Notas de una sesión de kinesiología. Lumbalgia, cervicalgia, tendinitis, rehabilitación posquirúrgica de rodilla. ' +
        'Ejercicios de fortalecimiento y elongación, magnetoterapia, ultrasonido, TENS, rango de movimiento.',
    oftalmologia:
        'Notas de una consulta oftalmológica. Agudeza visual 10/10, presión intraocular, fondo de ojo. Miopía, astigmatismo, ' +
        'presbicia, conjuntivitis, cataratas, glaucoma. Lágrimas artificiales, timolol.',
    otorrinolaringologia:
        'Notas de una consulta otorrinolaringológica. Otitis, sinusitis, rinitis alérgica, hipoacusia, acúfenos, vértigo. ' +
        'Otoscopía, audiometría, rinofibrolaringoscopía. Mometasona nasal, amoxicilina con ácido clavulánico.',
    nutricion:
        'Notas de una consulta de nutrición. Peso 82 kg, talla 1,70 m, índice de masa corporal 28,4, circunferencia de cintura. ' +
        'Plan alimentario hipocalórico, hidratos de carbono, proteínas, recordatorio de 24 horas.',
    endocrinologia:
        'Notas de una consulta endocrinológica. Diabetes tipo 2, hemoglobina glicosilada 7,2 %, hipotiroidismo, TSH, T4 libre. ' +
        'Metformina 850 mg, levotiroxina 50 µg, insulina glargina.',
    gastroenterologia:
        'Notas de una consulta gastroenterológica. Epigastralgia, pirosis, reflujo gastroesofágico, constipación, diarrea. ' +
        'Videoendoscopía digestiva alta, colonoscopía, Helicobacter pylori. Omeprazol 20 mg, lactulosa.',
    neurologia:
        'Notas de una consulta neurológica. Cefalea migrañosa, mareos, parestesias, epilepsia, accidente cerebrovascular. ' +
        'Resonancia magnética de encéfalo, electroencefalograma. Levetiracetam, topiramato, amitriptilina.',
};

const clave = (s) =>
    String(s || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

// Contexto que se le pasa al modelo además del vocabulario: el texto que ya tiene el campo.
// whisper.cpp se queda con los últimos ~224 tokens del prompt, así que el contexto va al
// final y se recorta para que el vocabulario entre entero. Medido con whisper/benchmark.js:
// 120 caracteres (≈ la última frase) rinde igual que 300 y alarga menos el prompt.
const MAX_CONTEXTO = 120;

/** Prompt para whisper: vocabulario de la especialidad + lo último que ya se escribió. */
function armarPrompt(especialidad, contexto) {
    const vocab = VOCABULARIO[clave(especialidad)] || VOCABULARIO.general;
    let ctx = String(contexto || '')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (ctx.length > MAX_CONTEXTO) {
        ctx = ctx.slice(-MAX_CONTEXTO);
        ctx = ctx.slice(ctx.indexOf(' ') + 1); // no empezar con media palabra
    }
    return ctx ? `${vocab} ${ctx}` : vocab;
}

// Whisper "alucina" estas frases con silencio o ruido (vienen de subtítulos de videos).
const ALUCINACIONES = [
    /subt[ií]tul/i,
    /amara\.org/i,
    /gracias por (ver|mirar|su atenci[oó]n)/i,
    /suscr[ií]b/i,
    /^\W*(gracias|ch[aá]u|adi[oó]s)\W*$/i,
];

// Whisper a veces entra en bucle y repite lo último que dijo ("…pautas de alarma.
// Nebulizaciones con… pautas de alarma."). Se borra la segunda copia de cualquier
// secuencia de MIN_REPETIDA o más palabras que se repita inmediatamente.
const MIN_REPETIDA = 4;

function sinRepeticiones(texto) {
    const palabras = texto.split(' ');
    const norm = palabras.map((p) => p.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
    for (let largo = Math.floor(palabras.length / 2); largo >= MIN_REPETIDA; largo--) {
        for (let i = 0; i + 2 * largo <= palabras.length; i++) {
            let igual = true;
            for (let k = 0; k < largo && igual; k++) igual = norm[i + k] === norm[i + largo + k];
            if (igual) {
                palabras[i + largo - 1] = palabras[i + 2 * largo - 1]; // la puntuación final de la copia borrada
                palabras.splice(i + largo, largo);
                return sinRepeticiones(palabras.join(' '));
            }
        }
    }
    return texto;
}

function limpiar(texto) {
    const t = sinRepeticiones(
        String(texto || '')
            .replace(/\[[^\]]*\]|\([^)]*\b(m[uú]sica|risas|aplausos|ruido)\b[^)]*\)/gi, '') // [BLANK_AUDIO], (música)…
            .replace(/\s+/g, ' ')
            .trim()
    );
    if (!/\p{L}/u.test(t)) return '';
    if (ALUCINACIONES.some((re) => re.test(t))) return '';
    return t;
}

module.exports = { armarPrompt, limpiar, VOCABULARIO };
