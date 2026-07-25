# Plan activo

Estado de trabajo en curso. Lo mantiene el **orquestador** (sesión principal de
Claude Code): se actualiza después de cada tanda de delegación, no al final.

Este archivo es la memoria del plan. Si no está acá, no existe.

Convenciones:
- Cada tarea lleva agente asignado (`advisor` / `senior` / `semisenior` / `trainee`).
- Los criterios de aceptación son verificables (comando o comprobación concreta).
- Las decisiones de arquitectura se anotan con fecha y motivo; no se re-discuten
  sin evidencia nueva.

---

## Objetivo en curso

**Fase 3 — Inteligencia de negocio (Reportes).** Diseño cerrado por `advisor`
el 2026-07-24, verificado contra el repo por el orquestador.

La vara: reportes que habilitan una decisión concreta de Adrián (y después de
Fede en cerrajería). Un reporte que no cambia ninguna decisión no se construye.

Contexto de calendario: la sesión de elicitación con Adrián (doc 10) no tiene
fecha fija; podría caer estos días o correrse a septiembre (vacaciones de agosto).

**Dato que cambia el cálculo de riesgo (2026-07-24):** Adrián todavía NO usa la
app. Todos los datos operativos que hay en producción son pruebas del
desarrollador. Consecuencias: (1) no hay historia real que rescatar, así que el
backfill se cancela y los datos de prueba se borran antes de entregar; (2) no
hay presión de tiempo por datos perdiéndose —el reloj arranca el día que él
venda—; (3) se puede trabajar con las mejores prácticas sin apuro ni parches,
que es el objetivo declarado para la entrega.

## Tanda A — La verdad del dato (EN CURSO, no depende de la elicitación)

Lo que no se congela hoy no existe mañana. Es el único compromiso irreversible
del módulo, y es seguro porque es aditivo, opcional y versionado.

| # | Tarea | Agente | Estado | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| A1 | `CosteoItem` congelado en `ItemVenta` + `packages/core/src/costeo.ts` | `senior` | ✅ **hecha** | Verificado por el orquestador: core 282, firebase-kit 273, app 1093, reglas 155 — todo verde, **sin tocar `firestore.rules`** |
| A1b | Mismo congelado en **todo movimiento de stock** (merma, ajustes, ingreso por compra) | `semisenior` | **en corrección** | 6 caminos cubiertos; `venta`/`devolucion` reutilizan el costeo del `ItemVenta` en vez de recalcularlo (correcto). **Devuelto**: el `ingreso_compra` de granel/unidad congelaba el promedio post-ingreso en vez del costo real del ítem (ver abajo) |
| ~~A2~~ | ~~Script de backfill~~ | — | **CANCELADA** | No hay historia real que rescatar: los datos de prod son de prueba y se borran (A5). Construir el backfill sería invertir la tarea más riesgosa del módulo en datos descartables |
| A3 | Core de agregación: `periodo.ts` + `reporteVentas.ts` | `semisenior` | ✅ **hecha** | Verificado: 318 tests en core. `VariacionPeriodo` es una unión donde `sin-base` **no tiene campo numérico** (un porcentaje inexistente es irrepresentable, no un caso a recordar); anuladas filtradas en un único punto (`ventasVigentes`); la ganancia solo suma con costo conocido, el resto va a `CoberturaCosto` |
| A4 | Índices | `trainee` | ✅ hecha, **y después revertida en parte** | La limpieza del huérfano `productos (activo, nombre)` fue correcta. Los dos índices nuevos resultaron innecesarios cuando se construyeron sus queries y se quitaron (ver nota abajo): la regla "el índice entra con su query" vale en los dos sentidos |
| A5 | Script de reseteo de datos de prueba (Admin SDK) | `senior` | ✅ **hecha** (pendiente de decisiones del dueño, ver abajo) | `resetPlan.mjs` puro + `reset-operativo.mjs` shell, 40 tests. Probado E2E contra el emulador: dry-run por defecto, colección desconocida aborta, projectId mal tipeado aborta, sin TTY aborta, idempotente, restauración verificada. **La ejecución la hace una persona, no un agente** |

