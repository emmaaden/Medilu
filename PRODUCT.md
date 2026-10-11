# Product

<!-- impeccable:product-schema 1 -->

> Todo este archivo fue **inferido del código** (README, rutas, copy de `frontend/src`) sin entrevista, por pedido del autor. Revisar y corregir lo que no sea correcto.

## Platform

web

## Users

- **Pacientes** (inferido): reservan turnos, consultan y gestionan sus turnos, ven su historia clínica, certificados y estudios. Uso mayormente ocasional y desde el celular ("Desde cualquier dispositivo").
- **Profesionales de la salud** (inferido): gestionan agenda, registro clínico, historias clínicas, certificados, estudios y odontograma. Uso diario, repetitivo, en consultorio.
- **Recepción** (inferido): rol con registro propio; opera la agenda de turnos por la clínica.
- **Administración de clínica** (inferido): ruta `/dashboard/admin`; multi-clínica vía `/seleccionar-clinica`.

## Product Purpose

Plataforma para gestionar turnos médicos y registrar información clínica: el paciente reserva en minutos y recibe confirmación por email; el profesional ordena agenda, pacientes y clínica desde un panel. Éxito = turnos reservados sin llamadas ni esperas y registro clínico completo y ordenado.

## Positioning

**«El consultorio entero en una app, y el paciente también»** (definido 2026-10-06). Un ecosistema del que ni el profesional ni el paciente tengan que salir:

- **Profesional:** turno → consulta (HC, dictado, certificado, estudios, CIE-10/obra social) → cobro → factura → recordatorio, todo dentro de la app.
- **Paciente:** siempre gratis; con su cuenta reserva, guarda y comparte estudios, y ve certificados e historia.
- **Segmento:** consultorios de 1 a 10 profesionales en Argentina; odontología como vertical de entrada (odontograma y ortodoncia ya resueltos).
- **Piezas que faltan para cerrar el ecosistema** (en este orden): cobros con Mercado Pago (señas contra el ausentismo + suscripción propia), recordatorios por WhatsApp, facturación ARCA, receta electrónica (vía plataforma inscripta en ReNaPDiS) y teleconsulta.

## Operating Context

- Argentina (zona horaria `America/Argentina/Buenos_Aires`), español rioplatense con voseo ("Reservá", "Elegí").
- Soporte por WhatsApp y email (`frontend/src/lib/site.ts`).
- Integración con Google Calendar y confirmaciones por email (README).
- Genera PDFs de paciente (`frontend/src/lib/patientPdf.ts`).

## Capabilities and Constraints

- Frontend: React + Vite + TypeScript + Tailwind v4 + shadcn/ui; siempre componentes de `@/components/ui`, sin CSS arbitrario (ver `CLAUDE.md`).
- Backend: Node/Express + Supabase con RLS por JWT; CSP estricta en la SPA.
- Roles: paciente, profesional, recepción, admin. Multi-clínica.
- Planes (Fase L, precios finales con IVA, oct-2026): **Profesional** $14.900 (1 profesional), **Equipo** $32.900 (3 profesionales, +$9.900 c/u), **Clínica** $74.900 (10 profesionales, +$5.900 c/u). Anual = 10 meses. Sin plan gratis: 14 días de prueba del plan Clínica y después solo lectura. Solo los profesionales ocupan asiento. Precios editables en la tabla `plan` (panel /dashboard/plataforma).

## Brand Commitments

- Nombre: **Medilu**. Logo en `frontend/src/components/site/Logo.tsx`.
- Voz: cercana, clara, en voseo; promete seguridad y confidencialidad de la información clínica.

## Evidence on Hand

- Imagen hero: `frontend/src/assets/hero.png`.
- No hay testimonios, clientes, cifras ni casos reales: **no inventarlos**.

## Product Principles

1. La tarea primero: reservar o registrar debe ser rápido y sin fricción.
2. Confianza: datos clínicos tratados con seguridad visible y lenguaje sobrio.
3. Cualquier dispositivo: el paciente usa el celular; el profesional, la computadora.
4. Un mismo producto para roles distintos: cada uno ve solo lo suyo.

## Accessibility & Inclusion

Sin requisito formal confirmado. Por tratarse de salud y de pacientes de cualquier edad, apuntar a WCAG 2.2 AA (inferido).
