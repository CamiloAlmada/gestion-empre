import { useEffect, useState } from 'react';

/**
 * Refleja `navigator.onLine` y se actualiza en tiempo real con los eventos
 * `online`/`offline` del navegador. Se usa para mostrar el indicador de
 * estado de conexión (el POS debe poder operar offline).
 */
export function useOnlineStatus(): boolean {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine);

  useEffect(() => {
    const marcarEnLinea = () => setEnLinea(true);
    const marcarSinConexion = () => setEnLinea(false);

    window.addEventListener('online', marcarEnLinea);
    window.addEventListener('offline', marcarSinConexion);

    return () => {
      window.removeEventListener('online', marcarEnLinea);
      window.removeEventListener('offline', marcarSinConexion);
    };
  }, []);

  return enLinea;
}
