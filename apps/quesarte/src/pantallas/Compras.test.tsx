import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { money, type Compra } from '@gestion/core';
import { Compras } from './Compras';
import { StockLayout } from '../componentes/stock/StockLayout';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({ useCollection: vi.fn(), useAuth: vi.fn() }));

// `StockLayout` (UI-4) envuelve esta ruta y llama a `useAuth` para decidir
// qué ítems muestra el `SelectorSeccion` — se mockea con un admin fijo
// (mismo criterio que `Proveedores.test.tsx`/`Precios.test.tsx`: esta
// pantalla ya está protegida por `RutaSoloAdmin`, no hay caso "vendedor" que
// probar acá).
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return { ...actual, useCollection: mocks.useCollection, useAuth: mocks.useAuth };
});

mocks.useAuth.mockReturnValue({
  usuario: { uid: 'u1' },
  perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@a.com', rol: 'admin', activo: true },
  cargando: false,
  ingresarConEmail: vi.fn(),
  restablecerPassword: vi.fn(),
  salir: vi.fn(),
});

vi.mock('../firebase', () => ({ db: {} }));

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRefFalsa(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => crearRefFalsa(path),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
}));

interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoCompras: EstadoColeccionFalso<Compra> = { datos: [], cargando: false, error: null };
mocks.useCollection.mockImplementation(() => estadoCompras);

function configurar(overrides: { datos?: Compra[]; cargando?: boolean; error?: unknown }) {
  estadoCompras = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function compraDe(over: Partial<Compra> & Pick<Compra, 'id'>): Compra {
  return {
    fecha: new Date('2026-07-01'),
    usuarioId: 'admin-1',
    estado: 'borrador',
    proveedorNombre: 'Proveedor',
    items: [],
    gastos: [],
    totalFacturaCents: money(0),
    totalGastosCents: money(0),
    totalRealCents: money(0),
    ...over,
  };
}

function VisorHeader() {
  const config = useHeaderActual();
  return (
    <div>
      <p data-testid="titulo-header">{config?.titulo}</p>
      <div data-testid="acciones-header">{config?.acciones}</div>
    </div>
  );
}

function PlaceholderDetalle() {
  const { id } = useParams<{ id: string }>();
  return <div>Detalle de {id}</div>;
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/stock/compras']}>
      <ProveedorHeader>
        <VisorHeader />
        <Routes>
          <Route element={<StockLayout />}>
            <Route path="/stock/compras" element={<Compras />} />
          </Route>
          <Route path="/stock/compra/:id" element={<PlaceholderDetalle />} />
        </Routes>
      </ProveedorHeader>
    </MemoryRouter>,
  );
}

describe('Compras', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    estadoCompras = { datos: [], cargando: false, error: null };
  });

  it('header: título "Compras" y acción "Nueva compra"', () => {
    configurar({ datos: [] });
    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Compras');
    expect(screen.getAllByRole('button', { name: 'Nueva compra' }).length).toBeGreaterThan(0);
  });

  it('muestra el SelectorSeccion con Compras activo', () => {
    configurar({ datos: [] });
    renderizar();

    expect(screen.getByRole('link', { name: 'Compras' }).getAttribute('aria-current')).toBe('page');
  });

  it('la query ordena por fecha desc, sin filtrar por estado', () => {
    configurar({ datos: [] });
    renderizar();

    const llamada = mocks.useCollection.mock.calls[0]![0] as { __clausulas: { __tipo: string; args: unknown[] }[] };
    expect(llamada.__clausulas).toEqual([{ __tipo: 'orderBy', args: ['fecha', 'desc'] }]);
  });

  it('estado cargando', () => {
    configurar({ cargando: true });
    renderizar();
    expect(screen.getByText('Cargando compras…')).toBeTruthy();
  });

  it('estado error con reintento', () => {
    configurar({ error: new Error('boom') });
    renderizar();
    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las compras.');
  });

  it('estado vacío ofrece "Nueva compra"', () => {
    configurar({ datos: [] });
    renderizar();
    expect(screen.getByText('No hay compras todavía.')).toBeTruthy();
  });

  it('lista compras con proveedor, fecha, total y badge de estado', () => {
    configurar({
      datos: [
        compraDe({ id: 'c1', proveedorNombre: 'Quesos del Norte', estado: 'confirmada', totalRealCents: money(150000) }),
        compraDe({ id: 'c2', proveedorNombre: 'Miel SRL', estado: 'borrador' }),
      ],
    });
    renderizar();

    expect(screen.getByText('Quesos del Norte')).toBeTruthy();
    expect(screen.getByText('$ 1.500,00')).toBeTruthy();
    expect(screen.getByText('Confirmada')).toBeTruthy();
    expect(screen.getByText('Miel SRL')).toBeTruthy();
    expect(screen.getByText('Borrador')).toBeTruthy();
  });

  it('"Solo borradores" filtra las confirmadas', () => {
    configurar({
      datos: [
        compraDe({ id: 'c1', proveedorNombre: 'Quesos del Norte', estado: 'confirmada' }),
        compraDe({ id: 'c2', proveedorNombre: 'Miel SRL', estado: 'borrador' }),
      ],
    });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Solo borradores' }));

    expect(screen.queryByText('Quesos del Norte')).toBeNull();
    expect(screen.getByText('Miel SRL')).toBeTruthy();
  });

  it('tocar una fila navega al detalle (/stock/compra/:id)', () => {
    configurar({ datos: [compraDe({ id: 'c1', proveedorNombre: 'Quesos del Norte' })] });
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: /Quesos del Norte/ }));

    expect(screen.getByText('Detalle de c1')).toBeTruthy();
  });

  it('"Nueva compra" navega a /stock/compra/nueva', () => {
    configurar({ datos: [] });
    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Nueva compra' })[0]!);

    expect(screen.getByText('Detalle de nueva')).toBeTruthy();
  });
});
