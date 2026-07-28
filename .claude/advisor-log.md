# Log de consultas al advisor

El `advisor` **no recuerda sus consultas previas**: cada invocación arranca en
frío y puede contradecirse a sí mismo sin notarlo. Este archivo es esa memoria,
y vive acá —no en el contexto de la sesión— para sobrevivir a una compactación.

Lo mantiene el orquestador. Se escribe **inmediatamente después** de cada
respuesta del `advisor`, no al final de la tarea.

A partir de la segunda llamada de una tarea, el brief abre con el bloque
CONSULTAS PREVIAS armado desde acá (ver `CLAUDE.md`, «Protocolo del advisor»).

Formato de cada entrada:

```
## <tarea> — llamada <N> (<temprano | cierre | trabado | desempate | post-mortem>)
Fecha: AAAA-MM-DD

**Se le preguntó:** una o dos frases.

**RECOMENDACIÓN:** textual, sin parafrasear.
**SUPUESTOS:** textual.
**BLOQUEANTES:** textual.

**Qué se hizo después:** qué se implementó, qué se descartó y por qué.
**Divergencias:** en qué difiere lo hecho de lo que el advisor asumió.
```

Textual, no parafraseado: el objetivo es que el `advisor` reciba de vuelta sus
propias palabras y pueda detectar si se está contradiciendo.

---

## R3 unicidad de proveedores — llamada 1 (temprano)
Fecha: 2026-07-28

**Se le preguntó:** si el patrón de id canónico de categorías es transportable a
`proveedores`, dado que a un proveedor lo referencian por id `Compra.proveedorId`
y `Producto.proveedorPrincipalId`, que las compras confirmadas son inmutables por
reglas, y que `proveedores` tiene `allow delete: if false`.

**RECOMENDACIÓN:** "No transportes el id canónico. Mantené el id autogenerado y
poné la garantía en `firebase-kit`: `crearProveedor` y `actualizarProveedor` leen
la colección, comparan con `claveCategoria`-style desde `core` (extraer un
`claveNombre` compartido o duplicar el trim+toLowerCase), y tiran
`ProveedorDuplicadoError`. Renombrar = update in-place de `nombre`, sin mover
documento. En la misma tanda, arreglá el orden del inline: chequear `enLinea`
ANTES de invocar `crearProveedor`."

**SUPUESTOS:** (1) `Proveedores.tsx` también gatea el alta por `enLinea`, o es
aceptable que el chequeo lea de caché offline vieja — no leyó ese archivo.
(2) La colección es chica, leerla entera en cada alta es barato. (3) El chequeo
en `actualizarProveedor` debe excluir al propio proveedor. (4)
`Compra.proveedorNombre` denormalizado es foto histórica y no se propaga en
renombres. (5) El fix del inline no rompe tests existentes. (6) No hay un tercer
camino de alta (seed) que necesite el chequeo.

**BLOQUEANTES:** (1) ¿`Proveedores.tsx` gatea por `enLinea`? Sin eso el chequeo
es ciego offline. (2) ¿`exigirNombre` debe validar largo máximo? (3) ¿Se
aprovecha para endurecer el shape en `firestore.rules` (`allow create, update: if
esAdmin()` sin validar nada)? Recomienda que sí, como ítem separado.

**Qué se hizo después:** nada todavía. Se fue a buscar la respuesta a los tres
bloqueantes al repo, que es lo que corresponde antes de implementar.

**Divergencias:** el supuesto (5) y la parte final de la recomendación resultaron
FALSOS contra el código. `Proveedores.tsx:143-152` dispara `crearProveedor` antes
del chequeo A PROPÓSITO: es el patrón híbrido de escrituras offline del proyecto
(docs/06-ui-ux.md §8) y avisa "Guardado sin conexión. Se sincronizará al
reconectar". Mover la llamada después del chequeo rompería offline-first. El bug
real de `CompraPantalla.tsx:297` no es el orden sino el MENSAJE: usa el mismo
patrón pero dice "Necesitás conexión", o sea informa un fracaso mientras la
escritura queda encolada y va a aterrizar. Se replantea en la llamada 2.

## R3 unicidad de proveedores — llamada 2 (bloqueantes resueltos + plan)
Fecha: 2026-07-28

**Se le preguntó:** los tres bloqueantes de la llamada 1 respondidos con
evidencia, el conflicto explícito entre su cierre ("chequear `enLinea` ANTES") y
el patrón §8, y el plan de tareas delegables.

**RECOMENDACIÓN:** "Retiro el cierre de mi llamada 1 ('chequear `enLinea` ANTES
de invocar'): contradice el patrón documentado en `docs/06-ui-ux.md` §8, que yo
no había visto. Para el inline, opción 1, habilitada por un contrato en dos fases
en `firebase-kit`: `crearProveedor` valida nombre, chequea duplicados (lectura
que offline resuelve de caché) y devuelve `{ proveedorId, sincronizacion }`,
donde `sincronizacion` es el ack del `setDoc`. `actualizarProveedor` igual,
excluyendo su propio id. Las tres pantallas awaitean la fase 1 —id y error de
duplicado disponibles aun offline— y aplican §8 sobre `sincronizacion`. Largo
máximo: 120 caracteres. Reglas: tanda aparte."

