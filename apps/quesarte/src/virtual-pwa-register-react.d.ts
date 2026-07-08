/**
 * Declaración de tipos del módulo virtual que expone vite-plugin-pwa para
 * React. No es un archivo real: lo resuelve el plugin en dev/build. Se
 * declara acá a mano (en vez de referenciar `vite-plugin-pwa/react`) para no
 * depender de `workbox-window` como devDependency directa del app.
 */
declare module 'virtual:pwa-register/react' {
  import type { Dispatch, SetStateAction } from 'react';

  export interface RegisterSWOptions {
    immediate?: boolean;
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
    onRegisterError?: (error: unknown) => void;
  }

  export function useRegisterSW(options?: RegisterSWOptions): {
    needRefresh: [boolean, Dispatch<SetStateAction<boolean>>];
    offlineReady: [boolean, Dispatch<SetStateAction<boolean>>];
    updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  };
}
