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
  **Fusión Stock + Catálogo** (tanda UI-5, 2026-07-13, decidido por el dueño:
  para el vendedor eran ~90% la misma pantalla — la partición era por
  completitud de datos, no por tarea): la sección **Productos** es la ÚNICA
  lista de productos del tab. Conserva la presentación diaria de la ex Stock
  (lista agrupada por categoría, fila `nombre + precio + existencias`, franja
  de alertas) y hereda de la ex Catálogo la búsqueda full-width (§3) y el
  alta ("+" del cluster, solo-admin). Los productos INACTIVOS no aparecen por
  defecto: se incluyen al activar el chip "Inactivos" del botón de filtros
  extra (§3, patrón WA-H3; chip solo-admin), atenuados y con badge — espejo
  del criterio de dados de baja en Clientes. Las alertas se calculan SOLO
  sobre activos. El detalle del producto es el hub único: existencias, piezas
  y movimientos + ficha de configuración (categoría, modo, umbral, estado)
  con edición solo-admin en el lugar. **El precio se fija en el alta y se
  cambia SOLO en la sección Precios** (donde costo y margen están a la
  vista): la edición de la ficha NO incluye precio — cierra el doble camino
  de escritura que había entre el modal de catálogo y el de precios. La ruta
  vieja `/stock/productos` redirige a `/stock`.
  - **Picker de categoría con creación inline** (condición del dueño al
    aprobar la mudanza de Categorías a Ajustes, 2026-07-13): en el
    alta/edición de producto, el picker de categoría permite CREAR una
    categoría en el momento (escribir un nombre nuevo → acción "Crear";
    reusa `crearCategoria` de firebase-kit, con su chequeo de duplicados y
    su `orden = max + 1`) y lleva un link "Gestionar categorías" que navega
    a Ajustes → Categorías. Regla: el momento de necesidad real (estoy
    dando de alta un producto y la categoría no existe) NUNCA obliga a
    salir del flujo para crearla; la gestión completa (renombrar,
    reordenar) sí vive en Ajustes.
- **Historial** (2026-07-10, ajustado tras uso real del dueño) es el historial
  DE VENTAS: cuelga del tab **Venta** (su `‹ volver` lleva a Venta; el tab
  Venta queda activo mientras se está en él o en el detalle de una venta).
  **El detalle de una venta vive en ruta real** (`/historial/venta/:id`,
  tanda NAV-2 2026-07-14 — antes era estado interno de Historial, herencia
  pre-SH-1 que violaba la regla de subvistas con rutas reales): linkeable
  desde cualquier lado; en particular, las ventas listadas en la ficha de un
  cliente son TOCABLES y navegan a ese detalle (pedido del dueño). Dos
  entradas: el icono de historial (reloj con flecha antihoraria "rebobinando")
  arriba a la derecha del header de Venta — el flujo natural de "acabo de
  cobrar, quiero ver/anular la última venta" — y el MISMO icono en el header
  de Clientes (consulta cruzada frecuente; tanda WA-G 2026-07-13, decidido
  por el dueño: reemplaza a la píldora flotante "Historial", que saturaba el
  cluster). Regla general (generaliza la excepción que era solo de Venta):
  las acciones-ICONO de CONSULTA ocasional pueden renderizarse en el header
  también en pantalla angosta — no compiten con la zona del pulgar porque no
  son operaciones; las operaciones siguen yendo al cluster flotante.
- **Compras** (Fase 2) se accede desde Stock. **Gestión de usuarios** y
  **Categorías** (UI-5, 2026-07-13 — era sección de Stock), desde Ajustes.
- Labels **siempre visibles** bajo cada ícono (nunca ícono solo). Tab activo:
  color primario + realce tipo pill; inactivo: texto secundario.
- Altura ~64px + `env(safe-area-inset-bottom)`. Targets de tab ≥48×48px.
- **Visibilidad por rol**: `vendedor` no ve Reportes; dentro de Stock no ve
  costos ni edición de precios (además del bloqueo real por reglas). `admin` ve
  todo. Los tabs se filtran por rol, nunca se muestran deshabilitados.
