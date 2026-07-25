# Canonicalización de categorías (`canonicalizar-categorias.mjs`) — tarea C3

Lleva cada `categorias/{id}` existente a su **id canónico**, le estampa el campo
`clave` y **deduplica las homónimas**, re-etiquetando los productos que quedarían
apuntando a un nombre que deja de existir.

Se corre **una vez por proyecto** (primero `quesarte-uy-dev`, después
`quesarte-uy`) y **antes de desplegar las reglas nuevas**.

## 🚨 Orden de despliegue — no negociable

```
1. Migración C3 (este script)   →  Admin SDK, bypassea reglas
2. Deploy de firestore.rules    →  firebase deploy --only firestore:rules
3. Reseteo operativo (A5)       →  reset-operativo.mjs
4. Entrega
```

**Por qué la migración va ANTES del deploy de reglas.** C1+C2 hizo estructural la
unicidad del nombre de categoría: `categorias/{id}` cumple siempre
`id === claveCategoria(nombre)` y persiste ese valor en el campo `clave`, que
`firestore.rules` exige (`categoriaValida`) **en create y en update**. Los
documentos que ya existen en dev y en prod tienen id autogenerado y **no tienen
`clave`**. Con las reglas nuevas desplegadas y sin migrar:

- **renombrar o reordenar una categoría existente falla con `permission-denied`**
  (el update lleva el id viejo, que no es la clave), y
- la app no ofrece ninguna forma de arreglarlo desde adentro: la única salida
  sería crear una categoría nueva y mover los productos a mano.

Al revés no hay ningún problema: el Admin SDK **no pasa por las reglas**, así que
la migración escribe documentos ya canónicos con las reglas viejas todavía
desplegadas, y esos documentos también son válidos para las reglas viejas (que no
miran ni el id ni `clave`). O sea: **migrar primero es seguro en los dos mundos;
deployar primero deja una ventana en la que el dueño no puede editar categorías**.
El alta de categorías nuevas, en cambio, funciona igual en cualquier orden: la
escribe `crearCategoria`, que ya usa el id canónico.

**Por qué el reseteo operativo (A5) va después.** El reseteo conserva `categorias`
intacta (es catálogo, no dato operativo) pero **sí toca `productos`**. Correrlo
antes no rompe nada, pero deja el sistema con las categorías todavía sin migrar
durante toda la ventana de entrega; y correrlo entre la migración y el deploy de
reglas solo agrega una variable a un paso que ya es delicado. El orden de arriba
mantiene una sola cosa en el aire a la vez.

## Archivos

| Archivo                        | Qué es                                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `categoriasPlan.mjs`           | Módulo **puro** (sin Firebase, sin red, sin `fs`): decide quién sobrevive a un duplicado, qué se reescribe, qué se borra, qué producto se re-etiqueta y qué aborta la corrida. |
| `categoriasPlan.test.mjs`      | Tests de todo lo anterior. Es la única verificación posible del criterio: contra Firestore real no se puede probar, porque borrar es irreversible.                             |
| `canonicalizar-categorias.mjs` | El **shell**: guardrails de proyecto, confirmación, backup, batches, verificación final, log y rollback. Sin lógica de decisión propia.                                        |

Misma separación que `resetPlan.mjs` + `reset-operativo.mjs` (A5) y que
`generador.mjs` + `seed-demo.mjs` (el seed).

`claveCategoria` **no se reimplementa**: se importa de `@gestion/core`, que es la
fuente de verdad compartida con el kit, el seed y las reglas. La
(de)serialización de documentos para el backup se **reusa** de `resetPlan.mjs`
(puro y ya testeado) por el mismo motivo: dos implementaciones que puedan
divergir son exactamente el bug que esta tanda vino a cerrar.

## Qué hace, caso por caso

| Estado del documento                              | Qué hace                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `id === clave`, con `clave` y sin campos de más   | **Nada.** (Acá vive la idempotencia: la 2ª corrida reporta 0 operaciones.)                     |
| `id === clave` pero sin `clave` o con campos extra | Reescribe **en su lugar** con exactamente `{nombre, orden, clave}`.                            |
| id autogenerado                                    | **Muda** el documento a `categorias/{clave}` (mismo nombre recortado, mismo orden) y borra el viejo. |
| Dos o más con la misma clave                       | Sobrevive una (criterio abajo); las otras se borran y sus productos se re-etiquetan.           |

