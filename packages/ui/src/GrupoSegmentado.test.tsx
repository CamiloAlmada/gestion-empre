import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GrupoSegmentado, type OpcionGrupoSegmentado } from './GrupoSegmentado';

afterEach(cleanup);

type Opcion = 'a' | 'b' | 'c';

const OPCIONES: readonly OpcionGrupoSegmentado<Opcion>[] = [
  { valor: 'a', etiqueta: 'Opción A' },
  { valor: 'b', etiqueta: 'Opción B' },
  { valor: 'c', etiqueta: 'Opción C' },
];

describe('GrupoSegmentado', () => {
  it('renderiza el role="group" con el aria-label recibido y todas las opciones', () => {
    render(<GrupoSegmentado opciones={OPCIONES} valor="a" onCambiar={vi.fn()} ariaLabel="Elegí una opción" />);

    expect(screen.getByRole('group', { name: 'Elegí una opción' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opción A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opción B' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Opción C' })).toBeInTheDocument();
  });

  it('marca aria-pressed=true SOLO en la opción activa', () => {
    render(<GrupoSegmentado opciones={OPCIONES} valor="b" onCambiar={vi.fn()} ariaLabel="Elegí una opción" />);

    expect(screen.getByRole('button', { name: 'Opción A' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Opción B' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Opción C' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('tocar una opción llama a onCambiar con su valor', () => {
    const onCambiar = vi.fn();
    render(<GrupoSegmentado opciones={OPCIONES} valor="a" onCambiar={onCambiar} ariaLabel="Elegí una opción" />);

    fireEvent.click(screen.getByRole('button', { name: 'Opción C' }));

    expect(onCambiar).toHaveBeenCalledWith('c');
    expect(onCambiar).toHaveBeenCalledTimes(1);
  });

  it('los botones son type="button" (nada de submit nativo)', () => {
    render(<GrupoSegmentado opciones={OPCIONES} valor="a" onCambiar={vi.fn()} ariaLabel="Elegí una opción" />);

    for (const boton of screen.getAllByRole('button')) {
      expect(boton.getAttribute('type')).toBe('button');
    }
  });
});