- **Header contextual** (patrón Material 3 / Apple HIG; rediseñado 2026-07-10,
  tanda UI-3 según `docs/inspiraciones/inspo_fase_4/`): **fundido con el
  fondo** — mismo color que `fondo`, sin borde inferior ni translucidez — con
  layout `[‹]  Título CENTRADO  [acción]` (grilla de 3 columnas con laterales
  simétricos para que el título quede óptico-centrado).
  - El título es el de la **vista actual**, no el del tab (en Stock → Productos
    dice "Productos"). Conciso (~15 caracteres).
  - Subvistas muestran a la izquierda la flecha `‹` SOLA (sin el nombre del
    padre al lado). Ese botón ES el breadcrumb en mobile; no hay breadcrumbs
    multi-nivel.
  - **El `‹` es consciente del historial** (tanda NAV-2, 2026-07-14, pedido
    del dueño: "ir a la pantalla anterior siempre, no a lugares fijos"): si
    hay una entrada previa DENTRO de la app en el historial del navegador,
    el botón hace back real (`navigate(-1)` — llegaste al detalle de una
    venta desde la ficha de un cliente, el `‹` te devuelve a esa ficha, no
    al tab Venta). El `volverA` que declara cada pantalla pasa a ser el
    destino de FALLBACK: entrada directa por URL, deep link o PWA recién
    abierta, donde no hay historial propio al que volver. Como el destino
    real puede variar, el `aria-label` pasa a ser "Volver" a secas (siempre
    veraz), no "Volver a {Padre}".
- **Selector de sección** (2026-07-10, decidido con el dueño — patrón
  "secondary tabs" de Material 3; los chips NO se usan para navegar, solo para
  filtrar): dentro del tab **Stock**, las pantallas raíz de sección muestran
  bajo el header una fila horizontal scrolleable
  `Productos | Compras | Proveedores | Precios` (UI-5, 2026-07-13: con la
  fusión Stock+Catálogo y la mudanza de Categorías a Ajustes, el selector
  admin entra sin scroll en un teléfono común — motivo explícito de la
  tanda). Filtrado por rol: el vendedor solo tiene **Productos** → con UNA
  sola sección visible el selector NO se renderiza y el swipe entre
  secciones queda deshabilitado (no hay vecinas); su tab Stock es una
  pantalla simple. **Categorías** (UI-4 la sacó del modal de Catálogo como
  listado común; UI-5 la mudó): vive en **Ajustes** como listado común
  solo-admin — es vocabulario/configuración de baja frecuencia, misma
  naturaleza que Usuarios. La ruta vieja `/stock/categorias` redirige a la
  nueva (`/ajustes/categorias`).
  Semántica de pestañas sobre **rutas reales** (back del sistema funciona,
  cada sección linkeable, ítem activo resaltado y anunciado como
  seleccionado), presentación de fila contenida en superficie redondeada —
  deliberadamente DISTINTA de los chips de filtro. En drill-down (fichas) el
  selector desaparece y rige la flecha `‹`. Stock ya NO declara acciones de
  navegación en el header: el cluster flotante queda para las acciones
  contextuales de la sección activa (p. ej. su "+").
  - **Layout compartido** (UI-4): las secciones raíz de Stock viven bajo un
    layout route que renderiza el selector UNA vez sobre un `Outlet` — el
    selector no se remonta al cambiar de sección (conserva su scroll
    horizontal) y es el único dueño del gesto de swipe. Las fichas de detalle
    (producto, compra, proveedor) quedan FUERA del layout: sin selector y sin
    swipe. El `Suspense` de los chunks lazy de las secciones vive DENTRO del
    layout (alrededor de su `Outlet`, UI-4d): un chunk frío jamás desmonta el
    selector (si lo hiciera, perdería su scroll horizontal).
  - **Ítem activo siempre visible** (UI-4d, validación del dueño en campo):
    con más secciones que ancho de pantalla, al navegar (tap, swipe o URL
    directa) el selector desplaza su scroll horizontal para que el ítem
    activo quede completamente a la vista (auto-scroll, patrón estándar de
    tabs scrolleables); suave, salvo `prefers-reduced-motion`. El scrollport
    lleva `scroll-padding` (UI-4f): en los extremos el auto-scroll no deja el
    ítem al ras del recorte — el contenedor (borde + padding propio) queda
    entero a la vista.
  - **Swipe entre secciones** (UI-4, pedido del dueño): deslizar horizontal
    sobre el contenido navega a la sección vecina (respetando el filtro por
    rol). El área del gesto cubre TODO el alto visible de la sección —
    incluido el espacio vacío bajo el contenido corto (UI-4d): el contenedor
    del layout se estira al viewport disponible; el gesto no puede depender
    de dónde termina la última card. Discriminación de gesto obligatoria:
    solo dispara si el movimiento es claramente horizontal (umbral de
    distancia + dominancia de eje, mismo criterio que el arrastre del
    carrito §6) y NUNCA si el gesto nace en un contenedor con scroll
    horizontal propio (el selector mismo, tablas). En los extremos no hay
    wrap-around.
  - **Píldora animada** (UI-4): la transición del ítem activo del selector se
    anima con la **View Transitions API** nativa (`view-transition-name` en la
    píldora + navegación con `viewTransition` de react-router): el navegador
    hace el morph de posición/tamaño sin JS de animación. Firefox degrada a
    cambio instantáneo; `prefers-reduced-motion: reduce` la desactiva. Esta es
    la única animación de navegación aprobada — no extender a otras rutas sin
    decisión explícita.
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
- **Translucidez SOLO en la tab bar** (2026-07-10: el header pasó a fundido
  con el fondo, opaco — ver §2): fondo semi-opaco (80-85%) +
  `backdrop-filter: blur(16px) saturate(1.4)`. Cards, modales y contenido:
  **siempre opacos** (el POS no puede sacrificar legibilidad).
