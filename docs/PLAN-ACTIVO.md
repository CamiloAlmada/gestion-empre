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
| A4 | Índices para alertas/merma + limpiar el huérfano `productos (activo, nombre)` | `trainee` | ✅ **hecha** | Verificado por el orquestador: ninguna query combina `activo` con `orderBy('nombre')` (`DetalleProductoPantalla.tsx:90` y `CompraPantalla.tsx:123` usan una u otra); JSON válido; resto de entradas intactas |
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
| B1 | Home de Reportes: registro de reportes, hero del período, sección "Para mirar", estados loading/error/vacío/offline (`fromCache`) | `semisenior` | A3, B5 | Criterio 1 del dueño (doc 04:478); cobertura <100% visible; delta oculto sin base; nota offline verificada |
| B2 | Drill-down de rentabilidad por producto/categoría | `semisenior` | B1 | Ranking por **ganancia aportada**, no por facturación; ítems `sin_costo` en bucket rotulado |
| B3 | Alertas: vencimientos en N días + stock bajo | `semisenior` (reglas revisadas por `senior`) | A4 | Criterio 3 (doc 04:480); **extender `configuracionGeneralValida`** (`firestore.rules:184`) en la misma tarea que agrega la clave |
| B4 | Rendimiento de compra/viaje | `semisenior` | A1, A2, B1 | Criterio 2 (doc 04:479); una compra de dev muestra gastos vs ganancia y % vendido; parte granel rotulada "aproximada" |

## Pendiente de decisión del dueño — antes de correr el reseteo (A5)

El script está listo pero NO se corrió. Decisiones que tomó por defecto y que
hay que confirmar antes de ejecutarlo contra `quesarte-uy`:

| Decisión por defecto | Alternativa |
| --- | --- |
| Los **clientes** de prueba se conservan, con `stats` en cero | Que Adrián arranque con la agenda vacía (hoy el script no lo implementa) |
| Los **usuarios** de prueba se conservan y no se desactivan; Firebase Auth no se toca | Darlos de baja desde la pantalla de Usuarios |
| `configuracion` (general, tema, plantillas de WhatsApp) se conserva entera | — |
| Las **compras en borrador** se borran junto con las confirmadas | — |
| El backup incluye las 10 colecciones, no solo las que se tocan | — |

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
