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

---

## R4 endurecer las reglas de proveedores — llamada 1 (temprano)
Fecha: 2026-07-28

**Se le preguntó:** cómo validar el shape de `proveedores` en `firestore.rules`,
con dos problemas concretos: (a) `pagos` es un array de MAPAS y el lenguaje de
reglas no tiene iteración; (b) si conviene hacer `fechaAlta` inmutable en los
updates.

**RECOMENDACIÓN:** "Para `pagos`: el patrón `plantillasWhatsApp` ya existente —
`pagos is list && size() <= 10 && (size() == 0 || pagoValido(pagos[0]))`, con
`pagoValido(p)` espejo de `plantillaWhatsAppValida`. Para el resto: una
`proveedorValido()` compartida (`hasOnly` de las 10 claves,
`hasAll(['nombre','fechaAlta','activo'])`, `nombre` string 1–120, `activo is
bool`, `fechaAlta is timestamp`, opcionales `is string` si presentes). Create
agrega `activo == true`; update agrega `soloCambian([todo menos fechaAlta])`, que
hace `fechaAlta` inmutable."

Plan: T1 reglas + T2 tests (`semisenior`, secuenciales), T3 auditoría de docs
existentes (`trainee`, en paralelo, **bloquea el deploy**), T4 cierre.

**SUPUESTOS:** (1) El modal puede mandar `pagos: []` en el alta; no leyó el
componente, por eso la regla tolera lista vacía. (2) `affectedKeys()` incluye las
claves eliminadas con `deleteField()`; hay que confirmarlo contra el emulador.
(3) 10 es tope suficiente de cuentas. (4) Ningún proveedor YA persistido viola el
shape nuevo. (5) `fechaAlta` se escribe siempre como Timestamp real, nunca
`serverTimestamp()`.

**BLOQUEANTES:** (1) El supuesto 4: auditar los docs existentes en dev y prod
antes de deployar. Un doc legado con claves extra dejaría al admin sin poder
editarlo NUNCA MÁS — el falso positivo que más importa evitar. (2) Confirmar el
supuesto 2 contra el emulador; queda cubierto si el test del update de reemplazo
total se escribe primero.

**Qué se hizo después:** verificado el precedente `plantillasWhatsAppValidas`
(`firestore.rules`), que es exactamente como lo describió: representante en el
primer elemento, tope de 20, y `size() == 0 ||`. Verificado también que
`crearProveedor:246` pasa `pagos: datos.pagos` SIN normalizar, así que tolerar
`[]` es correcto y no teórico. Se delega T1+T2 y T3 en paralelo.

**Divergencias:** una imprecisión menor suya: citó `usuarioUpdateValido` usando
`soloCambian` para hacer inmutable el `email`, y eso no existe en el repo —
`soloCambian` se usa en stats, categorías, productos, piezas y ventas—. No
cambia la recomendación: el mecanismo está bien precedentado igual.

## R4 endurecer las reglas de proveedores — llamada 2 (cierre)
Fecha: 2026-07-29

**Se le preguntó:** con las reglas y 18 tests ya commiteados (`730089b`) y la
auditoría corrida limpia en los dos entornos, si alguna escritura legítima puede
quedar rechazada en un caso no cubierto, si `soloCambian` con 9 claves abre algún
agujero, qué hacer con los 19 `Date.now()` restantes, y el veredicto para
desplegar —recordando que pushear a `main` ES desplegar las reglas a producción—.

**RECOMENDACIÓN:** "Pusheá. El endurecimiento es correcto y las tres escrituras
legítimas están cubiertas: create completo y mínimo, reemplazo total con
`deleteField()`, y toggle de `activo` sobre un doc auditado. Antes o después del
push (no bloquea), delegá al trainee tres tests que faltan: (a) vendedor NO
actualiza proveedores —único verbo sin negativo de permiso en el describe—, (b)
create de admin con `fechaAlta: Date.now()` → falla, (c) `pagos: [{banco: '',
cuenta: 'x'}]` → falla. Los 19 `Date.now()`: anotalos como deuda condicionada en
`.claude/plan.md`, no los toques."

Sobre el agujero de `soloCambian`: no lo hay, porque `proveedorValido()` revalida
el documento RESULTANTE entero, así que ninguna clave permitida puede quedar con
tipo inválido.

