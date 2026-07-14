        # 03 — Compras, costos reales y precios

Este módulo es el diferencial del sistema: el dueño viaja a Colonia a buscar quesos
y a un mayorista por especias/frutos secos. Esos viajes tienen costos (combustible,
peajes) que deben formar parte del **costo real** de la mercadería para que los
márgenes no sean ficción.

## Compra

```
compras/{id} → {
  fecha, usuarioId, estado: 'borrador'|'confirmada',
  proveedorId?, proveedorNombre,   // selector con alta inline (doc 07); nombre
                                   // denormalizado. proveedorId opcional solo
                                   // como retrocompatibilidad — las compras
                                   // nuevas siempre lo llevan.
  items: [ {
    productoId, nombreProducto,
    // según modoStock del producto:
    gramos?      // fraccionado_por_pieza, pieza_entera, granel
    unidades?,   // unidad_simple
    piezas?: [ { pesoGramos, fechaVencimiento? } ],  // detalle por pieza si aplica
    costoFacturaCents,          // lo que dice la factura por este ítem (total del ítem)
    gastoProrrateadoCents,      // calculado al confirmar
    costoRealCents,             // costoFactura + gastoProrrateado
    costoRealKgCents?           // derivado, para ítems al peso
  } ],
  gastos: [ { concepto: 'combustible'|'peaje'|'flete'|'otro',
              descripcion?, montoCents } ],
  totalFacturaCents, totalGastosCents, totalRealCents
}
```

## Prorrateo de gastos

Al confirmar la compra, los gastos se reparten entre los ítems según
`configuracion.metodoProrrateo`:

- **`por_valor`** (default): proporcional al `costoFacturaCents` de cada ítem.
- **`por_peso`**: proporcional a los gramos (ítems por unidad usan un peso
  estimado o quedan fuera; documentar la limitación en la UI).

El prorrateo es función pura en `packages/core`:
`prorratearGastos(items, gastos, metodo) → items con gastoProrrateadoCents`.
Los redondeos deben cerrar: la suma de lo prorrateado == total de gastos.
Algoritmo (fijado en F2-D, 2026-07-10): método del mayor residuo (Hamilton) en
aritmética entera — base `⌊total·peso_i/W⌋` por ítem y el residuo repartido de
a +1 a los de mayor residuo fraccionario, con desempate determinístico mayor
residuo → mayor peso → menor índice (el desempate por mayor peso recupera la
intención original de "al ítem de mayor valor" cuando hay empate). Testear este
invariante con barrido exhaustivo, no solo casos sueltos.

## Compras e ingreso manual (decidido con el dueño, 2026-07-09)

Conviven: la compra es el camino normal de ingreso de mercadería (con costos y
prorrateo). El ingreso manual de Stock queda para casos sin compra (regalos,
muestras, correcciones); no lleva costo real y **no afecta** el costo promedio.

## Efectos de confirmar una compra

En una transacción/batch:
1. Crear las **piezas** declaradas (con `costoKgCents = costoRealKgCents` del ítem)
   para productos por pieza.
2. Incrementar `stockGranelGramos` / `stockUnidades` para granel y unidad_simple.
3. Crear movimientos `ingreso_compra`.
4. Recalcular `costoPromedioCents` del producto (promedio ponderado por
   cantidad/peso entre stock existente y lo ingresado).
5. Marcar la compra `confirmada` (inmutable después; correcciones = ajustes).

## Precios y márgenes

Definiciones (fijarlas en `core` con estos nombres, y en la UI siempre etiquetadas):

- **Markup sobre costo** = (precioVenta − costo) / costo
- **Margen sobre venta** = (precioVenta − costo) / precioVenta

La UI de precios trabaja con **margen sobre venta** como métrica principal (es lo
que responde "de cada $100 que vendo, cuánto me queda"), mostrando el markup como
dato secundario.

Representación del porcentaje (fijada en F2-D, 2026-07-10): **basis points
enteros** (`10000 bps = 100 %`; `33,33 % = 3333 bps`) — nunca floats en
persistencia ni en core. El campo `margenObjetivoPct` del modelo `Producto`
(puntos porcentuales, aún sin uso) migra a **`margenObjetivoBps`** en la tarea
de persistencia de Fase 2, antes de que exista UI que lo escriba. Redondeo
comercial: al múltiplo MÁS CERCANO con half-up (consistente con
`redondearHalfUp` de core). La alerta de margen recalcula el margen real desde
el precio YA redondeado (en precios chicos, el redondeo de $5 corre el margen
efectivo respecto del objetivo — comportamiento esperado, no un bug).

