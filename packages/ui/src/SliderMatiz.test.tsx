import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { generarPaleta } from '@gestion/core';
import { SliderMatiz } from './SliderMatiz';

afterEach(cleanup);

describe('SliderMatiz', () => {
  it('tiene label visible "Matiz de marca" asociado al input', () => {
    render(<SliderMatiz valor={78} onChange={vi.fn()} />);

    const input = screen.getByLabelText('Matiz de marca');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');
  });

  it('es un <input type="range"> con min=0, max=359, step=1', () => {
    render(<SliderMatiz valor={78} onChange={vi.fn()} />);

    const input = screen.getByLabelText('Matiz de marca') as HTMLInputElement;
    expect(input.type).toBe('range');
    expect(input.min).toBe('0');
    expect(input.max).toBe('359');
    expect(input.step).toBe('1');
    expect(input.value).toBe('78');
  });

  it.each([
    [0, 'Rojo'],
    [52, 'Naranja'],
    [78, 'Ámbar'],
    [130, 'Verde'],
    [180, 'Cian'],
    [245, 'Azul'],
    [300, 'Violeta'],
    [330, 'Rosa'],
    [350, 'Rojo'],
  ])('aria-valuetext de matiz=%i incluye el nombre de color ("%s") y el número', (matiz, nombre) => {
    render(<SliderMatiz valor={matiz} onChange={vi.fn()} />);

    const input = screen.getByLabelText('Matiz de marca');
    expect(input.getAttribute('aria-valuetext')).toBe(`${nombre}, ${matiz}°`);
  });

  it('onChange recibe SIEMPRE un entero', () => {
    const onChange = vi.fn();
    render(<SliderMatiz valor={78} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Matiz de marca'), { target: { value: '214' } });

    expect(onChange).toHaveBeenCalledWith(214);
    expect(Number.isInteger(onChange.mock.calls[0]?.[0])).toBe(true);
  });

  it('el swatch de color de marca cambia con el matiz (tinte es indiferente para primary-600, ver generarPaleta)', () => {
    const esperadoMiel = generarPaleta({ version: 1, matiz: 78, tinte: 'neutro' }).variables['--color-primary-600'];
    const esperadoMielFrio = generarPaleta({ version: 1, matiz: 78, tinte: 'frio' }).variables['--color-primary-600'];
    expect(esperadoMiel).toBe(esperadoMielFrio); // sanity check de la premisa documentada

    const { container, rerender } = render(<SliderMatiz valor={78} onChange={vi.fn()} />);
    const swatch = container.querySelector('[aria-hidden="true"].rounded-full.border') as HTMLElement;
    expect(swatch).not.toBeNull();
    const colorMiel = swatch.style.backgroundColor;
    expect(colorMiel).not.toBe('');

    rerender(<SliderMatiz valor={245} onChange={vi.fn()} />);
    const swatchNuevo = container.querySelector('[aria-hidden="true"].rounded-full.border') as HTMLElement;
    expect(swatchNuevo.style.backgroundColor).not.toBe(colorMiel);
  });
});