**SUPUESTOS:** (1) Que la auditoría verifica el TIPO de `fechaAlta`, no solo su
presencia; no leyó el script línea por línea. (2) Que el seed de dev escribe
proveedores con shape válido. (3) Que no hay escrituras offline encoladas de una
versión vieja; riesgo teórico que da por despreciable con un solo admin. (4) Que
`firebase deploy --only firestore` no falla por índices, porque no hay queries
nuevas. (5) Que el test de `deleteField()` corre sobre `prov-1`, que sí tiene
`rut` y `pagos` presentes.

**BLOQUEANTES:** "Ninguno para el push." Para cerrar el supuesto 1, verificar que
la auditoría valide `fechaAlta instanceof Timestamp`.

**Qué se hizo después:** verificado el supuesto 1 —`auditar-proveedores.mjs:142`
hace `datos.fechaAlta instanceof Timestamp`—, así que los 4 documentos de ambos
entornos pasaron esa comprobación y la reserva queda cerrada. Los tres tests
recomendados se delegaron a `trainee` y entraron: 197 → 200, con 29 líneas
agregadas y ninguna borrada.

**Divergencias:** me corrigió un planteo mío. Yo propuse anotar los 19
`Date.now()` como deuda a normalizar, y señaló que **normalizarlos sería repetir
el mismo bug en sentido inverso**: para ventas, movimientos y compras el número
puede ser el shape REAL de producción. Solo son deuda si esa colección endurece
el tipo de fecha.

---

## R5 fallback de la fase 1 en red mentirosa — llamada 1 (temprano)
Fecha: 2026-07-29

**Se le preguntó:** con la verificación de red mentirosa ya corrida y FALLADA
(48s colgado vs 535ms de control), qué semántica de degradación debe tener la
fase 1 cuando no consigue leer ni del servidor ni de la caché: escribir igual sin
chequeo (A), fallar con error de dominio (B), o escribir marcando (C). Más: si el
modal sin salida entra en la misma tanda, y de cuánto el timeout.

**RECOMENDACIÓN:** "Opción A con escalera, dentro de `leerProveedores` (un solo
punto cubre `crearProveedor` y `actualizarProveedor`): `Promise.race` entre el
`getDocs` y un timeout de **5 segundos**; al vencer, `getDocsFromCache`; si esa
falla, lista vacía y el alta procede sin marca ni error. No tocar `clientes.ts`.
Arreglá 'Cancelar' **en esta misma tanda**: habilitarlo durante `guardando`
(`ModalProveedor.tsx:157`) con flag de cancelación en el caller para ignorar el
resultado tardío. Criterio de aceptación: re-correr el harness Playwright de
captive portal, modal cerrado en <6 s."

Razón de 5s y no 15: "el costo de un falso timeout es casi nulo (degrada a un
chequeo ya best-effort), así que conviene errar por corto". El umbral de 15s era
para diagnóstico, no para UX.

**SUPUESTOS:** (1) `getDocsFromCache` sobre una QUERY resuelve con snapshot
posiblemente vacío en vez de rechazar —a diferencia de `getDocFromCache` de
documento único—. Él mismo marca que **es el mismo tipo de supuesto que acaba de
resultar falso**, y por eso pide verificarlo con el harness y no con la doc.
(2) El `getDocs` perdedor del race muere solo sin efecto observable. (3) El flag
de cancelación se puede hacer sin refactor del estado del modal. (4)
`ModalProveedor` tiene dos callers y hay que replicar el flag en ambos. (5) No
revisó si otros modales deshabilitan "Cancelar" igual; lo deja como follow-up.

**BLOQUEANTES:** (1) Confirmar empíricamente `getDocsFromCache` con caché vacía.
(2) Dónde corta la cancelación en `handleCrearProveedorInline`: necesita ver el
handler para afirmar si el flag evita el `setDoc` o solo el setState tardío.

**Qué se hizo después:** resuelto el bloqueante 2 leyendo el handler. **El flag
NO puede evitar la escritura**: `crearProveedor` dispara el `setDoc` al final de
la fase 1, así que cuando el `await` retorna el alta ya salió. Aplica entonces la
semántica que él mismo dejó pre-autorizada: "Cancelar cierra el modal y abandona
la espera, y si el alta llega tarde el proveedor existe pero no se usa en la
compra". Se delega al `senior` con eso decidido. El bloqueante 1 va como criterio
de aceptación de la tarea.

