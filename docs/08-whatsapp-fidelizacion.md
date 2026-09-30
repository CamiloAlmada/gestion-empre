# 08 — WhatsApp y fidelización de clientes

Extiende el doc 07 (clientes) con comunicación vía WhatsApp y herramientas de
fidelización. UI regida por el doc 06.

## Restricción de diseño (leer primero)

Se usa EXCLUSIVAMENTE el esquema de links `wa.me` — sin API de WhatsApp, sin
servicios pagos, sin automatización de envío:

```
https://wa.me/<numeroE164SinMas>?text=<mensajeUrlEncoded>
```

Consecuencia que define TODO el módulo: **la app nunca envía mensajes; los
prepara**. Tocar un botón de WhatsApp abre la app de WhatsApp del dueño con el
destinatario y el texto precargados, y él decide enviar (y puede editar antes).
Prohibido implementar o insinuar envíos automáticos, programados o masivos.
Esto es deliberado: cero costo, cero riesgo de bloqueo, y el mensaje sale del
número que el cliente ya conoce.

## Teléfono normalizado

- `clientes.telefono` se guarda como lo escribió el usuario (display) y se
  agrega `telefonoE164` derivado (solo dígitos, con código de país, sin `+`).
- `configuracion.general.codigoPaisDefault` (default `598`). Normalización en
  `packages/core` (`normalizarTelefono(raw, codigoPais)`) con tests: maneja
  `099 123 456` → `59899123456`, números ya internacionales, y devuelve `null`
  si no es normalizable (el botón de WhatsApp no se muestra en ese caso).
- 2026-09-01: el formulario de cliente (`ModalCliente`) agregó un selector de
  país al lado del teléfono (motivado por un tester en España cuyo número la
  app tomó como uruguayo, `+598`). El display se guarda SIN prefijo cuando el
  país elegido es el default del negocio (mismo shape que siempre, compatible
  con los clientes cargados antes del selector) y CON `+cc` cuando difiere
  (`componerTelefono`/`separarCodigoPais`, `packages/core/src/telefono.ts`).
  `normalizarTelefono` no cambió: ya sabía tratar un display con `+` como
  internacional explícito.
- 2026-09-01, limitación conocida: con `+cc` (país ≠ default) `normalizarTelefono`
  confía en los dígitos tal cual (caso 1 de su criterio de clasificación, ver
  el archivo) — un nacional tipeado con el `0` de troncal (Argentina `011…`,
  Brasil `011 9…`, Reino Unido `07…`, Alemania `0170…`, Francia `06…`) queda
  cargado en el E.164 CON ese `0`, número inexistente para WhatsApp. No se
  corrige en `core` quitando el `0` a ciegas: Italia sí lo conserva en sus
  fijos, así que sacarlo rompería ese caso. El `ModalCliente` solo lo
  recuerda con un `placeholder` ("Sin el 0 inicial") en el teléfono cuando el
  país elegido no es el default — no valida ni corrige.
- 2026-09-01, nota para no leerlo como bug (no hay sección dedicada al
  formulario de cliente en `docs/06-ui-ux.md`, así que queda acá): un cliente
  uruguayo cargado A MANO como `+598 99…` (con `+` de más, típico de quien
  copió el número de otro lado) pasa a guardarse como `99…` la primera vez
  que un admin abre su ficha y toca "Guardar" — `separarCodigoPais` lo separa
  en país `598` (el default) + nacional `99…`, y como el país elegido
  coincide con el default, `componerTelefono` lo vuelve a guardar SIN
  prefijo. Mismo `telefonoE164` de siempre, no es una regresión. Si en cambio
  venía como `+598 099…` (con el `0` de troncal colado adentro del `+cc`), la
  edición CORRIGE un `telefonoE164` que antes salía CON ese `0` (caso 1 de
  `normalizarTelefono` confiaba en los dígitos tal cual) a uno sin él.

## Plantillas de mensajes

Colección `configuracion/plantillasWhatsApp` (editable solo por `admin`, en
Ajustes): lista de plantillas `{ id, nombre, contexto, texto, activa? }` con
placeholders que la app resuelve al generar el link (`activa` se explica en
"ABM de plantillas en Ajustes"):

- `{cliente}` — nombre o alias
- `{total}` — total de la venta formateado ($ x.xxx)
- `{items}` — resumen de ítems ("Queso Colonia 0,5 kg, Salame entero…")
- `{diasSinVenir}` — días desde la última compra
- `{negocio}` — nombre del negocio
- `{deuda}` — deuda pendiente del cliente, ya formateada ($ x.xxx) (solo
  contexto cobro; 2026-09-30)
