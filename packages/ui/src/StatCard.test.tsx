import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

afterEach(() => {
  cleanup();
});

describe('StatCard', () => {
  it('muestra título, valor y detalle', () => {
    render(<StatCard titulo="Ventas hoy" valor="$ 12.500,00" detalle="+8% vs ayer" />);

    expect(screen.getByText('Ventas hoy')).toBeInTheDocument();
    expect(screen.getByText('$ 12.500,00')).toBeInTheDocument();
    expect(screen.getByText('+8% vs ayer')).toBeInTheDocument();
  });

  it('funciona sin detalle ni ícono', () => {
    render(<StatCard titulo="Stock bajo" valor="4 productos" />);
    expect(screen.getByText('Stock bajo')).toBeInTheDocument();
    expect(screen.getByText('4 productos')).toBeInTheDocument();
  });

  it('el ícono, si se pasa, es decorativo (aria-hidden)', () => {
    render(<StatCard titulo="Ventas hoy" valor="10" icono={<span data-testid="icono">*</span>} />);
    const icono = screen.getByTestId('icono');
    expect(icono.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
