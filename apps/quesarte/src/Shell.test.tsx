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

/** Pantalla de prueba que lanza en el render (simula un crash real de
 * pantalla, como el hallazgo B1 de `CompraPantalla`), para probar
 * `ErrorBoundaryRuta`. */
function PantallaQueRompe(): never {
  throw new Error('boom de prueba');
}

/** Pantalla de prueba que setea su propio header contextual, como haría
 * cualquier pantalla real con `useHeader()`. */
function PantallaConHeader({
  titulo,
  volverA,
  acciones,
  accionHeader,
}: {
  titulo: string;
  volverA?: { etiqueta: string; a: string };
  acciones?: ReactNode;
  accionHeader?: ReactNode;
}) {
  useHeader({ titulo, volverA, acciones, accionHeader });
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
            <Route path="clientes" element={<div>Contenido de Clientes</div>} />
            <Route
              path="historial"
              element={<PantallaConHeader titulo="Historial" volverA={{ etiqueta: 'Clientes', a: '/clientes' }} />}
            />
            <Route path="reportes" element={<div>Contenido de Reportes</div>} />
            <Route
              path="stock/productos"
              element={<PantallaConHeader titulo="Productos" volverA={{ etiqueta: 'Stock', a: '/stock' }} />}
            />
            <Route path="stock/roto" element={<PantallaQueRompe />} />
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

  describe('tab Clientes (docs/06-ui-ux.md §2, 2026-07-10: reemplaza a Historial)', () => {
    it('la tab bar muestra "Clientes" y no "Historial"', () => {
      configurarAuth('admin');

      renderizarEn('/clientes');

      expect(screen.getByRole('button', { name: /Clientes/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Historial$/ })).toBeNull();
    });

    it('parado en /clientes, el tab Clientes está activo', () => {
      configurarAuth('admin');

      renderizarEn('/clientes');

      expect(screen.getByRole('button', { name: /Clientes/ }).getAttribute('aria-current')).toBe(
        'page',
      );
    });

    it('parado en el Historial general (/historial), el tab activo es Venta, no Clientes (docs/06-ui-ux.md §2, 2026-07-10: Historial es historial DE VENTAS)', () => {
      configurarAuth('admin');

      renderizarEn('/historial');

      expect(screen.getByRole('button', { name: 'Venta' }).getAttribute('aria-current')).toBe('page');
      expect(screen.getByRole('button', { name: /Clientes/ }).getAttribute('aria-current')).toBeNull();
      expect(screen.getByRole('heading', { name: 'Historial', level: 1 })).toBeTruthy();
    });

    it('vendedor sigue viendo el tab Clientes (no está gateado a admin)', () => {
      configurarAuth('vendedor');

      renderizarEn('/clientes');

      expect(screen.getByRole('button', { name: /Clientes/ })).toBeTruthy();
    });
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

  describe('header fundido (docs/06-ui-ux.md §2, rediseño 2026-07-10)', () => {
    it('la flecha de volver va sola (sin el nombre del padre al lado) con aria-label "Volver a {Padre}"', () => {
      configurarAuth('admin');

      renderizarEn('/stock/productos');

      const volver = screen.getByRole('link', { name: 'Volver a Stock' });
      // Contenido visible: solo el glifo del ícono (aria-hidden), nada de
      // texto "Stock" al lado — ese nombre vive únicamente en el aria-label.
      expect(volver.textContent).toBe('‹');
      // Target táctil ≥44px (docs/06-ui-ux.md §5).
      expect(volver.className).toContain('h-11');
      expect(volver.className).toContain('w-11');
    });

    it('el header no lleva clases de translucidez/blur ni borde inferior: fondo fundido con `bg-fondo`', () => {
      configurarAuth('admin');

      const { container } = renderizarEn('/venta');

      const header = container.querySelector('header');
      expect(header?.className).toContain('bg-fondo');
      expect(header?.className).not.toContain('translucida');
      expect(header?.className).not.toContain('backdrop');
      expect(header?.className).not.toContain('border-b');
    });

    it('el título vive en la columna central de una grilla de 3 columnas con laterales simétricos (óptico-centrado)', () => {
      configurarAuth('admin');

      const { container } = renderizarEn('/venta');

      const fila = container.querySelector('header > div');
      expect(fila?.className).toContain('grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]');
      const titulo = screen.getByRole('heading', { level: 1 });
      expect(titulo.className).toContain('text-center');
    });

    it('sin conexión y con accionHeader (Venta), el chip y la acción conviven en la columna derecha sin duplicar ni empujar el título', () => {
      configurarAuth('admin');
      mocks.useOnlineStatus.mockReturnValue(false);

      render(
        <MemoryRouter initialEntries={['/venta']}>
          <ProveedorToasts>
            <Routes>
              <Route element={<Shell />}>
                <Route
                  path="venta"
                  element={
                    <PantallaConHeader
                      titulo="Venta"
                      accionHeader={
                        <a href="/historial" aria-label="Historial">
                          Ir a Historial
                        </a>
                      }
                    />
                  }
                />
              </Route>
            </Routes>
          </ProveedorToasts>
        </MemoryRouter>,
      );

      expect(screen.getByRole('status').textContent).toContain('Sin conexión');
      expect(screen.getByRole('link', { name: 'Historial' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Venta', level: 1 })).toBeTruthy();
    });
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

  describe('accionHeader: acción de header-siempre (docs/06-ui-ux.md §2, 2026-07-10)', () => {
    it('se renderiza en el header sin depender de md: (visible también en mobile, a diferencia de acciones)', () => {
      configurarAuth('admin');

      render(
        <MemoryRouter initialEntries={['/venta']}>
          <ProveedorToasts>
            <Routes>
              <Route element={<Shell />}>
                <Route
                  path="venta"
                  element={
                    <PantallaConHeader
                      titulo="Venta"
                      accionHeader={
                        <a href="/historial" aria-label="Historial">
                          Ir a Historial
                        </a>
                      }
                    />
                  }
                />
              </Route>
            </Routes>
          </ProveedorToasts>
        </MemoryRouter>,
      );

      const enlace = screen.getByRole('link', { name: 'Historial' });
      expect(enlace).toBeTruthy();
      // A diferencia del dual-render de `acciones`, `accionHeader` no tiene
      // una segunda copia en el cluster flotante ni clases `md:`/`hidden`
      // condicionando su visibilidad: un solo nodo, siempre visible.
      expect(screen.getAllByRole('link', { name: 'Historial' })).toHaveLength(1);
      expect(enlace.closest('div')?.className).not.toContain('hidden');
      expect(enlace.closest('div')?.className).not.toContain('md:flex');
    });

    it('sin accionHeader, no agrega ningún slot extra al header', () => {
      configurarAuth('admin');

      renderizarEn('/venta');

      expect(screen.queryByRole('link', { name: 'Historial' })).toBeNull();
    });
  });

  describe('ErrorBoundaryRuta (hallazgo B1, review de Fase 2)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('un hijo que lanza en render muestra el mensaje de error y el resto del shell sigue (header + tab bar)', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      configurarAuth('admin');

      renderizarEn('/stock/roto');

      // El contenido ruteado se reemplaza por el fallback del boundary...
      expect(screen.getByRole('alert').textContent).toContain('Algo salió mal.');
      // ...pero el resto del Shell (fuera del boundary) sigue vivo y usable:
      // tab bar con todos sus botones, incluido el de Stock marcado activo.
      expect(screen.getByRole('button', { name: /Stock/ }).getAttribute('aria-current')).toBe('page');
      expect(screen.getByRole('button', { name: 'Venta' })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Reportes/ })).toBeTruthy();
    });

    it('navegar a otra ruta (tocar un tab) sale del estado de error: se ve la pantalla nueva', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      configurarAuth('admin');

      renderizarEn('/stock/roto');
      expect(screen.getByRole('alert')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Venta' }));

      expect(screen.getByText('Contenido de Venta')).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
