# Plan activo

Estado de trabajo en curso. Lo mantiene el **orquestador** (sesión principal de
Claude Code): se actualiza después de cada tanda de delegación, no al final.

Este archivo es la memoria del plan. Si no está acá, no existe.

El historial de consultas al `advisor` va en `.claude/advisor-log.md`.
La Fase 3, ya cerrada y mergeada, quedó archivada en `docs/PLAN-ACTIVO.md`.

Convenciones:
- Cada tarea lleva agente asignado (`advisor` / `senior` / `semisenior` / `trainee`).
- Los criterios de aceptación son verificables (comando o comprobación concreta).
- Las decisiones de arquitectura se anotan con fecha y motivo; no se
  re-discuten sin evidencia nueva.

---

## Estado

Fases 0, 1, 1.5, 2 y 3 cerradas. Fase 3 (Reportes) mergeada en `main` como
`eaaf263` el 2026-07-27, desplegada y verificada en https://quesarte-uy.web.app.
La migración de canonicalización de categorías corrió en dev y en prod, y es
idempotente (0 operaciones al reejecutar).

## Abierto

| # | Tarea | Agente | Estado | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| R1 | **Reseteo operativo de producción** | persona, no agente | ⏸️ **a pedido** | Borra `ventas`, `movimientos`, `piezas`, `compras` y resetea contadores derivados. Las 5 decisiones del dueño están confirmadas (conservar clientes/usuarios/config, borrar compras en borrador, backups fuera del repo). Es el **último paso antes de entregarle el sistema a Adrián**: se corre cuando se entrega, no mientras se sigue probando. Con dry-run, backup y confirmación tipeada. |
| R2 | Revisión visual de Reportes en el celular | — | pendiente del dueño | Confirmar cómo se leen en la práctica la nota de cobertura, el cuadrante del ranking y el texto "Ganancia de lo que va del mes" |
| R3 | Unicidad de proveedores | varios | 🔄 **en curso**, ver abajo | Detalle en la sección R3 |

## R3 — Unicidad de proveedores (en curso, 2026-07-28)

Dos fichas "La Rural" parten en dos el historial de compras de ese proveedor.
`crearProveedor` no chequeaba nada.

### Decisión de arquitectura (advisor, llamadas 1 y 2 — no re-discutir)

**NO se transporta el patrón de id canónico de categorías.** Motivo: a un
proveedor lo referencian POR ID `Compra.proveedorId` y
`Producto.proveedorPrincipalId`, mientras que a una categoría la referencian por
NOMBRE denormalizado. Con id canónico un renombre sería una mudanza de path, y
las compras confirmadas —inmutables por reglas— quedarían apuntando a un id
inexistente, sin forma de arreglarlas. Además exige `allow delete`, y
`proveedores` tiene `allow delete: if false` a propósito.

En su lugar: id autogenerado y chequeo **best-effort** en `firebase-kit`
(leer → comparar → tirar). Tiene condición de carrera y no cubre al Admin SDK;
se acepta porque la colección es solo-admin y en la práctica hay un solo admin.

**Contrato en dos fases**, que es la parte no obvia: el chequeo obliga a leer
antes de escribir, y si la función esperara el ack del servidor, sin conexión no
resolvería nunca — ni el id ni el error de duplicado llegarían a la pantalla.
Entonces devuelve `{ proveedorId, sincronizacion }`: la fase 1 resuelve enseguida
(la lectura sale de caché, el id lo genera el cliente) y `sincronizacion` es el
ack. Así se preserva el patrón híbrido de escrituras offline (doc 06 §8) en vez
de romperlo.

**Correcciones del advisor a sí mismo:** su llamada 1 cerró con "chequear
`enLinea` ANTES de invocar `crearProveedor`". Era falso contra el código:
`Proveedores.tsx:143` dispara antes del chequeo **a propósito**, por §8. Al
recibir la evidencia lo retiró explícitamente en la llamada 2. El bug real no era
el orden sino el MENSAJE de `CompraPantalla.tsx:301` ("Necesitás conexión"), que
informa un fracaso mientras la escritura queda encolada y va a aterrizar: el
usuario reintenta al reconectar y ahí nace el duplicado.

**Decisión del orquestador (bloqueante 2 de la llamada 2):** un homónimo de un
proveedor INACTIVO también se bloquea, con mensaje que sugiere reactivarlo.
Recrear la ficha fragmenta justo el historial que la tarea protege.

### Tareas

