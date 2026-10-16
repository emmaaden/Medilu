// Códigos de activación (alta de staff en una clínica). Auditoría 2026-10-15, #12:
// se generan con crypto (no Math.random) y vencen a los DIAS_VIGENCIA días de creados:
// un código vencido no se puede canjear ni reserva un lugar del plan.

const crypto = require('crypto');

const DIAS_VIGENCIA = 30;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin caracteres ambiguos (0/O, 1/I)

function generarCodigo(longitud = 8) {
    let c = '';
    for (let i = 0; i < longitud; i++) c += ALFABETO[crypto.randomInt(ALFABETO.length)];
    return c;
}

// Fecha (ISO) desde la que un código sigue vigente: los creados antes, vencieron.
function vigenteDesde() {
    return new Date(Date.now() - DIAS_VIGENCIA * 24 * 3600 * 1000).toISOString();
}

function vencido(creadoEn) {
    return !!creadoEn && new Date(creadoEn).toISOString() < vigenteDesde();
}

module.exports = { DIAS_VIGENCIA, generarCodigo, vigenteDesde, vencido };
