import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { ProveedorTema, ProveedorToasts } from '@gestion/ui';
import { money, peso, type Categoria, type Pieza, type Producto } from '@gestion/core';
import { Productos } from './Productos';
import { StockLayout } from '../componentes/stock/StockLayout';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  addDoc: vi.fn(),
}));

// `productoConverter`/`piezaConverter`/`categoriaConverter` se dejan pasar
// tal cual (identidad, no se ejercitan acá): lo que importa es qué objeto de
// dominio recibe `addDoc`. `useCollection` se mockea entero: la pantalla
// arma las queries con las funciones REALES de 'firebase/firestore'
// (collection/query/orderBy/where, sin I/O), pero los datos que "llegan" los
// controla el mock, no una suscripción real. Solo `addDoc` (la única
// operación con I/O real, ya que la EDICIÓN desapareció del listado, UI-5) se
// mockea, mismo patrón que la ex Productos.test.tsx.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
  };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    addDoc: mocks.addDoc,
  };
});

interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoProductos: EstadoColeccionFalso<Producto> = { datos: [], cargando: false, error: null };
let estadoPiezas: EstadoColeccionFalso<Pieza> = { datos: [], cargando: false, error: null };
let estadoCategorias: EstadoColeccionFalso<Categoria> = { datos: [], cargando: false, error: null };

/**
 * `Productos.tsx` suscribe TRES colecciones (`productos`, `piezas`,
 * `categorias`) con el mismo `useCollection` mockeado entero: hace falta
 * enrutar cada llamada al estado falso que corresponda. Se distingue mirando
 * `_query.path` — un campo del SDK modular de Firestore sin tipo público,
 * pero la query SÍ se arma con `collection`/`query`/`orderBy`/`where` reales
 * (ver comentario de arriba), así que es la única señal disponible sin
 * fingir todo el módulo `firebase/firestore` — mismo criterio que la ex
 * Productos.test.tsx.
 */
function nombreColeccion(query: unknown): string | undefined {
  const interna = (query as { _query?: { path?: { segments?: string[] } } })._query;
  return interna?.path?.segments?.[0];
}

mocks.useCollection.mockImplementation((query: unknown) => {
  const nombre = nombreColeccion(query);
  if (nombre === 'categorias') return estadoCategorias;
  if (nombre === 'piezas') return estadoPiezas;
  return estadoProductos;
});

function authPorDefecto() {
  return {
    usuario: { uid: 'u1' },
    perfil: {
      uid: 'u1',
      nombre: 'Ana Pérez',
      email: 'ana@quesarte.com',
      rol: 'admin' as 'admin' | 'vendedor',
      activo: true,
    },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn(),
  };
}

function configurarAuth(overrides: Partial<ReturnType<typeof authPorDefecto>> = {}) {
  mocks.useAuth.mockReturnValue({ ...authPorDefecto(), ...overrides });
}

