# 02 — Dominio y modelo de datos: Quesería

Negocio real: venta de quesos, charcutería/embutidos, miel, frutos secos y especias.
El dueño compra mercadería viajando (ej. quesos en Colonia, especias y frutos secos
en un mayorista de Montevideo) y vende en mostrador.

## Conceptos clave

### Producto

Catálogo. Cada producto combina dos dimensiones **independientes**:

**`modoPrecio`** — cómo se le cobra al cliente:
- `por_kg`: el precio se calcula como peso × precioKg (quesos, embutidos, frutos
  secos, especias).
- `por_unidad`: precio fijo por unidad (frasco de miel).

**`modoStock`** — cómo se controla la existencia:
- `fraccionado_por_pieza`: existen piezas físicas (ruedas/hormas de queso) con peso
  propio. Se vende cortando de una pieza; la pieza sigue existiendo con menos peso.
- `pieza_entera`: existen piezas físicas con peso propio (embutidos: salames,
  bondiolas) pero **se venden enteras**: se va la unidad completa y el precio al
  cliente se calcula con el peso de ESA pieza. La pieza desaparece del stock al
  venderse.
- `granel`: stock agregado en gramos, sin piezas individuales (especias, frutos
  secos). Se vende al peso descontando del total. NO trazamos por bolsa: sería
  complejidad sin valor acá.
- `unidad_simple`: stock agregado en unidades enteras (frascos de miel).

Combinaciones válidas:

| Producto ejemplo | modoPrecio | modoStock |
|---|---|---|
| Queso Colonia | por_kg | fraccionado_por_pieza |
| Salame tandilero | por_kg | pieza_entera |
| Nuez mariposa | por_kg | granel |
| Miel 500g | por_unidad | unidad_simple |

### Pieza

Solo para productos con `modoStock` = `fraccionado_por_pieza` o `pieza_entera`.
Representa un objeto físico: una rueda de queso, un salame.

Atributos: producto, peso inicial (g), **peso restante (g)**, costo real por kg
(heredado de la compra, ver doc 03), fecha de ingreso, fecha de vencimiento
(opcional), estado (`disponible` | `agotada` | `merma_total`), referencia a la
compra de origen.

### Regla FIFO con override

En la venta, el sistema elige automáticamente la pieza a descontar: la **disponible
más antigua** (por fecha de ingreso) del producto. El vendedor puede elegir otra
pieza manualmente, pero **nunca es obligatorio elegir**. El flujo de mostrador debe
ser: buscar producto → ingresar peso (o cantidad) → agregar al ticket. Rápido.

- `fraccionado_por_pieza`: si el peso vendido supera el restante de la pieza FIFO,
  la UI avisa y permite dividir la venta entre piezas o elegir otra. Al llegar el
  peso restante a un umbral mínimo configurable (ej. 50 g), ofrecer marcar la pieza
  como agotada registrando la diferencia como merma.
- `pieza_entera`: la venta consume la pieza completa; el precio del ítem =
  pesoRestante de la pieza × precioKg vigente. La UI muestra las piezas disponibles
  con su peso para que el vendedor confirme cuál se lleva el cliente (acá sí suele
  importar cuál, porque el cliente elige "ese salame").

### Categoría

Vocabulario controlado para agrupar productos (Quesos, Embutidos, Miel, Frutos
secos, Especias…). Las define el admin (crear, renombrar, reordenar); **no se
borran** (evita productos huérfanos — una categoría en desuso simplemente no se
elige más). El producto guarda el **nombre** de la categoría (denormalizado, no
el id): renombrar una categoría actualiza su doc y todos sus productos en un
**batch atómico**. `orden` (entero) controla cómo se agrupan las listas (Stock).
Un producto cuya categoría no coincida con ninguna definida se muestra al final
bajo "Sin categoría". La grilla del POS no agrupa (velocidad primero).

### Movimiento de stock

Todo cambio de stock genera un movimiento inmutable (auditoría). Tipos:
`ingreso_compra`, `venta`, `ajuste_positivo`, `ajuste_negativo`, `merma`,
`devolucion`. Un movimiento referencia producto, pieza (si aplica), delta en
gramos o unidades, documento origen (venta/compra/ajuste) y usuario.

### Venta

Ticket de mostrador. Ítems: producto, pieza (si aplica), peso o cantidad, precio
unitario congelado al momento de la venta, subtotal. Cabecera: fecha, usuario,
total, medio de pago (`efectivo` | `debito` | `credito` | `transferencia`),
estado (`completada` | `anulada`). La anulación NO borra: genera movimientos
inversos y marca estado.

**Costo congelado por ítem (`costeo`, Fase 3 / tarea A1).** El costo de un
producto cambia con cada compra: leerlo después de vender da un número
equivocado, así que cada ítem congela el suyo al vender, en un mapa opcional y
versionado:

