import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Login } from './Login';

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

function configurarAuth(overrides: Partial<ReturnType<typeof authPorDefecto>> = {}) {
  const valor = { ...authPorDefecto(), ...overrides };
  mocks.useAuth.mockReturnValue(valor);
  return valor;
}

function authPorDefecto() {
  return {
    usuario: null,
    cargando: false,
    ingresarConEmail: vi.fn().mockResolvedValue(undefined),
    ingresarConGoogle: vi.fn().mockResolvedValue(undefined),
    salir: vi.fn().mockResolvedValue(undefined),
  };
}

describe('Login', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('con campos vacíos, "Ingresar" muestra un error de validación y no llama a ingresarConEmail', () => {
    const auth = configurarAuth();
    render(<Login />);

    fireEvent.click(screen.getByText('Ingresar'));

    expect(screen.getByRole('alert').textContent).toBe('Completá el correo y la contraseña.');
    expect(auth.ingresarConEmail).not.toHaveBeenCalled();
  });

  it('con credenciales completas, llama a ingresarConEmail con el correo y la contraseña', async () => {
    const auth = configurarAuth();
    render(<Login />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreta123' } });
    fireEvent.click(screen.getByText('Ingresar'));

    await waitFor(() => {
      expect(auth.ingresarConEmail).toHaveBeenCalledWith('a@a.com', 'secreta123');
    });
  });

  it('muestra un mensaje en español cuando Firebase devuelve auth/invalid-credential', async () => {
    configurarAuth({
      ingresarConEmail: vi.fn().mockRejectedValue({ code: 'auth/invalid-credential' }),
    });
    render(<Login />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'mal' } });
    fireEvent.click(screen.getByText('Ingresar'));

    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toBe('El correo o la contraseña son incorrectos.');
  });
});
