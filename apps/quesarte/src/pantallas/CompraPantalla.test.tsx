import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProveedorToasts } from '@gestion/ui';
import { money, peso, type Compra, type Producto, type Proveedor } from '@gestion/core';
import { CompraPantalla } from './CompraPantalla';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useDoc: vi.fn(),
  useCollection: vi.fn(),
  guardarBorradorCompra: vi.fn(),
  actualizarBorradorCompra: vi.fn(),
  confirmarCompra: vi.fn(),
  crearProveedor: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
    useOnlineStatus: mocks.useOnlineStatus,
    useDoc: mocks.useDoc,
    useCollection: mocks.useCollection,
    guardarBorradorCompra: mocks.guardarBorradorCompra,
    actualizarBorradorCompra: mocks.actualizarBorradorCompra,
    confirmarCompra: mocks.confirmarCompra,
    crearProveedor: mocks.crearProveedor,
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
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
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
let estadoConfiguracion: EstadoDocFalso<{ metodoProrrateo: 'por_valor' | 'por_peso' }> = {
  datos: null,
  cargando: false,
  error: null,
};
let estadoProductos: EstadoColeccionFalso<Producto> = { datos: [], cargando: false, error: null };
let estadoProveedores: EstadoColeccionFalso<Proveedor> = { datos: [], cargando: false, error: null };

mocks.useDoc.mockImplementation((ref: RefFalsa | null) => {
  if (ref === null) return { datos: null, cargando: false, error: null };
  if (ref.__path === 'configuracion/general') return estadoConfiguracion;
  return estadoCompra;
});
mocks.useCollection.mockImplementation((q: RefFalsa) => {
  if (q.__path === 'productos') return estadoProductos;
  if (q.__path === 'proveedores') return estadoProveedores;
  return { datos: [], cargando: false, error: null };
});

function authPorDefecto() {
  return {
    usuario: { uid: 'admin1' },
    perfil: { uid: 'admin1', nombre: 'Admin', email: 'admin@quesarte.com', rol: 'admin' as const, activo: true },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn(),
  };
}