### Diseño del congelado (decidido, no re-discutir)

Mapa opcional versionado embebido en el ítem:

```ts
interface CosteoItem {
  v: 1;
  fuente: 'pieza' | 'promedio' | 'sin_costo';
  origen: 'venta' | 'backfill';   // dato real vs reconstruido
  costoUnitCents?: Money;         // por kg o por unidad
  costoItemCents?: Money;         // total del ítem, ya redondeado
  compraId?: string;              // procedencia (viaje/compra de la pieza)
}
```

- Van **los dos montos**: el unitario hace el número auditable, el total lo hace
  reproducible sin depender de que la regla de redondeo nunca cambie.
- `costoPromedioCents` en 0 o ausente ⇒ `fuente: 'sin_costo'`, sin montos.
  Congelar un 0 declararía 100% de ganancia: una mentira que ningún reporte
  posterior puede detectar.
- `origen` es ortogonal a `fuente`: es el bit que impide mezclar dato real con
  reconstruido.
- La **ausencia** del mapa es la versión 0. El único punto que pregunta por su
  existencia es el converter y **un** selector en core (`clasificarCosteo` →
  `real | estimado | sin_dato | legado`). Ninguna pantalla vuelve a preguntarlo.

**Nota sobre `origen`:** aunque el backfill se canceló y hoy todo va a nacer
con `origen: 'venta'`, el campo se conserva. Cualquier reconstrucción futura de
datos (una corrección, una migración) necesita ese bit para no contaminar el
histórico real, y cuesta un enum de dos valores.

## Tanda B — Pantallas (ADELANTADAS por decisión del dueño)

Decisión del 2026-07-24: se construyen antes de la elicitación. Responden
criterios que el dueño ya fijó en doc 04, y llegar a la sesión con Adrián con
algo funcionando es mejor insumo que un boceto (se le muestra en §8 del doc 10,
después de las preguntas abiertas, para no contaminar sus respuestas).

| # | Tarea | Agente | Depende | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| B5 | `TarjetaDelta` + `FilaRanking` en `packages/ui` | `semisenior` | — | ✅ **hecha** (con una corrección, ver abajo). 205 tests verdes verificados por el orquestador |
| A6 | Datos de demo en `quesarte-uy-dev` | `semisenior` | ✅ **hecha** (sin correr todavía) | **Extendió** el seed existente, no lo duplicó. ~4 meses, 523 docs en 8 colecciones, 162 ventas con `costeo` congelado vía `congelarCosteo`, 6 compras cuyo prorrateo se calcula con el mismo módulo puro que usa `CompraPantalla`, 1 anulada, y los 4 casos borde de UI. Mapeo byte a byte contra los converters reales, testeado. Determinista con semilla |
| B1 | Home de Reportes: registro de reportes, hero del período, estados loading/error/vacío/offline | `semisenior` | A3, B5 | ✅ **hecha** (con una corrección, ver abajo). Criterio 1 del dueño cumplido; cobertura <100% visible; una sola query para los dos períodos, sin índice compuesto nuevo. El aviso de offline usa `useOnlineStatus` (patrón de toda la app) y no `metadata.fromCache`, que ningún hook del repo expone hoy |
| B2 | Drill-down de rentabilidad por producto/categoría | `semisenior` | B1 | ✅ **hecha**. Ranking por ganancia aportada con el margen como valor secundario: las dos cifras juntas revelan el producto de mucho volumen y poco aporte. El período viaja desde la home por la URL |
| B3 | Alertas: vencimientos en N días + stock bajo | `senior` | — | ✅ **hecha**. Criterio 3 del dueño. `evaluarAlertas` en core es ahora el único cálculo de alertas del proyecto (Productos y Reportes lo comparten). Umbral configurable, default 7 días. `configuracionGeneralValida` extendida y verificada por falsación |
| B4 | Rendimiento de compra/viaje | `semisenior` | A1, B1 | ✅ **hecha**. Criterio 2 del dueño. La porción granel se excluye en vez de estimarse y `porcentajeVendidoBps` es `null` (no 0) cuando no hay nada atribuible. `estado` separa "es pronto para juzgar" de "rindió mal" |