function configurarProductos(overrides: { datos?: Producto[]; cargando?: boolean; error?: unknown }) {
  estadoProductos = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function configurarPiezas(overrides: { datos?: Pieza[]; cargando?: boolean; error?: unknown } = {}) {
  estadoPiezas = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function configurarCategorias(overrides: { datos?: Categoria[]; cargando?: boolean; error?: unknown } = {}) {
  estadoCategorias = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function producto(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'Categoría',
    modoPrecio: 'por_kg',
    precioVentaCents: money(89900),
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

/** Expone el header contextual actual, para aserirlo sin montar `Shell`
 * completo (mismo criterio que el resto de las pantallas de Stock). */
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

/** Placeholder de la ruta de detalle: solo confirma a qué `id` navegó. */
function PlaceholderDetalle() {
  const { id } = useParams<{ id: string }>();
  return <div>Detalle de {id}</div>;
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/stock']}>
      <ProveedorTema>
        <ProveedorToasts>
          <ProveedorHeader>
            <VisorHeader />
            <Routes>
              <Route element={<StockLayout />}>
                <Route path="/stock" element={<Productos />} />
              </Route>
              <Route path="/stock/producto/:id" element={<PlaceholderDetalle />} />
            </Routes>
          </ProveedorHeader>
        </ProveedorToasts>
      </ProveedorTema>
    </MemoryRouter>,
  );
}

function abrirPanelFiltros() {
  fireEvent.click(screen.getByRole('button', { name: 'Filtros' }));
}

function alternarChipInactivos() {
  fireEvent.click(screen.getByRole('button', { name: 'Inactivos' }));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useOnlineStatus.mockReturnValue(true);
  estadoProductos = { datos: [], cargando: false, error: null };
  estadoPiezas = { datos: [], cargando: false, error: null };
  estadoCategorias = { datos: [], cargando: false, error: null };
});

describe('Productos - header contextual', () => {
  it('título "Productos", sin volverA (es sección raíz, docs/06 §2) y sin acciones de navegación', () => {
    configurarAuth();
    configurarProductos({ datos: [] });

    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Productos');
    expect(screen.getByTestId('volver-header').textContent).toBe('');
  });

  it('admin: la acción del header es "Agregar producto"', () => {
    configurarAuth();
    // Lista NO vacía: el estado vacío absoluto también ofrece un botón
    // "Agregar producto" propio (ver más abajo) — con datos, el único match
    // es el del header (`getByRole`, no `getAllByRole`, discrimina eso).
    configurarProductos({ datos: [producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel' })] });

    renderizar();

    expect(screen.getByRole('button', { name: 'Agregar producto' })).toBeTruthy();
  });

  it('vendedor: el header no expone acciones', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'vendedor' } });
    configurarProductos({ datos: [] });

    renderizar();

    expect(screen.queryByRole('button', { name: 'Agregar producto' })).toBeNull();
  });
});

describe('Productos - estados', () => {
  it('cargando: muestra el mensaje de carga', () => {
    configurarAuth();
    configurarProductos({ datos: [], cargando: true });

    renderizar();

    expect(screen.getByText('Cargando productos…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
    configurarAuth();
    configurarProductos({ datos: [], error: new Error('boom') });

    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar los productos.');
    const boton = screen.getByRole('button', { name: 'Reintentar' });
    expect(() => fireEvent.click(boton)).not.toThrow();
  });

  it('vacío absoluto: mensaje y botón de alta para admin', () => {
    configurarAuth();
    configurarProductos({ datos: [] });

    renderizar();

    expect(screen.getByText('No hay productos todavía.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Agregar producto' }).length).toBeGreaterThan(0);
  });

  it('vacío absoluto: vendedor no ve botón de alta', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'vendedor' } });
    configurarProductos({ datos: [] });

    renderizar();

    expect(screen.getByText('No hay productos todavía.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Agregar producto' })).toBeNull();
  });

  it('reintentar cambia la identidad de la query de productos (fuerza resuscripción)', () => {
    configurarAuth();
    configurarProductos({ datos: [], error: new Error('boom') });

    renderizar();
    const llamadasAntes = mocks.useCollection.mock.calls.filter(
      (llamada) => nombreColeccion(llamada[0]) === undefined || nombreColeccion(llamada[0]) === 'productos',
    );
    const queryAntes = llamadasAntes[llamadasAntes.length - 1]![0];

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    const llamadasDespues = mocks.useCollection.mock.calls.filter(
      (llamada) => nombreColeccion(llamada[0]) === undefined || nombreColeccion(llamada[0]) === 'productos',
    );
    const queryDespues = llamadasDespues[llamadasDespues.length - 1]![0];
    expect(queryDespues).not.toBe(queryAntes);
  });
});

