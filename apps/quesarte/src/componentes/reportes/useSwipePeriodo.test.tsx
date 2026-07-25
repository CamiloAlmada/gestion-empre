import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Granularidad } from '@gestion/core';
import { useSwipePeriodo } from './useSwipePeriodo';

afterEach(cleanup);

/** Harness mínimo: contenedor con los handlers del hook + un hijo con scroll
 * horizontal propio (como el `GrupoSegmentado` real del selector de período
 * en `Reportes.tsx`), sin depender de router ni de Firestore. */
function ContenedorDePrueba({
  granularidad,
  onCambiar,
}: {
  granularidad: Granularidad;
  onCambiar: (valor: Granularidad) => void;
}) {
  const { ref, onTouchStart, onTouchEnd, onTouchCancel } = useSwipePeriodo(granularidad, onCambiar);
  return (
    <div
      data-testid="contenedor"
      ref={ref}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <div data-testid="selector" style={{ overflowX: 'auto' }}>
        selector de período
      </div>
    </div>
  );
}

/** Simula un nodo con scroll horizontal propio: jsdom no calcula layout real,
 * así que `scrollWidth`/`clientWidth` se fuerzan a mano (mismo criterio que
 * usa `useSwipeSeccion.test.tsx` para excluir el `SelectorSeccion` real). */
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

// Orden contractual del selector: Día → Semana → Mes.
describe('useSwipePeriodo', () => {
  it('swipe hacia la izquierda avanza de Día a Semana', () => {
    const onCambiar = vi.fn();
    render(<ContenedorDePrueba granularidad="dia" onCambiar={onCambiar} />);

    swipe(screen.getByTestId('contenedor'), { x: 300, y: 100 }, { x: 200, y: 100 }); // dx = -100

    expect(onCambiar).toHaveBeenCalledTimes(1);
    expect(onCambiar).toHaveBeenCalledWith('semana');
  });

  it('swipe hacia la derecha retrocede de Mes a Semana', () => {
    const onCambiar = vi.fn();
    render(<ContenedorDePrueba granularidad="mes" onCambiar={onCambiar} />);

    swipe(screen.getByTestId('contenedor'), { x: 100, y: 100 }, { x: 220, y: 100 }); // dx = +120

    expect(onCambiar).toHaveBeenCalledTimes(1);
    expect(onCambiar).toHaveBeenCalledWith('semana');
  });

  it('en el último período (Mes), swipe hacia la izquierda no hace nada (sin wrap-around)', () => {
    const onCambiar = vi.fn();
    render(<ContenedorDePrueba granularidad="mes" onCambiar={onCambiar} />);

    swipe(screen.getByTestId('contenedor'), { x: 300, y: 100 }, { x: 200, y: 100 });

    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('en el primer período (Día), swipe hacia la derecha no hace nada (sin wrap-around)', () => {
    const onCambiar = vi.fn();
    render(<ContenedorDePrueba granularidad="dia" onCambiar={onCambiar} />);

    swipe(screen.getByTestId('contenedor'), { x: 100, y: 100 }, { x: 220, y: 100 });

    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('un gesto vertical dominante no cambia el período', () => {
    const onCambiar = vi.fn();
    render(<ContenedorDePrueba granularidad="semana" onCambiar={onCambiar} />);

    swipe(screen.getByTestId('contenedor'), { x: 200, y: 100 }, { x: 260, y: 260 }); // dx = 60, dy = 160

    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('un gesto que nace en un contenedor con scroll horizontal propio no cambia el período', () => {
    const onCambiar = vi.fn();
    render(<ContenedorDePrueba granularidad="semana" onCambiar={onCambiar} />);

    const selector = screen.getByTestId('selector');
    marcarScrollHorizontal(selector);

    swipe(screen.getByTestId('contenedor'), { x: 300, y: 100 }, { x: 200, y: 100 }, selector);

    expect(onCambiar).not.toHaveBeenCalled();
  });
});
