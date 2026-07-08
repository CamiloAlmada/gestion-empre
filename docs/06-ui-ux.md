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

- **Bottom tab bar fija** con 5 tabs, en este orden:

  ```
  Stock | Historial | ●Venta | Reportes | Ajustes
  ```

- **Venta es el tab central y prominente**: botón circular elevado con el color
  primario (patrón FAB central). Es el home de la app: al abrir, cae en Venta.
- **Productos** se gestiona como sección interna del tab Stock (no tiene tab).
- **Compras** (Fase 2) se accede desde Stock. **Gestión de usuarios**, desde Ajustes.
- Labels **siempre visibles** bajo cada ícono (nunca ícono solo). Tab activo:
  color primario + realce tipo pill; inactivo: texto secundario.
- Altura ~64px + `env(safe-area-inset-bottom)`. Targets de tab ≥48×48px.
- **Visibilidad por rol**: `vendedor` no ve Reportes; dentro de Stock no ve
  costos ni edición de precios (además del bloqueo real por reglas). `admin` ve
  todo. Los tabs se filtran por rol, nunca se muestran deshabilitados.
- El header de cada pantalla muestra título + indicador de conexión.

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

## 4. Sistema de temas

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

## 7. Combinaciones de contraste aprobadas

*(Se completa con los ratios verificados al implementar el tema — tarea "tema
Quesarte". Solo se agregan pares que cumplan AA; los componentes usan
únicamente pares de esta tabla.)*

| Uso | Par (light) | Ratio | Par (dark) | Ratio |
|---|---|---|---|---|
| *pendiente* | | | | |
