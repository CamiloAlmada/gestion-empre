import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ProveedorToasts } from '@gestion/ui';
import { money, type Categoria, type Producto } from '@gestion/core';
import {
  ModalProducto,
  type DatosProductoFormulario,
  type ModalProductoProps,
} from './ModalProducto';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  crearCategoria: vi.fn(),
}));

// Mismo criterio que Categorias.test.tsx: las clases de error
// (`CategoriaDuplicadaError`/`CategoriaInvalidaError`) pasan REALES
// (`importOriginal`, se ejercita `instanceof` tal cual las usa el
// componente); solo se mockean el hook de conectividad y la única
// operación de escritura que este modal dispara por su cuenta
// (`crearCategoria`, para el picker de categoría con creación inline,
// UI-5b). `db` NO se mockea: viene real de `../firebase` (init con env vars
// falsas de vitest.config.ts), pero nunca se toca de verdad porque
// `crearCategoria` está mockeada.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    crearCategoria: mocks.crearCategoria,
  };
});

function categoriaDe(over: Partial<Categoria> & Pick<Categoria, 'id'>): Categoria {
  return { nombre: 'Categoría', orden: 0, ...over };
}

function productoDe(over: Partial<Producto> & Pick<Producto, 'id'>): Producto {
  return {
    nombre: 'Queso Añejo',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    modoStock: 'fraccionado_por_pieza',
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
];

function renderizar(overrides: Partial<ModalProductoProps> = {}) {
  const onGuardar = vi.fn();
  const onCerrar = vi.fn();
  const props: ModalProductoProps = {
    abierto: true,
    producto: null,
    guardando: false,
    categorias: categoriasFalsas,
    onGuardar,
    onCerrar,
    ...overrides,
  };
  render(
    <MemoryRouter>
      <ProveedorToasts>
        <ModalProducto {...props} />
      </ProveedorToasts>
    </MemoryRouter>,
  );
  return { onGuardar, onCerrar };
}

function abrirCreacionInline() {
  fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: '__crear_categoria__' } });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.useOnlineStatus.mockReturnValue(true);
});

describe('ModalProducto - precio según alta/edición (UI-5b, docs/06-ui-ux.md §2)', () => {
  // (d) el alta sigue exigiendo precio.
  it('alta: muestra el campo de precio y lo exige para guardar', () => {
    const { onGuardar } = renderizar({ producto: null });

    expect(screen.getByLabelText('Precio por kg')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuez mariposa' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Quesos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('Ingresá el precio de venta.')).toBeTruthy();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('alta: guarda con tipo "alta" e incluye precioVentaCents/modoPrecio/modoStock', () => {
    const { onGuardar } = renderizar({ producto: null });

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuez mariposa' } });
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'Quesos' } });
    fireEvent.change(screen.getByLabelText('Precio por kg'), { target: { value: '450,00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onGuardar).toHaveBeenCalledTimes(1);
    const datos = onGuardar.mock.calls[0]![0] as DatosProductoFormulario;
    expect(datos.tipo).toBe('alta');
    if (datos.tipo === 'alta') {
      expect(datos.precioVentaCents).toBe(money(45000));
      expect(datos.modoPrecio).toBe('por_kg');
      expect(datos.modoStock).toBe('fraccionado_por_pieza');
    }
  });

  // (c) edición no ofrece campo precio.
  it('edición: NO muestra el campo de precio (ni por kg ni por unidad)', () => {
    renderizar({ producto: productoDe({ id: 'p1' }) });

    expect(screen.queryByLabelText('Precio por kg')).toBeNull();
    expect(screen.queryByLabelText('Precio por unidad')).toBeNull();
  });

  it('edición: guarda con tipo "edicion" y el payload NO incluye precioVentaCents', () => {
    const { onGuardar } = renderizar({
      producto: productoDe({ id: 'p1', nombre: 'Queso Añejo', activo: true }),
    });

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Queso Añejo Premium' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onGuardar).toHaveBeenCalledTimes(1);
    const datos = onGuardar.mock.calls[0]![0] as DatosProductoFormulario;
    expect(datos.tipo).toBe('edicion');
    expect(datos.nombre).toBe('Queso Añejo Premium');
    expect(datos).not.toHaveProperty('precioVentaCents');
    expect(datos).not.toHaveProperty('modoPrecio');
    expect(datos).not.toHaveProperty('modoStock');
  });

  it('edición: no exige precio para guardar (sin el campo, no puede fallar su validación)', () => {
    const { onGuardar } = renderizar({ producto: productoDe({ id: 'p1' }) });

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.queryByText('Ingresá el precio de venta.')).toBeNull();
    expect(onGuardar).toHaveBeenCalledTimes(1);
  });
});

