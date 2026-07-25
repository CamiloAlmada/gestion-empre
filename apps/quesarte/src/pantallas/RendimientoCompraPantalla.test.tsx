import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { money, peso, VERSION_COSTEO, type Compra, type ItemCompra, type ItemVenta, type Venta } from '@gestion/core';
import { RendimientoCompraPantalla } from './RendimientoCompraPantalla';
import { ProveedorHeader } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useDoc: vi.fn(),
  useCollection: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useDoc: mocks.useDoc,
    useCollection: mocks.useCollection,
    useOnlineStatus: mocks.useOnlineStatus,
  };
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
  doc: (_db: unknown, ...segmentos: string[]) => crearRefFalsa(segmentos.join('/')),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
}));

interface EstadoDocFalso<T> {
  datos: T | null;
  cargando: boolean;
  error: unknown;
}
interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoCompra: EstadoDocFalso<Compra> = { datos: null, cargando: false, error: null };
let estadoVentas: EstadoColeccionFalso<Venta> = { datos: [], cargando: false, error: null };

mocks.useDoc.mockImplementation(() => estadoCompra);
mocks.useCollection.mockImplementation((q: RefFalsa | null) => (q === null ? { datos: [], cargando: false, error: null } : estadoVentas));

function itemPorPieza(over: Partial<ItemCompra> = {}): ItemCompra {
  return {
    productoId: 'p-queso',
    nombreProducto: 'Queso Colonia',
    gramos: peso(10_000),
    piezas: [{ pesoGramos: peso(10_000) }],
    costoFacturaCents: money(50_000),
    gastoProrrateadoCents: money(5_000),
    costoRealCents: money(55_000),
    costoRealKgCents: money(5_500),
    ...over,
  };
}

function itemGranel(over: Partial<ItemCompra> = {}): ItemCompra {
  return {
    productoId: 'p-miel',
    nombreProducto: 'Miel a granel',
    gramos: peso(5_000),
    costoFacturaCents: money(20_000),
    gastoProrrateadoCents: money(2_000),
    costoRealCents: money(22_000),
    costoRealKgCents: money(4_400),
    ...over,
  };
}

function compraDe(over: Partial<Compra> & Pick<Compra, 'id'>): Compra {
  const items = over.items ?? [itemPorPieza()];
  return {
    fecha: new Date(2026, 6, 1),
    usuarioId: 'admin-1',
    estado: 'confirmada',
    proveedorNombre: 'Proveedor Colonia',
    gastos: [],
    totalFacturaCents: money(50_000),
    totalGastosCents: money(5_000),
    totalRealCents: money(55_000),
    ...over,
    items,
  };
}

function itemVentaAtribuida(compraId: string, gramos: number, costoUnitCents: number, precioUnitCents: number): ItemVenta {
  const subtotalCents = money(Math.round((precioUnitCents * gramos) / 1000));
  const costoItemCents = money(Math.round((costoUnitCents * gramos) / 1000));
  return {
    productoId: 'p-queso',
    nombreProducto: 'Queso Colonia',
    piezaId: 'pieza-1',
    gramos: peso(gramos),
    precioUnitCents: money(precioUnitCents),
    subtotalCents,
    costeo: {
      v: VERSION_COSTEO,
      fuente: 'pieza',
      origen: 'venta',
      costoUnitCents: money(costoUnitCents),
      costoItemCents,
      compraId,
    },
  };
}

function ventaCon(items: ItemVenta[], over: Partial<Venta> = {}): Venta {
  const totalCents = money(items.reduce((acc, i) => acc + i.subtotalCents, 0));
  return {
    id: 'v1',
    numero: 1,
    fecha: new Date(2026, 6, 5),
    usuarioId: 'u1',
    items,
    totalCents,
    medioPago: 'efectivo',
    estado: 'completada',
    ...over,
  };
}

