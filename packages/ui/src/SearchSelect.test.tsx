import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SearchSelect, type OpcionSearchSelect } from './SearchSelect';

afterEach(() => {
  cleanup();
});

const opciones: OpcionSearchSelect[] = [
  { id: '1', etiqueta: 'Árbol' },
  { id: '2', etiqueta: 'Arena' },
  { id: '3', etiqueta: 'Banana' },
];

function inputBuscador() {
  return screen.getByLabelText('Producto') as HTMLInputElement;
}

describe('SearchSelect', () => {
  it('filtra por texto sin distinguir acentos ni mayúsculas', () => {
    render(<SearchSelect label="Producto" opciones={opciones} value={null} onChange={vi.fn()} />);

    const input = inputBuscador();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'arbol' } });

    expect(screen.getByRole('option', { name: 'Árbol' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Arena' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Banana' })).not.toBeInTheDocument();
  });

  it('navega con flechas y actualiza aria-activedescendant', () => {
    render(<SearchSelect label="Producto" opciones={opciones} value={null} onChange={vi.fn()} />);

    const input = inputBuscador();
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    let opcionActiva = screen.getByRole('option', { name: 'Árbol' });
    expect(input).toHaveAttribute('aria-activedescendant', opcionActiva.id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    opcionActiva = screen.getByRole('option', { name: 'Arena' });
    expect(input).toHaveAttribute('aria-activedescendant', opcionActiva.id);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    opcionActiva = screen.getByRole('option', { name: 'Árbol' });
    expect(input).toHaveAttribute('aria-activedescendant', opcionActiva.id);
  });

  it('selecciona la opción activa con Enter', () => {
    const onChange = vi.fn();
    render(<SearchSelect label="Producto" opciones={opciones} value={null} onChange={onChange} />);

    const input = inputBuscador();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('1');
    expect(input.value).toBe('Árbol');
  });

  it('selecciona con click (mousedown) en una opción', () => {
    const onChange = vi.fn();
    render(<SearchSelect label="Producto" opciones={opciones} value={null} onChange={onChange} />);

    const input = inputBuscador();
    fireEvent.focus(input);
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Banana' }));

    expect(onChange).toHaveBeenCalledWith('3');
    expect(input.value).toBe('Banana');
  });

  it('Escape cierra la lista y revierte el texto a la selección vigente', () => {
    const onChange = vi.fn();
    render(<SearchSelect label="Producto" opciones={opciones} value="2" onChange={onChange} />);

    const input = inputBuscador();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xyz' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(input.value).toBe('Arena');
  });

  it('vaciar el texto dispara onChange(null)', () => {
    const onChange = vi.fn();
    render(<SearchSelect label="Producto" opciones={opciones} value="2" onChange={onChange} />);

    const input = inputBuscador();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('sin resultados muestra un mensaje en la lista', () => {
    render(<SearchSelect label="Producto" opciones={opciones} value={null} onChange={vi.fn()} />);

    const input = inputBuscador();
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });

    expect(screen.getByText('Sin resultados.')).toBeInTheDocument();
  });
});
