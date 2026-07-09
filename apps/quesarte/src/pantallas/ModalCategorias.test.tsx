import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProveedorTema, ProveedorToasts } from '@gestion/ui';
import { money, type Categoria, type Producto } from '@gestion/core';
import { ModalCategorias, type ModalCategoriasProps } from './ModalCategorias';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  crearCategoria: vi.fn(),
  renombrarCategoria: vi.fn(),
  intercambiarOrdenCategorias: vi.fn(),
}));

// Mismo criterio que Productos.test.tsx/Usuarios.test.tsx: las clases de
// error (`CategoriaDuplicadaError`/`CategoriaInvalidaError`) pasan reales
// (se ejercita `instanceof` tal cual las usa el componente); solo se
// mockean las funciones de escritura y `useOnlineStatus`. A diferencia de
// esos dos, acá NO hace falta mockear `useCollection`: `ModalCategorias`
// recibe `categorias`/`cargando`/`error` por props (los arma `Productos.tsx`,
// ver JSDoc del componente), no se suscribe él mismo.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    crearCategoria: mocks.crearCategoria,
    renombrarCategoria: mocks.renombrarCategoria,
    intercambiarOrdenCategorias: mocks.intercambiarOrdenCategorias,
  };
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

function renderizar(overrides: Partial<ModalCategoriasProps> = {}) {
  const props: ModalCategoriasProps = {
    abierto: true,
    categorias: [],
    cargando: false,
    error: null,
    productos: [],
    onReintentar: vi.fn(),
    onCerrar: vi.fn(),
    ...overrides,
  };
  return { ...render(
    <ProveedorTema>
      <ProveedorToasts>
        <ModalCategorias {...props} />
      </ProveedorToasts>
    </ProveedorTema>,
  ), props };
}

