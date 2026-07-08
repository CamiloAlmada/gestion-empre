import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { RutaProtegida } from './RutaProtegida';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  initFirebase: vi.fn(() => ({ app: {}, auth: {}, db: {} })),
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  initFirebase: mocks.initFirebase,
  useOnlineStatus: mocks.useOnlineStatus,
}));

function renderizarConRutas() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>Pantalla de login</div>} />
        <Route
          path="/"
          element={
            <RutaProtegida>
              <div>Contenido protegido</div>
            </RutaProtegida>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RutaProtegida', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('sin usuario, redirige a /login', () => {
    mocks.useAuth.mockReturnValue({
      usuario: null,
      cargando: false,
      ingresarConEmail: vi.fn(),
      ingresarConGoogle: vi.fn(),
      salir: vi.fn(),
    });

    renderizarConRutas();

    expect(screen.getByText('Pantalla de login')).toBeTruthy();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
  });

  it('con usuario, renderiza el contenido protegido', () => {
    mocks.useAuth.mockReturnValue({
      usuario: { uid: 'u1' },
      cargando: false,
      ingresarConEmail: vi.fn(),
      ingresarConGoogle: vi.fn(),
      salir: vi.fn(),
    });

    renderizarConRutas();

    expect(screen.getByText('Contenido protegido')).toBeTruthy();
    expect(screen.queryByText('Pantalla de login')).toBeNull();
  });

  it('mientras carga, no muestra ni el contenido protegido ni la pantalla de login', () => {
    mocks.useAuth.mockReturnValue({
      usuario: null,
      cargando: true,
      ingresarConEmail: vi.fn(),
      ingresarConGoogle: vi.fn(),
      salir: vi.fn(),
    });

    renderizarConRutas();

    expect(screen.queryByText('Contenido protegido')).toBeNull();
    expect(screen.queryByText('Pantalla de login')).toBeNull();
  });
});
