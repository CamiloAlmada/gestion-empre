import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, peso, type Producto } from '@gestion/core';
import { ModalItemCompra } from './ModalItemCompra';
import type { ItemCompraForm } from './resumenCompra';

function productoDe(over: Partial<Producto> & Pick<Producto, 'modoStock'>): Producto {
  return {
    id: 'p1',
    nombre: 'Queso Colonia',
    categoria: 'Quesos',
    modoPrecio: 'por_kg',
    precioVentaCents: money(1000),
    costoPromedioCents: money(0),
    activo: true,
    actualizadoEn: new Date('2026-01-01'),
    ...over,
  };
}

function renderizar(props: Partial<Parameters<typeof ModalItemCompra>[0]> = {}) {
  const onCerrar = vi.fn();
  const onConfirmar = vi.fn();
  const utils = render(
    <ModalItemCompra
      abierto
      onCerrar={onCerrar}
      producto={productoDe({ modoStock: 'granel' })}
      itemExistente={null}
      onConfirmar={onConfirmar}
      {...props}
    />,
  );
  return { ...utils, onCerrar, onConfirmar };
}

afterEach(cleanup);

describe('ModalItemCompra', () => {
  it('granel: agrega con el shape correcto', () => {
    const { onConfirmar } = renderizar({ producto: productoDe({ modoStock: 'granel' }) });

    fireEvent.change(screen.getByLabelText('Peso comprado'), { target: { value: '2' } }); // 2 kg
    fireEvent.change(screen.getByLabelText('Costo de factura (total del ítem)'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onConfirmar).toHaveBeenCalledWith({
      productoId: 'p1',
      nombreProducto: 'Queso Colonia',
      modoStock: 'granel',
      gramos: peso(2000),
      costoFacturaCents: money(50000),
    });
  });

  it('granel: sin peso ni costo, no confirma y marca errores', () => {
    const { onConfirmar } = renderizar({ producto: productoDe({ modoStock: 'granel' }) });

    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText('Ingresá el peso comprado (mayor a cero).')).toBeTruthy();
    expect(screen.getByText('Ingresá el costo de factura del ítem (mayor a cero).')).toBeTruthy();
  });

  it('unidad_simple: agrega con unidades enteras', () => {
    const { onConfirmar } = renderizar({ producto: productoDe({ modoStock: 'unidad_simple' }) });

    fireEvent.change(screen.getByLabelText('Unidades compradas'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Costo de factura (total del ítem)'), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onConfirmar).toHaveBeenCalledWith({
      productoId: 'p1',
      nombreProducto: 'Queso Colonia',
      modoStock: 'unidad_simple',
      unidades: 10,
      costoFacturaCents: money(100000),
    });
  });

  it('pieza: agrega con la suma de las piezas cargadas como gramos', () => {
    const { onConfirmar } = renderizar({ producto: productoDe({ modoStock: 'fraccionado_por_pieza' }) });

    fireEvent.click(screen.getByRole('button', { name: 'Agregar otra pieza' }));
    const pesos = screen.getAllByLabelText('Peso');
    fireEvent.change(pesos[0]!, { target: { value: '1,2' } }); // 1,2 kg
    fireEvent.change(pesos[1]!, { target: { value: '0,8' } }); // 0,8 kg
    fireEvent.change(screen.getByLabelText('Costo de factura (total del ítem)'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onConfirmar).toHaveBeenCalledWith({
      productoId: 'p1',
      nombreProducto: 'Queso Colonia',
      modoStock: 'fraccionado_por_pieza',
      gramos: peso(2000),
      piezas: [{ pesoGramos: peso(1200), fechaVencimiento: undefined }, { pesoGramos: peso(800), fechaVencimiento: undefined }],
      costoFacturaCents: money(40000),
    });
  });

  it('pieza: fila sin peso bloquea la confirmación con error inline', () => {
    const { onConfirmar } = renderizar({ producto: productoDe({ modoStock: 'fraccionado_por_pieza' }) });

    fireEvent.change(screen.getByLabelText('Costo de factura (total del ítem)'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));

    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText('Ingresá el peso (mayor a cero).')).toBeTruthy();
  });

  it('edición: precarga los valores del ítem existente', () => {
    const itemExistente: ItemCompraForm = {
      productoId: 'p1',
      nombreProducto: 'Queso Colonia',
      modoStock: 'granel',
      gramos: peso(3000),
      costoFacturaCents: money(90000),
    };
    renderizar({ producto: productoDe({ modoStock: 'granel' }), itemExistente });

    expect(screen.getByRole('heading', { name: /Editar/ }) ?? screen.getByText(/Editar/)).toBeTruthy();
    expect((screen.getByLabelText('Peso comprado') as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText('Costo de factura (total del ítem)') as HTMLInputElement).value).toBe('900,00');
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
  });
});
