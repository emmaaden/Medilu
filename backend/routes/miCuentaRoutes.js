// Autogestión del paciente logueado (Fase 3). Se monta en /api/mi-cuenta.
// Todas las rutas exigen rol paciente; la identidad se toma de la sesión.

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const miCuentaController = require('../controllers/miCuentaController');
const certificadoController = require('../controllers/certificadoController');
const { requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.use(requireRole('paciente'));

router.get('/perfil', miCuentaController.getPerfil);
router.put('/perfil', validate(schemas.miCuenta.updatePerfil), miCuentaController.updatePerfil);
router.get('/historia', miCuentaController.getHistoria);
router.get('/historia/export', miCuentaController.exportHistoria);

// Fase C: certificados del propio paciente.
router.get('/certificados', certificadoController.misCertificados);
// Fase K: quién accedió a mi historia clínica (bitácora).
router.get('/accesos', miCuentaController.misAccesos);
// Fase V: vincular la ficha de un consultorio con el código que dio el profesional.
// Limiter propio y estricto: frena que se prueben códigos al azar.
const vincularLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Hiciste demasiados intentos. Esperá 15 minutos y probá de nuevo.' },
});
router.post('/vincular-historia', vincularLimiter, validate(schemas.miCuenta.vincularHistoria), miCuentaController.vincularHistoria);

module.exports = router;