**Divergencias:** **un error MÍO en el brief**, que él detectó: afirmé que
`actualizarCliente` hace lectura previa y por lo tanto tenía el mismo cuelgue.
Es falso — no tiene un solo `getDocs`, deriva el `telefonoE164` localmente y va
directo al `updateDoc`. Verificado. El alcance se achica a `proveedores.ts`.

---

## R6 aplicar el patrón a categorias.ts — llamada 1 (temprano)
Fecha: 2026-07-29

**Se le preguntó:** cuatro cosas. (1) Si el fan-out a productos de
`renombrarCategoria` puede salir del SDK, dado que **no es una validación sino la
fuente de verdad del re-etiquetado** y una lista stale dejaría productos
huérfanos. (2) Si importa que el `orden = max + 1` se calcule sobre una
suscripción posiblemente stale. (3) Si a `ModalProducto` le alcanza recibir
`categorias` por prop. (4) Si los callers tienen el mismo bug del `await`.

**RECOMENDACIÓN:** "(1) La lectura del fan-out **se va**: `renombrarCategoria`
recibe `productos: readonly Producto[]` y filtra en memoria; el batch queda
idéntico. (2) El `orden` duplicado no importa; sí importa que `handleImportar`
mantenga un array local acumulado entre iteraciones del loop. (3) La prop
alcanza; no agregar suscripción a `ModalProducto`. (4) El `await` de estos
callers es correcto y se queda; el bug análogo real es que `enLinea` es el único
gate: reemplazarlo para mutaciones por 'último snapshot confirmado del servidor'
(`fromCache === false`), exponiéndolo opt-in desde `useCollection`."

**El argumento que desarma mi premisa, y es correcto:** `writeBatch` es atómico
en la ESCRITURA pero **no valida read-set** —`runTransaction` está descartado en
el JSDoc del módulo porque exigiría servidor—. La carrera "producto creado entre
la lectura y el commit" **existe hoy igual** con `getDocs`. Lo único que aportaba
era frescura, y bajo captive portal no la aporta: cuelga. Además el producto
huérfano ya es un estado manejado en la UI (`huerfana`, "(sin definir)").

Plan: T1 `useCollection` con frescura opt-in (`semisenior`), T2 `categorias.ts`
(`senior`, en paralelo), T3 callers (`semisenior`, depende de T1+T2), T4
verificación con el harness (`trainee`).

**SUPUESTOS:** (1) `onSnapshot` con `includeMetadataChanges: true` emite
`fromCache: false` al confirmar el servidor aunque los datos no cambien, y bajo
captive portal queda en `true` indefinidamente; no verificó el SDK instalado.
(2) `useCollection`/`useDoc` no tienen consumidores que se rompan con un
parámetro opcional. (3) El harness de proveedores es reutilizable. (4) La escala
sigue en decenas de productos. (5) El test de import secuencial mockea
`crearCategoria`, así que T3 necesita un test nuevo de la acumulación local.

**BLOQUEANTES:** (1) **Ventana residual asumida, no medida**: si el portal se
activa DESPUÉS de un snapshot confirmado y ANTES del clic, el `await` del commit
cuelga igual. La acepta por rara; si el harness muestra que es fácil de pisar,
volver con ese dato y reevalúa fire-and-forget para `crearCategoria` (no para
renombrar). (2) No leyó el JSX de deshabilitado de `Categorias.tsx`: asume que
los botones ya se deshabilitan con `!enLinea`.

**Qué se hizo después:** verificado el bloqueante 2 — `Categorias.tsx` **sí**
deshabilita con `!enLinea` (líneas 230, 236, 266, 317) y tiene banner en 215, así
que T3 solo cambia la condición. Verificado además que **29 archivos** consumen
`useCollection`, lo que convierte la retrocompatibilidad estricta en el requisito
central del brief de T1. Lanzadas T1 y T2 en paralelo.

**Divergencias:** ninguna. Me corrigió una premisa falsa —la del read-set— y el
resto de sus supuestos se sostuvieron. Se anota condicionado, no como pendiente.

---

## 2026-09-01 — Feedback del tester externo: teléfono con país, overscroll, carrito persistente

### Llamada 1 (temprana, antes de elegir enfoque)

**Recomendación textual (resumen fiel):**

