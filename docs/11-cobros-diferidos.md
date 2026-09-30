# 11 — Cobros diferidos y cuentas del negocio

Estado: **Fase A en curso** (2026-09-30). Diseño consultado con el `advisor` en
dos llamadas (ver `.claude/advisor-log.md`, 2026-09-30). La segunda corrigió la
primera después de las respuestas de Adrián: el cobro pasó de un mapa único a
una lista de pagos.

## El problema

La venta y el pago no ocurren al mismo tiempo. Le piden mercadería a Adrián y a
veces le transfieren días después. Hoy la venta guarda un `medioPago` fijo en el
momento de cobrar y es inmutable, así que no hay forma de registrar "me deben
esto" ni "ya me lo pagaron". Adrián necesita saber quién le pagó y quién no,
cuándo, por qué medio, a qué cuenta y por cuánto. Tiene varias cuentas (PREX y
Santander; últimamente casi todo entra por PREX).

## Respuestas de Adrián (2026-09-30)

- **Pagos parciales:** "quizás sí": el modelo los soporta desde el día 1, la UI de
  la Fase A no los ofrece todavía.
- **Quién registra un cobro:** solo Adrián (rol admin).
- **Qué se registra:** número de operación, día, hora, cliente y monto. La captura
  del comprobante queda para después.
- **Venta a cobrar sin cliente:** nunca.

## Decisión: una lista de pagos dentro de la venta

La unidad de seguimiento es **la venta**, no una cuenta corriente por cliente.

- `MedioPago` suma el valor `'a_cobrar'`. Una venta que el cliente se lleva sin
  pagar nace con `medioPago: 'a_cobrar'` y ese valor **no cambia nunca**: dice cómo
  se cerró en el mostrador.
- La venta a cobrar lleva un mapa `cobro` con la lista de pagos recibidos, lo
  cobrado hasta ahora y un estado (`pendiente` o `cobrada`). **El medio real vive
  en cada pago**, porque con pagos parciales de medios distintos no existe "el
  medio" de la venta.
- Las ventas cobradas en el mostrador no tienen `cobro` (ni las ventas anteriores
  a esta feature).

Por qué así:

- Adrián pidió saber quién pagó y quién no: el estado vive en la venta que ya leen
  Historial, Reportes y la ficha del cliente, sin joins.
- Registrar un pago es un update sin lecturas previas (la venta ya está en
  pantalla), compatible con el patrón offline de doc 06 §8.
- Pagos parciales: una lista soporta el segundo pago sin cambiar el tipo
  persistido. Un mapa único con monto habría obligado a migrar.
- "Una transferencia pagó varias ventas" es un batch de N updates con la misma
  referencia y fecha.

Descartado, con lo que se pierde:

- **Cuenta corriente por cliente** (saldo + movimientos). Doc 04 la difiere hasta
  que haya casos reales, y no dice qué venta se pagó, que es lo que Adrián pidió.
- **Colección `cobros` aparte.** Historial, Reportes y la ficha del cliente
  tendrían que cruzar colecciones, y haría falta igual un resumen en la venta para
  filtrar pendientes. Si algún día hace falta trazar una transferencia como
  entidad, la `referencia` compartida entre pagos ya la reconstruye.
- **Mapa único `cobro` que pisa `medioPago` con el medio real** (el diseño de la
  primera consulta): obligaba a migrar al primer pago parcial.
- **Borrar un pago del medio de la lista:** las reglas no lo pueden verificar.
  Alcanza con deshacer el último, para el caso "lo cargué mal".
- **Imagen del comprobante dentro de la venta:** cada apertura de Historial o
  Reportes bajaría decenas de MB en el celular.
- **Cloud Storage:** desde el 2026-02-03 exige plan Blaze con tarjeta aunque el uso
  entre en la cuota gratuita, y las subidas no se encolan sin conexión.

## Modelo

`packages/core/src/tipos.ts`:

