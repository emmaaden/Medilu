// Pediatría (Fase Z): catálogos y validación. Fuente única de los códigos que se
// guardan en vacuna_aplicada y hito_desarrollo (db/faseZ_pediatria.sql). El cliente
// recibe el catálogo junto con los datos del paciente (no lo duplica).
//
// VACUNAS: Calendario Nacional de Vacunación de Argentina (Ministerio de Salud).
// Cada dosis tiene la edad recomendada en meses; `hasta` es la edad máxima en meses
// para aplicarla cuando la hay (rotavirus). Las de zona de riesgo van con `zona`.
// Revisar contra el calendario vigente cuando el Ministerio lo actualice.
//
// HITOS: pautas madurativas orientativas (edad en que la mayoría ya lo logra). No
// reemplazan una prueba de tamizaje (p. ej. PRUNAPE).

const VACUNAS = [
    { codigo: 'bcg', nombre: 'BCG', dosis: [{ dosis: 'Única', edad: 0 }] },
    { codigo: 'hepb', nombre: 'Hepatitis B', dosis: [{ dosis: 'Neonatal', edad: 0 }] },
    {
        codigo: 'quintuple', nombre: 'Quíntuple / Hexavalente (DTP-Hib-HB)',
        dosis: [{ dosis: '1ra', edad: 2 }, { dosis: '2da', edad: 4 }, { dosis: '3ra', edad: 6 }, { dosis: 'Refuerzo', edad: 15 }],
    },
    {
        codigo: 'ipv', nombre: 'Polio (IPV / Salk)',
        dosis: [{ dosis: '1ra', edad: 2 }, { dosis: '2da', edad: 4 }, { dosis: '3ra', edad: 6 }, { dosis: 'Refuerzo', edad: 60 }],
    },
    {
        codigo: 'neumococo', nombre: 'Neumococo conjugada',
        dosis: [{ dosis: '1ra', edad: 2 }, { dosis: '2da', edad: 4 }, { dosis: 'Refuerzo', edad: 12 }],
    },
    {
        codigo: 'rotavirus', nombre: 'Rotavirus',
        dosis: [{ dosis: '1ra', edad: 2, hasta: 3.5 }, { dosis: '2da', edad: 4, hasta: 6 }],
    },
    {
        codigo: 'meningo', nombre: 'Meningococo ACYW',
        dosis: [{ dosis: '1ra', edad: 3 }, { dosis: '2da', edad: 5 }, { dosis: 'Refuerzo', edad: 15 }, { dosis: 'Adolescente', edad: 132 }],
    },
    { codigo: 'gripe', nombre: 'Antigripal', anual: true, dosis: [{ dosis: '1ra', edad: 6 }, { dosis: '2da', edad: 7 }] },
    { codigo: 'srp', nombre: 'Triple viral (SRP)', dosis: [{ dosis: '1ra', edad: 12 }, { dosis: '2da', edad: 60 }] },
    { codigo: 'hepa', nombre: 'Hepatitis A', dosis: [{ dosis: 'Única', edad: 12 }] },
    { codigo: 'varicela', nombre: 'Varicela', dosis: [{ dosis: '1ra', edad: 15 }, { dosis: '2da', edad: 60 }] },
    {
        codigo: 'fiebre_amarilla', nombre: 'Fiebre amarilla', zona: true,
        dosis: [{ dosis: '1ra', edad: 18 }, { dosis: 'Refuerzo', edad: 132 }],
    },
    { codigo: 'dtp', nombre: 'Triple bacteriana celular (DTP)', dosis: [{ dosis: 'Refuerzo', edad: 60 }] },
    { codigo: 'dtpa', nombre: 'Triple bacteriana acelular (dTpa)', dosis: [{ dosis: 'Refuerzo', edad: 132 }] },
    { codigo: 'vph', nombre: 'VPH', dosis: [{ dosis: 'Única', edad: 132 }] },
    { codigo: 'dt', nombre: 'Doble adultos (dT)', dosis: [{ dosis: 'Refuerzo', edad: 192 }] },
    { codigo: 'covid', nombre: 'COVID-19', fueraDeCalendario: true, dosis: [] },
    { codigo: 'dengue', nombre: 'Dengue', fueraDeCalendario: true, dosis: [] },
];

const AREAS_HITO = {
    motor: 'Motor grueso',
    fino: 'Motor fino',
    lenguaje: 'Lenguaje',
    social: 'Socioemocional',
};