La escritura es siempre un `set` del documento completo, no un `update`: así se
caen los campos de más que pudiera tener un documento heredado. No es cosmética —
`categoriaValida` exige `keys().hasOnly(['nombre','orden','clave'])` sobre el
documento **resultante de cualquier update**, así que un campo extra dejaría esa
categoría imposible de editar desde la app.

El `nombre` se guarda recortado (`trim()`), igual que lo escriben `crearCategoria`
y `renombrarCategoria`.

### Criterio de supervivencia entre homónimas

En orden, con su fundamento:

1. **`orden` menor.** Es la única señal de intención humana que persiste en el
   documento: la posición en que el dueño dejó la categoría en las listas de
   Stock. Además el sobreviviente hereda su `orden`, así que la lista queda lo más
   parecida posible a como estaba.
2. **Empate → la que ya está en su path canónico** (`id === clave`). Va segunda y
   no primera a propósito: ser canónica no es señal de intención, es un accidente
   de cómo se tipeó el nombre. Si fuera el criterio principal, un `"quesos"` todo
   en minúscula le ganaría a un `"Quesos"` bien escrito y el dueño vería la
   regresión en pantalla. Como desempate, en cambio, ahorra una mudanza.
3. **Empate → id lexicográficamente menor.** No tiene fundamento de dominio:
   existe para que el plan sea **determinista** (Firestore no garantiza en qué
   orden devuelve los documentos, y dos dry-runs seguidos tienen que decir
   exactamente lo mismo).

Criterios evaluados y **descartados**:

- _"la más antigua"_: `categorias/{id}` no guarda fecha de creación (`{nombre,
  orden, clave}`, doc 02) y los ids autogenerados de Firestore son aleatorios, no
  monótonos. Es **indecidible** con los datos que hay.
- _"la que tiene más productos"_: `Producto.categoria` guarda el **nombre**, no el
  id. Para homónimas exactas —el caso real de `quesarte-uy-dev`, dos "Quesos"— los
  productos apuntan a las dos a la vez: el criterio no está definido justo donde
  haría falta.

**El caso real de `quesarte-uy-dev`** (una "Quesos" preexistente + la
`demo-categoria-quesos` que creó el seed) lo resuelve la regla 1: sobrevive la de
`orden` menor. Si además empataran en `orden`, el documento resultante sería
idéntico gane quien gane (mismo nombre, mismo orden), así que el desempate solo
afecta al texto del informe.

### Productos: cuándo se re-etiquetan

`Producto.categoria` guarda el **nombre** (`packages/core/src/tipos.ts`). Un
producto pertenece al grupo cuya clave coincide con la clave de su propio texto, y
se re-etiqueta si ese texto no es exactamente el nombre que sobrevive. El informe
separa las dos causas:

- **`duplicado`** — apuntaba a una categoría que desaparece (`"quesos "` cuando
  sobrevive `"Quesos"`). Re-etiquetar acá es **obligatorio**: si no, esos
  productos quedan huérfanos y la app los muestra bajo "Sin categoría".
- **`variante`** — su texto no coincide exactamente con ningún documento, pero su
  clave sí (`"QUESOS"` con la categoría `"Quesos"`). Hoy la app ya los muestra bajo
  "Sin categoría"; bajo el invariante nuevo **son** la misma categoría, así que se
  normalizan. Es una corrección de datos que ningún duplicado obligaba a hacer, por
  eso se cuenta y se lista aparte: revisá esa lista antes de confirmar.

Un producto cuya categoría **no coincide con ninguna clave** no se toca: inventarle
una categoría sería decidir por el dueño.

### Qué ABORTA la corrida (todo-o-nada)

Si algún documento cae en uno de estos casos, **no se escribe nada**: cada uno
exige una decisión sobre datos del negocio, y una migración que adivina es peor
que una que se planta.

