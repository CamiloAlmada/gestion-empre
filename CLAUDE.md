# Proyecto: Sistemas de gestión para pequeños comercios (monorepo)

## Qué es esto

Monorepo con apps de gestión a medida para pequeños comercios, construidas sobre
React + Firebase + PWA. La primera app es **quesería** (venta de quesos, embutidos,
miel, frutos secos y especias). La segunda será **cerrajería**.

Cada app se buildea y deploya de forma **independiente**, contra su **propio proyecto
Firebase**. NO es multitenant: se comparte código vía packages internos, no datos ni
infraestructura.

## Cómo se trabaja en este repo (orquestación)

La sesión principal de Claude Code (Opus 5) es el **orquestador**, no el
implementador. Su trabajo es: descomponer, delegar, verificar lo que vuelve,
reintentar con mejor brief, y mantener el plan vivo en `docs/PLAN-ACTIVO.md`
—en el repo, nunca solo en el contexto de la sesión—.

El orquestador **no implementa**, salvo cambios triviales de una línea (un typo,
un import, el valor de una constante). Todo lo demás se delega.

### Equipo de agentes (`.claude/agents/`)

| Agente | Modelo | Para qué |
| --- | --- | --- |
| `advisor` | Fable 5 | Decisiones de arquitectura. Solo lectura, no escribe código. |
| `senior` | Opus 5 | Lógica de negocio delicada, seguridad, concurrencia, migraciones de datos. |
| `semisenior` | Sonnet 5 | El grueso: features estándar, pantallas, hooks, endpoints, tests de integración. |
| `trainee` | Haiku 4.5 | Mecánico: renames, correr tests, grepear logs, boilerplate, formateo, imports. |

### Cuándo se invoca a `advisor`

SOLO en estos cuatro casos —no es un revisor de rutina—:

1. Diseño del plan inicial de una feature grande.
2. Review de arquitectura **antes** de escribir código.
3. Desempate cuando dos agentes devuelven soluciones contradictorias.
4. Post-mortem de un bug que ya falló 2+ intentos de arreglo.

### Reglas de delegación

1. **Brief autosuficiente.** El subagente arranca con contexto vacío y no ve
   nada de la conversación del orquestador. Todo prompt de delegación incluye:
   - **Objetivo**: qué hay que lograr y por qué.
   - **Archivos relevantes**: rutas concretas —dónde leer, dónde escribir, qué
     patrón existente copiar—.
   - **Restricciones**: reglas de oro que aplican, qué NO tocar, límite de alcance.
   - **Criterio de aceptación**: definition of done verificable, punto por punto,
     incluyendo el comando que tiene que quedar en verde.
   - **Formato de salida**: el bloque estructurado de abajo.
2. Antes de delegar la implementación de algo no trivial, consultar a `advisor`.
3. **Dos fallas en la misma tarea → no reintentar con el mismo prompt.** Escalar
   a `advisor` con el historial del fallo: qué se pidió, qué devolvió el agente,
   qué falló exactamente.
4. El orquestador **verifica lo que vuelve**: nunca da por buena la respuesta de
   un agente sin comprobar el diff y el resultado de los comandos.
5. Después de cada tanda, actualizar `docs/PLAN-ACTIVO.md` (hecho / en curso /
   bloqueado / decisiones tomadas).

### Formato de salida de todo subagente

```
## Qué cambió
## Archivos tocados
## Qué falta
## Qué asumí
## Verificación
```

## Documentación de referencia (leer antes de implementar)

- `docs/PLAN-ACTIVO.md` — plan de trabajo en curso; lo mantiene el orquestador
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

Fases 0, 1, 1.5 y 2 CERRADAS (Fase 2 el 2026-07-14, los 4 criterios validados
por el dueño en producción: https://quesarte-uy.web.app). Operativo: POS con
FIFO + override + pieza entera + cobro offline + cliente opcional, sección
única Productos en el tab Stock (fusión UI-5: existencias + catálogo + alta;
edición en el detalle, SIN precio — precios solo en la sección Precios),
Compras con prorrateo de gastos y márgenes (doc 03), Clientes con WhatsApp
por links wa.me e inactividad comercial (doc 08), Proveedores y Categorías
(en Ajustes) solo admin, Historial con anulación (cuelga de Venta), Usuarios
por invitación, dos estilos de tema (Minimalista/Cálido). 967 tests + 134 de
reglas. PRÓXIMO: sesión de elicitación con Adrián (doc 10) → repriorización
del roadmap (docs/10b); Fase 3 en cola. Entorno de demo: quesarte-uy-dev.
