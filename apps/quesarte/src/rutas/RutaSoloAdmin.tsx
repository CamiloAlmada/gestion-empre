import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@gestion/firebase-kit';

export interface RutaSoloAdminProps {
  children: ReactNode;
}

/**
 * Restringe una ruta a perfiles con rol `admin`. Se usa DENTRO de
 * `RutaProtegida` (asume perfil no nulo y activo). El tab correspondiente ya
 * se filtra por rol en `BarraPestanas` (ver `Shell.tsx`), pero eso solo
 * oculta el botón: un `vendedor` que navega a mano (o pega la URL) también
 * tiene que ser redirigido — la ruta se protege igual, nunca se muestra
 * deshabilitada (docs/06-ui-ux.md §2).
 */
export function RutaSoloAdmin({ children }: RutaSoloAdminProps) {
  const { perfil } = useAuth();

  if (perfil?.rol !== 'admin') {
    return <Navigate to="/venta" replace />;
  }

  return <>{children}</>;
}