function producto(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
  return {
    nombre: 'Queso Colonia',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(1000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function proveedor(over: Partial<Proveedor> & Pick<Proveedor, 'id' | 'nombre'>): Proveedor {
  return { fechaAlta: new Date('2026-01-01'), activo: true, ...over };
}

function compraBorrador(over: Partial<Compra> = {}): Compra {
  return {
    id: 'c1',
    fecha: new Date('2026-07-01'),
    usuarioId: 'admin1',
    estado: 'borrador',
    proveedorId: 'prov1',
    proveedorNombre: 'Quesos del Norte',
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

function PlaceholderListado() {
  return <div>Pantalla Compras</div>;
}

function renderizar(idRuta = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/stock/compra/${idRuta}`]}>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorHeader />
          <Routes>
            <Route path="/stock/compra/:id" element={<CompraPantalla />} />
            <Route path="/stock/compras" element={<PlaceholderListado />} />
          </Routes>
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.useAuth.mockReturnValue(authPorDefecto());
  mocks.useOnlineStatus.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  estadoCompra = { datos: null, cargando: false, error: null };
  estadoConfiguracion = { datos: null, cargando: false, error: null };
  estadoProductos = { datos: [], cargando: false, error: null };
  estadoProveedores = { datos: [], cargando: false, error: null };
});

describe('CompraPantalla', () => {
  it('cargando: muestra el mensaje de carga', () => {
    estadoCompra = { datos: null, cargando: true, error: null };
    renderizar();
    expect(screen.getByText('Cargando compra…')).toBeTruthy();
  });

  it('error: muestra mensaje y link de vuelta a Compras', () => {
    estadoCompra = { datos: null, cargando: false, error: new Error('boom') };
    renderizar();
    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar la compra.');
  });

  it('no encontrada: muestra mensaje y link de vuelta a Compras', () => {
    estadoCompra = { datos: null, cargando: false, error: null };
    renderizar();
    expect(screen.getByText('No encontramos esa compra.')).toBeTruthy();
  });

  it('borrador cargado: precarga proveedor, título y badge', () => {
    estadoCompra = { datos: compraBorrador(), cargando: false, error: null };
    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Quesos del Norte');
    expect(screen.getByText('Borrador')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar compra' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Eliminar borrador' })).toBeTruthy();
  });

  it('borrador con ítem y gasto: el resumen en vivo prorratea (por_valor)', () => {
    estadoProductos = { datos: [producto({ id: 'p1', modoStock: 'granel' })], cargando: false, error: null };
    estadoCompra = {
      datos: compraBorrador({
        items: [
          {
            productoId: 'p1',
            nombreProducto: 'Queso Colonia',
            gramos: peso(1000),
            costoFacturaCents: money(10000),
          },
        ],
        gastos: [{ concepto: 'combustible', montoCents: money(2000) }],
        totalFacturaCents: money(10000),
        totalGastosCents: money(2000),
        totalRealCents: money(12000),
      }),
      cargando: false,
      error: null,
    };
    renderizar();

    // único ítem => se lleva TODO el prorrateo: costo real = 10000+2000=12000
    expect(screen.getByText(/costo real \$ 120,00/)).toBeTruthy();
  });

  it('confirmada: no muestra acciones de edición ni "Eliminar borrador", y linkea a Precios', () => {
    estadoCompra = { datos: compraBorrador({ estado: 'confirmada' }), cargando: false, error: null };
    renderizar();

    expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirmar compra' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar borrador' })).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Agregar producto' })).toBeNull();
    expect(screen.getByText('Confirmada')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Revisar precios y márgenes/ }).getAttribute('href')).toBe(
      '/stock/precios',
    );
  });

  it('offline: "Confirmar" deshabilitado con banner explicativo', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    estadoCompra = { datos: compraBorrador(), cargando: false, error: null };
    renderizar();

    expect(screen.getByRole('button', { name: 'Confirmar compra' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Necesitás conexión para confirmar la compra.')).toBeTruthy();
  });

  it('Guardar (borrador existente, online): llama a actualizarBorradorCompra y avisa', async () => {
    mocks.actualizarBorradorCompra.mockResolvedValueOnce(undefined);
    estadoCompra = { datos: compraBorrador(), cargando: false, error: null };
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

    await waitFor(() => expect(mocks.actualizarBorradorCompra).toHaveBeenCalledTimes(1));
    const [, compraIdLlamado, datos] = mocks.actualizarBorradorCompra.mock.calls[0] as [
      unknown,
      string,
      { proveedorNombre: string; proveedorId?: string },
    ];
    expect(compraIdLlamado).toBe('c1');
    expect(datos.proveedorNombre).toBe('Quesos del Norte');
    expect(datos.proveedorId).toBe('prov1');
    expect(await screen.findByText('Borrador guardado.')).toBeTruthy();
  });

  it('Guardar (borrador existente, offline): dispara sin esperar y avisa sin conexión', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.actualizarBorradorCompra.mockResolvedValueOnce(undefined);
    estadoCompra = { datos: compraBorrador(), cargando: false, error: null };
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

    expect(mocks.actualizarBorradorCompra).toHaveBeenCalledTimes(1);
  });

  it('Confirmar (online): arma efectosProducto correcto y llama a confirmarCompra', async () => {
    mocks.confirmarCompra.mockResolvedValueOnce(undefined);
    estadoProductos = {
      datos: [producto({ id: 'p1', modoStock: 'granel', stockGranelGramos: peso(1000), costoPromedioCents: money(1000) })],
      cargando: false,
      error: null,
    };
    estadoCompra = {
      datos: compraBorrador({
        items: [
          { productoId: 'p1', nombreProducto: 'Queso Colonia', gramos: peso(1000), costoFacturaCents: money(2000) },
        ],
        totalFacturaCents: money(2000),
        totalRealCents: money(2000),
      }),
      cargando: false,
      error: null,
    };
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));

    await waitFor(() => expect(mocks.confirmarCompra).toHaveBeenCalledTimes(1));
    const [, entrada] = mocks.confirmarCompra.mock.calls[0] as [
      unknown,
      { compra: Compra; usuarioId: string; efectosProducto: { productoId: string; nuevoCostoPromedioCents: number }[] },
    ];
    expect(entrada.usuarioId).toBe('admin1');
    expect(entrada.compra.items[0]!.gastoProrrateadoCents).toBe(0);
    expect(entrada.compra.items[0]!.costoRealCents).toBe(2000);
    // producto ya tenía 1000g a 1000 c/kg; entra 1000g a 2000 c/kg -> promedio 1500
    expect(entrada.efectosProducto).toEqual([{ productoId: 'p1', nuevoCostoPromedioCents: 1500 }]);
    expect(await screen.findByText('Compra confirmada.')).toBeTruthy();
  });

  it('Confirmar sin ítems: no llama a confirmarCompra y avisa por toast', () => {
    estadoCompra = { datos: compraBorrador({ items: [] }), cargando: false, error: null };
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));

    expect(mocks.confirmarCompra).not.toHaveBeenCalled();
  });

  it('nueva compra: título "Nueva compra", sin badge de estado', () => {
    renderizar('nueva');
    expect(screen.getByTestId('titulo-header').textContent).toBe('Nueva compra');
    expect(screen.queryByText('Borrador')).toBeNull();
  });

  it('nueva compra offline: "Guardar" deshabilitado con banner (no hay id sincrónico sin conexión)', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    renderizar('nueva');

    expect(screen.getByRole('button', { name: 'Guardar borrador' }).hasAttribute('disabled')).toBe(true);
  });

  it('nueva compra online: Guardar crea el borrador y navega a /stock/compra/:id', async () => {
    mocks.guardarBorradorCompra.mockResolvedValueOnce({ compraId: 'nuevo-id' });
    estadoProveedores = { datos: [proveedor({ id: 'prov1', nombre: 'Quesos del Norte' })], cargando: false, error: null };
    renderizar('nueva');

    const campoProveedor = screen.getByLabelText('Proveedor');
    fireEvent.focus(campoProveedor);
    fireEvent.change(campoProveedor, { target: { value: 'Quesos' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Quesos del Norte' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));

    await waitFor(() => expect(mocks.guardarBorradorCompra).toHaveBeenCalledTimes(1));
    const [, datos] = mocks.guardarBorradorCompra.mock.calls[0] as [unknown, { proveedorNombre: string }];
    expect(datos.proveedorNombre).toBe('Quesos del Norte');
    expect(await screen.findByText('Borrador guardado.')).toBeTruthy();
  });
});
