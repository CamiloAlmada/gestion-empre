import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FranjaAlertas } from './FranjaAlertas';

afterEach(() => cleanup());

describe('FranjaAlertas', () => {
  it('sin alertas: no renderiza nada', () => {
    const { container } = render(
      <FranjaAlertas conteo={{ porVencer: 0, stockBajo: 0 }} alertaActiva={null} onAlternar={() => {}} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('solo "por vencer": muestra únicamente ese chip', () => {
    render(<FranjaAlertas conteo={{ porVencer: 3, stockBajo: 0 }} alertaActiva={null} onAlternar={() => {}} />);

    expect(screen.getByRole('button', { name: '3 por vencer' })).toBeTruthy();
    expect(screen.queryByText(/stock bajo/)).toBeNull();
  });

  it('ambas alertas: muestra los dos chips con su conteo', () => {
    render(<FranjaAlertas conteo={{ porVencer: 2, stockBajo: 5 }} alertaActiva={null} onAlternar={() => {}} />);

    expect(screen.getByRole('button', { name: '2 por vencer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '5 stock bajo' })).toBeTruthy();
  });

  it('chip inactivo: aria-pressed="false"', () => {
    render(<FranjaAlertas conteo={{ porVencer: 1, stockBajo: 0 }} alertaActiva={null} onAlternar={() => {}} />);

    expect(screen.getByRole('button', { name: '1 por vencer' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('chip activo: aria-pressed="true" y comunica el estado con algo más que color (ícono ✓)', () => {
    render(
      <FranjaAlertas conteo={{ porVencer: 1, stockBajo: 0 }} alertaActiva="por_vencer" onAlternar={() => {}} />,
    );

    const boton = screen.getByRole('button', { name: /1 por vencer/ });
    expect(boton.getAttribute('aria-pressed')).toBe('true');
    expect(boton.textContent).toContain('✓');
  });

  it('tocar un chip llama a onAlternar con su tipo de alerta', () => {
    const onAlternar = vi.fn();
    render(<FranjaAlertas conteo={{ porVencer: 1, stockBajo: 2 }} alertaActiva={null} onAlternar={onAlternar} />);

    fireEvent.click(screen.getByRole('button', { name: '2 stock bajo' }));

    expect(onAlternar).toHaveBeenCalledWith('stock_bajo');
  });
});
