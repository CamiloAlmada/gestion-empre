import { describe, it, expect } from 'vitest';
import {
  periodoDe,
  periodoAnterior,
  agruparPorPeriodo,
  variacionPorcentual,
  dentroDePeriodo,
  periodoEnCurso,
  periodoAnteriorComparable,
} from './periodo.js';

/** Montevideo: UTC-3, sin horario de verano. */
const OFFSET_UY = -180;

describe('periodoDe — día', () => {
  it('mapea un instante UTC al día local, no al día UTC', () => {
    // 2026-07-24T02:00:00Z es 2026-07-23T23:00:00 en Montevideo (UTC-3):
    // el día UTC (24) y el día local (23) difieren, y tiene que ganar el local.
    const fecha = new Date('2026-07-24T02:00:00Z');
    const periodo = periodoDe(fecha, 'dia', OFFSET_UY);
    expect(periodo.desde.toISOString()).toBe('2026-07-23T03:00:00.000Z');
    expect(periodo.hasta.toISOString()).toBe('2026-07-24T03:00:00.000Z');
  });

  it('con offset 0 (UTC), el día coincide con el día UTC', () => {
    const fecha = new Date('2026-07-24T15:30:00Z');
    const periodo = periodoDe(fecha, 'dia', 0);
    expect(periodo.desde.toISOString()).toBe('2026-07-24T00:00:00.000Z');
    expect(periodo.hasta.toISOString()).toBe('2026-07-25T00:00:00.000Z');
  });
});

describe('periodoDe — semana (empieza lunes, ISO)', () => {
  it('2026-07-24 es viernes → la semana va de 2026-07-20 (lunes) a 2026-07-27', () => {
    const fecha = new Date('2026-07-24T15:00:00Z'); // viernes, bien adentro del día en cualquier huso
    const periodo = periodoDe(fecha, 'semana', OFFSET_UY);
    expect(periodo.desde.toISOString()).toBe('2026-07-20T03:00:00.000Z');
    expect(periodo.hasta.toISOString()).toBe('2026-07-27T03:00:00.000Z');
  });

  it('un lunes cae en la semana que empieza ESE día', () => {
    const lunes = new Date('2026-07-20T15:00:00Z');
    const periodo = periodoDe(lunes, 'semana', OFFSET_UY);
    expect(periodo.desde.toISOString()).toBe('2026-07-20T03:00:00.000Z');
  });

  it('un domingo cae en la semana que empezó el lunes anterior', () => {
    const domingo = new Date('2026-07-26T15:00:00Z');
    const periodo = periodoDe(domingo, 'semana', OFFSET_UY);
    expect(periodo.desde.toISOString()).toBe('2026-07-20T03:00:00.000Z');
    expect(periodo.hasta.toISOString()).toBe('2026-07-27T03:00:00.000Z');
  });
});

