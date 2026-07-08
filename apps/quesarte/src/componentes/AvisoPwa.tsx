import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Aviso no bloqueante que aparece una vez que el service worker terminó de
 * cachear todo lo necesario para funcionar sin conexión. Descartable.
 */
export function AvisoPwa() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
  } = useRegisterSW();

  if (!offlineReady) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      {/* Superficie invertida (bg-texto/text-fondo): un toast siempre debe
          destacar sobre el contenido, en los dos temas. En light queda un
          toast oscuro sobre fondo claro; en dark, uno claro sobre fondo
          oscuro. Contraste verificado en docs/06-ui-ux.md §7. */}
      <div className="flex items-center gap-3 rounded-lg bg-texto px-4 py-2 text-sm text-fondo shadow-lg">
        <span>Lista para usar sin conexión</span>
        <button
          type="button"
          onClick={() => setOfflineReady(false)}
          className="font-medium underline decoration-1 underline-offset-2 hover:no-underline"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