### Pantalla "Precios y márgenes"

Tabla por producto: costo real promedio (por kg o unidad), precio de venta actual,
margen actual, margen objetivo (si está definido). Interacciones:

- Editar precio → recalcula margen en vivo.
- Editar margen objetivo → sugiere precio: `precio = costo / (1 − margen)`, con
  **redondeo comercial** configurable (`configuracion.multiploRedondeoCents`,
  default **$5** — decidido con el dueño 2026-07-09).
- **Margen masivo sobre los filtrados** (WA-H 2026-07-13, pedido del dueño):
  acción "Ajustar margen" (WA-H2: etiqueta corta para que conviva con
  "Aplicar sugeridos (N)" en UNA fila; el conteo de alcanzados vive en el
  modal, no en el botón) que abre un modal con el porcentaje
  (mismo formato bps que el editor individual) y dos salidas: **"Fijar
  objetivo"** (escribe `margenObjetivoBps` en los N productos filtrados por
  búsqueda/categoría/"solo bajo objetivo", en batch; los sugeridos se
  recalculan y el dueño puede revisarlos 1 a 1 o usar "Aplicar sugeridos") y
  **"Fijar y aplicar precios"** (además aplica en el mismo batch el precio
  sugerido resultante, con el redondeo comercial de siempre). Excluye
  productos sin costo (sin margen calculable) y los de margen no comparable
  (pieza + precio por unidad, ver M2): el modal dice cuántos quedan afuera y
  por qué. No reemplaza nada: la edición individual sigue igual.
- Al confirmarse una compra que cambia el costo promedio, generar una **alerta de
  margen**: lista de productos cuyo margen quedó por debajo del objetivo, con el
  precio sugerido para restaurarlo, y acción "aplicar" individual o masiva.
- **Desglose del costo — ⓘ de última compra** (COSTO-1, 2026-07-14, pedido
  del dueño al validar Fase 2; decidió la variante "última compra" sobre
  partir el promedio en acumuladores): junto al costo del producto, un
  botón-icono ⓘ (`aria-label` descriptivo) abre un modal de SOLO LECTURA con
  el desglose de la ÚLTIMA compra confirmada que incluyó el producto:
  mercadería (`costoFacturaCents` normalizado a /kg o /u), gastos de viaje
  prorrateados (`gastoProrrateadoCents` ídem), costo real resultante, fecha
  y proveedor. Rotulado honesto: es el desglose de ESA compra — el costo
  promedio vigente puede mezclar compras anteriores y stock previo, y el
  modal lo aclara en una línea. Sin ⓘ (o modal con estado vacío diseñado)
  para productos sin compras confirmadas. Los datos salen de los ítems de
  compra ya persistidos e inmutables: CERO cambio de modelo. Regla de
  índices vigente: si la consulta de "última compra confirmada" necesita una
  query compuesta nueva, su índice entra en `firestore.indexes.json` en la
  misma tarea (preferir reusar la query/índice del listado de Compras si ya
  cubre estado+fecha).
  - **COSTO-2** (2026-07-14, pedido del dueño al ver COSTO-1): el MISMO
    desglose se muestra además INLINE en el modal de edición de precio
    (`ModalPrecio`), bajo la línea "Costo promedio": texto secundario
    compacto con mercadería y gastos prorrateados /kg (o /u) de la última
    compra confirmada, rotulado "última compra" (mismo etiquetado honesto).
    Misma fuente y helpers que COSTO-1 (`desgloseCosto.ts`, query lazy solo
    con el modal abierto); sin compra confirmada que incluya el producto, la
    línea no aparece (el modal no agrega ruido). Cero escrituras.

### Ganancia real (Fase 3)

Cada ítem de venta conoce la pieza (y por ende su `costoKgCents`) o el
`costoPromedioCents` vigente (granel/unidad: congelarlo en el ítem al vender).
Con eso: reporte de ganancia bruta real por período, por producto y por categoría,
y ranking de rentabilidad (no solo qué se vende más, sino qué deja más).

Esto permite responder la pregunta de negocio central: **"¿el viaje a Colonia me
rinde?"** — comparando ganancia bruta de los productos de esa compra contra los
gastos del viaje.
