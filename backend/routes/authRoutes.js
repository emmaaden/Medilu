const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');

// Rate-limit estricto SOLO para las operaciones sensibles de credenciales.
// (get-area / save-area quedan bajo el limiter general de index.js.)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.post('/register', authLimiter, validate(schemas.auth.register), authController.register);
router.post('/login', authLimiter, validate(schemas.auth.login), authController.login);
router.post('/logout', authController.logout);

// Fase A — multi-clínica: listar las clínicas del usuario y fijar la activa.
router.get('/mis-clinicas', requireAuth, authController.misClinicas);
router.post('/select-clinica', requireAuth, validate(schemas.auth.selectClinica), authController.selectClinica);
// Fase U — un profesional ya registrado se suma a otra clínica con un código.
router.post('/unirse-clinica', authLimiter, requireRole('profesional'), validate(schemas.auth.unirseClinica), authController.unirseClinica);

// Fase O — cuenta que es staff y además paciente: elegir (o cambiar) el perfil.
router.get('/perfiles', requireAuth, authController.misPerfiles);
router.post('/select-perfil', requireAuth, validate(schemas.auth.selectPerfil), authController.selectPerfil);

// Recuperación de contraseña (envía el email de recuperación de Supabase).
router.post('/forgot-password', authLimiter, validate(schemas.auth.forgotPassword), authController.forgotPassword);

// Cambiar la contraseña estando logueado (pide la actual).
router.post('/cambiar-contrasena', authLimiter, requireAuth, validate(schemas.auth.cambiarContrasena), authController.cambiarContrasena);

// Reenviar el email de confirmación de la cuenta (registro con email sin confirmar).
router.post('/reenviar-confirmacion', authLimiter, validate(schemas.auth.reenviarConfirmacion), authController.reenviarConfirmacion);

// Área del profesional autenticado (usa la sesión, no el body).
router.post('/get-area', requireAuth, authController.getArea);

// Asignar especialidad al profesional autenticado.
router.post('/save-area', requireRole('profesional'), validate(schemas.auth.saveArea), authController.saveArea);

module.exports = router;
