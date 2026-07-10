# 06 — Pautas de UI/UX (contrato de diseño)

Toda tarea de UI (packages/ui y pantallas de apps) se revisa contra este
documento. Si una pauta no se puede cumplir en un caso concreto, se reporta al
tech lead; no se ignora en silencio.

## 1. Principios

1. **Mostrador primero**: se usa de pie, con una mano, con un cliente esperando.
   Optimizar para pulgar, apuro e interrupciones — no para mouse ni calma.
2. **Claridad sobre decoración**: cada elemento visible debe ganarse el lugar.
   Ante la duda, menos.
3. **Todo estado existe**: loading, error, vacío y offline se diseñan siempre,
   no se improvisan. Un error siempre dice qué pasó y qué hacer, en español.
4. **Accesibilidad AA no negociable** (checklist §5): si falla contraste o
   target, no pasa review.
5. **Rápida de verdad**: interacciones core (§6) medidas en toques, no en
   "se siente bien".

## 2. Navegación

- **Bottom tab bar fija** con 5 tabs, en este orden (2026-07-10: el tab
  Historial pasó a ser **Clientes** — con el módulo del doc 07, clientes es la
  entrada de uso diario y el historial es consulta puntual):

  ```
  Stock | Clientes | ●Venta | Reportes | Ajustes
  ```

- **Venta es el tab central y prominente**: botón circular elevado con el color
  primario (patrón FAB central). Es el home de la app: al abrir, cae en Venta.
- **Productos** se gestiona como sección interna del tab Stock (no tiene tab).
- **Historial** (2026-07-10, ajustado tras uso real del dueño) es el historial
  DE VENTAS: cuelga del tab **Venta** (su `‹ volver` lleva a Venta; el tab
  Venta queda activo mientras se está en él o en el detalle de una venta). Dos
  entradas: el icono de historial (reloj con flecha antihoraria "rebobinando")
  arriba a la derecha del header de Venta — el flujo natural de "acabo de
  cobrar, quiero ver/anular la última venta" — y la acción "Historial" del
  listado de Clientes (consulta cruzada frecuente). El icono de Venta es la
  ÚNICA acción que se renderiza en el header también en pantalla angosta
  (excepción documentada: la zona inferior de Venta pertenece al carrito, no
  puede recibir flotantes; un icono en el header no compite con la zona del
  pulgar porque es consulta ocasional, no operación de venta).
- **Compras** (Fase 2) se accede desde Stock. **Gestión de usuarios**, desde Ajustes.
- Labels **siempre visibles** bajo cada ícono (nunca ícono solo). Tab activo:
  color primario + realce tipo pill; inactivo: texto secundario.
- Altura ~64px + `env(safe-area-inset-bottom)`. Targets de tab ≥48×48px.
- **Visibilidad por rol**: `vendedor` no ve Reportes; dentro de Stock no ve
  costos ni edición de precios (además del bloqueo real por reglas). `admin` ve
  todo. Los tabs se filtran por rol, nunca se muestran deshabilitados.
- **Header contextual** (patrón Material 3 / Apple HIG): `[‹ Padre] Título [1–2 acciones]`.
  - El título es el de la **vista actual**, no el del tab (en Stock → Productos
    dice "Productos"). Conciso (~15 caracteres).
  - Subvistas muestran a la izquierda el volver `‹ {Padre}` (ese link ES el
    breadcrumb en mobile; no hay breadcrumbs multi-nivel).
  - Hasta **2 acciones contextuales** por pantalla (las de más frecuencia);
    más que eso → menú "⋮". Acciones fuera de contexto: prohibidas.
  - **Orden y forma consistentes** (2026-07-10, feedback del dueño): la acción
    de AGREGAR es un botón "+" cuadrado (solo icono, con `aria-label`
    descriptivo) y ocupa SIEMPRE el extremo derecho — en el cluster flotante
    mobile y en el header desktop por igual. Las acciones de navegación
    interna (Catálogo, Categorías, Proveedores, Historial…) van con etiqueta
    de texto, justo a su izquierda. Nada de botones de agregar con texto largo
    ("Agregar proveedor") en el cluster: el texto vive en el estado vacío y en
    el `aria-label`.
  - **Dónde se renderizan** (ergonomía de pulgar, decidido 2026-07-09): en
    pantalla angosta van como **píldoras flotantes sobre la tab bar** (zona del
    pulgar, una mano); en `md:`+ van a la derecha del header (mouse). La
    pantalla declara sus acciones UNA vez (`useHeader`); el Shell decide dónde
    mostrarlas. Venta no declara acciones flotantes (su zona inferior es del
    carrito); su única acción es el icono de historial fijo al header (ver
    arriba), declarado como acción de header-siempre.
  - Las subvistas con contenido propio (detalle de producto) viven en **rutas
    reales**, no en estado interno: el back del sistema debe funcionar siempre.
