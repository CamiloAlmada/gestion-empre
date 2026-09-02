import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { RutaProtegida } from './RutaProtegida';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useOnlineStatus: mocks.useOnlineStatus,
}));

interface EstadoAuthMock {
  usuario: { uid: string } | null;
  perfil: { activo: boolean } | null;
  cargando: boolean;
  salir: ReturnType<typeof vi.fn>;
}

function configurarAuth(overrides: Partial<EstadoAuthMock> = {}) {
  const valor: EstadoAuthMock = {
    usuario: null,
    perfil: null,
    cargando: false,
    salir: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  mocks.useAuth.mockReturnValue(valor);
  return valor;
}

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

  it('mientras carga, no muestra ni el contenido protegido ni la pantalla de login', () => {
    configurarAuth({ cargando: true });

    renderizarConRutas();

    expect(screen.queryByText('Contenido protegido')).toBeNull();
    expect(screen.queryByText('Pantalla de login')).toBeNull();
    expect(screen.getByText('Cargando…')).toBeTruthy();
    expect(
      screen.queryByText('No pudimos verificar tu cuenta. Revisá la conexión; seguimos intentando.'),
    ).toBeNull();
  });

  it('si cargando se extiende más de 10s, muestra el mensaje de conexión y permite cerrar sesión', () => {
    vi.useFakeTimers();
    try {
      const auth = configurarAuth({ cargando: true });

      renderizarConRutas();

      expect(
        screen.queryByText('No pudimos verificar tu cuenta. Revisá la conexión; seguimos intentando.'),
      ).toBeNull();

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(
        screen.getByText('No pudimos verificar tu cuenta. Revisá la conexión; seguimos intentando.'),
      ).toBeTruthy();
      expect(screen.queryByText('Cargando…')).toBeNull();

      fireEvent.click(screen.getByText('Cerrar sesión'));

      expect(auth.salir).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('si cargando pasa a false antes de los 10s, el mensaje de conexión nunca aparece', () => {
    vi.useFakeTimers();
    try {
      configurarAuth({ cargando: true });

      const { rerender } = renderizarConRutas();

      act(() => {
        vi.advanceTimersByTime(5_000);
      });

      configurarAuth({ usuario: { uid: 'u1' }, perfil: { activo: true }, cargando: false });
      rerender(
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

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(
        screen.queryByText('No pudimos verificar tu cuenta. Revisá la conexión; seguimos intentando.'),
      ).toBeNull();
      expect(screen.getByText('Contenido protegido')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('sin usuario, redirige a /login', () => {
    configurarAuth({ usuario: null });

    renderizarConRutas();

    expect(screen.getByText('Pantalla de login')).toBeTruthy();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
  });

  it('con usuario y perfil activo, renderiza el contenido protegido', () => {
    configurarAuth({ usuario: { uid: 'u1' }, perfil: { activo: true } });

    renderizarConRutas();

    expect(screen.getByText('Contenido protegido')).toBeTruthy();
    expect(screen.queryByText('Pantalla de login')).toBeNull();
  });

  it('con usuario pero perfil desactivado, muestra "Cuenta no autorizada" y no el contenido', () => {
    configurarAuth({ usuario: { uid: 'u1' }, perfil: { activo: false } });

    renderizarConRutas();

    expect(screen.getByText('Cuenta no autorizada')).toBeTruthy();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
  });

  it('con usuario pero sin perfil (doc inexistente), muestra "Cuenta no autorizada"', () => {
    configurarAuth({ usuario: { uid: 'u1' }, perfil: null });

    renderizarConRutas();

    expect(screen.getByText('Cuenta no autorizada')).toBeTruthy();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
  });

  it('en "Cuenta no autorizada", el botón Salir llama a salir()', () => {
    const auth = configurarAuth({ usuario: { uid: 'u1' }, perfil: { activo: false } });

    renderizarConRutas();

    fireEvent.click(screen.getByText('Salir'));

    expect(auth.salir).toHaveBeenCalledTimes(1);
  });
});