describe('ModalProducto - picker de categoría con creación inline (UI-5b, docs/06-ui-ux.md §2)', () => {
  it('el select incluye la opción "+ Nueva categoría…" al final', () => {
    renderizar();

    const select = screen.getByLabelText('Categoría') as HTMLSelectElement;
    const etiquetas = Array.from(select.options).map((o) => o.text);
    expect(etiquetas[etiquetas.length - 1]).toBe('+ Nueva categoría…');
  });

  it('elegir "+ Nueva categoría…" muestra el sub-formulario (nombre + Crear/Cancelar), sin tocar la categoría elegida', () => {
    renderizar();

    abrirCreacionInline();

    expect(screen.getByLabelText('Nombre de la nueva categoría')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear' })).toBeTruthy();
    // Hay DOS botones "Cancelar" en el árbol: el del sub-formulario (vuelve
    // al select) y el del propio `Modal` (footer, cierra todo) — acá solo
    // interesa que el del sub-formulario exista.
    expect(screen.getAllByRole('button', { name: 'Cancelar' }).length).toBe(2);
    // El select desaparece mientras se crea (no hay dos formularios a la vez).
    expect(screen.queryByLabelText('Categoría')).toBeNull();
  });

  it('"Cancelar" (del sub-formulario, no el del modal) vuelve al select sin crear nada', () => {
    renderizar();

    abrirCreacionInline();
    fireEvent.change(screen.getByLabelText('Nombre de la nueva categoría'), { target: { value: 'Especias' } });
    // El del sub-formulario es el primero en el DOM (`children` del `Modal`
    // se renderiza antes que sus `acciones` de footer — ver `Modal.tsx`).
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]!);

    expect(screen.getByLabelText('Categoría')).toBeTruthy();
    expect(mocks.crearCategoria).not.toHaveBeenCalled();
  });

  it('éxito: crea la categoría, la deja SELECCIONADA por nombre y vuelve al select', async () => {
    mocks.crearCategoria.mockResolvedValue({ categoriaId: 'c9' });
    renderizar();

    abrirCreacionInline();
    fireEvent.change(screen.getByLabelText('Nombre de la nueva categoría'), { target: { value: 'Especias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    await waitFor(() => expect(screen.getByLabelText('Categoría')).toBeTruthy());
    expect(mocks.crearCategoria).toHaveBeenCalledTimes(1);
    expect(mocks.crearCategoria.mock.calls[0]![1]).toBe('Especias');
    const select = screen.getByLabelText('Categoría') as HTMLSelectElement;
    expect(select.value).toBe('Especias');
    expect(await screen.findByText('Categoría creada.')).toBeTruthy();
  });

  it('duplicada: muestra el mensaje de CategoriaDuplicadaError inline y NO vuelve al select', async () => {
    const { CategoriaDuplicadaError } = await import('@gestion/firebase-kit');
    mocks.crearCategoria.mockRejectedValue(new CategoriaDuplicadaError('Ya existe una categoría llamada "Quesos".'));
    renderizar();

    abrirCreacionInline();
    fireEvent.change(screen.getByLabelText('Nombre de la nueva categoría'), { target: { value: 'Quesos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('Ya existe una categoría llamada "Quesos".')).toBeTruthy();
    // Sigue en modo creación (no se perdió lo tipeado ni volvió al select).
    expect(screen.getByLabelText('Nombre de la nueva categoría')).toBeTruthy();
  });

  it('nombre vacío: error inline sin llamar a crearCategoria', () => {
    renderizar();

    abrirCreacionInline();
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(screen.getByText('Ingresá el nombre de la categoría.')).toBeTruthy();
    expect(mocks.crearCategoria).not.toHaveBeenCalled();
  });

  it('offline: no espera el ack, selecciona el nombre optimistamente y avisa que falta sincronizar', async () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.crearCategoria.mockResolvedValue({ categoriaId: 'c9' });
    renderizar();

    abrirCreacionInline();
    fireEvent.change(screen.getByLabelText('Nombre de la nueva categoría'), { target: { value: 'Especias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    // Sincrónico: vuelve al select en el mismo tick, sin esperar el ack.
    const select = screen.getByLabelText('Categoría') as HTMLSelectElement;
    expect(select.value).toBe('Especias');
    expect(mocks.crearCategoria).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
  });

  it('offline: si la sincronización tardía falla, avisa con un toast de error (no cuelga la UI)', async () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.crearCategoria.mockRejectedValue(new Error('rechazada al reconectar'));
    renderizar();

    abrirCreacionInline();
    fireEvent.change(screen.getByLabelText('Nombre de la nueva categoría'), { target: { value: 'Especias' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(await screen.findByText('No se pudo sincronizar la categoría creada.')).toBeTruthy();
  });

  it('"Gestionar categorías" navega a /ajustes/categorias y cierra el modal', () => {
    const { onCerrar } = renderizar();

    const link = screen.getByRole('link', { name: 'Gestionar categorías' });
    expect(link.getAttribute('href')).toBe('/ajustes/categorias');

    fireEvent.click(link);

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});
