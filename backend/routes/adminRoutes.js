const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireRole, requireClinicaAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

// Todo el panel de administración exige ser admin de la clínica activa (Fase B).
router.use(requireRole('profesional'), requireClinicaAdmin);

router.get('/miembros', adminController.listarMiembros);
router.patch('/miembros/:id', validate(schemas.admin.actualizarMiembro), adminController.actualizarMiembro);
// Fase N: datos públicos de la clínica (los ve el paciente al elegirla para reservar).
router.get('/clinica', adminController.obtenerClinica);
router.put('/clinica', validate(schemas.admin.actualizarClinica), adminController.actualizarClinica);
// Fase N2: la clínica decide si recibe turnos online.
router.put('/clinica/turnos-online', validate(schemas.admin.turnosOnline), adminController.actualizarTurnosOnline);

module.exports = router;
