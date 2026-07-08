import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { Stock } from './Stock';

const mocks = vi.hoisted(() => {
  class IngresoInvalidoError extends Error {}
  class AjusteInvalidoError extends Error {}
  class StockInsuficienteError extends Error {}
  return {
    useAuth: vi.fn(),
    useOnlineStatus: vi.fn(() => true),
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
  useOnlineStatus: mocks.useOnlineStatus,
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

function producto(over: Partial<Producto> & Pick<Producto, 'modoStock'>): Producto {
  return {
    id: 'prod1',
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
    productoId: 'prod1',
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

function renderizar() {
  return render(
    <MemoryRouter>
      <ProveedorToasts>
        <Stock />
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useOnlineStatus.mockReturnValue(true);
});

describe('Stock - estados', () => {
  it('cargando: muestra el mensaje de carga', () => {
    configurarAuth('admin');
    configurarCollections({ productos: { datos: [], cargando: true, error: null } });

    renderizar();

    expect(screen.getByText('Cargando stock…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
    configurarAuth('admin');
    const error = { code: 'unavailable' } as FirestoreError;
    configurarCollections({ productos: { datos: [], cargando: false, error } });

    renderizar();

    expect(screen.getByText('No se pudo cargar el stock. Revisá tu conexión e intentá de nuevo.')).toBeTruthy();
    const boton = screen.getByRole('button', { name: 'Reintentar' });
    expect(() => fireEvent.click(boton)).not.toThrow();
  });

  it('vacío: mensaje y link a Productos', () => {
    configurarAuth('admin');
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });

    renderizar();

    expect(screen.getByText('Sin productos — creá el catálogo primero.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Productos' }).getAttribute('href')).toBe('/stock/productos');
  });

  it('offline: muestra el banner de sin conexión', () => {
    configurarAuth('admin');
    mocks.useOnlineStatus.mockReturnValue(false);
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });

    renderizar();

    expect(
      screen.getByText('Sin conexión: los cambios se guardan localmente y se sincronizan al reconectar.'),
    ).toBeTruthy();
  });

  it('en línea: no muestra el banner offline', () => {
    configurarAuth('admin');
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });

    renderizar();

    expect(screen.queryByText(/Sin conexión/)).toBeNull();
  });
});

describe('Stock - lista maestra (agrupación)', () => {
  it('muestra el resumen de cada producto según su modoStock', () => {
    configurarAuth('admin');
    const prodPieza = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    const prodGranel = producto({
      id: 'p2',
      nombre: 'Nuez mariposa',
      modoStock: 'granel',
      stockGranelGramos: peso(3000),
    });
    const prodUnidad = producto({
      id: 'p3',
      nombre: 'Miel 500g',
      modoPrecio: 'por_unidad',
      modoStock: 'unidad_simple',
      stockUnidades: 6,
    });
    configurarCollections({
      productos: estadoOk([prodPieza, prodGranel, prodUnidad]),
      piezas: estadoOk([pieza({ id: 'a', productoId: 'p1', pesoRestanteGramos: peso(1200) })]),
    });

    renderizar();

    expect(screen.getByText('1 pieza · 1,2 kg')).toBeTruthy();
    expect(screen.getByText('3 kg')).toBeTruthy();
    expect(screen.getByText('6 unidades')).toBeTruthy();
  });
});

describe('Stock - detalle y permisos', () => {
  it('vendedor: al seleccionar un producto no ve botones de acción', () => {
    configurarAuth('vendedor');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({
      productos: estadoOk([prod]),
      piezas: estadoOk([pieza({ id: 'a', productoId: 'p1' })]),
    });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Queso Colonia/ }));

    expect(screen.getByRole('heading', { name: 'Queso Colonia' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ingresar piezas' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Ajustar pieza/ })).toBeNull();
  });

  it('admin: ve "Ingresar piezas" en un producto por pieza y puede abrir el modal', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Queso Colonia/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar piezas' }));

    expect(screen.getByText('Ingresar piezas · Queso Colonia')).toBeTruthy();
  });

  it('admin: producto granel muestra "Sumar stock" y "Ajuste / merma"', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Nuez mariposa', modoStock: 'granel', stockGranelGramos: peso(1000) });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]), movimientos: estadoOk([]) });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Nuez mariposa/ }));

    expect(screen.getByRole('button', { name: 'Sumar stock' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ajuste / merma' })).toBeTruthy();
  });

  it('"Volver a Stock" regresa a la lista maestra', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Queso Colonia/ }));
    expect(screen.getByRole('heading', { name: 'Queso Colonia' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Volver a Stock/ }));

    expect(screen.queryByRole('heading', { name: 'Queso Colonia' })).toBeNull();
  });
});

describe('Stock - ajuste por pieza desde el detalle', () => {
  it('admin: el botón "Ajustar" de una fila abre el modal de ajuste para esa pieza', async () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({
      productos: estadoOk([prod]),
      piezas: estadoOk([pieza({ id: 'a', productoId: 'p1', pesoRestanteGramos: peso(1500) })]),
    });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Queso Colonia/ }));
    fireEvent.click(screen.getByRole('button', { name: /Ajustar pieza/ }));

    expect(screen.getByText('Ajuste / merma · Queso Colonia')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Disponible: 1,5 kg')).toBeTruthy());
  });
});
