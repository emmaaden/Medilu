import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Prefijos de API servidos por el backend Express (puerto 3000).
// En desarrollo, Vite hace proxy de estas rutas para compartir el mismo origen
// (necesario para que la cookie de sesión httpOnly viaje con credentials:'include').
const API_PREFIXES = [
  '/auth',
  '/hour',
  '/pacient',
  '/especialidades',
  '/profesional',
  '/avatars',
  '/ortodoncia',
  '/clinica',
  '/clinica-publica',
  '/admin',
  '/certificados',
  '/hc',
  '/staff',
  '/estudios',
  '/dictado',
  '/auditoria',
  '/catalogos',
  '/autorizaciones',
  '/pediatria',
  '/plataforma',
  '/professionals',
  '/available-slots',
  '/create-event',
  '/api',
  '/robots.txt',
  '/sitemap.xml',
]

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target: BACKEND, changeOrigin: true }])
    ),
  },
})
