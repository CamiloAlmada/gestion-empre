/**
 * Setup de vitest para `quesarte`.
 *
 * jsdom (29.x, la versión usada en todo el monorepo) todavía no implementa
 * `HTMLDialogElement.showModal()`/`close()` ni sus eventos ("cancel"/"close")
 * — ver https://github.com/jsdom/jsdom/issues/3294 — aunque sí soporta la
 * reflexión del atributo `open`. Todos los navegadores objetivo (Chrome,
 * Firefox, Safari) sí implementan `<dialog>` nativamente hace años, así que
 * este polyfill es SOLO para el entorno de test: replica el subconjunto de
 * comportamiento que `Modal` (`@gestion/ui`) necesita (abrir/cerrar + evento
 * "close") sin cambiar nada del componente en producción.
 *
 * Copia del mismo polyfill de `packages/ui/src/test-setup.ts` (Fase B2): la
 * pantalla Stock es la primera consumidora de `Modal` dentro de `quesarte`,
 * así que hasta ahora este paquete no lo necesitaba.
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
