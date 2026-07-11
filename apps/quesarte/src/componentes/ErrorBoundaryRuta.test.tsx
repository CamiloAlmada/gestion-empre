import { lazy, Suspense, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router';
import { ErrorBoundaryRuta } from './ErrorBoundaryRuta';

function ComponenteQueRompe(): never {
  throw new Error('boom de prueba');
}

function ComponenteOk() {
  return <p>Todo bien</p>;
}

/**
 * Réplica mínima de la estructura real de `Shell.tsx`: el boundary vive POR
 * ENCIMA del `<Outlet />` (no dentro de una ruta hija), alimentado con
 * `location.pathname` vía `rutaActual`. Así el boundary NO se desmonta al
 * navegar entre rutas hijas — que es exactamente la condición bajo la cual
 * importa el auto-reset (con el viejo `key` el boundary se remontaba y el
 * recovery era "gratis", pero rompía el subtree persistente de Stock).
 *
 * `navFuera` simula la tab bar del Shell real, que vive FUERA del boundary y
 * sigue navegable aunque la pantalla ruteada muestre el fallback de error.
 */
function ShellDePrueba({ navFuera }: { navFuera?: ReactNode }) {
  const location = useLocation();
  return (
    <div>
      {navFuera}
      <ErrorBoundaryRuta rutaActual={location.pathname}>
        <Outlet />
      </ErrorBoundaryRuta>
    </div>
  );
}

/** Monta el boundary como en Shell (por encima del Outlet) con un set de rutas
 * hijas configurable. La ruta inicial por defecto es `/stock`. */
function renderizarEnShell(rutas: ReactNode, opciones: { entrada?: string; navFuera?: ReactNode } = {}) {
  const { entrada = '/stock', navFuera } = opciones;
  return render(
    <MemoryRouter initialEntries={[entrada]}>
      <Routes>
        <Route element={<ShellDePrueba navFuera={navFuera} />}>{rutas}</Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ErrorBoundaryRuta', () => {
  it('sin error: renderiza los hijos normalmente', () => {
    render(
      <MemoryRouter>
        <ErrorBoundaryRuta rutaActual="/stock">
          <ComponenteOk />
        </ErrorBoundaryRuta>
      </MemoryRouter>,
    );

    expect(screen.getByText('Todo bien')).toBeTruthy();
  });

  it('un hijo que lanza en render: muestra el mensaje de error en español con acciones', () => {
    // El error real IGUAL se loguea a consola (React + nuestro componentDidCatch);
    // se silencia acá para no ensuciar la salida del test runner.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MemoryRouter>
        <ErrorBoundaryRuta rutaActual="/stock">
          <ComponenteQueRompe />
        </ErrorBoundaryRuta>
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert').textContent).toContain('Algo salió mal.');
    expect(screen.getByRole('link', { name: 'Volver a Venta' }).getAttribute('href')).toBe('/venta');
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeTruthy();
  });

  // Escenario 1 (recovery de B1, no puede regresionar): error de render →
  // fallback → "Volver a Venta" → Venta renderiza limpia. Con el boundary
  // persistente (como en Shell), el recovery depende del auto-reset por
  // `rutaActual`, no de un remontaje del boundary.
  it('escenario 1: "Volver a Venta" resetea el boundary y la ruta nueva renderiza limpia', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderizarEnShell(
      <>
        <Route path="/stock" element={<ComponenteQueRompe />} />
        <Route path="/venta" element={<p>Pantalla Venta</p>} />
      </>,
    );

    // Arranca en /stock, que lanza: se ve el fallback.
    expect(screen.getByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Volver a Venta' }));

    // La ruta nueva (/venta) se ve limpia y el fallback desapareció: el error
    // se limpió al cambiar `rutaActual`, sin recargar la página. Confirma que
    // los `children` de la ruta nueva se montan SOLO tras el reset (no con el
    // error todavía puesto).
    expect(screen.getByText('Pantalla Venta')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('escenario 1 (variante): si la ruta nueva TAMBIÉN lanza, muestra el fallback de la ruta nueva sin loop', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderizarEnShell(
      <>
        <Route path="/stock" element={<ComponenteQueRompe />} />
        {/* /venta también rompe: tras el reset, el render de la ruta nueva
            vuelve a lanzar; el boundary re-arma el error y —como la ruta ya no
            cambia— NO se resetea de nuevo (la guarda de `rutaActual` corta el
            bucle). El desenlace estable es el fallback, sin colgarse. */}
        <Route path="/venta" element={<ComponenteQueRompe />} />
      </>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Volver a Venta' }));

    expect(screen.getByRole('alert')).toBeTruthy();
  });

  // Escenario 2: error en una sección de Stock → navegar a otro tab (nav fuera
  // del boundary, como la tab bar real) y VOLVER a Stock → la sección
  // renderiza limpia. La sección lanza SOLO en su primer montaje (error
  // transitorio) para poder observar el recovery al revisitarla.
  it('escenario 2: error en una sección de Stock, ir a otro tab y volver → sección limpia', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Flag externo (no un contador de renders): React puede re-invocar un
    // componente que lanzó como parte de su recuperación de errores, así que
    // "lanzar solo la primera vez" contando montajes es no determinista. Se
    // controla desde el test CUÁNDO lanza: rompe mientras `rompe` sea true.
    const estado = { rompe: true };
    function SeccionStock() {
      if (estado.rompe) throw new Error('boom transitorio de Stock');
      return <p>Sección Stock OK</p>;
    }

    const tabBar = (
      <nav>
        <Link to="/stock">Ir a Stock</Link>
        <Link to="/clientes">Ir a Clientes</Link>
      </nav>
    );

    renderizarEnShell(
      <>
        <Route path="/stock" element={<SeccionStock />} />
        <Route path="/clientes" element={<p>Pantalla Clientes</p>} />
      </>,
      { navFuera: tabBar },
    );

    // Stock lanzó en su primer render: fallback visible.
    expect(screen.getByRole('alert')).toBeTruthy();

    // Ir a otro tab (Clientes): la ruta cambia → el error se limpia y Clientes
    // renderiza. El link vive fuera del boundary (tab bar real), así que sigue
    // navegable pese al fallback.
    fireEvent.click(screen.getByRole('link', { name: 'Ir a Clientes' }));
    expect(screen.getByText('Pantalla Clientes')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    // La condición transitoria se resuelve; volver a Stock ya no lanza → limpia.
    estado.rompe = false;
    fireEvent.click(screen.getByRole('link', { name: 'Ir a Stock' }));
    expect(screen.getByText('Sección Stock OK')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // Escenario 3: fallo al cargar un chunk lazy (el boundary envuelve el
  // Suspense, igual que en Shell) → navegar → reset.
  it('escenario 3: un chunk lazy que falla al cargar cae en el boundary; navegar lo resetea', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // `React.lazy` cuya importación rechaza: al resolverse la promesa fallida,
    // el componente lanza en render y el boundary lo captura (el Suspense va
    // adentro del boundary, como en Shell.tsx).
    const ChunkRoto = lazy(() => Promise.reject(new Error('falló la carga del chunk')));

    renderizarEnShell(
      <>
        <Route
          path="/stock"
          element={
            <Suspense fallback={<p>Cargando…</p>}>
              <ChunkRoto />
            </Suspense>
          }
        />
        <Route path="/venta" element={<p>Pantalla Venta</p>} />
      </>,
    );

    // El fallback de error aparece una vez que la promesa del chunk rechaza.
    expect(await screen.findByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('link', { name: 'Volver a Venta' }));

    expect(screen.getByText('Pantalla Venta')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('guarda: un re-render del padre SIN cambio de ruta no limpia un error activo', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Boundary con la MISMA `rutaActual`, pero con un padre que se re-renderiza
    // (cambia un estado ajeno a la ruta). El error NO debe limpiarse: el
    // auto-reset es exclusivo de la navegación, no de cualquier re-render.
    function Padre() {
      const [n, setN] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setN((v) => v + 1)}>
            re-render {n}
          </button>
          <ErrorBoundaryRuta rutaActual="/stock">
            <ComponenteQueRompe />
          </ErrorBoundaryRuta>
        </>
      );
    }

    render(
      <MemoryRouter>
        <Padre />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /re-render/ }));

    // Sigue mostrando el fallback: el re-render del padre (misma ruta) no lo
    // reseteó.
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
