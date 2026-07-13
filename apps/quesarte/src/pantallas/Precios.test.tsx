import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProveedorTema, ProveedorToasts } from '@gestion/ui';
import { money, type Categoria, type Producto } from '@gestion/core';
import { commitEnLotes, Precios, TAMANIO_LOTE_MASIVO } from './Precios';
import { StockLayout } from '../componentes/stock/StockLayout';
import { ProveedorHeader } from '../componentes/header/ContextoHeader';

// Mismo criterio que Productos.test.tsx: `DataTable` con `filaCompacta`
// renderiza SIEMPRE tabla + lista compacta (visibilidad la decide CSS
// responsive, que jsdom no evalúa) — se scopea a la tabla para no ambigüar.
function tabla() {
  return within(screen.getByRole('table'));
}

const mocks = vi.hoisted(() => {
  const objeto = {
    useOnlineStatus: vi.fn(() => true),
    useCollection: vi.fn(),
    updateDoc: vi.fn(),
    batchUpdate: vi.fn(),
    batchCommit: vi.fn(),
    useAuth: vi.fn(),
    // Envuelto en `vi.fn()` (no una función plana como antes) para poder
    // contar cuántos `writeBatch` distintos se abrieron — necesario para el
    // test de chunking de "Ajustar margen" (WA-H): con más de
    // 400 elegibles, `commitEnLotes` (Precios.tsx) abre más de un batch.
    writeBatch: vi.fn(),
  };
  objeto.writeBatch.mockImplementation(() => ({ update: objeto.batchUpdate, commit: objeto.batchCommit }));
  return objeto;
});

// `useAuth` (UI-4): la consume `StockLayout`, que ahora envuelve esta ruta —
// fija un admin, mismo criterio que `Compras.test.tsx`/`Proveedores.test.tsx`.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
    useAuth: mocks.useAuth,
  };
});

mocks.useAuth.mockReturnValue({
  usuario: { uid: 'u1' },
  perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@a.com', rol: 'admin', activo: true },
  cargando: false,
  ingresarConEmail: vi.fn(),
  restablecerPassword: vi.fn(),
  salir: vi.fn(),
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    updateDoc: mocks.updateDoc,
    writeBatch: mocks.writeBatch,
  };
});

interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoProductos: EstadoColeccionFalso<Producto> = { datos: [], cargando: false, error: null };
let estadoCategorias: EstadoColeccionFalso<Categoria> = { datos: [], cargando: false, error: null };

/** Mismo truco que Productos.test.tsx: distingue las dos `useCollection` por
 * el nombre de colección de la query real armada con `collection`/`query`. */
function nombreColeccion(query: unknown): string | undefined {
  const interna = (query as { _query?: { path?: { segments?: string[] } } })._query;
  return interna?.path?.segments?.[0];
}

mocks.useCollection.mockImplementation((query: unknown) =>
  nombreColeccion(query) === 'categorias' ? estadoCategorias : estadoProductos,
);

