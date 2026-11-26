// Fase AB: centro de notificaciones del panel (campana). Se monta en /notificaciones.
// Cualquier usuario del staff con sesión; cada uno ve solo las suyas en la clínica
// activa (ver controllers/notificacionController.js).

const express = require('express');
const router = express.Router();
const notificacionController = require('../controllers/notificacionController');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

router.use(requireAuth);

router.get('/', validate(schemas.notificaciones.listar, 'query'), notificacionController.listar);
router.post('/leer', validate(schemas.notificaciones.leer), notificacionController.marcarLeidas);

module.exports = router;
