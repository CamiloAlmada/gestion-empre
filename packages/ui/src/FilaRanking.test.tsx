import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FilaRanking } from './FilaRanking';

afterEach(() => {
  cleanup();
});

describe('FilaRanking', () => {
  it('muestra etiqueta y valor', () => {
    render(<FilaRanking etiqueta="Queso Colonia" valor="$ 12.000,00" proporcion={60} />);
    expect(screen.getByText('Queso Colonia')).toBeInTheDocument();
    expect(screen.getByText('$ 12.000,00')).toBeInTheDocument();
  });

  it('la barra tiene el ancho proporcional esperado', () => {
    const { container } = render(
      <FilaRanking etiqueta="Queso Colonia" valor="$ 12.000,00" proporcion={42} />,
    );
    const barra = container.querySelector('[style*="width"]');
    expect(barra).not.toBeNull();
    expect((barra as HTMLElement).style.width).toBe('42%');
  });

  it('etiqueta larga no rompe la fila: lleva truncado y min-w-0/flex-1 en el contenedor', () => {
    const etiquetaLarga =
      'Queso Colonia curado especial de la sierra con hierbas y aceite de oliva extra virgen';
    render(<FilaRanking etiqueta={etiquetaLarga} valor="$ 1.000,00" proporcion={10} />);

    const etiquetaEl = screen.getByText(etiquetaLarga);
    expect(etiquetaEl.className).toContain('truncate');
    const contenedor = etiquetaEl.parentElement;
    expect(contenedor?.className).toContain('min-w-0');
    expect(contenedor?.className).toContain('flex-1');
  });

  it('muestra valorSecundario cuando se pasa', () => {
    render(
      <FilaRanking
        etiqueta="Queso Colonia"
        valor="$ 12.000,00"
        proporcion={60}
        valorSecundario="32% margen"
      />,
    );
    expect(screen.getByText('32% margen')).toBeInTheDocument();
  });

  it('no deja hueco raro cuando valorSecundario no se pasa (no renderiza nodo vacío)', () => {
    const { container } = render(
      <FilaRanking etiqueta="Queso Colonia" valor="$ 12.000,00" proporcion={60} />,
    );
    // Solo debe existir el párrafo del valor principal en esa columna, ningún <p> extra vacío.
    const parrafos = container.querySelectorAll('p');
    expect(parrafos.length).toBe(2); // etiqueta + valor principal
  });

  it('clampea proporcion por encima de 100 a 100', () => {
    const { container } = render(
      <FilaRanking etiqueta="Queso Colonia" valor="$ 12.000,00" proporcion={150} />,
    );
    const barra = container.querySelector('[style*="width"]') as HTMLElement;
    expect(barra.style.width).toBe('100%');
  });

  it('clampea proporcion negativa a 0', () => {
    const { container } = render(
      <FilaRanking etiqueta="Queso Colonia" valor="$ 12.000,00" proporcion={-20} />,
    );
    const barra = container.querySelector('[style*="width"]') as HTMLElement;
    expect(barra.style.width).toBe('0%');
  });

  it('números visibles llevan tabular-nums', () => {
    render(
      <FilaRanking
        etiqueta="Queso Colonia"
        valor="$ 12.000,00"
        proporcion={60}
        valorSecundario="32% margen"
      />,
    );
    expect(screen.getByText('$ 12.000,00').className).toContain('tabular-nums');
    expect(screen.getByText('32% margen').className).toContain('tabular-nums');
  });
});
