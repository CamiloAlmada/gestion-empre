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

### 🔴 Verificación de "red mentirosa" — CORRIDA, y FALLÓ (2026-07-29)

Corrida con Playwright contra el dev server y `quesarte-uy-dev`, con sesión de
admin iniciada por el dueño (el orquestador no ingresa credenciales).

**Método**: se parchearon `fetch` y `XMLHttpRequest` para que las requests a
`firestore.googleapis.com` **cuelguen** —ni respondan ni fallen—, dejando
`navigator.onLine` en `true`. Es la simulación fiel del captive portal, y es
justamente lo que el toggle de offline del navegador NO reproduce: ese dispara
`useOnlineStatus` y ejercita otro camino.

| Escenario | Resultado |
| --- | --- |
| Red mentirosa (2 requests colgadas) | **"Guardando…" a los 48s, nunca resolvió** |
| Control, sin bloqueo | **535 ms**, modal cerrado |

**Además, el supuesto 2 del `advisor` quedó confirmado y es peor de lo previsto:
los dos botones del modal están `disabled` mientras `guardando`** — "Cancelar"
incluido. El usuario no tiene ninguna salida: ni guarda, ni cancela, ni cierra.
Queda encerrado hasta recargar la página, perdiendo la compra a medio armar.

**Causa**: `crearProveedor` hace `await leerProveedores(db)` (un `getDocs`) antes
de escribir. Con la red muerta pero `onLine` en `true`, el SDK **no cae a caché**:
espera al servidor. El supuesto 1 del `advisor` en la llamada 2 —"`getDocs` cae a
caché cuando el backend es inalcanzable"— resultó **FALSO** en este escenario.

Nota: la escritura NUNCA llegó a dispararse, porque el cuelgue es en la fase 1,
antes del `setDoc`. O sea que no quedó un proveedor fantasma encolado.

**Arreglo intentado y resultado PARTIDO — ver R5 abajo.**

**Residuo del control**: el test creó el proveedor `Control Sin Bloqueo` en
`quesarte-uy-dev`. No se puede borrar desde el cliente (`allow delete: if
false`); hay que desactivarlo desde la app o borrarlo con Admin SDK.

### Procedimiento de la verificación (para repetirla)

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

## R5 — Fallback de la fase 1: la mitad funciona, la otra mitad NO (2026-07-29)

Rama `fix/fase1-red-mentirosa`. Dos arreglos en una tanda; medidos con el mismo
harness de Playwright que encontró el bug.

| Arreglo | Resultado medido |
| --- | --- |
| "Cancelar" habilitado durante el guardado | ✅ **funciona**: cierra el modal en 800 ms y libera `guardando` |
| Escalera `getDocs` → timeout 5s → `getDocsFromCache` → lista vacía | ⚠️ **inocua**: la fase 1 ya resolvía en 20 ms. Ver la corrección abajo |

### CORRECCIÓN: la escalera no era la culpable. El error de diagnóstico fue mío

La tabla de arriba dice "la escalera NO funciona". **Eso era una inferencia
equivocada del orquestador**, corregida el mismo día por un experimento que pidió
el `advisor`.

Lo que yo había medido: `guardando` sigue en `true` a los 502, 2012, 6525, 12543
y 20069 ms, y "el proveedor no queda seleccionado". De ahí concluí que la fase 1
no resolvía. **El segundo dato era un mal proxy** —el `advisor` lo marcó como
bloqueante: "cómo mide el harness la selección del proveedor; sin eso, tu tabla
no distingue A de B"—.

**El experimento que lo desempata**: un `console.log` con timestamp justo después
del `await crearProveedor(...)`.

```
clic:                          12929 ms
[EXPERIMENTO] fase 1 resuelta  12949 ms
```

**20 milisegundos.** La fase 1 resuelve casi instantáneamente.

**La causa raíz real** —diagnosticada por el `advisor`, que además señaló que era
un error propio de su llamada 1—: `CompraPantalla.tsx`, rama `enLinea === true`,
hace `await sincronizacion` antes de cerrar el modal. Bajo captive portal
`navigator.onLine` **miente y vale `true`**, así que se toma esa rama, el ack
nunca llega, y ni el `setModalProveedorAbierto(false)` ni el `finally` con
`setGuardandoProveedor(false)` se ejecutan jamás.

O sea: **aunque la escalera funcionara a la perfección, el modal se congelaba
igual**. El criterio de aceptación "modal cerrado en <6 s" era inalcanzable
tocando solo `firebase-kit`.

Lección para el orquestador: medir el síntoma visible (`guardando`) no localiza
la causa cuando hay dos esperas encadenadas. El log con timestamp en el punto
exacto costó dos minutos y decidió lo que tres corridas del harness no pudieron.