Plan: T1 `senior` (contrato en dos fases en firebase-kit, sin dependencias),
T2 `semisenior` (las tres pantallas, bloqueada por T1), T3 `trainee` (docs +
verificación, la parte de docs en paralelo con T2).

**SUPUESTOS:** (1) `getDocs` offline resuelve de caché sin colgarse. (2) La
caché tiene la colección completa porque las pantallas la suscriben; asume que
`CompraPantalla` también. (3) No hay callers fuera de las tres pantallas.
(4) Un duplicado contra un proveedor INACTIVO sí cuenta como duplicado.
(5) El límite 120 es elección suya sin dato real. (6) `proveedorConverter` tolera
los docs del seed.

**BLOQUEANTES:** (1) El supuesto 1 es el único que puede invalidar la UX: si con
"red mentirosa" `getDocs` cuelga la fase 1, el spinner queda colgado. El
experimento va en la aceptación de T2; fallback `getDocsFromCache` con timeout,
pero NO implementarlo preventivamente. (2) Confirmar el punto 4 (duplicado contra
inactivo) antes de delegar, porque cambia el test de T1.

**Qué se hizo después:** verificado supuesto 2 —`CompraPantalla.tsx:129-133`
suscribe la colección con `useCollection`— y supuesto 3 —los callers son
exactamente tres: `Proveedores.tsx:143`, `CompraPantalla.tsx:298` y
`DetalleProveedorPantalla.tsx:117`—. Bloqueante 2 resuelto por el orquestador:
**el duplicado contra un inactivo SÍ se bloquea**, con mensaje que sugiere
reactivar. Recrear la ficha de un proveedor inactivo fragmenta exactamente el
historial que la tarea busca proteger, y reactivar es un clic. Se delega T1.

**Divergencias:** ninguna nueva. El `advisor` corrigió su propia recomendación al
recibir la evidencia del §8, que es el comportamiento buscado.

## R3 unicidad de proveedores — llamada 3 (cierre)
Fecha: 2026-07-28

**Se le preguntó:** con T1/T2/T3 ya commiteadas (`9896867`, `de0590f`), qué tiene
de malo lo que existe: invariante sin test, caso de borde, regla de oro rozada,
si las cuatro divergencias son errores, y veredicto sobre su bloqueante 1 (el
experimento de "red mentirosa", que no se corrió).

**RECOMENDACIÓN:** "Mergeá después de un solo fix: `actualizarProveedor` no puede
**borrar** un campo. `ModalProveedor` manda `telefono/email/notas/pagos:
undefined` cuando el admin los vacía, y `copiarDatos` los omite del `updateDoc` —
el valor viejo persiste y el toast dice 'Proveedor actualizado'. Usá el patrón
que ya existe en `clientes.ts:150` (`deleteField()`), con test. El bloqueante 1
**no bloquea el merge**: queda como verificación manual con el síntoma de abajo.
Las cuatro divergencias son adaptaciones razonables; ninguna es error."

**SUPUESTOS:** (1) El bug de borrado es preexistente, pero esta tanda reescribió
la función y le fijó test solo al camino aditivo, así que ahora es deuda de esta
rama. (2) `Modal` de `packages/ui` no permite cerrar con Escape mientras
`guardando`; no leyó `Modal.tsx`. (3) Que el ack rechace en el camino online del
inline deja la compra apuntando a un `proveedorId` revertido; tolerable porque
solo pasa por denegación de reglas a un admin. (4) Que "Reglas: tanda aparte"
sigue anotado en `.claude/plan.md`. (5) El mock de `getDocs` que resuelve siempre
es un supuesto del test, no verificación de que la fase 1 resuelva offline: esa
garantía la da el SDK, no el código propio.

**BLOQUEANTES:** (1) Confirmar que `firestore.rules` permite `update` con
`deleteField` (algunas validaciones con `hasOnly` lo rechazan). (2) Síntoma de la
verificación manual: DevTools → *request blocking* sobre `firestore.googleapis.com`
con `navigator.onLine` en true (NO el toggle offline, que dispara
`useOnlineStatus`). Falla si "Guardando…" persiste más de ~15s sin toast; se
acepta si el spinner resuelve en segundos.

**Qué se hizo después:** verificado el bug leyendo el código —`ModalProveedor`
manda `undefined` (líneas 133-142), `copiarDatos` lo omite, `clientes.ts:150`
tiene el `deleteField()` a copiar—. Su bloqueante 1 se resuelve solo:
`match /proveedores` es `allow create, update: if esAdmin()` **sin `hasOnly`**,
así que `deleteField` pasa. Su supuesto 4 es correcto: el endurecimiento de
reglas está anotado en el plan. El fix queda como decisión del dueño: es
preexistente y excede "unicidad de proveedores".

**Divergencias:** ninguna. El hallazgo es adyacente a la tarea, no una objeción a
lo implementado — las cuatro divergencias las aprobó explícitamente.
