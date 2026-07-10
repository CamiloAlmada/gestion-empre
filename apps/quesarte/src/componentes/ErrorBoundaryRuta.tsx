import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router';

export interface ErrorBoundaryRutaProps {
  children: ReactNode;
}

interface ErrorBoundaryRutaState {
  error: Error | null;
}

/**
 * Defensa en profundidad (hallazgo B1 del review de Fase 2): un error que
 * escapa del render de una pantalla (p. ej. una función de `core` que lanza
 * porque la UI le pasó un estado que no debería haber llegado a esa pantalla)
 * hoy desmonta TODO el árbol de React — pantalla blanca completa, sin header
 * ni tab bar, sin forma de volver. Un `ErrorBoundary` (única forma de
 * capturar errores de render en React 18: debe ser class component, no hay
 * hook equivalente) contiene el daño a la zona ruteada.
 *
 * Se monta en `Shell.tsx` envolviendo el `<Suspense>` que ya rodea al
 * `<Outlet />` (afuera, no adentro: así también contiene un fallo al cargar
 * el chunk de una pantalla lazy, no solo errores de render de la pantalla ya
 * cargada), con `key={location.pathname}` — cambiar de ruta remonta el
 * boundary y limpia el error, así que "Volver a Venta" funciona sin recargar
 * la página. El header y la `BarraPestanas` de `Shell` quedan fuera de este
 * boundary (no son parte de `children`), así que siguen vivos y navegables
 * mientras la pantalla rota muestra este estado.
 *
 * NO reemplaza el manejo de errores puntual de cada pantalla (loading/error/
 * vacío con reintentar, doc 06 §1.3): es la red de seguridad para lo que se
 * escapa de esos estados, no el mecanismo principal.
 */
export class ErrorBoundaryRuta extends Component<ErrorBoundaryRutaProps, ErrorBoundaryRutaState> {
  state: ErrorBoundaryRutaState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryRutaState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Mismo criterio que `useCollection`/`useDoc` (packages/firebase-kit):
    // siempre a consola, trae el stack completo para debug — la UI genérica
    // de abajo no puede mostrar ese detalle sin asustar al usuario.
    console.error('[ErrorBoundaryRuta] Error de render:', error, info.componentStack);
  }

  render() {
    if (this.state.error !== null) {
      return (
        <div
          role="alert"
          className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-4 text-center"
        >
          <p className="text-lg font-semibold text-texto">Algo salió mal.</p>
          <p className="max-w-sm text-sm text-texto-secundario">
            Esta pantalla tuvo un error inesperado. Podés volver a Venta o recargar la app.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <Link
              to="/venta"
              className="inline-flex min-h-[44px] items-center justify-center rounded-control bg-primary-600 px-4 font-medium text-white hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
            >
              Volver a Venta
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-control border border-borde bg-superficie px-4 font-medium text-texto hover:bg-fondo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-superficie"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
