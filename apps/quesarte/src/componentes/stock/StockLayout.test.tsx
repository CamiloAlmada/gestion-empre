import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { StockLayout } from './StockLayout';

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@gestion/firebase-kit', () => ({ useAuth: mocks.useAuth }));

function configurarAuth(rol: 'admin' | 'vendedor') {
  mocks.useAuth.mockReturnValue({
    usuario: { uid: 'u1' },
    perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@a.com', rol, activo: true },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn(),
  });
}

/** Árbol mínimo: dos rutas hermanas de Stock bajo el layout, más una ficha de
 * detalle AFUERA de él (mismo esquema real de App.tsx) para confirmar que el
 * layout no se cuela ahí. */
function renderizar(pathname = '/stock') {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route element={<StockLayout />}>
          <Route path="/stock" element={<div>Pantalla Stock</div>} />
          <Route path="/stock/productos" element={<div>Pantalla Catálogo</div>} />
        </Route>
        <Route path="/stock/producto/:id" element={<div>Ficha de producto</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StockLayout', () => {
  it('renderiza el SelectorSeccion y el contenido de la ruta activa (Outlet)', () => {
    configurarAuth('admin');
    renderizar('/stock');

    expect(screen.getByRole('navigation', { name: 'Secciones de Stock' })).toBeTruthy();
    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('vendedor: el selector no muestra las secciones solo-admin (Compras/Categorías)', () => {
    configurarAuth('vendedor');
    renderizar('/stock');

    expect(screen.queryByRole('link', { name: 'Compras' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Categorías' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Catálogo' })).toBeTruthy();
  });

  it('el selector NO se remonta al navegar entre secciones hermanas: mismo nodo antes y después', () => {
    configurarAuth('admin');
    renderizar('/stock');

    const navAntes = screen.getByRole('navigation', { name: 'Secciones de Stock' });

    fireEvent.click(screen.getByRole('link', { name: 'Catálogo' }));

    expect(screen.getByText('Pantalla Catálogo')).toBeTruthy();
    expect(screen.queryByText('Pantalla Stock')).toBeNull();
    // Identidad de nodo (no solo contenido): si el layout se remontara al
    // navegar, `getByRole` seguiría encontrando un <nav> con el mismo rol,
    // pero sería un elemento DEL DOM distinto — `toBe` (no `toEqual`) es lo
    // que discrimina remount de reuso.
    const navDespues = screen.getByRole('navigation', { name: 'Secciones de Stock' });
    expect(navDespues).toBe(navAntes);
  });
});
