import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { Button } from '@gestion/ui';
import { useAuth } from '@gestion/firebase-kit';

export interface RutaProtegidaProps {
  children: ReactNode;
}

/**
 * Tope de espera en el estado `cargando` antes de mostrar un mensaje de
 * conexión en vez de dejar el "Cargando…" indefinidamente. No es un timeout
 * de la operación: el listener de auth/perfil sigue vivo y el SDK reintenta
 * solo con backoff; esto solo cambia qué ve el usuario mientras tanto.
 */
const TOPE_ESPERA_CARGANDO_MS = 10_000;

/**
 * Gatekeeper de rutas privadas. Cinco estados:
 * 1. `cargando` (sesión o perfil resolviéndose) → pantalla neutra, sin parpadeo.
 * 2. `cargando` por más de `TOPE_ESPERA_CARGANDO_MS` (2026-09-02) → misma
 *    pantalla neutra, pero con mensaje de conexión y botón para cerrar sesión.
 *    Un snapshot vacío desde caché (arranque en frío sin red) hace que
 *    `ProveedorAuth` se quede en `cargando` en vez de declarar "no
 *    autorizado" (ver ProveedorAuth); sin este aviso, un vendedor sin caché
 *    y sin red vería "Cargando…" para siempre sin saber por qué.
 * 3. Sin sesión → redirige a /login.
 * 4. Con sesión pero sin perfil o con perfil desactivado → "Cuenta no autorizada".
 * 5. Con perfil activo → renderiza el contenido protegido.
 */
export function RutaProtegida({ children }: RutaProtegidaProps) {
  const { usuario, perfil, cargando, salir } = useAuth();
  const [demoraExcedida, setDemoraExcedida] = useState(false);

  useEffect(() => {
    if (!cargando) {
      setDemoraExcedida(false);
      return;
    }

    const timer = setTimeout(() => {
      setDemoraExcedida(true);
    }, TOPE_ESPERA_CARGANDO_MS);

    return () => clearTimeout(timer);
  }, [cargando]);

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo p-4">
        {demoraExcedida ? (
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-elemento bg-superficie p-6 text-center shadow-card">
            <p className="text-sm text-texto-secundario">
              No pudimos verificar tu cuenta. Revisá la conexión; seguimos intentando.
            </p>
            <Button variante="secundaria" onClick={() => void salir()}>
              Cerrar sesión
            </Button>
          </div>
        ) : (
          <p className="text-sm text-texto-secundario">Cargando…</p>
        )}
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