- **Fallbacks obligatorios**: `@supports not (backdrop-filter: blur(1px))` →
  superficie sólida; `prefers-reduced-transparency: reduce` → sólida.
- **Búsqueda unificada** (2026-07-10, tanda UI-3): un solo componente
  `CampoBusqueda` (`@gestion/ui`) para TODA búsqueda de listado: píldora con
  el ícono de lupa integrado a la izquierda, SIN label visible arriba (el
  accesible va en `aria-label`; el placeholder describe qué se busca, p. ej.
  "Nombre, alias o teléfono"). Forma por token propio: Minimalista mantiene la
  redondez de los inputs actuales; Cálido es píldora completa (como la tab
  bar). La normalización de búsqueda (acento-insensible) vive en UN helper
  compartido, no duplicada por pantalla. **Ancho completo SIEMPRE** (UI-4,
  2026-07-10, feedback del dueño): el campo ocupa todo el ancho del contenido
  en su propia fila, como en Venta — prohibido el wrapper `max-w-*` heredado
  del patrón viejo de `Input` con label. Los controles secundarios (chips,
  acciones de filtro) van en filas debajo, nunca al costado de la búsqueda.
- **Chips de filtro** (2026-07-10): píldoras sueltas bajo la búsqueda,
  scrolleables en horizontal; activo con relleno primario y texto en par
  aprobado (§7), inactivo tenue. Se usan SOLO para filtrar lo visible
  (categorías en Venta/Productos/Precios, "mostrar inactivos" en Proveedores) —
  nunca para navegar (eso es el selector de sección, §2, con otra
  presentación a propósito).
  - **Carril de filtros con botón de filtros extra** (WA-H3 2026-07-13,
    iterado con el dueño; reemplaza al chip trailing de WA-H2, que se cortaba
    contra el borde): la fila scrolleable lleva SOLO los chips de categoría;
    a su derecha, FIJO (fuera del scroll, siempre visible), un botón-icono de
    filtro (embudo `filter-list`, aria-label "Filtros", `aria-expanded`) que
    pliega/despliega una fila debajo con los chips de filtros extra (en
    Precios "Bajo objetivo"; en Productos "Inactivos", solo-admin, UI-5; los
    futuros se suman ahí). Cuando algún filtro extra
    está ACTIVO y el panel está plegado, el icono muestra un indicador (punto
    en color primario) — un filtro aplicado jamás queda invisible.
  - **Clientes** (tanda WA-G 2026-07-13, decidido por el dueño): terna
    EXCLUYENTE `Todos | Activos | Inactivos` (uno siempre activo, default
    Todos) por inactividad COMERCIAL del doc 08 — "Inactivos" = hace mucho
    que no compran según ritmo propio/umbral, NO dados de baja. Con el chip
    Inactivos, las filas se enriquecen (días sin venir, orden por valor
    histórico desc, botón "Te extrañamos") y reemplazan a la pantalla
    dedicada `/clientes/inactivos`, que se elimina. Los clientes DADOS DE
    BAJA (desactivados) aparecen solo bajo "Todos", atenuados y con su badge
    — para reactivar, se los busca ahí.
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
- **Colores del negocio** (tanda TM, 2026-07-23, decidido con el dueño):
  tercer eje, DEL NEGOCIO (no del usuario) — el admin elige en Ajustes →
  Apariencia el **matiz de marca** (slider 0-359, grados enteros) y el
  **tinte de fondo** (`neutro`/`cálido`/`frío`), o un preset de la galería
  (un preset ES un par matiz+tinte; no se persiste id de preset). Un motor
  en `packages/core` (`generarPaleta`) deriva TODA la paleta en OKLCH con
  **AA garantizado por construcción** (anclaje por luminancia WCAG, ver §7)
  y la app la aplica pisando los pares crudos de Capa 1 vía
  `<style id="tema-negocio">` + atributo `data-tema-negocio` en `<html>` —
  compone con Modo (sigue personal) y con Estilo (que solo aporta forma).
  Persistencia: doc `configuracion/tema` = `{version, matiz, tinte}` (solo
  la semilla; la paleta se regenera determinista en cada cliente), escritura
  solo admin, lectura de todo usuario activo; cache localStorage
  `'temaNegocio'` con el CSS generado + hex de theme-color para el anti-FOUC
  (primer arranque sin cache: un flash de tema base, aceptado). Editor con
  **preview en vivo sobre toda la app** (Guardar/Descartar; descartar,
  navegar o desmontar SIEMPRE restaura el persistido), "Volver a los colores
  originales" (borra el doc) y panel de transparencia "Contraste verificado
  (AA)" con los ratios del reporte del motor. Éxito/peligro/advertencia no
  se personalizan (semántica universal); los pares de marca WhatsApp quedan
  fuera del motor.
