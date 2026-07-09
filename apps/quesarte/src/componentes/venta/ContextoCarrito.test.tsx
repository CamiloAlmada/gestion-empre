import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, type Producto } from '@gestion/core';
import { ProveedorCarrito, useCarrito } from './ContextoCarrito';
import { crearItemUnidad } from './itemsCarrito';

afterEach(() => cleanup());

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
  const { items, agregar, quitar, vaciar, proximaClave } = useCarrito();
  return (
    <div>
      <p data-testid="cantidad">{items.length}</p>
      <ul>
        {items.map((item) => (
          <li key={item.clave}>{item.clave}</li>
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
      <button type="button" onClick={vaciar}>
        Vaciar
      </button>
    </div>
  );
}

function renderizar() {
  return render(
    <ProveedorCarrito>
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
    expect(screen.getByText('item-0')).toBeTruthy();
    expect(screen.getByText('item-1')).toBeTruthy();
  });

  it('quitar elimina solo el ítem indicado', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quitar primero' }));

    expect(screen.getByTestId('cantidad').textContent).toBe('1');
    expect(screen.queryByText('item-0')).toBeNull();
    expect(screen.getByText('item-1')).toBeTruthy();
  });

  it('vaciar deja el carrito en cero', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vaciar' }));

    expect(screen.getByTestId('cantidad').textContent).toBe('0');
  });

  it('desmontar el proveedor y montar uno nuevo arranca en cero (no persiste, ver comentario en ContextoCarrito.tsx)', () => {
    function Envoltorio({ montado }: { montado: boolean }) {
      return montado ? (
        <ProveedorCarrito>
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

    rerender(<Envoltorio montado={true} />);
    expect(screen.getByTestId('cantidad').textContent).toBe('0');
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
