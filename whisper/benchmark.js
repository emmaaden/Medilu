// Mide los modelos de dictado con grabaciones reales y deja el resultado en
// whisper/mediciones.md (un registro que se va acumulando, corrida tras corrida).
//
// 1. Juntar muestras: con DICTADO_GUARDAR_MUESTRAS=1 en backend/.env, cada vez que se
//    dicta en la app se guardan los tramos en whisper/muestras/<sesión>/ (una sesión por
//    cada vez que se aprieta el micrófono). Dictar casos de prueba (ver whisper/guiones.md),
//    nunca datos de pacientes.
// 2. Referencia: en cada carpeta de sesión crear referencia.txt con el texto EXACTO que
//    se dijo, escrito como debería quedar en el campo ("punto" -> ".").
// 3. Medir:  npm run whisper:medir   (desde backend/)
//    Opciones: --modelos small-q5_1,medium-q5_0   --hilos 8   --muestras <carpeta>
//    Por defecto usa todos los modelos de whisper/models/.
//
// Cada modelo se mide en dos variantes:
//   - "antes": prompt fijo y sin contexto (como transcribía hasta ahora).
//   - "ahora": vocabulario de la especialidad + lo ya transcripto como contexto.
// Las muestras se transcriben igual que en la app (mismo prompt y limpieza: backend/utils/dictado.js).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { armarPrompt, limpiar, VOCABULARIO } = require('../backend/utils/dictado');

function opcion(nombre, porDefecto) {
    const i = process.argv.indexOf(`--${nombre}`);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}

const DIR = __dirname;
const DIR_MUESTRAS = path.resolve(opcion('muestras', path.join(DIR, 'muestras')));
const DIR_DETALLE = path.join(DIR, 'mediciones');
const REGISTRO = path.join(DIR, 'mediciones.md');
const PUERTO = 8179; // distinto del 8178 de `npm run whisper`, para no chocar
const URL = `http://127.0.0.1:${PUERTO}`;

// ---------------------------------------------------------------------------
// Muestras
// ---------------------------------------------------------------------------

function cargarSesiones() {
    if (!fs.existsSync(DIR_MUESTRAS)) return { sesiones: [], sinReferencia: [] };
    const sesiones = [];
    const sinReferencia = [];
    for (const nombre of fs.readdirSync(DIR_MUESTRAS).sort()) {
        const dir = path.join(DIR_MUESTRAS, nombre);
        if (!fs.statSync(dir).isDirectory()) continue;
        const tramos = fs
            .readdirSync(dir)
            .filter((f) => /^\d+\.wav$/.test(f))
            .sort()
            .map((f) => {
                const base = path.join(dir, f.replace(/\.wav$/, ''));
                const meta = fs.existsSync(`${base}.json`) ? JSON.parse(fs.readFileSync(`${base}.json`, 'utf8')) : {};
                const wav = fs.readFileSync(`${base}.wav`);
                return { wav, segundos: (wav.length - 44) / (16000 * 2), meta };
            });
        if (tramos.length === 0) continue;
        const ref = path.join(dir, 'referencia.txt');
        if (!fs.existsSync(ref) || !fs.readFileSync(ref, 'utf8').trim()) {
            sinReferencia.push(nombre);
            continue;
        }
        const primero = tramos[0].meta;
        sesiones.push({
            nombre,
            tramos,
            referencia: fs.readFileSync(ref, 'utf8'),
            especialidad: primero.especialidad || null,
            // Lo que tenía el campo antes de empezar a dictar (el contexto del primer tramo).
            contextoInicial: primero.contexto || '',
            procesado: primero.procesado || 'on',
        });
    }
    return { sesiones, sinReferencia };
}

// ---------------------------------------------------------------------------
// Métrica: WER (tasa de error por palabra) = (sustituciones + borrados + inserciones) / palabras
// ---------------------------------------------------------------------------

// Igual que aplicarComandos en frontend/src/components/form/DictationTextarea.tsx:
// las palabras "punto", "coma"… se convierten en signos antes de comparar.
function aplicarComandos(texto) {
    const cmd = (palabras, despues = '[.,;:]?') =>
        new RegExp(String.raw`[\s.,;:]*(?<!\p{L})(?:${palabras})(?!\p{L})` + despues, 'giu');
    return texto
        .replace(cmd('punto y aparte|nueva l[ií]nea', String.raw`[\s.,;:]*`), '\n')
        .replace(cmd('punto y coma'), ';')
        .replace(cmd('dos puntos'), ':')
        .replace(cmd('punto'), '.')
        .replace(cmd('coma'), ',');
}

