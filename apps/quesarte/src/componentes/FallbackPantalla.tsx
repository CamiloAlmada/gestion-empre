/**
 * Fallback de `<Suspense>` para las pantallas ruteadas con `React.lazy`
 * (code-splitting por ruta, ver `App.tsx`). Vive DENTRO de `<main>` en
 * `Shell.tsx` — el header y la tab bar quedan montados, solo el área de
 * contenido muestra este estado (docs/06-ui-ux.md §1.3: todo estado de
 * loading se diseña, no se improvisa).
 *
 * `min-h-[60vh]` es el mismo alto reservado que usa `Proximamente.tsx` para
 * evitar layout shift notorio contra el contenido real que va a reemplazarlo.
 * El giro del spinner se apaga con `prefers-reduced-motion` (docs/06-ui-ux.md
 * §5); el texto solo (sin animación) sigue comunicando el estado.
 */
export function FallbackPantalla() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3"
      role="status"
    >
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-borde border-t-primary-600 motion-reduce:animate-none"
      />
      <p className="text-sm text-texto-secundario">Cargando…</p>
    </div>
  );
}
