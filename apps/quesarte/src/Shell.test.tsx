import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Shell } from './Shell';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useOnlineStatus: mocks.useOnlineStatus,
}));

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

function renderizarEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route element={<Shell />}>
          <Route path="venta" element={<div>Contenido de Venta</div>} />
          <Route path="stock" element={<div>Contenido de Stock</div>} />
          <Route path="reportes" element={<div>Contenido de Reportes</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('Shell', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
  });

  it('vendedor no ve el tab Reportes', () => {
    configurarAuth('vendedor');

    renderizarEn('/venta');

    expect(screen.queryByRole('button', { name: /Reportes/ })).toBeNull();
  });

  it('admin sí ve el tab Reportes', () => {
    configurarAuth('admin');

    renderizarEn('/venta');

    expect(screen.getByRole('button', { name: /Reportes/ })).toBeTruthy();
  });

  it('el tab activo refleja la ruta actual', () => {
    configurarAuth('admin');

    renderizarEn('/stock');

    expect(screen.getByRole('button', { name: /Stock/ }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('button', { name: 'Venta' }).getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Stock' })).toBeTruthy();
  });

  it('tocar un tab navega a su ruta', () => {
    configurarAuth('admin');

    renderizarEn('/venta');
    fireEvent.click(screen.getByRole('button', { name: /Stock/ }));

    expect(screen.getByText('Contenido de Stock')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Stock/ }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('muestra el indicador de conexión "En línea"', () => {
    configurarAuth('admin');

    renderizarEn('/venta');

    expect(screen.getByText('En línea')).toBeTruthy();
  });

  it('sin conexión, muestra "Sin conexión"', () => {
    configurarAuth('admin');
    mocks.useOnlineStatus.mockReturnValue(false);

    renderizarEn('/venta');

    expect(screen.getByText('Sin conexión')).toBeTruthy();
  });
});