| # | Tarea | Agente | Estado | Criterio de aceptación |
| --- | --- | --- | --- | --- |
| T1 | Contrato de dos fases + chequeo de duplicados en `firebase-kit` | `senior` | ✅ **hecha** | Verificado por el orquestador: 340 tests en firebase-kit (28 en `proveedores.test.ts`, de 5 que había), lint y build en verde. Diff revisado: el chequeo corre antes de escribir, `actualizarProveedor` excluye el propio id, y hay test de que `setDoc`/`updateDoc` no se llaman en ningún caso de error |
| T2 | Las tres pantallas al contrato nuevo + mostrar el duplicado | `semisenior` | ✅ **hecha** | Verificado por el orquestador: `pnpm turbo lint test build` 12/12 verde, 1820 tests en la app. Diff revisado en las tres pantallas. Se extendió `packages/ui/Input` con un prop `maxLength` opcional (fuera de las rutas del brief, pero necesario y sin romper nada; la regla de oro se respeta: el `Input` no importa Firebase, la constante se usa en `ModalProveedor` que vive en la app) |
| T3 | Documentar la variante del patrón (doc 06 §8) y la unicidad (doc 07) | `trainee` | ✅ **hecha**, tras una devolución | Alcance respetado (solo `docs/`, +70 líneas). Devuelta una vez por contenido inventado, ver abajo. Correcciones verificadas |

### Regresión entre T1 y T2 — cerrada

T1 dejó las tres pantallas compilando y con sus tests en verde (mockean
`firebase-kit`), pero **con el comportamiento roto**: `await escritura` resolvía
antes del ack, así que el toast de éxito era optimista y nadie manejaba
`sincronizacion` → unhandled rejection si el servidor rechazaba. Lo reportó el
propio `senior` en vez de taparlo, y por eso T1 y T2 fueron a un mismo commit
(`9896867`). Si se hubieran commiteado por separado, el repo habría quedado con
esa regresión viva en un commit intermedio.

### T3 devuelta una vez: qué falló y por qué importa

El `trainee` respetó el alcance pero **inventó contenido**, pese a que el brief
decía explícitamente que ante una duda parara y devolviera la tarea. Cinco
correcciones, de las cuales una era grave:

1. **Escribió que el servidor rechaza la escritura duplicada en una carrera.**
   Falso y contradice el diseño entero: `firestore.rules` tiene para
   `proveedores` solo `allow create, update: if esAdmin()`, sin validación
   ninguna. En una carrera las dos escrituras tienen ÉXITO y quedan dos
   duplicados — que es justo la limitación best-effort que el otro doc explica.
   El motivo real de encadenar el `catch` es que `sincronizacion` es una promesa
   ya en vuelo.
2. Mandaba a reactivar con `actualizarProveedor`, que explícitamente NO toca
   `activo`. La función es `reactivarProveedor`.
3. Citaba `doc 02 §8`, que no existe (categorías está en `### Categoría`, línea
   65). La decisión sobre acentos vive en `packages/core/src/categoria.ts:33-45`.
4. "funciones síncronas de validación" → son asíncronas, leen con `getDocs`.
5. Atribuía altas de proveedores a "la migración de datos", que no existe.

**Lección para futuros briefs a `trainee`:** las tareas de documentación son
mal candidato para ese perfil aunque parezcan mecánicas. Redactar exige decidir
cómo decir algo, y ahí es donde rellena huecos con plausibilidad. Si vuelve a
tocar, el brief tiene que darle el texto casi literal, o va a `semisenior`.

### Hallazgo del cierre: `actualizarProveedor` no puede BORRAR un campo

Encontrado por el `advisor` en la consulta de cierre y verificado por el
orquestador. **Es preexistente, no lo introdujo esta rama.**

`ModalProveedor.tsx:133-142` manda `telefono/email/notas/pagos: undefined`
cuando el admin vacía el campo. `copiarDatos` (`proveedores.ts:124-134`) omite
los `undefined`, así que nunca entran al `updateDoc` y **el valor viejo
persiste** — mientras el toast dice "Proveedor actualizado".

Con `pagos` es operativamente serio: una cuenta bancaria dada de baja sigue
mostrándose en la ficha "para copiar al transferir". Plata a la cuenta
equivocada.

El patrón para arreglarlo ya existe en el mismo paquete: `clientes.ts:150` hace
`cambios.telefonoE164 = e164 ?? deleteField()`. El bloqueante que planteó el
`advisor` (¿las reglas permiten `deleteField`?) se resuelve solo:
`match /proveedores` es `allow create, update: if esAdmin()` **sin `hasOnly`**,
así que pasa.

**Estado: ✅ arreglado** por `senior` en `2602f99`, a pedido del dueño.
48 tests en `proveedores.test.ts` (eran 28), 360 en el paquete, 12/12 verde en
el monorepo.

