import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, type Producto } from '@gestion/core';
import type { ClienteVenta } from '@gestion/firebase-kit';
import { ProveedorCarrito, useCarrito } from './ContextoCarrito';
import { esCarritoPersistidoValido, type CarritoPersistido } from './carritoPersistido';
import { crearItemUnidad } from './itemsCarrito';

const clienteMarta: ClienteVenta = { id: 'c1', nombre: 'Marta', esPrimeraCompra: false };

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

/** Lee y valida lo que el proveedor dejó en `localStorage` para `usuarioId`.
 * `null` = no escribió nada (o escribió basura, que para el caso es lo
 * mismo: no se podría rehidratar). */
function leerStorage(usuarioId: string): CarritoPersistido | null {
  const crudo = window.localStorage.getItem(`carrito:${usuarioId}`);
  if (crudo === null) return null;
  const datos: unknown = JSON.parse(crudo);
  return esCarritoPersistidoValido(datos) ? datos : null;
}

function sembrarStorage(usuarioId: string, payload: CarritoPersistido) {
  window.localStorage.setItem(`carrito:${usuarioId}`, JSON.stringify(payload));
}

const mielFrasco: Producto = {
  id: 'p4',
  nombre: 'Miel 500g',
  categoria: 'Miel',
  modoStock: 'unidad_simple',
  modoPrecio: 'por_unidad',
  precioVentaCents: money(45000),
  costoPromedioCents: money(20000),
  activo: true,
  actualizadoEn: new Date('2026-01-01'),
  stockUnidades: 5,
};

/** Consumidor mínimo del contexto, sin depender de `Venta` ni de Firestore:
 * agrega un ítem de `mielFrasco` por click, expone cantidad/claves y permite
 * quitar/vaciar. */