function palabras(texto, { sinTildes = false } = {}) {
    let t = texto.toLowerCase();
    if (sinTildes) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return t
        .replace(/[^\p{L}\p{N}°%/]+/gu, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);
}

function distancia(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

// ---------------------------------------------------------------------------
// whisper.cpp
// ---------------------------------------------------------------------------

function buscar(dir, nombre) {
    if (!fs.existsSync(dir)) return null;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            const r = buscar(p, nombre);
            if (r) return r;
        } else if (e.name === nombre) return p;
    }
    return null;
}

async function levantarServidor(exe, modelo, hilos) {
    // Mismos parámetros que whisper/start.ps1.
    const proc = spawn(exe, ['-m', modelo, '--host', '127.0.0.1', '--port', String(PUERTO), '-l', 'es', '-t', String(hilos), '-ac', '768'], {
        stdio: ['ignore', 'ignore', 'pipe'],
        windowsHide: true,
    });
    let salida = '';
    proc.stderr.on('data', (d) => (salida = (salida + d).slice(-2000)));
    let termino = false;
    proc.on('exit', () => (termino = true));
    const limite = Date.now() + 180_000;
    while (Date.now() < limite) {
        if (termino) throw new Error(`whisper-server terminó al arrancar:\n${salida}`);
        try {
            const r = await fetch(URL, { signal: AbortSignal.timeout(2000) });
            if (r.ok) return proc;
        } catch {
            /* todavía cargando */
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    proc.kill();
    throw new Error('whisper-server no respondió en 3 minutos.');
}

async function transcribir(wav, prompt) {
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'tramo.wav');
    form.append('language', 'es');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    form.append('prompt', prompt);
    const inicio = performance.now();
    const r = await fetch(`${URL}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(300_000) });
    if (!r.ok) throw new Error(`whisper respondió ${r.status}: ${await r.text().catch(() => '')}`);
    const data = await r.json();
    return { texto: limpiar(data.text), ms: performance.now() - inicio };
}

const VARIANTES = {
    antes: () => VOCABULARIO.general,
    ahora: (sesion, previo) => armarPrompt(sesion.especialidad, previo),
};

async function medirSesion(sesion, variante) {
    let previo = sesion.contextoInicial;
    const textos = [];
    const tiempos = [];
    for (const t of sesion.tramos) {
        const { texto, ms } = await transcribir(t.wav, VARIANTES[variante](sesion, previo));
        tiempos.push({ ms, segundos: t.segundos });
        if (texto) {
            textos.push(texto);
            previo = `${previo} ${texto}`.trim();
        }
    }
    const hipotesis = aplicarComandos(textos.join(' '));
    const referencia = aplicarComandos(sesion.referencia);
    const ref = palabras(referencia);
    const refST = palabras(referencia, { sinTildes: true });
    return {
        sesion: sesion.nombre,
        hipotesis,
        palabras: ref.length,
        errores: distancia(ref, palabras(hipotesis)),
        erroresSinTildes: distancia(refST, palabras(hipotesis, { sinTildes: true })),
        tiempos,
    };
}

// ---------------------------------------------------------------------------
// Reporte
// ---------------------------------------------------------------------------

const pct = (x) => `${(x * 100).toFixed(1)} %`;

function resumir(resultados) {
    const palabrasTot = resultados.reduce((n, r) => n + r.palabras, 0);
    const tiempos = resultados.flatMap((r) => r.tiempos);
    const ms = tiempos.map((t) => t.ms).sort((a, b) => a - b);
    const audio = tiempos.reduce((n, t) => n + t.segundos, 0);
    return {
        wer: resultados.reduce((n, r) => n + r.errores, 0) / palabrasTot,
        werSinTildes: resultados.reduce((n, r) => n + r.erroresSinTildes, 0) / palabrasTot,
        msMedio: ms.reduce((a, b) => a + b, 0) / ms.length,
        msP95: ms[Math.min(ms.length - 1, Math.floor(ms.length * 0.95))],
        rtf: ms.reduce((a, b) => a + b, 0) / 1000 / audio,
    };
}

async function main() {
    const exe = buscar(path.join(DIR, 'bin'), process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server');
    if (!exe) throw new Error('Falta whisper.cpp. Corré primero: npm run whisper:setup');

    const disponibles = fs.existsSync(path.join(DIR, 'models'))
        ? fs.readdirSync(path.join(DIR, 'models')).filter((f) => /^ggml-.+\.bin$/.test(f)).map((f) => f.slice(5, -4))
        : [];
    const modelos = opcion('modelos', disponibles.join(',')).split(',').filter(Boolean);
    const faltan = modelos.filter((m) => !disponibles.includes(m));
    if (faltan.length) throw new Error(`Modelos no descargados: ${faltan.join(', ')} (npm run whisper:setup -- -Modelo <nombre>)`);
    if (modelos.length === 0) throw new Error('No hay modelos en whisper/models/.');
    const hilos = Number(opcion('hilos', os.cpus().length));

    const { sesiones, sinReferencia } = cargarSesiones();
    if (sinReferencia.length) {
        console.log(`Sesiones sin referencia.txt (se saltean): ${sinReferencia.join(', ')}`);
    }
    if (sesiones.length === 0) {
        throw new Error('No hay sesiones con referencia.txt en whisper/muestras/. Ver las instrucciones al principio de este archivo.');
    }
    const nTramos = sesiones.reduce((n, s) => n + s.tramos.length, 0);
    const minutos = sesiones.reduce((n, s) => n + s.tramos.reduce((m, t) => m + t.segundos, 0), 0) / 60;
    console.log(`${sesiones.length} sesiones, ${nTramos} tramos, ${minutos.toFixed(1)} min de audio. Modelos: ${modelos.join(', ')}\n`);

    const filas = [];
    const detalle = [];
    for (const modelo of modelos) {
        console.log(`> ${modelo}: cargando…`);
        const proc = await levantarServidor(exe, path.join(DIR, 'models', `ggml-${modelo}.bin`), hilos);
        try {
            await transcribir(sesiones[0].tramos[0].wav, VOCABULARIO.general); // calentamiento, no se mide
            for (const variante of Object.keys(VARIANTES)) {
                const porProcesado = {};
                for (const s of sesiones) {
                    const r = await medirSesion(s, variante);
                    (porProcesado[s.procesado] ||= []).push(r);
                    detalle.push({ modelo, variante, procesado: s.procesado, ...r });
                    process.stdout.write('.');
                }
                for (const [procesado, resultados] of Object.entries(porProcesado)) {
                    const fila = { modelo, variante, procesado, ...resumir(resultados) };
                    filas.push(fila);
                    console.log(` ${variante} (procesado ${procesado}): WER ${pct(fila.wer)}, ${Math.round(fila.msMedio)} ms/tramo`);
                }
            }
        } finally {
            proc.kill();
        }
    }

    // Registro acumulado (sin texto: solo métricas).
    const fecha = new Date().toLocaleString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 16);
    const encabezado = !fs.existsSync(REGISTRO)
        ? '# Mediciones del dictado\n\n' +
          'Cada corrida de `npm run whisper:medir` agrega una sección. **WER** = porcentaje de palabras mal ' +
          'transcriptas (más bajo es mejor); **sin tildes** ignora errores de acentuación. ' +
          '**Latencia** = lo que tarda el modelo por tramo; **RTF** = tiempo de proceso / duración del audio ' +
          '(menos de 1 = más rápido que el habla). Variante **antes** = prompt fijo sin contexto; ' +
          '**ahora** = vocabulario de la especialidad + contexto. **Procesado** = supresión de ruido y ' +
          'ganancia automática del navegador.\n'
        : '';
    const tabla = [
        `\n## ${fecha}\n`,
        `${os.cpus()[0].model.trim()}, ${hilos} hilos. ${sesiones.length} sesiones, ${nTramos} tramos, ${minutos.toFixed(1)} min de audio.\n`,
        '| Modelo | Variante | Procesado | WER | WER sin tildes | Latencia media | Latencia p95 | RTF |',
        '|---|---|---|---|---|---|---|---|',
        ...filas.map(
            (f) =>
                `| ${f.modelo} | ${f.variante} | ${f.procesado} | ${pct(f.wer)} | ${pct(f.werSinTildes)} | ` +
                `${(f.msMedio / 1000).toFixed(2)} s | ${(f.msP95 / 1000).toFixed(2)} s | ${f.rtf.toFixed(2)} |`
        ),
        '',
    ].join('\n');
    fs.appendFileSync(REGISTRO, encabezado + tabla);

    // Detalle con las transcripciones, para ver qué palabras falla cada modelo (no se versiona).
    fs.mkdirSync(DIR_DETALLE, { recursive: true });
    const archivoDetalle = path.join(DIR_DETALLE, `${fecha.replace(/[: ]/g, '-')}.json`);
    fs.writeFileSync(archivoDetalle, JSON.stringify(detalle, null, 2));

    console.log(tabla);
    console.log(`Registro: ${path.relative(process.cwd(), REGISTRO)}\nDetalle: ${path.relative(process.cwd(), archivoDetalle)}`);
}

main().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
