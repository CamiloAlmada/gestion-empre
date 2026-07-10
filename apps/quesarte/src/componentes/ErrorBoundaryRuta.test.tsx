import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ErrorBoundaryRuta } from './ErrorBoundaryRuta';

function ComponenteQueRompe(): never {
  throw new Error('boom de prueba');
}

function ComponenteOk() {
  return <p>Todo bien</p>;
}

function renderizar(children: ReactNode, ruta = '/stock') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/stock" element={children} />
        <Route path="/venta" element={<div>Pantalla Venta</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundaryRuta', () => {
  it('sin error: renderiza los hijos normalmente', () => {
    renderizar(
      <ErrorBoundaryRuta>
        <ComponenteOk />
      </ErrorBoundaryRuta>,
    );

    expect(screen.getByText('Todo bien')).toBeTruthy();
  });

  it('un hijo que lanza en render: muestra el mensaje de error en español con acciones', () => {
    // El error real IGUAL se loguea a consola (React + nuestro componentDidCatch);
    // se silencia acá para no ensuciar la salida del test runner.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderizar(
      <ErrorBoundaryRuta>
        <ComponenteQueRompe />
      </ErrorBoundaryRuta>,
    );

    expect(screen.getByRole('alert').textContent).toContain('Algo salió mal.');
    expect(screen.getByRole('link', { name: 'Volver a Venta' }).getAttribute('href')).toBe('/venta');
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeTruthy();
  });

  it('"Volver a Venta" navega (el link apunta a /venta, ruta que el boundary no bloquea)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderizar(
      <ErrorBoundaryRuta>
        <ComponenteQueRompe />
      </ErrorBoundaryRuta>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Volver a Venta' }));

    expect(screen.getByText('Pantalla Venta')).toBeTruthy();
  });
});
