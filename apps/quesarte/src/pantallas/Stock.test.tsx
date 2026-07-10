import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, peso, type Categoria, type Pieza, type Producto } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { Stock } from './Stock';
import { StockLayout } from '../componentes/stock/StockLayout';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useAuth: mocks.useAuth,
  useOnlineStatus: mocks.useOnlineStatus,
  useCollection: mocks.useCollection,
  productoConverter: {},
  piezaConverter: {},
  categoriaConverter: {},
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
  /** Por defecto vacía: sin categorías definidas, la lista queda plana (comportamiento previo a CAT-3). */
  categorias?: EstadoFalso<Categoria>;
}) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'productos') return estados.productos ?? estadoOk([]);
    if (q.__path === 'piezas') return estados.piezas ?? estadoOk([]);
    if (q.__path === 'categorias') return estados.categorias ?? estadoOk([]);
    return { datos: [], cargando: false, error: null };
  });
}

/** Expone el `acciones` del header contextual actual como texto plano, para
 * poder aserirlo sin montar `Shell` completo (mismo criterio que
 * `ContextoHeader.test.tsx`). */
function VisorAcciones() {
  const config = useHeaderActual();
  return <div data-testid="acciones">{config?.acciones}</div>;
}

/** Placeholder de la ruta de detalle: solo confirma a qué `id` navegó. */
function PlaceholderDetalle() {
  const { id } = useParams<{ id: string }>();
  return <div>Detalle de {id}</div>;
}

function arbolStock() {
  return (
    <MemoryRouter initialEntries={['/stock']}>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorAcciones />
          <Routes>
            <Route element={<StockLayout />}>
              <Route path="/stock" element={<Stock />} />
            </Route>
            <Route path="/stock/producto/:id" element={<PlaceholderDetalle />} />
          </Routes>
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>
  );
}

/** `rerender` (además del resultado normal de `render`) para simular una
 * actualización en vivo de Firestore: reconfigurar `configurarCollections` y
 * volver a renderizar el mismo árbol hace que `useCollection` devuelva los
 * datos nuevos sin desmontar el componente, igual que un snapshot en vivo. */
function renderizar() {
  return render(arbolStock());
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

  it('vacío: mensaje y link a Catálogo', () => {
    configurarAuth('admin');
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });

    renderizar();

    expect(screen.getByText('Sin productos — creá el catálogo primero.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a Catálogo' }).getAttribute('href')).toBe('/stock/productos');
  });
});

describe('Stock - header contextual', () => {
  it('setea el título "Stock" y no declara acciones de navegación (el SelectorSeccion las reemplaza, docs/06 §2)', () => {
    configurarAuth('admin');
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });

    renderizar();

    expect(screen.getByTestId('acciones').textContent).toBe('');
  });
});

describe('Stock - SelectorSeccion', () => {
  it('admin: ve Stock, Catálogo y Proveedores, con "Stock" marcado activo (aria-current)', () => {
    configurarAuth('admin');
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });

    renderizar();

    const nav = screen.getByRole('navigation', { name: 'Secciones de Stock' });
    expect(nav).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Catálogo' }).getAttribute('href')).toBe('/stock/productos');
    expect(screen.getByRole('link', { name: 'Proveedores' }).getAttribute('href')).toBe('/stock/proveedores');
    expect(screen.getByRole('link', { name: 'Stock' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Catálogo' }).getAttribute('aria-current')).toBeNull();
  });

  it('vendedor: no ve el ítem "Proveedores" (solo admin, docs/07)', () => {
    configurarAuth('vendedor');
    configurarCollections({ productos: estadoOk([]), piezas: estadoOk([]) });

    renderizar();

    expect(screen.queryByRole('link', { name: 'Proveedores' })).toBeNull();
    // el catálogo sigue visible para el vendedor (necesario para el POS)
    expect(screen.getByRole('link', { name: 'Catálogo' })).toBeTruthy();
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

  it('tocar un producto navega a /stock/producto/:id (ruta real, no estado interno)', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    configurarCollections({ productos: estadoOk([prod]), piezas: estadoOk([]) });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Queso Colonia/ }));

    expect(screen.getByText('Detalle de p1')).toBeTruthy();
  });
});

function categoria(over: Partial<Categoria> & Pick<Categoria, 'nombre' | 'orden'>): Categoria {
  return { id: over.nombre, ...over };
}

