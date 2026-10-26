const express = require('express');
const router = express.Router();
const plataformaController = require('../controllers/plataformaController');
const { requirePlataforma } = require('../middleware/plan');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

// Fase L: todo el panel exige ser del equipo de la plataforma (PLATAFORMA_ADMIN_EMAILS).
router.use(requirePlataforma);

router.get('/clinicas', plataformaController.listarClinicas);
router.patch('/clinicas/:id/suscripcion', validate(schemas.plataforma.suscripcion), plataformaController.actualizarSuscripcion);
router.patch('/planes/:id', validate(schemas.plataforma.plan), plataformaController.actualizarPlan);
router.post('/clinicas/:id/sincronizar', plataformaController.sincronizarMp);
router.post('/clinicas/:id/cancelar-debito', plataformaController.cancelarDebito);
router.post('/planes/:id/aplicar-precios', validate(schemas.plataforma.aplicarPrecios), plataformaController.aplicarPrecios);

// Fase Z: "Ver como" otro rol/especialidad (solo en la sesión de quien lo pide).
router.post('/vista', validate(schemas.plataforma.vista), plataformaController.entrarVista);
router.delete('/vista', plataformaController.salirVista);
router.get('/vista/pacientes', plataformaController.pacientesVista);

module.exports = router;
