import { describe, it, expect } from 'vitest';
import { elegirPieza } from './fifo.js';
import { money } from './money.js';
import { peso, type Peso } from './peso.js';
import type { EstadoPieza, Pieza } from './tipos.js';

/** Factory de piezas para tests: defaults sensatos, se sobrescribe lo relevante. */
function crearPieza(
  props: { id: string; fechaIngreso: Date; pesoRestanteGramos?: Peso; estado?: EstadoPieza },
): Pieza {
  return {
    id: props.id,
    productoId: 'queso-colonia',
    pesoInicialGramos: peso(1000),
    pesoRestanteGramos: props.pesoRestanteGramos ?? peso(1000),
    costoKgCents: money(30000),
    fechaIngreso: props.fechaIngreso,
    estado: props.estado ?? 'disponible',
  };
}

const D1 = new Date('2026-01-01T10:00:00Z');
const D2 = new Date('2026-01-05T10:00:00Z');
const D3 = new Date('2026-01-10T10:00:00Z');

describe('elegirPieza — selección FIFO', () => {
  it('elige la disponible más antigua entre varias', () => {
    const piezas = [
      crearPieza({ id: 'c', fechaIngreso: D3 }),
      crearPieza({ id: 'a', fechaIngreso: D1 }),
      crearPieza({ id: 'b', fechaIngreso: D2 }),
    ];
    expect(elegirPieza(piezas, peso(200))?.pieza.id).toBe('a');
  });

  it('con una sola pieza disponible la elige', () => {
    const piezas = [crearPieza({ id: 'unica', fechaIngreso: D2 })];
    expect(elegirPieza(piezas, peso(200))?.pieza.id).toBe('unica');
  });

  it('saltea piezas agotadas y merma_total aunque sean más antiguas', () => {
    const piezas = [
      crearPieza({ id: 'vieja-agotada', fechaIngreso: D1, estado: 'agotada' }),
      crearPieza({ id: 'vieja-merma', fechaIngreso: D1, estado: 'merma_total' }),
      crearPieza({ id: 'disponible', fechaIngreso: D2, estado: 'disponible' }),
    ];
    expect(elegirPieza(piezas, peso(200))?.pieza.id).toBe('disponible');
  });

  it('saltea piezas disponibles con peso restante 0 aunque sean más antiguas', () => {
    const piezas = [
      crearPieza({ id: 'vieja-vacia', fechaIngreso: D1, pesoRestanteGramos: peso(0) }),
      crearPieza({ id: 'con-peso', fechaIngreso: D2 }),
    ];
    expect(elegirPieza(piezas, peso(200))?.pieza.id).toBe('con-peso');
  });

  it('desempata fechas iguales por id ascendente', () => {
    const piezas = [
      crearPieza({ id: 'z', fechaIngreso: D1 }),
      crearPieza({ id: 'm', fechaIngreso: D1 }),
      crearPieza({ id: 'a', fechaIngreso: D1 }),
    ];
    expect(elegirPieza(piezas, peso(200))?.pieza.id).toBe('a');
  });
});

describe('elegirPieza — sin candidata devuelve null', () => {
  it('array vacío', () => {
    expect(elegirPieza([], peso(200))).toBeNull();
  });

  it('ninguna disponible (todas agotadas / merma / peso 0)', () => {
    const piezas = [
      crearPieza({ id: 'a', fechaIngreso: D1, estado: 'agotada' }),
      crearPieza({ id: 'b', fechaIngreso: D2, estado: 'merma_total' }),
      crearPieza({ id: 'c', fechaIngreso: D3, pesoRestanteGramos: peso(0) }),
    ];
    expect(elegirPieza(piezas, peso(200))).toBeNull();
  });
});

describe('elegirPieza — indicador de suficiencia', () => {
  it('suficiente cuando el peso restante supera lo solicitado', () => {
    const piezas = [crearPieza({ id: 'a', fechaIngreso: D1, pesoRestanteGramos: peso(500) })];
    expect(elegirPieza(piezas, peso(200))?.suficiente).toBe(true);
  });

  it('suficiente cuando el peso restante iguala exactamente lo solicitado', () => {
    const piezas = [crearPieza({ id: 'a', fechaIngreso: D1, pesoRestanteGramos: peso(200) })];
    expect(elegirPieza(piezas, peso(200))?.suficiente).toBe(true);
  });

  it('insuficiente cuando el peso restante no alcanza', () => {
    const piezas = [crearPieza({ id: 'a', fechaIngreso: D1, pesoRestanteGramos: peso(150) })];
    const resultado = elegirPieza(piezas, peso(200));
    expect(resultado?.pieza.id).toBe('a');
    expect(resultado?.suficiente).toBe(false);
  });
});

describe('elegirPieza — no muta la entrada', () => {
  it('mantiene el array y el orden originales', () => {
    const piezas = [
      crearPieza({ id: 'c', fechaIngreso: D3 }),
      crearPieza({ id: 'a', fechaIngreso: D1 }),
      crearPieza({ id: 'b', fechaIngreso: D2 }),
    ];
    const referencias = [...piezas];
    const ordenPrevio = piezas.map((p) => p.id);

    elegirPieza(piezas, peso(200));

    expect(piezas).toHaveLength(3);
    expect(piezas.map((p) => p.id)).toEqual(ordenPrevio);
    piezas.forEach((p, i) => expect(p).toBe(referencias[i]));
  });
});