```
costeo?: {
  v: 1,                                   // ausencia del mapa = versión 0 (ítems pre-congelado)
  fuente: 'pieza'|'promedio'|'sin_costo', // pieza.costoKgCents | producto.costoPromedioCents | sin base
  origen: 'venta'|'backfill',             // dato real vs reconstruido (ortogonal a `fuente`)
  costoUnitCents?,                        // por kg o por unidad, igual que precioUnitCents
  costoItemCents?,                        // total del ítem, YA redondeado con la MISMA regla que subtotalCents
  compraId?                               // procedencia (copiado de pieza.compraId)
}
```

Reglas duras (implementadas en `packages/core/src/costeo.ts`):
- Sin base de costo (0 o ausente) ⇒ `fuente: 'sin_costo'` y **sin montos**.
  Congelar un costo 0 declararía 100 % de ganancia: una mentira indetectable.
- `costoItemCents` sale de `calcularSubtotal`, la misma función que produce
  `subtotalCents` ⇒ `ganancia = subtotalCents − costoItemCents` es reproducible.
- La rama "¿existe `costeo`?" vive SOLO en el converter y en `clasificarCosteo`
  (`'real' | 'estimado' | 'sin_dato' | 'legado'`). Ninguna pantalla ni agregación
  vuelve a preguntar por `costeo === undefined`.
- El congelado es aritmética síncrona sobre datos que el POS ya tiene en memoria:
  **cero lecturas nuevas** en el camino de venta (offline-first).

**Escritura atómica**: registrar la venta + descontar piezas/stock + crear
movimientos debe hacerse en una transacción o batch de Firestore.

## Unidades y dinero (regla dura)

- **Peso: gramos, entero.** La UI muestra y acepta kg con decimales, pero convierte
  a gramos antes de tocar dominio o persistencia.
- **Dinero: centésimos de peso uruguayo, entero.** `$ 1.234,50` se persiste como
  `123450`.
- El precio de un ítem al peso: `subtotalCents = round(precioKgCents * gramos / 1000)`.
  Redondeo half-up. Implementar y testear en `core`.

## Colecciones Firestore (app quesería)

```
usuarios/{uid}             → { nombre, email, rol: 'admin'|'vendedor', activo }
categorias/{id}            → { nombre, orden }   // vocabulario; producto referencia por nombre
productos/{id}             → { nombre, categoria, modoPrecio, modoStock,
                               precioVentaCents (por kg o por unidad según modoPrecio),
                               costoPromedioCents, margenObjetivoPct?,
                               stockGranelGramos?, stockUnidades?,   // solo granel/unidad_simple
                               umbralAlertaStock?, activo, actualizadoEn }
piezas/{id}                → { productoId, pesoInicialGramos, pesoRestanteGramos,
                               costoKgCents, compraId?, fechaIngreso,
                               fechaVencimiento?, estado }
ventas/{id}                → { numero, fecha, usuarioId, items: [ {productoId, piezaId?,
                               gramos?, unidades?, precioUnitCents, subtotalCents,
                               nombreProducto, costeo?} ], totalCents, medioPago, estado,
                               clienteId?, clienteNombre? }
compras/{id}               → ver docs/03
movimientos/{id}           → { tipo, productoId, piezaId?, deltaGramos?, deltaUnidades?,
                               origenTipo, origenId, usuarioId, fecha, nota? }
configuracion/general      → { nombreNegocio, umbralPiezaAgotadaGramos,
                               metodoProrrateo: 'por_valor'|'por_peso', ... }
```

Notas:
- `items` embebidos en la venta (denormalizados con nombre y precio congelados):
  las ventas son inmutables, no hace falta subcollection.
- `costoPromedioCents` en producto es cache derivado (promedio ponderado de
  ingresos); la fuente de verdad son compras y piezas.
- Índices compuestos necesarios: `piezas (productoId, estado, fechaIngreso)`,
  `ventas (fecha desc)`, `movimientos (productoId, fecha desc)`.

## Reglas de seguridad (resumen)

- Denegar todo por defecto.
- Lectura/escritura solo con `request.auth != null` y documento en `usuarios/{uid}`
  con `activo == true`.
- `rol == 'vendedor'`: puede crear ventas y leer productos/piezas. No puede editar
  precios, compras ni ajustes.
- `categorias`: lectura para todo usuario activo; create/update solo admin; sin
  delete (regla dura, ver "Categoría").
- `rol == 'admin'`: todo.
- `movimientos` y `ventas`: prohibido update/delete (solo create; anulación vía
  campo estado con regla que valida transición).

## Pantallas de la app (MVP, ver fases en doc 04)

1. **POS Venta** (home): buscador/grilla de productos, carrito, cobro. Optimizada
   para tablet/celular en mostrador. Funciona offline.
2. **Productos**: alta/edición, precio, categoría, modos.
3. **Stock**: por producto: piezas con pesos y vencimientos, o total granel/unidades.
   Ingreso manual de piezas y ajustes/merma.
4. **Ventas**: historial, detalle, anulación (admin).
5. **Compras** (Fase 2): ver doc 03.
6. **Panel/Reportes** (Fases 2-3): ventas del día/mes, márgenes, alertas de
   vencimiento y stock bajo, ranking de rentabilidad.
