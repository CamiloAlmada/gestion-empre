import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProveedorTema, ProveedorToasts } from '@gestion/ui';
import { money, type Categoria, type Producto } from '@gestion/core';
import { Categorias } from './Categorias';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  crearCategoria: vi.fn(),
  renombrarCategoria: vi.fn(),
  intercambiarOrdenCategorias: vi.fn(),
}));

// Mismo criterio que el extinto ModalCategorias.test.tsx: las clases de
// error (`CategoriaDuplicadaError`/`CategoriaInvalidaError`) pasan reales
// (se ejercita `instanceof` tal cual las usa el componente); solo se
// mockean los hooks y las funciones de escritura. A diferencia de la
// versión modal, esta pantalla arma sus propias suscripciones con
// `useCollection`, así que hace falta distinguirlas por colección (mismo
// truco que Productos.test.tsx/Precios.test.tsx). `useAuth` es mockeada
// para fijar un admin (UI-5c: esta pantalla es subvista de Ajustes, protegida
// por `RutaSoloAdmin` en App.tsx).
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
    crearCategoria: mocks.crearCategoria,
    renombrarCategoria: mocks.renombrarCategoria,
    intercambiarOrdenCategorias: mocks.intercambiarOrdenCategorias,
  };
});

// `db` NO se mockea (a diferencia de Stock/Compras/Proveedores.test.tsx):
// esta suite usa el patrón de Productos.test.tsx/Precios.test.tsx — `db` real
// (init con env vars falsas de `vitest.config.ts`) + `collection`/`query`/
// `orderBy` REALES de 'firebase/firestore', porque `nombreColeccion` de abajo
// lee la forma interna de una query real del SDK modular (`_query.path`).
// Mismo criterio que cuando era sección de Stock (UI-4): pantalla de Ajustes
// ahora (UI-5c), pero la lógica de Firestore no cambió.

mocks.useAuth.mockReturnValue({
  usuario: { uid: 'u1' },
  perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@a.com', rol: 'admin', activo: true },
  cargando: false,
  ingresarConEmail: vi.fn(),
  restablecerPassword: vi.fn(),
  salir: vi.fn(),
});

function categoriaDe(over: Partial<Categoria> & Pick<Categoria, 'id'>): Categoria {
  return { nombre: 'Cat', orden: 0, ...over };
}

