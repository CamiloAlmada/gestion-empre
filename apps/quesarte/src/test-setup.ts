/**
 * Setup de vitest para la app quesarte.
 *
 * jsdom (29.x, la versión usada en todo el monorepo) todavía no implementa
 * `HTMLDialogElement.showModal()`/`close()` ni sus eventos ("cancel"/"close")
 * — ver https://github.com/jsdom/jsdom/issues/3294 — aunque sí soporta la
 * reflexión del atributo `open`. Todos los navegadores objetivo (Chrome,
 * Firefox, Safari) sí implementan `<dialog>` nativamente hace años, así que
 * este polyfill es SOLO para el entorno de test: replica el subconjunto de
 * comportamiento que `Modal` (de `@gestion/ui`) necesita, sin cambiar nada
 * del componente en producción.
 *
 * Mismo polyfill que `packages/ui/src/test-setup.ts` (primera pantalla de la
 * app que renderiza un `Modal` en tests): se duplica acá en vez de
 * importarse desde el otro package porque `test-setup.ts` no forma parte de
 * la API pública de `@gestion/ui` (no está en su `src/index.ts`).
 */
if (
  typeof HTMLDialogElement !== 'undefined' &&
  typeof HTMLDialogElement.prototype.showModal !== 'function'
) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) {
      return;
    }
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
