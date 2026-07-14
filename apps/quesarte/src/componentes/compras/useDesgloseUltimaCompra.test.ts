import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { money, peso, type Compra, type Producto } from '@gestion/core';
import { useDesgloseUltimaCompra } from './useDesgloseUltimaCompra';

const mocks = vi.hoisted(() => ({ useCollection: vi.fn(), useOnlineStatus: vi.fn(() => true) }));

// Mismo criterio que `ModalDesgloseCosto.test.tsx`: `firebase/firestore` y
// `../../firebase` van SIN mockear (los builders no hacen I/O), solo
// `useCollection`/`useOnlineStatus`.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return { ...actual, useCollection: mocks.useCollection, useOnlineStatus: mocks.useOnlineStatus };
});

interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoCompras: EstadoColeccionFalso<Compra> = { datos: [], cargando: false, error: null };

mocks.useCollection.mockImplementation((query: unknown) =>
  query === null ? { datos: [], cargando: false, error: null } : estadoCompras,
);

function configurarCompras(overrides: { datos?: Compra[]; cargando?: boolean; error?: unknown } = {}) {
  estadoCompras = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function productoDe(over: Partial<Producto> & Pick<Producto, 'id'>): Producto {
  return {
    nombre: 'Queso Añejo',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(50000),
    costoPromedioCents: money(30000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function compraDe(over: Partial<Compra> & Pick<Compra, 'id'>): Compra {
  return {
    fecha: new Date(2026, 6, 1),
    usuarioId: 'admin-1',
    estado: 'confirmada',
    proveedorNombre: 'Proveedor',
    items: [],
    gastos: [],
    totalFacturaCents: money(0),
    totalGastosCents: money(0),
    totalRealCents: money(0),
    ...over,
  };
}

describe('useDesgloseUltimaCompra', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
    estadoCompras = { datos: [], cargando: false, error: null };
  });

  it('activo=false: no suscribe (query null) y desglose es null', () => {
    configurarCompras({ datos: [] });
    const producto = productoDe({ id: 'p1' });

    const { result } = renderHook(() => useDesgloseUltimaCompra(producto, false));

    expect(result.current.desglose).toBeNull();
    for (const llamada of mocks.useCollection.mock.calls) {
      expect(llamada[0]).toBeNull();
    }
  });

  it('producto null: desglose null aunque activo sea true (no revienta)', () => {
    configurarCompras({
      datos: [
        compraDe({ id: 'c1', items: [{ productoId: 'p1', nombreProducto: 'Queso', costoFacturaCents: money(100) }] }),
      ],
    });

    const { result } = renderHook(() => useDesgloseUltimaCompra(null, true));

    expect(result.current.desglose).toBeNull();
  });

  it('activo=true con compra confirmada que incluye el producto: devuelve el desglose normalizado', () => {
    configurarCompras({
      datos: [
        compraDe({
          id: 'c1',
          fecha: new Date(2026, 5, 15),
          proveedorNombre: 'Lácteos del Sur',
          items: [
            {
              productoId: 'p1',
              nombreProducto: 'Queso Añejo',
              gramos: peso(1500),
              costoFacturaCents: money(30000),
              gastoProrrateadoCents: money(3000),
              costoRealCents: money(33000),
              costoRealKgCents: money(22000),
            },
          ],
        }),
      ],
    });
    const producto = productoDe({ id: 'p1', modoStock: 'granel' });

    const { result } = renderHook(() => useDesgloseUltimaCompra(producto, true));

    expect(result.current.desglose).toEqual({
      fecha: new Date(2026, 5, 15),
      proveedorNombre: 'Lácteos del Sur',
      unidad: 'kg',
      mercaderiaCents: money(20000),
      gastosCents: money(2000),
      costoRealCents: money(22000),
    });
  });

  it('sin compra confirmada que incluya el producto: desglose null', () => {
    configurarCompras({
      datos: [
        compraDe({ id: 'c1', items: [{ productoId: 'otro', nombreProducto: 'Otro', costoFacturaCents: money(100) }] }),
      ],
    });
    const producto = productoDe({ id: 'p1' });

    const { result } = renderHook(() => useDesgloseUltimaCompra(producto, true));

    expect(result.current.desglose).toBeNull();
  });

  it('expone cargando/error/enLinea tal cual los devuelve useCollection/useOnlineStatus', () => {
    configurarCompras({ cargando: true });
    mocks.useOnlineStatus.mockReturnValue(false);
    const producto = productoDe({ id: 'p1' });

    const { result } = renderHook(() => useDesgloseUltimaCompra(producto, true));

    expect(result.current.cargando).toBe(true);
    expect(result.current.enLinea).toBe(false);
  });

  it('reintentar cambia la identidad de la query (nueva llamada a useCollection con una query distinta)', () => {
    configurarCompras({ datos: [] });
    const producto = productoDe({ id: 'p1' });
    mocks.useCollection.mockClear();

    const { result, rerender } = renderHook(() => useDesgloseUltimaCompra(producto, true));

    const primeraQuery = mocks.useCollection.mock.calls.at(-1)?.[0];
    act(() => {
      result.current.reintentar();
    });
    rerender();
    const segundaQuery = mocks.useCollection.mock.calls.at(-1)?.[0];

    expect(primeraQuery).not.toBeNull();
    expect(segundaQuery).not.toBeNull();
    expect(segundaQuery).not.toBe(primeraQuery);
  });
});