## Tanda C — Unicidad estructural de categorías

Apareció un duplicado real en dev (dos "Quesos") y al investigarlo quedó claro
que la unicidad vivía solo en `crearCategoria`, como chequeo read-then-write:
cualquier escritura fuera de esa función duplicaba (el seed lo hizo), y en una
app offline-first dos dispositivos podían crear la misma categoría y sincronizar
las dos. Diseño cerrado por `advisor`.

| # | Tarea | Agente | Estado |
| --- | --- | --- | --- |
| C1+C2 | `claveCategoria` en core, id del documento = clave, renombrado que muda el documento de path, e invariante exigido en `firestore.rules` | `senior` | ✅ **hecha**. 175 tests de reglas |
| C3 | Script de canonicalización de los ids existentes + deduplicación | `senior` | ✅ **hecho, sin correr**. Plan puro con 35 tests + E2E contra el emulador. La corrida real la hace una persona |
| C4 | Seed: ids de categoría canónicos (sin prefijo `demo-`) | `trainee` | ✅ **hecha** |
| C5 | Tests de coherencia cruzada sobre el generador puro del seed | `semisenior` | ✅ **hecha**. 20 invariantes, 25 casos de falsación verificados, ninguna violación real en el dataset |

**Criterio de supervivencia entre categorías homónimas** (C3): `orden` menor —la
única señal de intención humana que persiste en el documento—; empate → la que
ya está en su path canónico (va segunda a propósito: si fuera primera, un
"quesos" en minúscula le ganaría a un "Quesos" bien escrito); empate → id menor,
solo por determinismo. Descartados: "la más antigua" es indecidible (no hay
fecha y los ids autogenerados de Firestore son aleatorios, no monótonos) y "la
que tiene más productos" no está definido en el caso real, porque los productos
referencian por nombre y para homónimas exactas apuntan a las dos.

**Por qué C5 importa más allá de las categorías**: los tests del seed comparaban
cada documento byte a byte contra los converters reales, y el duplicado se coló
igual porque cada documento por separado era impecable. C5 cubre la clase entera
—invariantes ENTRE documentos— y cada uno se verificó por falsación.

### 🚨 ORDEN DE DESPLIEGUE — no negociable

Las reglas nuevas exigen el campo `clave` y que el id coincida con él. Los
documentos que ya existen en prod y en dev tienen id autogenerado y no tienen
`clave`. Con las reglas desplegadas y sin migrar, **renombrar o reordenar una
categoría existente falla con `permission-denied`** (el alta de categorías
nuevas funciona igual).

1. Correr la migración C3 (Admin SDK, bypassea reglas) en dev y en prod.
2. Deployar las reglas nuevas.
3. Recién después, el reseteo operativo (A5).
4. Entrega.

### Hallazgo verificado: `lower()` de firestore.rules es solo ASCII

El diseño original comparaba el id contra `nombre.trim().lower()` dentro de la
regla. Probado contra el emulador: **el `lower()` del lenguaje de reglas baja
solo A–Z ASCII y deja intactas la `Ñ` y las vocales acentuadas**. Dar de alta
"Ñoquis" o "CAFÉ" habría dado `permission-denied` en producción. Por eso la
clave se calcula en `packages/core` (el `toLowerCase()` de JS sí es
Unicode-completo), se persiste como campo y la regla exige igualdad exacta
contra él. Se pierde que la regla verifique que el campo deriva honestamente
del nombre; está documentado en las reglas y en el doc 02.

### Seguimiento anotado

`crearProveedor` (`packages/firebase-kit/src/proveedores.ts:69`) **no tiene
ningún chequeo de duplicados**, ni siquiera el débil de aplicación que tenía
`crearCategoria`. Menos grave —los productos referencian proveedor por id, así
que un homónimo es fealdad y no ambigüedad de identidad— pero está abierto.