- `{diasDeuda}` — días calendario desde la venta pendiente más vieja del
  cliente (solo contexto cobro; 2026-09-30)

Plantillas iniciales (seed, `PLANTILLAS_SEED` en `packages/core/src/whatsapp.ts`;
Adrián las edita a su tono):

- **Pedido listo** (contexto: venta): "Hola {cliente}! Tu pedido está listo:
  {items}. Total: {total}. ¿A qué hora te queda bien pasar a buscarlo?"
- **Te extrañamos** (contexto: cliente inactivo): "Hola {cliente}! Hace
  {diasSinVenir} días que no te vemos por {negocio}. Esta semana tenemos
  novedades que te pueden gustar 😊"
- **Aviso de llegada** (contexto: cliente): "Hola {cliente}! Llegó mercadería
  nueva que suele gustarte. ¡Te esperamos!"
- **Recordatorio de cobro** (contexto: cobro; id `recordatorio-cobro`, agregada
  2026-09-30): "Hola {cliente}! Te recuerdo que tenés pendiente {deuda} en
  {negocio}. Cuando puedas, avisame por acá cómo te queda mejor abonarlo.
  ¡Gracias!"

El resolver de placeholders es función pura en `core` con tests (incluyendo
URL-encoding correcto de emojis, saltos de línea `%0A` y caracteres especiales).

### Plantillas nuevas sin migrar datos (`completarConSeed`, 2026-09-30)

El documento `configuracion/plantillasWhatsApp` de producción se guardó con las
3 plantillas originales, así que la de cobro no estaba. En vez de migrarlo,
`completarConSeed(plantillas, seed)` (`packages/core/src/whatsapp.ts`) devuelve
las plantillas guardadas más, al final, las del seed cuyo `id` no esté entre
ellas. **Nunca pisa ni reordena** lo guardado: lo que Adrián editó queda como
está. La usan dos lugares:

- `BotonWhatsApp`: ofrece las plantillas del contexto sobre
  `plantillasActivas(completarConSeed(plantillasDoc.datos ?? [], PLANTILLAS_SEED))`
  (solo las activas, ver abajo); con el doc ausente o vacío queda el seed
  completo.
- `SeccionPlantillasWhatsApp` (Ajustes): lista
  `completarConSeed(guardadas, PLANTILLAS_SEED)` cuando hay plantillas
  guardadas, así la nueva aparece y la primera edición persiste las 4. Con el
  doc ausente o vacío conserva el estado vacío ("Cargar plantillas iniciales").

Nota de diseño: como toda plantilla del seed cuyo `id` falte se vuelve a sumar,
**borrar una plantilla de fábrica del documento la haría reaparecer**. Por eso
la baja de plantillas es **lógica** (campo `activa`, ver abajo) y nunca
física: Ajustes no ofrece borrar, solo desactivar.

Contextos aceptados: `'venta' | 'cliente' | 'inactivo' | 'cobro'`
(`ContextoPlantilla`). `CONTEXTOS` en `packages/firebase-kit/src/configuracion.ts`
y `plantillaWhatsAppValida` en `apps/quesarte/firestore.rules` los espejan (las
reglas no pueden importar la lista de core).

### ABM de plantillas en Ajustes (2026-09-30)

Lo pidió el dueño: Adrián tiene que poder armar sus propias plantillas sin
tocar código. Implementado en `SeccionPlantillasWhatsApp`
(`apps/quesarte/src/componentes/ajustes/`), solo admin.

**Qué puede hacer Adrián**

- **Crear** plantillas propias (botón "Nueva plantilla"): nombre, contexto y
  texto, en `ModalPlantillaWhatsApp`. El `id` es un id generado por el SDK de
  Firestore (`doc(collection(db, 'configuracion')).id`), sin escribir nada por sí
  solo.
- **Editar cualquiera**: nombre y texto de todas; el **contexto** solo en las
  propias (en las de fábrica el modal lo muestra de solo lectura).
- **Desactivar y reactivar solo las propias** (botones "Desactivar" /
  "Reactivar" en la fila, badge "Inactiva"). Desactivar pide confirmación
  (`ModalConfirmarDesactivarPlantilla`: deja de aparecer en el botón de WhatsApp,
  se puede reactivar); reactivar es directo.
- Las **de fábrica** (las de `PLANTILLAS_SEED`) **no se desactivan ni cambian de
  contexto**. Se sabe cuáles son con `esPlantillaDeFabrica(id)`
  (`packages/core/src/whatsapp.ts`), derivado del seed: no hay un campo
  `origen` persistido.
