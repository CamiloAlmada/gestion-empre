# 05 — Cerrajería (especificación preliminar — NO implementar aún)

Este documento existe para que las decisiones de diseño en `packages/` tengan en
cuenta al segundo consumidor. Se detallará con el dueño antes de la Fase 4.

## Dominio (borrador)

- **Artículos**: stock por unidad. Llaves en bruto (por modelo/marca), cilindros,
  cerraduras, candados, herrajes, materiales/insumos. Sin peso, sin piezas:
  `modoStock: unidad_simple` de core alcanza.
- **Servicios**: copias de llave, aperturas, instalaciones, reparaciones. Tienen
  precio propio y pueden **consumir artículos** (una copia consume 1 llave en
  bruto del modelo X).
- **Órdenes de trabajo**: el corazón del negocio. Cliente (nombre/teléfono,
  informal), descripción, servicios + artículos, estado
  (`presupuestada` → `en_proceso` → `terminada` → `entregada/cobrada`),
  seña/adelanto, total.
- **Venta de mostrador**: venta directa de artículos sin orden (un candado).

## Qué se reusa del monorepo

- `core`: `Money`, movimientos de stock, márgenes/markup y redondeo comercial
  (los artículos también tienen costo y precio), prorrateo de gastos si compra
  con flete.
- `firebase-kit` y `ui` completos (POS, tablas, inputs).
- El módulo de compras del doc 03 aplica casi igual (sin piezas al peso).

## Diferencias a tener presentes al diseñar core

- El concepto **orden de trabajo con estados y seña** no existe en la quesería:
  diseñarlo como módulo nuevo, no forzarlo dentro de `Venta`.
- El stock consumido por un servicio debe descontarse al completar la orden
  (o al iniciarla — decidir con el dueño), no al presupuestar.
