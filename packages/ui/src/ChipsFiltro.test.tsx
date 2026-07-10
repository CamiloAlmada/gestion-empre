import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ChipsFiltro } from './ChipsFiltro';

afterEach(cleanup);

describe('ChipsFiltro', () => {
  it('con valor=null, "Todas" está presionado y las opciones no', () => {
    render(
      <ChipsFiltro
        opciones={['Quesos', 'Miel']}
        valor={null}
        onCambiar={vi.fn()}
        ariaLabel="Filtrar por categoría"
      />,
    );

    expect(screen.getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Quesos' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Miel' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('selección única: al elegir una opción, "Todas" y las demás quedan sin presionar', () => {
    render(
      <ChipsFiltro
        opciones={['Quesos', 'Miel']}
        valor="Quesos"
        onCambiar={vi.fn()}
        ariaLabel="Filtrar por categoría"
      />,
    );

    expect(screen.getByRole('button', { name: 'Quesos' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Todas' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Miel' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('tocar una opción llama a onCambiar con esa opción', () => {
    const onCambiar = vi.fn();
    render(
      <ChipsFiltro opciones={['Quesos', 'Miel']} valor={null} onCambiar={onCambiar} ariaLabel="Filtrar por categoría" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Miel' }));

    expect(onCambiar).toHaveBeenCalledWith('Miel');
  });

  it('tocar "Todas" llama a onCambiar con null', () => {
    const onCambiar = vi.fn();
    render(
      <ChipsFiltro
        opciones={['Quesos', 'Miel']}
        valor="Quesos"
        onCambiar={onCambiar}
        ariaLabel="Filtrar por categoría"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));

    expect(onCambiar).toHaveBeenCalledWith(null);
  });

  it('tocar la opción ya activa es un no-op (selección única, nunca queda sin ninguna presionada)', () => {
    const onCambiar = vi.fn();
    render(
      <ChipsFiltro
        opciones={['Quesos', 'Miel']}
        valor="Quesos"
        onCambiar={onCambiar}
        ariaLabel="Filtrar por categoría"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));

    expect(onCambiar).toHaveBeenCalledWith('Quesos');
  });

  it('admite una etiqueta de "Todas" personalizada', () => {
    render(
      <ChipsFiltro
        opciones={['Quesos']}
        valor={null}
        onCambiar={vi.fn()}
        ariaLabel="Filtrar"
        etiquetaTodas="Todos"
      />,
    );

    expect(screen.getByRole('button', { name: 'Todos' })).toBeTruthy();
  });

  it('expone role="group" con el aria-label recibido', () => {
    render(
      <ChipsFiltro opciones={['Quesos']} valor={null} onCambiar={vi.fn()} ariaLabel="Filtrar por categoría" />,
    );

    expect(screen.getByRole('group', { name: 'Filtrar por categoría' })).toBeTruthy();
  });
});