describe('ModalCategorias', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
  });

  it('lista las categorías en el orden recibido (ya ordenadas por `orden`)', () => {
    renderizar({ categorias: categoriasFalsas });

    const filas = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(filas[0]).toContain('Quesos');
    expect(filas[1]).toContain('Miel');
    expect(filas[2]).toContain('Embutidos');
  });

  it('estado cargando', () => {
    renderizar({ cargando: true });
    expect(screen.getByText('Cargando categorías…')).toBeTruthy();
  });

  it('estado error: muestra mensaje y botón de reintento', () => {
    const onReintentar = vi.fn();
    renderizar({ error: new Error('boom'), onReintentar });

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las categorías.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });

  it('estado vacío sin candidatos de seed', () => {
    renderizar({ categorias: [], productos: [] });
    expect(screen.getByText('No hay categorías todavía. Creá la primera arriba.')).toBeTruthy();
    expect(screen.queryByText(/Importar las categorías en uso/)).toBeNull();
  });

  describe('crear', () => {
    it('éxito: llama a crearCategoria, muestra el toast y limpia el input', async () => {
      mocks.crearCategoria.mockResolvedValue({ categoriaId: 'nueva' });
      renderizar({ categorias: categoriasFalsas });

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
      renderizar({ categorias: categoriasFalsas });

      fireEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

      expect(screen.getByText('Ingresá el nombre de la categoría.')).toBeTruthy();
      expect(mocks.crearCategoria).not.toHaveBeenCalled();
    });

    it('duplicada: muestra el mensaje concreto del error tipado', async () => {
      const { CategoriaDuplicadaError } = await import('@gestion/firebase-kit');
      mocks.crearCategoria.mockRejectedValue(
        new CategoriaDuplicadaError('Ya existe una categoría llamada "Quesos".'),
      );
      renderizar({ categorias: categoriasFalsas });

      fireEvent.change(screen.getByLabelText('Nueva categoría'), { target: { value: 'Quesos' } });
      fireEvent.click(screen.getByRole('button', { name: 'Crear categoría' }));

      expect(await screen.findByText('Ya existe una categoría llamada "Quesos".')).toBeTruthy();
    });

    it('sin conexión: el botón está deshabilitado y se muestra el aviso', () => {
      mocks.useOnlineStatus.mockReturnValue(false);
      renderizar({ categorias: categoriasFalsas });

      expect(screen.getByText('Necesitás conexión para gestionar categorías.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Crear categoría' }).hasAttribute('disabled')).toBe(true);
    });
  });

  describe('renombrar', () => {
    it('éxito: llama a renombrarCategoria con el id y el nombre nuevo', async () => {
      mocks.renombrarCategoria.mockResolvedValue(undefined);
      renderizar({ categorias: categoriasFalsas });

      fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar' })[0]!);
      const input = screen.getByLabelText('Nuevo nombre');
      fireEvent.change(input, { target: { value: 'Quesos artesanales' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.renombrarCategoria).toHaveBeenCalledTimes(1));
      expect(mocks.renombrarCategoria).toHaveBeenCalledWith(expect.anything(), 'c1', 'Quesos artesanales');
      expect(await screen.findByText('Categoría renombrada.')).toBeTruthy();
    });

    it('cancelar descarta el borrador y vuelve a la fila normal', () => {
      renderizar({ categorias: categoriasFalsas });

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
      renderizar({ categorias: categoriasFalsas });

      fireEvent.click(screen.getAllByRole('button', { name: 'Renombrar' })[0]!);
      fireEvent.change(screen.getByLabelText('Nuevo nombre'), { target: { value: 'Miel' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByText('Ya existe una categoría llamada "Miel".')).toBeTruthy();
      expect(screen.getByLabelText('Nuevo nombre')).toBeTruthy();
    });
  });

  describe('reordenar', () => {
    it('deshabilita "Subir" en la primera y "Bajar" en la última', () => {
      renderizar({ categorias: categoriasFalsas });

      expect(screen.getByRole('button', { name: 'Subir Quesos' }).hasAttribute('disabled')).toBe(true);
      expect(screen.getByRole('button', { name: 'Bajar Quesos' }).hasAttribute('disabled')).toBe(false);

      expect(screen.getByRole('button', { name: 'Subir Miel' }).hasAttribute('disabled')).toBe(false);
      expect(screen.getByRole('button', { name: 'Bajar Miel' }).hasAttribute('disabled')).toBe(false);

      expect(screen.getByRole('button', { name: 'Subir Embutidos' }).hasAttribute('disabled')).toBe(false);
      expect(screen.getByRole('button', { name: 'Bajar Embutidos' }).hasAttribute('disabled')).toBe(true);
    });

    it('"Bajar" en la primera intercambia con la adyacente', async () => {
      mocks.intercambiarOrdenCategorias.mockResolvedValue(undefined);
      renderizar({ categorias: categoriasFalsas });

      fireEvent.click(screen.getByRole('button', { name: 'Bajar Quesos' }));

      await waitFor(() => expect(mocks.intercambiarOrdenCategorias).toHaveBeenCalledTimes(1));
      const [, a, b] = mocks.intercambiarOrdenCategorias.mock.calls[0] as [unknown, Categoria, Categoria];
      expect(a.id).toBe('c1');
      expect(b.id).toBe('c2');
    });

    it('sin conexión: los botones de reordenar están deshabilitados', () => {
      mocks.useOnlineStatus.mockReturnValue(false);
      renderizar({ categorias: categoriasFalsas });

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
      renderizar({ categorias: [], productos: productosConCategoriasLibres });

      expect(screen.getByText(/Miel, Quesos/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Importar las categorías en uso' })).toBeTruthy();
    });

    it('importar crea una categoría por cada nombre distinto, en orden alfabético', async () => {
      mocks.crearCategoria.mockResolvedValue({ categoriaId: 'x' });
      renderizar({ categorias: [], productos: productosConCategoriasLibres });

      fireEvent.click(screen.getByRole('button', { name: 'Importar las categorías en uso' }));

      await waitFor(() => expect(mocks.crearCategoria).toHaveBeenCalledTimes(2));
      expect(mocks.crearCategoria.mock.calls[0]![1]).toBe('Miel');
      expect(mocks.crearCategoria.mock.calls[1]![1]).toBe('Quesos');
      expect(await screen.findByText('Se cargaron tus categorías existentes.')).toBeTruthy();
    });

    it('con categorías ya definidas no ofrece importar aunque haya productos', () => {
      renderizar({ categorias: categoriasFalsas, productos: productosConCategoriasLibres });
      expect(screen.queryByRole('button', { name: 'Importar las categorías en uso' })).toBeNull();
    });

    it('sin conexión: el botón de importar está deshabilitado', () => {
      mocks.useOnlineStatus.mockReturnValue(false);
      renderizar({ categorias: [], productos: productosConCategoriasLibres });

      expect(
        screen.getByRole('button', { name: 'Importar las categorías en uso' }).hasAttribute('disabled'),
      ).toBe(true);
    });
  });
});