describe('Productos - SelectorSeccion', () => {
  it('admin: ve Productos, Compras, Proveedores y Precios, con "Productos" activo', () => {
    configurarAuth();
    configurarProductos({ datos: [] });

    renderizar();

    const nav = screen.getByRole('navigation', { name: 'Secciones de Stock' });
    expect(nav).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Compras' }).getAttribute('href')).toBe('/stock/compras');
    expect(screen.getByRole('link', { name: 'Productos' }).getAttribute('aria-current')).toBe('page');
  });

  it('vendedor: sin vecinas, el SelectorSeccion no se renderiza (UI-5)', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'vendedor' } });
    configurarProductos({ datos: [] });

    renderizar();

    expect(screen.queryByRole('navigation', { name: 'Secciones de Stock' })).toBeNull();
  });
});

describe('Productos - resumen de stock por piezas (heredado de la ex Stock.tsx)', () => {
  it('fraccionado_por_pieza: muestra cantidad de piezas y peso total, agrupando por producto', () => {
    configurarAuth();
    configurarProductos({
      datos: [producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' })],
    });
    configurarPiezas({
      datos: [
        pieza({ id: 'a', productoId: 'p1', pesoRestanteGramos: peso(1500) }),
        pieza({ id: 'b', productoId: 'p1', pesoRestanteGramos: peso(2500) }),
      ],
    });

    renderizar();

    expect(screen.getByText('2 piezas · 4 kg')).toBeTruthy();
  });

  it('con una pieza vencida: la franja de alertas muestra "1 por vencer" y la fila lleva el badge "Vencida"', () => {
    configurarAuth();
    const ahora = new Date();
    const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1);
    configurarProductos({
      datos: [producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'fraccionado_por_pieza' })],
    });
    configurarPiezas({ datos: [pieza({ id: 'a', productoId: 'p1', fechaVencimiento: ayer })] });

    renderizar();

    expect(screen.getByRole('button', { name: '1 por vencer' })).toBeTruthy();
    expect(screen.getByText('Vencida')).toBeTruthy();
  });
});

describe('Productos - lista maestra: solo activos por defecto', () => {
  it('un producto inactivo NO aparece en la lista por defecto', () => {
    configurarAuth();
    configurarProductos({
      datos: [
        producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel', stockGranelGramos: peso(1000) }),
        producto({
          id: 'p2',
          nombre: 'Miel vieja',
          modoStock: 'unidad_simple',
          stockUnidades: 3,
          activo: false,
        }),
      ],
    });

    renderizar();

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByText('Miel vieja')).toBeNull();
  });

  it('tocar una fila navega a /stock/producto/:id, también para un producto inactivo (con el chip Inactivos activo)', () => {
    configurarAuth();
    configurarProductos({
      datos: [producto({ id: 'p9', nombre: 'Salame viejo', modoStock: 'granel', activo: false })],
    });

    renderizar();
    abrirPanelFiltros();
    alternarChipInactivos();
    fireEvent.click(screen.getByRole('button', { name: /Salame viejo/ }));

    expect(screen.getByText('Detalle de p9')).toBeTruthy();
  });

  it('con categorías definidas: agrupa por categoría (encabezados h2 en el orden de `orden`)', () => {
    configurarAuth();
    configurarCategorias({
      datos: [
        categoriaDe({ id: 'c1', nombre: 'Quesos', orden: 0 }),
        categoriaDe({ id: 'c2', nombre: 'Miel', orden: 1 }),
      ],
    });
    configurarProductos({
      datos: [
        producto({ id: 'p1', nombre: 'Miel 500g', categoria: 'Miel', modoStock: 'unidad_simple', stockUnidades: 3 }),
        producto({ id: 'p2', nombre: 'Queso Colonia', categoria: 'Quesos', modoStock: 'granel', stockGranelGramos: peso(1000) }),
      ],
    });

    renderizar();

    const encabezados = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(encabezados).toEqual(['Quesos', 'Miel']);
  });
});