describe('Stock - franja de alertas', () => {
  it('sin alertas: no renderiza la franja de chips', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel', stockGranelGramos: peso(5000) });
    configurarCollections({ productos: estadoOk([prod]) });

    renderizar();

    expect(screen.queryByRole('group', { name: 'Alertas de stock' })).toBeNull();
  });

  it('con productos vencidos y con stock bajo: muestra ambos chips con su conteo', () => {
    configurarAuth('admin');
    const ahora = new Date();
    const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
    const prodVencido = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    const prodBajo = producto({
      id: 'p2',
      nombre: 'Nuez mariposa',
      modoStock: 'granel',
      stockGranelGramos: peso(100),
      umbralAlertaStock: 500,
    });
    configurarCollections({
      productos: estadoOk([prodVencido, prodBajo]),
      piezas: estadoOk([pieza({ id: 'a', productoId: 'p1', fechaVencimiento: ayer })]),
    });

    renderizar();

    expect(screen.getByRole('button', { name: '1 por vencer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '1 stock bajo' })).toBeTruthy();
  });

  it('tocar el chip "por vencer" filtra la lista a esos productos; volver a tocarlo la restaura', () => {
    configurarAuth('admin');
    const ahora = new Date();
    const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
    const prodVencido = producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' });
    const prodOk = producto({ id: 'p2', nombre: 'Nuez mariposa', modoStock: 'granel', stockGranelGramos: peso(5000) });
    configurarCollections({
      productos: estadoOk([prodVencido, prodOk]),
      piezas: estadoOk([pieza({ id: 'a', productoId: 'p1', fechaVencimiento: ayer })]),
    });

    renderizar();
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Nuez mariposa')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '1 por vencer' }));

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByText('Nuez mariposa')).toBeNull();
    expect(screen.getByRole('button', { name: /1 por vencer/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /1 por vencer/ }));

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Nuez mariposa')).toBeTruthy();
  });

  it('tocar el chip "stock bajo" filtra la lista dejando solo esos productos', () => {
    configurarAuth('admin');
    const prodBajo = producto({
      id: 'p1',
      nombre: 'Nuez mariposa',
      modoStock: 'granel',
      stockGranelGramos: peso(100),
      umbralAlertaStock: 500,
    });
    const prodOk = producto({ id: 'p2', nombre: 'Queso Colonia', modoStock: 'granel', stockGranelGramos: peso(5000) });
    configurarCollections({ productos: estadoOk([prodBajo, prodOk]) });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: '1 stock bajo' }));

    expect(screen.getByText('Nuez mariposa')).toBeTruthy();
    expect(screen.queryByText('Queso Colonia')).toBeNull();
  });

  it('filtro activo sin salida: si una actualización en vivo lleva el conteo de la alerta activa a 0, el filtro se resetea solo', () => {
    configurarAuth('admin');
    const prodBajo = producto({
      id: 'p1',
      nombre: 'Nuez mariposa',
      modoStock: 'granel',
      stockGranelGramos: peso(100),
      umbralAlertaStock: 500,
    });
    const prodOk = producto({ id: 'p2', nombre: 'Queso Colonia', modoStock: 'granel', stockGranelGramos: peso(5000) });
    configurarCollections({ productos: estadoOk([prodBajo, prodOk]) });

    const { rerender } = renderizar();
    fireEvent.click(screen.getByRole('button', { name: '1 stock bajo' }));

    expect(screen.getByText('Nuez mariposa')).toBeTruthy();
    expect(screen.queryByText('Queso Colonia')).toBeNull();

    // Actualización en vivo: "Nuez mariposa" sube de stock y deja de estar
    // bajo el umbral — el conteo de "stock bajo" cae a 0 con el chip todavía
    // "activo" en el estado previo a este render.
    const prodYaNoBajo = producto({
      id: 'p1',
      nombre: 'Nuez mariposa',
      modoStock: 'granel',
      stockGranelGramos: peso(5000),
      umbralAlertaStock: 500,
    });
    configurarCollections({ productos: estadoOk([prodYaNoBajo, prodOk]) });
    rerender(arbolStock());

    expect(screen.getByText('Nuez mariposa')).toBeTruthy();
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Alertas de stock' })).toBeNull();
    for (const boton of screen.queryAllByRole('button')) {
      expect(boton.getAttribute('aria-pressed')).not.toBe('true');
    }
  });
});