## Reseteo de datos de prueba (A5) — decidido, pendiente de ejecutar

El script está listo y NO se corrió. **El dueño confirmó las cinco decisiones
el 2026-07-24**, y coinciden con lo que el script ya hace: no hay cambios de
código pendientes.

| Decisión | Confirmada |
| --- | --- |
| Los **clientes** de prueba se conservan, con `stats` en cero | ✅ conservar |
| Los **usuarios** de prueba se conservan y no se desactivan; Firebase Auth no se toca | ✅ conservar |
| `configuracion` (general, tema, plantillas de WhatsApp) se conserva entera | ✅ conservar |
| Las **compras en borrador** se borran junto con las confirmadas | ✅ borrar |
| El backup incluye las 10 colecciones y queda fuera del repo (datos personales) | ✅ fuera del repo |

**Orden de ejecución (importante):** el reseteo va DESPUÉS de mergear la Fase 3
y deployar. Si se limpia antes, todo lo que se pruebe hasta el deploy vuelve a
nacer sin costeo congelado y hay que limpiar de nuevo.

Se borran: `ventas`, `movimientos`, `piezas`, `compras`. Se resetean sin borrar
el documento: `clientes.stats`, y en `productos` el `costoPromedioCents` y los
stocks. **Una colección fuera del catálogo documentado hace abortar el script**
en vez de decidir por su cuenta — probado contra el emulador.

Los backups quedan fuera del repo (`.gitignore`): tienen datos personales.

## En espera explícita — NO construir

Entradas del registro de reportes, sin implementación, hasta `docs/10b`:

- **Merma en $** (la pantalla; el congelado de A1b sí va) — doc 10 §2 pregunta
  si Adrián registra merma con disciplina. Si no lo hace, el reporte miente.
- **Proyección del mes** (doc 08:79-84) — necesita 4+ semanas de datos ya con
  costeo, y validar que le sirva.
- **Próximo viaje / cobertura en días** — doc 10 §4 fija el parámetro central.
- **Preferencias por cliente** — doc 10 §5.
- Cierres mensuales, librería de gráficos, motor de reportes configurable,
  export PDF, cualquier abstracción "genérica" pensada para cerrajería.

Descartados como vanidad: distribución por medio de pago, ventas por hora,
comparativas interanuales (no hay dos años de datos: mentiría), gráficos de
torta, dashboard de widgets configurables.

## Decisiones tomadas

