import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BadgeEstadoCompra } from './BadgeEstadoCompra';

afterEach(cleanup);

describe('BadgeEstadoCompra', () => {
  it('borrador: muestra el texto "Borrador"', () => {
    render(<BadgeEstadoCompra estado="borrador" />);
    expect(screen.getByText('Borrador')).toBeTruthy();
  });

  it('confirmada: muestra el texto "Confirmada"', () => {
    render(<BadgeEstadoCompra estado="confirmada" />);
    expect(screen.getByText('Confirmada')).toBeTruthy();
  });
});
