/**
 * Setup de vitest para @gestion/ui.
 *
 * Nota aparte (no resuelta acá, sino en el script "test" de package.json):
 * Node 22+ trae un `localStorage` global propio (detrás del flag
 * `--experimental-webstorage`, default on) que pisa el `window.localStorage`
 * de jsdom sin backing file real — queda `undefined` en vez de funcionar. El
 * script "test" corre con `NODE_OPTIONS=--no-experimental-webstorage` para
 * que gane el localStorage de jsdom (el que ProveedorTema.tsx necesita).
 *
 * jsdom (29.x, la versión usada en todo el monorepo) todavía no implementa
 * `HTMLDialogElement.showModal()`/`close()`
 * ni sus eventos ("cancel"/"close") — ver
 * https://github.com/jsdom/jsdom/issues/3294 — aunque sí soporta la
 * reflexión del atributo `open`. Todos los navegadores objetivo (Chrome,
 * Firefox, Safari) sí implementan `<dialog>` nativamente hace años, así que
 * este polyfill es SOLO para el entorno de test: replica el subconjunto de
 * comportamiento que Modal.tsx necesita (abrir/cerrar + evento "close") sin
 * cambiar nada del componente en producción.
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