```ts
export type MedioPagoReal = 'efectivo' | 'debito' | 'credito' | 'transferencia';
export type MedioPago = MedioPagoReal | 'a_cobrar';

export interface PagoVenta {
  id: string;
  fecha: Date;             // fecha y hora del pago (del comprobante), editables; default ahora
  registradoEn: Date;      // cuándo se cargó, no editable (auditoría)
  montoCents: Money;
  medioPago: MedioPagoReal;
  usuarioId: string;       // quién lo registró
  referencia?: string;     // número de operación
  cuentaId?: string;       // configuracion/cuentas → id (UI recién en Fase B)
  cuentaEtiqueta?: string; // denormalizado ("PREX ···1234"): sobrevive a la baja de la cuenta
}

export interface CobroVenta {
  v: 1;
  estado: 'pendiente' | 'cobrada';
  cobradoCents: Money;
  pagos: PagoVenta[];
}
// Venta: + cobro?: CobroVenta   (ausente ⇔ cobrada en el acto, o venta anterior)

export interface CuentaNegocio extends DatosPago {
  id: string;
  etiqueta: string;
  activa: boolean;
}
```

Una venta a cobrar nace con `cobro = { v: 1, estado: 'pendiente', cobradoCents: 0,
pagos: [] }`: sin ese valor inicial, la consulta de pendientes no la encontraría.

`packages/core/src/cobro.ts`, funciones puras con tests:

- `cobroInicial()`.
- `aplicarPago(cobro, pago, totalCents)`: agrega el pago, suma y recalcula el
  estado; lanza si el monto es ≤ 0 o si lo cobrado superaría el total.
- `deshacerUltimoPago(cobro, totalCents)`: recalcula el estado contra el total.
- `saldoPendienteCents(venta)`.
- `estadoCobro(venta): 'cobrada' | 'pendiente' | 'parcial' | 'anulada'`: la **única**
  función que interpreta `venta.cobro`, con la misma disciplina que
  `clasificarCosteo`. `'parcial'` existe desde la Fase A aunque la UI todavía no
  la produzca.

Cuentas del negocio: documento `configuracion/cuentas` (lista corta, solo admin
escribe), con el mismo patrón que `plantillasWhatsApp`. `DatosPago` ya existe para
proveedores y se reutiliza.

## Reglas (`apps/quesarte/firestore.rules`, `match /ventas`)

- **create** (usuario activo, como hoy): `medioPago` restringido a los cinco
  valores. Si es `a_cobrar`: `clienteId` obligatorio y `cobro` igual al valor
  inicial. Si no: sin `cobro`.
- **registrar pago** (solo admin): la venta está completada y tiene `cobro`; solo
  cambia `cobro`; la lista crece en uno (máximo 20) y los pagos anteriores quedan
  intactos; el pago nuevo tiene shape válido (monto entero > 0, medio real, fecha
  y registro como timestamp, `usuarioId` del que escribe, referencia acotada);
  `cobradoCents` es lo anterior más el monto, sin superar el total, y el estado es
  coherente con la suma.
- **deshacer último pago** (solo admin): el espejo del anterior.
- **anulación:** sin cambios. El vendedor no gana ninguna regla nueva.
- `match /configuracion/{id}`: una cláusula más, `id == 'cuentas' && cuentasValidas()`.

La verificación de "pagos anteriores intactos" usa rangos de lista en las reglas
(`pagos[0:n] == anterior`). Hay que comprobar en el emulador que funciona antes de
escribir la regla definitiva; es el primer paso de la tarea A2.

## Reportes

La ganancia y las ventas del período siguen contándose por fecha de venta, sin
cambios. En la Fase B se agrega una card **"Pendiente de cobro: N ventas · $X"**,
que suma `totalCents - cobro.cobradoCents` de las ventas pendientes. "Cobrado en
el período" (vista de caja) queda para la Fase C.

## Roadmap

### Fase A — "A cobrar" y registrar pagos

Entregable: Adrián deja una venta a cobrar desde el POS y registra el pago desde
el detalle de la venta.

