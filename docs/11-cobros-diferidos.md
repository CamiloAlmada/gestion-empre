# 11 — Cobros diferidos y cuentas del negocio

Estado: **planificado, sin implementar** (2026-09-30). Diseño consultado con el
`advisor` (ver `.claude/advisor-log.md`, 2026-09-30). Antes de cerrar la Fase B
hay que hacerle a Adrián las preguntas de la última sección.

## El problema

La venta y el pago no ocurren al mismo tiempo. Le piden mercadería a Adrián y a
veces le transfieren días después. Hoy la venta guarda un `medioPago` fijo en el
momento de cobrar y es inmutable, así que no hay forma de registrar "me deben
esto" ni "ya me lo pagaron". Adrián necesita saber quién le pagó y quién no,
cuándo, por qué medio y a qué cuenta. Tiene varias cuentas (PREX y Santander;
últimamente casi todo entra por PREX).

## Decisión: el estado de cobro vive en la venta

La unidad de seguimiento es **la venta**, no una cuenta corriente por cliente.

- `MedioPago` suma el valor `'a_cobrar'`. Una venta nace `a_cobrar` cuando el
  cliente se lleva la mercadería sin pagar.
- Al registrar el cobro, `medioPago` pasa al medio real (efectivo, transferencia,
  débito, crédito) y se agrega un mapa `cobro` con los datos del pago.
- La presencia de `cobro` indica que la venta nació a cobrar y ya se cobró. Una
  venta cobrada en el mostrador no lo tiene (ni las ventas anteriores a esta
  feature).

Por qué así:

- Adrián pidió "quién pagó y quién no": es un estado binario por venta.
- Historial, Reportes y la ficha del cliente ya leen las ventas: el estado se ve
  sin lecturas extra ni joins.
- Marcar una venta cobrada es un `updateDoc` sin lecturas previas, compatible con
  el patrón offline de doc 06 §8.
- "Una transferencia pagó varias ventas" es un batch de N updates con la misma
  referencia, cuenta y fecha.

Descartado, con lo que se pierde:

- **Cuenta corriente por cliente** (saldo + movimientos). Doc 04 la difiere hasta
  que haya casos reales; además no dice qué venta se pagó, que es lo que Adrián
  pidió. Se pierden pagos parciales y el "está al día" agregado: si hacen falta,
  van en la Fase C sin migrar nada.
- **Colección `cobros` con el estado derivado** (venta intacta). Reportes e
  Historial tendrían que cruzar colecciones y "pendientes" no se podría filtrar
  por índice. Es lo que se agrega en la Fase C si aparecen pagos parciales.
- **Imagen del comprobante dentro de la venta.** Historial y Reportes cargan las
  ventas enteras: cada apertura bajaría decenas de MB en el celular.
- **Cloud Storage.** Desde el 2026-02-03 exige plan Blaze con tarjeta aunque el uso
  entre en la cuota gratuita, y las subidas no se encolan sin conexión.

## Modelo

`packages/core/src/tipos.ts`:

```ts
export type MedioPago = 'efectivo' | 'debito' | 'credito' | 'transferencia' | 'a_cobrar';

/** Ausente ⇔ cobrada en el acto (o legado). Presente ⇔ nació a_cobrar y ya se cobró. */
export interface CobroVenta {
  v: 1;
  fecha: Date;             // fecha real del pago, editable (default hoy)
  usuarioId: string;       // quién lo registró
  cuentaId?: string;       // configuracion/cuentas → id
  cuentaEtiqueta?: string; // denormalizado ("PREX ···1234"): sobrevive a la baja de la cuenta
  referencia?: string;     // número de operación o nota corta
}
// Venta: + cobro?: CobroVenta

export interface CuentaNegocio extends DatosPago {
  id: string;
  etiqueta: string;
  activa: boolean;
}
```

`packages/core/src/cobro.ts`: `estadoCobro(venta): 'cobrada' | 'pendiente' | 'anulada'`.
Es la **única** función que mira `medioPago === 'a_cobrar'`, con la misma
disciplina que `clasificarCosteo`. Una venta anulada da `anulada` aunque su medio
sea `a_cobrar`.

Cuentas del negocio: documento `configuracion/cuentas` (lista corta, solo admin
escribe), con el mismo patrón que `plantillasWhatsApp`. `DatosPago` ya existe para
proveedores y se reutiliza.

## Reglas (`apps/quesarte/firestore.rules`, `match /ventas`)

- **create:** `medioPago` restringido a los cinco valores; si es `a_cobrar`,
  `clienteId` es obligatorio (sin cliente no hay a quién reclamar); una venta no
  puede nacer con `cobro`.
- **update nuevo (usuario activo):** solo desde `completada` + `a_cobrar` hacia un
  medio real, cambiando únicamente `medioPago` y `cobro`, con `cobro` válido
  (`v == 1`, `fecha` timestamp, `usuarioId` del que escribe, strings acotados).
- **reverso (solo admin):** de cobrada a `a_cobrar`, borrando `cobro`, y solo si la
  venta ya tenía `cobro`. Una venta cobrada en el mostrador nunca puede volverse
  deuda.
- `match /configuracion/{id}`: una cláusula más, `id == 'cuentas' && cuentasValidas()`.
- Índice nuevo `ventas (estado ASC, medioPago ASC, fecha DESC)` para la lista de
  pendientes, en el mismo cambio que la query.

## Reportes

