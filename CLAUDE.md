# Proyecto: Sistemas de gestión para pequeños comercios (monorepo)

## Qué es esto

Monorepo con apps de gestión a medida para pequeños comercios, construidas sobre
React + Firebase + PWA. La primera app es **quesería** (venta de quesos, embutidos,
miel, frutos secos y especias). La segunda será **cerrajería**.

Cada app se buildea y deploya de forma **independiente**, contra su **propio proyecto
Firebase**. NO es multitenant: se comparte código vía packages internos, no datos ni
infraestructura.

## Documentación de referencia (leer antes de implementar)

- `docs/01-arquitectura.md` — estructura del monorepo, stack, CI/CD, Firebase
- `docs/02-dominio-quesarte.md` — modelo de dominio y colecciones Firestore de la quesería
- `docs/03-compras-costos-precios.md` — módulo de compras, prorrateo de gastos, márgenes
- `docs/04-plan-fases.md` — plan de implementación por fases con criterios de aceptación
- `docs/05-cerrajeria.md` — especificación preliminar de la segunda app (NO implementar aún)

## Stack

- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend**: React 18+, TypeScript estricto, Vite, Tailwind CSS
- **PWA**: vite-plugin-pwa (offline-first, instalable)
- **Backend**: Firebase (Firestore, Auth, Hosting). Cloud Functions solo si es imprescindible.
- **Tests**: Vitest (unitarios en packages/core son obligatorios), Testing Library para UI crítica
- **CI/CD**: GitHub Actions con path filters — deploy independiente por app

## Comandos

```bash
pnpm install                          # instalar todo
pnpm turbo build                      # buildear todo
pnpm turbo build --filter=quesarte    # buildear solo la quesería
pnpm turbo dev --filter=quesarte      # dev server de la quesería
pnpm turbo test                       # correr todos los tests
pnpm turbo lint                       # lint de todo
```

## Reglas de oro (NO violar)

1. **`packages/core` es TypeScript puro**: no importa React, ni Firebase, ni nada con
   side effects. Toda la lógica de dominio (precios, stock, prorrateo de costos,
   redondeos) vive acá como funciones puras con tests.
2. **`packages/firebase-kit` no importa UI**. `packages/ui` no importa Firebase.
3. **Dinero en centésimos (enteros). Peso en gramos (enteros).** Nunca floats para
   plata ni para peso en persistencia. Formateo a $ y kg solo en la capa de UI.
4. **Cada app tiene su propio proyecto Firebase** (dev y prod separados). Nunca
   compartir Firestore entre apps.
5. **Español en la UI y en los nombres de dominio** (producto, pieza, compra, venta,
   movimiento). Inglés para código de infraestructura genérica.
6. **Offline-first**: el POS de venta debe funcionar sin conexión (persistencia
   offline de Firestore habilitada). Asumir que el mostrador puede quedarse sin internet.
7. **No hay HTML `<form>` con submit nativo problemático en PWA**: usar handlers
   controlados de React.
8. **Fuera de alcance (no implementar sin pedido explícito)**: facturación
   electrónica DGI, integración con balanzas, multitenancy, panel de administración
   multi-negocio.

## Estado actual

Fases 0 y 1 CERRADAS (2026-07-08, criterios verificados por el dueño en producción:
https://quesarte-uy.web.app). El MVP está operativo: POS con FIFO + override + pieza
entera + cobro offline, Stock (ingreso, ajustes, merma), Productos, Historial con
anulación, Usuarios por invitación, Ajustes con tema. 761 tests. Siguiente: Fase 2
(compras, prorrateo de gastos, márgenes) — leer las notas arrastradas de los reviews
de Fase 1 al inicio de esa sección en `docs/04-plan-fases.md`.
