// Fase AA: el paciente carga sus datos personales desde el link que le mandó el
// profesional. Público (sin sesión): el token del link es la única llave.
// Se monta en /api/datos-paciente ('/completar-datos' es la ruta del SPA).

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const linkDatosController = require('../controllers/linkDatosController');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

// Más estricto que el general: cada envío prueba un DNI contra el link.
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

router.get('/', limiter, validate(schemas.linkDatos.ver, 'query'), linkDatosController.verLink);
router.post('/', limiter, validate(schemas.linkDatos.enviar), linkDatosController.enviarDatos);

module.exports = router;
