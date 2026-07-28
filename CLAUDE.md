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
reintentar con mejor brief, y mantener el plan en `.claude/plan.md` —en el
repo, nunca solo en el contexto de la sesión, que se compacta—.

El orquestador **no implementa**, salvo cambios triviales de una línea (un
typo, un import, el valor de una constante). Todo lo demás se delega, incluido
el trabajo mecánico que parece más rápido hacer a mano.

### Equipo de agentes (`.claude/agents/`)

| Agente | Modelo | Para qué |
| --- | --- | --- |
| `advisor` | Fable 5 | Decisiones de arquitectura. Solo lectura, no escribe código. |
| `senior` | Opus 5 | Lógica de negocio delicada, seguridad, concurrencia, migraciones de datos. |
| `semisenior` | Sonnet 5 | El grueso: features estándar, pantallas, hooks, endpoints, tests de integración. |
| `trainee` | Haiku 4.5 | Mecánico: renames, correr tests, grepear logs, boilerplate, formateo, imports. |

El campo `model:` del frontmatter toma `fable` / `opus` / `sonnet` / `haiku`,
no `fable-5` ni `opus-5`. Verificado: con otro valor el agente no se registra.

### Protocolo del `advisor`

El `advisor` no escribe código. Devuelve decisiones.

#### Cuándo llamarlo

**Piso: dos llamadas en toda tarea de más de unos pocos pasos.**

1. **Temprano** — después de orientarse (leer archivos, entender el terreno)
   pero **antes** de comprometerse con un enfoque. Orientarse no es trabajo
   sustantivo; escribir, editar y afirmar una respuesta sí lo son. Esta es la
   llamada que más rinde, porque el `advisor` aporta su mayor valor antes de
   que el enfoque cristalice. No escatimarla.
2. **Al cierre** — antes de declarar la tarea terminada. **Antes de esta
   llamada hay que hacer durable el entregable**: escribir los archivos, correr
   los tests, commitear. Si la sesión muere durante la consulta, un resultado
   escrito persiste y uno sin escribir no.

Llamadas adicionales cuando corresponda: trabado (errores que se repiten,
enfoque que no converge), cambio de enfoque en consideración, desempate entre
agentes con soluciones contradictorias, post-mortem de un bug con 2+ intentos
fallidos, o reconciliación de un conflicto entre su consejo y la evidencia.

#### El brief

A partir de la **segunda** llamada en una misma tarea, el brief abre con:

```
CONSULTAS PREVIAS EN ESTA TAREA:
- Llamada N (motivo): [recomendación textual del advisor]
- Implementado desde entonces: [resumen]
- Diferencias con lo que el advisor asumió: [qué cambió]
```

Es obligatorio: el `advisor` **no recuerda sus consultas previas**. Cada
invocación arranca en frío y puede contradecirse a sí mismo sin notarlo. El
hilo lo lleva el orquestador, y lo lleva en `.claude/advisor-log.md` —no en el
contexto de la sesión— para que sobreviva a una compactación.

Todo brief cierra con esta línea:

```
(Advisor: RECOMENDACIÓN y POR QUÉ, bajo 120 palabras entre ambos.
 SUPUESTOS y BLOQUEANTES sin límite — no los recortes.
 Excepción: en post-mortems escribí lo que necesites, ahí el
 análisis completo es el entregable.)
```

#### Qué hacer con lo que devuelve

- **BLOQUEANTES con contenido** → ir a buscar eso al repo y volver a llamar con
  la respuesta. Esa es una llamada legítima, no ruido.
- **SUPUESTOS con algo falso sobre el código** → corregirlo y volver a llamar.
  Un plan perfecto sobre una arquitectura que no tenemos es un plan
  inaplicable, y el `senior` se entera a mitad de camino.
- **Dale peso serio.** Se adapta el consejo solo si un paso falla
  empíricamente, o si hay evidencia de primera mano que lo contradice (el
  archivo dice X, el test devuelve Y).
- **Un self-test que pasa NO es evidencia de que el consejo esté mal.** Es
  evidencia de que ese test no chequea lo que el consejo chequea.
- **Conflicto entre datos propios y el consejo → no cambiar en silencio.**
  Volver a llamarlo explicitando el conflicto: "encontré X, sugerís Y, ¿qué
  restricción rompe el empate?". Vio la evidencia, pero pudo haberla
  subponderado.