| # | Tarea | Agente | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| A1 | `core`: tipos + `cobro.ts` con las cinco funciones + tests | `semisenior` | — | `pnpm turbo test --filter=@gestion/core` verde; tests de sobrepago rechazado, `parcial`, anulada con pagos → `anulada`, deshacer sobre lista vacía lanza |
| A2 | Reglas: primero comprobar rangos de lista en el emulador; después create, registrar pago y deshacer último + tests de reglas | `senior` | A1 | `pnpm test:rules` verde con al menos 12 casos nuevos (vendedor registra ✗, admin ✓, `a_cobrar` sin cliente ✗, create con `cobro` y medio real ✗, `a_cobrar` sin valor inicial ✗, sobrepago ✗, suma mal ✗, estado incoherente ✗, pagos anteriores alterados ✗, `usuarioId` ajeno ✗, deshacer último ✓, deshacer del medio ✗) |
| A3 | Kit: `registrarVenta` exige cliente para `a_cobrar` y escribe el valor inicial; `registrarPago`, `registrarPagos` (batch, cada venta recibe su saldo) y `deshacerUltimoPago`; converter | `senior` | A1 | El update lleva exactamente `{ cobro }` calculado con core; `cobro` omitido en ventas normales; ventas viejas se leen igual. Mismo commit que A2 |
| A4 | `ModalCobro`: opción "A cobrar", deshabilitada sin cliente ("Elegí un cliente") | `semisenior` | A1 | Test: sin cliente el botón está deshabilitado; con cliente confirma `a_cobrar` |
| A5 | `DetalleVenta` (solo admin): saldo + modal "Registrar pago" (monto = saldo, bloqueado; medio; fecha y hora; referencia) + "Deshacer último pago", con patrón offline §8. Badge por `estadoCobro` en `ListaVentas` y en la ficha del cliente ("Debe $X"). Aviso al anular una venta con pagos | `semisenior` | A3, A4 | Manual en dev: venta a cobrar → badge → registrar pago sin red → toast → al reconectar queda cobrada. Test: el modal envía la fecha elegida |
| A6 | Docs 02 (Venta) y 07 (cobro diferido) | `semisenior` | A2 | Cita reglas y funciones por su nombre real, sin contenido inventado |

A1 primero; A2+A3 (un mismo `senior`, un mismo commit) y A4 en paralelo; después
A5 y A6. No hace falta índice nuevo en la Fase A.

### Fase B — Cuentas, lista "Por cobrar" y Reportes

| # | Tarea | Agente | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| B1 | `configuracion/cuentas` (≤ 10 cuentas), reemplazo total al guardar, reglas, sección en Ajustes | `semisenior` | A | Reglas: vendedor lee ✓ / escribe ✗; shape inválido ✗. Alta y baja de "PREX" y "Santander" |
| B2 | Lista "Por cobrar": pendientes agrupados por cliente, multi-selección → `registrarPagos`; selector de cuenta si el medio es transferencia | `semisenior` | A5, B1 | Índice `ventas (estado, cobro.estado, fecha DESC)` en el mismo commit; test: 3 ventas seleccionadas → un batch de 3 updates con la misma referencia |
| B3 | Card "Pendiente de cobro" en Reportes | `semisenior` | B2 | Reutiliza la query de B2; las anuladas no suman |
| B4 | Verificación sin conexión del registro de pago con el harness de captive portal | orquestador | B2 | El modal cierra en menos de 6 s con Firestore colgado |

Decisión de UX abierta para B2: dónde cuelga la lista (junto a Historial en el tab
Venta, o en Clientes). Se decide con Adrián usándolo.

### Fase C — más adelante

- **Pagos parciales en la UI:** habilitar el campo monto del modal y mostrar el
  badge "parcial". El modelo y las reglas ya los soportan.
- **Captura del comprobante:** colección aparte `comprobantes/{ventaId}` con la
  imagen comprimida en el celular (≤ 300 KB), tamaño acotado en reglas y carga
  solo desde el detalle. Sin Blaze y funciona sin conexión. Storage + Blaze (con
  presupuesto 50/90/100 %) solo si eso no alcanza.
- **Recordatorio por WhatsApp:** plantilla nueva de contexto "cobro" con `{monto}`
  sobre los links wa.me de doc 08.
- **Vista de caja** ("cobrado en el período").
- **Pedidos a domicilio** (doc 10): módulo aparte; "a cobrar" es su estado
  "entregado sin cobrar".
- Conciliación automática con extractos de PREX: no.

## Preguntas abiertas para Adrián

1. Cuando te pagan varios pedidos con una transferencia, ¿necesitás saber cuál
   pedido pagó o te alcanza con marcarlos todos?
2. ¿Cuántos días suelen tardar en pagarte, y qué hacés hoy cuando no pagan?
3. PREX y Santander, ¿en pesos las dos, o alguna en dólares?
