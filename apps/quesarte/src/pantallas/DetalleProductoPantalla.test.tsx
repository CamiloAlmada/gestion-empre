import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, peso, type Categoria, type Pieza, type Producto } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { DetalleProductoPantalla } from './DetalleProductoPantalla';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => {
  class IngresoInvalidoError extends Error {}
  class AjusteInvalidoError extends Error {}
  class StockInsuficienteError extends Error {}
  class CategoriaInvalidaError extends Error {}
  class CategoriaDuplicadaError extends Error {}
  return {
    useAuth: vi.fn(),
    useCollection: vi.fn(),
    useOnlineStatus: vi.fn(() => true),
    ingresarPiezas: vi.fn(),
    ajustarStock: vi.fn(),
    updateDoc: vi.fn(),
    crearCategoria: vi.fn(),
    IngresoInvalidoError,
    AjusteInvalidoError,
    StockInsuficienteError,
    CategoriaInvalidaError,
    CategoriaDuplicadaError,
  };
});

// `ModalProducto` (montado acá en modo edición, UI-5b) trae sus propias
// dependencias de Firebase (`useOnlineStatus`, `crearCategoria` para el
// picker de categoría con creación inline): se agregan al mismo mock entero
// de este archivo, mismo criterio que el resto de los mocks de acá — nada
// de `importOriginal` (esta suite prefiere fingir todo el módulo, con refs
// falsas de 'firebase/firestore', a diferencia de Productos.test.tsx).
vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useCollection: mocks.useCollection,
  useOnlineStatus: mocks.useOnlineStatus,
  productoConverter: {},
  piezaConverter: {},
  movimientoConverter: {},
  categoriaConverter: {},
  ingresarPiezas: mocks.ingresarPiezas,
  ajustarStock: mocks.ajustarStock,
  crearCategoria: mocks.crearCategoria,
  IngresoInvalidoError: mocks.IngresoInvalidoError,
  AjusteInvalidoError: mocks.AjusteInvalidoError,
  StockInsuficienteError: mocks.StockInsuficienteError,
  CategoriaInvalidaError: mocks.CategoriaInvalidaError,
  CategoriaDuplicadaError: mocks.CategoriaDuplicadaError,
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
  doc: (_db: unknown, coleccion: string, id: string) => crearRef(`${coleccion}/${id}`),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
  limit: (n: number) => ({ __tipo: 'limit', n }),
  updateDoc: mocks.updateDoc,
  deleteField: () => '__deleteField__',
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

