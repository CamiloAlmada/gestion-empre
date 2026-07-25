import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSwipeHorizontal, type DireccionSwipeHorizontal } from './useSwipeHorizontal';

afterEach(cleanup);

/** Harness mínimo: contenedor con los handlers del hook + un hijo con scroll
 * horizontal propio, igual forma que cualquier consumidor real (Stock,
 * Reportes) — el hook no sabe qué hay adentro, solo detecta el gesto. */
function ContenedorDePrueba({ onSwipe }: { onSwipe: (direccion: DireccionSwipeHorizontal) => void }) {
  const { ref, onTouchStart, onTouchEnd, onTouchCancel } = useSwipeHorizontal(onSwipe);
  return (
    <div
      data-testid="contenedor"
      ref={ref}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <div data-testid="scrolleable" style={{ overflowX: 'auto' }}>
        selector
      </div>
    </div>
  );
}

/** Simula un nodo con scroll horizontal propio: jsdom no calcula layout real,
 * así que `scrollWidth`/`clientWidth` se fuerzan a mano (mismo criterio que
 * usa el hook para excluir un selector o una tabla con overflow). */
function marcarScrollHorizontal(elemento: HTMLElement) {
  Object.defineProperty(elemento, 'scrollWidth', { value: 600, configurable: true });
  Object.defineProperty(elemento, 'clientWidth', { value: 300, configurable: true });
}

function swipe(
  contenedor: HTMLElement,
  origen: { x: number; y: number },
  destino: { x: number; y: number },
  nace: HTMLElement = contenedor,
) {
  fireEvent.touchStart(nace, { touches: [{ clientX: origen.x, clientY: origen.y }] });
  fireEvent.touchEnd(contenedor, { changedTouches: [{ clientX: destino.x, clientY: destino.y }] });
}

describe('useSwipeHorizontal', () => {
  it('swipe hacia la izquierda dispara onSwipe("izquierda")', () => {
    const onSwipe = vi.fn();
    render(<ContenedorDePrueba onSwipe={onSwipe} />);

    swipe(screen.getByTestId('contenedor'), { x: 300, y: 100 }, { x: 200, y: 100 }); // dx = -100

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith('izquierda');
  });

  it('swipe hacia la derecha dispara onSwipe("derecha")', () => {
    const onSwipe = vi.fn();
    render(<ContenedorDePrueba onSwipe={onSwipe} />);

    swipe(screen.getByTestId('contenedor'), { x: 100, y: 100 }, { x: 220, y: 100 }); // dx = +120

    expect(onSwipe).toHaveBeenCalledTimes(1);
    expect(onSwipe).toHaveBeenCalledWith('derecha');
  });

  it('un gesto vertical dominante no dispara onSwipe', () => {
    const onSwipe = vi.fn();
    render(<ContenedorDePrueba onSwipe={onSwipe} />);

    swipe(screen.getByTestId('contenedor'), { x: 200, y: 100 }, { x: 260, y: 260 }); // dx = 60, dy = 160

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('un desplazamiento corto (bajo el umbral) no dispara onSwipe', () => {
    const onSwipe = vi.fn();
    render(<ContenedorDePrueba onSwipe={onSwipe} />);

    swipe(screen.getByTestId('contenedor'), { x: 200, y: 100 }, { x: 220, y: 100 }); // dx = 20 < umbral

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('un tap (sin desplazamiento) no dispara onSwipe', () => {
    const onSwipe = vi.fn();
    render(<ContenedorDePrueba onSwipe={onSwipe} />);

    swipe(screen.getByTestId('contenedor'), { x: 200, y: 100 }, { x: 200, y: 100 });

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('un gesto que nace en un contenedor con scroll horizontal propio no dispara onSwipe', () => {
    const onSwipe = vi.fn();
    render(<ContenedorDePrueba onSwipe={onSwipe} />);

    const scrolleable = screen.getByTestId('scrolleable');
    marcarScrollHorizontal(scrolleable);

    swipe(screen.getByTestId('contenedor'), { x: 300, y: 100 }, { x: 200, y: 100 }, scrolleable);

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('multitouch (2+ dedos) descarta el gesto completo: un touchEnd posterior con dx grande no dispara onSwipe', () => {
    const onSwipe = vi.fn();
    render(<ContenedorDePrueba onSwipe={onSwipe} />);

    const contenedor = screen.getByTestId('contenedor');
    fireEvent.touchStart(contenedor, {
      touches: [
        { clientX: 300, clientY: 100 },
        { clientX: 50, clientY: 50 },
      ],
    });
    fireEvent.touchEnd(contenedor, { changedTouches: [{ clientX: 200, clientY: 100 }] }); // dx = -100

    expect(onSwipe).not.toHaveBeenCalled();
  });

  it('onTouchCancel resetea el gesto: un touchEnd posterior no dispara onSwipe', () => {
    const onSwipe = vi.fn();
    render(<ContenedorDePrueba onSwipe={onSwipe} />);

    const contenedor = screen.getByTestId('contenedor');
    fireEvent.touchStart(contenedor, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchCancel(contenedor);
    fireEvent.touchEnd(contenedor, { changedTouches: [{ clientX: 200, clientY: 100 }] }); // dx = -100

    expect(onSwipe).not.toHaveBeenCalled();
  });
});
