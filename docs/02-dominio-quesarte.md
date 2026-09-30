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
secos, Especias…). Las define el admin (crear, renombrar, reordenar). El producto
guarda el **nombre** de la categoría (denormalizado, no el id): renombrar una
categoría actualiza su doc y todos sus productos en un **batch atómico**. `orden`
(entero) controla cómo se agrupan las listas (Stock). Un producto cuya categoría
no coincida con ninguna definida se muestra al final bajo "Sin categoría". La
grilla del POS no agrupa (velocidad primero).

#### Esquema de id: el id ES la clave del nombre

**Invariante: `categorias/{id}` cumple siempre `id === claveCategoria(nombre)`**,
donde `claveCategoria` (en `packages/core/src/categoria.ts`) es `trim()` +
`toLowerCase()`. El documento persiste esa clave también como campo, `clave`.

Es lo que hace **imposible** tener dos categorías con el mismo nombre. "No hay
dos categorías homónimas" es un invariante ENTRE documentos, y `firestore.rules`
no puede expresarlo porque las reglas no hacen queries. Convertido en invariante
DE cada documento —"el id de este documento es la clave de su nombre"— sí se
puede: si todos lo cumplen, dos categorías con el mismo nombre serían el mismo
documento. La regla lo exige en **create y en update** (`categoriaId ==
request.resource.data.clave`).

Antes, la unicidad la chequeaba solo `crearCategoria` (leer → comparar →
escribir). Eso no alcanzaba: no cubría al Admin SDK (el seed de demo llegó a
crear un segundo "Quesos") y tenía condición de carrera, porque siendo la app
offline-first dos dispositivos sin conexión leen su cache, ambos pasan el chequeo
y ambos encolan el alta. Con el id derivado del nombre esa carrera **converge**:
las dos escrituras van a `categorias/quesos` y al sincronizar queda un documento.
El chequeo de aplicación se conserva, pero solo como fuente del mensaje amigable
("Ya existe una categoría llamada X").

Consecuencias:

- **Renombrar puede mudar el documento de path.** Si la clave nueva es igual a la
  actual (cambiaron solo mayúsculas o espacios), se actualiza in-place. Si cambia,
  el documento se muda: `set` del nuevo path (conservando `orden`) + `delete` del
  viejo + fan-out a productos, todo en el mismo batch. Conservar el id viejo
  rompería el invariante: si "Quesos" (id `quesos`) pasara a llamarse "Fiambres"
  pero siguiera viviendo en `quesos`, un alta posterior de "Quesos" pisaría a
  Fiambres.
- **Por eso `delete` está abierto a admin** (antes era `false` para evitar
  productos huérfanos). Lo que protege ahora contra huérfanos es la atomicidad del
  batch de renombrado —el único borrado real del sistema—, que re-etiqueta todos
  los productos en el mismo commit en que borra el documento viejo. La pantalla de
  categorías no ofrece "eliminar".
- **Nombres rechazados**: los que producen una clave que no sirve como id de
  Firestore (`.`, `..`, cualquiera con `/`, y la forma `__algo__`). Se rechazan en
  `exigirNombre` con `CategoriaInvalidaError` en español, antes de que el SDK tire
  un error críptico.
- **La clave NO se reduce a ASCII**: "Ñoquis" → `ñoquis`, "Café" → `café`. Se
  verificó contra el emulador que el `lower()` del lenguaje de reglas solo baja
  A–Z ASCII (deja intactas 'Ñ' y las vocales acentuadas), así que la regla NO
  compara contra `nombre.trim().lower()` —eso rechazaría nombres perfectamente
  válidos en una quesería uruguaya— sino contra el campo `clave`, calculado en
  `core` con el `toLowerCase()` de JS. Límite aceptado: las reglas garantizan
  `id == clave`, no que `clave` derive honestamente de `nombre` (replicar el
  `toLowerCase()` Unicode no es posible en el lenguaje de reglas). Lo que importa
  para la unicidad —un path, un documento— sí queda garantizado.

### Movimiento de stock

Todo cambio de stock genera un movimiento inmutable (auditoría). Tipos:
`ingreso_compra`, `venta`, `ajuste_positivo`, `ajuste_negativo`, `merma`,
`devolucion`. Un movimiento referencia producto, pieza (si aplica), delta en
gramos o unidades, documento origen (venta/compra/ajuste) y usuario.

### Venta

Ticket de mostrador. Ítems: producto, pieza (si aplica), peso o cantidad, precio
unitario congelado al momento de la venta, subtotal. Cabecera: fecha, usuario,
total, medio de pago (`efectivo` | `debito` | `credito` | `transferencia` |
`a_cobrar`, ver "Cobro diferido" abajo), estado (`completada` | `anulada`). La
anulación NO borra: genera movimientos inversos y marca estado.

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