function categoriaDe(over: Partial<Categoria> & Pick<Categoria, 'id' | 'nombre' | 'orden'>): Categoria {
  return { ...over };
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
  categorias?: EstadoFalso<Categoria>;
}) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'productos') return estados.productos ?? estadoOk([]);
    if (q.__path === 'piezas') return estados.piezas ?? estadoOk([]);
    if (q.__path === 'movimientos') return estados.movimientos ?? estadoOk([]);
    if (q.__path === 'categorias') return estados.categorias ?? estadoOk([]);
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
  // `clearAllMocks` limpia llamadas/resultados pero NO un `mockReturnValue`
  // ya fijado (mismo motivo que Productos.test.tsx): sin esto, un test que
  // pone `useOnlineStatus` en `false` dejaría ese valor filtrado al siguiente.
  mocks.useOnlineStatus.mockReturnValue(true);
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

    expect(screen.getByText('No encontramos ese producto.')).toBeTruthy();
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

  it('no muestra el SelectorSeccion (es un drill-down, no una raíz de sección — docs/06 §2)', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();

    expect(screen.queryByRole('navigation', { name: 'Secciones de Stock' })).toBeNull();
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

/** Scopea las aserciones a la ficha de configuración (`<section
 * aria-labelledby="ficha-configuracion-titulo">`, ver `DetalleProducto.tsx`):
 * necesario porque `ModalProducto` en modo edición queda SIEMPRE montado acá
 * (dialog cerrado, patrón de instancia estable) y repite textos como
 * "Activo"/"Inactivo" (grupo "Estado") y "Umbral de alerta de stock
 * (opcional)" (label del input) — sin este scope, `getByText` ambiguaría
 * entre la ficha (texto real) y el formulario oculto del modal. */
function ficha() {
  return within(screen.getByRole('region', { name: 'Configuración' }));
}

describe('DetalleProductoPantalla - ficha de configuración (UI-5b, hub único del producto)', () => {
  // (a) UI-5a había filtrado `where('activo', '==', true)` en la query de
  // productos de esta pantalla: un producto inactivo (llegable desde el
  // chip "Inactivos" de la lista fusionada) caía en "no encontrado" — sin
  // forma de reactivarlo. UI-5b saca ese filtro (hallazgo 1 de UI-5a).
  it('carga un producto INACTIVO (sin where activo) y muestra su estado en la ficha', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Salame viejo', modoStock: 'granel', activo: false });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Salame viejo');
    expect(ficha().getByText('Inactivo')).toBeTruthy();
  });

  it('muestra categoría, modo y umbral (si tiene) para cualquier rol', () => {
    configurarAuth('vendedor');
    const prod = producto({
      id: 'p1',
      nombre: 'Nuez mariposa',
      categoria: 'Frutos secos',
      modoStock: 'granel',
      umbralAlertaStock: 500,
    });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();

    expect(ficha().getByText('Frutos secos')).toBeTruthy();
    expect(ficha().getByText('Por kg · Granel')).toBeTruthy();
    expect(ficha().getByText('500 g')).toBeTruthy();
    expect(ficha().getByText('Activo')).toBeTruthy();
  });

  it('sin umbral definido, no muestra la fila "Umbral de alerta"', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', modoStock: 'granel' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();

    expect(ficha().queryByText(/Umbral de alerta/)).toBeNull();
  });

  // (b) ficha visible para vendedor, SIN botón Editar.
  it('vendedor: ve la ficha de configuración pero NO el botón "Editar"', () => {
    configurarAuth('vendedor');
    const prod = producto({ id: 'p1', modoStock: 'granel' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();

    expect(screen.getByText('Configuración')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
  });

  it('admin: ve el botón "Editar" y tocarlo abre ModalProducto en modo edición (sin campo precio)', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    expect(screen.getByText('Editar producto')).toBeTruthy();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Queso Colonia');
    // (c) el precio NO se muestra en edición (docs/06-ui-ux.md §2, UI-5b).
    expect(screen.queryByLabelText('Precio por kg')).toBeNull();
    expect(screen.queryByLabelText('Precio por unidad')).toBeNull();
  });

  it('admin: el select de categoría del modal de edición trae el vocabulario cargado por esta pantalla', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel' });
    configurarCollections({
      productos: estadoOk([prod]),
      piezas: estadoOk([]),
      categorias: estadoOk([
        categoriaDe({ id: 'c1', nombre: 'Quesos', orden: 0 }),
        categoriaDe({ id: 'c2', nombre: 'Miel', orden: 1 }),
      ]),
    });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    const select = screen.getByLabelText('Categoría') as HTMLSelectElement;
    const etiquetas = Array.from(select.options).map((o) => o.text);
    expect(etiquetas).toContain('Quesos');
    expect(etiquetas).toContain('Miel');
    expect(select.value).toBe('Quesos');
  });

  // (c) el update de edición no escribe `precioVentaCents`.
  it('edición: guarda un update SIN precioVentaCents ni modoPrecio/modoStock', async () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });
    mocks.updateDoc.mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Queso Colonia Premium' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledTimes(1));
    const [, cambios] = mocks.updateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(cambios.nombre).toBe('Queso Colonia Premium');
    expect(cambios).not.toHaveProperty('precioVentaCents');
    expect(cambios).not.toHaveProperty('modoPrecio');
    expect(cambios).not.toHaveProperty('modoStock');
  });

  it('edición: reactivar un producto inactivo llama a updateDoc con activo: true', async () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Salame viejo', modoStock: 'granel', activo: false });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });
    mocks.updateDoc.mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Activo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledTimes(1));
    const [, cambios] = mocks.updateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(cambios.activo).toBe(true);
  });

  it('sin conexión: la edición guarda sin esperar el ack, cierra el modal al instante y avisa que falta sincronizar', async () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.updateDoc.mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
  });
});
