import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Chip } from './Chip';

afterEach(cleanup);

describe('Chip', () => {
  it('expone aria-pressed según `activo`', () => {
    render(
      <Chip activo={false} onClick={vi.fn()}>
        Mostrar inactivos
      </Chip>,
    );

    expect(screen.getByRole('button', { name: 'Mostrar inactivos' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('activo=true expone aria-pressed="true"', () => {
    render(
      <Chip activo={true} onClick={vi.fn()}>
        Mostrar inactivos
      </Chip>,
    );

    expect(screen.getByRole('button', { name: 'Mostrar inactivos' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('tocarlo llama a onClick', () => {
    const onClick = vi.fn();
    render(
      <Chip activo={false} onClick={onClick}>
        Quesos
      </Chip>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Quesos' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