describe('Stock - agrupación por categoría', () => {
  it('sin categorías definidas: lista plana, sin encabezados de sección', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel' });
    configurarCollections({ productos: estadoOk([prod]) });

    renderizar();

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryAllByRole('heading').length).toBe(0);
  });

  it('con categorías definidas: encabezados en el orden de `orden`, huérfanos al final bajo "Sin categoría"', () => {
    configurarAuth('admin');
    const categorias = estadoOk([
      categoria({ nombre: 'Quesos', orden: 0 }),
      categoria({ nombre: 'Miel', orden: 1 }),
    ]);
    const productos = estadoOk([
      producto({ id: 'p1', nombre: 'Miel 500g', categoria: 'Miel', modoPrecio: 'por_unidad', modoStock: 'unidad_simple', stockUnidades: 3 }),
      producto({ id: 'p2', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel', stockGranelGramos: peso(1000) }),
      producto({ id: 'p3', nombre: 'Especias raras', categoria: 'Especias', modoStock: 'granel', stockGranelGramos: peso(200) }),
    ]);
    configurarCollections({ productos, categorias });

    renderizar();

    const encabezados = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(encabezados).toEqual(['Quesos', 'Miel', 'Sin categoría']);
  });

  it('categoría sin productos no genera encabezado', () => {
    configurarAuth('admin');
    const categorias = estadoOk([
      categoria({ nombre: 'Quesos', orden: 0 }),
      categoria({ nombre: 'Miel', orden: 1 }), // sin productos
    ]);
    const productos = estadoOk([
      producto({ id: 'p1', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel', stockGranelGramos: peso(1000) }),
    ]);
    configurarCollections({ productos, categorias });

    renderizar();

    const encabezados = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(encabezados).toEqual(['Quesos']);
  });
});

describe('Stock - chips de filtro por categoría (docs/06-ui-ux.md §3, tarea UI-3d)', () => {
  it('sin categorías definidas, no muestra chips', () => {
    configurarAuth('admin');
    const prod = producto({ id: 'p1', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel' });
    configurarCollections({ productos: estadoOk([prod]) });

    renderizar();

    expect(screen.queryByRole('group', { name: 'Filtrar por categoría' })).toBeNull();
  });

  it('con una sola categoría con productos, no muestra chips (no aportan)', () => {
    configurarAuth('admin');
    const categorias = estadoOk([categoria({ nombre: 'Quesos', orden: 0 })]);
    const productos = estadoOk([
      producto({ id: 'p1', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel', stockGranelGramos: peso(1000) }),
    ]);
    configurarCollections({ productos, categorias });

    renderizar();

    expect(screen.queryByRole('group', { name: 'Filtrar por categoría' })).toBeNull();
  });

  it('con dos o más categorías con productos, tocar un chip deja solo ese grupo (los demás encabezados desaparecen)', () => {
    configurarAuth('admin');
    const categorias = estadoOk([
      categoria({ nombre: 'Quesos', orden: 0 }),
      categoria({ nombre: 'Miel', orden: 1 }),
    ]);
    const productos = estadoOk([
      producto({ id: 'p1', nombre: 'Miel 500g', categoria: 'Miel', modoPrecio: 'por_unidad', modoStock: 'unidad_simple', stockUnidades: 3 }),
      producto({ id: 'p2', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel', stockGranelGramos: peso(1000) }),
    ]);
    configurarCollections({ productos, categorias });

    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));

    const encabezados = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(encabezados).toEqual(['Quesos']);
    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByText('Miel 500g')).toBeNull();
  });

  it('compone con el chip de alerta activo (AND): filtrar por categoría y por alerta a la vez', () => {
    configurarAuth('admin');
    const categorias = estadoOk([
      categoria({ nombre: 'Quesos', orden: 0 }),
      categoria({ nombre: 'Miel', orden: 1 }),
    ]);
    const prodBajo = producto({
      id: 'p1',
      nombre: 'Queso bajo',
      categoria: 'Quesos',
      modoStock: 'granel',
      stockGranelGramos: peso(50),
      umbralAlertaStock: peso(500),
    });
    const prodMiel = producto({
      id: 'p2',
      nombre: 'Miel 500g',
      categoria: 'Miel',
      modoPrecio: 'por_unidad',
      modoStock: 'unidad_simple',
      stockUnidades: 1,
      umbralAlertaStock: 5,
    });
    configurarCollections({ productos: estadoOk([prodBajo, prodMiel]), categorias });

    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));
    fireEvent.click(screen.getByRole('button', { name: /stock bajo/ }));

    expect(screen.getByText('Queso bajo')).toBeTruthy();
    expect(screen.queryByText('Miel 500g')).toBeNull();
  });

  it('"Todas" vuelve a mostrar ambos grupos', () => {
    configurarAuth('admin');
    const categorias = estadoOk([
      categoria({ nombre: 'Quesos', orden: 0 }),
      categoria({ nombre: 'Miel', orden: 1 }),
    ]);
    const productos = estadoOk([
      producto({ id: 'p1', nombre: 'Miel 500g', categoria: 'Miel', modoPrecio: 'por_unidad', modoStock: 'unidad_simple', stockUnidades: 3 }),
      producto({ id: 'p2', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel', stockGranelGramos: peso(1000) }),
    ]);
    configurarCollections({ productos, categorias });

    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));

    const encabezados = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(encabezados).toEqual(['Quesos', 'Miel']);
  });
});
