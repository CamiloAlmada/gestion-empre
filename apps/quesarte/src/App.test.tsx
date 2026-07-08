import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from './App';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useOnlineStatus: mocks.useOnlineStatus,
}));

// AvisoPwa (montado siempre por App) importa el módulo virtual que expone
// vite-plugin-pwa en runtime real; no lo resuelve el vitest.config.ts de la
// app (no carga ese plugin). Se mockea el componente entero para no cargar
// ese import transitivo — no se toca AvisoPwa.tsx.
vi.mock('./componentes/AvisoPwa', () => ({
  AvisoPwa: () => null,
}));

// Productos (pantalla de /stock/productos) arma su query de Firestore al
// importarse (`collection(db, 'productos')`, ver Productos.tsx), lo que
// exige un `db` real: el mock de @gestion/firebase-kit de este archivo no
// implementa `initFirebase`. Este suite solo prueba ruteo (no el contenido
// de Productos, que tiene su propio Productos.test.tsx), así que se mockea
// el componente entero — mismo criterio que AvisoPwa arriba.
vi.mock('./pantallas/Productos', () => ({
  Productos: () => null,
}));

function configurarAuth(rol: 'admin' | 'vendedor') {
  mocks.useAuth.mockReturnValue({
    usuario: { uid: 'u1' },
    perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@a.com', rol, activo: true },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn().mockResolvedValue(undefined),
  });
}

function renderizarEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <App />
    </MemoryRouter>,
  );
}

describe('App - rutas', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('"/" redirige a la pantalla de Venta', () => {
    configurarAuth('vendedor');

    renderizarEn('/');

    // El header (h1) y el placeholder de la sección (h2) muestran el mismo
    // título; se distingue por nivel para no chocar con getByRole.
    expect(screen.getByRole('heading', { name: 'Venta', level: 1 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Venta', level: 2 })).toBeTruthy();
  });

  it('vendedor que navega a /reportes es redirigido a Venta', () => {
    configurarAuth('vendedor');

    renderizarEn('/reportes');

    expect(screen.getByRole('heading', { name: 'Venta', level: 1 })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Reportes' })).toBeNull();
  });

  it('admin que navega a /reportes ve la pantalla de Reportes', () => {
    configurarAuth('admin');

    renderizarEn('/reportes');

    expect(screen.getByRole('heading', { name: 'Reportes', level: 1 })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Reportes', level: 2 })).toBeTruthy();
  });
});
