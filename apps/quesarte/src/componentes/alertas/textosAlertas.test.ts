import { describe, expect, it } from 'vitest';
import {
  money,
  peso,
  type AlertaStockBajo,
  type AlertaVencimiento,
  type Alertas,
  type Pieza,
  type PiezaEnAlerta,
} from '@gestion/core';
import {
  detalleStockBajo,
  detalleVencimiento,
  loMasUrgente,
  textoCantidadPiezas,
  textoCantidadProductos,
  textoExistencia,
  textoPlazo,
  titularAlertas,
} from './textosAlertas';

function pieza(id: string): Pieza {
  return {
    id,
    productoId: 'p1',
    pesoInicialGramos: peso(5000),
    pesoRestanteGramos: peso(1600),
    costoKgCents: money(30000),
    fechaIngreso: new Date(2026, 0, 1),
    estado: 'disponible',
  };
}

function piezaEnAlerta(id: string, diasRestantes: number): PiezaEnAlerta {
  return { pieza: pieza(id), estado: 'vence_pronto', diasRestantes };
}

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

describe('textoPlazo', () => {
  it('hoy y mañana se nombran, no se cuentan en días', () => {
    expect(textoPlazo(0)).toBe('Vence hoy');
    expect(textoPlazo(1)).toBe('Vence mañana');
  });

  it('a partir de dos días cuenta días', () => {
    expect(textoPlazo(2)).toBe('Vence en 2 días');
    expect(textoPlazo(14)).toBe('Vence en 14 días');
  });

  it('vencido: ayer en singular, hace N días en plural', () => {
    expect(textoPlazo(-1)).toBe('Venció ayer');
    expect(textoPlazo(-5)).toBe('Venció hace 5 días');
  });
});

describe('textoExistencia', () => {
  it('peso: formatea con la unidad que corresponde a la magnitud', () => {
    expect(textoExistencia('peso', 400)).toBe('400 g');
    expect(textoExistencia('peso', 2500)).toBe('2,5 kg');
  });

  it('unidades: singular y plural', () => {
    expect(textoExistencia('unidades', 1)).toBe('1 unidad');
    expect(textoExistencia('unidades', 6)).toBe('6 unidades');
  });

  it('un umbral mal cargado (float) se redondea en vez de tumbar la pantalla', () => {
    // `umbralAlertaStock` es un `number` plano sin validación de entero en las
    // reglas: `peso()` lanzaría con 500.4 y se llevaría puesto todo el reporte.
    expect(textoExistencia('peso', 500.4)).toBe('500 g');
  });
});

describe('textoCantidadPiezas / textoCantidadProductos', () => {
  it('singular y plural', () => {
    expect(textoCantidadPiezas(1)).toBe('1 pieza');
    expect(textoCantidadPiezas(3)).toBe('3 piezas');
    expect(textoCantidadProductos(1)).toBe('1 producto');
    expect(textoCantidadProductos(4)).toBe('4 productos');
  });
});

describe('detalleVencimiento', () => {
  it('cuenta piezas EN ALERTA y su peso', () => {
    const alerta = alertaVencimiento({
      pesoEnAlertaGramos: peso(3200),
      piezas: [piezaEnAlerta('a', 2), piezaEnAlerta('b', 3)],
    });

    expect(detalleVencimiento(alerta)).toBe('2 piezas · 3,2 kg');
  });
});

describe('detalleStockBajo', () => {
  it('dice cuánto hay y cuál es el mínimo, en la misma unidad', () => {
    expect(detalleStockBajo(alertaStockBajo())).toBe('Quedan 400 g · mínimo 1 kg');
  });

  it('unidades', () => {
    expect(
      detalleStockBajo(alertaStockBajo({ magnitud: 'unidades', existencia: 2, umbral: 10 })),
    ).toBe('Quedan 2 unidades · mínimo 10 unidades');
  });
});

describe('titularAlertas', () => {
  it('sin nada que avisar devuelve null (el caso lo diseña la UI como buena noticia)', () => {
    expect(titularAlertas(SIN_ALERTAS)).toBeNull();
  });

  it('menciona SOLO lo que existe: no escribe "0 bajo el mínimo"', () => {
    expect(titularAlertas({ porVencer: [alertaVencimiento()], bajoUmbral: [] })).toBe(
      '1 producto por vencer',
    );
    expect(titularAlertas({ porVencer: [], bajoUmbral: [alertaStockBajo()] })).toBe(
      '1 producto bajo el mínimo',
    );
  });

  it('con las dos, las une', () => {
    expect(
      titularAlertas({
        porVencer: [alertaVencimiento(), alertaVencimiento({ productoId: 'p9' })],
        bajoUmbral: [alertaStockBajo()],
      }),
    ).toBe('2 productos por vencer · 1 producto bajo el mínimo');
  });
});

describe('loMasUrgente', () => {
  it('sin alertas: null', () => {
    expect(loMasUrgente(SIN_ALERTAS)).toBeNull();
  });

  it('un vencimiento le gana a un faltante: lo que vence se pierde, lo que falta se repone', () => {
    const alertas: Alertas = {
      porVencer: [alertaVencimiento({ nombreProducto: 'Colonia', diasRestantesMin: -2 })],
      bajoUmbral: [alertaStockBajo({ nombreProducto: 'Ricota' })],
    };

    expect(loMasUrgente(alertas)).toBe('Colonia: venció hace 2 días');
  });

  it('sin vencimientos, nombra el faltante más desabastecido', () => {
    expect(loMasUrgente({ porVencer: [], bajoUmbral: [alertaStockBajo()] })).toBe(
      'Ricota: quedan 400 g',
    );
  });
});