function VisorCarrito() {
  const {
    items,
    agregar,
    quitar,
    vaciar,
    actualizar,
    proximaClave,
    cliente,
    seleccionarCliente,
    quitarCliente,
    pendiente,
    hidratar,
  } = useCarrito();
  return (
    <div>
      <p data-testid="cantidad">{items.length}</p>
      <p data-testid="pendiente">{pendiente === null ? 'sin pendiente' : String(pendiente.items.length)}</p>
      {/* Hace de `Venta.tsx`: instala un carrito ya reconciliado (acá, vacío
          — la reconciliación real se prueba en carritoPersistido.test.ts) y
          restaura el contador de claves del payload. */}
      <button
        type="button"
        onClick={() => hidratar({ items: [], cliente: null, proximaClave: pendiente?.proximaClave ?? 0 })}
      >
        Hidratar
      </button>
      <p data-testid="cliente">{cliente === null ? 'Sin cliente' : cliente.nombre}</p>
      <button type="button" onClick={() => seleccionarCliente(clienteMarta)}>
        Elegir a Marta
      </button>
      <button type="button" onClick={quitarCliente}>
        Quitar cliente
      </button>
      <ul>
        {items.map((item) => (
          <li key={item.clave}>
            {item.clave}: {item.unidades}
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => agregar(crearItemUnidad(mielFrasco, 1, proximaClave()))}>
        Agregar
      </button>
      {items.length > 0 && (
        <button type="button" onClick={() => quitar(items[0]!.clave)}>
          Quitar primero
        </button>
      )}
      <button
        type="button"
        onClick={() => actualizar((actual) => actual.map((item) => crearItemUnidad(mielFrasco, 9, item.clave)))}
      >
        Actualizar todos a 9
      </button>
      {/*
       * Dos llamadas a `actualizar` en el MISMO handler, cada una calculando
       * sobre el `items` que RECIBE (no sobre el `items` cerrado del render):
       * si `actualizar` alguna vez volviera a aceptar una lista ya calculada
       * en vez de un actualizador funcional, esto perdería la primera suma
       * (lost update) — ver el test de abajo.
       */}
      <button
        type="button"
        onClick={() => {
          actualizar((actual) => actual.map((item) => crearItemUnidad(mielFrasco, (item.unidades ?? 0) + 1, item.clave)));
          actualizar((actual) => actual.map((item) => crearItemUnidad(mielFrasco, (item.unidades ?? 0) + 1, item.clave)));
        }}
      >
        Sumar 1 dos veces en el mismo handler
      </button>
      <button type="button" onClick={vaciar}>
        Vaciar
      </button>
    </div>
  );
}

function renderizar(usuarioId = 'u1') {
  return render(
    <ProveedorCarrito usuarioId={usuarioId}>
      <VisorCarrito />
    </ProveedorCarrito>,
  );
}

describe('useCarrito / ProveedorCarrito', () => {
  it('arranca vacío', () => {
    renderizar();
    expect(screen.getByTestId('cantidad').textContent).toBe('0');
  });

  it('agregar suma un ítem con clave única', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(screen.getByTestId('cantidad').textContent).toBe('2');
    expect(screen.getByText('item-0: 1')).toBeTruthy();
    expect(screen.getByText('item-1: 1')).toBeTruthy();
  });

  it('quitar elimina solo el ítem indicado', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar primero' }));

    expect(screen.getByTestId('cantidad').textContent).toBe('1');
    expect(screen.queryByText('item-0: 1')).toBeNull();
    expect(screen.getByText('item-1: 1')).toBeTruthy();
  });

  it('actualizar reemplaza la lista completa de ítems (edición desde el carrito)', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Actualizar todos a 9' }));

    expect(screen.getByTestId('cantidad').textContent).toBe('2');
    expect(screen.getByText('item-0: 9')).toBeTruthy();
    expect(screen.getByText('item-1: 9')).toBeTruthy();
  });

  it('actualizar es un actualizador funcional: dos llamadas en el mismo handler NO se pisan (sin lost update)', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' })); // item-0: 1

    fireEvent.click(screen.getByRole('button', { name: 'Sumar 1 dos veces en el mismo handler' }));

    // Si `actualizar` calculara sobre una lista capturada en el render (no
    // funcional), las dos llamadas partirían del mismo `items` viejo
    // (unidades: 1) y el resultado quedaría en 2, no en 3.
    expect(screen.getByText('item-0: 3')).toBeTruthy();
  });

  it('vaciar deja el carrito en cero', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vaciar' }));

    expect(screen.getByTestId('cantidad').textContent).toBe('0');
  });

  it('arranca sin cliente asociado (venta anónima por defecto)', () => {
    renderizar();
    expect(screen.getByTestId('cliente').textContent).toBe('Sin cliente');
  });

  it('seleccionarCliente asocia el cliente elegido', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir a Marta' }));

    expect(screen.getByTestId('cliente').textContent).toBe('Marta');
  });

  it('quitarCliente vuelve la venta a anónima', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Elegir a Marta' }));
    expect(screen.getByTestId('cliente').textContent).toBe('Marta');

    fireEvent.click(screen.getByRole('button', { name: 'Quitar cliente' }));
    expect(screen.getByTestId('cliente').textContent).toBe('Sin cliente');
  });

  it('vaciar también limpia el cliente asociado (docs/07-clientes-proveedores.md §POS)', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Elegir a Marta' }));
    expect(screen.getByTestId('cliente').textContent).toBe('Marta');

    fireEvent.click(screen.getByRole('button', { name: 'Vaciar' }));

    expect(screen.getByTestId('cantidad').textContent).toBe('0');
    expect(screen.getByTestId('cliente').textContent).toBe('Sin cliente');
  });

  it('desmontar y volver a montar deja el carrito PENDIENTE de reconciliar, no aplicado (2026-09-01)', () => {
    function Envoltorio({ montado }: { montado: boolean }) {
      return montado ? (
        <ProveedorCarrito usuarioId="u1">
          <VisorCarrito />
        </ProveedorCarrito>
      ) : (
        <p>Sin sesión</p>
      );
    }

    const { rerender } = render(<Envoltorio montado={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByTestId('cantidad').textContent).toBe('1');

    rerender(<Envoltorio montado={false} />);
    expect(screen.getByText('Sin sesión')).toBeTruthy();

    // El proveedor nuevo NO instala el carrito viejo por su cuenta: lo deja
    // en `pendiente` para que `Venta.tsx` lo reconcilie contra las
    // colecciones vivas. En pantalla, hasta entonces, el carrito está vacío.
    rerender(<Envoltorio montado={true} />);
    expect(screen.getByTestId('cantidad').textContent).toBe('0');
    expect(screen.getByTestId('pendiente').textContent).toBe('1');
  });

  it('useCarrito fuera de ProveedorCarrito tira un error explícito', () => {
    function ConsumidorSuelto() {
      useCarrito();
      return null;
    }
    expect(() => render(<ConsumidorSuelto />)).toThrow(
      'useCarrito debe usarse dentro de un <ProveedorCarrito> (ver Shell.tsx).',
    );
  });
});

/**
 * Persistencia en `localStorage` (docs/06-ui-ux.md §6, 2026-09-01). Acá se
 * prueba la MECÁNICA del proveedor (qué lee, cuándo escribe, bajo qué clave);
 * la reconciliación contra las colecciones vivas es de
 * `carritoPersistido.test.ts`, y el cableado de las dos cosas, de
 * `Venta.test.tsx`.
 */
