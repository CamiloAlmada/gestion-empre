import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import { StockInsuficienteError, type EntradaVenta } from '@gestion/firebase-kit';
import { ProveedorToasts } from '@gestion/ui';
import { Venta } from './Venta';
import { ProveedorHeader } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  registrarVenta: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
    registrarVenta: mocks.registrarVenta,
  };
});

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
}));

interface EstadoFalso<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

function estadoOk<T>(datos: T[]): EstadoFalso<T> {
  return { datos, cargando: false, error: null };
}

function configurarAuth() {
  mocks.useAuth.mockReturnValue({
    usuario: { uid: 'u1' },
    perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@quesarte.com', rol: 'vendedor', activo: true },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn(),
  });
}

function configurarCollections(estados: { productos?: EstadoFalso<Producto>; piezas?: EstadoFalso<Pieza> }) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'productos') return estados.productos ?? estadoOk([]);
    if (q.__path === 'piezas') return estados.piezas ?? estadoOk([]);
    return { datos: [], cargando: false, error: null };
  });
}

function productoDe(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock' | 'modoPrecio'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'cat',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function piezaDe(over: Partial<Pieza> & Pick<Pieza, 'id' | 'productoId'>): Pieza {
  return {
    pesoInicialGramos: peso(1000),
    pesoRestanteGramos: peso(1000),
    costoKgCents: money(500),
    fechaIngreso: new Date('2026-01-01T10:00:00'),
    estado: 'disponible',
    ...over,
  };
}

const quesoColonia = productoDe({
  id: 'p1',
  nombre: 'Queso Colonia',
  categoria: 'Quesos',
  modoStock: 'fraccionado_por_pieza',
  modoPrecio: 'por_kg',
  precioVentaCents: money(89900),
});

const salame = productoDe({
  id: 'p2',
  nombre: 'Salame tandilero',
  categoria: 'Embutidos',
  modoStock: 'pieza_entera',
  modoPrecio: 'por_kg',
  precioVentaCents: money(120000),
});

const nuezMariposa = productoDe({
  id: 'p3',
  nombre: 'Nuez mariposa',
  categoria: 'Frutos secos',
  modoStock: 'granel',
  modoPrecio: 'por_kg',
  precioVentaCents: money(45000),
  stockGranelGramos: peso(500),
});

const mielFrasco = productoDe({
  id: 'p4',
  nombre: 'Miel 500g',
  categoria: 'Miel',
  modoStock: 'unidad_simple',
  modoPrecio: 'por_unidad',
  precioVentaCents: money(45000),
  stockUnidades: 5,
});

function renderizar() {
  return render(
    <MemoryRouter>
      <ProveedorToasts>
        <ProveedorHeader>
          <Venta />
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

function tipearPeso(texto: string) {
  for (const char of texto) {
    if (char === ',') {
      fireEvent.click(screen.getByRole('button', { name: 'Coma decimal' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: char }));
    }
  }
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useOnlineStatus.mockReturnValue(true);
});

describe('Venta - estados', () => {
  it('cargando', () => {
    configurarAuth();
    configurarCollections({ productos: { datos: [], cargando: true, error: null } });
    renderizar();
    expect(screen.getByText('Cargando productos…')).toBeTruthy();
  });

  it('error con reintento', () => {
    configurarAuth();
    configurarCollections({ productos: { datos: [], cargando: false, error: { code: 'unavailable' } as FirestoreError } });
    renderizar();
    expect(screen.getByText('No se pudo cargar el catálogo. Revisá tu conexión e intentá de nuevo.')).toBeTruthy();
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))).not.toThrow();
  });

  it('vacío con link al catálogo', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });
    renderizar();
    expect(screen.getByText('Sin productos — creá el catálogo primero.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Productos' }).getAttribute('href')).toBe('/stock/productos');
  });

});

