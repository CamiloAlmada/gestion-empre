        # 03 — Compras, costos reales y precios

Este módulo es el diferencial del sistema: el dueño viaja a Colonia a buscar quesos
y a un mayorista por especias/frutos secos. Esos viajes tienen costos (combustible,
peajes) que deben formar parte del **costo real** de la mercadería para que los
márgenes no sean ficción.

## Compra

```
compras/{id} → {
  fecha, proveedorNombre, usuarioId, estado: 'borrador'|'confirmada',
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
Los redondeos deben cerrar: la suma de lo prorrateado == total de gastos
(asignar el residuo de redondeo al ítem de mayor valor). Testear este invariante.

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

### Pantalla "Precios y márgenes"

Tabla por producto: costo real promedio (por kg o unidad), precio de venta actual,
margen actual, margen objetivo (si está definido). Interacciones:

- Editar precio → recalcula margen en vivo.
- Editar margen objetivo → sugiere precio: `precio = costo / (1 − margen)`, con
  **redondeo comercial** configurable (`configuracion.multiploRedondeoCents`,
  default **$5** — decidido con el dueño 2026-07-09).
- Al confirmarse una compra que cambia el costo promedio, generar una **alerta de
  margen**: lista de productos cuyo margen quedó por debajo del objetivo, con el
  precio sugerido para restaurarlo, y acción "aplicar" individual o masiva.

### Ganancia real (Fase 3)

Cada ítem de venta conoce la pieza (y por ende su `costoKgCents`) o el
`costoPromedioCents` vigente (granel/unidad: congelarlo en el ítem al vender).
Con eso: reporte de ganancia bruta real por período, por producto y por categoría,
y ranking de rentabilidad (no solo qué se vende más, sino qué deja más).

Esto permite responder la pregunta de negocio central: **"¿el viaje a Colonia me
rinde?"** — comparando ganancia bruta de los productos de esa compra contra los
gastos del viaje.