### Reglas de delegación

1. **Brief autosuficiente.** El subagente arranca con contexto vacío: no ve la
   conversación del orquestador, ni los archivos que leyó, ni las skills que se
   invocaron. El único canal es el brief. Todo brief incluye:
   - **Objetivo**: qué hay que lograr y por qué.
   - **Archivos relevantes**: rutas concretas —dónde leer, dónde escribir, qué
     patrón existente copiar—.
   - **Restricciones**: reglas de oro que aplican, qué NO tocar, límite de alcance.
   - **Criterio de aceptación**: definition of done verificable, punto por punto,
     incluyendo el comando que tiene que quedar en verde.
   - **Formato de salida**: el bloque estructurado de abajo.
2. **Dos fallas en la misma tarea → no reintentar con el mismo prompt.**
   Escalar al `advisor` con el historial del fallo: qué se pidió, qué devolvió
   el agente, qué falló exactamente.
3. El orquestador **verifica lo que vuelve**: nunca da por buena la respuesta
   de un agente sin comprobar el diff y el resultado de los comandos.
4. **El trabajo mecánico va a `trainee`**, aunque parezca más rápido hacerlo a
   mano.
5. Después de cada tanda, actualizar `.claude/plan.md` (hecho / en curso /
   bloqueado / decisiones tomadas).

### Formato de salida de todo subagente

```
## Qué cambió
## Archivos tocados
## Qué falta
## Qué asumí
## Verificación
```

### Lo que deliberadamente NO está en esta configuración

No agregar ninguna de estas dos cosas; se probaron y el efecto neto es
negativo con Opus orquestando:

- **Regla dura del tipo "toda escritura requiere `advisor` previo".** Produce
  sobre-consulta en tareas cuya primera acción no necesita planificación. Los
  dos checkpoints de arriba alcanzan.
- **Recordatorios automáticos de "todavía no consultaste al `advisor`" en los
  turnos tempranos.** Están pensados para ejecutores Haiku y Sonnet; con Opus
  bajan el rendimiento.

## Documentación de referencia (leer antes de implementar)

- `.claude/plan.md` — plan de trabajo en curso; lo mantiene el orquestador
- `.claude/advisor-log.md` — historial de consultas al advisor (él no las recuerda)
- `docs/PLAN-ACTIVO.md` — archivo de la Fase 3, cerrada; citado desde comentarios de código
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

Fases 0, 1, 1.5, 2 y 3 CERRADAS (Fase 2 el 2026-07-14, los 4 criterios
validados por el dueño en producción: https://quesarte-uy.web.app; Fase 3
mergeada como `eaaf263` el 2026-07-27 y desplegada). Operativo: POS con
FIFO + override + pieza entera + cobro offline + cliente opcional, sección
única Productos en el tab Stock (fusión UI-5: existencias + catálogo + alta;
edición en el detalle, SIN precio — precios solo en la sección Precios),
Compras con prorrateo de gastos y márgenes (doc 03), Clientes con WhatsApp
por links wa.me e inactividad comercial (doc 08), Proveedores y Categorías
(en Ajustes) solo admin, Historial con anulación (cuelga de Venta), Usuarios
por invitación, dos estilos de tema (Minimalista/Cálido).

De la Fase 3: **costo congelado** (`CosteoItem` versionado embebido en cada
`ItemVenta` y en cada movimiento de stock — sin eso no hay ganancia calculable
hacia atrás), y Reportes solo admin: resumen del período con swipe día/semana/
mes, rentabilidad por producto y categoría, vencimientos y stock bajo, y
rendimiento de compra/viaje. Las categorías pasaron a tener su id canónico
igual a su nombre normalizado, lo que hace **estructuralmente imposible** tener
dos con el mismo nombre.

2765 tests (`pnpm turbo test`) + 175 de reglas (`pnpm test:rules`).

PRÓXIMO: (1) el **reseteo operativo** de los datos de prueba de producción, que
es el último paso antes de entregarle el sistema a Adrián y lo corre una
persona, no un agente; (2) sesión de elicitación con Adrián (doc 10) →
repriorización del roadmap (docs/10b). Detalle en `.claude/plan.md`.
Entorno de demo: quesarte-uy-dev.