**Cobro diferido (`a_cobrar`, Cobros diferidos Fase A, 2026-09-30).** La venta y
el pago no siempre ocurren juntos: el cliente se lleva la mercadería y paga días
después. Diseño, respuestas de Adrián y roadmap en `docs/11-cobros-diferidos.md`;
acá, lo que ya está en el código.

- `medioPago: 'a_cobrar'` (`MedioPago` = `MedioPagoReal | 'a_cobrar'`, en
  `packages/core/src/tipos.ts`). Dice cómo se cerró en el mostrador y **no
  cambia nunca**: el medio con el que realmente se cobra vive en cada pago
  (`MedioPagoReal`: `efectivo` | `debito` | `credito` | `transferencia`).
- `cobro?: CobroVenta` (`tipos.ts`), solo en ventas `a_cobrar`:

```
cobro?: {
  v: 1,                                   // versión del esquema
  estado: 'pendiente' | 'cobrada',        // derivado; se persiste para filtrar sin leer la lista
  cobradoCents,                           // suma de pagos[].montoCents (derivado, persistido)
  pagos: [ {                              // PagoVenta; máximo 20 por venta
    id, fecha, registradoEn,              // fecha: la del comprobante; registradoEn: cuándo se cargó
    montoCents (> 0), medioPago: MedioPagoReal,
    usuarioId,                            // quién lo registró
    referencia?,                          // número de operación (≤ 60 caracteres)
    cuentaId?, cuentaEtiqueta?            // cuenta del negocio; hoy sin UI ni colección (Fase B)
  } ]
}
```

- **Cuándo existe `cobro`.** `registrarVenta` (`packages/firebase-kit/src/ventas.ts`)
  lo escribe solo si `medioPago === 'a_cobrar'`, con el valor de `cobroInicial()`
  (`packages/core/src/cobro.ts`): `{ v: 1, estado: 'pendiente', cobradoCents: 0,
  pagos: [] }`. Con cualquier otro medio se **omite** (nunca `null`). Su
  **ausencia** significa "cobrada en el acto" (o venta anterior a esta
  capacidad).
- **Cómo se interpreta.** `estadoCobro(venta)` (`core/src/cobro.ts`) es la
  **única** función autorizada a leer `venta.cobro` y `medioPago === 'a_cobrar'`,
  con la misma disciplina que `clasificarCosteo`: ninguna pantalla pregunta por
  `cobro === undefined` a mano. Devuelve `'anulada'` (gana sobre todo, aunque haya
  pagos), `'cobrada'` (sin `cobro`, o `cobro.estado === 'cobrada'`), `'parcial'`
  (pendiente con algo cobrado) o `'pendiente'`. `'parcial'` y `'anulada'` se
  derivan, no se persisten: `cobro.estado` solo vale `pendiente` o `cobrada`.
  `saldoPendienteCents(venta)` da `totalCents - cobro.cobradoCents`, y `0` si no
  hay `cobro` o la venta está anulada.
- **Cómo se escribe.** Los pagos se calculan con funciones puras de core:
  `aplicarPago(cobro, pago, totalCents)` (lanza `RangeError` si el monto es ≤ 0 o
  si lo cobrado superaría el total) y `deshacerUltimoPago(cobro, totalCents)`
  (lanza `RangeError` si no hay pagos); las dos recalculan `cobradoCents` y
  `estado`. En `packages/firebase-kit/src/cobros.ts`: `registrarPago`,
  `registrarPagos` (un pago que salda varias ventas: un `writeBatch`, cada venta
  recibe su saldo con la misma fecha, medio y referencia) y `deshacerUltimoPago`.
  El update lleva exactamente `{ cobro }`, sin lecturas previas (recibe la venta
  que el caller ya tiene en memoria; compatible offline, doc 06 §8). Validan de
  forma síncrona y devuelven la promesa del commit sin esperarla:
  `CobroInvalidoError` si la venta no está `completada`, no tiene `cobro`, ya
  tiene 20 pagos o un texto excede su tope; `RangeError` de core para monto ≤ 0 o
  sobrepago.
- **Deshacer** solo quita el **último** pago (caso "lo cargué mal"). No hay
  edición ni borrado de un pago del medio de la lista: las reglas no podrían
  verificar el resto.
- **Anulación.** Una venta `a_cobrar` se anula igual que cualquier otra
  (`anularVenta`); sus pagos quedan como estaban, por auditoría, y `estadoCobro`
  la devuelve `'anulada'`.