describe('periodoDe — mes', () => {
  it('un día cualquiera del mes cae en [1º del mes, 1º del mes siguiente)', () => {
    const fecha = new Date('2026-07-24T15:00:00Z');
    const periodo = periodoDe(fecha, 'mes', OFFSET_UY);
    expect(periodo.desde.toISOString()).toBe('2026-07-01T03:00:00.000Z');
    expect(periodo.hasta.toISOString()).toBe('2026-08-01T03:00:00.000Z');
  });

  it('diciembre pasa a enero del año siguiente', () => {
    const fecha = new Date('2026-12-15T15:00:00Z');
    const periodo = periodoDe(fecha, 'mes', OFFSET_UY);
    expect(periodo.desde.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(periodo.hasta.toISOString()).toBe('2027-01-01T03:00:00.000Z');
  });
});

describe('periodoDe — validación', () => {
  it('lanza RangeError con fecha inválida', () => {
    expect(() => periodoDe(new Date('no-es-fecha'), 'dia', OFFSET_UY)).toThrow(RangeError);
  });

  it('lanza RangeError con offsetMinutos no finito', () => {
    expect(() => periodoDe(new Date(), 'dia', NaN)).toThrow(RangeError);
    expect(() => periodoDe(new Date(), 'dia', Infinity)).toThrow(RangeError);
  });
});

describe('periodoAnterior', () => {
  it('día: el día inmediatamente anterior', () => {
    const hoy = periodoDe(new Date('2026-07-24T15:00:00Z'), 'dia', OFFSET_UY);
    const ayer = periodoAnterior(hoy, 'dia', OFFSET_UY);
    expect(ayer.desde.toISOString()).toBe('2026-07-23T03:00:00.000Z');
    expect(ayer.hasta.toISOString()).toBe(hoy.desde.toISOString());
  });

  it('semana: la semana inmediatamente anterior', () => {
    const estaSemana = periodoDe(new Date('2026-07-24T15:00:00Z'), 'semana', OFFSET_UY);
    const semanaAnterior = periodoAnterior(estaSemana, 'semana', OFFSET_UY);
    expect(semanaAnterior.desde.toISOString()).toBe('2026-07-13T03:00:00.000Z');
    expect(semanaAnterior.hasta.toISOString()).toBe(estaSemana.desde.toISOString());
  });

  it('mes: enero retrocede a diciembre del año anterior (largo de mes variable)', () => {
    const enero = periodoDe(new Date('2027-01-15T15:00:00Z'), 'mes', OFFSET_UY);
    const diciembre = periodoAnterior(enero, 'mes', OFFSET_UY);
    expect(diciembre.desde.toISOString()).toBe('2026-12-01T03:00:00.000Z');
    expect(diciembre.hasta.toISOString()).toBe(enero.desde.toISOString());
  });

  it('mes: marzo retrocede a febrero (28 días) sin arrastrar día del mes', () => {
    const marzo = periodoDe(new Date('2026-03-15T15:00:00Z'), 'mes', OFFSET_UY);
    const febrero = periodoAnterior(marzo, 'mes', OFFSET_UY);
    expect(febrero.desde.toISOString()).toBe('2026-02-01T03:00:00.000Z');
    expect(febrero.hasta.toISOString()).toBe('2026-03-01T03:00:00.000Z');
  });
});

describe('agruparPorPeriodo', () => {
  interface Evento {
    id: string;
    fecha: Date;
  }

  it('agrupa por día y ordena los buckets cronológicamente', () => {
    const eventos: Evento[] = [
      { id: 'b1', fecha: new Date('2026-07-24T12:00:00Z') },
      { id: 'a1', fecha: new Date('2026-07-23T12:00:00Z') },
      { id: 'b2', fecha: new Date('2026-07-24T20:00:00Z') },
    ];
    const buckets = agruparPorPeriodo(eventos, (e) => e.fecha, 'dia', OFFSET_UY);

    expect(buckets).toHaveLength(2);
    expect(buckets[0]!.items.map((e) => e.id)).toEqual(['a1']);
    expect(buckets[1]!.items.map((e) => e.id)).toEqual(['b1', 'b2']);
    expect(buckets[0]!.periodo.desde.getTime()).toBeLessThan(buckets[1]!.periodo.desde.getTime());
  });

  it('lista vacía → sin buckets', () => {
    expect(agruparPorPeriodo<Evento>([], (e) => e.fecha, 'dia', OFFSET_UY)).toEqual([]);
  });

  it('no rellena huecos: un día sin items no genera bucket vacío', () => {
    const eventos: Evento[] = [
      { id: 'x', fecha: new Date('2026-07-20T12:00:00Z') },
      { id: 'y', fecha: new Date('2026-07-24T12:00:00Z') }, // 4 días después, sin nada en el medio
    ];
    const buckets = agruparPorPeriodo(eventos, (e) => e.fecha, 'dia', OFFSET_UY);
    expect(buckets).toHaveLength(2);
  });
});

describe('variacionPorcentual — sin base', () => {
  it('anterior sin datos (cantidadDatos 0) → sin-base, sin importar el valor', () => {
    const r = variacionPorcentual({ valor: 50_000, cantidadDatos: 10 }, { valor: 0, cantidadDatos: 0 });
    expect(r).toEqual({ tipo: 'sin-base' });
  });

  it('anterior con datos pero valor 0 → sin-base (división indefinida, no +∞)', () => {
    const r = variacionPorcentual({ valor: 50_000, cantidadDatos: 10 }, { valor: 0, cantidadDatos: 3 });
    expect(r).toEqual({ tipo: 'sin-base' });
  });
});

describe('variacionPorcentual — normal', () => {
  it('sube 50% con base suficiente en ambos períodos', () => {
    const r = variacionPorcentual(
      { valor: 150_00, cantidadDatos: 20 },
      { valor: 100_00, cantidadDatos: 20 },
    );
    expect(r).toEqual({ tipo: 'normal', variacionBps: 5000 });
  });

  it('baja 20%', () => {
    const r = variacionPorcentual(
      { valor: 80_00, cantidadDatos: 20 },
      { valor: 100_00, cantidadDatos: 20 },
    );
    expect(r).toEqual({ tipo: 'normal', variacionBps: -2000 });
  });

  it('sin cambio → variacionBps 0', () => {
    const r = variacionPorcentual(
      { valor: 100_00, cantidadDatos: 20 },
      { valor: 100_00, cantidadDatos: 20 },
    );
    expect(r).toEqual({ tipo: 'normal', variacionBps: 0 });
  });
});

describe('variacionPorcentual — pocos datos', () => {
  it('con menos del umbral por defecto (5) en el período actual → pocos-datos', () => {
    const r = variacionPorcentual(
      { valor: 150_00, cantidadDatos: 2 },
      { valor: 100_00, cantidadDatos: 20 },
    );
    expect(r).toEqual({ tipo: 'pocos-datos', variacionBps: 5000 });
  });

  it('con menos del umbral en el período anterior → pocos-datos', () => {
    const r = variacionPorcentual(
      { valor: 150_00, cantidadDatos: 20 },
      { valor: 100_00, cantidadDatos: 4 },
    );
    expect(r.tipo).toBe('pocos-datos');
  });

  it('umbral custom: 2 datos alcanzan si umbralPocosDatos es 1', () => {
    const r = variacionPorcentual(
      { valor: 150_00, cantidadDatos: 2 },
      { valor: 100_00, cantidadDatos: 2 },
      { umbralPocosDatos: 1 },
    );
    expect(r).toEqual({ tipo: 'normal', variacionBps: 5000 });
  });
});

describe('variacionPorcentual — validación', () => {
  it('lanza RangeError con umbralPocosDatos inválido', () => {
    const actual = { valor: 100, cantidadDatos: 10 };
    const anterior = { valor: 100, cantidadDatos: 10 };
    expect(() => variacionPorcentual(actual, anterior, { umbralPocosDatos: -1 })).toThrow(RangeError);
    expect(() => variacionPorcentual(actual, anterior, { umbralPocosDatos: NaN })).toThrow(RangeError);
  });
});

describe('dentroDePeriodo', () => {
  const periodo = periodoDe(new Date('2026-07-24T15:00:00Z'), 'dia', OFFSET_UY);

  it('el borde `desde` es inclusive', () => {
    expect(dentroDePeriodo(periodo.desde, periodo)).toBe(true);
  });

  it('el borde `hasta` es exclusivo', () => {
    expect(dentroDePeriodo(periodo.hasta, periodo)).toBe(false);
  });

  it('un instante en el medio cae adentro', () => {
    const medio = new Date(periodo.desde.getTime() + 1000);
    expect(dentroDePeriodo(medio, periodo)).toBe(true);
  });

  it('antes de `desde` o después de `hasta` cae afuera', () => {
    expect(dentroDePeriodo(new Date(periodo.desde.getTime() - 1), periodo)).toBe(false);
    expect(dentroDePeriodo(new Date(periodo.hasta.getTime() + 1), periodo)).toBe(false);
  });
});

describe('periodoEnCurso', () => {
  const periodo = periodoDe(new Date('2026-07-24T15:00:00Z'), 'dia', OFFSET_UY);

  it('ahora antes de que cierre → en curso', () => {
    expect(periodoEnCurso(periodo, new Date(periodo.hasta.getTime() - 1))).toBe(true);
  });

  it('ahora exactamente en el límite → cerrado (no en curso)', () => {
    expect(periodoEnCurso(periodo, periodo.hasta)).toBe(false);
  });

  it('ahora después del límite → cerrado', () => {
    expect(periodoEnCurso(periodo, new Date(periodo.hasta.getTime() + 1))).toBe(false);
  });

  it('lanza RangeError con `ahora` inválido', () => {
    expect(() => periodoEnCurso(periodo, new Date('no-es-fecha'))).toThrow(RangeError);
  });
});

describe('periodoAnteriorComparable', () => {
  it('mes en curso (día 3, 11hs): trunca el mes anterior a la MISMA porción transcurrida — el caso exacto del sesgo a corregir', () => {
    // Julio en curso, el 3 a las 11 de la mañana (hora de Montevideo): 2 días y
    // 11 horas transcurridas del mes. Comparar contra junio ENTERO (30 días)
    // siempre mostraría una caída falsa — la corrección trunca junio a esos
    // mismos 2 días y 11 horas, medidos desde su propio inicio.
    const julioEnCurso = periodoDe(new Date('2026-07-24T00:00:00Z'), 'mes', OFFSET_UY); // límites del mes, no depende del día
    const ahora = new Date('2026-07-03T14:00:00Z'); // 03/07 11:00 en Montevideo (UTC-3)
    const junioCompleto = periodoAnterior(julioEnCurso, 'mes', OFFSET_UY);

    const comparable = periodoAnteriorComparable(julioEnCurso, junioCompleto, ahora);

    expect(comparable.desde.toISOString()).toBe(junioCompleto.desde.toISOString());
    // Mismo "tamaño" que lo transcurrido de julio (2 días y 11 horas desde el
    // 1º de julio 00:00 local), pero contado desde el 1º de junio.
    expect(comparable.hasta.toISOString()).toBe('2026-06-03T14:00:00.000Z');
    // Nunca junio completo: eso sería la comparación deshonesta original.
    expect(comparable.hasta.toISOString()).not.toBe(junioCompleto.hasta.toISOString());
  });

  it('período YA CERRADO: devuelve el período anterior completo sin truncar (nada que corregir)', () => {
    const hoy = periodoDe(new Date('2026-07-24T15:00:00Z'), 'dia', OFFSET_UY);
    const ayer = periodoAnterior(hoy, 'dia', OFFSET_UY);
    const ahoraDespuesDeCerrar = hoy.hasta; // límite exacto: cerrado, ver periodoEnCurso

    const comparable = periodoAnteriorComparable(hoy, ayer, ahoraDespuesDeCerrar);

    expect(comparable).toEqual(ayer);
  });

  it('clampea a la duración del período anterior si es MÁS CORTO que lo transcurrido (marzo día 31 vs. febrero de 28 días)', () => {
    const marzo = periodoDe(new Date('2026-03-15T12:00:00Z'), 'mes', OFFSET_UY);
    const febrero = periodoAnterior(marzo, 'mes', OFFSET_UY); // 28 días (2026 no es bisiesto)
    const casiFinDeMarzo = new Date(marzo.hasta.getTime() - 1); // en curso, a un ms de cerrar (~31 días transcurridos)

    const comparable = periodoAnteriorComparable(marzo, febrero, casiFinDeMarzo);

    // No se puede truncar "más" que febrero entero: el resultado es febrero completo.
    expect(comparable).toEqual(febrero);
  });

  it('lanza RangeError con alguna fecha inválida', () => {
    const periodo = periodoDe(new Date('2026-07-24T15:00:00Z'), 'dia', OFFSET_UY);
    const anterior = periodoAnterior(periodo, 'dia', OFFSET_UY);
    expect(() => periodoAnteriorComparable(periodo, anterior, new Date('no-es-fecha'))).toThrow(
      RangeError,
    );
  });
});