function renderizar(id = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/reportes/compras/${id}`]}>
      <ProveedorHeader>
        <Routes>
          <Route path="/reportes/compras/:id" element={<RendimientoCompraPantalla />} />
        </Routes>
      </ProveedorHeader>
    </MemoryRouter>,
  );
}

describe('RendimientoCompraPantalla - estados de carga/error/vacío', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    estadoCompra = { datos: null, cargando: false, error: null };
    estadoVentas = { datos: [], cargando: false, error: null };
  });

  it('cargando la compra', () => {
    estadoCompra = { datos: null, cargando: true, error: null };
    renderizar();
    expect(screen.getByText('Cargando rendimiento…')).toBeTruthy();
  });

  it('error al cargar la compra: mensaje + reintentar', () => {
    estadoCompra = { datos: null, cargando: false, error: new Error('boom') };
    renderizar();
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar el rendimiento.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('compra no encontrada', () => {
    estadoCompra = { datos: null, cargando: false, error: null };
    renderizar();
    expect(screen.getByText('No encontramos esa compra.')).toBeTruthy();
  });

  it('compra en borrador: no muestra rendimiento, ofrece ir a la compra', () => {
    estadoCompra = { datos: compraDe({ id: 'c1', estado: 'borrador' }), cargando: false, error: null };
    renderizar();
    expect(
      screen.getByText('Esta compra todavía es un borrador: el rendimiento solo existe para compras confirmadas.'),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a la compra →' }).getAttribute('href')).toBe('/stock/compra/c1');
  });
});

describe('RendimientoCompraPantalla - compra confirmada sin ventas todavía', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    estadoCompra = { datos: null, cargando: false, error: null };
    estadoVentas = { datos: [], cargando: false, error: null };
  });

  it('no se lee como un viaje fracasado: "es pronto para juzgar"', () => {
    estadoCompra = { datos: compraDe({ id: 'c1' }), cargando: false, error: null };
    estadoVentas = { datos: [], cargando: false, error: null };
    renderizar();

    expect(screen.getByText('$ 550,00')).toBeTruthy(); // costo total
    expect(screen.getByText('$ 0,00')).toBeTruthy(); // ganancia generada, todavía 0
    expect(
      screen.getByText('Todavía no se vendió nada de esta compra. Es pronto para juzgar si el viaje rindió.'),
    ).toBeTruthy();
    expect(screen.getByText('0%')).toBeTruthy();
  });
});

describe('RendimientoCompraPantalla - compra parcialmente vendida', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    estadoCompra = { datos: null, cargando: false, error: null };
    estadoVentas = { datos: [], cargando: false, error: null };
  });

  it('muestra ganancia generada y % vendido de la porción atribuible', () => {
    estadoCompra = { datos: compraDe({ id: 'c1' }), cargando: false, error: null };
    estadoVentas = {
      datos: [ventaCon([itemVentaAtribuida('c1', 4_000, 5_500, 10_000)])],
      cargando: false,
      error: null,
    };
    renderizar();

    // 4kg × ($10.000 − $5.500) = $18.000.
    expect(screen.getByText('$ 180,00')).toBeTruthy();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('Falta vender parte de la mercadería de esta compra: la ganancia todavía puede subir.')).toBeTruthy();
  });
});

describe('RendimientoCompraPantalla - compra solo a granel (atribución nula)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    estadoCompra = { datos: null, cargando: false, error: null };
    estadoVentas = { datos: [], cargando: false, error: null };
  });

  it('rotula la parte no atribuible aparte, sin mezclarla con un número exacto', () => {
    estadoCompra = { datos: compraDe({ id: 'c1', items: [itemGranel()] }), cargando: false, error: null };
    estadoVentas = { datos: [], cargando: false, error: null };
    renderizar();

    expect(
      screen.getByText('Esta compra es enteramente a granel o por unidad: no hay lote que diga cuánto de esa mercadería ya se vendió.'),
    ).toBeTruthy();
    expect(screen.queryByText('Vendido de esta compra')).toBeNull();
    expect(screen.getByText(/No incluye la mercadería a granel o por unidad/)).toBeTruthy();
  });
});

describe('RendimientoCompraPantalla - offline', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    estadoCompra = { datos: null, cargando: false, error: null };
    estadoVentas = { datos: [], cargando: false, error: null };
    mocks.useOnlineStatus.mockReturnValue(true);
  });

  it('muestra el banner específico de Reportes', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    estadoCompra = { datos: compraDe({ id: 'c1' }), cargando: false, error: null };
    renderizar();
    expect(screen.getByRole('status').textContent).toContain('Sin conexión');
  });
});
