import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { RutaSoloAdmin } from './RutaSoloAdmin';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
}));

function configurarAuth(rol: 'admin' | 'vendedor') {
  mocks.useAuth.mockReturnValue({
    usuario: { uid: 'u1' },
    perfil: { uid: 'u1', nombre: 'Ana', email: 'a@a.com', rol, activo: true },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn(),
  });
}

function renderizarConRutas() {
  return render(
    <MemoryRouter initialEntries={['/reportes']}>
      <Routes>
        <Route path="/venta" element={<div>Pantalla de Venta</div>} />
        <Route
          path="/reportes"
          element={
            <RutaSoloAdmin>
              <div>Contenido de Reportes</div>
            </RutaSoloAdmin>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RutaSoloAdmin', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('con rol vendedor, redirige a /venta y no muestra el contenido', () => {
    configurarAuth('vendedor');

    renderizarConRutas();

    expect(screen.getByText('Pantalla de Venta')).toBeTruthy();
    expect(screen.queryByText('Contenido de Reportes')).toBeNull();
  });

  it('con rol admin, renderiza el contenido protegido', () => {
    configurarAuth('admin');

    renderizarConRutas();

    expect(screen.getByText('Contenido de Reportes')).toBeTruthy();
    expect(screen.queryByText('Pantalla de Venta')).toBeNull();
  });
});
