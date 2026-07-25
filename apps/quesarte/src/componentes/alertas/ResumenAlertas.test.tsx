import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { peso, type AlertaStockBajo, type AlertaVencimiento, type Alertas } from '@gestion/core';
import { ResumenAlertas } from './ResumenAlertas';

function alertaVencimiento(over: Partial<AlertaVencimiento> = {}): AlertaVencimiento {
  return {
    productoId: 'p1',
    nombreProducto: 'Colonia',
    peorEstado: 'vence_pronto',
    diasRestantesMin: 3,
    pesoEnAlertaGramos: peso(2500),
    piezas: [],
    ...over,
  };
}

function alertaStockBajo(over: Partial<AlertaStockBajo> = {}): AlertaStockBajo {
  return {
    productoId: 'p2',
    nombreProducto: 'Ricota',
    magnitud: 'peso',
    existencia: 400,
    umbral: 1000,
    proporcionDelUmbral: 0.4,
    ...over,
  };
}

const SIN_ALERTAS: Alertas = { porVencer: [], bajoUmbral: [] };

function montar(props: Partial<Parameters<typeof ResumenAlertas>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ResumenAlertas
        alertas={SIN_ALERTAS}
        cargando={false}
        hayError={false}
        onReintentar={() => {}}
        diasAviso={7}
        {...props}
      />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe('ResumenAlertas', () => {
  it('cargando: lo dice, no muestra un conteo provisorio', () => {
    montar({ cargando: true });

    expect(screen.getByText(/Revisando vencimientos y stock/)).toBeTruthy();
    expect(screen.queryByText(/Todo en orden/)).toBeNull();
  });

  it('error: mensaje accionable con role="alert" y botón de reintento', () => {
    const onReintentar = vi.fn();
    montar({ hayError: true, onReintentar });

    expect(screen.getByRole('alert').textContent).toMatch(/Revisá tu conexión/);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onReintentar).toHaveBeenCalled();
  });

  // "No hay nada para avisar" es una BUENA NOTICIA (criterio del brief de B3):
  // se afirma, con la ventana que respalda la afirmación, y no se linkea a un
  // detalle vacío.
  it('sin alertas: afirma que está todo en orden y nombra la ventana de días', () => {
    montar({ diasAviso: 10 });

    expect(screen.getByText('Todo en orden')).toBeTruthy();
    expect(screen.getByText(/próximos 10 días/)).toBeTruthy();
  });

  it('sin alertas: no es un link (no hay detalle que valga el viaje)', () => {
    montar();

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('con alertas: muestra el conteo y linkea al detalle', () => {
    montar({ alertas: { porVencer: [alertaVencimiento()], bajoUmbral: [alertaStockBajo()] } });

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/reportes/alertas');
    expect(screen.getByText('1 producto por vencer · 1 producto bajo el mínimo')).toBeTruthy();
  });

  it('con alertas: la segunda línea nombra lo más urgente', () => {
    montar({
      alertas: {
        porVencer: [alertaVencimiento({ nombreProducto: 'Colonia', diasRestantesMin: 0 })],
        bajoUmbral: [],
      },
    });

    expect(screen.getByText('Colonia: vence hoy')).toBeTruthy();
  });

  it('el estado nunca se comunica solo por color: siempre hay texto', () => {
    montar({ alertas: { porVencer: [], bajoUmbral: [alertaStockBajo()] } });

    // El único glifo es decorativo (aria-hidden); la información está escrita.
    expect(screen.getByText('1 producto bajo el mínimo')).toBeTruthy();
  });
});