- Color primario de marca: **ámbar/miel** (OKLCH, hue ~75-85). El par
  aprobado de cada combinación de contraste se documenta en §7.

## 5. Checklist de accesibilidad (entra en la DoD de toda tarea de UI)

- [ ] Contraste AA: 4.5:1 texto normal, 3:1 texto grande y componentes UI
      (solo combinaciones aprobadas de §7).
- [ ] Targets táctiles ≥44×44px (≥48px en POS y tab bar).
- [ ] Foco visible: ring de 2px en color primario con `focus-visible`, en TODO
      elemento interactivo. El ring se dibuja FUERA del elemento: todo
      contenedor con overflow (modales scrolleables, áreas con clip) debe dar
      aire suficiente para que no se recorte (UI-4f, validación del dueño).
- [ ] Inputs con `label` asociado; botones-ícono con `aria-label`.
- [ ] Toasts: `role="status"` (info) / `role="alert"` (error). Errores de
      formulario asociados con `aria-describedby`.
- [ ] Modales: focus trap, cierre con Escape, foco devuelto al disparador.
- [ ] **Inputs bufferizados en modales** (patrón COSTO-2/AUDIT-1, 2026-07-14):
      todo input con buffer propio que no resincroniza mientras está enfocado
      (`MoneyInput`, `PesoInput`, `CantidadInput`, `SearchSelect`) dentro de
      un `Modal` lleva `key={aperturaId}` (contador incrementado en el efecto
      de reset de cada apertura) — el autofoco nativo de `dialog.showModal()`
      puede enfocarlo ANTES de que React cargue los datos nuevos y dejar el
      texto clavado en el valor anterior (bug real de producción). Un grupo
      de botones segmentados delante del input lo protege, pero no confiar
      en eso: la key es obligatoria. Fix sistémico en packages/ui: diferido
      a propósito (todas las instancias actuales auditadas y cubiertas).
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
- **El arrastre colapsa el contenido, no mueve la hoja** (2026-07-09, feedback
  del dueño; precisado 2026-07-10): durante el arrastre, la fila de resumen
  (contador de ítems, total y botón Cobrar) queda QUIETA en su posición; lo
  que se achica es la altura de TODO el bloque entre el agarre y el resumen
  (hoy: fila Cliente + listado de ítems — cualquier contenido futuro de la
  hoja entra al mismo bloque), hasta desaparecer y dejar visible solo el
  resumen. Sin topes intermedios: el gesto no debe frenar en un piso parcial.
  Al soltar: pasado el umbral se cierra (queda el resumen colapsado de
  siempre); antes del umbral, el bloque vuelve a su altura con una transición
  corta. El resumen nunca se desplaza: Cobrar no se mueve de abajo en ningún
  momento del gesto.

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
| Ítem activo del selector de sección: `primary-700`/`primary-100` light, `primary-300`/`primary-900` dark (2026-07-10, UI-3c) | | 12.33:1 | | 7.28:1 |
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