- **Tope de 20 plantillas en total** (`MAX_PLANTILLAS`), y **las inactivas
  cuentan**. Al llegar al tope "Nueva plantilla" se deshabilita y se muestra
  "Llegaste al máximo de 20 plantillas".
- Toda acción reescribe la lista completa del documento único
  (`guardarPlantillasWhatsApp`), con el patrón de escritura offline de
  docs/06 §8.

**Cómo se guarda: `activa` opcional, solo se persiste `false`**

`PlantillaWhatsApp.activa?: boolean` (`packages/core/src/whatsapp.ts`). Ausente
(o `true`) = activa; el converter y el kit **solo escriben `activa: false`**
(`plantillasWhatsAppConverter`, `exigirPlantillaValida`). Así el documento de
producción (sin la clave) y el seed siguen siendo válidos sin migrar datos, y una
plantilla de fábrica leída sigue siendo igual a la del seed. `plantillasActivas`
filtra las de `activa !== false`; es lo que usa `BotonWhatsApp`.

**Por qué la baja es lógica y por qué siempre queda ≥ 1 activa por contexto**

- Lógica, no borrado: `completarConSeed` vuelve a agregar toda plantilla del seed
  cuyo `id` falte, así que borrar una de fábrica la haría reaparecer.
- Cada contexto tiene exactamente una plantilla de fábrica en el seed, y esas no
  se pueden desactivar ni recontextualizar. Por lo tanto, **siempre queda al menos
  una plantilla activa por contexto** y el botón de WhatsApp nunca se queda sin
  opciones (condición que, de darse, lo oculta: `plantillasContexto.length === 0`
  en `BotonWhatsApp`).

**"Restaurar iniciales" (redefinido)**

Antes escribía el seed entero (y habría borrado las plantillas propias). Ahora
es `restaurarPlantillasDeFabrica(lista)` (`packages/core/src/whatsapp.ts`):
completa con el seed (`completarConSeed`) y devuelve cada plantilla de fábrica al
valor del seed (nombre, texto, contexto, sin `activa`); las **propias quedan
intactas**, con su `activa` y su posición. La confirmación
(`ModalConfirmarRestaurarPlantillas`) lo dice: "Repone nombre y texto de las
plantillas iniciales. Tus plantillas propias no cambian." El "Restaurar texto
original" dentro del modal de una de fábrica sigue siendo solo un borrador que
requiere "Guardar".

**Quién hace cumplir qué**

| Capa | Qué impone |
| --- | --- |
| `guardarPlantillasWhatsApp` (kit, `packages/firebase-kit/src/configuracion.ts`) | Tope de 20, ids únicos, rangos de cada campo, `activa` booleana; una de fábrica **no puede** llevar `activa: false` ni cambiar de contexto (`ConfiguracionInvalidaError`). |
| `plantillaWhatsAppValida` (reglas, `apps/quesarte/firestore.rules`) | Solo el shape del **primer elemento** de la lista: `activa` es una clave opcional y, si está, booleana. Las reglas no conocen qué ids son de fábrica ni iteran la lista. |
| UI (`SeccionPlantillasWhatsApp`, `ModalPlantillaWhatsApp`) | No ofrece "Desactivar" en las de fábrica, muestra su contexto de solo lectura y deshabilita "Nueva plantilla" en el tope. |

**Compatibilidad con bundles viejos**

Un bundle anterior a este cambio que guarde desde Ajustes **descarta `activa`**
(su converter solo mapeaba `id`, `nombre`, `contexto` y `texto`) y por lo tanto
**reactivaría las plantillas propias que estaban inactivas**. No hay migración: se
corrige desde Ajustes (volver a desactivarlas) y, como la PWA se autoactualiza
(`registerType: 'autoUpdate'` en `apps/quesarte/vite.config.ts`), el bundle viejo
deja de usarse solo.

## Puntos de contacto (dónde aparecen botones)

1. **Detalle de venta**: si la venta tiene cliente con teléfono normalizable,
   botón "WhatsApp" → selector de plantilla de contexto venta → abre wa.me.
2. **Ficha de cliente**: botón WhatsApp con las plantillas de contexto cliente.
3. **Filtro de inactivos** (ver abajo; tanda WA-G 2026-07-13, decidido por el
   dueño — antes era una pantalla dedicada): chip "Inactivos" en el listado de
   Clientes; con él activo, cada fila muestra días sin venir + botón con
   "Te extrañamos" precargada, ordenada por valor histórico.