- `nombre` ausente, vacío o que no es texto.
- `orden` que no es entero ≥ 0 (las reglas nuevas lo exigen, y además el `orden`
  es lo que decide quién sobrevive a un duplicado).
- Nombre cuya clave **no sirve como id de Firestore**: vacía, con `/`, `.`/`..`, o
  de la forma `__algo__`. Solución: renombrar esa categoría **desde la app**
  (Ajustes → Categorías) _antes_ de correr la migración —todavía se puede, las
  reglas nuevas no están desplegadas— o borrarla desde la consola.

Un `productos/{id}` con `categoria` no textual **no** aborta: se informa como
advertencia y se lo deja como está.

## Salvaguardas

1. **Dry-run por defecto.** Sin `--ejecutar` solo lee e informa: no crea el
   directorio de backup ni escribe un byte.
2. **`--project` obligatorio, sin default.** Un default que apunte a producción es
   justamente el accidente a evitar.
3. **Doble señal de proyecto** (mismo patrón que el "GUARDRAIL DURO" de
   `seed-demo.mjs`): el `--project` declarado tiene que coincidir **exactamente**
   con el `projectId` que se desprende de las credenciales activas, resuelto
   **localmente y sin red** _antes_ de inicializar `firebase-admin`. Como acá el
   objetivo legítimo puede ser producción, no hay allowlist: hay coincidencia
   exacta o aborto.
4. **Confirmación tipeada.** Con `--ejecutar` hay que tipear el projectId
   completo. **Sin TTY no corre**: no hay bypass no-interactivo.
5. **Backup primero.** Se exportan `categorias` **entera** y los productos
   afectados a un JSON local, se relee del disco y se verifican los conteos. Si
   algo falla, no se escribe nada en Firestore.
6. **Todo-o-nada** ante un documento que no se puede canonicalizar (ver arriba).
7. **Atómico.** Las operaciones van en un solo `writeBatch` mientras entren en 500
   (el caso real: un puñado de categorías y decenas de productos), igual que
   `renombrarCategoria`. Si alguna vez no entraran, el orden es `set` de las
   canónicas → `update` de los productos → `delete` de las viejas, de modo que un
   corte a mitad nunca deja un producto apuntando a un documento inexistente y
   volver a correr termina el trabajo.
8. **Idempotente.** Solo escribe lo que realmente cambia: la 2ª corrida reporta
   `No hay nada que hacer`.
9. **Rollback real** con `--restaurar` (ver abajo).
10. **Verificación final.** Relee Firestore y comprueba el invariante completo:
    `id === clave === claveCategoria(nombre)`, exactamente `{nombre, orden, clave}`,
    sin homónimas y sin productos apuntando a un nombre que no existe. Si algo no
    cierra, sale con código 1 y te dice dónde está el backup.

## Credenciales

Igual que el reseteo y el seed: Application Default Credentials del proyecto
objetivo.

1. **Service account key** (recomendado — el guardrail lee su `project_id`):
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/ruta/a/service-account-quesarte-uy.json
   ```
   Firebase → _Configuración del proyecto_ → _Cuentas de servicio_ → _Generar
   nueva clave privada_. Tiene permisos de administrador sobre esa base: **no se
   commitea** y se borra del disco cuando termina la operación.
2. `gcloud auth application-default login` **+** `export GOOGLE_CLOUD_PROJECT=<projectId>`.

## Uso

Desde `apps/quesarte/`:

```bash
# 1. Dry-run (default): qué haría, contra qué proyecto. No escribe nada.
pnpm run categorias:canonicalizar -- --project quesarte-uy-dev

# 2. Ensayo completo en DEV primero. Siempre.
pnpm run categorias:canonicalizar -- --project quesarte-uy-dev --ejecutar

# 3. Repetir el dry-run: tiene que decir "No hay nada que hacer" (idempotencia).
pnpm run categorias:canonicalizar -- --project quesarte-uy-dev

# 4. Recién después, producción (pide tipear el projectId).
pnpm run categorias:canonicalizar -- --project quesarte-uy --ejecutar

