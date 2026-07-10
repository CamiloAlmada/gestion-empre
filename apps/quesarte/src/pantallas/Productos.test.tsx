import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ProveedorTema, ProveedorToasts } from '@gestion/ui';
import { money, peso, type Categoria, type Producto } from '@gestion/core';
import { Productos } from './Productos';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

// `DataTable` con `filaCompacta` (docs/06-ui-ux.md §3) renderiza SIEMPRE la
// tabla completa Y la lista compacta a la vez — la visibilidad la decide CSS
// responsive que jsdom no evalúa (ver DataTable.tsx). Por eso el contenido
// de cada fila aparece dos veces en el DOM de test; las aserciones que solo
// verifican "el dato está en la pantalla" se scopean a la tabla (fuente de
// verdad de siempre) para no ambigüar con `getByText`/`getByRole`. La lista
// compacta se testea aparte, explícitamente, más abajo.
function tabla() {
  return within(screen.getByRole('table'));
}

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

// `productoConverter`/`categoriaConverter` se dejan pasar tal cual (identidad,
// no se ejercitan acá): lo que importa es qué objeto de dominio recibe
// `addDoc`/`updateDoc`. `useCollection` se mockea entero: la pantalla arma
// las queries con las funciones REALES de 'firebase/firestore'
// (collection/query/orderBy, sin I/O), pero los datos que "llegan" los
// controla el mock, no una suscripción real. Solo `addDoc`/`updateDoc` (las
// únicas operaciones con I/O real) se mockean, siguiendo el mismo patrón que
// packages/firebase-kit/src/ventas.test.ts.
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
    updateDoc: mocks.updateDoc,
  };
});

interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoProductos: EstadoColeccionFalso<Producto> = { datos: [], cargando: false, error: null };
let estadoCategorias: EstadoColeccionFalso<Categoria> = { datos: [], cargando: false, error: null };

/**
 * `Productos.tsx` ahora suscribe DOS colecciones (`productos` y
 * `categorias`, ver ModalCategorias) con el mismo `useCollection` mockeado
 * entero: hace falta enrutar cada llamada al estado falso que corresponda.
 * Se distingue mirando `_query.path` — un campo del SDK modular de Firestore
 * sin tipo público, pero la query SÍ se arma con `collection`/`query`/
 * `orderBy` reales (ver comentario de arriba), así que es la única señal
 * disponible sin fingir todo el módulo `firebase/firestore` (como hace
 * packages/firebase-kit/src/categorias.test.ts). Si una versión futura del
 * SDK cambia esta forma interna, este test falla con un mensaje claro en vez
 * de un falso verde.
 */
function nombreColeccion(query: unknown): string | undefined {
  const interna = (query as { _query?: { path?: { segments?: string[] } } })._query;
  return interna?.path?.segments?.[0];
}

mocks.useCollection.mockImplementation((query: unknown) =>
  nombreColeccion(query) === 'categorias' ? estadoCategorias : estadoProductos,
);

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

