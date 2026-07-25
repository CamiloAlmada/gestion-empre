# Scripts — seed de demo (WA-D + Reportes/Fase 3)

> Otros scripts de esta carpeta:
>
> - **`reset-operativo.mjs`** (reseteo de datos operativos antes de entregarle el
>   sistema al dueño, tarea A5) — ver `README-reset-operativo.md`.
> - **`canonicalizar-categorias.mjs`** (migración de los ids de `categorias` a su
>   forma canónica + deduplicación, tarea C3; corre **antes** del deploy de las
>   reglas nuevas) — ver `README-canonicalizar-categorias.md`.

`seed-demo.mjs` siembra datos de prueba en Firestore, en DOS tandas
independientes (mismo script, mismas colecciones, mismo prefijo `demo-`):

1. **WA-D** (doc 08, clientes + WhatsApp): 6 clientes con distintos perfiles de
   teléfono/frecuencia y sus ventas históricas.
2. **Reportes** (Fase 3): catálogo mínimo (categorías, proveedores, productos),
   compras confirmadas con costo real y prorrateo de gastos, ventas con costeo
   congelado, ajustes/merma y una anulación, a lo largo de ~4 meses — para que
   el módulo de Reportes tenga contra qué compararse (mes vs. mes anterior) y
   se pueda mostrar al dueño con datos verosímiles.

Todo con ids prefijados `demo-` (fácil de identificar y de limpiar). Pensado
para correr **contra `quesarte-uy-dev` únicamente** — el script tiene un
guardrail duro que se niega a correr contra cualquier otro proyecto (ver el
comentario al principio de `seed-demo.mjs`).

## Archivos

- `generador.mjs` — módulo puro (sin Firebase): arma TODO en memoria a partir
  de un `ahora` recibido por parámetro (nunca lee el reloj).
  - `construirDatosDemo(ahora)` — los 6 clientes de WA-D y sus ventas.
    Testeado en `generador.test.mjs`.
  - `construirDatosReportes(ahora, { seed })` — catálogo, compras, ventas (con
    `costeo` congelado vía `congelarCosteo` de `@gestion/core`), piezas,
    movimientos, ajustes y 2 clientes propios. El prorrateo de gastos y el
    costo promedio resultante NO se reimplementan acá: se calculan con
    `calcularItemsProrrateados`/`calcularEfectosProducto`
    (`src/componentes/compras/resumenCompra.ts`, el mismo módulo puro que usa
    `CompraPantalla.tsx` para confirmar una compra real), así el costo
    promedio es byte a byte el que dejaría una confirmación real. Determinista
    por semilla (default `20260724`). Testeado en `generador.test.mjs`.
- `mapeoAdmin.mjs` — mapea esos objetos de dominio a la forma exacta de
  documento de Firestore (espejo de los converters de `@gestion/firebase-kit`,
  pero sin depender del SDK cliente): clientes, ventas (con `costeo`),
  productos, proveedores, categorías, compras, piezas y movimientos. Testeado
  en `mapeoAdmin.test.mjs` comparando byte a byte contra los converters
  reales — **si un converter cambia de forma y este mapeo no se actualiza,
  ese test rompe** (la garantía central de que el seed es indistinguible de
  datos reales).
- `coherenciaCruzada.test.mjs` — batería de **coherencia cruzada**: invariantes
  que viven ENTRE documentos, no dentro de uno solo. `generador.test.mjs` y
  `mapeoAdmin.test.mjs` validan cada documento por separado; ninguno de los
  dos puede detectar, por ejemplo, dos categorías con el mismo nombre (dos
  documentos, cada uno perfectamente válido) — que es exactamente el bug real
  que motivó este archivo (ver el comentario de cabecera del archivo y
  `docs/02-dominio-quesarte.md`, sección "Categoría"). Cubre, sobre
  `construirDatosDemo` y `construirDatosReportes`:
  - Unicidad: claves de categoría (`claveCategoria`), nombres de proveedor
    (sin chequeo de dominio equivalente — `crearProveedor` no lo tiene).
  - Integridad referencial: `producto.categoria`/`proveedorPrincipalId`,
    `compra.proveedorId`/ítems, `pieza.productoId`/`compraId` (+ costo
    heredado coherente), `movimiento.productoId`/`piezaId`/`origenId`,
    `venta.items[].productoId`/`piezaId`, `venta.clienteId` — en cada caso,
    también que el campo denormalizado (nombre) esté sincronizado con el
    documento referenciado.
  - Costeo congelado: `fuente`↔`compraId`↔presencia de montos, según las
    reglas de `congelarCosteo` (`packages/core/src/costeo.ts`).
  - Reconstrucción del ledger: el stock final de cada producto (granel/
    unidades) y el peso restante de cada pieza deben poder recalcularse
    exactamente sumando los `deltaGramos`/`deltaUnidades` de sus propios
    movimientos — si el ledger de auditoría y el estado final divergen, algo
    se escribió por fuera de él.
  - `clientes.stats` coherente con sus ventas `completada` sembradas.

  Cada detector devuelve la lista de documentos concretos que violan la
  regla (nunca solo pasa/falla) y cada uno se verificó por falsación durante
  el desarrollo (corrompiendo una copia del dataset y confirmando que lo
  caza) — no quedó en el repo por no ser parte del comportamiento a
  mantener, solo de su verificación puntual.