describe('Productos - filtros extra (WA-H3): chip "Inactivos"', () => {
  it('el botón de filtros extra no existe para vendedor', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'vendedor' } });
    configurarProductos({
      datos: [producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel' })],
    });

    renderizar();

    expect(screen.queryByRole('button', { name: 'Filtros' })).toBeNull();
  });

  it('admin: el botón de filtros extra abre un panel con el chip "Inactivos"', () => {
    configurarAuth();
    configurarProductos({
      datos: [producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel' })],
    });

    renderizar();

    const boton = screen.getByRole('button', { name: 'Filtros' });
    expect(boton.getAttribute('aria-expanded')).toBe('false');

    abrirPanelFiltros();

    expect(boton.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Inactivos' })).toBeTruthy();
  });

  it('activar el chip "Inactivos" suma los productos inactivos, atenuados y con badge "Inactivo"', () => {
    configurarAuth();
    configurarProductos({
      datos: [
        producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel', stockGranelGramos: peso(1000) }),
        producto({ id: 'p2', nombre: 'Miel vieja', modoStock: 'unidad_simple', stockUnidades: 2, activo: false }),
      ],
    });

    renderizar();
    abrirPanelFiltros();
    alternarChipInactivos();

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Miel vieja')).toBeTruthy();
    expect(screen.getByText('Inactivo')).toBeTruthy();

    const filaInactiva = screen.getByRole('button', { name: /Miel vieja/ });
    expect(filaInactiva.className).toContain('opacity-60');
    const filaActiva = screen.getByRole('button', { name: /Queso Colonia/ });
    expect(filaActiva.className).not.toContain('opacity-60');
  });

  it('el chip "Inactivos" NO reemplaza a los activos: ambos conviven en la lista', () => {
    configurarAuth();
    configurarProductos({
      datos: [
        producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel' }),
        producto({ id: 'p2', nombre: 'Miel vieja', modoStock: 'granel', activo: false }),
      ],
    });

    renderizar();
    abrirPanelFiltros();
    alternarChipInactivos();

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.getByText('Miel vieja')).toBeTruthy();

    // Volver a tocar el chip lo desactiva: vuelve a mostrar solo activos.
    alternarChipInactivos();

    expect(screen.getByText('Queso Colonia')).toBeTruthy();
    expect(screen.queryByText('Miel vieja')).toBeNull();
  });

  it('el ícono de filtros muestra un indicador cuando el chip está activo y el panel plegado', () => {
    configurarAuth();
    configurarProductos({
      datos: [producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel', activo: false })],
    });

    renderizar();
    const boton = screen.getByRole('button', { name: 'Filtros' });
    expect(boton.querySelector('[aria-hidden="true"].bg-primary-600')).toBeNull();

    abrirPanelFiltros();
    alternarChipInactivos();
    // Con el panel abierto, el propio chip "activo" ya comunica el estado —
    // el indicador solo aparece con el panel plegado (docs/06-ui-ux.md §3).
    expect(boton.querySelector('[aria-hidden="true"].bg-primary-600')).toBeNull();

    abrirPanelFiltros(); // pliega el panel de nuevo
    expect(boton.querySelector('[aria-hidden="true"].bg-primary-600')).toBeTruthy();
  });
});

