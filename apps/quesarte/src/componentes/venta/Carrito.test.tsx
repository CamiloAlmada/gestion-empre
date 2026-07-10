import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Producto } from '@gestion/core';
import { Carrito, type CarritoProps } from './Carrito';
import { crearItemFraccionado, crearItemGranel, crearItemPiezaEntera, crearItemUnidad } from './itemsCarrito';

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

/** Renderiza `Carrito` con callbacks `vi.fn()` de relleno para los props que
 * no le importan a un test puntual — evita repetir las tres callbacks nuevas
 * (stepper, editar al peso, agregar otra pieza) en cada `render()` de este
 * archivo. */
function renderCarrito(props: Partial<CarritoProps> & Pick<CarritoProps, 'items'>) {
  return render(
    <Carrito
      onQuitar={vi.fn()}
      onCobrar={vi.fn()}
      procesando={false}
      onCambiarUnidades={vi.fn()}
      onEditarAlPeso={vi.fn()}
      onAgregarOtraPieza={vi.fn()}
      cliente={null}
      onAbrirCliente={vi.fn()}
      onQuitarCliente={vi.fn()}
      {...props}
    />,
  );
}

describe('Carrito', () => {
  it('carrito vacío: sin ítems, "Cobrar" deshabilitado', () => {
    renderCarrito({ items: [] });

    expect(screen.getAllByText('Todavía no agregaste productos.').length).toBeGreaterThan(0);
    const botonesCobrar = screen.getAllByRole('button', { name: 'Cobrar' });
    for (const boton of botonesCobrar) {
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('muestra los ítems, el detalle y el total (sumarMoney)', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg', precioVentaCents: money(45000) });
    const item = crearItemGranel(producto, peso(300), 'a');

    renderCarrito({ items: [item] });

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

    renderCarrito({ items: [item], onQuitar });

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar Producto del carrito' })[0]!);

    expect(onQuitar).toHaveBeenCalledWith('clave-x');
  });

  it('tocar "Cobrar" llama a onCobrar', () => {
    const onCobrar = vi.fn();
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    renderCarrito({ items: [item], onCobrar });

    fireEvent.click(screen.getAllByRole('button', { name: 'Cobrar' })[0]!);

    expect(onCobrar).toHaveBeenCalled();
  });

  it('procesando deshabilita "Cobrar" aunque haya ítems', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    renderCarrito({ items: [item], procesando: true });

    for (const boton of screen.getAllByRole('button', { name: 'Cobrar' })) {
      expect((boton as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('el resumen móvil se expande y contrae mostrando el conteo de ítems', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    renderCarrito({ items: [item] });

    const resumen = screen.getByRole('button', { name: /1 ítem/ });
    expect(resumen.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(resumen);

    expect(resumen.getAttribute('aria-expanded')).toBe('true');
  });

  it('carrito colapsado: no hay scrim en el DOM', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    renderCarrito({ items: [item] });

    expect(screen.queryByTestId('scrim-carrito')).toBeNull();
  });

  it('expandido: el scrim está presente; tocarlo colapsa el carrito', () => {
    const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
    const item = crearItemUnidad(producto, 1, 'a');

    renderCarrito({ items: [item] });

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

    renderCarrito({ items: [item] });

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

    renderCarrito({ items: [item] });

    fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));
    expect(screen.getByTestId('scrim-carrito')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });

    const resumen = screen.getByRole('button', { name: /1 ítem/ });
    expect(resumen.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('scrim-carrito')).toBeNull();
  });

  describe('carrito editable en el lugar (docs/06-ui-ux.md §6)', () => {
    it('unidad_simple: "+" y "−" llaman a onCambiarUnidades con la clave y el delta', () => {
      const onCambiarUnidades = vi.fn();
      const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 5 });
      const item = crearItemUnidad(producto, 2, 'clave-x');

      renderCarrito({ items: [item], onCambiarUnidades });

      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar una unidad de Producto' })[0]!);
      expect(onCambiarUnidades).toHaveBeenCalledWith('clave-x', 1);

      fireEvent.click(screen.getAllByRole('button', { name: 'Quitar una unidad de Producto' })[0]!);
      expect(onCambiarUnidades).toHaveBeenCalledWith('clave-x', -1);
    });

    it('unidad_simple: "+" se deshabilita al llegar al stock (contando lo ya carriteado)', () => {
      const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 2 });
      const item = crearItemUnidad(producto, 2, 'clave-x');

      renderCarrito({ items: [item] });

      const botonSumar = screen.getAllByRole('button', { name: 'Agregar una unidad de Producto' })[0]! as HTMLButtonElement;
      expect(botonSumar.disabled).toBe(true);
    });

    it('unidad_simple: la cantidad se muestra entre los dos botones del stepper', () => {
      const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad', stockUnidades: 5 });
      const item = crearItemUnidad(producto, 3, 'clave-x');

      renderCarrito({ items: [item] });

      expect(screen.getAllByText('3').length).toBeGreaterThan(0);
    });

    it('fraccionado_por_pieza: tocar la fila (no "Quitar") llama a onEditarAlPeso con el ítem', () => {
      const onEditarAlPeso = vi.fn();
      const producto = productoDe({ id: 'p1', modoStock: 'fraccionado_por_pieza', modoPrecio: 'por_kg' });
      const pieza = {
        id: 'pz1',
        productoId: 'p1',
        pesoInicialGramos: peso(1000),
        pesoRestanteGramos: peso(700),
        costoKgCents: money(500),
        // Con hora explícita (no medianoche UTC) para que `formatearFecha`
        // (usa hora LOCAL) no corra un día para atrás en zonas horarias
        // detrás de UTC — mismo criterio que `piezaDe` en Venta.test.tsx.
        fechaIngreso: new Date('2026-01-01T10:00:00'),
        estado: 'disponible' as const,
      };
      const item = crearItemFraccionado(producto, pieza, peso(300), 'clave-x');

      renderCarrito({ items: [item], onEditarAlPeso });

      // El aria-label incluye el detalle (peso/pieza): el lector de pantalla
      // no pierde esa info al enfocar la fila.
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Editar Producto, 300 g · pieza del 01/01/2026' })[0]!,
      );

      expect(onEditarAlPeso).toHaveBeenCalledWith(item);
    });

    it('granel: tocar la fila llama a onEditarAlPeso; "Quitar" sigue siendo un botón aparte', () => {
      const onEditarAlPeso = vi.fn();
      const onQuitar = vi.fn();
      const producto = productoDe({ id: 'p1', modoStock: 'granel', modoPrecio: 'por_kg' });
      const item = crearItemGranel(producto, peso(300), 'clave-x');

      renderCarrito({ items: [item], onEditarAlPeso, onQuitar });

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar Producto, 300 g' })[0]!);
      expect(onEditarAlPeso).toHaveBeenCalledWith(item);
      expect(onQuitar).not.toHaveBeenCalled();

      fireEvent.click(screen.getAllByRole('button', { name: 'Quitar Producto del carrito' })[0]!);
      expect(onQuitar).toHaveBeenCalledWith('clave-x');
    });

    it('pieza_entera: "+" llama a onAgregarOtraPieza con el ítem; no hay "−"', () => {
      const onAgregarOtraPieza = vi.fn();
      const producto = productoDe({ id: 'p1', modoStock: 'pieza_entera', modoPrecio: 'por_kg' });
      const pieza = {
        id: 'pz1',
        productoId: 'p1',
        pesoInicialGramos: peso(900),
        pesoRestanteGramos: peso(900),
        costoKgCents: money(500),
        fechaIngreso: new Date('2026-01-01'),
        estado: 'disponible' as const,
      };
      const item = crearItemPiezaEntera(producto, pieza, 'clave-x');

      renderCarrito({ items: [item], onAgregarOtraPieza });

      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar otra pieza de Producto' })[0]!);
      expect(onAgregarOtraPieza).toHaveBeenCalledWith(item);
      expect(screen.queryByRole('button', { name: 'Quitar una unidad de Producto' })).toBeNull();
    });
  });

  describe('control "Cliente" (docs/07-clientes-proveedores.md §POS)', () => {
    it('sin cliente: muestra "+ Cliente"; tocarlo llama a onAbrirCliente', () => {
      const onAbrirCliente = vi.fn();
      renderCarrito({ items: [], cliente: null, onAbrirCliente });

      fireEvent.click(screen.getAllByText('+ Cliente')[0]!);
      expect(onAbrirCliente).toHaveBeenCalled();
    });

    it('con cliente: muestra su nombre; "Quitar" lo desasocia SIN pedir confirmación', () => {
      const onQuitarCliente = vi.fn();
      renderCarrito({ items: [], cliente: { nombre: 'Marta' }, onQuitarCliente });

      expect(screen.getAllByText('Cliente: Marta').length).toBeGreaterThan(0);
      expect(screen.queryAllByText('+ Cliente')).toHaveLength(0);

      fireEvent.click(screen.getAllByRole('button', { name: 'Quitar cliente Marta' })[0]!);
      expect(onQuitarCliente).toHaveBeenCalled();
    });

    it('tocar el nombre del cliente reabre el selector (onAbrirCliente), no lo quita', () => {
      const onAbrirCliente = vi.fn();
      const onQuitarCliente = vi.fn();
      renderCarrito({ items: [], cliente: { nombre: 'Marta' }, onAbrirCliente, onQuitarCliente });

      fireEvent.click(screen.getAllByText('Cliente: Marta')[0]!);

      expect(onAbrirCliente).toHaveBeenCalled();
      expect(onQuitarCliente).not.toHaveBeenCalled();
    });

    it('el control "Cliente" NO aparece en la fila de resumen colapsada: colapsado, solo el del panel desktop está en el DOM', () => {
      const item = (() => {
        const producto = productoDe({ id: 'p1', modoStock: 'unidad_simple', modoPrecio: 'por_unidad' });
        return crearItemUnidad(producto, 1, 'a');
      })();

      // Con ítems y la hoja mobile SIN expandir (default): la única "+
      // Cliente" en el DOM es la del <aside> desktop (siempre visible) — la
      // hoja mobile expandida (que también la renderiza) no está montada.
      renderCarrito({ items: [item] });

      expect(screen.getAllByText('+ Cliente')).toHaveLength(1);

      // Al expandir, aparece una segunda (la de la hoja mobile) — prueba que
      // esa es efectivamente la que está gateada por `expandidoMobile`, y
      // confirma a contrario que antes de expandir no estaba en el DOM.
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));
      expect(screen.getAllByText('+ Cliente')).toHaveLength(2);
    });
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
      renderCarrito({ items: [itemUnico()] });

      expect(screen.queryByTestId('agarre-carrito')).toBeNull();
    });

    it('expandido: el agarre está presente y es decorativo (aria-hidden)', () => {
      renderCarrito({ items: [itemUnico()] });

      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const agarre = screen.getByTestId('agarre-carrito');
      expect(agarre.getAttribute('aria-hidden')).toBe('true');
    });

    it('arrastre que supera el umbral (>90px) colapsa el carrito', () => {
      instalarMatchMediaFalso(false);
      renderCarrito({ items: [itemUnico()] });
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
      renderCarrito({ items: [itemUnico()] });
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const agarre = screen.getByTestId('agarre-carrito');
      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 30 });
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 40 });

      const resumen = screen.getByRole('button', { name: /1 ítem/ });
      expect(resumen.getAttribute('aria-expanded')).toBe('true');
    });

    it('la hoja NUNCA recibe transform durante el gesto: lo que cambia es la lista, no la hoja (docs/06-ui-ux.md §6)', () => {
      instalarMatchMediaFalso(false);
      renderCarrito({ items: [itemUnico()] });
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const hoja = screen.getByTestId('hoja-carrito-mobil');
      const agarre = screen.getByTestId('agarre-carrito');

      expect(hoja.style.transform).toBe('');

      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      expect(hoja.style.transform).toBe('');

      // Arrastre corto, bajo el umbral: tampoco hay transform al soltar.
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 40 });
      expect(hoja.style.transform).toBe('');
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 40 });
      expect(hoja.style.transform).toBe('');

      // Arrastre largo, supera el umbral y cierra: tampoco hubo transform en
      // ningún momento del gesto (el cierre lo maneja `aria-expanded`, no
      // CSS). La hoja sigue expandida (el arrastre corto anterior no la
      // cerró), así que no hace falta reabrirla.
      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 120 });
      expect(hoja.style.transform).toBe('');
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 120 });
      expect(hoja.style.transform).toBe('');
    });

    it('durante el arrastre el BLOQUE colapsable (fila Cliente + <ul>) recibe estilo inline de altura, recortado y sin transición — el <ul> NO', () => {
      instalarMatchMediaFalso(false);
      renderCarrito({ items: [itemUnico()] });
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const bloque = screen.getByTestId('bloque-colapsable-carrito');
      const agarre = screen.getByTestId('agarre-carrito');
      const lista = bloque.querySelector('ul');
      if (!lista) throw new Error('no se encontró el <ul> de ítems dentro del bloque colapsable');

      // En reposo, sin estilo inline en ninguno de los dos: el bloque se
      // dimensiona por su contenido y el `<ul>` rige por su clase
      // `max-h-[40vh] overflow-y-auto`.
      expect(bloque.style.height).toBe('');
      expect(lista.style.height).toBe('');

      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 40 });

      // jsdom no hace layout real: `getBoundingClientRect().height` mide 0,
      // así que la altura resultante es `max(0, 0 - 40) = 0`; lo relevante
      // acá es que el estilo inline lo recibe el BLOQUE (wrapper de fila
      // Cliente + `<ul>`), no la hoja ni el `<ul>` directamente.
      expect(bloque.style.height).toBe('0px');
      expect(bloque.style.overflow).toBe('hidden');
      expect(bloque.style.transition).toBe('none');
      expect(lista.style.height).toBe('');
    });

    it('la fila Cliente queda DENTRO del bloque que colapsa: es descendiente del nodo que recibe el height', () => {
      renderCarrito({ items: [itemUnico()] });
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const bloque = screen.getByTestId('bloque-colapsable-carrito');
      // "+ Cliente" de la hoja mobile: la segunda instancia en el DOM (la
      // primera es la del panel desktop, siempre montada — mismo criterio
      // que el test de "control Cliente" de más arriba).
      const botonCliente = screen.getAllByText('+ Cliente')[1]!;

      expect(bloque.contains(botonCliente)).toBe(true);
    });

    it('arrastre real bajo el umbral: al soltar pasa por "volviendo" (con transición) antes de limpiarse', () => {
      instalarMatchMediaFalso(false);
      renderCarrito({ items: [itemUnico()] });
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const bloque = screen.getByTestId('bloque-colapsable-carrito');
      const agarre = screen.getByTestId('agarre-carrito');

      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 40 });
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 40 });

      // Hubo encogimiento real (arrastreY llegó a valer 40 > 0): entra a
      // "volviendo", CON transición activa, antes de que dispare
      // `transitionend` (docs/06-ui-ux.md §6).
      expect(bloque.style.height).toBe('0px');
      expect(bloque.style.overflow).toBe('hidden');
      expect(bloque.style.transition).toBe('height 180ms ease-out');

      // Al terminar la transición (simulada acá; jsdom no la corre de
      // verdad) recién ahí se limpia el estilo inline.
      fireEvent.transitionEnd(bloque, { propertyName: 'height' });
      expect(bloque.style.height).toBe('');
    });

    it('tap seco en el agarre (pointerdown+pointerup sin mover el dedo): el bloque no queda con estilo inline pegado', () => {
      instalarMatchMediaFalso(false);
      renderCarrito({ items: [itemUnico()] });
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const bloque = screen.getByTestId('bloque-colapsable-carrito');
      const agarre = screen.getByTestId('agarre-carrito');

      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 0 });

      // Sin `pointermove` no hubo encogimiento visual que revertir: pasa
      // directo a "ninguna" en vez de quedar en "volviendo" esperando un
      // `transitionend` que nunca va a llegar (la altura no cambió de
      // valor). Si quedara en "volviendo", el `overflow: hidden` pegado le
      // rompería el scroll a la lista (y clavaría la altura del bloque)
      // hasta el próximo drag real.
      expect(bloque.style.height).toBe('');
      expect(bloque.style.overflow).toBe('');

      const resumen = screen.getByRole('button', { name: /1 ítem/ });
      expect(resumen.getAttribute('aria-expanded')).toBe('true');
    });

    it('arrastre hacia arriba se ignora (clamp a 0): no colapsa ni deja estilo inline pegado en el bloque', () => {
      instalarMatchMediaFalso(false);
      renderCarrito({ items: [itemUnico()] });
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const bloque = screen.getByTestId('bloque-colapsable-carrito');
      const agarre = screen.getByTestId('agarre-carrito');

      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 100 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 0 });

      const resumen = screen.getByRole('button', { name: /1 ítem/ });
      expect(resumen.getAttribute('aria-expanded')).toBe('true');

      // `alMoverPuntero` clampea el delta hacia arriba a 0: mismo caso que
      // el tap seco, sin `height` real que animar de vuelta.
      expect(bloque.style.height).toBe('');
      expect(bloque.style.overflow).toBe('');
    });

    it('prefers-reduced-motion: sin estilo inline en el bloque durante el arrastre, pero el cierre por umbral igual funciona', () => {
      instalarMatchMediaFalso(true);
      renderCarrito({ items: [itemUnico()] });
      fireEvent.click(screen.getByRole('button', { name: /1 ítem/ }));

      const hoja = screen.getByTestId('hoja-carrito-mobil');
      const bloque = screen.getByTestId('bloque-colapsable-carrito');
      const agarre = screen.getByTestId('agarre-carrito');

      fireEvent.pointerDown(agarre, { pointerId: 1, clientY: 0 });
      fireEvent.pointerMove(agarre, { pointerId: 1, clientY: 60 });

      // No hay seguimiento visual: ni el bloque ni la hoja reciben estilo inline.
      expect(bloque.style.height).toBe('');
      expect(hoja.style.transform).toBe('');

      fireEvent.pointerUp(agarre, { pointerId: 1, clientY: 120 });

      const resumen = screen.getByRole('button', { name: /1 ítem/ });
      expect(resumen.getAttribute('aria-expanded')).toBe('false');
    });

    it('pointercancel resetea el arrastre sin colapsar', () => {
      instalarMatchMediaFalso(false);
      renderCarrito({ items: [itemUnico()] });
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
