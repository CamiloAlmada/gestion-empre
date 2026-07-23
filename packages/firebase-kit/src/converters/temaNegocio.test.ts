import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { esTemaValido, temaNegocioConverter, type TemaPersonalizado } from './temaNegocio';

function snapshotDe(datos: unknown): QueryDocumentSnapshot {
  return {
    id: 'tema',
    data: () => datos,
  } as unknown as QueryDocumentSnapshot;
}

const temaValido: TemaPersonalizado = { version: 1, matiz: 200, tinte: 'neutro' };

describe('esTemaValido', () => {
  it('acepta un tema con las 3 claves en rango', () => {
    expect(esTemaValido(temaValido)).toBe(true);
    expect(esTemaValido({ version: 1, matiz: 0, tinte: 'calido' })).toBe(true);
    expect(esTemaValido({ version: 1, matiz: 359, tinte: 'frio' })).toBe(true);
  });

  it('rechaza null, undefined, arrays y primitivos', () => {
    expect(esTemaValido(null)).toBe(false);
    expect(esTemaValido(undefined)).toBe(false);
    expect(esTemaValido([1, 2, 3])).toBe(false);
    expect(esTemaValido('tema')).toBe(false);
    expect(esTemaValido(42)).toBe(false);
  });

  it('rechaza version distinta de 1 (doc de una versión futura)', () => {
    expect(esTemaValido({ version: 2, matiz: 200, tinte: 'neutro' })).toBe(false);
  });

  it('rechaza matiz no entero, no finito o fuera de [0, 360)', () => {
    expect(esTemaValido({ version: 1, matiz: 200.5, tinte: 'neutro' })).toBe(false);
    expect(esTemaValido({ version: 1, matiz: Number.NaN, tinte: 'neutro' })).toBe(false);
    expect(esTemaValido({ version: 1, matiz: Number.POSITIVE_INFINITY, tinte: 'neutro' })).toBe(
      false,
    );
    expect(esTemaValido({ version: 1, matiz: -1, tinte: 'neutro' })).toBe(false);
    expect(esTemaValido({ version: 1, matiz: 360, tinte: 'neutro' })).toBe(false);
    expect(esTemaValido({ version: 1, matiz: '200', tinte: 'neutro' })).toBe(false);
  });

  it('rechaza tinte fuera del enum', () => {
    expect(esTemaValido({ version: 1, matiz: 200, tinte: 'oscuro' })).toBe(false);
  });

  it('rechaza claves faltantes', () => {
    expect(esTemaValido({ version: 1, matiz: 200 })).toBe(false);
    expect(esTemaValido({ matiz: 200, tinte: 'neutro' })).toBe(false);
  });

  it('rechaza claves extra (shape estricto: ni de más ni de menos)', () => {
    expect(esTemaValido({ version: 1, matiz: 200, tinte: 'neutro', extra: true })).toBe(false);
  });
});

describe('temaNegocioConverter.fromFirestore', () => {
  it('reconstruye el tema sin id (documento único de ruta fija)', () => {
    const tema = temaNegocioConverter.fromFirestore(snapshotDe(temaValido), {});
    expect(tema).toEqual(temaValido);
    expect(tema).not.toHaveProperty('id');
  });

  it('doc corrupto (tipo inválido en un campo) → null, no lanza', () => {
    const corrupto = { version: 1, matiz: 'no-es-numero', tinte: 'neutro' };
    expect(temaNegocioConverter.fromFirestore(snapshotDe(corrupto), {})).toBeNull();
  });

  it('version futura (app vieja leyendo doc nuevo) → null, no lanza', () => {
    const futuro = { version: 2, matiz: 200, tinte: 'neutro' };
    expect(temaNegocioConverter.fromFirestore(snapshotDe(futuro), {})).toBeNull();
  });

  it('claves extra en el doc → null, no lanza', () => {
    const conBasura = { version: 1, matiz: 200, tinte: 'neutro', color: 'rojo' };
    expect(temaNegocioConverter.fromFirestore(snapshotDe(conBasura), {})).toBeNull();
  });

  it('matiz fuera de rango → null, no lanza', () => {
    const fueraDeRango = { version: 1, matiz: 500, tinte: 'neutro' };
    expect(temaNegocioConverter.fromFirestore(snapshotDe(fueraDeRango), {})).toBeNull();
  });

  it('doc vacío o totalmente ajeno → null, no lanza', () => {
    expect(temaNegocioConverter.fromFirestore(snapshotDe({}), {})).toBeNull();
    expect(temaNegocioConverter.fromFirestore(snapshotDe({ foo: 'bar' }), {})).toBeNull();
  });
});

describe('temaNegocioConverter.toFirestore', () => {
  it('escribe exactamente las 3 claves, tal cual', () => {
    const doc = temaNegocioConverter.toFirestore(temaValido);
    expect(doc).toEqual({ version: 1, matiz: 200, tinte: 'neutro' });
  });

  it('round-trip: toFirestore » fromFirestore preserva los datos', () => {
    const doc = temaNegocioConverter.toFirestore(temaValido);
    const reconstruido = temaNegocioConverter.fromFirestore(snapshotDe(doc), {});
    expect(reconstruido).toEqual(temaValido);
  });

  it('con null (nunca ocurre en producción) devuelve un doc vacío en vez de lanzar', () => {
    const doc = temaNegocioConverter.toFirestore(null);
    expect(doc).toEqual({});
  });
});
