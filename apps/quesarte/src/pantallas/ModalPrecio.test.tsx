import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProveedorTema } from '@gestion/ui';
import { money, peso, type Compra, type Producto } from '@gestion/core';
import { ModalPrecio, type DatosPrecioFormulario, type ModalPrecioProps } from './ModalPrecio';

const mocks = vi.hoisted(() => ({ useCollection: vi.fn(), useOnlineStatus: vi.fn(() => true) }));

// Mismo criterio que `ModalDesgloseCosto.test.tsx` (comparte el hook
// `useDesgloseUltimaCompra`, COSTO-2): `firebase/firestore` y `../firebase`
// van SIN mockear, solo `useCollection`/`useOnlineStatus`.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return { ...actual, useCollection: mocks.useCollection, useOnlineStatus: mocks.useOnlineStatus };
});

interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoCompras: EstadoColeccionFalso<Compra> = { datos: [], cargando: false, error: null };

mocks.useCollection.mockImplementation((query: unknown) =>
  query === null ? { datos: [], cargando: false, error: null } : estadoCompras,
);

function configurarCompras(overrides: { datos?: Compra[]; cargando?: boolean; error?: unknown } = {}) {
  estadoCompras = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
}

function compraDe(over: Partial<Compra> & Pick<Compra, 'id'>): Compra {
  return {
    fecha: new Date(2026, 6, 1),
    usuarioId: 'admin-1',
    estado: 'confirmada',
    proveedorNombre: 'Proveedor',
    items: [],
    gastos: [],
    totalFacturaCents: money(0),
    totalGastosCents: money(0),
    totalRealCents: money(0),
    ...over,
  };
}