1. *Teléfono:* "No tocar `normalizarTelefono` ni `firebase-kit`. En
   `core/telefono.ts` agregar una lista corta `CODIGOS_PAIS` (598 default, 54,
   55, 595, 591, 56, 34, 1, 39, 351, 49, 33, 44) y dos funciones puras con
   tests: `componerTelefono(cc, nacional, ccDefault)` → devuelve `nacional` tal
   cual si `cc === ccDefault`, o `+cc nacional` si difiere;
   `separarCodigoPais(display, ccDefault)` → parte un display que arranca con
   `+`/`00` por prefijo más largo de la lista, y si no matchea devuelve
   `{cc: ccDefault, nacional: display}`. En `packages/ui` un `Select` nativo
   mínimo. `ModalCliente` recibe prop `codigoPaisDefault`, muestra Select
   'País' + Input 'Número', y persiste `componerTelefono` en `telefono`."
   Descartado: `SearchSelect` (bufferizado, exige `key` en Modal), campo libre
   sin lista (no permite precargar `+34…`), campo nuevo en `clientes` (rompe
   `hasOnly` → deploy de reglas, innecesario porque el `+` es autodescriptivo).
2. *Overscroll:* "`html, body { overscroll-behavior-y: none; }` en `index.css`.
   Solo Y. El scroller del documento es `body`; los contenedores internos y el
   agarre del carrito (`touch-none` + pointer capture) no cambian." Y advierte:
   no considerarlo resuelto solo con CSS, el pedido real es el carrito.
3. *Carrito:* "`localStorage`, clave `carrito:<uid>`, payload versionado con IDS
   Y MAGNITUDES, nunca snapshots: `{ v:1, items:[{clave, productoId, piezaId?,
   gramos?, unidades?, precioUnitCents}], cliente, proximaClave }`.
   `ProveedorCarrito` recibe `usuarioId` por prop, lee al montar en `pendiente`,
   y solo escribe (write-through, sin debounce) DESPUÉS de hidratar. Módulo puro
   `carritoPersistido.ts` con type guard, `serializar` y
   `rehidratarCarrito(persistidos, productos, piezas, clientes)` que
   reconstruye con `crearItem*` contra las colecciones vivas y devuelve
   `{items, descartados}`. `Venta.tsx` lo invoca una vez cuando productos y
   piezas tienen `cargando=false, error=null`; toast con lo descartado y otro si
   cambió un precio." Descartado: IndexedDB, persistir snapshots, re-FIFO
   automático, limpiar al desloguear (contradice el pedido; aislar por uid
   resuelve multiusuario), debounce.

**Supuestos verificados por el orquestador:** `Shell` vive dentro de
`RutaProtegida` (`App.tsx:108`); piezas `estado == 'disponible'` y clientes
`activo == true` (`Venta.tsx:173,178`); reglas de `clientes.telefono` solo
`is string` (`firestore.rules:176`); `packages/ui` no tiene `Select`;
`registerType: 'autoUpdate'` (`vite.config.ts:52`).

**Bloqueantes y cómo se resolvieron (decisiones del orquestador, el dueño no
estaba presente; se le informan al cierre):**
- Lista de países: la propuesta del advisor tal cual. Ampliable después.
- TTL del carrito: **sin TTL**, el pedido fue literal ("hasta que lo elimine
  o lo confirme a propósito").
- Stock menor al persistido en unidad/granel: **descartar y avisar**, no
  recortar (una rama menos y no decide en silencio cuánto se vende).
- Dispositivo del tester: desconocido. El CSS se aplica igual; la verificación
  en Android la hace el dueño.

**Qué se hizo después:** A (`trainee`), B1 (`semisenior`) y C (`senior`) en
paralelo; B2 (`semisenior`) tras B1. Todo verificado por diff. El `senior`
agregó `descartadosSinNombre` al resultado de la rehidratación (un producto que
ya no está en el catálogo no se puede nombrar porque no se persiste el nombre)
y calibró los descartes con el mismo criterio que usa "agregar" para no dar
falsas alarmas.

**Incidente de proceso:** el `trainee` de la tarea A corrió
`git checkout .claude/advisor-log.md .claude/plan.md .claude/settings.json
apps/quesarte/.firebase/hosting.ZGlzdA.cache` fuera de su alcance. Revirtió
las notas de esta tanda (reescritas) y perdió 177 líneas no commiteadas de
`settings.json` (reglas de permisos autogeneradas; no recuperables de git).
Lección para briefs a `trainee`: prohibir explícitamente `git checkout`,
`git stash` y `git restore`.
