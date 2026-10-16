const express = require('express');
const router = express.Router();
const multer = require('multer');
const avatarsController = require('../controllers/avatarsController');
const { requireAuth } = require('../middleware/auth');

// Configuración de multer (subida en memoria, no en disco local).
// Límite de 2 MB y solo imágenes.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        // Solo formatos de mapa de bits: un SVG puede llevar scripts y el bucket de
        // avatares es público (auditoría 2026-10-15, #12).
        if (/^image\/(png|jpe?g|webp)$/.test(file.mimetype)) return cb(null, true);
        cb(new Error('La foto tiene que ser PNG, JPG o WebP'));
    }
});

// El avatar pertenece al usuario autenticado.
router.use(requireAuth);

router.post('/upload', upload.single('avatar'), avatarsController.uploadAvatar);
router.post('/get-img', avatarsController.getAvatar);

module.exports = router;
