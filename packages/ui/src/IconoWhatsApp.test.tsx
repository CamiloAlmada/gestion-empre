import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { IconoWhatsApp } from './IconoWhatsApp';

afterEach(cleanup);

describe('IconoWhatsApp', () => {
  it('renderiza un svg decorativo (aria-hidden), sin nombre accesible propio', () => {
    const { container } = render(<IconoWhatsApp />);
    const svg = container.querySelector('svg');

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
  });

  it('hereda color vía currentColor (fill), no trae un color de marca fijo', () => {
    const { container } = render(<IconoWhatsApp />);
    expect(container.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
  });

  it('admite className propia (tamaño lo decide quien lo usa)', () => {
    const { container } = render(<IconoWhatsApp className="h-4 w-4" />);
    expect(container.querySelector('svg')?.getAttribute('class')).toBe('h-4 w-4');
  });
});
