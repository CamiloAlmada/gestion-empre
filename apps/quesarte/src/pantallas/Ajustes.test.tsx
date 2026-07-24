import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ProveedorTema } from '@gestion/ui';
import { Ajustes } from './Ajustes';
import { ProveedorHeader } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
}));

// `SeccionNegocio`/`SeccionPlantillasWhatsApp` tienen sus propias suites
// (`componentes/ajustes/*.test.tsx`) con el mock completo de Firestore que
// necesitan sus lecturas/escrituras en vivo. Acá solo importa el GATEO por
// rol (admin ve las 2 secciones, vendedor ninguna) — mockearlas a un
// placeholder evita duplicar ese mock pesado en un archivo que, si no,
// seguiría siendo el más liviano de las pantallas.
vi.mock('../componentes/ajustes/SeccionNegocio', () => ({
  SeccionNegocio: () => <div data-testid="seccion-negocio" />,
}));
vi.mock('../componentes/ajustes/SeccionPlantillasWhatsApp', () => ({
  SeccionPlantillasWhatsApp: () => <div data-testid="seccion-plantillas-whatsapp" />,
}));
// Mismo criterio que SeccionNegocio/SeccionPlantillasWhatsApp arriba:
// `SeccionColoresNegocio` (tanda TM) tiene su propia suite
// (`componentes/ajustes/SeccionColoresNegocio.test.tsx`) con el mock de
// Firestore/`useTemaNegocio` que necesita — acá solo importa el GATEO por
// rol dentro de "Apariencia".
vi.mock('../componentes/ajustes/SeccionColoresNegocio', () => ({
  SeccionColoresNegocio: () => <div data-testid="seccion-colores-negocio" />,
}));

function configurarAuth(overrides: Partial<ReturnType<typeof authPorDefecto>> = {}) {
  const valor = { ...authPorDefecto(), ...overrides };
  mocks.useAuth.mockReturnValue(valor);
  return valor;
}

function authPorDefecto() {
  return {
    usuario: { uid: 'u1' },
    perfil: {
      uid: 'u1',
      nombre: 'Ana Pérez',
      email: 'ana@quesarte.com',
      rol: 'vendedor' as 'admin' | 'vendedor',
      activo: true,
    },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn().mockResolvedValue(undefined),
  };
}

function renderizar() {
  return render(
    <MemoryRouter>
      <ProveedorTema>
        <ProveedorHeader>
          <Ajustes />
        </ProveedorHeader>
      </ProveedorTema>
    </MemoryRouter>,
  );
}

describe('Ajustes', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-estilo');
  });

  it('muestra nombre, correo y rol (en español) del perfil', () => {
    configurarAuth();

    renderizar();

    expect(screen.getByText('Ana Pérez')).toBeTruthy();
    expect(screen.getByText('ana@quesarte.com')).toBeTruthy();
    expect(screen.getByText('Vendedor')).toBeTruthy();
  });

  it('perfil admin muestra el rol como "Administrador"', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'admin' } });

    renderizar();

    expect(screen.getByText('Administrador')).toBeTruthy();
  });

  it('elegir "Oscuro" aplica data-theme="dark"', () => {
    configurarAuth();

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Oscuro' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('elegir "Sistema" quita el data-theme fijado', () => {
    configurarAuth();

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sistema' }));

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('elegir "Cálido" aplica data-estilo="calido"', () => {
    configurarAuth();

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Cálido' }));

    expect(document.documentElement.getAttribute('data-estilo')).toBe('calido');
    expect(screen.getByRole('button', { name: 'Cálido' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('elegir "Minimalista" quita el data-estilo fijado', () => {
    configurarAuth();

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Cálido' }));
    fireEvent.click(screen.getByRole('button', { name: 'Minimalista' }));

    expect(document.documentElement.hasAttribute('data-estilo')).toBe(false);
    expect(screen.getByRole('button', { name: 'Minimalista' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('expone los grupos "Modo" y "Estilo" como grupos ARIA distintos', () => {
    configurarAuth();

    renderizar();

    expect(screen.getByRole('group', { name: 'Modo' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Estilo' })).toBeTruthy();
  });

  it('cambiar el estilo no afecta el tema elegido, y viceversa', () => {
    configurarAuth();

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cálido' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-estilo')).toBe('calido');
  });

  it('el botón Salir llama a salir()', () => {
    const auth = configurarAuth();

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Salir' }));

    expect(auth.salir).toHaveBeenCalledTimes(1);
  });

  it('vendedor no ve la sección Categorías (UI-5c)', () => {
    configurarAuth();

    renderizar();

    expect(screen.queryByText('Categorías')).toBeNull();
  });

  it('admin ve la sección Categorías con un link a /ajustes/categorias (UI-5c)', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'admin' } });

    renderizar();

    const link = screen.getByRole('link', { name: /Gestión de categorías/ });
    expect(link.getAttribute('href')).toBe('/ajustes/categorias');
  });

  it('vendedor no ve la sección Usuarios', () => {
    configurarAuth();

    renderizar();

    expect(screen.queryByText('Usuarios')).toBeNull();
  });

  it('admin ve la sección Usuarios con un link a /ajustes/usuarios', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'admin' } });

    renderizar();

    const link = screen.getByRole('link', { name: /Gestión de usuarios/ });
    expect(link.getAttribute('href')).toBe('/ajustes/usuarios');
  });

  it('vendedor no ve las secciones "Negocio" ni "Plantillas de WhatsApp" (doc 08)', () => {
    configurarAuth();

    renderizar();

    expect(screen.queryByText('Negocio')).toBeNull();
    expect(screen.queryByText('Plantillas de WhatsApp')).toBeNull();
    expect(screen.queryByTestId('seccion-negocio')).toBeNull();
    expect(screen.queryByTestId('seccion-plantillas-whatsapp')).toBeNull();
  });

  it('admin ve las secciones "Negocio" y "Plantillas de WhatsApp" (doc 08)', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'admin' } });

    renderizar();

    expect(screen.getByText('Negocio')).toBeTruthy();
    expect(screen.getByText('Plantillas de WhatsApp')).toBeTruthy();
    expect(screen.getByTestId('seccion-negocio')).toBeTruthy();
    expect(screen.getByTestId('seccion-plantillas-whatsapp')).toBeTruthy();
  });

  it('vendedor no ve "Colores del negocio" dentro de Apariencia (tanda TM: config del negocio, no personal)', () => {
    configurarAuth();

    renderizar();

    expect(screen.queryByTestId('seccion-colores-negocio')).toBeNull();
  });

  it('admin ve "Colores del negocio" dentro de Apariencia (tanda TM)', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'admin' } });

    renderizar();

    expect(screen.getByTestId('seccion-colores-negocio')).toBeTruthy();
  });
});