function configurarCollection(overrides: { datos?: Producto[]; cargando?: boolean; error?: unknown }) {
  estadoProductos = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

/** Default: sin categorías definidas (la mayoría de los tests de esta suite
 * no ejercitan el select de categoría ni `ModalCategorias`). */
function configurarCategorias(overrides: { datos?: Categoria[]; cargando?: boolean; error?: unknown } = {}) {
  estadoCategorias = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function productoDe(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock'>): Producto {
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

function categoriaDe(over: Partial<Categoria> & Pick<Categoria, 'id'>): Categoria {
  return { nombre: 'Categoría', orden: 0, ...over };
}

const categoriasFalsas: Categoria[] = [
  categoriaDe({ id: 'c1', nombre: 'Quesos', orden: 0 }),
  categoriaDe({ id: 'c2', nombre: 'Miel', orden: 1 }),
  categoriaDe({ id: 'c3', nombre: 'Frutos secos', orden: 2 }),
  categoriaDe({ id: 'c4', nombre: 'Embutidos', orden: 3 }),
];

const productosFalsos: Producto[] = [
  productoDe({
    id: 'p1',
    nombre: 'Queso Añejo',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    modoStock: 'fraccionado_por_pieza',
    precioVentaCents: money(89900),
  }),
  productoDe({
    id: 'p2',
    nombre: 'Miel 500g',
    categoria: 'Miel',
    modoPrecio: 'por_unidad',
    modoStock: 'unidad_simple',
    precioVentaCents: money(45000),
    stockUnidades: 10,
    activo: false,
  }),
];

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

function renderizar() {
  return render(
    <MemoryRouter>
      <ProveedorTema>
        <ProveedorToasts>
          <ProveedorHeader>
            <VisorHeader />
            <Productos />
          </ProveedorHeader>
        </ProveedorToasts>
      </ProveedorTema>
    </MemoryRouter>,
  );
}

describe('Productos', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    // `clearAllMocks` limpia llamadas/resultados pero NO un `mockReturnValue`
    // ya fijado: sin esto, un test que pone useOnlineStatus en `false`
    // (offline) dejaría ese valor filtrado a los tests siguientes. Restaura
    // el default (online) del `vi.hoisted` de arriba.
    mocks.useOnlineStatus.mockReturnValue(true);
    // `estadoProductos`/`estadoCategorias` son variables planas, no estado
    // de un mock: `clearAllMocks` no las toca. Sin este reset, la última
    // configuración de un test (p. ej. categorías cargadas) se filtraría al
    // siguiente que no llama a `configurarCategorias`.
    estadoProductos = { datos: [], cargando: false, error: null };
    estadoCategorias = { datos: [], cargando: false, error: null };
  });

  it('header contextual: título "Catálogo" (coincide con el ítem del SelectorSeccion) y sin volverA (docs/06 §2)', () => {
    configurarAuth();
    configurarCollection({ datos: [] });

    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Catálogo');
    expect(screen.getByTestId('volver-header').textContent).toBe('');
  });

  it('muestra el SelectorSeccion con "Catálogo" activo', () => {
    configurarAuth();
    configurarCollection({ datos: [] });

    renderizar();

    expect(screen.getByRole('navigation', { name: 'Secciones de Stock' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Stock' }).getAttribute('href')).toBe('/stock');
    expect(screen.getByRole('link', { name: 'Proveedores' }).getAttribute('href')).toBe('/stock/proveedores');
  });

  it('vendedor: el SelectorSeccion no muestra "Proveedores"', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'vendedor' } });
    configurarCollection({ datos: [] });

    renderizar();

    expect(screen.queryByRole('link', { name: 'Proveedores' })).toBeNull();
  });

  it('admin: el header contextual expone las acciones "Agregar" y "Categorías"', () => {
    configurarAuth();
    configurarCollection({ datos: productosFalsos });

    renderizar();

    expect(screen.getByRole('button', { name: 'Agregar producto' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Categorías' })).toBeTruthy();
  });

  it('vendedor: el header contextual no expone acciones', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'vendedor' } });
    configurarCollection({ datos: productosFalsos });

    renderizar();

    expect(screen.queryByRole('button', { name: 'Agregar producto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Categorías' })).toBeNull();
  });

  it('renderiza los productos del listado con modo, precio y estado', () => {
    configurarAuth();
    configurarCollection({ datos: productosFalsos });

    renderizar();

    expect(tabla().getByText('Queso Añejo')).toBeTruthy();
    expect(tabla().getByText('Quesos')).toBeTruthy();
    expect(tabla().getByText('Por kg · Fraccionado por pieza')).toBeTruthy();
    expect(tabla().getByText('$ 899,00 /kg')).toBeTruthy();
    expect(tabla().getByText('Activo')).toBeTruthy();

    expect(tabla().getByText('Miel 500g')).toBeTruthy();
    expect(tabla().getByText('Por unidad · Unidad simple')).toBeTruthy();
    expect(tabla().getByText('$ 450,00 /u')).toBeTruthy();
    expect(tabla().getByText('Inactivo')).toBeTruthy();
  });

  it('la búsqueda filtra por nombre o categoría ignorando acentos', () => {
    configurarAuth();
    configurarCollection({ datos: productosFalsos });

    renderizar();

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'anejo' } });

    expect(tabla().getByText('Queso Añejo')).toBeTruthy();
    expect(tabla().queryByText('Miel 500g')).toBeNull();
  });

  it('la búsqueda por categoría también filtra', () => {
    configurarAuth();
    configurarCollection({ datos: productosFalsos });

    renderizar();

    fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'miel' } });

    expect(tabla().getByText('Miel 500g')).toBeTruthy();
    expect(tabla().queryByText('Queso Añejo')).toBeNull();
  });

  it('estado cargando', () => {
    configurarAuth();
    configurarCollection({ cargando: true });

    renderizar();

    expect(screen.getByText('Cargando productos…')).toBeTruthy();
  });

  it('estado error muestra mensaje y botón de reintento', () => {
    configurarAuth();
    configurarCollection({ error: new Error('boom') });

    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar los productos.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('estado vacío ofrece alta a un admin', () => {
    configurarAuth();
    configurarCollection({ datos: [] });

    renderizar();

    expect(screen.getByText('No hay productos todavía.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Agregar producto' }).length).toBeGreaterThan(0);
  });

  it('banner de offline explica que no se pueden gestionar categorías', () => {
    configurarAuth();
    mocks.useOnlineStatus.mockReturnValue(false);
    configurarCollection({ datos: productosFalsos });

    renderizar();

    expect(screen.getByRole('status').textContent).toContain(
      'no se pueden gestionar categorías hasta reconectar',
    );
  });

  it('vendedor no ve botones de alta ni edición', () => {
    configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'vendedor' } });
    configurarCollection({ datos: productosFalsos });

    renderizar();

    expect(screen.queryByRole('button', { name: 'Agregar producto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    // la fila compacta de un vendedor tampoco es tappable (sin edición, ver
    // `filaCompactaProducto` en Productos.tsx: sin permiso, es un <div>, no
    // hay botón "Editar {nombre}").
    expect(screen.queryByRole('button', { name: /^Editar / })).toBeNull();
    // el catálogo sigue siendo visible
    expect(tabla().getByText('Queso Añejo')).toBeTruthy();
  });

  it('alta: valida requeridos y no llama a addDoc', () => {
    configurarAuth();
    configurarCollection({ datos: [] });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('Ingresá el nombre del producto.')).toBeTruthy();
    expect(screen.getByText('Ingresá la categoría.')).toBeTruthy();
    expect(screen.getByText('Ingresá el precio de venta.')).toBeTruthy();
    expect(mocks.addDoc).not.toHaveBeenCalled();
  });

  describe('select de categoría (ModalProducto)', () => {
    it('muestra las opciones ordenadas (orden de `categorias`, que ya llega ordenada por `orden`)', () => {
      configurarAuth();
      configurarCollection({ datos: [] });
      configurarCategorias({ datos: categoriasFalsas });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);

      const select = screen.getByLabelText('Categoría') as HTMLSelectElement;
      // La primera opción es el placeholder deshabilitado ("Elegí una
      // categoría"): las siguientes reflejan el orden de `categoriasFalsas`.
      const etiquetas = Array.from(select.options).map((o) => o.text);
      expect(etiquetas.slice(1)).toEqual(['Quesos', 'Miel', 'Frutos secos', 'Embutidos']);
    });

    it('una categoría no definida en el vocabulario se agrega como opción extra "(sin definir)"', () => {
      configurarAuth();
      const productoHuerfano = productoDe({
        id: 'p9',
        nombre: 'Producto viejo',
        categoria: 'Legumbres',
        modoStock: 'granel',
        stockGranelGramos: peso(1000),
      });
      configurarCollection({ datos: [productoHuerfano] });
      configurarCategorias({ datos: categoriasFalsas });

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

      const select = screen.getByLabelText('Categoría') as HTMLSelectElement;
      expect(select.value).toBe('Legumbres');
      expect(screen.getByRole('option', { name: 'Legumbres (sin definir)' })).toBeTruthy();
    });

    it('sin categorías definidas: el select se deshabilita y muestra el hint para ir a definirlas', () => {
      configurarAuth();
      configurarCollection({ datos: [] });
      configurarCategorias({ datos: [] });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);

      const select = screen.getByLabelText('Categoría') as HTMLSelectElement;
      expect(select.disabled).toBe(true);
      expect(screen.getByText('Definí categorías desde Productos → Categorías.')).toBeTruthy();
    });

    it('la validación "categoría obligatoria" se mantiene con el select', () => {
      configurarAuth();
      configurarCollection({ datos: [] });
      configurarCategorias({ datos: categoriasFalsas });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(screen.getByText('Ingresá la categoría.')).toBeTruthy();
      expect(mocks.addDoc).not.toHaveBeenCalled();
    });
  });

  it('alta de un producto granel crea con stockGranelGramos: 0 y sin stockUnidades', async () => {
    configurarAuth();
    configurarCollection({ datos: [] });
    configurarCategorias({ datos: categoriasFalsas });
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
    expect(documento.stockUnidades).toBeUndefined();
    expect(documento.costoPromedioCents).toBe(money(0));
    expect(documento.activo).toBe(true);
  });

  it('alta de un producto unidad_simple crea con stockUnidades: 0 y sin stockGranelGramos', async () => {
    configurarAuth();
    configurarCollection({ datos: [] });
    configurarCategorias({ datos: categoriasFalsas });
    mocks.addDoc.mockResolvedValue({ id: 'nuevo' });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Miel 1kg' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Miel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Por unidad' }));
    fireEvent.click(screen.getByRole('button', { name: 'Unidad simple' }));
    fireEvent.change(screen.getByLabelText('Precio por unidad'), { target: { value: '600,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.addDoc).toHaveBeenCalledTimes(1));
    const [, documento] = mocks.addDoc.mock.calls[0] as [unknown, Producto];
    expect(documento.modoStock).toBe('unidad_simple');
    expect(documento.stockUnidades).toBe(0);
    expect(documento.stockGranelGramos).toBeUndefined();
  });

  it('alta de un producto pieza_entera no incluye stockGranelGramos ni stockUnidades', async () => {
    configurarAuth();
    configurarCollection({ datos: [] });
    configurarCategorias({ datos: categoriasFalsas });
    mocks.addDoc.mockResolvedValue({ id: 'nuevo' });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Salame tandilero' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Embutidos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pieza entera' }));
    fireEvent.change(screen.getByLabelText('Precio por kg'), { target: { value: '1200,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.addDoc).toHaveBeenCalledTimes(1));
    const [, documento] = mocks.addDoc.mock.calls[0] as [unknown, Producto];
    expect(documento.modoStock).toBe('pieza_entera');
    expect(documento.stockGranelGramos).toBeUndefined();
    expect(documento.stockUnidades).toBeUndefined();
  });

  it('edición: modoPrecio/modoStock se muestran fijos (no hay grupo de opciones) con nota', () => {
    configurarAuth();
    configurarCollection({ datos: productosFalsos });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);

    expect(screen.getByText('No se puede cambiar después del alta.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Granel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Fraccionado por pieza' })).toBeNull();
  });

  it('edición: guarda un update parcial sin modoPrecio/modoStock', async () => {
    configurarAuth();
    configurarCollection({ datos: productosFalsos });
    mocks.updateDoc.mockResolvedValue(undefined);

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Queso Añejo Premium' } });
    fireEvent.click(screen.getByRole('button', { name: 'Inactivo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledTimes(1));
    const [, cambios] = mocks.updateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(cambios.nombre).toBe('Queso Añejo Premium');
    expect(cambios.activo).toBe(false);
    expect(cambios).not.toHaveProperty('modoPrecio');
    expect(cambios).not.toHaveProperty('modoStock');
  });

  it('muestra un toast de éxito y cierra el modal al crear correctamente', async () => {
    configurarAuth();
    configurarCollection({ datos: [] });
    configurarCategorias({ datos: categoriasFalsas });
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
    configurarCollection({ datos: [] });
    configurarCategorias({ datos: categoriasFalsas });
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
    configurarCollection({ datos: [] });
    configurarCategorias({ datos: categoriasFalsas });
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.addDoc.mockResolvedValue({ id: 'nuevo' });

    renderizar();

    fireEvent.click(screen.getAllByRole('button', { name: 'Agregar producto' })[0]!);
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuez mariposa' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Frutos secos' } });
    fireEvent.change(screen.getByLabelText('Precio por kg'), { target: { value: '450,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    // El cierre es sincrónico: no espera la resolución de `addDoc` (offline,
    // esa promesa no resolvería hasta reconectar). Se verifica ANTES de
    // cualquier `await` de este test, en el mismo tick del click — a
    // diferencia del caso "con conexión" de abajo, donde el modal sigue
    // abierto en este punto.
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    expect(mocks.addDoc).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.'),
    ).toBeTruthy();
  });

  it('con conexión: sigue esperando el ack del servidor antes de cerrar y mostrar el toast de éxito (regresión)', async () => {
    configurarAuth();
    configurarCollection({ datos: [] });
    configurarCategorias({ datos: categoriasFalsas });
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

  it('reintentar en el estado de error cambia la identidad de la query (fuerza resuscripción)', () => {
    configurarAuth();
    configurarCollection({ error: new Error('boom') });

    renderizar();
    // `useCollection` ahora se llama dos veces por render (productos y
    // categorías, ver ModalCategorias): se filtra por la de 'productos' —
    // "Reintentar" en este error solo cambia `intentoId`, no
    // `intentoIdCategorias`.
    const llamadasProductosAntes = mocks.useCollection.mock.calls.filter(
      (llamada) => nombreColeccion(llamada[0]) !== 'categorias',
    );
    const queryAntes = llamadasProductosAntes[llamadasProductosAntes.length - 1]![0];

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    const llamadasProductosDespues = mocks.useCollection.mock.calls.filter(
      (llamada) => nombreColeccion(llamada[0]) !== 'categorias',
    );
    const queryDespues = llamadasProductosDespues[llamadasProductosDespues.length - 1]![0];
    expect(queryDespues).not.toBe(queryAntes);
  });

  describe('fila compacta (mobile, docs/06-ui-ux.md §3)', () => {
    it('muestra nombre, categoría y precio de cada producto en la lista compacta', () => {
      configurarAuth();
      configurarCollection({ datos: productosFalsos });

      renderizar();

      const lista = within(screen.getByRole('list'));
      expect(lista.getByText('Queso Añejo')).toBeTruthy();
      expect(lista.getByText('Quesos')).toBeTruthy();
      expect(lista.getByText('$ 899,00 /kg')).toBeTruthy();
      expect(lista.getByText('Miel 500g')).toBeTruthy();
      expect(lista.getByText('$ 450,00 /u')).toBeTruthy();
    });

    it('admin: tocar la fila compacta abre la edición (mismo handler que "Editar")', () => {
      configurarAuth();
      configurarCollection({ datos: productosFalsos });

      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Editar Queso Añejo' }));

      expect(screen.getByText('No se puede cambiar después del alta.')).toBeTruthy();
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
    });

    it('vendedor: la fila compacta no es un botón (sin permiso de edición)', () => {
      configurarAuth({ perfil: { ...authPorDefecto().perfil, rol: 'vendedor' } });
      configurarCollection({ datos: productosFalsos });

      renderizar();

      expect(screen.queryByRole('button', { name: 'Editar Queso Añejo' })).toBeNull();
      const lista = within(screen.getByRole('list'));
      expect(lista.getByText('Queso Añejo')).toBeTruthy();
    });
  });
});