const HITOS = [
    { codigo: 'm2_sonrisa', edad: 2, area: 'social', texto: 'Sonrisa social' },
    { codigo: 'm2_mirada', edad: 2, area: 'social', texto: 'Fija la mirada y sigue objetos' },
    { codigo: 'm2_cabeza', edad: 2, area: 'motor', texto: 'Levanta la cabeza boca abajo' },
    { codigo: 'm2_sonidos', edad: 2, area: 'lenguaje', texto: 'Reacciona a sonidos, emite sonidos guturales' },
    { codigo: 'm4_sosten', edad: 4, area: 'motor', texto: 'Sostén cefálico firme' },
    { codigo: 'm4_manos', edad: 4, area: 'fino', texto: 'Junta las manos en la línea media y las lleva a la boca' },
    { codigo: 'm4_carcajada', edad: 4, area: 'lenguaje', texto: 'Ríe a carcajadas, gorjea' },
    { codigo: 'm6_rola', edad: 6, area: 'motor', texto: 'Rola (boca arriba ↔ boca abajo)' },
    { codigo: 'm6_sienta_apoyo', edad: 6, area: 'motor', texto: 'Se sienta con apoyo' },
    { codigo: 'm6_toma', edad: 6, area: 'fino', texto: 'Toma objetos y los pasa de mano' },
    { codigo: 'm6_balbucea', edad: 6, area: 'lenguaje', texto: 'Balbucea' },
    { codigo: 'm6_reconoce', edad: 6, area: 'social', texto: 'Reconoce caras conocidas' },
    { codigo: 'm9_sienta', edad: 9, area: 'motor', texto: 'Se sienta solo sin apoyo' },
    { codigo: 'm9_pinza', edad: 9, area: 'fino', texto: 'Pinza inferior (pulgar y costado del índice)' },
    { codigo: 'm9_silabas', edad: 9, area: 'lenguaje', texto: 'Dice sílabas repetidas (ma-ma, pa-pa)' },
    { codigo: 'm9_extrana', edad: 9, area: 'social', texto: 'Extraña a desconocidos' },
    { codigo: 'm12_parado', edad: 12, area: 'motor', texto: 'Se para con apoyo y da pasos sostenido' },
    { codigo: 'm12_pinza_fina', edad: 12, area: 'fino', texto: 'Pinza fina (pulgar e índice)' },
    { codigo: 'm12_palabras', edad: 12, area: 'lenguaje', texto: 'Dice 1 o 2 palabras con sentido' },
    { codigo: 'm12_chau', edad: 12, area: 'social', texto: 'Hace "chau" con la mano, señala lo que quiere' },
    { codigo: 'm15_camina', edad: 15, area: 'motor', texto: 'Camina solo' },
    { codigo: 'm15_cubos', edad: 15, area: 'fino', texto: 'Apila 2 cubos' },
    { codigo: 'm15_ordenes', edad: 15, area: 'lenguaje', texto: 'Entiende órdenes simples' },
    { codigo: 'm18_garabatea', edad: 18, area: 'fino', texto: 'Garabatea' },
    { codigo: 'm18_cuerpo', edad: 18, area: 'lenguaje', texto: 'Señala partes del cuerpo, usa varias palabras' },
    { codigo: 'm18_cuchara', edad: 18, area: 'social', texto: 'Come solo con cuchara' },
    { codigo: 'm24_corre', edad: 24, area: 'motor', texto: 'Corre y patea una pelota' },
    { codigo: 'm24_torre', edad: 24, area: 'fino', texto: 'Hace una torre de 4 a 6 cubos' },
    { codigo: 'm24_frases', edad: 24, area: 'lenguaje', texto: 'Frases de 2 palabras' },
    { codigo: 'm24_imita', edad: 24, area: 'social', texto: 'Juego de imitación' },
    { codigo: 'm36_escalera', edad: 36, area: 'motor', texto: 'Sube escaleras alternando los pies' },
    { codigo: 'm36_circulo', edad: 36, area: 'fino', texto: 'Copia un círculo' },
    { codigo: 'm36_frases', edad: 36, area: 'lenguaje', texto: 'Frases de 3 o más palabras, se le entiende' },
    { codigo: 'm36_esfinter', edad: 36, area: 'social', texto: 'Control de esfínteres diurno' },
    { codigo: 'm36_juega', edad: 36, area: 'social', texto: 'Juega con otros chicos' },
    { codigo: 'm48_salta', edad: 48, area: 'motor', texto: 'Salta en un pie' },
    { codigo: 'm48_cruz', edad: 48, area: 'fino', texto: 'Copia una cruz' },
    { codigo: 'm48_cuenta', edad: 48, area: 'lenguaje', texto: 'Cuenta lo que hizo, dice su nombre completo' },
    { codigo: 'm48_viste', edad: 48, area: 'social', texto: 'Se viste con ayuda' },
    { codigo: 'm60_equilibrio', edad: 60, area: 'motor', texto: 'Se para en un pie 10 segundos' },
    { codigo: 'm60_cuadrado', edad: 60, area: 'fino', texto: 'Copia un cuadrado, dibuja una persona' },
    { codigo: 'm60_numeros', edad: 60, area: 'lenguaje', texto: 'Cuenta hasta 10, conoce colores' },
    { codigo: 'm60_viste', edad: 60, area: 'social', texto: 'Se viste solo' },
];

