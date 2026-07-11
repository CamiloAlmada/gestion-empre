import { lazy, type JSX, type LazyExoticComponent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { StockLayout } from './StockLayout';

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@gestion/firebase-kit', () => ({ useAuth: mocks.useAuth }));

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

/** Árbol mínimo: dos rutas hermanas de Stock bajo el layout, más una ficha de
 * detalle AFUERA de él (mismo esquema real de App.tsx) para confirmar que el
 * layout no se cuela ahí. */
function renderizar(pathname = '/stock') {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route element={<StockLayout />}>
          <Route path="/stock" element={<div>Pantalla Stock</div>} />
          <Route path="/stock/productos" element={<div>Pantalla Catálogo</div>} />
        </Route>
        <Route path="/stock/producto/:id" element={<div>Ficha de producto</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StockLayout', () => {
  it('renderiza el SelectorSeccion y el contenido de la ruta activa (Outlet)', () => {
    configurarAuth('admin');
    renderizar('/stock');

    expect(screen.getByRole('navigation', { name: 'Secciones de Stock' })).toBeTruthy();
    expect(screen.getByText('Pantalla Stock')).toBeTruthy();
  });

  it('vendedor: el selector no muestra las secciones solo-admin (Compras/Categorías)', () => {
    configurarAuth('vendedor');
    renderizar('/stock');

    expect(screen.queryByRole('link', { name: 'Compras' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Categorías' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Catálogo' })).toBeTruthy();
  });

  it('el selector NO se remonta al navegar entre secciones hermanas: mismo nodo antes y después', () => {
    configurarAuth('admin');
    renderizar('/stock');

    const navAntes = screen.getByRole('navigation', { name: 'Secciones de Stock' });

    fireEvent.click(screen.getByRole('link', { name: 'Catálogo' }));

    expect(screen.getByText('Pantalla Catálogo')).toBeTruthy();
    expect(screen.queryByText('Pantalla Stock')).toBeNull();
    // Identidad de nodo (no solo contenido): si el layout se remontara al
    // navegar, `getByRole` seguiría encontrando un <nav> con el mismo rol,
    // pero sería un elemento DEL DOM distinto — `toBe` (no `toEqual`) es lo
    // que discrimina remount de reuso.
    const navDespues = screen.getByRole('navigation', { name: 'Secciones de Stock' });
    expect(navDespues).toBe(navAntes);
  });

  it('el contenedor del layout lleva la altura mínima que estira el área de swipe al viewport completo (UI-4d, Problema 2)', () => {
    configurarAuth('admin');
    renderizar('/stock');

    const layout = screen.getByTestId('layout-stock');
    // Usa las mismas variables de layout que ya consume Shell.tsx
    // (`--altura-header`/`--altura-zona-inferior`), no valores mágicos.
    expect(layout.className).toContain('min-h-[calc(100dvh-var(--altura-header)-var(--altura-zona-inferior)');
  });

  it('entrada directa por URL a un chunk lazy frío: el selector se monta igual, el fallback reemplaza solo el Outlet (Suspense propio, UI-4d)', async () => {
    configurarAuth('admin');
    // Promesa que nunca resuelve: simula un chunk que sigue "en vuelo" (p.
    // ej. red lenta) en el primer montaje — a diferencia de una navegación
    // (que React Router hace con `startTransition` y por lo tanto puede
    // mantener la pantalla anterior sin parpadeo mientras el chunk carga),
    // en un montaje inicial no hay "pantalla anterior" que mantener: el
    // `Suspense` de ESTE `Outlet` muestra su fallback de inmediato — la
    // pregunta que importa acá es si ese fallback se lleva puesto también al
    // `SelectorSeccion` (bug anterior, Suspense en Shell.tsx) o no (fix).
    const NuncaResuelve = lazy(() => new Promise<{ default: () => null }>(() => {}));

    render(
      <MemoryRouter initialEntries={['/stock/productos']}>
        <Routes>
          <Route element={<StockLayout />}>
            <Route path="/stock" element={<div>Pantalla Stock</div>} />
            <Route path="/stock/productos" element={<NuncaResuelve />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    // El selector está montado DESDE EL PRIMER RENDER, en simultáneo con el
    // fallback de carga del Outlet — no espera a que el chunk resuelva (cosa
    // que acá nunca pasa).
    expect(screen.getByRole('navigation', { name: 'Secciones de Stock' })).toBeTruthy();
    expect(screen.getByText('Cargando…')).toBeTruthy();
  });

  it('durante una navegación a un chunk lazy que tarda en resolver, el selector no se desmonta: mismo nodo antes y después', async () => {
    configurarAuth('admin');
    // A diferencia del test anterior, ACÁ el chunk sí resuelve (tarde) — se
    // controla el momento exacto con un resolver manual en vez de un
    // `setTimeout`, para no depender de temporizadores falsos.
    let resolver!: (modulo: { default: () => JSX.Element }) => void;
    const promesaLenta = new Promise<{ default: () => JSX.Element }>((resolve) => {
      resolver = resolve;
    });
    const SeccionLenta = lazy(() => promesaLenta);

    renderConSeccionLenta(SeccionLenta);

    const navAntes = screen.getByRole('navigation', { name: 'Secciones de Stock' });

    fireEvent.click(screen.getByRole('link', { name: 'Catálogo' }));
    // React Router navega con `startTransition` (chunk-KS7C4IRE.mjs): mientras
    // la promesa no resuelve puede seguir mostrando "Pantalla Stock" sin
    // parpadeo — no se afirma nada sobre ese estado intermedio, solo sobre
    // el desenlace.
    resolver({ default: () => <div>Pantalla Catálogo lenta</div> });

    expect(await screen.findByText('Pantalla Catálogo lenta')).toBeTruthy();
    // Identidad de nodo (no solo contenido): si el `Suspense` siguiera
    // envolviendo al selector (bug anterior), la transición habría
    // reemplazado TODO el subárbol de una vez —incluido un `SelectorSeccion`
    // nuevo, con su scroll reseteado— en lugar de actualizar en el lugar
    // solo el contenido del Outlet.
    const navDespues = screen.getByRole('navigation', { name: 'Secciones de Stock' });
    expect(navDespues).toBe(navAntes);
  });
});

function renderConSeccionLenta(SeccionLenta: LazyExoticComponent<() => JSX.Element>) {
  return render(
    <MemoryRouter initialEntries={['/stock']}>
      <Routes>
        <Route element={<StockLayout />}>
          <Route path="/stock" element={<div>Pantalla Stock</div>} />
          <Route path="/stock/productos" element={<SeccionLenta />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
