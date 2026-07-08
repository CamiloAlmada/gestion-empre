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
      <div className="flex items-center gap-3 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
        <span>Lista para usar sin conexión</span>
        <button
          type="button"
          onClick={() => setOfflineReady(false)}
          className="font-medium text-gray-300 hover:text-white"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