describe('ProveedorCarrito - persistencia', () => {
  const guardado: CarritoPersistido = {
    v: 1,
    items: [{ clave: 'item-6', productoId: 'p4', unidades: 2, precioUnitCents: 45000 }],
    cliente: null,
    proximaClave: 7,
  };

  it('sin nada guardado no queda pendiente y escribe desde el arranque', () => {
    renderizar();

    expect(screen.getByTestId('pendiente').textContent).toBe('sin pendiente');
    expect(leerStorage('u1')).toEqual({ v: 1, items: [], cliente: null, proximaClave: 0 });
  });

  it('escribe en cada cambio de ítems y de cliente (write-through, sin debounce)', () => {
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(leerStorage('u1')).toEqual({
      v: 1,
      items: [{ clave: 'item-0', productoId: 'p4', unidades: 1, precioUnitCents: 45000 }],
      cliente: null,
      proximaClave: 1,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Elegir a Marta' }));
    expect(leerStorage('u1')?.cliente).toEqual(clienteMarta);

    fireEvent.click(screen.getByRole('button', { name: 'Vaciar' }));
    expect(leerStorage('u1')).toEqual({ v: 1, items: [], cliente: null, proximaClave: 1 });
  });

  it('NO escribe mientras haya un carrito pendiente: el [] inicial no pisa lo guardado', () => {
    sembrarStorage('u1', guardado);
    renderizar();

    expect(screen.getByTestId('pendiente').textContent).toBe('1');
    // Ni el montaje…
    expect(leerStorage('u1')).toEqual(guardado);

    // …ni un cambio hecho antes de reconciliar (p. ej. el usuario cayó en
    // otra pantalla y algo mutó el carrito) tocan lo guardado.
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(leerStorage('u1')).toEqual(guardado);
  });

  it('después de hidratar vuelve a escribir', () => {
    sembrarStorage('u1', guardado);
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Hidratar' }));

    expect(screen.getByTestId('pendiente').textContent).toBe('sin pendiente');
    expect(leerStorage('u1')).toEqual({ v: 1, items: [], cliente: null, proximaClave: 7 });

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(leerStorage('u1')?.items).toHaveLength(1);
  });

  it('restaura proximaClave: las claves nuevas no chocan con las rehidratadas', () => {
    sembrarStorage('u1', guardado);
    renderizar();

    fireEvent.click(screen.getByRole('button', { name: 'Hidratar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    // Sin restaurar el contador, esto sería `item-0` y podría colisionar con
    // una clave ya en uso.
    expect(screen.getByText('item-7: 1')).toBeTruthy();
  });

  it('aísla el carrito por usuario (clave `carrito:{uid}`)', () => {
    const { unmount } = renderizar('u1');
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(leerStorage('u1')?.items).toHaveLength(1);
    expect(window.localStorage.getItem('carrito:u2')).toBeNull();
    unmount();

    // Otro vendedor en el mismo dispositivo: arranca limpio y no pisa el
    // carrito del primero (que NO se limpia al desloguear, pedido del dueño).
    renderizar('u2');
    expect(screen.getByTestId('pendiente').textContent).toBe('sin pendiente');
    expect(leerStorage('u2')?.items).toHaveLength(0);
    expect(leerStorage('u1')?.items).toHaveLength(1);
  });

  it('con usuarioId vacío no persiste nada (defensivo: RutaProtegida garantiza perfil)', () => {
    renderizar('');

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(screen.getByTestId('cantidad').textContent).toBe('1');
    expect(window.localStorage.getItem('carrito:')).toBeNull();
  });

  it.each([
    ['JSON roto', '{no soy json'],
    ['una versión desconocida', JSON.stringify({ ...guardado, v: 2 })],
    ['un shape inválido', JSON.stringify({ v: 1, items: 'nope', cliente: null, proximaClave: 0 })],
    ['claves de más', JSON.stringify({ ...guardado, extra: 1 })],
  ])('ignora %s: arranca como si no hubiera carrito guardado', (_nombre, crudo) => {
    window.localStorage.setItem('carrito:u1', crudo);
    renderizar();

    expect(screen.getByTestId('pendiente').textContent).toBe('sin pendiente');
    // Y como no hay nada que reconciliar, escribe de una: el dato corrupto se
    // reemplaza en vez de quedar ahí para siempre.
    expect(leerStorage('u1')).toEqual({ v: 1, items: [], cliente: null, proximaClave: 0 });
  });

  it('un localStorage que LANZA al escribir no rompe la venta (modo privado, cuota)', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => renderizar()).not.toThrow();
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))).not.toThrow();

    // El carrito sigue funcionando en memoria: solo se perdió la protección
    // contra recargas.
    expect(screen.getByTestId('cantidad').textContent).toBe('1');
    expect(setItem).toHaveBeenCalled();
  });

  it('un localStorage que LANZA al leer arranca sin pendiente, sin romper', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });

    expect(() => renderizar()).not.toThrow();
    expect(screen.getByTestId('pendiente').textContent).toBe('sin pendiente');
    expect(screen.getByTestId('cantidad').textContent).toBe('0');
  });
});
