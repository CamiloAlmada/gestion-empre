import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { peso } from '@gestion/core';
import { TecladoPeso } from './TecladoPeso';

afterEach(cleanup);

describe('TecladoPeso', () => {
  it('arma el peso en kg tocando dígitos y coma', () => {
    const onChange = vi.fn();
    render(<TecladoPeso label="Peso" abierto onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Coma decimal' }));
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: '5' }));

    expect(onChange).toHaveBeenLastCalledWith(peso(1250));
    expect(screen.getByRole('textbox').textContent).toBe('1,25kg');
  });

  it('el readout anuncia cambios a lectores de pantalla (aria-live="polite")', () => {
    render(<TecladoPeso label="Peso" abierto onChange={vi.fn()} />);

    expect(screen.getByRole('textbox').getAttribute('aria-live')).toBe('polite');
  });

  it('en modo g deshabilita la coma y arma gramos enteros', () => {
    const onChange = vi.fn();
    render(<TecladoPeso label="Peso" abierto onChange={onChange} unidadInicial="g" />);

    expect(
      (screen.getByRole('button', { name: 'Coma decimal' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));

    expect(onChange).toHaveBeenLastCalledWith(peso(500));
  });

  it('borrar quita el último dígito', () => {
    const onChange = vi.fn();
    render(<TecladoPeso label="Peso" abierto onChange={onChange} unidadInicial="g" />);

    fireEvent.click(screen.getByRole('button', { name: '5' }));
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    fireEvent.click(screen.getByRole('button', { name: 'Borrar último dígito' }));

    expect(onChange).toHaveBeenLastCalledWith(peso(5));
  });

  it('cambiar de kg a g conserva el valor de dominio', () => {
    const onChange = vi.fn();
    render(<TecladoPeso label="Peso" abierto onChange={onChange} unidadInicial="kg" />);

    fireEvent.click(screen.getByRole('button', { name: '1' }));
    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'g' }));

    expect(screen.getByRole('textbox').textContent).toBe('1000g');
    // El toggle de unidad no dispara onChange de nuevo: el Peso no cambió.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('valorInicial precarga el buffer (modo edición) y avisa ese valor, no null', () => {
    const onChange = vi.fn();
    render(
      <TecladoPeso label="Peso" abierto onChange={onChange} unidadInicial="kg" valorInicial={peso(1250)} />,
    );

    expect(screen.getByRole('textbox').textContent).toBe('1,25kg');
    expect(onChange).toHaveBeenCalledWith(peso(1250));
  });

  it('valorInicial respeta unidadInicial "g" al precargar', () => {
    const onChange = vi.fn();
    render(<TecladoPeso label="Peso" abierto onChange={onChange} unidadInicial="g" valorInicial={peso(350)} />);

    expect(screen.getByRole('textbox').textContent).toBe('350g');
    expect(onChange).toHaveBeenCalledWith(peso(350));
  });

  it('sin valorInicial: comportamiento actual EXACTO (arranca vacío)', () => {
    const onChange = vi.fn();
    render(<TecladoPeso label="Peso" abierto onChange={onChange} unidadInicial="kg" />);

    expect(screen.getByRole('textbox').textContent).toBe('0kg');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('al abrirse (abierto) reinicia el buffer y avisa value: null', () => {
    const onChange = vi.fn();
    const { rerender } = render(<TecladoPeso label="Peso" abierto={false} onChange={onChange} unidadInicial="g" />);

    fireEvent.click(screen.getByRole('button', { name: '5' }));
    onChange.mockClear();

    rerender(<TecladoPeso label="Peso" abierto onChange={onChange} unidadInicial="g" />);

    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.getByRole('textbox').textContent).toBe('0g');
  });
});
