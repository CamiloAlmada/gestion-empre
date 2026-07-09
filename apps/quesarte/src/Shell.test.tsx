import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProveedorToasts } from '@gestion/ui';
import { Shell } from './Shell';
import { useHeader } from './componentes/header/ContextoHeader';

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

/** Pantalla de prueba que setea su propio header contextual, como haría
 * cualquier pantalla real con `useHeader()`. */
function PantallaConHeader({
  titulo,
  volverA,
  acciones,
}: {
  titulo: string;
  volverA?: { etiqueta: string; a: string };
  acciones?: ReactNode;
}) {
  useHeader({ titulo, volverA, acciones });
  return <div>Contenido de {titulo}</div>;
}

function renderizarEn(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorToasts>
        <Routes>
          <Route element={<Shell />}>
            <Route path="venta" element={<div>Contenido de Venta</div>} />
            <Route path="stock" element={<div>Contenido de Stock</div>} />
            <Route path="reportes" element={<div>Contenido de Reportes</div>} />
            <Route
              path="stock/productos"
              element={<PantallaConHeader titulo="Productos" volverA={{ etiqueta: 'Stock', a: '/stock' }} />}
            />
          </Route>
        </Routes>
      </ProveedorToasts>
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

  it('sin título contextual seteado, usa el fallback por tab', () => {
    configurarAuth('admin');

    renderizarEn('/reportes');

    expect(screen.getByRole('heading', { name: 'Reportes', level: 1 })).toBeTruthy();
  });

  it('una subvista con useHeader() reemplaza el título por tab y muestra el volver', () => {
    configurarAuth('admin');

    renderizarEn('/stock/productos');

    expect(screen.getByRole('heading', { name: 'Productos', level: 1 })).toBeTruthy();
    const volver = screen.getByRole('link', { name: /Stock/ });
    expect(volver.getAttribute('href')).toBe('/stock');
  });

  it('en línea, no muestra ningún indicador de conexión', () => {
    configurarAuth('admin');

    renderizarEn('/venta');

    expect(screen.queryByText('Sin conexión')).toBeNull();
    expect(screen.queryByText('En línea')).toBeNull();
  });

  it('sin conexión, muestra el chip "Sin conexión"', () => {
    configurarAuth('admin');
    mocks.useOnlineStatus.mockReturnValue(false);

    renderizarEn('/venta');

    expect(screen.getByRole('status').textContent).toContain('Sin conexión');
  });

  it('al reconectar (false→true), muestra un toast "Conexión restablecida"', () => {
    configurarAuth('admin');
    mocks.useOnlineStatus.mockReturnValue(false);

    renderizarEn('/venta');
    expect(screen.queryByText('Conexión restablecida')).toBeNull();

    act(() => {
      mocks.useOnlineStatus.mockReturnValue(true);
    });
    // El mock cambia el valor devuelto, pero `Shell` recién lo vuelve a leer
    // en su próximo render: se lo dispara navegando (cualquier cambio de
    // ruta re-renderiza `ShellInterior`, que llama a `useOnlineStatus()` de
    // nuevo).
    fireEvent.click(screen.getByRole('button', { name: /Stock/ }));

    expect(screen.getByText('Conexión restablecida')).toBeTruthy();
  });

  it('arrancar en línea NO dispara el toast de reconexión (no es un primer render offline→online)', () => {
    configurarAuth('admin');

    renderizarEn('/venta');

    expect(screen.queryByText('Conexión restablecida')).toBeNull();
  });

  describe('acciones contextuales: dual-render header/cluster (docs/06-ui-ux.md §2)', () => {
    it('con acciones, existen ambos renders (slot del header y cluster flotante) — la visibilidad la decide CSS, no jsdom (mismo patrón que el modo compacto de DataTable)', () => {
      configurarAuth('admin');

      render(
        <MemoryRouter initialEntries={['/stock/productos']}>
          <ProveedorToasts>
            <Routes>
              <Route element={<Shell />}>
                <Route
                  path="stock/productos"
                  element={
                    <PantallaConHeader
                      titulo="Productos"
                      volverA={{ etiqueta: 'Stock', a: '/stock' }}
                      acciones={<button type="button">Agregar producto</button>}
                    />
                  }
                />
              </Route>
            </Routes>
          </ProveedorToasts>
        </MemoryRouter>,
      );

      // El mismo nodo aparece dos veces en el DOM: una vez en el slot oculto
      // en mobile del header (`hidden md:flex`) y otra en el cluster
      // flotante oculto en desktop (`md:hidden`).
      expect(screen.getAllByRole('button', { name: 'Agregar producto' })).toHaveLength(2);
      expect(screen.getByTestId('cluster-acciones')).toBeTruthy();
      // El cluster vive DESPUÉS del contenido principal en el DOM (docs/06
      // §2: los lectores de pantalla llegan al contenido antes que acá).
      expect(
        screen
          .getByText('Contenido de Productos')
          .compareDocumentPosition(screen.getByTestId('cluster-acciones')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('sin acciones, no se renderiza el cluster flotante', () => {
      configurarAuth('admin');

      renderizarEn('/venta');

      expect(screen.queryByTestId('cluster-acciones')).toBeNull();
    });

    it('con acciones, el <main> suma el padding inferior extra (mobile) además del base', () => {
      configurarAuth('admin');

      const { container } = render(
        <MemoryRouter initialEntries={['/stock/productos']}>
          <ProveedorToasts>
            <Routes>
              <Route element={<Shell />}>
                <Route
                  path="stock/productos"
                  element={
                    <PantallaConHeader
                      titulo="Productos"
                      volverA={{ etiqueta: 'Stock', a: '/stock' }}
                      acciones={<button type="button">Agregar producto</button>}
                    />
                  }
                />
              </Route>
            </Routes>
          </ProveedorToasts>
        </MemoryRouter>,
      );

      const main = container.querySelector('main');
      expect(main?.className).toContain('pb-[calc(var(--altura-zona-inferior)+2rem+3.5rem)]');
      expect(main?.className).toContain('md:pb-[calc(var(--altura-zona-inferior)+2rem)]');
    });

    it('sin acciones, el <main> usa solo el padding inferior base', () => {
      configurarAuth('admin');

      const { container } = render(
        <MemoryRouter initialEntries={['/venta']}>
          <ProveedorToasts>
            <Routes>
              <Route element={<Shell />}>
                <Route path="venta" element={<div>Contenido de Venta</div>} />
              </Route>
            </Routes>
          </ProveedorToasts>
        </MemoryRouter>,
      );

      const main = container.querySelector('main');
      expect(main?.className).toBe(
        'mx-auto max-w-5xl p-4 pb-[calc(var(--altura-zona-inferior)+2rem)]',
      );
    });
  });
});
