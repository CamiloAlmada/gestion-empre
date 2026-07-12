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

## Plantillas de mensajes

Colección `configuracion/plantillasWhatsApp` (editable solo por `admin`, en
Ajustes): lista de plantillas `{ id, nombre, contexto, texto }` con
placeholders que la app resuelve al generar el link:

- `{cliente}` — nombre o alias
- `{total}` — total de la venta formateado ($ x.xxx)
- `{items}` — resumen de ítems ("Queso Colonia 0,5 kg, Salame entero…")
- `{diasSinVenir}` — días desde la última compra
- `{negocio}` — nombre del negocio

Plantillas iniciales (seed, Adrián las edita a su tono):

- **Pedido listo** (contexto: venta): "Hola {cliente}! Tu pedido está listo:
  {items}. Total: {total}. ¿A qué hora te queda bien pasar a buscarlo?"
- **Te extrañamos** (contexto: cliente inactivo): "Hola {cliente}! Hace
  {diasSinVenir} días que no te vemos por {negocio}. Esta semana tenemos
  novedades que te pueden gustar 😊"
- **Aviso de llegada** (contexto: cliente): "Hola {cliente}! Llegó mercadería
  nueva que suele gustarte. ¡Te esperamos!"

El resolver de placeholders es función pura en `core` con tests (incluyendo
URL-encoding correcto de emojis, saltos de línea `%0A` y caracteres especiales).

## Puntos de contacto (dónde aparecen botones)

1. **Detalle de venta**: si la venta tiene cliente con teléfono normalizable,
   botón "WhatsApp" → selector de plantilla de contexto venta → abre wa.me.
2. **Ficha de cliente**: botón WhatsApp con las plantillas de contexto cliente.
3. **Lista de inactivos** (ver abajo): botón por fila con "Te extrañamos"
   precargada.
4. Los botones cumplen doc 06: target ≥44px, `aria-label`, y NO entran en el
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
- [ ] No existe ningún código de envío automático/masivo (revisión de
      senior-dev sobre este punto).
