import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Select } from './Select';

afterEach(() => {
  cleanup();
});

function selectByLabel(label: string) {
  return screen.getByLabelText(label) as HTMLSelectElement;
}

const OPCIONES = [
  { valor: '598', etiqueta: 'Uruguay (+598)' },
  { valor: '54', etiqueta: 'Argentina (+54)' },
];

describe('Select', () => {
  it('renderiza una opción por cada entrada de `opciones`, con el valor seleccionado', () => {
    render(<Select label="País" value="54" onChange={vi.fn()} opciones={OPCIONES} />);

    const select = selectByLabel('País');
    expect(select.value).toBe('54');
    expect(screen.getByText('Uruguay (+598)')).toBeTruthy();
    expect(screen.getByText('Argentina (+54)')).toBeTruthy();
  });

  it('al elegir una opción, dispara onChange con el nuevo valor', () => {
    const onChange = vi.fn();
    render(<Select label="País" value="598" onChange={onChange} opciones={OPCIONES} />);

    fireEvent.change(selectByLabel('País'), { target: { value: '54' } });

    expect(onChange).toHaveBeenCalledWith('54');
  });

  it('con error="Elegí un país", el select tiene aria-invalid="true" y aria-describedby apunta al mensaje', () => {
    render(
      <Select label="País" value="598" onChange={vi.fn()} opciones={OPCIONES} error="Elegí un país" />,
    );

    const select = selectByLabel('País');
    expect(select).toHaveAttribute('aria-invalid', 'true');

    const describedBy = select.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();

    const mensaje = document.getElementById(describedBy!);
    expect(mensaje).not.toBeNull();
    expect(mensaje?.textContent).toBe('Elegí un país');
  });

  it('sin error, el select no tiene aria-invalid ni aria-describedby', () => {
    render(<Select label="País" value="598" onChange={vi.fn()} opciones={OPCIONES} />);

    const select = selectByLabel('País');
    expect(select).not.toHaveAttribute('aria-invalid');
    expect(select).not.toHaveAttribute('aria-describedby');
  });

  it('con disabled, el select queda deshabilitado', () => {
    render(<Select label="País" value="598" onChange={vi.fn()} opciones={OPCIONES} disabled />);

    expect(selectByLabel('País')).toBeDisabled();
  });
});