const CODIGOS_VACUNA = new Set([...VACUNAS.map((v) => v.codigo), 'otra']);
const CODIGOS_HITO = new Set(HITOS.map((h) => h.codigo));

const CATALOGO = { vacunas: VACUNAS, hitos: HITOS, areasHito: AREAS_HITO };

// Filas de la base → objetos para el cliente (camelCase).
function serializarPerinatal(r) {
    if (!r) return null;
    return {
        edadGestacionalSem: r.edad_gestacional_sem,
        edadGestacionalDias: r.edad_gestacional_dias,
        pesoNacerG: r.peso_nacer_g,
        tallaNacerCm: r.talla_nacer_cm == null ? null : Number(r.talla_nacer_cm),
        pcNacerCm: r.pc_nacer_cm == null ? null : Number(r.pc_nacer_cm),
        apgar1: r.apgar_1,
        apgar5: r.apgar_5,
        tipoParto: r.tipo_parto,
        grupoSanguineo: r.grupo_sanguineo,
        pesquisaNeonatal: r.pesquisa_neonatal,
        otoemisiones: r.otoemisiones,
        lactancia: r.lactancia,
        notas: r.notas,
        actualizadoEn: r.actualizado_en,
    };
}

function num(v) {
    return v == null ? null : Number(v);
}

function serializarMedicion(r) {
    return {
        id: r.id,
        fecha: r.fecha,
        pesoKg: num(r.peso_kg),
        tallaCm: num(r.talla_cm),
        posicion: r.posicion,
        pcCm: num(r.pc_cm),
        notas: r.notas,
        idProfesional: r.id_profesional,
    };
}

function serializarVacuna(r) {
    return {
        id: r.id,
        vacuna: r.vacuna,
        vacunaOtra: r.vacuna_otra,
        dosis: r.dosis,
        fecha: r.fecha,
        lote: r.lote,
        lugar: r.lugar,
        notas: r.notas,
        idProfesional: r.id_profesional,
    };
}

function serializarHito(r) {
    return { hito: r.hito, estado: r.estado, fechaEvaluacion: r.fecha_evaluacion };
}

// Body (ya validado por zod) → columnas de antecedente_perinatal.
function columnasPerinatal(b) {
    return {
        edad_gestacional_sem: b.edadGestacionalSem ?? null,
        edad_gestacional_dias: b.edadGestacionalDias ?? null,
        peso_nacer_g: b.pesoNacerG ?? null,
        talla_nacer_cm: b.tallaNacerCm ?? null,
        pc_nacer_cm: b.pcNacerCm ?? null,
        apgar_1: b.apgar1 ?? null,
        apgar_5: b.apgar5 ?? null,
        tipo_parto: b.tipoParto ?? null,
        grupo_sanguineo: b.grupoSanguineo || null,
        pesquisa_neonatal: b.pesquisaNeonatal ?? null,
        otoemisiones: b.otoemisiones ?? null,
        lactancia: b.lactancia ?? null,
        notas: b.notas || null,
    };
}

module.exports = {
    VACUNAS,
    HITOS,
    AREAS_HITO,
    CATALOGO,
    CODIGOS_VACUNA,
    CODIGOS_HITO,
    serializarPerinatal,
    serializarMedicion,
    serializarVacuna,
    serializarHito,
    columnasPerinatal,
};
