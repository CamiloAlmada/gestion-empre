import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Button } from '@gestion/ui';
import { useAuth } from '@gestion/firebase-kit';

export interface RutaProtegidaProps {
  children: ReactNode;
}

/**
 * Gatekeeper de rutas privadas. Cuatro estados:
 * 1. `cargando` (sesión o perfil resolviéndose) → pantalla neutra, sin parpadeo.
 * 2. Sin sesión → redirige a /login.
 * 3. Con sesión pero sin perfil o con perfil desactivado → "Cuenta no autorizada".
 * 4. Con perfil activo → renderiza el contenido protegido.
 */
export function RutaProtegida({ children }: RutaProtegidaProps) {
  const { usuario, perfil, cargando, salir } = useAuth();

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo">
        <p className="text-sm text-texto-secundario">Cargando…</p>
      </div>
    );
  }

  if (usuario === null) {
    return <Navigate to="/login" replace />;
  }

  if (perfil === null || !perfil.activo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo p-4">
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-elemento bg-superficie p-6 text-center shadow-card">
          <h1 className="text-lg font-semibold text-texto">Cuenta no autorizada</h1>
          <p className="text-sm text-texto-secundario">
            Tu cuenta no está habilitada. Contactá al administrador.
          </p>
          <Button variante="secundaria" onClick={() => void salir()}>
            Salir
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
