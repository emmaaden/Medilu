// Odontograma (Fase H): normalización compartida de los hallazgos por diente.
//
// Un "diente" que llega del frontend (o de un import de HC) es un hallazgo:
//   { numero, condicion, cara, estado, notas }
// Este módulo es la ÚNICA fuente de verdad de qué valores son válidos y de cómo
// se convierten los datos legacy. Lo usan pacienteController, miCuentaController
// y hcController para que guardar/leer/exportar/importar sean consistentes.

// Hallazgos clínicos válidos (deben coincidir con el CHECK de faseH_odontograma.sql
// y con el catálogo del componente Odontogram del frontend).
const CONDICIONES = [
    'caries', 'obturacion', 'sellante', 'fractura',
    'corona', 'endodoncia', 'ausente', 'extraccion',
    'implante', 'protesis_fija', 'protesis_removible', 'movilidad',
];

// Superficies dentales válidas (o null = diente completo).
const CARAS = ['mesial', 'distal', 'vestibular', 'lingual', 'palatina', 'oclusal', 'incisal'];

// Estado del hallazgo: realizado (rojo) | pendiente (azul).
const ESTADOS = ['realizado', 'pendiente'];

// Mapeo del `estado` legacy (modelo viejo: un estado por diente entero) al nuevo.
// 'sano' devuelve null: en el modelo nuevo "sano" es la ausencia de hallazgos.
const LEGACY = {
    caries: { condicion: 'caries', estado: 'pendiente' },
    tratado: { condicion: 'obturacion', estado: 'realizado' },
    falta: { condicion: 'ausente', estado: 'realizado' },
    sano: null,
};

// Numeración FDI pura, sin el prefijo "tooth-" que usaba el frontend viejo.
function normNumero(n) {
    return String(n == null ? '' : n).replace(/^tooth-/, '').trim();
}

// Normaliza un hallazgo entrante a una fila lista para insertar, o null si es
// inválido / debe descartarse (p. ej. legacy 'sano'). NO incluye id_registro.
function normalizarDiente(d) {
    if (!d || d.numero == null) return null;

    let condicion = typeof d.condicion === 'string' ? d.condicion : null;
    let estado = typeof d.estado === 'string' ? d.estado : null;
    let cara = d.cara != null ? String(d.cara) : null;

    // Compatibilidad: si no vino `condicion` pero `estado` trae un valor legacy.
    if (!condicion && estado && Object.prototype.hasOwnProperty.call(LEGACY, estado)) {
        const map = LEGACY[estado];
        if (!map) return null; // 'sano' legacy -> se descarta
        condicion = map.condicion;
        estado = map.estado;
    }

    if (!CONDICIONES.includes(condicion)) return null;
    if (!ESTADOS.includes(estado)) estado = 'realizado';
    if (cara && !CARAS.includes(cara)) cara = null;

    const numero = normNumero(d.numero);
    if (!numero) return null;

    return {
        numero,
        condicion,
        cara,
        estado,
        notas: d.notas ? String(d.notas).slice(0, 1000) : null,
    };
}

// Convierte un array de hallazgos entrantes en filas para insertar en
// registro_diente (agrega id_registro). Descarta los inválidos.
function filasParaRegistro(idRegistro, dientes) {
    if (!Array.isArray(dientes)) return [];
    return dientes
        .map(normalizarDiente)
        .filter(Boolean)
        .map((d) => ({ id_registro: idRegistro, ...d }));
}

// Forma de salida (API) de una fila de registro_diente.
function serializarDiente(d) {
    return {
        numero: normNumero(d.numero),
        condicion: d.condicion,
        cara: d.cara || null,
        estado: d.estado || 'realizado',
        notas: d.notas || '',
    };
}

module.exports = {
    CONDICIONES,
    CARAS,
    ESTADOS,
    normNumero,
    normalizarDiente,
    filasParaRegistro,
    serializarDiente,
};