- **Cliente obligatorio.** Una venta `a_cobrar` exige cliente: `registrarVenta`
  lanza `ClienteRequeridoError` (`firebase-kit/src/errores.ts`) y la regla del
  create también (ver doc 07). Las estadísticas del cliente (`stats`) se
  actualizan igual que en cualquier venta, por el total.
- **Lectura.** `ventaConverter` (`firebase-kit/src/converters/venta.ts`) lee
  `cobro` ausente como `undefined`; una versión `v` distinta de 1 **lanza**
  `RangeError` en vez de degradarse a `undefined`, porque para `estadoCobro`
  ausente significa "cobrada" y mostrar saldada una deuda es peor que no poder
  leerla.
- **Restricción de precisión.** Las reglas comparan los pagos anteriores **por
  valor**, y el cliente los reenvía tal como los leyó el converter (`Date`, con
  precisión de milisegundos). Por eso los pagos los escribe solo el kit, desde el
  cliente: un pago escrito con microsegundos por otro medio (Admin SDK,
  `Timestamp` de servidor) haría que las reglas rechacen el pago **siguiente**
  de esa venta (`cobroADoc`, `converters/venta.ts`).

Reglas de Firestore (`apps/quesarte/firestore.rules`, sección "Cobros diferidos"
y `match /ventas`):

- **create** (usuario activo, como siempre): `ventaCobroCreateValido` restringe
  `medioPago` a los cinco valores. Si es `a_cobrar`: `clienteId` string
  obligatorio y `cobro` exactamente igual a `cobroInicial()`
  (`cobroInicialValido`). Si es otro medio: la venta **no** puede traer `cobro`.
- **Registrar un pago: solo admin** (`esAdmin() && ventaRegistraPago()`). La venta
  está `completada` y ya tiene `cobro`; el write solo cambia `cobro`
  (`soloCambian(['cobro'])`) y con exactamente las claves `v`, `estado`,
  `cobradoCents`, `pagos` (`ventaCobroUpdateComun`); la lista crece en uno, con
  tope 20; los pagos anteriores llegan intactos (prefijo de la lista);
  `pagoVentaValido` valida el pago nuevo (claves exactas, `montoCents` entero
  > 0, medio real, `fecha` y `registradoEn` timestamp, `usuarioId ==
  request.auth.uid`, topes de largo); `cobradoCents` es lo anterior más el monto
  y no supera `totalCents`; `cobroEstadoCoherente` exige `estado == 'cobrada'`
  si y solo si se cobró el total.
- **Deshacer el último pago: solo admin** (`ventaDeshaceUltimoPago`): el espejo.
  La lista se achica en uno, lo que queda es el prefijo de la lista vieja y
  `cobradoCents` baja exactamente el monto del pago quitado. Sacar un pago del
  medio, o más de uno, se rechaza.
- **Guarda de `[0:0]`.** El operador de rango de listas se evalúa distinto en el
  borde vacío: en el emulador, `l[0:0]` **no** devuelve `[]` sino que lanza
  "Index out of bound" y la regla deniega (fijado por
  `apps/quesarte/tests/rules/emulador-rango-lista-rules.test.ts`, con las reglas
  mínimas de `emulador-rango-lista.rules`). Sin guarda, el primer pago de toda
  venta (lista vacía) y el deshacer del único pago serían rechazados; por eso
  las dos funciones escriben `n == 0 || lista[0:n] == ...`. Si una versión
  futura del emulador cambia, ese test falla y avisa.
- **Anulación:** sin cambios (admin, `completada` → `anulada`, solo cambia
  `estado`). El vendedor no gana ninguna regla de update.

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
categorias/{id}            → { nombre, orden, clave }  // id === clave === trim+lowercase(nombre)
                                                       // vocabulario; producto referencia por nombre
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
                               nombreProducto, costeo?} ], totalCents,
                               medioPago ('efectivo'|'debito'|'credito'|'transferencia'|'a_cobrar'),
                               estado, clienteId?, clienteNombre?,
                               cobro? }   // solo ventas 'a_cobrar'; ver "Cobro diferido"
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
- `categorias`: lectura para todo usuario activo; create/update/delete solo admin.
  En create y update se exige además `categoriaId == request.resource.data.clave`:
  es la garantía estructural de unicidad de nombres (ver "Categoría"). El delete
  está abierto porque el renombrado que cambia de clave muda el documento de path.
- `rol == 'admin'`: todo.
- `movimientos`: prohibido update/delete (solo create).
- `ventas`: prohibido delete. Update solo admin y solo de tres formas: anulación
  (campo `estado`, con regla que valida la transición) y, en ventas `a_cobrar`,
  registrar o deshacer el último pago (campo `cobro`). Detalle en "Cobro
  diferido" (venta) y en `docs/11-cobros-diferidos.md`.

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