`actualizarProveedor` pasó a un **contrato de reemplazo total**: `datos` es la
foto completa de los campos editables, y un opcional ausente o vacío se traduce
a `deleteField()`. La precondición ("el caller manda siempre todo lo que quiere
conservar") se cumple porque el único caller es el modal, que es un formulario
de edición completo. `crearProveedor` NO cambió: ahí `undefined` sí significa
"campo ausente" y `deleteField()` sobre un documento inexistente sería un error.

"Sin cuentas" se persiste siempre como campo **ausente**, nunca como `pagos: []`.

**Arreglo adyacente que el `senior` incluyó sin que estuviera pedido, y que
correspondía**: el update no pasa por el converter y `init.ts` no setea
`ignoreUndefinedProperties`, así que serializar una cuenta con `titular` o
`moneda` ausentes rompía con "Unsupported field value: undefined" — el caso más
común del formulario. Sin eso el fix no funcionaba con el payload real.
Verificado por el orquestador: `init.ts:48` efectivamente no lo setea, y
`converters/proveedor.ts:37` hace la misma omisión en el alta.

### Mismo bug en CLIENTES — ✅ arreglado en `ed1ed6e`

Reportado por el `senior` como nota fuera de alcance y **verificado por el
orquestador**: `actualizarCliente` tiene exactamente el mismo defecto.

- `ModalCliente.tsx:45-54` precarga los datos del cliente para editarlo (su
  propio comentario dice "alta nueva o edición de un cliente puntual").
- `ModalCliente.tsx:66-70` manda `undefined` al vaciar `alias`, `telefono`,
  `email`, `direccion` o `notas`.
- `copiarContacto` (`clientes.ts`) los omite → el valor viejo sobrevive.

O sea: vaciar el teléfono o la dirección de un cliente no hace nada, y la
pantalla informa que se guardó.

Diferencia con proveedores: acá está **documentado como limitación deliberada**
en el JSDoc de `actualizarCliente` ("limpiar el teléfono display no lo modela
esta superficie, igual que en Fase 1.5"). Pero la UI ofrece la acción, así que
documentado no lo hace correcto — solo lo hace conocido.

Menos grave que en proveedores: no hay datos bancarios. Pero un teléfono viejo
que no se puede borrar sí importa, porque de ahí salen los links de WhatsApp
(doc 08).

**Arreglado por `senior` a pedido del dueño.** Tres diferencias con proveedores
hacían esta más delicada, y las tres se resolvieron:

1. **`telefonoE164` es derivado, y había una trampa.** Con reemplazo total,
   `cambios.telefono` está siempre definido (string o sentinela), así que la
   condición vieja le habría pasado un `FieldValue` a `normalizarTelefono` con un
   `as string` tapándole la boca a TypeScript. Se resolvió derivando el E164 del
   display recortado ANTES de armar el payload; el cast ya no existe. Vaciar el
   teléfono borra también su E164: uno huérfano seguiría generando links de
   WhatsApp a un número dado de baja.
2. **Las reglas de clientes SÍ validan shape** (`clienteClavesConocidas` usa
   `hasOnly`), a diferencia de proveedores. El `senior` lo **verificó contra el
   emulador** en vez de asumirlo: en un update `request.resource.data` es el
   documento resultante y un campo borrado no está, así que pasa. 4 tests de
   reglas nuevos (175 → 179), incluido el negativo de que el vendedor no puede
   borrar el teléfono.
3. **`stats` lo escribe el POS** y no se toca: hay test de las siete claves
   exactas del payload.

Se actualizó además el JSDoc de `actualizarProveedor`, que explicaba una
divergencia con `actualizarCliente` que después de este cambio ya no existe.

Verificado por el orquestador: `pnpm turbo lint test build --force` 12/12,
365 tests en firebase-kit (eran 360), 179 de reglas, 1820 en la app.

### Verificación manual pendiente (no bloquea el merge)

El `advisor` la dio por no bloqueante: el riesgo que introduce esta rama (la
lectura de la fase 1) está acotado por el fallback a caché del SDK, y el cuelgue
posible en `await sincronizacion` del camino online es la exposición §8 que ya
tienen Productos, Clientes y Precios en producción.

Procedimiento, para cuando se pruebe en el celular: DevTools → *request
blocking* sobre `firestore.googleapis.com`, con `navigator.onLine` en **true**
(NO el toggle de offline, que dispara `useOnlineStatus` y ejercita otro camino).
Tocar "Guardar" en el alta inline de proveedor. **Falla** si "Guardando…"
persiste más de ~15s sin toast ni error — ahí aplicaría el fallback
`getDocsFromCache` con timeout, que se decidió NO implementar preventivamente.
**Se acepta** si el spinner resuelve en segundos.

### Fuera de alcance, anotado

- ~~**Endurecer el shape de `proveedores` en `firestore.rules`**~~ → hecho, ver
  la sección R4 más abajo.
- `desactivarProveedor` / `reactivarProveedor` siguen con una sola promesa,
  asimétricos con las otras dos. No leen antes de escribir, así que no lo
  necesitan.

## R4 — Endurecer las reglas de proveedores (2026-07-29)

Commit `730089b` + los tres tests de cierre, en la rama `feat/reglas-proveedores`.
**Pendiente de push, que en este repo ES desplegar** (ver abajo).

`proveedores` era la colección menos validada del sistema: `allow create,
update: if esAdmin()` y nada más.

### Decisiones (advisor, llamadas 1 y 2 — no re-discutir)

**`pagos` es una lista de mapas y el lenguaje de reglas no itera.** No hubo que
inventar nada: el repo ya había resuelto esto en `plantillasWhatsAppValidas` —
tope de tamaño más validación del **primer elemento como representante**, con el
límite documentado en vez de disimulado. Se sigue ese precedente. Cubre
`pagos: ['basura']`, que es lo que rompe al converter, sin desenrollar un loop
arbitrario.

**La lista vacía se tolera a propósito**: `crearProveedor:246` pasa
`datos.pagos` sin normalizar, así que exigir `size() >= 1` rompería el alta en
producción. Verificado, no supuesto.

**`fechaAlta` inmutable** vía `soloCambian` con todo menos ese campo. **`activo`
sí entra**, porque `desactivar`/`reactivar` pasan por ese mismo update.

**No hay agujero en `soloCambian` con 9 claves**: `proveedorValido()` revalida el
documento RESULTANTE entero, así que ninguna clave permitida puede quedar con
tipo inválido.

### Lo que quedó en evidencia al endurecer

**Dos tests preexistentes que nunca fueron fieles a producción.** Escribían
`fechaAlta: Date.now()` —un número— cuando toda escritura real produce un
`Timestamp`: `crearProveedor` vía converter, y el seed de demo vía `haceDias`,
que devuelve un `Date`.

- Uno afirmaba que se podía crear un documento con una forma que el sistema
  nunca genera. Pasaba porque no había validación, no porque estuviera bien.
- El otro es peor y lo encontró el orquestador, no el agente: un `assertFails`
  de permisos que, con el shape ahora inválido, **habría seguido en verde aunque
  alguien abriera por accidente la escritura al vendedor** — que es exactamente
  lo que ese test existe para detectar. Un test negativo que pasa por la razón
  equivocada da confianza falsa.

El `semisenior` chocó con esto, **paró y lo reportó** en vez de relajar la regla
para que el test pasara. Era la decisión correcta: la regla venía del diseño
acordado y ablandarla sin consulta habría sido asumir.

### Los 19 `Date.now()` restantes: deuda CONDICIONADA, no pendiente

Quedan 19 en tests de otras colecciones. **No normalizarlos.** El `advisor`
corrigió un planteo del orquestador acá: para ventas, movimientos y compras el
número puede ser el shape REAL de producción, y convertirlos a `new Date()` sin
verificar colección por colección repetiría el mismo bug de infidelidad en
sentido inverso. Solo se vuelven deuda si esa colección endurece el tipo de
fecha.

### Auditoría previa al deploy — corrida y limpia

`apps/quesarte/scripts/auditar-proveedores.mjs`, solo lectura (verificado con
grep: ni un `set`/`update`/`delete`/`add`/`batch`). Recorre **todos** los
elementos de `pagos`, más estricto que las reglas, y valida
`fechaAlta instanceof Timestamp` (línea 142).

| Entorno | Documentos | Violaciones |
| --- | --- | --- |
| `quesarte-uy-dev` | 3 | 0 |
| `quesarte-uy` | 1 | 0 |

Era el bloqueante que levantó el `advisor`, y no era teórico: **un documento ya
guardado que violara el shape nuevo quedaría INEDITABLE para siempre**, y no se
descubre hasta que el dueño intenta corregir un teléfono y le rebota un
`permission-denied` opaco.

Correrla necesita credenciales: `GOOGLE_CLOUD_PROJECT=<proyecto> node
apps/quesarte/scripts/auditar-proveedores.mjs --project <proyecto>`.

### ⚠️ Pushear a `main` ES desplegar

`.github/workflows` corre `firebase deploy --only firestore --project
quesarte-uy` en el push a `main`. **No hay paso manual intermedio ni ventana
para arrepentirse.** Cualquier cambio futuro a `firestore.rules` hereda esto:
auditar primero, pushear después.

Verificación: 200 tests de reglas en verde (eran 179), corridos por el
orquestador contra el emulador.

## En espera de la elicitación con Adrián (doc 10)

No se implementan antes de esa sesión; el objetivo de la sesión es
repriorizarlos (docs/10b): pantalla de reporte de merma, proyección del mes,
próximo viaje / cobertura, preferencias de cliente.
