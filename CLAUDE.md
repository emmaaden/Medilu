# Medilu — Arquitectura del proyecto

Monorepo con dos aplicaciones independientes:

- **`/backend`** — API de Node.js / Express (Supabase, sesiones, RLS por JWT).
  Punto de entrada: `backend/index.js`. Dependencias y scripts en `backend/package.json`.
- **`/frontend`** — SPA con **React + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui**.
  Alias de importación `@/*` → `./src/*` (configurado en `tsconfig`/`tsconfig.app.json` y `vite.config.ts`).
  CSS global y tokens de tema en `frontend/src/index.css`.

## Reglas de UI (frontend)

- Usa **siempre** componentes de `@/components/ui` (shadcn/ui).
- Para nuevos componentes, usa la CLI: `npx shadcn@latest add <componente>`.
- No escribas estilos CSS arbitrarios; usa clases utilitarias de Tailwind.
