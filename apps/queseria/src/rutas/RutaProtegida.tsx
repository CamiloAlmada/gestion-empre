import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '@gestion/firebase-kit';
import { auth } from '../firebase';

export interface RutaProtegidaProps {
  children: ReactNode;
}

/**
 * Gatekeeper de rutas privadas: mientras se resuelve el estado de auth no
 * muestra nada (evita parpadeo hacia /login), sin usuario redirige a
 * /login, y con usuario renderiza el contenido protegido.
 */
export function RutaProtegida({ children }: RutaProtegidaProps) {
  const { usuario, cargando } = useAuth(auth);

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Cargando…</p>
      </div>
    );
  }

  if (usuario === null) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
