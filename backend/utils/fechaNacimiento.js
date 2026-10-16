// Fecha de nacimiento: normalización y validación compartidas por el alta de paciente,
// Mis datos, el autoregistro y la importación de historias clínicas.

const { hoyAR } = require('./fechaAR');

const MINIMA = '1900-01-01';

// Normaliza a ISO 'YYYY-MM-DD' y valida que la fecha exista y esté entre 1900 y hoy.
// Acepta ISO (con o sin hora) o 'd/m/aaaa'. El año tiene que venir con 4 cifras: con 2
// ('85') no se sabe si es 1985 o 2085 (antes se armaba '20' + aa y quedaba en el futuro).
// Devuelve { ok: true, fecha } (fecha null si vino vacía) o { ok: false, error }.
function parseFechaNacimiento(f) {
    if (f === undefined || f === null || String(f).trim() === '') return { ok: true, fecha: null };
    const s = String(f).trim();

    let y, mo, d;
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/);
    if (m) {
        [, y, mo, d] = m;
    } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
        [, d, mo, y] = m;
    } else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(s)) {
        return { ok: false, error: 'Escribí el año de nacimiento con 4 cifras (por ejemplo, 1985).' };
    } else {
        return { ok: false, error: 'La fecha de nacimiento no es válida.' };
    }

    const fecha = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    // Fechas como 31/02 no existen: Date las corre al mes siguiente y dejan de coincidir.
    const dt = new Date(`${fecha}T12:00:00Z`);
    if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== fecha) {
        return { ok: false, error: 'La fecha de nacimiento no existe. Revisá el día y el mes.' };
    }
    if (fecha < MINIMA) {
        return { ok: false, error: 'La fecha de nacimiento no puede ser anterior a 1900.' };
    }
    if (fecha > hoyAR()) {
        return { ok: false, error: 'La fecha de nacimiento no puede ser posterior a hoy.' };
    }
    return { ok: true, fecha };
}

// Edad en años cumplidos a hoy (hora argentina), o null si la fecha falta, no es válida
// o es futura (hay datos viejos cargados antes de esta validación).
function calcEdad(fnac) {
    const m = fnac && String(fnac).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [hy, hm, hd] = hoyAR().split('-').map(Number);
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    let edad = hy - y;
    if (hm < mo || (hm === mo && hd < d)) edad--;
    return edad >= 0 ? edad : null;
}

module.exports = { parseFechaNacimiento, calcEdad };
