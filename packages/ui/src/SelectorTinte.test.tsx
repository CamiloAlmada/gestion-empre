import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SelectorTinte } from './SelectorTinte';

afterEach(cleanup);

describe('SelectorTinte', () => {
  it('muestra las 3 opciones etiquetadas: Neutro, Cálido, Frío', () => {
    render(<SelectorTinte valor="neutro" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Neutro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cálido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Frío' })).toBeInTheDocument();
  });

  it('marca aria-pressed=true en la opción que coincide con valor', () => {
    render(<SelectorTinte valor="frio" onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Frío' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Neutro' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Cálido' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('tocar una opción llama a onChange con ese TinteFondo', () => {
    const onChange = vi.fn();
    render(<SelectorTinte valor="neutro" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cálido' }));

    expect(onChange).toHaveBeenCalledWith('calido');
  });

  it('el grupo tiene un nombre accesible ("Tinte de fondo")', () => {
    render(<SelectorTinte valor="neutro" onChange={vi.fn()} />);

    expect(screen.getByRole('group', { name: 'Tinte de fondo' })).toBeInTheDocument();
    expect(screen.getByText('Tinte de fondo')).toBeInTheDocument();
  });
});