function productoDe(over: Partial<Producto> & Pick<Producto, 'id'>): Producto {
  return {
    nombre: 'Queso Añejo',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    modoStock: 'fraccionado_por_pieza',
    precioVentaCents: money(50000),
    costoPromedioCents: money(30000),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function renderizar(overrides: Partial<ModalPrecioProps> = {}) {
  const onGuardar = vi.fn();
  const onCerrar = vi.fn();
  const props: ModalPrecioProps = {
    abierto: true,
    producto: productoDe({ id: 'p1' }),
    guardando: false,
    onGuardar,
    onCerrar,
    ...overrides,
  };
  const resultado = render(
    <ProveedorTema>
      <ModalPrecio {...props} />
    </ProveedorTema>,
  );
  /** Re-renderiza la MISMA instancia con props nuevas — necesario para
   * reproducir en tests la secuencia real "abrir A → cerrar → abrir B"
   * sobre la instancia estable de `ModalPrecio` (nunca se desmonta, ver su
   * JSDoc), en vez de montar una instancia nueva por test. */
  function actualizar(nuevos: Partial<ModalPrecioProps>) {
    Object.assign(props, nuevos);
    resultado.rerender(
      <ProveedorTema>
        <ModalPrecio {...props} />
      </ProveedorTema>,
    );
  }
  return { onGuardar, onCerrar, actualizar };
}

describe('ModalPrecio', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
    estadoCompras = { datos: [], cargando: false, error: null };
  });

  it('título incluye el nombre del producto', () => {
    renderizar({ producto: productoDe({ id: 'p1', nombre: 'Queso Colonia' }) });
    expect(screen.getByText('Editar precio · Queso Colonia')).toBeTruthy();
  });

  it('precarga el precio actual y muestra el costo con su unidad', () => {
    renderizar({
      producto: productoDe({ id: 'p1', modoPrecio: 'por_kg', precioVentaCents: money(89900), costoPromedioCents: money(50000) }),
    });

    expect((screen.getByLabelText('Precio de venta por kg') as HTMLInputElement).value).toBe('899,00');
    expect(screen.getByText('Costo promedio: $ 500,00 por kg')).toBeTruthy();
  });

  it('sin costo cargado: muestra la nota y no calcula margen actual', () => {
    renderizar({ producto: productoDe({ id: 'p1', costoPromedioCents: money(0) }) });

    expect(
      screen.getByText('Sin costo cargado aún: no se puede calcular margen para este producto.'),
    ).toBeTruthy();
    expect(screen.queryByText(/Margen actual:/)).toBeNull();
  });

  it('editar el precio recalcula el margen actual y el markup EN VIVO', () => {
    renderizar({ producto: productoDe({ id: 'p1', costoPromedioCents: money(30000), precioVentaCents: money(50000) }) });

    // costo $300, precio $500 → margen 40 %, markup 66,67 %
    expect(screen.getByText('40,00 %')).toBeTruthy();
    expect(screen.getByText('66,67 %')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Precio de venta por kg'), { target: { value: '400,00' } });

    // costo $300, precio $400 → margen 25 %, markup 33,33 %
    expect(screen.getByText('25,00 %')).toBeTruthy();
    expect(screen.getByText('33,33 %')).toBeTruthy();
  });

  it('cargar el margen objetivo muestra el precio sugerido con redondeo comercial ($5) y el margen efectivo YA redondeado', () => {
    // costo $100: precioDesdeMargen(10000, 2500) = 13333,33 → 13333;
    // redondeo a $5 (multiplo 500) → 13500; margen efectivo (135-100)/135 = 25,93 %.
    renderizar({ producto: productoDe({ id: 'p1', costoPromedioCents: money(10000), precioVentaCents: money(12000) }) });

    fireEvent.change(screen.getByLabelText('Margen objetivo (%)'), { target: { value: '25' } });

    expect(screen.getByText('$ 135,00')).toBeTruthy();
    expect(screen.getByText(/Margen efectivo con ese precio:/).textContent).toContain('25,93 %');
  });

  it('"Aplicar al precio" copia el precio sugerido al campo de precio (edición local, no guarda todavía)', () => {
    const { onGuardar } = renderizar({
      producto: productoDe({ id: 'p1', costoPromedioCents: money(10000), precioVentaCents: money(12000) }),
    });

    fireEvent.change(screen.getByLabelText('Margen objetivo (%)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar al precio' }));

    expect((screen.getByLabelText('Precio de venta por kg') as HTMLInputElement).value).toBe('135,00');
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('guarda con el precio y el margen objetivo (bps) tras aplicar el sugerido', () => {
    const { onGuardar } = renderizar({
      producto: productoDe({ id: 'p1', costoPromedioCents: money(10000), precioVentaCents: money(12000) }),
    });

    fireEvent.change(screen.getByLabelText('Margen objetivo (%)'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar al precio' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onGuardar).toHaveBeenCalledTimes(1);
    const [datos] = onGuardar.mock.calls[0] as [DatosPrecioFormulario];
    expect(datos.precioVentaCents).toBe(money(13500));
    expect(datos.margenObjetivoBps).toBe(2500);
  });

  it('margen objetivo vacío: guarda margenObjetivoBps undefined (borra el campo)', () => {
    const { onGuardar } = renderizar({
      producto: productoDe({ id: 'p1', margenObjetivoBps: 4000, precioVentaCents: money(50000) }),
    });

    fireEvent.change(screen.getByLabelText('Margen objetivo (%)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onGuardar).toHaveBeenCalledTimes(1);
    const [datos] = onGuardar.mock.calls[0] as [DatosPrecioFormulario];
    expect(datos.margenObjetivoBps).toBeUndefined();
  });

  it('precarga el margen objetivo existente formateado', () => {
    renderizar({ producto: productoDe({ id: 'p1', margenObjetivoBps: 3333 }) });
    expect((screen.getByLabelText('Margen objetivo (%)') as HTMLInputElement).value).toBe('33,33');
  });

  it('valida precio requerido y no llama a onGuardar', () => {
    const { onGuardar } = renderizar();

    fireEvent.change(screen.getByLabelText('Precio de venta por kg'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('Ingresá el precio de venta.')).toBeTruthy();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('valida el margen objetivo inválido (texto no numérico) y no llama a onGuardar', () => {
    const { onGuardar } = renderizar();

    fireEvent.change(screen.getByLabelText('Margen objetivo (%)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('Ingresá un porcentaje válido, ej: 40 o 33,33.')).toBeTruthy();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('valida el margen objetivo >= 100 % y no llama a onGuardar', () => {
    const { onGuardar } = renderizar();

    fireEvent.change(screen.getByLabelText('Margen objetivo (%)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(screen.getByText('El margen objetivo debe ser menor a 100 %.')).toBeTruthy();
    expect(onGuardar).not.toHaveBeenCalled();
  });

  it('guardando: deshabilita Cancelar y Guardar', () => {
    renderizar({ guardando: true });
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Guardando…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('cerrado: no revienta con producto null (instancia estable)', () => {
    expect(() => renderizar({ abierto: false, producto: null })).not.toThrow();
  });

  describe('M2 (review Fase 2): pieza_entera/fraccionado_por_pieza con modoPrecio "por_unidad"', () => {
    function productoPiezaPorUnidad(over: Partial<Producto> = {}): Producto {
      return productoDe({
        id: 'p1',
        nombre: 'Salame tandilero',
        modoStock: 'pieza_entera',
        modoPrecio: 'por_unidad',
        costoPromedioCents: money(30000), // $300/kg (compras SIEMPRE acumulan pieza en $/kg)
        precioVentaCents: money(50000), // $500/unidad — precio fijo
        ...over,
      });
    }

    it('rotula el costo "/kg" (la unidad la da el modoStock, no el modoPrecio) y el precio "por unidad"', () => {
      renderizar({ producto: productoPiezaPorUnidad() });

      expect(screen.getByText('Costo promedio: $ 300,00 por kg')).toBeTruthy();
      expect(screen.getByLabelText('Precio de venta por unidad')).toBeTruthy();
    });

    it('el margen actual es "—", no un número sin sentido (kg vs. unidad)', () => {
      renderizar({ producto: productoPiezaPorUnidad() });

      expect(screen.getByText('Margen actual: —')).toBeTruthy();
      expect(screen.queryByText(/Markup:/)).toBeNull();
    });

    it('el editor de margen objetivo queda deshabilitado con una nota explicando por qué', () => {
      renderizar({ producto: productoPiezaPorUnidad() });

      const input = screen.getByLabelText('Margen objetivo (%)') as HTMLInputElement;
      expect(input.disabled).toBe(true);
      expect(
        screen.getByText('Costo por kg y precio por unidad no son comparables sin el peso de la pieza.'),
      ).toBeTruthy();
    });

    it('cargar un margen objetivo (aunque el input esté deshabilitado) no muestra precio sugerido', () => {
      renderizar({ producto: productoPiezaPorUnidad({ margenObjetivoBps: 4000 }) });

      // precargado desde el producto, pero no hay bloque de "Precio sugerido"
      // porque el costo y el precio no son comparables (M2).
      expect(screen.queryByText(/Precio sugerido:/)).toBeNull();
      expect(screen.queryByRole('button', { name: 'Aplicar al precio' })).toBeNull();
    });

    it('guardar sigue funcionando: persiste el precio tipeado (el margen objetivo no se toca, el campo está deshabilitado)', () => {
      const { onGuardar } = renderizar({ producto: productoPiezaPorUnidad() });

      fireEvent.change(screen.getByLabelText('Precio de venta por unidad'), { target: { value: '550,00' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(onGuardar).toHaveBeenCalledTimes(1);
      const [datos] = onGuardar.mock.calls[0] as [DatosPrecioFormulario];
      expect(datos.precioVentaCents).toBe(money(55000));
    });

    it('control: fraccionado_por_pieza/pieza_entera con modoPrecio "por_kg" sigue calculando margen normal (no se rompió el caso previo a M2)', () => {
      renderizar({
        producto: productoDe({
          id: 'p1',
          modoStock: 'pieza_entera',
          modoPrecio: 'por_kg',
          costoPromedioCents: money(30000),
          precioVentaCents: money(50000),
        }),
      });

      expect(screen.getByText('Costo promedio: $ 300,00 por kg')).toBeTruthy();
      expect(screen.getByText('40,00 %')).toBeTruthy(); // margen actual
      const input = screen.getByLabelText('Margen objetivo (%)') as HTMLInputElement;
      expect(input.disabled).toBe(false);
    });
  });

  describe('COSTO-2 (parte 1): línea inline "Última compra"', () => {
    it('ítem al peso (/kg): fecha, proveedor, mercadería y gastos normalizados, sufijo /kg', () => {
      configurarCompras({
        datos: [
          compraDe({
            id: 'c1',
            fecha: new Date(2026, 5, 15),
            proveedorNombre: 'Lácteos del Sur',
            items: [
              {
                productoId: 'p1',
                nombreProducto: 'Queso Añejo',
                gramos: peso(1500),
                costoFacturaCents: money(30000),
                gastoProrrateadoCents: money(3000),
                costoRealCents: money(33000),
                costoRealKgCents: money(22000),
              },
            ],
          }),
        ],
      });
      renderizar({ producto: productoDe({ id: 'p1', modoStock: 'granel' }) });

      expect(
        screen.getByText(
          'Última compra (15/06/2026 · Lácteos del Sur): mercadería $ 200,00 · gastos $ 20,00 /kg',
        ),
      ).toBeTruthy();
    });

    it('ítem por unidad (/u): mercadería y gastos normalizados, sufijo /u', () => {
      configurarCompras({
        datos: [
          compraDe({
            id: 'c1',
            fecha: new Date(2026, 5, 20),
            proveedorNombre: 'Apiario Norte',
            items: [
              {
                productoId: 'p2',
                nombreProducto: 'Miel 500g',
                unidades: 4,
                costoFacturaCents: money(40000),
                gastoProrrateadoCents: money(4000),
                costoRealCents: money(44000),
              },
            ],
          }),
        ],
      });
      renderizar({
        producto: productoDe({ id: 'p2', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' }),
      });

      expect(
        screen.getByText('Última compra (20/06/2026 · Apiario Norte): mercadería $ 100,00 · gastos $ 10,00 /u'),
      ).toBeTruthy();
    });

    it('sin compra confirmada que incluya el producto: la línea NO aparece (nada de estados vacíos)', () => {
      configurarCompras({ datos: [] });
      renderizar({ producto: productoDe({ id: 'p1' }) });

      expect(screen.queryByText(/Última compra/)).toBeNull();
    });

    it('un producto sin costo tampoco muestra la línea, aunque haya compras confirmadas de otros productos', () => {
      configurarCompras({
        datos: [
          compraDe({
            id: 'c1',
            items: [{ productoId: 'p1', nombreProducto: 'Queso Añejo', costoFacturaCents: money(1000) }],
          }),
        ],
      });
      renderizar({ producto: productoDe({ id: 'p1', costoPromedioCents: money(0) }) });

      // Sin costo, la búsqueda ni siquiera importa acá: el contrato pide que
      // no aparezca ruido — y de hecho el producto de la compra no matchea.
      expect(screen.queryByText(/Última compra/)).toBeNull();
    });

    it('con el modal cerrado, la query de compras queda desactivada (sin suscripción activa)', () => {
      configurarCompras({ datos: [] });
      renderizar({ abierto: false, producto: null });

      for (const llamada of mocks.useCollection.mock.calls) {
        expect(llamada[0]).toBeNull();
      }
    });
  });
});
