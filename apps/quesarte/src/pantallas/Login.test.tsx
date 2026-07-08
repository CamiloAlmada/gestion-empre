import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Login } from './Login';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useOnlineStatus: mocks.useOnlineStatus,
}));

function authPorDefecto() {
  return {
    usuario: null as { uid: string } | null,
    perfil: null as { activo: boolean } | null,
    cargando: false,
    ingresarConEmail: vi.fn().mockResolvedValue(undefined),
    restablecerPassword: vi.fn().mockResolvedValue(undefined),
    salir: vi.fn().mockResolvedValue(undefined),
  };
}

function configurarAuth(overrides: Partial<ReturnType<typeof authPorDefecto>> = {}) {
  const valor = { ...authPorDefecto(), ...overrides };
  mocks.useAuth.mockReturnValue(valor);
  return valor;
}

const MENSAJE_RESET_NEUTRO =
  'Si existe una cuenta con ese correo, te enviamos un email para restablecer la contraseña.';

describe('Login', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('no ofrece el ingreso con Google', () => {
    configurarAuth();
    render(<Login />);

    expect(screen.queryByText(/Google/i)).toBeNull();
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

  it('con Enter en el campo Correo y credenciales completas, llama a ingresarConEmail', async () => {
    const auth = configurarAuth();
    render(<Login />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'a@a.com' } });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secreta123' } });
    fireEvent.keyDown(screen.getByLabelText('Correo'), { key: 'Enter' });

    await waitFor(() => {
      expect(auth.ingresarConEmail).toHaveBeenCalledWith('a@a.com', 'secreta123');
    });
  });

  it('con una sesión activa, no renderiza el formulario (redirige a /)', () => {
    configurarAuth({ usuario: { uid: 'u1' } });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>Home protegida</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Ingresar')).toBeNull();
    expect(screen.getByText('Home protegida')).toBeTruthy();
  });

  it('reset con el correo vacío pide el correo y no llama a restablecerPassword', () => {
    const auth = configurarAuth();
    render(<Login />);

    fireEvent.click(screen.getByText('¿Olvidaste tu contraseña?'));

    expect(screen.getByRole('alert').textContent).toBe(
      'Ingresá tu correo para restablecer la contraseña.',
    );
    expect(auth.restablecerPassword).not.toHaveBeenCalled();
  });

  it('reset con correo llama a restablecerPassword y muestra el mensaje neutro', async () => {
    const auth = configurarAuth();
    render(<Login />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: '  a@a.com  ' } });
    fireEvent.click(screen.getByText('¿Olvidaste tu contraseña?'));

    await waitFor(() => {
      expect(auth.restablecerPassword).toHaveBeenCalledWith('a@a.com');
    });
    const aviso = await screen.findByRole('status');
    expect(aviso.textContent).toBe(MENSAJE_RESET_NEUTRO);
  });

  it('reset muestra el mismo mensaje neutro aunque restablecerPassword falle (no revela cuentas)', async () => {
    configurarAuth({
      restablecerPassword: vi.fn().mockRejectedValue({ code: 'auth/user-not-found' }),
    });
    render(<Login />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'nadie@a.com' } });
    fireEvent.click(screen.getByText('¿Olvidaste tu contraseña?'));

    const aviso = await screen.findByRole('status');
    expect(aviso.textContent).toBe(MENSAJE_RESET_NEUTRO);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
