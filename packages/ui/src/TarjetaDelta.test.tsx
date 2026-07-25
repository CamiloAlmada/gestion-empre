import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TarjetaDelta } from './TarjetaDelta';

afterEach(() => {
  cleanup();
});

describe('TarjetaDelta', () => {
  it('estado normal con subida (sin valoracion explícita): variación visible en verde (buena por defecto)', () => {
    render(
      <TarjetaDelta
        titulo="Ganancia del mes"
        valor="$ 45.000,00"
        comparacion={{ tipo: 'normal', tendencia: 'subida', variacion: '+12% vs. mes anterior' }}
      />,
    );

    expect(screen.getByText('Ganancia del mes')).toBeInTheDocument();
    expect(screen.getByText('$ 45.000,00')).toBeInTheDocument();
    const variacion = screen.getByText('+12% vs. mes anterior');
    expect(variacion.className).toContain('text-exito');
  });

  it('estado normal con bajada (sin valoracion explícita): variación en rojo (mala por defecto)', () => {
    render(
      <TarjetaDelta
        titulo="Ganancia del mes"
        valor="$ 20.000,00"
        comparacion={{ tipo: 'normal', tendencia: 'bajada', variacion: '-8% vs. mes anterior' }}
      />,
    );

    const variacion = screen.getByText('-8% vs. mes anterior');
    expect(variacion.className).toContain('text-peligro');
  });

  it('la dirección se comunica por más de un canal: texto de variación Y flecha, no solo color', () => {
    const { container } = render(
      <TarjetaDelta
        titulo="Ganancia del mes"
        valor="$ 45.000,00"
        comparacion={{ tipo: 'normal', tendencia: 'subida', variacion: '+12% vs. mes anterior' }}
      />,
    );

    // Canal 1: el texto de la variación está en el DOM.
    expect(screen.getByText('+12% vs. mes anterior')).toBeInTheDocument();
    // Canal 2: además del color, hay un carácter de flecha decorativo presente.
    // Si alguien borra la flecha y deja solo la clase de color, este test falla.
    expect(container.textContent).toContain('▲');
  });

  it('flecha de bajada es distinta a la de subida', () => {
    const { container } = render(
      <TarjetaDelta
        titulo="Ganancia del mes"
        valor="$ 10.000,00"
        comparacion={{ tipo: 'normal', tendencia: 'bajada', variacion: '-5%' }}
      />,
    );

    expect(container.textContent).toContain('▼');
  });

  it('tendencia y valoracion desacopladas: sube pero es mala noticia (ej. merma del mes) → flecha ▲ con color de peligro', () => {
    const { container } = render(
      <TarjetaDelta
        titulo="Merma del mes"
        valor="1,8 kg"
        comparacion={{
          tipo: 'normal',
          tendencia: 'subida',
          valoracion: 'mala',
          variacion: '+20% vs. mes anterior',
        }}
      />,
    );

    // La flecha refleja el HECHO (subió): sigue siendo ▲, nunca ▼.
    expect(container.textContent).toContain('▲');
    expect(container.textContent).not.toContain('▼');
    // El color refleja el JUICIO (es malo): peligro, no éxito.
    const variacion = screen.getByText('+20% vs. mes anterior');
    expect(variacion.className).toContain('text-peligro');
    expect(variacion.className).not.toContain('text-exito');
  });

  it('tendencia y valoracion desacopladas: baja y es buena noticia (ej. costo promedio) → flecha ▼ con color de éxito', () => {
    const { container } = render(
      <TarjetaDelta
        titulo="Costo promedio"
        valor="$ 1.200,00"
        comparacion={{
          tipo: 'normal',
          tendencia: 'bajada',
          valoracion: 'buena',
          variacion: '-6% vs. mes anterior',
        }}
      />,
    );

    // La flecha refleja el HECHO (bajó): sigue siendo ▼, nunca ▲.
    expect(container.textContent).toContain('▼');
    expect(container.textContent).not.toContain('▲');
    // El color refleja el JUICIO (es bueno): éxito, no peligro.
    const variacion = screen.getByText('-6% vs. mes anterior');
    expect(variacion.className).toContain('text-exito');
    expect(variacion.className).not.toContain('text-peligro');
  });

  it("estado 'sin-base': no renderiza ningún % ni ∞, muestra el texto explicativo", () => {
    render(
      <TarjetaDelta
        titulo="Ganancia del mes"
        valor="$ 45.000,00"
        comparacion={{ tipo: 'sin-base' }}
      />,
    );

    expect(
      screen.getByText('Sin datos del período anterior para comparar'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/∞/)).not.toBeInTheDocument();
  });

  it("estado 'pocos-datos': muestra la variación (color/flecha) MÁS el rótulo de baja confianza", () => {
    const { container } = render(
      <TarjetaDelta
        titulo="Ganancia del mes"
        valor="$ 5.000,00"
        comparacion={{ tipo: 'pocos-datos', tendencia: 'subida', variacion: '+40%' }}
      />,
    );

    expect(screen.getByText('+40%')).toBeInTheDocument();
    expect(container.textContent).toContain('▲');
    expect(screen.getByText('Pocos datos para comparar')).toBeInTheDocument();
  });

  it('valor negativo o cero se muestra tal cual, sin lógica propia', () => {
    render(
      <TarjetaDelta
        titulo="Ganancia del mes"
        valor="-$ 500,00"
        comparacion={{ tipo: 'sin-base' }}
      />,
    );
    expect(screen.getByText('-$ 500,00')).toBeInTheDocument();
  });

  it('valor cero se muestra tal cual', () => {
    render(
      <TarjetaDelta
        titulo="Ganancia del mes"
        valor="$ 0,00"
        comparacion={{ tipo: 'normal', tendencia: 'igual', variacion: '0% vs. mes anterior' }}
      />,
    );
    expect(screen.getByText('$ 0,00')).toBeInTheDocument();
    expect(screen.getByText('0% vs. mes anterior')).toBeInTheDocument();
  });

  it('el ícono, si se pasa, es decorativo (aria-hidden)', () => {
    render(
      <TarjetaDelta
        titulo="Ganancia del mes"
        valor="$ 1.000,00"
        comparacion={{ tipo: 'sin-base' }}
        icono={<span data-testid="icono">*</span>}
      />,
    );
    const icono = screen.getByTestId('icono');
    expect(icono.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});
