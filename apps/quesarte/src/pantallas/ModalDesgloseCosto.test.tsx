import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProveedorTema } from '@gestion/ui';
import { money, peso, type Compra, type Producto } from '@gestion/core';
import { ModalDesgloseCosto, type ModalDesgloseCostoProps } from './ModalDesgloseCosto';

const mocks = vi.hoisted(() => ({ useCollection: vi.fn(), useOnlineStatus: vi.fn(() => true) }));

// Mismo criterio que `Precios.test.tsx`: `firebase/firestore` y `../firebase`
// van SIN mockear (los builders `collection`/`query`/`where`/`orderBy` no
// hacen I/O; la suscripción real la reemplaza el mock de `useCollection`).
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

/** `useCollection(null)` (modal cerrado, ver `ModalDesgloseCosto`) devuelve
 * el estado inerte real de `firebase-kit` — el mock solo interviene con la
 * query real (modal abierto). */
mocks.useCollection.mockImplementation((query: unknown) =>
  query === null ? { datos: [], cargando: false, error: null } : estadoCompras,
);

function configurarCompras(overrides: { datos?: Compra[]; cargando?: boolean; error?: unknown }) {
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
    proveedorNombre: 'Lácteos del Sur',
    items: [],
    gastos: [],
    totalFacturaCents: money(0),
    totalGastosCents: money(0),
    totalRealCents: money(0),
    ...over,
  };
}

function renderizar(overrides: Partial<ModalDesgloseCostoProps> = {}) {
  const onCerrar = vi.fn();
  const props: ModalDesgloseCostoProps = {
    abierto: true,
    producto: productoDe({ id: 'p1' }),
    onCerrar,
    ...overrides,
  };
  render(
    <ProveedorTema>
      <ModalDesgloseCosto {...props} />
    </ProveedorTema>,
  );
  return { onCerrar };
}

