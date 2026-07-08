import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { peso, type Peso } from '@gestion/core';
import { PesoInput } from './PesoInput';

afterEach(() => {
  cleanup();
});

function inputPeso() {
  return screen.getByLabelText('Peso');
}

describe('PesoInput', () => {
  it('en unidad g, "500" dispara onChange con peso(500)', () => {
    const onChange = vi.fn();
    render(<PesoInput label="Peso" value={null} onChange={onChange} unidadInicial="g" />);

    fireEvent.change(inputPeso(), { target: { value: '500' } });

    expect(onChange).toHaveBeenLastCalledWith(peso(500));
  });

  it('en unidad kg, "1,25" dispara onChange con peso(1250)', () => {
    const onChange = vi.fn();
    render(<PesoInput label="Peso" value={null} onChange={onChange} unidadInicial="kg" />);

    fireEvent.change(inputPeso(), { target: { value: '1,25' } });

    expect(onChange).toHaveBeenLastCalledWith(peso(1250));
  });

  it('decimales en unidad g se rechazan (error, onChange(null))', () => {
    const onChange = vi.fn();
    render(<PesoInput label="Peso" value={null} onChange={onChange} unidadInicial="g" />);

    const input = inputPeso();
    fireEvent.change(input, { target: { value: '1,5' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('vaciar el campo dispara onChange(null)', () => {
    const onChange = vi.fn();
    render(<PesoInput label="Peso" value={peso(100)} onChange={onChange} unidadInicial="g" />);

    fireEvent.change(inputPeso(), { target: { value: '' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('cambiar de unidad no pierde el valor: re-presenta el mismo Peso en la nueva unidad', () => {
    // Harness controlado: value vive en el padre, como en uso real.
    function Harness() {
      const [valor, setValor] = useState<Peso | null>(null);
      return <PesoInput label="Peso" value={valor} onChange={setValor} unidadInicial="kg" />;
    }
    render(<Harness />);

    const input = inputPeso() as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1,25' } });
    fireEvent.blur(input);
    expect(input.value).toBe('1,25');

    fireEvent.click(screen.getByRole('button', { name: 'g' }));
    expect(input.value).toBe('1250');

    fireEvent.click(screen.getByRole('button', { name: 'kg' }));
    expect(input.value).toBe('1,25');
  });

  it('el toggle de unidad usa aria-pressed', () => {
    render(<PesoInput label="Peso" value={null} onChange={vi.fn()} unidadInicial="kg" />);

    expect(screen.getByRole('button', { name: 'kg' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'g' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('blur re-formatea en kg con coma decimal', () => {
    const onChange = vi.fn();
    render(<PesoInput label="Peso" value={null} onChange={onChange} unidadInicial="kg" />);

    const input = inputPeso() as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.blur(input);

    expect(input.value).toBe('2');
  });
});
