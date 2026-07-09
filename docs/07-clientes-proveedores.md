# 07 — Clientes y proveedores

Extensión del dominio de la quesería (doc 02) y del módulo de compras (doc 03).
La UI de este módulo se rige por el contrato de diseño (doc 06).
Objetivo: conocer al cliente (cuánto, cada cuánto y qué compra) y al proveedor
(a quién se le compra qué, a qué costo, con qué frecuencia) para habilitar
estadísticas e inteligencia de compras.

## Decisiones de diseño

1. **Colecciones separadas** `clientes` y `proveedores` — decisión CERRADA,
   no reabrir ni proponer unificar con un flag: esquemas, seguridad y
   estadísticas son distintos. Los proveedores son pocos; su colección chica
   no es un costo.
2. **Nombre en un solo campo** (`nombre`), con `alias` opcional. Negocio
   informal de mostrador; no forzar apellido.
3. **Cliente OPCIONAL en la venta.** El POS nunca exige cliente: venta anónima
   por defecto, asociar cliente es una acción de un toque (buscar por nombre/
   alias/teléfono, o alta rápida con solo nombre). Si asociar cliente enlentece
   el mostrador, la feature fracasa.
4. **Datos mínimos.** Son datos personales de gente real: se guarda lo que
   sirve al negocio, nada más. Ningún campo es obligatorio salvo `nombre`.
5. Los contadores/estadísticas por cliente son **cache denormalizado** que se
   actualiza en la MISMA escritura atómica de la venta (y su reversa en la
   anulación), como **batch con `FieldValue.increment()`** — nunca transacción
   read-modify-write: las transacciones de Firestore no funcionan offline y el
   POS cobra offline (doc 06 §8). La fuente de verdad siempre son las ventas.
6. Toda pantalla nueva de este doc cumple el contrato de UI del doc 06
   (checklist §5, patrón de escrituras offline §8).

## Colecciones

```
clientes/{id} → {
  nombre,                    // único obligatorio
  alias?,                    // "Marta la de enfrente"
  telefono?, email?, direccion?, notas?,
  fechaAlta, activo,
  // cache denormalizado, actualizado con FieldValue.increment() en el mismo
  // batch de la venta/anulación (compatible offline — ver decisión 5):
  stats: {
    cantidadVentas, totalHistoricoCents,   // increments (+/− al anular)
    primeraCompra?, ultimaCompra?
    // ticketPromedio NO se persiste (increment no divide):
    // se calcula al mostrar como totalHistorico / cantidadVentas
  }
}

proveedores/{id} → {
  nombre,                    // razón social o nombre de fantasía
  contactoNombre?, telefono?, email?,
  direccion?,                // útil: es a dónde hay que viajar
  rut?,
  pagos?: [ { banco, cuenta, titular?, moneda? } ],  // para transferencias
  notas?, fechaAlta, activo
}
```

### Cambios en colecciones existentes

```
ventas/{id}    → + clienteId?, clienteNombre?     // denormalizado, opcional
compras/{id}   → proveedorNombre pasa a: proveedorId + proveedorNombre
                 (denormalizado; compras viejas sin proveedorId siguen válidas)
productos/{id} → + proveedorPrincipalId?          // default al armar compras;
                                                  // la verdad está en el historial
```

Índices nuevos: `ventas (clienteId, fecha desc)`, `compras (proveedorId, fecha desc)`.

## Reglas de seguridad

- `clientes`: lectura y creación para `vendedor` (alta rápida en POS) y `admin`;
  edición/desactivación solo `admin`.
- `proveedores`: solo `admin` (lectura y escritura). El vendedor no ve datos
  bancarios ni costos de proveedor.
- `clientes.stats`: para `vendedor`, la escritura sobre clientes se limita a
  create (alta rápida) y a updates que solo tocan `stats` con deltas coherentes
  con una venta (validar en reglas qué campos muta). Edición de datos de
  contacto y desactivación: solo `admin`.

## Pantallas (encaje en la navegación del doc 06 §2 — sin tabs nuevos)

1. **Clientes**: sección interna del tab **Historial** (mismo patrón que
   Productos dentro de Stock). Listado con búsqueda (nombre/alias/teléfono),
   ficha con datos + stats + historial de ventas del cliente. Alta rápida
   (solo nombre) y alta completa. Subvistas en rutas reales (doc 06 §2).
2. **POS**: control "Cliente" opcional **dentro del carrito/ticket** — Venta
   no declara acciones de header (doc 06 §2) y su zona inferior es del
   carrito. Buscar o alta rápida en el lugar. La venta anónima conserva el
   presupuesto de ≤3 toques (doc 06 §6); asociar cliente es siempre un paso
   extra opcional que nunca bloquea el cobro.
3. **Proveedores**: sección interna del tab **Stock**, junto a Compras
   (solo `admin`; se oculta para `vendedor`, como manda doc 06 §2). Listado,
   ficha con datos de pago e historial de compras con totales.
4. **Compra** (doc 03): el proveedor pasa de texto libre a selector con alta
   inline. Al elegir proveedor, sugerir los productos cuyo
   `proveedorPrincipalId` coincide o que se le compraron antes.
5. Alta rápida de cliente y asociación en el POS siguen el patrón de
   escrituras offline del doc 06 §8.

## Inteligencia (extiende Fase 3)

**Por cliente** (calculado desde ventas, con el cache para lo agregado):
- Frecuencia: días promedio entre compras y "hace N días que no viene"
  (lista de clientes habituales inactivos — accionable para el dueño).
- Preferencias: top productos/categorías por cliente (query de ventas por
  clienteId, agregando items). Habilita atención personalizada: "llegó el
  queso que le gusta a Marta".
- Ranking de mejores clientes por total y por frecuencia.

**Por proveedor / compras estimadas:**
- Historial de costo por producto y proveedor: evolución del costo real
  (doc 03) compra a compra.
- **Sugerencia de próxima compra**: con el ritmo de venta de cada producto
  (movimientos tipo venta de los últimos N días) y el stock actual, estimar
  días de cobertura restantes. Vista "próximo viaje a <proveedor>": productos
  de ese proveedor ordenados por urgencia, con cantidad sugerida para cubrir
  el ciclo típico entre compras. Esto convierte el viaje a Colonia de
  intuición a lista concreta.
- Comparativa simple entre proveedores cuando un producto se compró a más
  de uno.

## Criterios de aceptación

- [ ] Una venta sin cliente funciona exactamente igual que hoy: ≤3 toques
      (doc 06 §6), cero fricción nueva.
- [ ] Asociar un cliente existente a una venta toma un toque + búsqueda,
      desde el carrito.
- [ ] Alta rápida de cliente desde el POS con solo el nombre, funcionando
      offline (patrón doc 06 §8).
- [ ] Vender y anular actualizan `stats` del cliente vía increments en el
      mismo batch (anular una venta de $500 resta $500 y una venta del
      contador), incluso si la venta se hizo offline.
- [ ] La ficha del cliente muestra historial, ticket promedio y días desde la última compra.
- [ ] Una compra confirmada queda vinculada al proveedor y aparece en su ficha.
- [ ] Un `vendedor` no puede leer la colección proveedores (verificado por reglas, no solo UI).
- [ ] La vista "próximo viaje" lista productos del proveedor con cobertura estimada en días y cantidad sugerida.