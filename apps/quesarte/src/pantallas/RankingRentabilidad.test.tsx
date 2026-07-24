import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, VERSION_COSTEO, type ItemVenta, type Producto, type Venta } from '@gestion/core';
import { ProveedorHeader } from '../componentes/header/ContextoHeader';
import { RankingRentabilidad } from './RankingRentabilidad';

const mocks = vi.hoisted(() => ({
  useCollection: vi.fn(),
  useOnlineStatus: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useCollection: mocks.useCollection,
  useOnlineStatus: mocks.useOnlineStatus,
  ventaConverter: {},
  productoConverter: {},
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
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
}));

interface EstadoFalso<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

function estadoOk<T>(datos: T[]): EstadoFalso<T> {
  return { datos, cargando: false, error: null };
}

function configurarColecciones(opciones: {
  ventas: EstadoFalso<Venta>;
  productos?: EstadoFalso<Producto>;
}) {
  const productos = opciones.productos ?? estadoOk<Producto>([]);
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'ventas') return opciones.ventas;
    if (q.__path === 'productos') return productos;
    return { datos: [], cargando: false, error: null };
  });
}

function producto(over: Partial<Producto> = {}): Producto {
  return {
    id: 'p1',
    nombre: 'Producto',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(10_000),
    costoPromedioCents: money(6_000),
    activo: true,
    actualizadoEn: new Date(),
    ...over,
  };
}

function itemConCosto(over: Partial<ItemVenta> = {}): ItemVenta {
  return {
    productoId: 'p1',
    nombreProducto: 'Queso Colonia',
    precioUnitCents: money(10_000),
    subtotalCents: money(10_000),
    costeo: {
      v: VERSION_COSTEO,
      fuente: 'promedio',
      origen: 'venta',
      costoUnitCents: money(9_800),
      costoItemCents: money(9_800),
    },
    ...over,
  };
}

function itemSinCosto(over: Partial<ItemVenta> = {}): ItemVenta {
  return {
    productoId: 'p2',
    nombreProducto: 'Miel',
    precioUnitCents: money(5_000),
    subtotalCents: money(5_000),
    ...over,
  };
}

function ventaCon(fecha: Date, items: ItemVenta[], over: Partial<Venta> = {}): Venta {
  const totalCents = money(items.reduce((acc, i) => acc + i.subtotalCents, 0));
  return {
    id: `v-${fecha.getTime()}`,
    numero: fecha.getTime(),
    fecha,
    usuarioId: 'u1',
    items,
    totalCents,
    medioPago: 'efectivo',
    estado: 'completada',
    ...over,
  };
}

/** Día 3 de julio 2026, mismo "ahora" fijo que `Reportes.test.tsx` (período
 * 'mes' por defecto en curso, determinista sin importar el huso del CI). */
const AHORA = new Date(2026, 6, 3, 11, 0, 0);

