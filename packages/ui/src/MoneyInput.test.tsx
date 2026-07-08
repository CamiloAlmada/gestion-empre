import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money } from '@gestion/core';
import { MoneyInput } from './MoneyInput';

afterEach(() => {
  cleanup();
});

function inputMonto() {
  return screen.getByLabelText('Monto');
}

describe('MoneyInput', () => {
  it('tipear "1234,50" dispara onChange con money(123450)', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    fireEvent.change(inputMonto(), { target: { value: '1234,50' } });

    expect(onChange).toHaveBeenLastCalledWith(money(123450));
  });

  it('tipear "1234.5" (punto de teclado) también resuelve a money(123450)', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    fireEvent.change(inputMonto(), { target: { value: '1234.5' } });

    expect(onChange).toHaveBeenLastCalledWith(money(123450));
  });

  it('tipear "0,05" resuelve a money(5)', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    fireEvent.change(inputMonto(), { target: { value: '0,05' } });

    expect(onChange).toHaveBeenLastCalledWith(money(5));
  });

  it('vaciar el campo dispara onChange(null)', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={money(100)} onChange={onChange} />);

    fireEvent.change(inputMonto(), { target: { value: '' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('texto no parseable ("abc") dispara onChange(null) y muestra error accesible', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    const input = inputMonto();
    fireEvent.change(input, { target: { value: 'abc' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const mensaje = document.getElementById(describedBy!);
    expect(mensaje).not.toBeNull();
    expect(mensaje?.textContent).toMatch(/inválido/i);
  });

  it('más de 2 decimales se rechaza (error, onChange(null))', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    const input = inputMonto();
    fireEvent.change(input, { target: { value: '1234,567' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('blur re-formatea el display con separador de miles y 2 decimales', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    const input = inputMonto() as HTMLInputElement;
    fireEvent.change(input, { target: { value: '1234,5' } });
    fireEvent.blur(input);

    expect(input.value).toBe('1.234,50');
  });

  it('muestra el prefijo "$" separado del valor', () => {
    render(<MoneyInput label="Monto" value={money(123450)} onChange={vi.fn()} />);
    expect(screen.getByText('$')).toBeInTheDocument();
    expect((inputMonto() as HTMLInputElement).value).toBe('1.234,50');
  });

  it('prop error externo tiene prioridad sobre el error de parseo', () => {
    render(<MoneyInput label="Monto" value={null} onChange={vi.fn()} error="Campo obligatorio" />);
    expect(screen.getByText('Campo obligatorio')).toBeInTheDocument();
  });

  it('sincroniza el valor mostrado cuando cambia `value` desde afuera (sin foco)', () => {
    const { rerender } = render(<MoneyInput label="Monto" value={null} onChange={vi.fn()} />);
    expect((inputMonto() as HTMLInputElement).value).toBe('');

    rerender(<MoneyInput label="Monto" value={money(500)} onChange={vi.fn()} />);
    expect((inputMonto() as HTMLInputElement).value).toBe('5,00');
  });

  // --- Fix del bloqueante de code review: round-trip de miles ---

  it('round-trip: value=money(123450) (>= $1.000) sobrevive focus/blur sin volverse inválido ni disparar onChange(null)', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={money(123450)} onChange={onChange} />);

    const input = inputMonto() as HTMLInputElement;
    expect(input.value).toBe('1.234,50'); // display inicial ya trae miles

    fireEvent.focus(input);
    fireEvent.blur(input);

    expect(input.value).toBe('1.234,50');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(onChange).not.toHaveBeenCalledWith(null);
  });

  it('editar el display con miles ("1.234,50" -> "11.234,50") no pierde el monto', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={money(123450)} onChange={onChange} />);

    const input = inputMonto() as HTMLInputElement;
    expect(input.value).toBe('1.234,50');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '11.234,50' } });

    expect(onChange).toHaveBeenLastCalledWith(money(1123450));
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('"1.234.567,89" (miles de varios grupos) es válido', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    fireEvent.change(inputMonto(), { target: { value: '1.234.567,89' } });

    expect(onChange).toHaveBeenLastCalledWith(money(123456789));
  });

  it('" 1234,50 " con espacios (pegado) es válido', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    fireEvent.change(inputMonto(), { target: { value: ' 1234,50 ' } });

    expect(onChange).toHaveBeenLastCalledWith(money(123450));
  });

  it('"1,2,3" (dos comas) es inválido', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    const input = inputMonto();
    fireEvent.change(input, { target: { value: '1,2,3' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('"-0,00" resuelve a money(0) (cero positivo, sin -0)', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    fireEvent.change(inputMonto(), { target: { value: '-0,00' } });

    expect(onChange).toHaveBeenLastCalledWith(money(0));
    const valorRecibido = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as number;
    expect(Object.is(valorRecibido, -0)).toBe(false);
  });

  it('"1.234.567" (miles sin decimales, sin coma) es válido y entero', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    fireEvent.change(inputMonto(), { target: { value: '1.234.567' } });

    expect(onChange).toHaveBeenLastCalledWith(money(123456700));
  });

  it('"1.2345" (un punto ambiguo, ni miles ni decimal de 1-2 dígitos) es inválido', () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Monto" value={null} onChange={onChange} />);

    const input = inputMonto();
    fireEvent.change(input, { target: { value: '1.2345' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