| Fecha | Decisión | Motivo | Quién |
| --- | --- | --- | --- |
| 2026-07-24 | El orquestador delega y no implementa; equipo de 4 agentes | Separar decisión de ejecución y mantener el plan fuera del contexto de sesión | Camilo |
| 2026-07-24 | Congelar el costeo como mapa opcional versionado `costeo` en el ítem, con `fuente` + `origen` | Un solo punto de rama (converter + selector); permite distinguir dato real de reconstruido para siempre | `advisor` |
| 2026-07-24 | Se congelan `costoUnitCents` **y** `costoItemCents` | El total elimina la ambigüedad de redondeo: la ganancia queda reproducible sin re-derivar con la regla vigente al leer | `advisor` |
| 2026-07-24 | Costo 0 o ausente ⇒ `sin_costo`, nunca un 0 congelado | Un 0 declara 100% de ganancia y es indetectable después | `advisor` |
| 2026-07-24 | Agregación **en el cliente sobre ventas crudas**; sin rollups en escritura y sin Cloud Functions | Un rollup obliga a mantener la reversa por métrica en la anulación, y fija el catálogo antes de la elicitación. A este volumen no compra nada | `advisor` |
| 2026-07-24 | Backfill por script con Admin SDK, nunca aflojando reglas | El update de ventas está prohibido salvo anulación; esa inmutabilidad no se toca por una migración de una vez | `advisor` |
| 2026-07-24 | Pantalla como **registro de reportes** (lista de definiciones + rutas reales) | Afinar el catálogo post-elicitación = editar una lista, no rediseñar. Sin dashboard configurable: sería abstraer para un requisito inexistente | `advisor` |
| 2026-07-24 | Diseño de reportes ahora, afinado post-elicitación; las pantallas esperan | Decisión del dueño. El catálogo se lleva a la sesión como hipótesis (§8 del doc 10, después de las preguntas abiertas) | Camilo |
| 2026-07-24 | Sin librería de gráficos en v1 | Bundle en una PWA que se usa en la feria; ningún reporte del catálogo lo justifica todavía | `advisor` |
| 2026-07-24 | `costeo` legible por `vendedor` (viaja en el doc de venta) | No es fuga nueva: ya lee `pieza.costoKgCents` y `producto.costoPromedioCents` porque el POS los necesita. Cerrarlo exigiría partir el modelo de lectura del POS | `advisor` |
| 2026-07-24 | **Backfill cancelado**; se borran los datos de prueba de producción (A5) y se entrega con base limpia | Los datos operativos de prod son pruebas del desarrollador, no historia real. El borrado va DESPUÉS de deployar A1+A1b: si se limpia antes, lo que se pruebe mañana vuelve a nacer sin costeo | Camilo |
| 2026-07-24 | Congelar costeo en **todo movimiento de stock**, no solo ventas y mermas | Mismo criterio de dato auditable en toda la superficie. Sin presión de tiempo, no hay razón para hacerlo a medias | Camilo |
| 2026-07-24 | Pantallas (B1/B2) adelantadas, sin esperar la elicitación | Responden criterios ya fijados en doc 04; llegar a la sesión con algo funcionando es mejor insumo que un boceto | Camilo |
| 2026-07-24 | En `TarjetaDelta`, la **tendencia** (hecho: el número subió) y la **valoración** (juicio: eso es bueno) son campos independientes | Acopladas, `subida` siempre pinta verde. La merma, el costo promedio y el % de ventas sin costo son métricas donde subir es malo: la única forma de pintarlas en rojo era mentir con la flecha. `valoracion` es opcional y se infiere para el caso común | Orquestador (corrección en review de B5) |

## Punto de revisión anotado (tripwire)

Si la carga del mes en Reportes supera **~3s** o **~5k documentos**, recién ahí
se evalúan cierres mensuales (docs inmutables por mes cerrado, solo-admin). La
costura ya está prevista: las funciones de core reciben `Venta[]`, así que de
dónde salen esas ventas es problema del hook, no del dominio. No antes.

## Notas y deuda anotada

- **Corrección del orquestador (2026-07-24):** la segunda versión del diseño de
  `advisor` dejó fuera el congelado de costo en los movimientos de merma, que la
  primera sí tenía. Es el mismo problema de irreversibilidad que las ventas
  (`MovimientoStock` tampoco guarda costo), así que se reincorpora como **A1b**.
  Lo que espera a la elicitación es la *pantalla* de merma, no el dato.
- `advisor` ubicó `firestore.rules` y `firestore.indexes.json` en la raíz; están
  en `apps/quesarte/`. La suite de reglas vive en `apps/quesarte/tests/rules/`.
- **Error del orquestador (2026-07-24):** briefeé A5 y A6 diciendo que
  `apps/quesarte/scripts/` no existía —verifiqué el `scripts/` de la raíz, no el
  de la app—. Sí existe, con una infraestructura de seed de demo commiteada el
  12-07 (`generador.mjs` puro + `mapeoAdmin.mjs` + `seed-demo.mjs`, con tests y
  README) y un guardrail de **dos señales independientes** (flag `--project`
  explícito Y el `project_id` real de las credenciales, verificado antes de
  inicializar `firebase-admin`). Ambos agentes fueron redirigidos a extender lo
  existente y a reusar ese guardrail. Lección: verificar el directorio de la app,
  no solo el de la raíz, antes de afirmar que algo no existe en un brief.
- El seed de demo existente cubre solo clientes + WhatsApp (doc 08) y arma ítems
  **sin** `costeo`: sin actualizarlo, toda venta sembrada en dev clasifica como
  `legado` y los reportes de ganancia no muestran nada. Va incluido en A6.