describe('ModalDesgloseCosto', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
    estadoCompras = { datos: [], cargando: false, error: null };
  });

  it('título incluye el nombre del producto', () => {
    configurarCompras({ datos: [] });
    renderizar({ producto: productoDe({ id: 'p1', nombre: 'Queso Colonia' }) });
    expect(screen.getByText('Desglose de costo · Queso Colonia')).toBeTruthy();
  });

  it('estado cargando', () => {
    configurarCompras({ cargando: true });
    renderizar();
    expect(screen.getByText('Cargando desglose…')).toBeTruthy();
  });

  it('estado error: muestra mensaje y "Reintentar"', () => {
    configurarCompras({ error: new Error('boom') });
    renderizar();
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar el desglose de costo.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('(e) sin compra confirmada que incluya el producto: estado vacío diseñado', () => {
    configurarCompras({
      datos: [compraDe({ id: 'c1', items: [{ productoId: 'otro', nombreProducto: 'Otro', costoFacturaCents: money(100) }] })],
    });
    renderizar();
    expect(screen.getByText('El costo actual no proviene de una compra registrada.')).toBeTruthy();
  });

  it('offline y no encontrado: pide conexión en vez de asumir que no hay compra (dato de caché incompleto)', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    configurarCompras({ datos: [] });
    renderizar();
    expect(screen.getByText('Necesitás conexión para ver el desglose de costo.')).toBeTruthy();
  });

  describe('(b) desglose normalizado a la unidad del costo', () => {
    it('ítem al peso (/kg): mercadería, gastos y costo real exactos en centésimos', () => {
      // 1.5 kg (1500 g): factura $300,00 (30000c), gasto prorrateado $30,00
      // (3000c) → real 33000c. Por kg: 30000*1000/1500=20000; 3000*1000/1500=2000;
      // real 33000*1000/1500=22000 (coincide con la suma acá, sin resto).
      const producto = productoDe({ id: 'p1', nombre: 'Queso Añejo', modoStock: 'granel' });
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
      renderizar({ producto });

      expect(screen.getByText('15/06/2026')).toBeTruthy();
      expect(screen.getByText('Lácteos del Sur')).toBeTruthy();
      expect(screen.getByText('$ 200,00 /kg')).toBeTruthy(); // mercadería
      expect(screen.getByText('$ 20,00 /kg')).toBeTruthy(); // gastos
      expect(screen.getByText('$ 220,00 /kg')).toBeTruthy(); // costo real (persistido, no recalculado)
      expect(
        screen.getByText(/El costo promedio vigente puede mezclar esta compra/),
      ).toBeTruthy();
    });

    it('ítem por unidad (/u): mercadería, gastos y costo real exactos en centésimos', () => {
      // 4 unidades: factura $400,00 (40000c), gasto prorrateado $40,00
      // (4000c) → real 44000c. Por unidad: 40000/4=10000; 4000/4=1000; 44000/4=11000.
      const producto = productoDe({
        id: 'p2',
        nombre: 'Miel 500g',
        modoStock: 'unidad_simple',
        modoPrecio: 'por_unidad',
      });
      configurarCompras({
        datos: [
          compraDe({
            id: 'c1',
            fecha: new Date(2026, 5, 20),
            proveedorNombre: 'Apiario Norte',
            items: [
              {
                productoId: 'p2',
                nombreProducto: 'Miel 500g',
                unidades: 4,
                costoFacturaCents: money(40000),
                gastoProrrateadoCents: money(4000),
                costoRealCents: money(44000),
              },
            ],
          }),
        ],
      });
      renderizar({ producto });

      expect(screen.getByText('$ 100,00 /u')).toBeTruthy(); // mercadería
      expect(screen.getByText('$ 10,00 /u')).toBeTruthy(); // gastos
      expect(screen.getByText('$ 110,00 /u')).toBeTruthy(); // costo real
    });
  });

  it('(c) con varias compras confirmadas que incluyen el producto, usa la MÁS RECIENTE', () => {
    const producto = productoDe({ id: 'p1' });
    configurarCompras({
      datos: [
        // Ya vienen ordenadas por fecha desc (misma query que Compras.tsx).
        compraDe({
          id: 'reciente',
          fecha: new Date(2026, 6, 10),
          proveedorNombre: 'Proveedor Nuevo',
          items: [
            {
              productoId: 'p1',
              nombreProducto: 'Queso Añejo',
              gramos: peso(1000),
              costoFacturaCents: money(20000),
              gastoProrrateadoCents: money(0),
              costoRealCents: money(20000),
              costoRealKgCents: money(20000),
            },
          ],
        }),
        compraDe({
          id: 'vieja',
          fecha: new Date(2026, 4, 1),
          proveedorNombre: 'Proveedor Viejo',
          items: [
            {
              productoId: 'p1',
              nombreProducto: 'Queso Añejo',
              gramos: peso(1000),
              costoFacturaCents: money(10000),
              gastoProrrateadoCents: money(0),
              costoRealCents: money(10000),
              costoRealKgCents: money(10000),
            },
          ],
        }),
      ],
    });
    renderizar({ producto });

    expect(screen.getByText('Proveedor Nuevo')).toBeTruthy();
    expect(screen.queryByText('Proveedor Viejo')).toBeNull();
    // Mercadería y costo real coinciden en $200 (sin gasto prorrateado en
    // este fixture) — ambos vienen de la compra RECIENTE, ninguno de la vieja
    // ($100, que no aparece en absoluto).
    expect(screen.getAllByText('$ 200,00 /kg').length).toBe(2);
    expect(screen.queryByText('$ 100,00 /kg')).toBeNull();
  });

  it('(d) ignora borradores: una compra en borrador más reciente no gana a una confirmada más vieja', () => {
    const producto = productoDe({ id: 'p1' });
    configurarCompras({
      datos: [
        compraDe({
          id: 'borrador-reciente',
          estado: 'borrador',
          fecha: new Date(2026, 6, 12),
          proveedorNombre: 'Proveedor Borrador',
          items: [
            {
              productoId: 'p1',
              nombreProducto: 'Queso Añejo',
              gramos: peso(1000),
              costoFacturaCents: money(99900),
            },
          ],
        }),
        compraDe({
          id: 'confirmada-vieja',
          estado: 'confirmada',
          fecha: new Date(2026, 4, 1),
          proveedorNombre: 'Proveedor Confirmado',
          items: [
            {
              productoId: 'p1',
              nombreProducto: 'Queso Añejo',
              gramos: peso(1000),
              costoFacturaCents: money(10000),
              gastoProrrateadoCents: money(0),
              costoRealCents: money(10000),
              costoRealKgCents: money(10000),
            },
          ],
        }),
      ],
    });
    renderizar({ producto });

    expect(screen.getByText('Proveedor Confirmado')).toBeTruthy();
    expect(screen.queryByText('Proveedor Borrador')).toBeNull();
  });

  it('(f) botón "Cerrar" llama a onCerrar', () => {
    configurarCompras({ datos: [] });
    const { onCerrar } = renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