describe('Productos - búsqueda + categoría + alerta (AND)', () => {
  it('la búsqueda filtra por nombre o categoría, acento-insensible', () => {
    configurarAuth();
    configurarProductos({
      datos: [
        producto({ id: 'p1', nombre: 'Queso Añejo', categoria: 'Quesos', modoStock: 'granel' }),
        producto({ id: 'p2', nombre: 'Miel 500g', categoria: 'Miel', modoStock: 'unidad_simple', stockUnidades: 3 }),
      ],
    });

    renderizar();
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'anejo' } });

    expect(screen.getByText('Queso Añejo')).toBeTruthy();
    expect(screen.queryByText('Miel 500g')).toBeNull();
  });

  it('categoría + alerta componen como AND: solo queda el producto que cumple ambos', () => {
    configurarAuth();
    configurarCategorias({
      datos: [
        categoriaDe({ id: 'c1', nombre: 'Quesos', orden: 0 }),
        categoriaDe({ id: 'c2', nombre: 'Miel', orden: 1 }),
      ],
    });
    configurarProductos({
      datos: [
        producto({
          id: 'p1',
          nombre: 'Queso bajo',
          categoria: 'Quesos',
          modoStock: 'granel',
          stockGranelGramos: peso(50),
          umbralAlertaStock: 500,
        }),
        producto({
          id: 'p2',
          nombre: 'Queso alto',
          categoria: 'Quesos',
          modoStock: 'granel',
          stockGranelGramos: peso(5000),
        }),
        producto({
          id: 'p3',
          nombre: 'Miel bajo',
          categoria: 'Miel',
          modoStock: 'unidad_simple',
          stockUnidades: 1,
          umbralAlertaStock: 5,
        }),
      ],
    });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));
    fireEvent.click(screen.getByRole('button', { name: /stock bajo/ }));

    expect(screen.getByText('Queso bajo')).toBeTruthy();
    expect(screen.queryByText('Queso alto')).toBeNull();
    expect(screen.queryByText('Miel bajo')).toBeNull();
  });

  it('sin resultados de búsqueda: mensaje con el término', () => {
    configurarAuth();
    configurarProductos({
      datos: [producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel' })],
    });

    renderizar();
    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'inexistente' } });

    expect(screen.getByText('No se encontraron productos para "inexistente".')).toBeTruthy();
  });
});

describe('Productos - alertas SIEMPRE sobre activos (contrato, docs/06-ui-ux.md §2/§3)', () => {
  it('el conteo de la franja no cambia al activar el chip "Inactivos"', () => {
    configurarAuth();
    configurarProductos({
      datos: [
        producto({
          id: 'p1',
          nombre: 'Queso bajo activo',
          modoStock: 'granel',
          stockGranelGramos: peso(50),
          umbralAlertaStock: 500,
        }),
        // Inactivo pero numéricamente también bajo: NUNCA debe sumar al conteo.
        producto({
          id: 'p2',
          nombre: 'Queso bajo inactivo',
          modoStock: 'granel',
          stockGranelGramos: peso(50),
          umbralAlertaStock: 500,
          activo: false,
        }),
      ],
    });

    renderizar();

    expect(screen.getByRole('button', { name: '1 stock bajo' })).toBeTruthy();

    abrirPanelFiltros();
    alternarChipInactivos();

    expect(screen.getByRole('button', { name: '1 stock bajo' })).toBeTruthy();
  });

  it('un producto inactivo nunca aparece bajo un filtro de alerta, aunque el chip "Inactivos" esté activo', () => {
    configurarAuth();
    configurarProductos({
      datos: [
        producto({
          id: 'p1',
          nombre: 'Queso bajo activo',
          modoStock: 'granel',
          stockGranelGramos: peso(50),
          umbralAlertaStock: 500,
        }),
        producto({
          id: 'p2',
          nombre: 'Queso bajo inactivo',
          modoStock: 'granel',
          stockGranelGramos: peso(50),
          umbralAlertaStock: 500,
          activo: false,
        }),
      ],
    });

    renderizar();
    abrirPanelFiltros();
    alternarChipInactivos();
    expect(screen.getByText('Queso bajo inactivo')).toBeTruthy(); // sumado por el chip

    fireEvent.click(screen.getByRole('button', { name: /stock bajo/ }));

    expect(screen.getByText('Queso bajo activo')).toBeTruthy();
    expect(screen.queryByText('Queso bajo inactivo')).toBeNull();
  });
});