- **Los tres criterios de aceptación de la Fase 3 (doc 04:477-480) están
  cubiertos**: ganancia del período (B1), rendimiento del viaje (B4) y aviso de
  vencimientos (B3). Falta validarlos con el dueño sobre datos de demo.
- **Índices sin consumidor (2026-07-24):** A4 agregó `movimientos (tipo, fecha)`
  y `piezas (estado, fechaVencimiento)` anticipando queries que después no los
  necesitaron, y se quitaron. El segundo además nunca debería usarse: la query
  de alertas NO puede ordenar por `fechaVencimiento` porque Firestore excluye
  del `orderBy` los documentos sin ese campo, y las piezas sin vencimiento
  (frutos secos, especias) desaparecerían del resultado, con su peso dejando de
  contar para la alerta de stock bajo. Lección para la memoria del proyecto: la
  regla "el índice entra en la misma tanda que su query" vale en los dos
  sentidos — un índice sin query cuesta amplificación de escritura, y en este
  caso escondía además un error de diseño de la query que lo justificaba.
- **Hallazgo del review de B1 (2026-07-24):** la pantalla comparaba el período
  de calendario EN CURSO contra el anterior COMPLETO. El día 3 de un mes son
  dos días y medio de ventas contra treinta: una caída del 44% que solo dice
  que el mes no terminó, y que aparecería todos los meses hasta el día 28.
  No lo cubre el umbral de "pocos datos" (puede haber 40 ventas en esos días:
  el problema no es la muestra, es que los períodos no son comparables).
  Resuelto con `periodoAnteriorComparable` en core, que trunca el anterior a
  la misma porción transcurrida y clampea cuando lo transcurrido excede al
  período anterior entero (día 31 contra febrero). Además la pantalla ahora
  dice cuál está mirando: "Ganancia de lo que va del mes" vs. "de este mes".
- **Hallazgo del review de A1b (2026-07-24):** el movimiento `ingreso_compra`
  de granel y unidad congelaba `nuevoCostoPromedioCents` (el promedio ponderado
  DESPUÉS del ingreso) en vez del costo real de esa mercadería en esa compra.
  Con 10 kg en stock a $100 y un ingreso de 10 kg a $200, el movimiento diría
  "entraron 10 kg a $150" = $1.500 cuando costaron $2.000. El error aparece
  justo cuando el precio cambió entre compras, que es cuando el dato importa, y
  pega en el criterio 2 del dueño ("¿el viaje rindió?"). El dato correcto ya
  estaba disponible y validado: `resolverEfectoItem` llama a
  `exigirCostoRealKgCoherente` en la rama granel (`compras.ts:435`) y descarta
  el valor en la línea siguiente. Devuelto a A1b; cero lecturas nuevas hacen
  falta.
- La demo de dev **no se corrió todavía** contra el emulador ni contra
  `quesarte-uy-dev`: son ~500-600 escrituras en 8 colecciones. Conviene un
  ensayo contra el emulador antes de la primera corrida real.
- Borde menor de `congelarCosteo`: cuando la base de costo es ≤ 0 se devuelve
  `sin_costo` y se descarta el `compraId`. Hoy es inalcanzable en la práctica
  (las piezas creadas por Compras siempre tienen costo > 0; las de ingreso
  manual no tienen `compraId`), pero si alguna vez se cruzaran, el reporte de
  rendimiento de viaje perdería esa línea en el "% vendido de la compra".
- Alertas duplicadas: Productos ya tiene franja de alertas (doc 06 §2). Antes de
  B3, buscar el helper existente (`componentes/stock/`) y compartir el cálculo,
  o las dos pantallas se van a contradecir.
- `aria-controls` faltante en el botón de filtros extra de Productos y Precios
  (deuda de doc 04:452-454) — mejorar juntos.
- A2 necesita un service account de Admin SDK para dev y prod. No hay evidencia
  de scripts de migración previos con ese patrón en el repo.
