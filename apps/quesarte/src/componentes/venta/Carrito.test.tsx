import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Producto } from '@gestion/core';
import { Carrito } from './Carrito';
import { crearItemGranel, crearItemUnidad } from './itemsCarrito';

afterEach(cleanup);

function productoDe(over: Partial<Producto> & Pick<Producto, 'id' | 'modoStock' | 'modoPrecio'>): Producto {
  return {
    nombre: 'Producto',
    categoria: 'cat',
    precioVentaCents: money(1000),
    costoPromedioCents: money(500),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

describe('Carrito', () => {
  it('carrito vacío: sin ítems, "Cobrar" deshabilitado', () => {
    render(<Carrito items={[]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0);
    const botonesCobrar = screen.getAllByRole('button', { name: 'Cobrar' });
    for (const boton of botonesCobrar) {
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('muestra los ítems, el detalle y el total (sumarMoney)', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg', precioVentaCents: money(45000) });
    const item = crearItemGranel(producto, peso(300), 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    expect(screen.getAllByText('Producto').length).toBeGreaterThan(0);
    // 45000 * 300 / 1000 = 13500 -> $ 135,00
    expect(screen.getAllByText('$ 135,00').length).toBeGreaterThan(0);

    const botonesCobrar = screen.getAllByRole('button', { name: 'Cobrar' });
    for (const boton of botonesCobrar) {
      expect((boton as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('quitar un ítem llama a onQuitar con su clave, SIN pedir confirmación', () => {
    const onQuitar = vi.fn();
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 2, 'clave-x');

    render(<Carrito items={[item]} onQuitar={onQuitar} onCobrar={vi.fn()} procesando={false} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar Producto del carrito' })[0]!);

    expect(onQuitar).toHaveBeenCalledWith('clave-x');
  });

  it('tocar "Cobrar" llama a onCobrar', () => {
    const onCobrar = vi.fn();
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={onCobrar} procesando={false} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);

    expect(onCobrar).toHaveBeenCalled();
  });

  it('procesando deshabilita "Cobrar" aunque haya ítems', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando />);

    for (const boton of screen.getAllByRole('button', { name: 'Cobrar' })) {
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('el resumen móvil se expande y contrae mostrando el conteo de ítems', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    const resumen = screen.getByRole('button', { name: /1 ítem/ });
    expect(resumen.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(resumen);

    expect(resumen.getAttribute('aria-expanded')).toBe('true');
  });

  it('carrito colapsado: no hay scrim en el DOM', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    expect(screen.queryByTestId('scrim-carrito')).toBeNull();
  });

  it('expandido: el scrim está presente; tocarlo colapsa el carrito', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));
    const scrim = screen.getByTestId('scrim-carrito');
    expect(scrim.getAttribute('aria-hidden')).toBe('true');

    fireEvent.click(scrim);

    const resumen = screen.getByRole('button', { name: /1 ítem/ });
    expect(resumen.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('scrim-carrito')).toBeNull();
  });

  it('la hoja mobile trae los overrides `calido:` de card flotante despegada (docs/06-ui-ux.md §4)', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    const hoja = screen.getByTestId('hoja-carrito-mobil');
    // Mismo inset lateral que la píldora de BarraPestanas (packages/ui), en
    // vez de tocar los bordes del viewport.
    expect(hoja.className).toContain('calido:inset-x-3');
    // Flota con un hueco de 0.75rem por encima de la píldora, en vez de
    // apoyarse directo en ella.
    expect(hoja.className).toContain('calido:bottom-[calc(var(--altura-zona-inferior)+0.75rem)]');
    // Se lee como card flotante propia y completa: esquinas redondeadas en
    // los 4 lados y borde perimetral (sin el `border-b-0` de la vieja "tapa").
    expect(hoja.className).toContain('calido:rounded-card');
    expect(hoja.className).toContain('calido:border');
    expect(hoja.className).toContain('calido:border-borde');
    expect(hoja.className).not.toContain('calido:border-b-0');
    expect(hoja.className).toContain('calido:shadow-flotante');
  });

  it('expandido: keydown Escape colapsa el carrito', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    render(<Carrito items={[item]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

    fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));
    expect(screen.getByTestId('scrim-carrito')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });

    const resumen = screen.getByRole('button', { name: /1 ítem/ });
    expect(resumen.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('scrim-carrito')).toBeNull();
  });

  describe('agarre y arrastre para cerrar (docs/06-ui-ux.md §6)', () => {
    /**
     * jsdom no implementa `matchMedia` (ver MetaThemeColor.test.tsx): mismo
     * doble mínimo, acá solo hace falta leer `matches`.
     */
    function instalarMatchMediaFalso(matches: boolean) {
      vi.stubGlobal(
        'matchMedia',
        vi.fn().mockReturnValue({ matches, media: '(prefers-reduced-motion: reduce)' } as MediaQueryList),
      );
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function itemUnico() {
      const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
      return crearItemUnidad(producto, 1, 'a');
    }

    it('colapsado: no hay agarre en el DOM', () => {
      render(<Carrito items={[itemUnico()]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

      expect(screen.queryByTestId('agarre-carrito')).toBeNull();
    });

    it('expandido: el agarre está presente y es decorativo (aria-hidden)', () => {
      render(<Carrito items={[itemUnico()]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);

      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const agarre = screen.getByTestId('agarre-carrito');
      expect(agarre.getAttribute('aria-hidden')).toBe('true');
    });

    it('arrastre que supera el umbral (>90px) colapsa el carrito', () => {
      instalarMatchMediaFalso(false);
      render(<Carrito items={[itemUnico()]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const agarre = screen.getByTestId('agarre-carrito');
      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 60 });
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 120 });

      const resumen = screen.getByRole('button', { name: /1 ítem/ });
      expect(resumen.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByTestId('scrim-carrito')).toBeNull();
    });

    it('arrastre corto (bajo el umbral) NO colapsa: la hoja sigue expandida', () => {
      instalarMatchMediaFalso(false);
      render(<Carrito items={[itemUnico()]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const agarre = screen.getByTestId('agarre-carrito');
      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 30 });
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 40 });

      const resumen = screen.getByRole('button', { name: /1 ítem/ });
      expect(resumen.getAttribute('aria-expanded')).toBe('true');
    });

    it('arrastre hacia arriba se ignora (clamp a 0): no colapsa', () => {
      instalarMatchMediaFalso(false);
      render(<Carrito items={[itemUnico()]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const agarre = screen.getByTestId('agarre-carrito');
      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 100 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 0 });

      const resumen = screen.getByRole('button', { name: /1 ítem/ });
      expect(resumen.getAttribute('aria-expanded')).toBe('true');
    });

    it('prefers-reduced-motion: el arrastre que supera el umbral igual cierra al soltar', () => {
      instalarMatchMediaFalso(true);
      render(<Carrito items={[itemUnico()]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const agarre = screen.getByTestId('agarre-carrito');
      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 60 });
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 120 });

      const resumen = screen.getByRole('button', { name: /1 ítem/ });
      expect(resumen.getAttribute('aria-expanded')).toBe('false');
    });

    it('pointercancel resetea el arrastre sin colapsar', () => {
      instalarMatchMediaFalso(false);
      render(<Carrito items={[itemUnico()]} onQuitar={vi.fn()} onCobrar={vi.fn()} procesando={false} />);
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const agarre = screen.getByTestId('agarre-carrito');
      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 150 });
      fireEvent.pointerCancel(agarre, { pointerId: 1 });

      const resumen = screen.getByRole('button', { name: /1 ítem/ });
      expect(resumen.getAttribute('aria-expanded')).toBe('true');
    });
  });
});