describe('Productos - alta (solo admin, patrón offline)', () => {
  it('vendedor no ve botón de alta', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'vendedor' } });
    configurarProductos({ datos: [producto({ id: 'p1', nombre: 'Queso Colonia', modoStock: 'granel' })] });

    renderizar();

    expect(screen.queryByRole('button', { name: 'Agregar producto' })).toBeNull();
  });

  it('alta: valida requeridos y no llama a addDoc', () => {
    configurarAuth();
    configurarProductos({ datos: [] });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('Ingresá el nombre del producto.')).toBeTruthy();
    expect(screen.getByText('Ingresá la categoría.')).toBeTruthy();
    expect(screen.getByText('Ingresá el precio de venta.')).toBeTruthy();
    expect(mocks.addDoc).not.toHaveBeenCalled();
  });

  it('alta de un producto granel crea con stockGranelGramos: 0, activo: true y costoPromedioCents: 0', async () => {
    configurarAuth();
    configurarProductos({ datos: [] });
    configurarCategorias({ datos: [categoriaDe({ id: 'c1', nombre: 'Frutos secos', orden: 0 })] });
    mocks.addDoc.mockResolvedValue({ id: 'nuevo' });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuez mariposa' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Frutos secos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Granel' }));
    fireEvent.change(screen.getByLabelText('Precio por kg'), { target: { value: '450,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.addDoc).toHaveBeenCalledTimes(1));
    const [, documento] = mocks.addDoc.mock.calls[0] as [unknown, Producto];
    expect(documento.nombre).toBe('Nuez mariposa');
    expect(documento.modoStock).toBe('granel');
    expect(documento.stockGranelGramos).toBe(peso(0));
    expect(documento.costoPromedioCents).toBe(money(0));
    expect(documento.activo).toBe(true);
  });

  it('muestra un toast de éxito y cierra el modal al crear correctamente', async () => {
    configurarAuth();
    configurarProductos({ datos: [] });
    configurarCategorias({ datos: [categoriaDe({ id: 'c1', nombre: 'Frutos secos', orden: 0 })] });
    mocks.addDoc.mockResolvedValue({ id: 'nuevo' });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuez mariposa' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Frutos secos' } });
    fireEvent.change(screen.getByLabelText('Precio por kg'), { target: { value: '450,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      const dialog = document.querySelector('dialog');
      expect(dialog?.open).toBe(false);
    });
    expect(await screen.findByText('Producto creado.')).toBeTruthy();
  });

  it('muestra un toast de error si addDoc falla', async () => {
    configurarAuth();
    configurarProductos({ datos: [] });
    configurarCategorias({ datos: [categoriaDe({ id: 'c1', nombre: 'Frutos secos', orden: 0 })] });
    mocks.addDoc.mockRejectedValue(new Error('offline'));

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuez mariposa' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Frutos secos' } });
    fireEvent.change(screen.getByLabelText('Precio por kg'), { target: { value: '450,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('No se pudo crear el producto. Intentá de nuevo.')).toBeTruthy();
  });

  it('sin conexión: guarda sin esperar el ack del servidor, cierra el modal al instante y avisa que falta sincronizar', async () => {
    configurarAuth();
    configurarProductos({ datos: [] });
    configurarCategorias({ datos: [categoriaDe({ id: 'c1', nombre: 'Frutos secos', orden: 0 })] });
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.addDoc.mockResolvedValue({ id: 'nuevo' });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuez mariposa' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Frutos secos' } });
    fireEvent.change(screen.getByLabelText('Precio por kg'), { target: { value: '450,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    // El cierre es sincrónico: no espera la resolución de `addDoc` (offline,
    // esa promesa no resolvería hasta reconectar) — se verifica ANTES de
    // cualquier `await` de este test, en el mismo tick del click.
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    expect(mocks.addDoc).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
  });

  it('con conexión: sigue esperando el ack del servidor antes de cerrar y mostrar el toast de éxito (regresión)', async () => {
    configurarAuth();
    configurarProductos({ datos: [] });
    configurarCategorias({ datos: [categoriaDe({ id: 'c1', nombre: 'Frutos secos', orden: 0 })] });
    mocks.useOnlineStatus.mockReturnValue(true);
    mocks.addDoc.mockResolvedValue({ id: 'nuevo' });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuez mariposa' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Frutos secos' } });
    fireEvent.change(screen.getByLabelText('Precio por kg'), { target: { value: '450,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    // A diferencia del caso offline: justo después del click el modal
    // TODAVÍA está abierto (esperando el `await` de `addDoc`).
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);

    await waitFor(() => expect(dialog.open).toBe(false));
    expect(await screen.findByText('Producto creado.')).toBeTruthy();
  });
});
