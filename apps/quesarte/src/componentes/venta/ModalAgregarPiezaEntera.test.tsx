import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Pieza, type Producto } from '@gestion/core';
import { ModalAgregarPiezaEntera } from './ModalAgregarPiezaEntera';

afterEach(cleanup);

const producto: Producto = {
  id: 'p1',
  nombre: 'Salame tandilero',
  categoria: 'Embutidos',
  modoPrecio: 'por_kg',
  modoStock: 'pieza_entera',
  precioVentaCents: money(120000),
  costoPromedioCents: money(60000),
  activo: true,
  actualizadoEn: new Date('2026-01-01'),
};

function piezaDe(over: Partial<Pieza> & Pick<Pieza, 'id'>): Pieza {
  return {
    productoId: 'p1',
    pesoInicialGramos: peso(1000),
    pesoRestanteGramos: peso(850),
    costoKgCents: money(60000),
    fechaIngreso: new Date('2026-01-05T10:00:00'),
    estado: 'disponible',
    ...over,
  };
}

describe('ModalAgregarPiezaEntera', () => {
  it('muestra el peso y el precio calculado por el peso de CADA pieza', () => {
    render(
      <ModalAgregarPiezaEntera
        abierto
        onCerrar={vi.fn()}
        producto={producto}
        piezasDisponibles={[piezaDe({ id: 'a', pesoRestanteGramos: peso(850) })]}
        onAgregar={vi.fn()}
      />,
    );

    expect(screen.getByText('850 g')).toBeTruthy();
    // 120000 * 850 / 1000 = 102000 -> $ 1.020,00
    expect(screen.getByText('$ 1.020,00')).toBeTruthy();
  });

  it('tocar una pieza la agrega directo (sin paso de confirmación extra)', () => {
    const onAgregar = vi.fn();
    const pieza = piezaDe({ id: 'a', pesoRestanteGramos: peso(850) });
    render(
      <ModalAgregarPiezaEntera
        abierto
        onCerrar={vi.fn()}
        producto={producto}
        piezasDisponibles={[pieza]}
        onAgregar={onAgregar}
      />,
    );

    fireEvent.click(screen.getByText('850 g'));

    expect(onAgregar).toHaveBeenCalledWith(pieza);
  });

  it('sin piezas disponibles muestra el aviso', () => {
    render(
      <ModalAgregarPiezaEntera
        abierto
        onCerrar={vi.fn()}
        producto={producto}
        piezasDisponibles={[]}
        onAgregar={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('No hay piezas disponibles');
  });
});
