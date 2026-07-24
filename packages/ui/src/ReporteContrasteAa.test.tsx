import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { generarPaleta } from '@gestion/core';
import { ReporteContrasteAa } from './ReporteContrasteAa';

afterEach(cleanup);

// Reporte REAL del motor (no maqueta a mano): ejercita el shape completo de
// ReporteContraste tal como lo produce generarPaleta.
const REPORTE = generarPaleta({ version: 1, matiz: 78, tinte: 'neutro' }).reporte;

describe('ReporteContrasteAa', () => {
  it('muestra la línea de éxito ("todos los pares cumplen AA") siempre — no hay estado de fallo', () => {
    render(<ReporteContrasteAa reporte={REPORTE} />);

    expect(screen.getByText(/Contraste verificado: todos los pares cumplen AA/)).toBeInTheDocument();
  });

  it('el detalle está plegado por defecto (details sin "open") y se puede desplegar', () => {
    render(<ReporteContrasteAa reporte={REPORTE} />);

    const details = screen.getByText('Ver detalle').closest('details');
    expect(details).not.toBeNull();
    expect((details as HTMLDetailsElement).open).toBe(false);
  });

  it('el detalle desplegado incluye una fila por cada resultado del reporte real, con uso/modo/ratio(2 decimales)/umbral', () => {
    render(<ReporteContrasteAa reporte={REPORTE} />);

    const details = screen.getByText('Ver detalle').closest('details') as HTMLDetailsElement;
    details.open = true;
    fireEvent(details, new Event('toggle'));

    const primero = REPORTE.resultados[0];
    if (!primero) throw new Error('fixture: el reporte real no tiene resultados');

    expect(screen.getAllByText(primero.uso).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`${primero.ratio.toFixed(2)}:1`).length).toBeGreaterThan(0);

    // Todos los pares del reporte real están representados (34 pares hoy).
    expect(REPORTE.resultados.length).toBeGreaterThan(0);
    for (const r of REPORTE.resultados) {
      expect(screen.getAllByText(r.uso).length).toBeGreaterThan(0);
    }
  });

  it('la tabla es accesible por su etiqueta ("Detalle de contraste AA")', () => {
    render(<ReporteContrasteAa reporte={REPORTE} />);
    expect(screen.getByRole('table', { name: 'Detalle de contraste AA' })).toBeInTheDocument();
  });
});
