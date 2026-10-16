const express = require('express');
const router = express.Router();
const pacienteController = require('../controllers/pacienteController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

// La historia clínica es exclusiva de profesionales autenticados.
// La identidad del profesional se toma de la sesión (ver pacienteController).
router.use(requireRole('profesional'));

router.post('/regis-pacient', validate(schemas.pacient.regis), pacienteController.regisPacient);
router.post('/save-data-pacient', validate(schemas.pacient.saveData), pacienteController.saveDataPacient);
router.post('/get-data-pacient', validate(schemas.pacient.getData), pacienteController.getDataPacient);
// Alta: ¿el DNI ya es paciente de la clínica? / cuenta de acceso del paciente.
router.post('/existe-pacient', validate(schemas.pacient.getData), pacienteController.existePaciente);
router.post('/enviar-acceso', validate(schemas.pacient.enviarAcceso), pacienteController.enviarAcceso);
// Fase V: código para que el paciente cargado sin email vincule su historia.
router.post('/codigo-vinculacion', validate(schemas.pacient.codigoVinculacion), pacienteController.codigoVinculacion);
// Ficha para la obra social: datos del profesional que la emite.
router.get('/emisor', pacienteController.getEmisor);
// Fase K: cobertura del paciente (obra social del catálogo + afiliado + plan).
router.put('/cobertura', validate(schemas.pacient.cobertura), pacienteController.actualizarCobertura);

module.exports = router;
