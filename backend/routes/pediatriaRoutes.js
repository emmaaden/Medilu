// Pediatría (Fase Z). Se monta en /pediatria. Solo profesionales (no recepción ni
// auditoría); el paciente tiene que ser de la clínica activa (ver el controller).

const express = require('express');
const router = express.Router();
const pediatriaController = require('../controllers/pediatriaController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.use(requireRole('profesional'));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function idValido(req, res, next) {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Id inválido.' });
    return next();
}

router.patch('/mediciones/:id/anular', idValido, pediatriaController.anularMedicion);
router.patch('/vacunas/:id/anular', idValido, pediatriaController.anularVacuna);

router.get('/:pacienteId', pediatriaController.getDatos);
router.put('/:pacienteId/perinatal', validate(schemas.pediatria.perinatal), pediatriaController.guardarPerinatal);
router.post('/:pacienteId/mediciones', validate(schemas.pediatria.medicion), pediatriaController.crearMedicion);
router.post('/:pacienteId/vacunas', validate(schemas.pediatria.vacuna), pediatriaController.crearVacuna);
router.put('/:pacienteId/hitos', validate(schemas.pediatria.hitos), pediatriaController.guardarHitos);

module.exports = router;
