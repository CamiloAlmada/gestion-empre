import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { peso, type Configuracion } from '@gestion/core';
import { configuracionConverter } from './configuracion';

function snapshotDe(id: string, datos: unknown): QueryDocumentSnapshot {
  return {
    id,
    data: () => datos,
  } as unknown as QueryDocumentSnapshot;
}

const docCompleto = {
  nombreNegocio: 'Quesarte',
  umbralPiezaAgotadaGramos: 50,
  metodoProrrateo: 'por_valor',
};

describe('configuracionConverter.fromFirestore', () => {
  it('reconstruye la configuración sin id (no es una entidad trazable por id)', () => {
    const configuracion = configuracionConverter.fromFirestore(
      snapshotDe('general', docCompleto),
      {},
    );

    expect(configuracion).toEqual({
      nombreNegocio: 'Quesarte',
      umbralPiezaAgotadaGramos: 50,
      metodoProrrateo: 'por_valor',
    });
    expect(configuracion).not.toHaveProperty('id');
  });

  it('rechaza umbralPiezaAgotadaGramos no entero (doc corrupto)', () => {
    const docCorrupto = { ...docCompleto, umbralPiezaAgotadaGramos: 50.5 };
    expect(() =>
      configuracionConverter.fromFirestore(snapshotDe('general', docCorrupto), {}),
    ).toThrow(RangeError);
  });

  it('reconstruye codigoPaisDefault (doc 08) cuando está presente', () => {
    const conCodigo = { ...docCompleto, codigoPaisDefault: '598' };
    const configuracion = configuracionConverter.fromFirestore(snapshotDe('general', conCodigo), {});
    expect(configuracion.codigoPaisDefault).toBe('598');
  });

  it('codigoPaisDefault ausente (config previa a WA) queda undefined', () => {
    const configuracion = configuracionConverter.fromFirestore(snapshotDe('general', docCompleto), {});
    expect(configuracion.codigoPaisDefault).toBeUndefined();
  });

  // WA-B2: el doc se escribe con merge parcial (las 4 claves son opcionales en las
  // reglas). fromFirestore debe tolerar CUALQUIER subconjunto sin romper.
  it('doc VACÍO (instalación recién creada) → todas las claves undefined, sin error', () => {
    const configuracion = configuracionConverter.fromFirestore(snapshotDe('general', {}), {});
    expect(configuracion).toEqual({
      nombreNegocio: undefined,
      umbralPiezaAgotadaGramos: undefined,
      metodoProrrateo: undefined,
      codigoPaisDefault: undefined,
    });
  });

  it('doc SOLO-WhatsApp {nombreNegocio, codigoPaisDefault} (escenario de fallo) NO rompe', () => {
    const soloWa = { nombreNegocio: 'Quesarte', codigoPaisDefault: '598' };
    const configuracion = configuracionConverter.fromFirestore(snapshotDe('general', soloWa), {});
    expect(configuracion.nombreNegocio).toBe('Quesarte');
    expect(configuracion.codigoPaisDefault).toBe('598');
    // Ausentes: sin `peso()` sobre undefined, sin RangeError.
    expect(configuracion.umbralPiezaAgotadaGramos).toBeUndefined();
    expect(configuracion.metodoProrrateo).toBeUndefined();
  });

  it('doc SOLO-Fase2 {umbralPiezaAgotadaGramos, metodoProrrateo} se reconstruye igual', () => {
    const soloFase2 = { umbralPiezaAgotadaGramos: 50, metodoProrrateo: 'por_peso' };
    const configuracion = configuracionConverter.fromFirestore(snapshotDe('general', soloFase2), {});
    expect(configuracion.umbralPiezaAgotadaGramos).toBe(50);
    expect(configuracion.metodoProrrateo).toBe('por_peso');
    expect(configuracion.nombreNegocio).toBeUndefined();
    expect(configuracion.codigoPaisDefault).toBeUndefined();
  });

  it('umbral PRESENTE pero float sigue explotando aunque el resto falte (tipo inválido)', () => {
    // Presente-pero-inválido conserva el comportamiento anterior: falla al leer.
    expect(() =>
      configuracionConverter.fromFirestore(snapshotDe('general', { umbralPiezaAgotadaGramos: 5.5 }), {}),
    ).toThrow(RangeError);
  });
});

describe('configuracionConverter.toFirestore', () => {
  const configuracion: Configuracion = {
    nombreNegocio: 'Quesarte',
    umbralPiezaAgotadaGramos: peso(50),
    metodoProrrateo: 'por_valor',
  };

  it('round-trip: toFirestore » fromFirestore preserva los datos', () => {
    const doc = configuracionConverter.toFirestore(configuracion);
    const reconstruido = configuracionConverter.fromFirestore(snapshotDe('general', doc), {});

    expect(reconstruido).toEqual(configuracion);
  });

  it('omite codigoPaisDefault del doc cuando es undefined (nunca null)', () => {
    const doc = configuracionConverter.toFirestore(configuracion);
    expect(doc).not.toHaveProperty('codigoPaisDefault');
  });

  it('round-trip con codigoPaisDefault presente', () => {
    const conCodigo: Configuracion = { ...configuracion, codigoPaisDefault: '598' };
    const doc = configuracionConverter.toFirestore(conCodigo);
    expect(doc.codigoPaisDefault).toBe('598');
    const reconstruido = configuracionConverter.fromFirestore(snapshotDe('general', doc), {});
    expect(reconstruido).toEqual(conCodigo);
  });

  it('config PARCIAL solo escribe las claves presentes (omite las undefined)', () => {
    const parcial: Configuracion = { nombreNegocio: 'Quesarte', codigoPaisDefault: '598' };
    const doc = configuracionConverter.toFirestore(parcial);
    expect(doc).toEqual({ nombreNegocio: 'Quesarte', codigoPaisDefault: '598' });
    expect(doc).not.toHaveProperty('umbralPiezaAgotadaGramos');
    expect(doc).not.toHaveProperty('metodoProrrateo');
  });
});
