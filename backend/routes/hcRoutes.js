// Exportación / Importación de Historias Clínicas (Fase D). Se monta en /hc.
// Requiere rol profesional; el alcance (admin = toda la clínica, profesional =
// sus pacientes) lo resuelve el controller a partir de la sesión.

const express = require('express');
const router = express.Router();
const hcController = require('../controllers/hcController');
const { requireRole, requireClinicaAdmin } = require('../middleware/auth');
const { requireFeature } = require('../middleware/plan');

router.use(requireRole('profesional'));

router.get('/export', hcController.exportar);
router.get('/pacientes', hcController.pacientesEnAlcance);

// Import: parser JSON con límite alto (los archivos de HC pueden ser grandes; el
// parser global de index.js saltea esta ruta).
// Fase L: exportar no se limita NUNCA (los datos son de la clínica); importar depende del plan.
// Auditoría 2026-10-15 (#9): solo el admin importa (el archivo trae fecha y autor de
// cada registro, y se suma a la HC de pacientes existentes).
router.post('/import', requireClinicaAdmin, requireFeature('importar_hc'), express.json({ limit: '20mb' }), hcController.importar);

module.exports = router;
