// Dictado por voz (motor propio). El navegador graba y manda tramos cortos de audio
// WAV (16 kHz, mono); acá se reenvían al servidor local de whisper.cpp y se devuelve
// el texto. El audio se procesa en memoria: no se guarda en ningún lado (salvo el modo
// de muestras para medir modelos, solo en desarrollo; ver guardarMuestra).

const fs = require('fs/promises');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { armarPrompt, limpiar } = require('../utils/dictado');
const { areaEfectiva } = require('../utils/vista');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const WHISPER_URL = (process.env.WHISPER_URL || 'http://127.0.0.1:8178').replace(/\/+$/, '');

// Especialidad del profesional, para elegir el vocabulario del prompt. Se cachea porque
// un dictado manda un tramo cada pocos segundos.
const ESPECIALIDAD_TTL_MS = 10 * 60 * 1000;
const especialidades = new Map(); // idRole -> { nombre, vence }

async function especialidadDe(idRole) {
    if (!idRole) return null;
    const cache = especialidades.get(idRole);
    if (cache && cache.vence > Date.now()) return cache.nombre;
    const { data, error } = await supabase
        .from('especialidad_profesional')
        .select('id_especialidad ( nombre )')
        .eq('id_profesional', idRole)
        .limit(1);
    if (error) {
        console.error('Dictado: no se pudo leer la especialidad:', error.message);
        return null;
    }
    const nombre = data?.[0]?.id_especialidad?.nombre || null;
    especialidades.set(idRole, { nombre, vence: Date.now() + ESPECIALIDAD_TTL_MS });
    return nombre;
}

/** Texto que ya tiene el campo (cabecera X-Dictado-Contexto, codificada con encodeURIComponent). */
function contextoDe(req) {
    try {
        return decodeURIComponent(req.get('X-Dictado-Contexto') || '');
    } catch {
        return '';
    }
}

// Modo muestras (DICTADO_GUARDAR_MUESTRAS=1, nunca en producción): guarda cada tramo y lo
// que devolvió el modelo en whisper/muestras/<sesión>/ para medir modelos con
// whisper/benchmark.js. Usarlo solo dictando casos de prueba, nunca datos de pacientes.
const GUARDAR_MUESTRAS =
    process.env.DICTADO_GUARDAR_MUESTRAS === '1' && process.env.NODE_ENV !== 'production';
const DIR_MUESTRAS = path.join(__dirname, '..', '..', 'whisper', 'muestras');

async function guardarMuestra(req, wav, meta) {
    const sesion = String(req.get('X-Dictado-Sesion') || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);
    const tramo = Number.parseInt(req.get('X-Dictado-Tramo'), 10);
    if (!sesion || !Number.isInteger(tramo) || tramo < 0) return;
    const dir = path.join(DIR_MUESTRAS, sesion);
    const base = path.join(dir, String(tramo).padStart(3, '0'));
    try {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(`${base}.wav`, wav);
        await fs.writeFile(`${base}.json`, JSON.stringify(meta, null, 2));
    } catch (err) {
        console.error('Dictado: no se pudo guardar la muestra:', err.message);
    }
}

exports.transcribir = async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 44) {
        return res.status(400).json({ error: 'Audio vacío o inválido.' });
    }

    const especialidad = areaEfectiva(req, await especialidadDe(req.session.user.idRole));
    const contexto = contextoDe(req);

    const form = new FormData();
    form.append('file', new Blob([req.body], { type: 'audio/wav' }), 'tramo.wav');
    form.append('language', 'es');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    form.append('prompt', armarPrompt(especialidad, contexto));

    const inicio = Date.now();
    let r;
    try {
        r = await fetch(`${WHISPER_URL}/inference`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(60_000),
        });
    } catch (err) {
        console.error('Dictado: whisper no responde:', err.cause?.code || err.message);
        return res.status(503).json({ error: 'El servicio de dictado no está disponible.' });
    }

    if (!r.ok) {
        console.error('Dictado: whisper respondió', r.status, await r.text().catch(() => ''));
        return res.status(502).json({ error: 'No se pudo transcribir el audio.' });
    }

    const data = await r.json().catch(() => ({}));
    const texto = limpiar(data.text);
    res.json({ texto });

    if (GUARDAR_MUESTRAS) {
        await guardarMuestra(req, req.body, {
            especialidad,
            contexto,
            procesado: req.get('X-Dictado-Procesado') === 'off' ? 'off' : 'on',
            texto,
            ms: Date.now() - inicio,
        });
    }
};