function renderizar(ruta = '/reportes/rentabilidad?periodo=mes') {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorHeader>
        <Routes>
          <Route path="/reportes/rentabilidad" element={<RankingRentabilidad />} />
        </Routes>
      </ProveedorHeader>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  mocks.useOnlineStatus.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('RankingRentabilidad - estados', () => {
  it('cargando: muestra el mensaje de carga', () => {
    configurarColecciones({ ventas: { datos: [], cargando: true, error: null } });

    renderizar();

    expect(screen.getByText('Cargando rentabilidad…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
    const error = { code: 'unavailable' } as FirestoreError;
    configurarColecciones({ ventas: { datos: [], cargando: false, error } });

    renderizar();

    expect(
      screen.getByText('No se pudo cargar la rentabilidad. Revisá tu conexión e intentá de nuevo.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('vacío: "Todavía no hay ventas en este período." cuando no hay ventas', () => {
    configurarColecciones({ ventas: estadoOk([]) });

    renderizar();

    expect(screen.getByText('Todavía no hay ventas en este período.')).toBeTruthy();
  });
});

describe('RankingRentabilidad - orden por ganancia (no por facturación)', () => {
  it('un producto que factura mucho con poco margen queda por debajo de uno que factura poco con mucho margen', () => {
    // Producto A: factura 100.000, casi sin margen (ganancia 1.000 → 1%).
    const productoA = itemConCosto({
      productoId: 'p-a',
      nombreProducto: 'Alta facturación',
      subtotalCents: money(100_000),
      costeo: {
        v: VERSION_COSTEO,
        fuente: 'promedio',
        origen: 'venta',
        costoUnitCents: money(99_000),
        costoItemCents: money(99_000),
      },
    });
    // Producto B: factura apenas 2.000, con mucho margen (ganancia 1.600 → 80%).
    const productoB = itemConCosto({
      productoId: 'p-b',
      nombreProducto: 'Alto margen',
      subtotalCents: money(2_000),
      costeo: {
        v: VERSION_COSTEO,
        fuente: 'promedio',
        origen: 'venta',
        costoUnitCents: money(400),
        costoItemCents: money(400),
      },
    });
    configurarColecciones({
      ventas: estadoOk([ventaCon(new Date(2026, 6, 1, 10, 0), [productoA, productoB])]),
    });

    renderizar();

    const filas = screen.getAllByRole('listitem');
    // La primera fila (mayor ganancia) es "Alto margen", pese a facturar 50x menos.
    expect(within(filas[0]!).getByText('Alto margen')).toBeTruthy();
    expect(within(filas[0]!).getByText('$ 16,00')).toBeTruthy(); // ganancia $16,00
    expect(within(filas[0]!).getByText('80% margen')).toBeTruthy();
    expect(within(filas[1]!).getByText('Alta facturación')).toBeTruthy();
    expect(within(filas[1]!).getByText('$ 10,00')).toBeTruthy(); // ganancia $10,00 (menor)
    expect(within(filas[1]!).getByText('1% margen')).toBeTruthy();
  });
});

describe('RankingRentabilidad - cobertura de costo parcial', () => {
  it('cobertura menor a 100%: se aclara arriba, en lenguaje llano', () => {
    configurarColecciones({
      ventas: estadoOk([ventaCon(new Date(2026, 6, 1, 10, 0), [itemConCosto(), itemSinCosto()])]),
    });

    renderizar();

    expect(screen.getByText('Ganancia calculada sobre el 50% de lo vendido.')).toBeTruthy();
  });

  it('una clave sin NINGÚN costo conocido va al grupo "Sin costo conocido", no al ranking principal', () => {
    configurarColecciones({
      ventas: estadoOk([
        ventaCon(new Date(2026, 6, 1, 10, 0), [
          itemConCosto({ productoId: 'p-con-costo', nombreProducto: 'Con costo' }),
          itemSinCosto({ productoId: 'p-sin-costo', nombreProducto: 'Fantasma' }),
        ]),
      ]),
    });

    renderizar();

    expect(screen.getByText('Sin costo conocido')).toBeTruthy();
    const grupoSinCosto = screen.getByText('Sin costo conocido').closest('div')!;
    expect(within(grupoSinCosto).getByText('Fantasma')).toBeTruthy();
    // Se muestra la facturación (no una ganancia inventada en 0).
    expect(within(grupoSinCosto).getByText('$ 50,00')).toBeTruthy();
    expect(screen.getByText('Con costo')).toBeTruthy();
  });

  it('cobertura parcial DENTRO de una misma clave: nota por fila, sin sacarla del ranking principal', () => {
    configurarColecciones({
      ventas: estadoOk([
        ventaCon(new Date(2026, 6, 1, 10, 0), [
          itemConCosto({ productoId: 'p-mixto', nombreProducto: 'Mixto' }),
          itemSinCosto({ productoId: 'p-mixto', nombreProducto: 'Mixto' }),
        ]),
      ]),
    });

    renderizar();

    expect(screen.getByText('Mixto')).toBeTruthy();
    expect(screen.getByText('1 línea sin costo conocido')).toBeTruthy();
  });
});

describe('RankingRentabilidad - vista por categoría', () => {
  it('agrupa por categoría resuelta desde productos (Producto.categoria denormalizado)', () => {
    configurarColecciones({
      ventas: estadoOk([
        ventaCon(new Date(2026, 6, 1, 10, 0), [
          itemConCosto({ productoId: 'p-queso', nombreProducto: 'Colonia' }),
        ]),
      ]),
      productos: estadoOk([producto({ id: 'p-queso', categoria: 'Quesos' })]),
    });

    renderizar('/reportes/rentabilidad?periodo=mes&vista=categoria');

    expect(screen.getByText('Quesos')).toBeTruthy();
  });

  it('producto no resoluble cae en "Sin categoría"', () => {
    configurarColecciones({
      ventas: estadoOk([
        ventaCon(new Date(2026, 6, 1, 10, 0), [
          itemConCosto({ productoId: 'p-fantasma', nombreProducto: 'Fantasma' }),
        ]),
      ]),
      productos: estadoOk([]),
    });

    renderizar('/reportes/rentabilidad?periodo=mes&vista=categoria');

    expect(screen.getByText('Sin categoría')).toBeTruthy();
  });
});

describe('RankingRentabilidad - el período viaja desde la home', () => {
  it('lee la granularidad del query param ?periodo= (no resetea a un default distinto)', () => {
    // Con período 'semana' en vez del default 'mes', solo entran las ventas
    // de ESA semana (AHORA: 3 de julio de 2026, viernes → semana ISO
    // 29/6-5/7). Una venta de dos semanas antes NO debería contar.
    const dentroDeLaSemana = ventaCon(new Date(2026, 6, 2, 10, 0), [itemConCosto()]);
    const fueraDeLaSemana = ventaCon(new Date(2026, 5, 10, 10, 0), [
      itemConCosto({ productoId: 'p-viejo', nombreProducto: 'Venta vieja' }),
    ]);
    configurarColecciones({ ventas: estadoOk([dentroDeLaSemana, fueraDeLaSemana]) });

    renderizar('/reportes/rentabilidad?periodo=semana');

    // La query a Firestore ya filtra por fecha (mock no lo re-filtra), así
    // que lo que valida este test es que la pantalla no ignoró el param: la
    // única forma de que ambos ítems entraran al mismo tiempo sería si
    // `granularidad` no se hubiera leído de la URL. Igual, lo relevante acá
    // es que el título refleje 'semana', no 'mes' (el default).
    expect(screen.getByText(/de la semana/)).toBeTruthy();
  });

  it('sin query param (deep link viejo): default "mes", igual que la home', () => {
    configurarColecciones({ ventas: estadoOk([ventaCon(new Date(2026, 6, 1, 10, 0), [itemConCosto()])]) });

    renderizar('/reportes/rentabilidad');

    expect(screen.getByText(/del mes/)).toBeTruthy();
  });
});
