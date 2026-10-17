const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const legalController = require('../controllers/legalController');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

// Públicas, sin autenticación (la norma prohíbe exigir registración previa).
// Limiter propio: cada solicitud dispara emails, así que se acota el abuso.
const solicitudLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });

router.post(
    '/api/solicitudes-consumo',
    solicitudLimiter,
    validate(schemas.legal.solicitudConsumo),
    legalController.solicitudConsumo
);
// Reporte de suplantación de identidad: también público (quien lo sufre puede no
// tener cuenta, o tenerla tomada por otro).
const reporteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
router.post(
    '/api/reportes-suplantacion',
    reporteLimiter,
    validate(schemas.legal.reporteSuplantacion),
    legalController.reporteSuplantacion
);
router.get('/robots.txt', legalController.robots);
router.get('/sitemap.xml', legalController.sitemap);

module.exports = router;
