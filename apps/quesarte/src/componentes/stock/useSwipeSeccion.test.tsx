import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router';
import { itemsSelectorStock, type ItemSelectorSeccion } from './SelectorSeccion';
import { useSwipeSeccion } from './useSwipeSeccion';

afterEach(cleanup);

/** Harness mínimo: reproduce la forma real de `StockLayout` (contenedor con
 * los handlers del hook + un hijo con scroll horizontal propio, como el
 * `SelectorSeccion` real) sin depender de `useAuth`/Firebase. Expone el
 * `pathname` actual (`data-testid="pathname"`) para poder afirmar "no
 * navegó" incluso en árboles sin una ruta de destino registrada (ver el
 * test de `pathname` sin match en `items`). */
function LayoutDePrueba({ items }: { items: ItemSelectorSeccion[] }) {
  const { ref, onTouchStart, onTouchEnd, onTouchCancel } = useSwipeSeccion(items);
  const location = useLocation();
  return (
    <div
      data-testid="layout"
      ref={ref}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
    >
      <span data-testid="pathname">{location.pathname}</span>
      <div data-testid="scrolleable" style={{ overflowX: 'auto' }}>
        selector
      </div>
      <Outlet />
    </div>
  );
}

function renderizar(pathname: string, items: ItemSelectorSeccion[]) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route element={<LayoutDePrueba items={items} />}>
          {items.map((item) => (
            <Route key={item.id} path={item.a} element={<div>Pantalla {item.etiqueta}</div>} />
          ))}
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

/** Simula un nodo con scroll horizontal propio: jsdom no calcula layout real,
 * así que `scrollWidth`/`clientWidth` se fuerzan a mano (mismo criterio que
 * usa el hook para excluir el `SelectorSeccion` y tablas con overflow). */
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

describe('useSwipeSeccion', () => {
  it('swipe hacia la izquierda navega a la sección siguiente', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock', items);

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 300, y: 100 }, { x: 200, y: 100 }); // dx = -100

    expect(screen.getByText('Pantalla Catálogo')).toBeTruthy();
  });

  it('swipe hacia la derecha navega a la sección anterior', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock/productos', items);

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 100, y: 100 }, { x: 220, y: 100 }); // dx = +120

    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('un gesto vertical dominante no navega', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock', items);

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 200, y: 100 }, { x: 260, y: 260 }); // dx = 60, dy = 160

    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('un desplazamiento corto (bajo el umbral) no navega', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock', items);

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 200, y: 100 }, { x: 220, y: 100 }); // dx = 20 < umbral

    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('un tap (sin desplazamiento) no navega', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock', items);

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 200, y: 100 }, { x: 200, y: 100 });

    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('en el último ítem, swipe hacia la izquierda no hace nada (sin wrap-around)', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock/categorias', items);

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 300, y: 100 }, { x: 200, y: 100 });

    expect(screen.getByText('Pantalla Categorías')).toBeTruthy();
  });

  it('en el primer ítem, swipe hacia la derecha no hace nada (sin wrap-around)', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock', items);

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 100, y: 100 }, { x: 220, y: 100 });

    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('un gesto que nace en un contenedor con scroll horizontal propio no navega', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock', items);

    const scrolleable = screen.getByTestId('scrolleable');
    marcarScrollHorizontal(scrolleable);

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 300, y: 100 }, { x: 200, y: 100 }, scrolleable);

    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('vendedor: el orden de vecinos respeta el rol (solo Stock↔Catálogo)', () => {
    const items = itemsSelectorStock(false);
    renderizar('/stock', items);

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 300, y: 100 }, { x: 200, y: 100 });

    expect(screen.getByText('Pantalla Catálogo')).toBeTruthy();
  });

  it('multitouch (2+ dedos) descarta el gesto completo: un touchEnd posterior con dx grande no navega', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock', items);

    const layout = screen.getByTestId('layout');
    fireEvent.touchStart(layout, {
      touches: [
        { clientX: 300, clientY: 100 },
        { clientX: 50, clientY: 50 },
      ],
    });
    fireEvent.touchEnd(layout, { changedTouches: [{ clientX: 200, clientY: 100 }] }); // dx = -100

    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('onTouchCancel resetea el gesto: un touchEnd posterior no navega', () => {
    const items = itemsSelectorStock(true);
    renderizar('/stock', items);

    const layout = screen.getByTestId('layout');
    fireEvent.touchStart(layout, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchCancel(layout);
    fireEvent.touchEnd(layout, { changedTouches: [{ clientX: 200, clientY: 100 }] }); // dx = -100

    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('pathname sin match en items (p. ej. montado en una ficha de detalle fuera del layout): un swipe válido no navega', () => {
    const items = itemsSelectorStock(true);
    render(
      <MemoryRouter initialEntries={['/stock/producto/123']}>
        <Routes>
          <Route path="/stock/producto/:id" element={<LayoutDePrueba items={items} />} />
        </Routes>
      </MemoryRouter>,
    );

    const layout = screen.getByTestId('layout');
    swipe(layout, { x: 300, y: 100 }, { x: 200, y: 100 }); // dx = -100, gesto válido

    // `indiceActual === -1` (el pathname no está en `items`): el gesto se
    // descarta sin navegar. No hay rutas de sección registradas en este
    // árbol, así que si hubiera navegado no quedaría nada montado en su
    // lugar — el pathname expuesto por el harness sigue siendo el mismo.
    expect(screen.getByTestId('pathname').textContent).toBe('/stock/producto/123');
  });
});