### Marca WhatsApp (verificado 2026-07-13, tarea WA-I, `scripts/contraste.mjs`)

Tokens `--color-whatsapp` (#25D366) y `--color-whatsapp-oscuro` (#128C7E,
hover) — fijos, NO redefinidos por modo ni por estilo (identidad de marca de
un tercero, ver comentario en `packages/config/tailwind.css`). Por eso su
ratio con cualquier par también fijo (blanco o negro) da **el mismo valor en
las 4 combinaciones** — no es un error de medición, es la consecuencia de que
ninguno de los dos lados depende del tema.

| Uso | Par | Ratio (las 4 combinaciones) | AA |
|---|---|---|---|
| Label/ícono del botón WhatsApp (EN USO por excepción de marca del dueño, ver abajo) | blanco/`whatsapp` | 1.98:1 | ❌ asumido |
| — hover (misma excepción) | blanco/`whatsapp-oscuro` | 4.14:1 | ❌ asumido |
| Alternativa AA descartada por el dueño: negro / `whatsapp` | `black`/`whatsapp` | 10.59:1 | ✅ ≥4.5:1 |
| Alternativa AA descartada por el dueño: blanco / teal `#075E54` | blanco/#075E54 | 7.67:1 | ✅ ≥4.5:1 |
| Descartado: `texto` (token adaptativo) / `whatsapp` | light 9.79:1, **dark 1.90:1** (Minimalista; en Cálido 8.34 / 1.77) | ❌ en dark (el token se aclara para leerse sobre fondos oscuros del tema, no sirve sobre un verde fijo) |
| `whatsapp-oscuro` / `superficie`, como componente UI (borde, si se necesitara) | ≥3:1 en las 4 | 3.96 / 4.70 / 3.96 / 4.20 | ✅ ≥3:1 (❌ si se usara como texto 4.5:1: falla en 3 de 4) |

**Elegido — EXCEPCIÓN DE MARCA, decisión del dueño (2026-07-14)**: fondo
`bg-whatsapp` con glifo Y label en **blanco** (`text-white`), look oficial de
la marca. El par blanco/`whatsapp` mide **1.98:1 — NO cumple AA** y el dueño
lo asumió explícitamente ("es un tema de brand… perdemos 1 sola de contraste,
es asumible") tras ver los números y las alternativas (negro 10.59:1, teal
#075E54 7.67:1). Única excepción de contraste aprobada en toda la app: NO
sienta precedente, NO se extiende a ningún otro componente ni estado, y
cualquier review debe tratarla como decisión cerrada del dueño, no como
hallazgo. Mitigación: el botón se identifica por el glifo icónico + verde de
marca + `aria-label` descriptivo; el label es refuerzo, no la única señal.
`hover:bg-whatsapp-oscuro` con blanco: 4.14:1 (misma excepción).

### Paleta personalizada (tanda TM, 2026-07-23 — motor `generarPaleta`)

Con "Colores del negocio" activo (§4), la tabla efectiva de esta sección es
`PARES_AA` (`packages/core/src/contrasteAa.ts`): la UNIÓN de las tablas
Minimalista y Cálido de arriba (incluido el par `borde`/`fondo` ≥3:1 de la
tab bar flotante, que se exige siempre porque la base puede ser Cálida),
excluidos los pares de marca WhatsApp (fijos, fuera del motor). La garantía
no es por revisión manual sino **por construcción + verificación
exhaustiva**: el motor ancla la luminancia WCAG de cada token a la del
Minimalista verificado y el matiz está cuantizado a grados enteros, así que
el espacio de paletas posibles es finito (360 matices × 3 tintes = 1080) y
un test de `packages/core` las genera TODAS en CI verificando cada par —
si una sola fallara, el build no sale. Un par nuevo en la UI se agrega a
`PARES_AA` (no solo a esta tabla) para quedar cubierto por ese test.

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
- `IconoWhatsApp` (`packages/ui`, tarea WA-I): glifo monocromo
  (`fill="currentColor"`), logotipo — el nombre accesible del control que lo
  envuelve viene de su texto/`aria-label`, nunca del ícono. Ver sección
  "Marca WhatsApp" arriba para el par usado en `BotonWhatsApp`.

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
