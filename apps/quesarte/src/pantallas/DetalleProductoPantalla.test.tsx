import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { DetalleProductoPantalla } from './DetalleProductoPantalla';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => {
  class IngresoInvalidoError extends Error {}
  class AjusteInvalidoError extends Error {}
  class StockInsuficienteError extends Error {}
  return {
    useAuth: vi.fn(),
    useCollection: vi.fn(),
    ingresarPiezas: vi.fn(),
    ajustarStock: vi.fn(),
    IngresoInvalidoError,
    AjusteInvalidoError,
    StockInsuficienteError,
  };
});

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useCollection: mocks.useCollection,
  productoConverter: {},
  piezaConverter: {},
  movimientoConverter: {},
  ingresarPiezas: mocks.ingresarPiezas,
  ajustarStock: mocks.ajustarStock,
  IngresoInvalidoError: mocks.IngresoInvalidoError,
  AjusteInvalidoError: mocks.AjusteInvalidoError,
  StockInsuficienteError: mocks.StockInsuficienteError,
}));

vi.mock('../firebase', () => ({ db: {} }));

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => crearRef(path),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
  limit: (n: number) => ({ __tipo: 'limit', n }),
}));

interface EstadoFalso<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

function estadoOk<T>(datos: T[]): EstadoFalso<T> {
  return { datos, cargando: false, error: null };
}

function producto(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
  return {
    nombre: 'Queso Colonia',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(50000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function pieza(over: Partial<Pieza> = {}): Pieza {
  return {
    id: 'pz1',
    productoId: 'p1',
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(4000),
    costoKgCents: money(30000),
    fechaIngreso: new Date('2026-01-01'),
    estado: 'disponible',
    ...over,
  };
}

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

function configurarCollections(estados: {
  productos?: EstadoFalso<Producto>;
  piezas?: EstadoFalso<Pieza>;
  movimientos?: EstadoFalso<unknown>;
}) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'productos') return estados.productos ?? estadoOk([]);
    if (q.__path === 'piezas') return estados.piezas ?? estadoOk([]);
    if (q.__path === 'movimientos') return estados.movimientos ?? estadoOk([]);
    return { datos: [], cargando: false, error: null };
  });
}

/** Expone el header contextual actual como texto, para aserirlo sin montar
 * `Shell` completo (mismo criterio que `Stock.test.tsx`). */
function VisorHeader() {
  const config = useHeaderActual();
  return (
    <div>
      <p data-testid="titulo-header">{config?.titulo}</p>
      <p data-testid="volver-header">{config?.volverA ? `${config.volverA.etiqueta}:${config.volverA.a}` : ''}</p>
      <div data-testid="acciones-header">{config?.acciones}</div>
    </div>
  );
}

function renderizar(id = 'p1') {
  return render(
    <MemoryRouter initialEntries={[`/stock/producto/${id}`]}>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorHeader />
          <Routes>
            <Route path="/stock/producto/:id" element={<DetalleProductoPantalla />} />
          </Routes>
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DetalleProductoPantalla - estados', () => {
  it('cargando: muestra el mensaje de carga', () => {
    configurarAuth('admin');
    configurarCollections({ productos: { datos: [], cargando: true, error: null } });

    renderizar();

    expect(screen.getByText('Cargando producto…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
    configurarAuth('admin');
    const error = { code: 'unavailable' } as FirestoreError;
    configurarCollections({ productos: { datos: [], cargando: false, error } });

    renderizar();

    expect(screen.getByText('No se pudo cargar el producto. Revisá tu conexión e intentá de nuevo.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('producto inexistente: mensaje de error con link a Stock', () => {
    configurarAuth('admin');
    configurarCollections({ productos: estadoOk([producto({ id: 'otro', modoStock: 'granel' })]) });

    renderizar('p1');

    expect(screen.getByText('No encontramos ese producto. Puede haberse desactivado.')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Volver a Stock' });
    expect(link.getAttribute('href')).toBe('/stock');
  });
});

describe('DetalleProductoPantalla - header contextual', () => {
  it('el título del header es el nombre del producto y el volver lleva a Stock', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Queso Colonia');
    expect(screen.getByTestId('volver-header').textContent).toBe('Stock:/stock');
  });
});

describe('DetalleProductoPantalla - permisos y acciones', () => {
  it('vendedor: no ve acciones de escritura', () => {
    configurarAuth('vendedor');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({
      productos: estadoOk([prod]),
      piezas: estadoOk([pieza({ id: 'a' })]),
    });

    renderizar();

    expect(screen.queryByRole('button', { name: 'Ingresar piezas' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ajustar pieza/ })).toBeNull();
  });

  it('admin: producto por pieza expone "Ingresar piezas" en el header y abre el modal', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar piezas' }));

    expect(screen.getByText('Ingresar piezas · Queso Colonia')).toBeTruthy();
  });

  it('admin: producto granel expone "Sumar stock" y "Ajuste / merma" en el header', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Nuez mariposa', modoStock: 'granel', stockGranelGramos: peso(1000) });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]), movimientos: estadoOk([]) });

    renderizar();

    expect(screen.getByRole('button', { name: 'Sumar stock' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ajuste / merma' })).toBeTruthy();
  });
});

describe('DetalleProductoPantalla - ajuste por pieza', () => {
  it('admin: el botón "Ajustar" de una fila abre el modal de ajuste para esa pieza', async () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({
      productos: estadoOk([prod]),
      piezas: estadoOk([pieza({ id: 'a', productoId: 'p1', pesoRestanteGramos: peso(1500) })]),
    });

    renderizar();
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /Ajustar pieza/ }));

    expect(screen.getByText('Ajuste / merma · Queso Colonia')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Disponible: 1,5 kg')).toBeTruthy());
  });

  it('vendedor: la fila compacta de una pieza NO es un botón (sin permiso de ajuste)', () => {
    configurarAuth('vendedor');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({
      productos: estadoOk([prod]),
      piezas: estadoOk([pieza({ id: 'a', productoId: 'p1', pesoRestanteGramos: peso(1500) })]),
    });

    renderizar();

    expect(within(screen.getByRole('list')).queryByRole('button', { name: /Ajustar pieza/ })).toBeNull();
  });
});
