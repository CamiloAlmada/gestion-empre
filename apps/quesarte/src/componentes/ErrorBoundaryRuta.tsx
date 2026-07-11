import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router';

export interface ErrorBoundaryRutaProps {
  children: ReactNode;
  /**
   * Ruta actual (`location.pathname`), alimentada por `Shell.tsx`. Es la señal
   * de "hubo navegación" del auto-reset (ver `componentDidUpdate`): reemplaza
   * al viejo `key={location.pathname}`, ver el JSDoc de la clase.
   */
  rutaActual: string;
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
 * cargada). El header y la `BarraPestanas` de `Shell` quedan fuera de este
 * boundary (no son parte de `children`), así que siguen vivos y navegables
 * mientras la pantalla rota muestra este estado.
 *
 * Recovery por navegación (UI-4e): al cambiar de ruta se limpia el error, así
 * "Volver a Venta" funciona sin recargar. Se hace por ESTADO
 * (`componentDidUpdate` compara la prop `rutaActual`, ver abajo), NO con
 * `key={location.pathname}` como antes. Ese `key` remontaba el boundary —y
 * con él TODO su subtree— en CADA navegación, aun sin error: eso destruía el
 * `StockLayout` persistente de las secciones de Stock (docs/06-ui-ux.md §2,
 * "Layout compartido"), que justamente NO debe remontarse al navegar entre
 * secciones hermanas (perdía su instancia y con ella el scroll horizontal del
 * selector). Reseteando por estado, el subtree sobrevive a la navegación
 * normal y el boundary solo "hace algo" cuando de verdad hay un error que
 * limpiar.
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

  componentDidUpdate(prevProps: ErrorBoundaryRutaProps): void {
    // Auto-reset por navegación (UI-4e): si hay un error capturado y la ruta
    // cambió, se limpia para que la pantalla de la ruta nueva se renderice.
    // Las dos guardas son imprescindibles:
    //  - `this.state.error !== null`: sin error no se toca el estado — la
    //    navegación normal (el 99% de los casos) no debe disparar renders de
    //    más ni, sobre todo, remontar nada. Es lo que permite que el subtree
    //    (p. ej. `StockLayout`) sobreviva a la navegación, a diferencia del
    //    viejo `key`.
    //  - `prevProps.rutaActual !== this.props.rutaActual`: solo la NAVEGACIÓN
    //    limpia el error, no cualquier re-render del padre. Y evita un loop:
    //    el propio `setState({ error: null })` provoca otro `componentDidUpdate`;
    //    si la pantalla de la ruta nueva también lanza, `getDerivedStateFromError`
    //    re-arma el error, pero como en ese ciclo la ruta NO cambió, no se
    //    resetea de nuevo → el fallback de la ruta nueva queda estable en vez
    //    de entrar en bucle.
    //
    // Timing (verificado): con el error activo, `render()` devuelve el fallback
    // y NO monta `children`. Al cambiar `rutaActual`, React primero re-renderiza
    // el fallback una vez más (el error sigue seteado) y recién en el
    // `componentDidUpdate` de ese commit corre este `setState`; el re-render que
    // dispara ya monta `children` con la ruta nueva. Ese doble ciclo es
    // síncrono dentro del mismo commit (setState en un método de fase de commit
    // se procesa antes de pintar), así que no hay flash del fallback ni se
    // llegan a montar los `children` de la ruta nueva con el error todavía
    // puesto.
    if (this.state.error !== null && prevProps.rutaActual !== this.props.rutaActual) {
      this.setState({ error: null });
    }
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