- `seed-demo.mjs` — el shell: guardrail de `projectId`, limpieza,
  siembra y verificación de las dos tandas, usando `firebase-admin`.

## Requisitos

- Node ≥ 22 (el repo ya lo exige) y las dependencias del monorepo instaladas
  (`pnpm install` en la raíz).
- El script se ejecuta con [`tsx`](https://github.com/privatenumber/tsx) (ya
  agregado como devDependency de esta app), **no** con `node` a secas: los
  packages del monorepo (`@gestion/core`, `@gestion/firebase-kit`) se
  distribuyen como fuente TypeScript (sin paso de build propio, ver
  `docs/01-arquitectura.md`), y `normalizarTelefono`/`clasificarInactividad`
  hay que **importarlos de ahí, no reimplementarlos**. Node "puro" no puede
  resolver esos módulos TS por sí solo; `tsx` sí, con la misma resolución que
  ya usan Vite y Vitest en el resto del repo. Los scripts `pnpm run seed:demo*`
  ya invocan `tsx` — no hace falta instalarlo ni invocarlo a mano.
- Credenciales de Google Cloud para el proyecto **`quesarte-uy-dev`** vía
  [Application Default Credentials (ADC)](https://cloud.google.com/docs/authentication/provide-credentials-adc).
  Dos formas, en orden de preferencia:
  1. **Service account key** descargada para `quesarte-uy-dev` (recomendado: el
     guardrail lee el `project_id` de este archivo):
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/tu-service-account.json
     ```
  2. `gcloud auth application-default login` (con el usuario que tiene permisos
     en `quesarte-uy-dev`) **+** declarar el proyecto explícitamente, porque las
     credenciales de usuario de gcloud no traen `project_id` embebido:
     ```bash
     export GOOGLE_CLOUD_PROJECT=quesarte-uy-dev
     ```
  El guardrail (`seed-demo.mjs`) resuelve el `projectId` de estas credenciales
  **leyendo el archivo/las env vars localmente, sin ninguna llamada de red** —
  a propósito, para que un entorno con alguna credencial ambiente de OTRO
  proyecto de Google Cloud jamás llegue a hacer ni una sola conexión a
  Firestore antes de que el chequeo decida cortar. Recién si ese projectId
  local coincide con `quesarte-uy-dev` (y con el flag `--project`) el script
  inicializa `firebase-admin` y abre la primera conexión real.

## Uso

Desde `apps/quesarte/`. El flag `--project quesarte-uy-dev` es **obligatorio**
en los tres casos (confirmación explícita, además de la que resuelve el
guardrail a partir de las credenciales — ver arriba):

```bash
# Ciclo completo: limpia lo anterior, siembra de nuevo, imprime el resumen.
pnpm run seed:demo -- --project quesarte-uy-dev

# Solo borrar los datos demo-* (sin volver a sembrar).
pnpm run seed:demo:limpiar -- --project quesarte-uy-dev

# Solo releer lo que ya está en Firestore e imprimir el resumen (no escribe).
pnpm run seed:demo:verificar -- --project quesarte-uy-dev
```

El resumen final (impreso siempre al terminar el ciclo completo, o a demanda
con `--verificar`) lista, por cliente: cantidad de ventas, total histórico,
días sin venir y el resultado de `clasificarInactividad` con los defaults
(factor `2`, umbral global `30`) — para confirmar ANTES de la demo que el
cliente 2 y el cliente 3 dan `inactivo=true` y el resto `inactivo=false`.

## Qué siembra

6 clientes (`demo-cliente-*`) con sus ventas (`demo-venta-*`), fechas relativas
al momento en que se corre el script:

| # | Perfil | Compras | Teléfono | Clasificación esperada |
|---|--------|---------|----------|-------------------------|
| 1 | Frecuente activo | 9, ritmo ~7d, última hace 3d | `099 123 456` | **activo** |
| 2 | Frecuente inactivo (ritmo propio) | 6, ritmo ~7d, última hace 30d | `+598 98 765 432` | **inactivo** (lidera la lista: total más alto) |
| 3 | Ocasional inactivo (umbral global) | 2, última hace 45d | `098 234 567` | **inactivo** |
| 4 | Nuevo activo | 1, hace 5d | `099 876 543` | **activo** |
| 5 | Sin teléfono | 3, recientes | *(sin campo)* | **activo**, sin botón WhatsApp |
| 6 | Teléfono no normalizable | 1, reciente | `consultar en mostrador` | **activo**, sin botón WhatsApp |

## Qué siembra (Reportes, Fase 3)

Catálogo (`demo-prod-*`, 8 productos, cubre los 4 `modoStock` y los casos
borde pedidos para probar la UI):

| Producto | modoStock | Caso borde |
|---|---|---|
| Queso Colonia | fraccionado_por_pieza | — |
| Queso Parmesano Reserva Especial Añejado Doce Meses | fraccionado_por_pieza | nombre largo |
| Queso Fresco | granel | alto volumen / bajo margen |
| Miel | unidad_simple | bajo volumen / alto margen |
| Salame Colonia | pieza_entera | — |
| Nueces | granel | — |
| Dulce de Membrillo | unidad_simple | — |
| Orégano | granel | **nunca entra por Compras** → `costoPromedioCents: 0`, "sin costo conocido" (su stock entra por `ajuste_positivo`, ver `AJUSTES_REPORTES`) |

Más: 2 proveedores, 5 categorías, 6 compras confirmadas (viajes cada ~3
semanas a lo largo de ~4 meses, con gastos de flete/combustible/peaje
prorrateados), ~150-170 ventas (distribución procedural determinista por
semilla: más volumen fin de semana y 2 picos de "feria", la mayoría anónimas,
un par de clientes propios en el resto), 6 ajustes/merma sueltos, y **1 venta
anulada** (con su movimiento de devolución). Correr
`pnpm run seed:demo:verificar -- --project quesarte-uy-dev` imprime el
resumen (rango de fechas, cobertura de costeo, el chequeo de Orégano) antes de
mostrarle nada al dueño.

## Cómo limpiar

`pnpm run seed:demo:limpiar -- --project quesarte-uy-dev` borra ÚNICAMENTE los
documentos cuyo id empieza con `demo-`, en las 8 colecciones que toca el seed
(`clientes`, `ventas`, `productos`, `categorias`, `proveedores`, `piezas`,
`compras`, `movimientos`). Nunca toca ningún otro documento. Volver a correr
`seed:demo` sin `--limpiar` primero limpia y después siembra: repetirlo deja
siempre un estado fresco (para las DOS tandas a la vez).

**Excepción: las categorías del seed NO llevan prefijo `demo-`**, su id es
la clave canónica del nombre (`claveCategoria(nombre)`). Por eso el comando
`seed:demo:limpiar` no las borra: son catálogo, no datos operativos. Si
necesitás limpiarlas, hay que borrarlas a mano desde la consola de Firebase:
ningún script de esta carpeta borra categorías sueltas
(`canonicalizar-categorias.mjs` canonicaliza y deduplica, no borra a pedido).

## Por qué no se prueba contra Firestore real

El DoD de esta tarea prohíbe correr el script contra cualquier proyecto real
(no hay credenciales en este entorno, y no debe haberlas). La cobertura de
tests (`generador.test.mjs`, `mapeoAdmin.test.mjs`) valida toda la lógica sin
red: que los datos generados sean coherentes (stats vs. ventas, clasificación
esperada; prorrateo/costo real/costo promedio recalculados con
`@gestion/core` y comparados exactos; ningún stock negativo; cobertura de los
casos borde; `costeo` congelado con la semántica de `congelarCosteo`) y que la
forma del documento que este script escribiría sea IDÉNTICA a la que producen
los converters reales del kit (byte a byte, para las 8 colecciones).

El shell completo (`seed-demo.mjs`: guardrail + limpieza + siembra +
verificación) SÍ se probó manualmente, de punta a punta, contra el emulador de
Firestore (`firebase emulators:exec --only firestore --project quesarte-uy-dev
"pnpm exec tsx scripts/seed-demo.mjs --project quesarte-uy-dev"`, con una
service account key falsa pero con `project_id` real para poder ejercitar el
guardrail) — ciclo completo (limpiar vacío → sembrar 6 clientes/22 ventas →
verificar con la clasificación esperada → limpiar → verificar vacío) y los
cuatro casos del guardrail (sin flag, flag sin credenciales resolubles,
credenciales de OTRO proyecto — el caso que protege a prod, credenciales
correctas). No quedó como test automatizado porque exigiría levantar el
emulador desde `vitest.config.ts` y gestionar una service account de mentira
en el repo (fuera del alcance de WA-D); la evidencia de esa corrida queda en
la descripción del PR/commit.

**La tanda de Reportes (esta extensión) NO se corrió contra el emulador**
(fuera de alcance de esta tarea, mismas restricciones de credenciales): se
verificó `construirDatosReportes` de punta a punta con `tsx` en memoria (sin
ningún import de Firebase) — conteos, ausencia de stock negativo, invariantes
de prorrateo/costo recalculadas contra `@gestion/core`, y los 4 casos borde —
además de la suite de vitest. El camino que SÍ falta ejercitar en vivo es
`escribirEnLotes`/`sembrarDemo` contra el emulador (mismo hueco que ya tenía
`seed-demo.mjs` original, ahora más grande por el volumen de documentos:
~500-600 escrituras en 8 colecciones). Recomendado antes de la primera corrida
real contra `quesarte-uy-dev`.