### Lo que sí se ganó

"Cancelar" es ahora una salida real, y eso convierte el defecto de *"el usuario
queda encerrado y pierde la compra"* en *"el spinner sigue, pero se puede
cancelar y seguir trabajando"*. Es una mejora sustantiva aunque la causa raíz
siga viva.

El `senior` agregó por su cuenta algo que no estaba en el brief y sin lo cual el
arreglo no cerraba: **bajar `guardando` al cancelar**. Sin eso, como el
`await sincronizacion` del camino online no resuelve nunca, el `finally` jamás
corre y el modal quedaba con "Guardar" deshabilitado para siempre en el intento
siguiente.

### Hallazgo del `senior`: hay un TERCER caller sin flag

`DetalleProveedorPantalla.tsx:286` usa `ModalProveedor` para la edición, con
`onCerrar={cerrarModal}` pelado. "Cancelar" ahí quedó habilitado pero sin flag de
cancelación: si el ack no llega, `guardando` queda en `true` para siempre y el
próximo "Editar" abre con "Guardar" deshabilitado. **Preexistente** (el modal ya
cerraba con Escape y backdrop sin mirar `guardando`). Verificado por el
orquestador. Pendiente: replicar ahí las ~15 líneas de `Proveedores.tsx`.

### ✅ RESUELTO — verificado en el navegador (2026-07-29)

| Criterio | Antes | Después |
| --- | --- | --- |
| Modal cierra bajo captive portal (umbral <6 s) | **nunca** (48 s+) | **204 ms** |
| `guardando` liberado | no | sí |
| Proveedor queda elegido en la compra | — | sí |

**Lección de medición, que costó tres corridas del harness:** el selector de
proveedor es un `<input>`, y **los valores de input NO aparecen en
`innerText`**. Mi chequeo "¿el proveedor quedó seleccionado?" era ciego por
construcción, y de ahí salió el diagnóstico equivocado de que la fase 1 colgaba.
Para medir estado de formularios hay que leer `.value` del elemento, no el texto
de la página.

### Lo que se hizo (advisor, post-mortem)

Dos cambios, y **ninguno alcanza solo**:

1. **El caller deja de esperar el ack para cerrar el modal.** Sacar el
   `await sincronizacion` como condición de cierre (`CompraPantalla.tsx`, rama
   online). Tras la fase 1: seleccionar proveedor, cerrar modal, y colgar el
   toast de éxito o fracaso del ack en background. `enLinea` puede elegir el
   TEXTO del toast, nunca decidir si la UI espera un ack.
2. **Sacar la lectura del SDK del camino crítico.** Borrar `leerProveedores`,
   `conTimeout` y `TIMEOUT_LECTURA_PROVEEDORES_MS`; `crearProveedor` y
   `actualizarProveedor` reciben `existentes: readonly Proveedor[]` y el caller
   pasa la lista de la suscripción `useCollection` que **ya tiene**. Los datos de
   una suscripción son estrictamente mejores que "caché o lista vacía": llegan al
   instante e incluyen las escrituras locales pendientes.

Beneficio lateral del punto 2: el chequeo de duplicados vuelve a ser lógica pura
y se testea **sin mockear Firebase**, así que el mock deja de poder mentir.

**Los 9 tests de la escalera se borran con el código que testean.** No se
reescriben ni se les deja advertencia. La lección no es que estuvieran mal
escritos: es que **ningún unit test con el SDK mockeado puede validar el
acoplamiento entre llamadas dentro del SDK real**. El harness de captive portal
es EL test de aceptación de cualquier cambio en caminos de red degradada.

### Dos reglas que salen de esto, para todo el repo

1. **Ninguna lectura a demanda del SDK en el camino crítico de una escritura con
   UI esperando.** Los datos de validación salen de suscripciones ya en memoria.
2. **`navigator.onLine` / `enLinea` nunca decide si se bloquea la UI sobre un
   ack.** Solo elige textos.

### Auditoría pendiente por la regla 1

`packages/firebase-kit/src/categorias.ts` (líneas ~69, 94, 143, 163) tiene el
mismo patrón `getDocs`-antes-de-escribir, **y sin timeout**. Bajo captive portal,
crear o renombrar una categoría se congela igual. Misma medicina: la pantalla de
Ajustes tiene su lista suscrita.

## En espera de la elicitación con Adrián (doc 10)

No se implementan antes de esa sesión; el objetivo de la sesión es
repriorizarlos (docs/10b): pantalla de reporte de merma, proyección del mes,
próximo viaje / cobertura, preferencias de cliente.
