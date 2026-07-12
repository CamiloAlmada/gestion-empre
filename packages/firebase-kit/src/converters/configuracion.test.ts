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
});
