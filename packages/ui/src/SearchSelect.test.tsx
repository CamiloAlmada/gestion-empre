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

  // --- Mejoras pedidas por el review ---

  it('Escape con la lista abierta no burbujea al padre (para no cerrar también un Modal ancestro)', () => {
    const onKeyDownPadre = vi.fn();
    render(
      <div onKeyDown={onKeyDownPadre}>
        <SearchSelect label="Producto" opciones={opciones} value={null} onChange={vi.fn()} />
      </div>,
    );

    const input = inputBuscador();
    fireEvent.focus(input); // abre la lista
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onKeyDownPadre).not.toHaveBeenCalled();
  });

  it('Escape con la lista YA cerrada sí burbujea (deja que un ancestro, ej. un Modal, la maneje)', () => {
    const onKeyDownPadre = vi.fn();
    render(
      <div onKeyDown={onKeyDownPadre}>
        <SearchSelect label="Producto" opciones={opciones} value={null} onChange={vi.fn()} />
      </div>,
    );

    const input = inputBuscador();
    // Sin foco: la lista nunca se abrió.
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onKeyDownPadre).toHaveBeenCalledTimes(1);
  });

  it('al navegar con flechas, la opción activa hace scrollIntoView({ block: "nearest" })', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    render(<SearchSelect label="Producto" opciones={opciones} value={null} onChange={vi.fn()} />);

    const input = inputBuscador();
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('tipear un filtro, bajar con flecha y confirmar con Enter elige del set FILTRADO', () => {
    const onChange = vi.fn();
    render(<SearchSelect label="Producto" opciones={opciones} value={null} onChange={onChange} />);

    const input = inputBuscador();
    fireEvent.focus(input);
    // Filtra a ["Arena", "Banana"] (ambas contienen "an"); Árbol queda afuera.
    fireEvent.change(input, { target: { value: 'an' } });
    expect(screen.queryByRole('option', { name: 'Árbol' })).not.toBeInTheDocument();

    // El índice activo arranca en 0 (Arena); una flecha abajo lo mueve a 1 (Banana).
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenLastCalledWith('3'); // Banana, no Árbol (id '1')
    expect(input.value).toBe('Banana');
  });

  it('Enter sin ninguna opción activa es un no-op (no dispara onChange)', () => {
    const onChange = vi.fn();
    render(<SearchSelect label="Producto" opciones={opciones} value={null} onChange={onChange} />);

    const input = inputBuscador();
    fireEvent.focus(input); // abre la lista pero no mueve el índice activo (-1)

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });
});