describe('Venta - agregar al carrito por modo', () => {
  it('fraccionado_por_pieza: FIFO automático agrega el ítem con la pieza y el peso correctos', () => {
    configurarAuth();
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1' });
    configurarCollections({ productos: estadoOk([quesoColonia]), piezas: estadoOk([pieza]) });
    renderizar();

    fireEvent.click(screen.getByText('Queso Colonia'));
    tipearPeso('0,3');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // 89900 * 300 / 1000 = 26970 -> $ 269,70
    expect(screen.getAllByText('$ 269,70').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/300 g · pieza del/).length).toBeGreaterThan(0);
  });

  it('fraccionado_por_pieza: un segundo corte de la MISMA pieza ve el restante ya descontado por el carrito', () => {
    configurarAuth();
    const pieza = piezaDe({ id: 'pz1', productoId: 'p1', pesoRestanteGramos: peso(1000) });
    configurarCollections({ productos: estadoOk([quesoColonia]), piezas: estadoOk([pieza]) });
    renderizar();

    // Primer corte: 700 g de una pieza de 1000 g.
    fireEvent.click(screen.getAllByText('Queso Colonia')[0]!);
    tipearPeso('0,7');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // Reabrir para un segundo corte del mismo producto: la pieza FIFO
    // ofrecida ahora es la MISMA, pero con el restante ajustado (300 g, no
    // 1000 g) por lo que el carrito ya reservó (piezasAjustadasPorCarrito).
    fireEvent.click(screen.getAllByText('Queso Colonia')[0]!);
    tipearPeso('0,3');

    expect(screen.getByText(/300 g restante/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    // Pedir más de lo que en verdad queda (300 g) SÍ dispara el aviso.
    fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));
    tipearPeso('0,4');
    expect(screen.getByRole('alert').textContent).toContain('menos de lo pedido');
  });

  it('pieza_entera: agregar consume la pieza y no vuelve a ofrecerla', () => {
    configurarAuth();
    const pieza = piezaDe({ id: 'pz2', productoId: 'p2', pesoRestanteGramos: peso(850) });
    configurarCollections({ productos: estadoOk([salame]), piezas: estadoOk([pieza]) });
    renderizar();

    fireEvent.click(screen.getByText('Salame tandilero'));
    fireEvent.click(screen.getByText('850 g'));

    expect(screen.getAllByText('Pieza entera · 850 g').length).toBeGreaterThan(0);

    // Reabrir el selector para el mismo producto (la card de la grilla, no
    // la fila que ya quedó en el carrito): la pieza ya usada no aparece.
    fireEvent.click(screen.getAllByText('Salame tandilero')[0]!);
    expect(screen.getByRole('alert').textContent).toContain('No hay piezas disponibles');
  });

  it('granel: agrega el peso validado contra stockGranelGramos', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([nuezMariposa]), piezas: estadoOk([]) });
    renderizar();

    fireEvent.click(screen.getByText('Nuez mariposa'));
    tipearPeso('0,2');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // 45000 * 200 / 1000 = 9000 -> $ 90,00
    expect(screen.getAllByText('$ 90,00').length).toBeGreaterThan(0);
  });

  it('unidad_simple: el stepper agrega la cantidad elegida', () => {
    configurarAuth();
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]) });
    renderizar();

    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar una unidad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(screen.getAllByText('2 unidades').length).toBeGreaterThan(0);
    // 45000 * 2 = 90000 -> $ 900,00
    expect(screen.getAllByText('$ 900,00').length).toBeGreaterThan(0);
  });
});

describe('Venta - cobro', () => {
  function agregarUnidadAlCarrito() {
    configurarCollections({ productos: estadoOk([mielFrasco]), piezas: estadoOk([]) });
    renderizar();
    fireEvent.click(screen.getByText('Miel 500g'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
  }

  it('cobro online: llama a registrarVenta con la EntradaVenta exacta y vacía el carrito al confirmar', async () => {
    configurarAuth();
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    agregarUnidadAlCarrito();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    await waitFor(() => expect(mocks.registrarVenta).toHaveBeenCalledTimes(1));
    const [, entrada] = mocks.registrarVenta.mock.calls[0] as [unknown, EntradaVenta];
    expect(entrada.usuarioId).toBe('u1');
    expect(entrada.medioPago).toBe('efectivo');
    expect(entrada.totalCents).toBe(money(45000));
    expect(entrada.items).toHaveLength(1);
    expect(entrada.items[0]).toMatchObject({
      producto: mielFrasco,
      unidades: 1,
      precioUnitCents: money(45000),
      subtotalCents: money(45000),
    });

    expect(await screen.findByText('Venta registrada.')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0));
  });

  it('cobro offline: no espera el ack, vacía el carrito y avisa con un toast info', async () => {
    configurarAuth();
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.registrarVenta.mockResolvedValue({ ventaId: 'v1' });
    agregarUnidadAlCarrito();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    // Sincrónico: el carrito ya está vacío en el mismo tick, sin esperar el ack.
    expect(mocks.registrarVenta).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0);
    expect(await screen.findByText('Venta guardada sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
  });

  it('cobro offline: si la sincronización tardía falla, el toast es honesto (la venta no quedó guardada, no "Revisala en Historial")', async () => {
    configurarAuth();
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.registrarVenta.mockRejectedValue(new StockInsuficienteError('sin stock'));
    agregarUnidadAlCarrito();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      await screen.findByText('No se pudo registrar la venta: no hay stock suficiente. La venta no quedó guardada.'),
    ).toBeTruthy();
  });

  it('StockInsuficienteError: mensaje específico y el carrito queda intacto', async () => {
    configurarAuth();
    mocks.registrarVenta.mockRejectedValue(new StockInsuficienteError('sin stock'));
    agregarUnidadAlCarrito();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(
      await screen.findByText('No hay stock suficiente para completar la venta. Revisá los ítems del carrito.'),
    ).toBeTruthy();
    // El carrito sigue teniendo el ítem: no se vació.
    expect(screen.getAllByText('Miel 500g').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Todavía no agregaste productos.').length).toBe(0);
  });
});