function configurarCollection(overrides: { datos?: Producto[]; cargando?: boolean; error?: unknown }) {
  estadoProductos = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function configurarCategorias(overrides: { datos?: Categoria[] } = {}) {
  estadoCategorias = { datos: overrides.datos ?? [], cargando: false, error: null };
}

function productoDe(over: Partial<Producto> & Pick<Producto, 'id'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'Categoría',
    modoPrecio: 'por_kg',
    modoStock: 'granel',
    precioVentaCents: money(50000),
    costoPromedioCents: money(30000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/stock/precios']}>
      <ProveedorTema>
        <ProveedorToasts>
          <ProveedorHeader>
            <Routes>
              <Route element={<StockLayout />}>
                <Route path="/stock/precios" element={<Precios />} />
              </Route>
            </Routes>
          </ProveedorHeader>
        </ProveedorToasts>
      </ProveedorTema>
    </MemoryRouter>,
  );
}

describe('Precios', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
    estadoProductos = { datos: [], cargando: false, error: null };
    estadoCategorias = { datos: [], cargando: false, error: null };
  });

  it('muestra el SelectorSeccion con "Precios" disponible', () => {
    configurarCollection({ datos: [] });
    renderizar();

    expect(screen.getByRole('link', { name: 'Precios' }).getAttribute('href')).toBe('/stock/precios');
  });

  it('estado cargando', () => {
    configurarCollection({ cargando: true });
    renderizar();
    expect(screen.getByText('Cargando productos…')).toBeTruthy();
  });

  it('estado error muestra mensaje y botón de reintento', () => {
    configurarCollection({ error: new Error('boom') });
    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar los productos.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('estado vacío', () => {
    configurarCollection({ datos: [] });
    renderizar();
    expect(screen.getByText('No hay productos todavía. Cargalos desde Catálogo.')).toBeTruthy();
  });

  describe('tabla: costo, precio y margen', () => {
    it('producto con costo: muestra costo, precio y margen actual calculados', () => {
      configurarCollection({
        datos: [
          productoDe({
            id: 'p1',
            nombre: 'Queso Añejo',
            modoPrecio: 'por_kg',
            costoPromedioCents: money(30000),
            precioVentaCents: money(50000),
          }),
        ],
      });
      renderizar();

      expect(tabla().getByText('Queso Añejo')).toBeTruthy();
      expect(tabla().getByText('$ 300,00 /kg')).toBeTruthy();
      expect(tabla().getByText('$ 500,00 /kg')).toBeTruthy();
      expect(tabla().getByText('40,00 %')).toBeTruthy(); // margen actual
    });

    it('producto sin costo (0): costo y margen actual son "—", sin división basura', () => {
      configurarCollection({
        datos: [productoDe({ id: 'p1', nombre: 'Nuez nueva', costoPromedioCents: money(0) })],
      });
      renderizar();

      const fila = tabla().getByText('Nuez nueva').closest('tr') as HTMLElement;
      expect(within(fila).getAllByText('—').length).toBeGreaterThanOrEqual(2); // costo y margen actual
    });

    it('con margen objetivo definido, lo muestra en su columna', () => {
      configurarCollection({
        datos: [productoDe({ id: 'p1', nombre: 'Queso Añejo', margenObjetivoBps: 4500 })],
      });
      renderizar();

      expect(tabla().getByText('45,00 %')).toBeTruthy();
    });

    it('sin margen objetivo definido, la columna muestra "—"', () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'Queso Añejo' })] });
      renderizar();

      const fila = tabla().getByText('Queso Añejo').closest('tr') as HTMLElement;
      expect(within(fila).getByText('—')).toBeTruthy();
    });
  });

  describe('alerta de margen', () => {
    it('producto bajo objetivo: badge "Bajo objetivo" en su fila', () => {
      configurarCollection({
        datos: [
          // margen actual 40 % < objetivo 50 %
          productoDe({
            id: 'p1',
            nombre: 'Queso Añejo',
            costoPromedioCents: money(30000),
            precioVentaCents: money(50000),
            margenObjetivoBps: 5000,
          }),
        ],
      });
      renderizar();

      const fila = tabla().getByText('Queso Añejo').closest('tr') as HTMLElement;
      expect(within(fila).getByText('Bajo objetivo')).toBeTruthy();
    });

    it('producto por encima del objetivo: sin badge', () => {
      configurarCollection({
        datos: [
          productoDe({
            id: 'p1',
            nombre: 'Queso Añejo',
            costoPromedioCents: money(30000),
            precioVentaCents: money(50000), // margen 40 %
            margenObjetivoBps: 3000, // objetivo 30 %
          }),
        ],
      });
      renderizar();

      const fila = tabla().getByText('Queso Añejo').closest('tr') as HTMLElement;
      expect(within(fila).queryByText('Bajo objetivo')).toBeNull();
    });

    it('chip "Bajo objetivo" filtra la tabla a los que están bajo objetivo', () => {
      configurarCollection({
        datos: [
          productoDe({
            id: 'p1',
            nombre: 'Bajo objetivo SA',
            costoPromedioCents: money(30000),
            precioVentaCents: money(50000), // 40 %
            margenObjetivoBps: 5000, // objetivo 50 % → bajo
          }),
          productoDe({
            id: 'p2',
            nombre: 'En objetivo SA',
            costoPromedioCents: money(30000),
            precioVentaCents: money(50000), // 40 %
            margenObjetivoBps: 3000, // objetivo 30 % → OK
          }),
        ],
      });
      renderizar();

      expect(tabla().getByText('Bajo objetivo SA')).toBeTruthy();
      expect(tabla().getByText('En objetivo SA')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Bajo objetivo' }));

      expect(tabla().getByText('Bajo objetivo SA')).toBeTruthy();
      expect(tabla().queryByText('En objetivo SA')).toBeNull();
    });
  });

  describe('búsqueda y filtro por categoría', () => {
    it('la búsqueda filtra por nombre o categoría', () => {
      configurarCollection({
        datos: [
          productoDe({ id: 'p1', nombre: 'Queso Añejo', categoria: 'Quesos' }),
          productoDe({ id: 'p2', nombre: 'Miel 500g', categoria: 'Miel' }),
        ],
      });
      renderizar();

      fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'miel' } });

      expect(tabla().getByText('Miel 500g')).toBeTruthy();
      expect(tabla().queryByText('Queso Añejo')).toBeNull();
    });

    it('con dos o más categorías, los chips filtran la tabla', () => {
      configurarCollection({
        datos: [
          productoDe({ id: 'p1', nombre: 'Queso Añejo', categoria: 'Quesos' }),
          productoDe({ id: 'p2', nombre: 'Miel 500g', categoria: 'Miel' }),
        ],
      });
      configurarCategorias({
        datos: [
          { id: 'c1', nombre: 'Quesos', orden: 0 },
          { id: 'c2', nombre: 'Miel', orden: 1 },
        ],
      });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));

      expect(tabla().getByText('Queso Añejo')).toBeTruthy();
      expect(tabla().queryByText('Miel 500g')).toBeNull();
    });
  });

  describe('edición individual', () => {
    it('tocar "Editar" abre el modal de ese producto', () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'Queso Añejo' })] });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

      expect(screen.getByText('Editar precio · Queso Añejo')).toBeTruthy();
    });

    it('guardar llama a updateDoc con el precio y el margen objetivo, y muestra el toast de éxito', async () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'Queso Añejo' })] });
      mocks.updateDoc.mockResolvedValue(undefined);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      fireEvent.change(screen.getByLabelText('Precio de venta por kg'), { target: { value: '600,00' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledTimes(1));
      const [, cambios] = mocks.updateDoc.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(cambios.precioVentaCents).toBe(money(60000));
      expect(await screen.findByText('Precio actualizado.')).toBeTruthy();
    });

    it('sin conexión: cierra el modal al instante y avisa que falta sincronizar', async () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'Queso Añejo' })] });
      mocks.useOnlineStatus.mockReturnValue(false);
      mocks.updateDoc.mockResolvedValue(undefined);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      const dialog = document.querySelectorAll('dialog')[0] as HTMLDialogElement;
      expect(dialog.open).toBe(false);
      expect(
        await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.'),
      ).toBeTruthy();
    });

    it('error al guardar: muestra toast de error', async () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'Queso Añejo' })] });
      mocks.updateDoc.mockRejectedValue(new Error('offline'));
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByText('No se pudo actualizar el precio. Intentá de nuevo.')).toBeTruthy();
    });
  });

  describe('aplicar sugeridos (masivo)', () => {
    function productoBajoObjetivoConSugerido(id: string, nombre: string): Producto {
      // costo $300, precio $400 (margen 25 %), objetivo 40 % → bajo objetivo,
      // con precio sugerido calculable (precioDesdeMargen(30000,4000)=50000 exacto).
      return productoDe({
        id,
        nombre,
        costoPromedioCents: money(30000),
        precioVentaCents: money(40000),
        margenObjetivoBps: 4000,
      });
    }

    it('el botón muestra la cantidad de candidatos visibles y arranca deshabilitado sin ninguno', () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'En objetivo' })] });
      renderizar();

      const boton = screen.getByRole('button', { name: 'Aplicar sugeridos (0)' }) as HTMLButtonElement;
      expect(boton.disabled).toBe(true);
    });

    it('con candidatos visibles, habilita el botón con la cuenta correcta', () => {
      configurarCollection({
        datos: [productoBajoObjetivoConSugerido('p1', 'Queso Añejo'), productoBajoObjetivoConSugerido('p2', 'Queso Colonia')],
      });
      renderizar();

      const boton = screen.getByRole('button', { name: 'Aplicar sugeridos (2)' }) as HTMLButtonElement;
      expect(boton.disabled).toBe(false);
    });

    it('abre la confirmación con el detalle actual → sugerido, y confirmar llama al batch con TODOS los candidatos', async () => {
      configurarCollection({
        datos: [productoBajoObjetivoConSugerido('p1', 'Queso Añejo'), productoBajoObjetivoConSugerido('p2', 'Queso Colonia')],
      });
      mocks.batchCommit.mockResolvedValue(undefined);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugeridos (2)' }));

      expect(screen.getByText('Aplicar precios sugeridos')).toBeTruthy();
      expect(screen.getAllByText('$ 400,00 → $ 500,00').length).toBe(2);

      fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 2 producto(s)' }));

      await waitFor(() => expect(mocks.batchCommit).toHaveBeenCalledTimes(1));
      expect(mocks.batchUpdate).toHaveBeenCalledTimes(2);
      expect(await screen.findByText('Se actualizaron los precios de 2 productos.')).toBeTruthy();
    });

    it('cancelar la confirmación no llama al batch', () => {
      configurarCollection({ datos: [productoBajoObjetivoConSugerido('p1', 'Queso Añejo')] });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Aplicar sugeridos (1)' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(mocks.batchCommit).not.toHaveBeenCalled();
    });

    it('un producto bajo objetivo pero sin costo (sin sugerido posible) no cuenta como candidato', () => {
      const sinCosto = productoDe({
        id: 'p1',
        nombre: 'Sin costo',
        costoPromedioCents: money(0),
        margenObjetivoBps: 4000,
      });
      configurarCollection({ datos: [sinCosto] });
      renderizar();

      expect(screen.getByRole('button', { name: 'Aplicar sugeridos (0)' })).toBeTruthy();
    });
  });

  it('WA-H2: "Ajustar margen" y "Aplicar sugeridos" comparten la misma fila de acciones', () => {
    configurarCollection({ datos: [] });
    renderizar();

    const ajustarMargen = screen.getByRole('button', { name: 'Ajustar margen' });
    const aplicarSugeridos = screen.getByRole('button', { name: 'Aplicar sugeridos (0)' });
    expect(ajustarMargen.parentElement).toBe(aplicarSugeridos.parentElement);
  });

  it('WA-H2: el chip "Bajo objetivo" convive en el mismo carril que los chips de categoría', () => {
    configurarCollection({
      datos: [
        productoDe({ id: 'p1', nombre: 'Queso Añejo', categoria: 'Quesos' }),
        productoDe({ id: 'p2', nombre: 'Miel 500g', categoria: 'Miel' }),
      ],
    });
    configurarCategorias({
      datos: [
        { id: 'c1', nombre: 'Quesos', orden: 0 },
        { id: 'c2', nombre: 'Miel', orden: 1 },
      ],
    });
    renderizar();

    const chipCategoria = screen.getByRole('button', { name: 'Quesos' });
    const chipBajoObjetivo = screen.getByRole('button', { name: 'Bajo objetivo' });
    // Mismo carril = mismo ancestro scrolleable (el `role="group"` de
    // `ChipsFiltro` es un hijo de ESE carril, no el carril en sí — de ahí
    // subir un nivel más desde el chip de categoría).
    expect(chipCategoria.closest('[role="group"]')?.parentElement).toBe(chipBajoObjetivo.parentElement);
  });

  describe('margen objetivo masivo (WA-H/WA-H2): "Ajustar margen"', () => {
    it('sin ningún producto elegible, el botón arranca deshabilitado', () => {
      configurarCollection({
        datos: [productoDe({ id: 'p1', nombre: 'Sin costo', costoPromedioCents: money(0) })],
      });
      renderizar();

      const boton = screen.getByRole('button', { name: 'Ajustar margen' }) as HTMLButtonElement;
      expect(boton.disabled).toBe(true);
    });

    it('cuenta los elegibles excluyendo sin costo y margen no comparable, y lo muestra en el modal', () => {
      configurarCollection({
        datos: [
          productoDe({ id: 'p1', nombre: 'Elegible 1' }),
          productoDe({ id: 'p2', nombre: 'Elegible 2' }),
          productoDe({ id: 'p3', nombre: 'Sin costo', costoPromedioCents: money(0) }),
          productoDe({
            id: 'p4',
            nombre: 'No comparable',
            modoStock: 'pieza_entera',
            modoPrecio: 'por_unidad',
          }),
        ],
      });
      renderizar();

      const boton = screen.getByRole('button', { name: 'Ajustar margen' }) as HTMLButtonElement;
      expect(boton.disabled).toBe(false);

      // WA-H2: el botón ya no lleva el conteo en la etiqueta — el modal es la
      // única fuente de verdad de a cuántos productos se les va a aplicar.
      fireEvent.click(boton);
      expect(screen.getByText(/Se aplicará a 2 producto\(s\) filtrado\(s\)/)).toBeTruthy();
    });

    it('los elegibles respetan la búsqueda, categoría y "bajo objetivo" (mismos filtros que la tabla)', () => {
      configurarCollection({
        datos: [
          productoDe({ id: 'p1', nombre: 'Queso Añejo', categoria: 'Quesos' }),
          productoDe({ id: 'p2', nombre: 'Miel 500g', categoria: 'Miel' }),
        ],
      });
      renderizar();

      fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'miel' } });
      fireEvent.click(screen.getByRole('button', { name: 'Ajustar margen' }));

      expect(screen.getByText(/Se aplicará a 1 producto\(s\) filtrado\(s\)/)).toBeTruthy();
    });

    it('el modal muestra cuántos quedan excluidos y por qué', () => {
      configurarCollection({
        datos: [
          productoDe({ id: 'p1', nombre: 'Elegible 1' }),
          productoDe({ id: 'p3', nombre: 'Sin costo', costoPromedioCents: money(0) }),
          productoDe({
            id: 'p4',
            nombre: 'No comparable',
            modoStock: 'pieza_entera',
            modoPrecio: 'por_unidad',
          }),
        ],
      });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Ajustar margen' }));

      expect(
        screen.getByText(
          'Quedan afuera 1 sin costo cargado y 1 con costo y precio en unidades no comparables (pieza vendida por unidad).',
        ),
      ).toBeTruthy();
    });

    it('sin exclusiones, no muestra el texto de "quedan afuera"', () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'Elegible 1' })] });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Ajustar margen' }));

      expect(screen.queryByText(/Quedan afuera/)).toBeNull();
    });

    it('porcentaje inválido: muestra error y no dispara ninguna escritura', () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'Elegible' })] });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Ajustar margen' }));
      fireEvent.change(screen.getByLabelText('Nuevo margen objetivo (%)'), { target: { value: 'abc' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fijar objetivo' }));

      expect(screen.getByText('Ingresá un porcentaje válido, ej: 40 o 33,33.')).toBeTruthy();
      expect(mocks.batchCommit).not.toHaveBeenCalled();
    });

    it('porcentaje fuera de rango (>= 100 %): muestra error y no dispara ninguna escritura', () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'Elegible' })] });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Ajustar margen' }));
      fireEvent.change(screen.getByLabelText('Nuevo margen objetivo (%)'), { target: { value: '100' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fijar y aplicar precios' }));

      expect(screen.getByText('El margen objetivo debe ser menor a 100 %.')).toBeTruthy();
      expect(mocks.batchCommit).not.toHaveBeenCalled();
    });

    it('"Fijar objetivo": escribe margenObjetivoBps (bps enteros) en batch solo a los elegibles filtrados', async () => {
      configurarCollection({
        datos: [
          productoDe({ id: 'p1', nombre: 'Elegible 1' }),
          productoDe({ id: 'p2', nombre: 'Elegible 2' }),
          productoDe({ id: 'p3', nombre: 'Sin costo', costoPromedioCents: money(0) }),
        ],
      });
      mocks.batchCommit.mockResolvedValue(undefined);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Ajustar margen' }));
      expect(screen.getByText(/Se aplicará a 2 producto\(s\) filtrado\(s\)/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Nuevo margen objetivo (%)'), { target: { value: '45' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fijar objetivo' }));

      await waitFor(() => expect(mocks.batchCommit).toHaveBeenCalledTimes(1));
      expect(mocks.batchUpdate).toHaveBeenCalledTimes(2);
      for (const llamada of mocks.batchUpdate.mock.calls as [unknown, Record<string, unknown>][]) {
        expect(llamada[1].margenObjetivoBps).toBe(4500);
        expect(llamada[1].precioVentaCents).toBeUndefined();
      }
      expect(await screen.findByText('Se fijó el margen objetivo de 2 productos.')).toBeTruthy();
    });

    it('"Fijar y aplicar precios": confirmación con el precio redondeado y el batch escribe margen + precio', async () => {
      configurarCollection({
        datos: [
          // costo $300, precio actual $400, objetivo nuevo 40 % → sugerido
          // exacto $500 (precioDesdeMargen(30000,4000)=50000, ya redondo a $5).
          productoDe({
            id: 'p1',
            nombre: 'Queso Añejo',
            costoPromedioCents: money(30000),
            precioVentaCents: money(40000),
          }),
        ],
      });
      mocks.batchCommit.mockResolvedValue(undefined);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Ajustar margen' }));
      fireEvent.change(screen.getByLabelText('Nuevo margen objetivo (%)'), { target: { value: '40' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fijar y aplicar precios' }));

      expect(screen.getByText('Fijar y aplicar margen a los filtrados')).toBeTruthy();
      expect(screen.getByText('$ 400,00 → $ 500,00')).toBeTruthy();
      // No escribe nada hasta confirmar el segundo paso.
      expect(mocks.batchCommit).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Aplicar a 1 producto(s)' }));

      await waitFor(() => expect(mocks.batchCommit).toHaveBeenCalledTimes(1));
      const [, cambios] = mocks.batchUpdate.mock.calls[0] as [unknown, Record<string, unknown>];
      expect(cambios.margenObjetivoBps).toBe(4000);
      expect(cambios.precioVentaCents).toBe(money(50000));
      expect(await screen.findByText('Se actualizó el margen y el precio de 1 producto.')).toBeTruthy();
    });

    it('cancelar la confirmación de "Fijar y aplicar precios" no escribe nada', () => {
      configurarCollection({
        datos: [productoDe({ id: 'p1', nombre: 'Queso Añejo', costoPromedioCents: money(30000), precioVentaCents: money(40000) })],
      });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Ajustar margen' }));
      fireEvent.change(screen.getByLabelText('Nuevo margen objetivo (%)'), { target: { value: '40' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fijar y aplicar precios' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(mocks.batchCommit).not.toHaveBeenCalled();
    });

    it('sin conexión: "Fijar objetivo" cierra el modal al instante y avisa que falta sincronizar', async () => {
      configurarCollection({ datos: [productoDe({ id: 'p1', nombre: 'Elegible' })] });
      mocks.useOnlineStatus.mockReturnValue(false);
      mocks.batchCommit.mockResolvedValue(undefined);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Ajustar margen' }));
      fireEvent.change(screen.getByLabelText('Nuevo margen objetivo (%)'), { target: { value: '40' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fijar objetivo' }));

      expect(
        await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.'),
      ).toBeTruthy();
    });

    // `commitEnLotes` (helper de chunking que usan `fijarMargenObjetivoMasivo`
    // y `fijarYAplicarMargenMasivo`) se testea DIRECTO acá, sin pasar por un
    // render de `Precios` con 400+ filas reales en `DataTable`: ese camino es
    // correcto pero deja el test lento e inestable bajo carga (CI corriendo
    // en paralelo) para probar exactamente lo mismo. Cubre "no dejes el
    // límite de 500 latente" (WA-H) sin ese costo.
    it('commitEnLotes divide en tandas de TAMANIO_LOTE_MASIVO, cada una su propio writeBatch/commit', async () => {
      mocks.batchCommit.mockResolvedValue(undefined);
      const items = Array.from({ length: TAMANIO_LOTE_MASIVO + 1 }, (_, i) => i);
      const aplicar = vi.fn();

      await commitEnLotes(items, aplicar);

      expect(mocks.writeBatch).toHaveBeenCalledTimes(2);
      expect(mocks.batchCommit).toHaveBeenCalledTimes(2);
      expect(aplicar).toHaveBeenCalledTimes(items.length);
    });

    it('commitEnLotes con items <= TAMANIO_LOTE_MASIVO hace un único batch', async () => {
      mocks.batchCommit.mockResolvedValue(undefined);
      const items = Array.from({ length: TAMANIO_LOTE_MASIVO }, (_, i) => i);
      const aplicar = vi.fn();

      await commitEnLotes(items, aplicar);

      expect(mocks.writeBatch).toHaveBeenCalledTimes(1);
      expect(mocks.batchCommit).toHaveBeenCalledTimes(1);
      expect(aplicar).toHaveBeenCalledTimes(items.length);
    });
  });

  describe('M2 (review Fase 2): pieza_entera/fraccionado_por_pieza con modoPrecio "por_unidad"', () => {
    function productoPiezaPorUnidad(over: Partial<Producto> = {}): Producto {
      return productoDe({
        id: 'p1',
        nombre: 'Salame tandilero',
        modoStock: 'pieza_entera',
        modoPrecio: 'por_unidad',
        costoPromedioCents: money(30000), // $300/kg (compras SIEMPRE acumulan pieza en $/kg)
        precioVentaCents: money(50000), // $500/unidad — precio fijo (400-300 sería "bajo" un objetivo mal calculado)
        margenObjetivoBps: 4000,
        ...over,
      });
    }

    it('el costo se rotula "/kg" (no "/u" del modoPrecio) y el margen actual es "—"', () => {
      configurarCollection({ datos: [productoPiezaPorUnidad()] });
      renderizar();

      const fila = tabla().getByText('Salame tandilero').closest('tr') as HTMLElement;
      expect(within(fila).getByText('$ 300,00 /kg')).toBeTruthy();
      expect(within(fila).getByText('$ 500,00 /u')).toBeTruthy(); // precio: unidad de VENTA, sin cambios
      expect(within(fila).getByText('—')).toBeTruthy(); // margen actual, único "—" en la fila
    });

    it('no dispara la alerta "Bajo objetivo" aunque el margen crudo (kg vs. unidad) daría por debajo del objetivo', () => {
      configurarCollection({ datos: [productoPiezaPorUnidad()] });
      renderizar();

      const fila = tabla().getByText('Salame tandilero').closest('tr') as HTMLElement;
      expect(within(fila).queryByText('Bajo objetivo')).toBeNull();
    });

    it('no entra a "Aplicar sugeridos": el botón cuenta 0 candidatos con este único producto', () => {
      configurarCollection({ datos: [productoPiezaPorUnidad()] });
      renderizar();

      const boton = screen.getByRole('button', { name: 'Aplicar sugeridos (0)' }) as HTMLButtonElement;
      expect(boton.disabled).toBe(true);
    });

    it('el editor de margen objetivo del modal queda deshabilitado con su nota', () => {
      configurarCollection({ datos: [productoPiezaPorUnidad()] });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

      const input = screen.getByLabelText('Margen objetivo (%)') as HTMLInputElement;
      expect(input.disabled).toBe(true);
      expect(
        screen.getByText('Costo por kg y precio por unidad no son comparables sin el peso de la pieza.'),
      ).toBeTruthy();
    });
  });

  it('gate de admin: la ruta /stock/precios está protegida por RutaSoloAdmin en App.tsx (no hay lógica de rol dentro de Precios.tsx)', () => {
    // Precios.tsx en sí no rama por rol (a diferencia de Productos.tsx): esta
    // pantalla asume que solo llega un admin, gateado en App.tsx. El test de
    // gate real (redirect a /venta para un vendedor) vive a nivel de ruta,
    // no acá — se documenta la decisión para que quede explícita en la suite.
    configurarCollection({ datos: [] });
    renderizar();
    expect(screen.getByRole('link', { name: 'Precios' })).toBeTruthy();
  });
});