function productoDe(over: Partial<Producto> & Pick<Producto, 'id'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'Categoría',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(89900),
    costoPromedioCents: money(50000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

const categoriasFalsas: Categoria[] = [
  categoriaDe({ id: 'c1', nombre: 'Quesos', orden: 0 }),
  categoriaDe({ id: 'c2', nombre: 'Miel', orden: 1 }),
  categoriaDe({ id: 'c3', nombre: 'Embutidos', orden: 2 }),
];

interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoCategorias: EstadoColeccionFalso<Categoria> = { datos: [], cargando: false, error: null };
let estadoProductos: EstadoColeccionFalso<Producto> = { datos: [], cargando: false, error: null };

/** Distingue las dos `useCollection` (categorías/productos) por el nombre de
 * colección de la query real, armada con `collection`/`query`/`orderBy`
 * reales (mismo truco que Productos.test.tsx/Precios.test.tsx). */
function nombreColeccion(query: unknown): string | undefined {
  const interna = (query as { _query?: { path?: { segments?: string[] } } })._query;
  return interna?.path?.segments?.[0];
}

mocks.useCollection.mockImplementation((query: unknown) =>
  nombreColeccion(query) === 'productos' ? estadoProductos : estadoCategorias,
);

function configurarCategorias(overrides: { datos?: Categoria[]; cargando?: boolean; error?: unknown } = {}) {
  estadoCategorias = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function configurarProductos(overrides: { datos?: Producto[] } = {}) {
  estadoProductos = { datos: overrides.datos ?? [], cargando: false, error: null };
}

/** Expone el header contextual actual, para aserirlo sin montar `Shell`
 * completo (mismo criterio que el resto de las pantallas de Stock). */
function VisorHeader() {
  const config = useHeaderActual();
  return (
    <div>
      <p data-testid="titulo-header">{config?.titulo}</p>
      <p data-testid="volver-header">{config?.volverA ? `${config.volverA.etiqueta}:${config.volverA.a}` : ''}</p>
    </div>
  );
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/ajustes/categorias']}>
      <ProveedorTema>
        <ProveedorToasts>
          <ProveedorHeader>
            <VisorHeader />
            <Routes>
              <Route path="/ajustes/categorias" element={<Categorias />} />
            </Routes>
          </ProveedorHeader>
        </ProveedorToasts>
      </ProveedorTema>
    </MemoryRouter>,
  );
}

describe('Categorias', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
    estadoCategorias = { datos: [], cargando: false, error: null };
    estadoProductos = { datos: [], cargando: false, error: null };
  });

  it('header contextual: título "Categorías", volverA a "/ajustes" (subvista de Ajustes, UI-5c)', () => {
    configurarCategorias();
    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Categorías');
    expect(screen.getByTestId('volver-header').textContent).toContain('/ajustes');
  });

  it('lista las categorías en el orden recibido (ya ordenadas por `orden`)', () => {
    configurarCategorias({ datos: categoriasFalsas });
    renderizar();

    const filas = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(filas[0]).toContain('Quesos');
    expect(filas[1]).toContain('Miel');
    expect(filas[2]).toContain('Embutidos');
  });

  it('estado cargando', () => {
    configurarCategorias({ cargando: true });
    renderizar();
    expect(screen.getByText('Cargando categorías…')).toBeTruthy();
  });

  it('estado error: muestra mensaje y botón de reintento', () => {
    configurarCategorias({ error: new Error('boom') });
    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las categorías.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('estado vacío sin candidatos de seed', () => {
    configurarCategorias({ datos: [] });
    configurarProductos({ datos: [] });
    renderizar();

    expect(screen.getByText('No hay categorías todavía. Creá la primera arriba.')).toBeTruthy();
    expect(screen.queryByText(/Importar las categorías en uso/)).toBeNull();
  });

  describe('crear', () => {
    it('éxito: llama a crearCategoria, muestra el toast y limpia el input', async () => {
      mocks.crearCategoria.mockResolvedValue({ categoriaId: 'nueva' });
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      const input = screen.getByLabelText('Nueva categoría') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Especias' } });
      fireEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

      await waitFor(() => expect(mocks.crearCategoria).toHaveBeenCalledTimes(1));
      const [, nombre] = mocks.crearCategoria.mock.calls[0] as [unknown, string];
      expect(nombre).toBe('Especias');
      expect(await screen.findByText('Categoría creada.')).toBeTruthy();
      await waitFor(() => expect(input.value).toBe(''));
    });

    it('valida localmente el nombre vacío sin llamar a crearCategoria', () => {
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

      expect(screen.getByText('Ingresá el nombre de la categoría.')).toBeTruthy();
      expect(mocks.crearCategoria).not.toHaveBeenCalled();
    });

    it('duplicada: muestra el mensaje concreto del error tipado', async () => {
      const { CategoriaDuplicadaError } = await import('@gestion/firebase-kit');
      mocks.crearCategoria.mockRejectedValue(
        new CategoriaDuplicadaError('Ya existe una categoría llamada "Quesos".'),
      );
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      fireEvent.change(screen.getByLabelText('Nueva categoría'), { target: { value: 'Quesos' } });
      fireEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

      expect(await screen.findByText('Ya existe una categoría llamada "Quesos".')).toBeTruthy();
    });

    it('sin conexión: el botón está deshabilitado y se muestra el aviso', () => {
      mocks.useOnlineStatus.mockReturnValue(false);
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      expect(screen.getByText('Necesitás conexión para gestionar categorías.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Crear categoría' }).hasAttribute('disabled')).toBe(true);
    });
  });

  describe('renombrar', () => {
    it('éxito: llama a renombrarCategoria con el id y el nombre nuevo', async () => {
      mocks.renombrarCategoria.mockResolvedValue(undefined);
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar' })[0]!);
      const input = screen.getByLabelText('Nuevo nombre');
      fireEvent.change(input, { target: { value: 'Quesos artesanales' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.renombrarCategoria).toHaveBeenCalledTimes(1));
      expect(mocks.renombrarCategoria).toHaveBeenCalledWith(expect.anything(), 'c1', 'Quesos artesanales');
      expect(await screen.findByText('Categoría renombrada.')).toBeTruthy();
    });

    it('cancelar descarta el borrador y vuelve a la fila normal', () => {
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar' })[0]!);
      expect(screen.getByLabelText('Nuevo nombre')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      expect(screen.queryByLabelText('Nuevo nombre')).toBeNull();
      expect(mocks.renombrarCategoria).not.toHaveBeenCalled();
    });

    it('duplicada: muestra el mensaje del error y no cierra la edición', async () => {
      const { CategoriaDuplicadaError } = await import('@gestion/firebase-kit');
      mocks.renombrarCategoria.mockRejectedValue(
        new CategoriaDuplicadaError('Ya existe una categoría llamada "Miel".'),
      );
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar' })[0]!);
      fireEvent.change(screen.getByLabelText('Nuevo nombre'), { target: { value: 'Miel' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByText('Ya existe una categoría llamada "Miel".')).toBeTruthy();
      expect(screen.getByLabelText('Nuevo nombre')).toBeTruthy();
    });
  });

  describe('reordenar', () => {
    it('deshabilita "Subir" en la primera y "Bajar" en la última', () => {
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      expect(screen.getByRole('button', { name: 'Subir Quesos' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Bajar Quesos' }).hasAttribute('disabled')).toBe(false);

      expect(screen.getByRole('button', { name: 'Subir Miel' }).hasAttribute('disabled')).toBe(false);
      expect(screen.getByRole('button', { name: 'Bajar Miel' }).hasAttribute('disabled')).toBe(false);

      expect(screen.getByRole('button', { name: 'Subir Embutidos' }).hasAttribute('disabled')).toBe(false);
      expect(screen.getByRole('button', { name: 'Bajar Embutidos' }).hasAttribute('disabled')).toBe(true);
    });

    it('"Bajar" en la primera intercambia con la adyacente', async () => {
      mocks.intercambiarOrdenCategorias.mockResolvedValue(undefined);
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Bajar Quesos' }));

      await waitFor(() => expect(mocks.intercambiarOrdenCategorias).toHaveBeenCalledTimes(1));
      const [, a, b] = mocks.intercambiarOrdenCategorias.mock.calls[0] as [unknown, Categoria, Categoria];
      expect(a.id).toBe('c1');
      expect(b.id).toBe('c2');
    });

    it('sin conexión: los botones de reordenar están deshabilitados', () => {
      mocks.useOnlineStatus.mockReturnValue(false);
      configurarCategorias({ datos: categoriasFalsas });
      renderizar();

      expect(screen.getByRole('button', { name: 'Bajar Quesos' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Subir Miel' }).hasAttribute('disabled')).toBe(true);
    });
  });

  describe('seed inicial', () => {
    const productosConCategoriasLibres: Producto[] = [
      productoDe({ id: 'p1', categoria: 'Quesos' }),
      productoDe({ id: 'p2', categoria: 'Miel' }),
      productoDe({ id: 'p3', categoria: 'Quesos' }), // duplicado: no debe importarse dos veces
    ];

    it('colección vacía + productos con categorías en uso: ofrece importar', () => {
      configurarCategorias({ datos: [] });
      configurarProductos({ datos: productosConCategoriasLibres });
      renderizar();

      expect(screen.getByText(/Miel, Quesos/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Importar las categorías en uso' })).toBeTruthy();
    });

    it('importar crea una categoría por cada nombre distinto, en orden alfabético', async () => {
      mocks.crearCategoria.mockResolvedValue({ categoriaId: 'x' });
      configurarCategorias({ datos: [] });
      configurarProductos({ datos: productosConCategoriasLibres });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Importar las categorías en uso' }));

      await waitFor(() => expect(mocks.crearCategoria).toHaveBeenCalledTimes(2));
      expect(mocks.crearCategoria.mock.calls[0]![1]).toBe('Miel');
      expect(mocks.crearCategoria.mock.calls[1]![1]).toBe('Quesos');
      expect(await screen.findByText('Se cargaron tus categorías existentes.')).toBeTruthy();
    });

    it('con categorías ya definidas no ofrece importar aunque haya productos', () => {
      configurarCategorias({ datos: categoriasFalsas });
      configurarProductos({ datos: productosConCategoriasLibres });
      renderizar();
      expect(screen.queryByRole('button', { name: 'Importar las categorías en uso' })).toBeNull();
    });

    it('sin conexión: el botón de importar está deshabilitado', () => {
      mocks.useOnlineStatus.mockReturnValue(false);
      configurarCategorias({ datos: [] });
      configurarProductos({ datos: productosConCategoriasLibres });
      renderizar();

      expect(
        screen.getByRole('button', { name: 'Importar las categorías en uso' }).hasAttribute('disabled'),
      ).toBe(true);
    });
  });
});