- **Conexión: se señala solo la ausencia.** Con conexión el header no muestra
  nada; sin conexión, chip "Sin conexión" (ícono + texto, `role="status"`) y
  toast breve al reconectar. Un indicador permanente del estado normal es ruido.
  El chip es la ÚNICA señal genérica: prohibidos los banners por pantalla que
  solo repiten "sin conexión". Un banner offline local se justifica únicamente
  cuando explica una acción deshabilitada de esa pantalla (p. ej. "Necesitás
  conexión para gestionar categorías").

## 3. Lenguaje visual (One UI-like, translucidez contenida)

- **Radios generosos**: cards y modales 16-20px, botones e inputs 12px, el FAB
  de Venta circular.
- **Espaciado amplio**: mínimo 16px de padding en cards; listas con filas ≥56px.
- **Tipografía**: cuerpo mínimo 16px; títulos bold con jerarquía clara; números
  de dinero y peso en tabular-nums.
- **Translucidez SOLO en tab bar y header**: fondo semi-opaco (80-85%) +
  `backdrop-filter: blur(16px) saturate(1.4)`. Cards, modales y contenido:
  **siempre opacos** (el POS no puede sacrificar legibilidad).
- **Fallbacks obligatorios**: `@supports not (backdrop-filter: blur(1px))` →
  superficie sólida; `prefers-reduced-transparency: reduce` → sólida.
- Sombras suaves y bordes sutiles (`--color-borde`); elevación con moderación.
- **Movimiento**: transiciones 150-200ms ease-out; nada que bloquee al usuario;
  `prefers-reduced-motion: reduce` desactiva animaciones no esenciales.
- **Tablas en mobile: sin scroll horizontal.** Una tabla de gestión que no entra
  a lo ancho en pantalla angosta se compacta a lista apilada (dato principal +
  secundarios chicos debajo, valor numérico a la derecha), vía el modo compacto
  de `DataTable` (`filaCompacta`). El scroll horizontal queda solo como fallback
  de tablas sin modo compacto definido.

## 4. Sistema de temas

- Dos ejes independientes, elegibles en Ajustes → Apariencia:
  - **Modo**: light / dark / system (como siempre).
  - **Estilo** (2026-07-09): **Minimalista** (default, el actual) y **Cálido**
    (crema/naranja inspirado en `docs/inspiraciones/inspiracion_1.webp`: radios
    píldora, sombras suaves, tab bar flotante despegada, dark en marrones
    cálidos). Se aplica como `data-estilo="calido"` en `<html>` (Minimalista no
    fija atributo), persiste en `localStorage['estilo']`, anti-FOUC en el
    `index.html`. Los ejes componen: 2 estilos × light/dark, todos verificados
    en §7. Los estilos difieren SOLO por tokens (color + forma); el variant
    `calido:` queda reservado a diferencias estructurales (tab bar).
- Modos: **light / dark / system**, elegibles en Ajustes → Apariencia.
- Persistencia en `localStorage`; se aplica como `data-theme="light|dark"` en
  `<html>`. En modo system no se fija `data-theme` y rige
  `prefers-color-scheme`, siguiendo cambios del SO en vivo.
- Los componentes usan **solo tokens semánticos** del tema compartido
  (`@gestion/config/tailwind.css`): `fondo`, `superficie`,
  `superficie-translucida`, `texto`, `texto-secundario`, `borde`, `exito`,
  `peligro`, `advertencia`, y la escala `primary` (ámbar/miel). Prohibido
  hardcodear grises/azules de Tailwind en componentes nuevos.
- Color primario de marca: **ámbar/miel** (OKLCH, hue ~75-85). El par
  aprobado de cada combinación de contraste se documenta en §7.

## 5. Checklist de accesibilidad (entra en la DoD de toda tarea de UI)

- [ ] Contraste AA: 4.5:1 texto normal, 3:1 texto grande y componentes UI
      (solo combinaciones aprobadas de §7).
- [ ] Targets táctiles ≥44×44px (≥48px en POS y tab bar).
- [ ] Foco visible: ring de 2px en color primario con `focus-visible`, en TODO
      elemento interactivo.
- [ ] Inputs con `label` asociado; botones-ícono con `aria-label`.
- [ ] Toasts: `role="status"` (info) / `role="alert"` (error). Errores de
      formulario asociados con `aria-describedby`.
- [ ] Modales: focus trap, cierre con Escape, foco devuelto al disparador.
- [ ] `inputMode="decimal"`/`"numeric"` en peso y dinero (teclado correcto en móvil).
- [ ] Nada comunicado solo por color (icono o texto acompaña).
- [ ] `prefers-reduced-motion` y `prefers-reduced-transparency` respetados.
- [ ] UI 100% en español, mensajes de error concretos y accionables.

## 6. Velocidad en el POS (presupuesto de interacción)

- Venta común (producto frecuente, al peso): **≤3 toques** — tocar producto →
  ingresar peso en teclado numérico propio (botones grandes) → agregar.
- Botón **Cobrar siempre visible** con el total, fijo sobre la tab bar.
- Búsqueda con teclado arriba; resultados en grilla de cards grandes.
- Acciones destructivas (anular venta, merma, quitar ítem) piden confirmación;
  las demás nunca.
- Optimista donde sea seguro: la UI no espera a Firestore para responder
  (offline-first ya lo exige).
- **La venta en curso sobrevive a la navegación** (2026-07-09): cambiar de
  pestaña (a propósito o por toque accidental) NO vacía el carrito; el estado
  vive por encima de la pantalla Venta y se limpia solo al cobrar o al
  quitarlo explícitamente. No persiste entre recargas (las piezas elegidas
  pueden quedar viejas).
- **El carrito es editable en el lugar** (2026-07-09): ítems por unidad llevan
  − / + inline (respetando stock); ítems al peso reabren su modal con el valor
  actual al tocarlos; pieza entera abre el modal para sumar otra pieza. La
  hoja expandida lleva barra de agarre visual y se cierra arrastrando hacia
  abajo desde su parte superior (con `prefers-reduced-motion`, sin animación
  de seguimiento).
- **El arrastre colapsa la lista, no mueve la hoja** (2026-07-09, feedback del
  dueño): durante el arrastre, la fila de resumen (contador de ítems, total y
  botón Cobrar) queda QUIETA en su posición; lo que se achica es la altura del
  listado de ítems, hasta desaparecer y dejar visible solo el resumen. Al
  soltar: pasado el umbral se cierra (queda el resumen colapsado de siempre);
  antes del umbral, la lista vuelve a su altura con una transición corta. El
  resumen nunca se desplaza: Cobrar no se mueve de abajo en ningún momento del
  gesto.

## 7. Combinaciones de contraste aprobadas

Ratios WCAG verificados (2026-07-08, script OKLCH→sRGB). Solo se usan pares de
esta tabla; un par nuevo se verifica y se agrega acá antes de usarse.

| Uso | Par (light) | Ratio | Par (dark) | Ratio |
|---|---|---|---|---|
| Texto principal / fondo | `texto`/`fondo` | 17.53:1 | `texto`/`fondo` | 19.72:1 |
| Texto principal / superficie | `texto`/`superficie` | 18.59:1 | ídem | 18.59:1 |
| Texto secundario / superficie | | 7.77:1 | | 6.00:1 |
| Texto secundario / fondo | | 7.33:1 | | 6.36:1 |
| Botón primario (blanco/primary-600) | | 4.73:1 | ídem (no redefine) | 4.73:1 |
| Botón primario hover (blanco/primary-700) | | 6.92:1 | ídem | 6.92:1 |
| Texto de error (`peligro`/superficie) | | 5.15:1 | | 6.18:1 |
| Botón peligro (label) | blanco/`peligro` | 5.38:1 | `fondo`/`peligro` (`dark:text-fondo`) | 6.55:1 |
| Borde de input / superficie (UI ≥3:1) | | 3.10:1 | | 3.67:1 |
| Ring de foco primary-600 / superficie (UI ≥3:1) | | 4.53:1 | | 4.11:1 |
| Ring de foco primary-600 / fondo (UI ≥3:1) | | 4.27:1 | | 4.36:1 |
| `exito` / superficie | | 5.89:1 | | 7.78:1 |
| `advertencia` / superficie | | 5.97:1 | | 6.92:1 |
| Texto primario de marca (ej. tab activo): `primary-700` light / `primary-300` dark | /superficie | 6.62:1 | /superficie | 10.94:1 |
| — ídem sobre fondo | /fondo | 6.25:1 | /fondo | 11.60:1 |

Nota de diseño: `peligro` está optimizado como color de TEXTO. En botones con
fondo `peligro`, el label usa `text-white dark:text-fondo` (no hay un valor
único de `peligro` que cumpla AA en ambos roles en dark).

### Estilo Cálido (verificado 2026-07-09, mismo script; 32/32 pares AA)

| Uso | Par (light) | Ratio | Par (dark) | Ratio |
|---|---|---|---|---|
| Texto principal / fondo | `texto`/`fondo` | 14.50:1 | ídem | 17.54:1 |
| Texto principal / superficie | `texto`/`superficie` | 15.84:1 | ídem | 15.46:1 |
| Texto secundario / superficie | | 7.53:1 | | 6.96:1 |
| Texto secundario / fondo | | 6.90:1 | | 7.89:1 |
| Botón primario (blanco/primary-600) | | 4.89:1 | ídem (no redefine) | 4.89:1 |
| Botón primario hover (blanco/primary-700) | | 7.15:1 | ídem | 7.15:1 |
| Texto de error (`peligro`/superficie) | | 5.33:1 | | 6.01:1 |
| Botón peligro (label) | blanco/`peligro` | 5.57:1 | `fondo`/`peligro` | 6.82:1 |
| Borde de input / superficie (UI ≥3:1) | | 3.52:1 | | 3.13:1 |
| Ring de foco primary-600 / superficie (UI ≥3:1) | | 4.69:1 | | 3.55:1 |
| Ring de foco primary-600 / fondo (UI ≥3:1) | | 4.29:1 | | 4.03:1 |
| `exito` / superficie | | 6.18:1 | | 7.46:1 |
| `advertencia` / superficie | | 6.21:1 | | 6.73:1 |
| Texto de marca: `primary-700` light / `primary-300` dark | /superficie | 6.85:1 | /superficie | 9.35:1 |
| — ídem sobre fondo | /fondo | 6.27:1 | /fondo | 10.61:1 |
| Borde de tab bar flotante / fondo (UI ≥3:1) | `borde`/`fondo` | 3.23:1 | ídem | 3.55:1 |

Notas Cálido: la escala primary naranja tiene la chroma recortada por escalón
para quedar en gamut sRGB (verificado sin clipping); el par más justo es el
ring `primary-600`/superficie en dark (3.55:1). El par `borde`/`fondo` existe
por el borde de la tab bar flotante.

**Usos decorativos aprobados** (sin requisito de par AA por no llevar texto ni
comunicar información por sí solos — la información va por otra vía):
- Pill `primary-100` / `dark:primary-900/40` detrás del ícono del tab activo en
  `BarraPestanas` (el estado activo lo comunican `aria-current` y el color del
  label, ya verificados).
- Scrim `primary-950/60` como backdrop del `Modal`.
- Scrim `primary-950/25` detrás del carrito expandido del POS en layout angosto
  (más liviano que el del Modal: el carrito no bloquea, solo se destaca). Tocarlo
  colapsa el carrito; el estado lo comunica `aria-expanded`, no el scrim. La
  hoja expandida además lleva sombra de elevación hacia arriba y esquinas
  superiores redondeadas para leerse como bottom sheet.

## 8. Patrón de escrituras offline (estándar de proyecto)

Las promesas de escritura de Firestore no resuelven hasta el ack del servidor;
la persistencia local aplica el cambio al instante. Por eso, toda pantalla que
escribe sigue el patrón híbrido:

- **Online** (`useOnlineStatus() === true`): `await` + toast de éxito/error.
- **Offline**: disparar la escritura SIN `await`, cerrar el modal/flujo, toast
  `info` "Guardado sin conexión. Se sincronizará al reconectar.", y un `.catch`
  encadenado que muestre error si el servidor la rechaza al sincronizar.

Nunca dejar un botón "Guardando…" esperando un ack que no va a llegar sin
conexión. El POS usa este mismo patrón para el cobro.
