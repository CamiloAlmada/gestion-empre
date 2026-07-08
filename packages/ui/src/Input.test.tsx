import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Input } from './Input';

afterEach(() => {
  cleanup();
});

function inputByLabel(label: string) {
  return screen.getByLabelText(label);
}

describe('Input', () => {
  it('con error="Campo requerido", el input tiene aria-invalid="true" y aria-describedby apunta al mensaje', () => {
    render(
      <Input
        label="Email"
        value=""
        onChange={vi.fn()}
        error="Campo requerido"
      />
    );

    const input = inputByLabel('Email') as HTMLInputElement;
    expect(input).toHaveAttribute('aria-invalid', 'true');

    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const mensaje = document.getElementById(describedBy!);
    expect(mensaje).not.toBeNull();
    expect(mensaje?.textContent).toBe('Campo requerido');
  });

  it('sin error, el input no tiene aria-invalid ni aria-describedby', () => {
    render(
      <Input
        label="Email"
        value=""
        onChange={vi.fn()}
      />
    );

    const input = inputByLabel('Email');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });
});