La ganancia y las ventas del período siguen contándose por fecha de venta, sin
cambios. Se agrega una card **"Pendiente de cobro: N ventas · $X"**. "Cobrado en
el período" (vista de caja) queda para la Fase C: necesita un índice sobre
`cobro.fecha` y nadie lo pidió todavía.

## Roadmap

### Fase A — "A cobrar" mínimo

Entregable: Adrián deja una venta a cobrar desde el POS y la marca cobrada desde
el detalle de la venta.

| # | Tarea | Agente | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| A1 | `core`: `'a_cobrar'`, `CobroVenta`, `Venta.cobro?`, `cobro.ts` con `estadoCobro` + tests | `semisenior` | — | `pnpm turbo test --filter=@gestion/core` verde; test de que una anulada `a_cobrar` da `anulada` |
| A2 | Reglas: create endurecido, transición de cobro, reverso admin + tests de reglas | `senior` | A1 | `pnpm test:rules` verde con al menos 8 casos nuevos (vendedor cobra ✓, vendedor revierte ✗, `a_cobrar` sin cliente ✗, update que toca `totalCents` ✗, reverso sin `cobro` ✗, `usuarioId` ajeno ✗, medio inventado ✗) |
| A3 | Converter + `marcarCobrada(db, ventas, datos)` (batch sin lecturas) + `revertirCobro` (admin) + tests | `senior` | A1 | El update lleva exactamente `{medioPago, cobro}`; ventas normales sin `cobro` (omitido, no `null`); ventas viejas se leen igual |
| A4 | `ModalCobro`: opción "A cobrar", deshabilitada sin cliente ("Elegí un cliente") | `semisenior` | A1 | Test: sin cliente el botón está deshabilitado; con cliente confirma `a_cobrar` |
| A5 | `DetalleVenta`: bloque "Pendiente de cobro" + modal "Registrar cobro" (medio, fecha, referencia) con patrón offline §8; badge en `ListaVentas` y en la ficha del cliente | `semisenior` | A3, A4 | Manual en dev: venta a cobrar → badge → registrar cobro sin red → toast → al reconectar queda cobrada. Test: el modal envía la fecha elegida |
| A6 | Doc 02 (Venta) y doc 07 (cobro diferido) | `semisenior` | A2 | Cita reglas y funciones por su nombre real, sin contenido inventado |

A1 primero; A2, A3 y A4 en paralelo; A2 y A3 van al mismo commit (lección de
`9896867`: nunca dejar reglas y kit desalineados en un commit intermedio).

### Fase B — Cuentas, lista "Por cobrar" y Reportes

| # | Tarea | Agente | Depende de | Criterio de aceptación |
|---|---|---|---|---|
| B1 | `configuracion/cuentas` (≤ 10 cuentas), reemplazo total al guardar, reglas, sección en Ajustes solo admin | `semisenior` | A | Reglas: vendedor lee ✓ / escribe ✗; shape inválido ✗. Alta y baja de "PREX" y "Santander" en Ajustes |
| B2 | Lista "Por cobrar": pendientes agrupados por cliente, multi-selección → un solo `marcarCobrada`; selector de cuenta si el medio es transferencia | `semisenior` | A5, B1 | Índice en el mismo commit; test: 3 ventas seleccionadas → un batch de 3 updates con la misma referencia |
| B3 | Card "Pendiente de cobro" en Reportes | `semisenior` | B2 | Reutiliza la query de B2; las anuladas no suman |
| B4 | Verificación sin conexión del "Registrar cobro" con el harness de captive portal | orquestador | B2 | El modal cierra en menos de 6 s con Firestore colgado |

Decisión de UX abierta para B2: dónde cuelga la lista (junto a Historial en el tab
Venta, o en Clientes). Se decide con Adrián usándolo.

### Fase C — condicional a lo que responda Adrián

No se planifica en detalle hasta tener las respuestas.

- **Captura del comprobante:** si la vuelve a mirar, colección aparte
  `comprobantes/{ventaId}` con la imagen comprimida en el celular (≤ 300 KB),
  tamaño acotado en reglas y carga solo desde el detalle. Sin Blaze y funciona sin
  conexión. Storage + Blaze (con presupuesto 50/90/100 %) solo si eso no alcanza.
- **Recordatorio por WhatsApp:** plantilla nueva de contexto "cobro" con `{monto}`
  sobre los links wa.me de doc 08.
- **Pagos parciales o pagos mixtos:** colección `cobros` con imputaciones a ventas;
  el mapa `cobro` de la venta pasa a ser un resumen.
- **Vista de caja** ("cobrado en el período").
- **Pedidos a domicilio** (doc 10): módulo aparte; "a cobrar" es su estado
  "entregado sin cobrar", así que la Fase A no lo bloquea.
- Conciliación automática con extractos de PREX: no.

## Preguntas para Adrián

Las marcadas con ★ cambian el diseño.

1. ★ ¿Te pagan en partes una misma venta?
2. ★ ¿Te pagan un mismo pedido mitad transferencia y mitad efectivo?
3. Cuando te pagan varios pedidos con una transferencia, ¿necesitás saber cuál
   pedido pagó o te alcanza con marcarlos todos?
4. ★ ¿Quién marca que un cliente pagó: solo vos, o también quien atienda?
5. ¿Cuántos días suelen tardar en pagarte, y qué hacés hoy cuando no pagan?
6. ★ La captura de la transferencia, ¿la volvés a mirar alguna vez, o te alcanza
   con el número de operación?
7. ★ ¿Alguna vez dejás algo a cobrar sin saber quién es el cliente?
8. PREX y Santander, ¿en pesos las dos, o alguna en dólares?