4. **Chip "Deben"** (2026-09-30; cuarto punto de contacto, contexto `cobro`;
   lo pidió el dueño para ver quién le debe y mandar recordatorios): 4.º chip
   del listado de Clientes, **solo admin** (`esAdmin` en
   `apps/quesarte/src/pantallas/Clientes.tsx`). Lista a los clientes con deuda
   con `agruparDeudaPorCliente` (`packages/core/src/cobro.ts`), del que debe
   hace más al que debe hace menos (`diasDeuda` descendente; desempate por
   `deudaCents` descendente y nombre). Cada fila
   (`ListaClientesConDeuda.tsx`) muestra "Debe $X · N ventas · hace D días",
   lleva a la ficha del cliente y trae el botón `BotonWhatsApp` con
   `contexto="cobro"` y los valores `cliente`, `deuda` (`formatearMoney`) y
   `diasDeuda`. Detalle del modelo de deuda en el doc 11.
   - La query de ventas pendientes (`estado == 'completada'` y
     `cobro.estado == 'pendiente'`, por `fecha` desc) se suscribe **recién al
     elegir el chip**; el agrupado se calcula en memoria, sin campos
     denormalizados en `clientes`. Índice `ventas (estado, cobro.estado,
     fecha DESC)` en `apps/quesarte/firestore.indexes.json`.
   - Estados: cargando ("Cargando deudas…"), error con "Reintentar", vacío
     ("Nadie debe por ahora.") y aviso "Sin conexión: puede faltar información"
     si el snapshot viene de la caché.
   - Sigue siendo un botón por cliente y por toque: no hay "recordar a todos".
5. Los botones cumplen doc 06: target ≥44px, `aria-label`, y NO entran en el
   flujo de cobro del POS (el presupuesto de ≤3 toques no se toca).

## Fidelización e inteligencia (extiende doc 07 / Fase 3)

- **Clientes inactivos**: lista de clientes cuyo tiempo desde `ultimaCompra`
  supera su ritmo propio: `diasSinVenir > factorInactividad × promedioDiasEntreCompras`
  (factor configurable, default 2; mínimo 3 compras históricas para calcular
  ritmo propio; con menos, usar umbral global configurable, default 30 días).
  Ordenada por valor histórico descendente: primero los mejores clientes que
  se están perdiendo. Cada fila: nombre, días sin venir, total histórico,
  botón WhatsApp.
- **Mejores clientes**: ranking por total histórico y por frecuencia
  (ya especificado en doc 07).
- **Pronóstico de ventas (versión honesta)**: sin ML. Proyección simple por
  producto: promedio móvil de ventas de los últimos 28 días, con
  desagregación por día de semana (los sábados no venden como los martes).
  Se usa para: (a) la cobertura en días del doc 07 ("compra sugerida"),
  (b) una línea de proyección del mes en Reportes. Etiquetar SIEMPRE como
  "estimado". No prometer más precisión de la que 4 semanas de datos dan.

## Privacidad

- Los teléfonos son datos personales: visibles para `admin`; para `vendedor`
  solo el botón de WhatsApp en venta (sin exponer el número en pantalla).
- Ninguna función manda datos de clientes a servicios externos. wa.me solo
  recibe número y texto al momento del toque, en el dispositivo del dueño.

## Criterios de aceptación

- [ ] Venta con cliente con teléfono → botón WhatsApp abre wa.me con el
      mensaje resuelto correcto (placeholders, encoding, emoji, total
      formateado).
- [ ] Cliente sin teléfono o no normalizable → el botón no aparece.
- [ ] `normalizarTelefono` pasa tests con formatos locales e internacionales.
- [ ] La lista de inactivos calcula el umbral por ritmo propio con ≥3 compras
      y usa el global con menos.
- [ ] Las plantillas son editables en Ajustes (solo admin) y los cambios se
      reflejan sin redeploy.
- [ ] Chip "Deben" (solo admin): lista la deuda por cliente, la más vieja
      primero, y su botón abre wa.me con la plantilla `recordatorio-cobro`
      resuelta ({deuda}, {diasDeuda}, {negocio}).
- [ ] Un doc de plantillas guardado con las 3 originales igual ofrece la de
      cobro, sin migrar y sin alterar las plantillas guardadas.
- [ ] En Ajustes (solo admin) se pueden crear plantillas propias, editar
      cualquiera y desactivar / reactivar solo las propias; las de fábrica no
      se desactivan ni cambian de contexto y el tope es 20 (las inactivas
      cuentan).
- [ ] Una plantilla desactivada no aparece en el botón de WhatsApp, y "Restaurar
      iniciales" repone solo las de fábrica sin tocar las propias.
- [ ] No existe ningún código de envío automático/masivo (revisión de
      senior sobre este punto).
