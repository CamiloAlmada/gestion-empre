import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CampoBusqueda } from './CampoBusqueda';

afterEach(() => {
  cleanup();
});

describe('CampoBusqueda', () => {
  it('se renderiza como input accesible por aria-label, sin label visible', () => {
    render(<CampoBusqueda valor="" onChange={vi.fn()} ariaLabel="Buscar producto" />);

    const input = screen.getByRole('searchbox', { name: 'Buscar producto' });
    expect(input).toBeInTheDocument();
    expect(screen.queryByText('Buscar producto')).not.toBeInTheDocument();
  });

  it('muestra el valor controlado', () => {
    render(<CampoBusqueda valor="jamón" onChange={vi.fn()} ariaLabel="Buscar producto" />);
    expect(screen.getByRole('searchbox', { name: 'Buscar producto' })).toHaveValue('jamón');
  });

  it('tipear dispara onChange con el nuevo valor', () => {
    const onChange = vi.fn();
    render(<CampoBusqueda valor="" onChange={onChange} ariaLabel="Buscar producto" />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar producto' }), {
      target: { value: 'queso' },
    });

    expect(onChange).toHaveBeenLastCalledWith('queso');
  });

  it('usa el placeholder pasado como descripción de qué se busca', () => {
    render(
      <CampoBusqueda
        valor=""
        onChange={vi.fn()}
        ariaLabel="Buscar cliente"
        placeholder="Nombre, alias o teléfono"
      />,
    );
    expect(screen.getByPlaceholderText('Nombre, alias o teléfono')).toBeInTheDocument();
  });

  it('la lupa es puramente decorativa (aria-hidden, no forma parte del árbol accesible)', () => {
    const { container } = render(<CampoBusqueda valor="" onChange={vi.fn()} ariaLabel="Buscar" />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('disabled deshabilita el input', () => {
    render(<CampoBusqueda valor="" onChange={vi.fn()} ariaLabel="Buscar" disabled />);
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toBeDisabled();
  });
});