# Dónde dejar backup y log (default: ./backups)
pnpm run categorias:canonicalizar -- --project quesarte-uy --ejecutar --backup-dir ~/backups-quesarte
```

El `--` es de pnpm: separa sus flags de los del script. Hay **un solo** comando
declarado en `package.json`: el flag destructivo se tipea a mano, a propósito.

Archivos que quedan:

```
backups/categorias-<projectId>-<timestamp>.json      ← categorías completas + productos afectados
backups/categorias-<projectId>-<timestamp>.log.txt   ← log de la corrida
```

El backup **no se commitea**.

**Leé el informe antes de tipear el projectId.** Dice, con nombre y apellido,
cuántas categorías se canonicalizan, cuántas ya están bien, qué duplicados
encontró y cuál sobrevive en cada caso (con el porqué), y qué productos se
re-etiquetan.

## Rollback

El mismo script vuelve atrás (también dry-run por defecto):

```bash
# Qué haría (no escribe nada):
pnpm run categorias:canonicalizar -- --project quesarte-uy --restaurar backups/categorias-quesarte-uy-<ts>.json

# Rollback de verdad:
pnpm run categorias:canonicalizar -- --project quesarte-uy --restaurar backups/categorias-quesarte-uy-<ts>.json --ejecutar
```

Reescribe cada categoría y cada producto respaldado con su id original **y borra
las categorías que existan hoy y no estén en el backup** — que son, justamente,
las que creó la migración. Eso es lo que lo hace un rollback de verdad y no una
restauración parcial que dejaría duplicados.

Dos advertencias:

- Si después de la migración alguien **creó categorías nuevas desde la app**, el
  rollback también las borra. El dry-run lista una por una las que borraría:
  revisalas.
- Solo acepta backups de **este** script (`meta.script`) y del **mismo** proyecto
  (`meta.projectId`). Restaurar con el backup de `reset-operativo.mjs` borraría
  categorías que ese archivo no conoce, así que se rechaza.

## Cómo se probó

El módulo puro está cubierto por `categoriasPlan.test.mjs` (`pnpm test`, 35
casos): id ya canónico (con y sin `clave`, con campos de más), id autogenerado,
las dos homónimas exactas del caso real, homónimas con distinto caso que obligan a
re-etiquetar productos, el perdedor que ocupa el path canónico (que se pisa en vez
de borrarse), nombres cuya clave no sirve como id de Firestore, determinismo, el
informe, y la **idempotencia** verificada aplicando el plan en memoria y volviendo
a construirlo sobre el resultado.

El shell se probó de punta a punta contra el **emulador de Firestore** (nunca
contra un proyecto real), con 7 categorías y 5 productos que reproducen el caso de
dev:

```bash
pnpm exec firebase emulators:exec --only firestore --project demo-canon "<script de e2e>"
```

Verificado en esa corrida (35 chequeos): aborto del guardrail por projectId
distinto, **sin llegar a leer Firestore**; dry-run que no escribe ni crea el
directorio de backup; aborto sin TTY; aborto por projectId mal tipeado; ejecución
real (backup verificado → 11 operaciones en un batch → verificación final OK, con
el ganador correcto en los dos duplicados, el campo extra caído y los dos
productos re-etiquetados); 2ª corrida idempotente (0 operaciones); rollback que
devuelve el estado **byte a byte** al previo; rechazo de un backup ajeno; y aborto
todo-o-nada ante una categoría con clave inválida.

**Nunca se corrió contra `quesarte-uy` ni `quesarte-uy-dev`.** Esa ejecución la
hace una persona.

## Interacción con el seed de demo (dev)

`seed:demo:limpiar` borra por prefijo de id (`demo-`). Si en `quesarte-uy-dev` una
categoría del seed llegara a **ganar** un duplicado, después de la migración vive
en su path canónico (`categorias/quesos`), pierde el prefijo y por lo tanto **el
limpiador del seed ya no la borra**: queda como categoría normal del negocio. Es
el comportamiento correcto —ya no es un documento de demo, es la categoría real—,
pero conviene saberlo. La tarea **C4** hace que el seed cree las categorías con id
canónico desde el vamos, con lo que el punto deja de existir.
