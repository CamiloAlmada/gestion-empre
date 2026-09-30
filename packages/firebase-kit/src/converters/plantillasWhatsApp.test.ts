import { describe, expect, it } from 'vitest';
import type { QueryDocumentSnapshot } from 'firebase/firestore';
import { PLANTILLAS_SEED, type PlantillaWhatsApp } from '@gestion/core';
import { plantillasWhatsAppConverter } from './plantillasWhatsApp';

function snapshotDe(datos: unknown): QueryDocumentSnapshot {
  return {
    id: 'plantillasWhatsApp',
    data: () => datos,
  } as unknown as QueryDocumentSnapshot;
}

describe('plantillasWhatsAppConverter.fromFirestore', () => {
  it('reconstruye la lista campo a campo', () => {
    const plantillas = plantillasWhatsAppConverter.fromFirestore(
      snapshotDe({ plantillas: PLANTILLAS_SEED }),
      {},
    );
    expect(plantillas).toHaveLength(PLANTILLAS_SEED.length);
    expect(plantillas[0]).toEqual({
      id: 'pedido-listo',
      nombre: 'Pedido listo',
      contexto: 'venta',
      texto: PLANTILLAS_SEED[0]!.texto,
    });
  });

  it('doc sin plantillas → lista vacía (config recién instalada)', () => {
    expect(plantillasWhatsAppConverter.fromFirestore(snapshotDe({}), {})).toEqual([]);
  });
});

describe('plantillasWhatsAppConverter.toFirestore', () => {
  it('envuelve la lista en { plantillas } con solo las 4 claves de dominio', () => {
    const conBasura = [
      { id: 'p1', nombre: 'A', contexto: 'cliente', texto: 'Hola', color: 'rojo' },
    ] as unknown as PlantillaWhatsApp[];
    const doc = plantillasWhatsAppConverter.toFirestore(conBasura);
    expect(doc).toEqual({
      plantillas: [{ id: 'p1', nombre: 'A', contexto: 'cliente', texto: 'Hola' }],
    });
  });

  it('round-trip: toFirestore » fromFirestore preserva el seed', () => {
    const doc = plantillasWhatsAppConverter.toFirestore([...PLANTILLAS_SEED]);
    const reconstruido = plantillasWhatsAppConverter.fromFirestore(snapshotDe(doc), {});
    expect(reconstruido).toEqual([...PLANTILLAS_SEED]);
  });
});

describe('plantillasWhatsAppConverter — activa (baja lógica de propias, doc 08)', () => {
  const propiaInactiva: PlantillaWhatsApp = {
    id: 'propia-1',
    nombre: 'Promo quesos',
    contexto: 'cliente',
    texto: 'Hola {cliente}!',
    activa: false,
  };

  it('toFirestore escribe activa: false de una propia inactiva', () => {
    const doc = plantillasWhatsAppConverter.toFirestore([propiaInactiva]);
    expect(doc).toEqual({ plantillas: [{ ...propiaInactiva }] });
  });

  it('toFirestore NO escribe la clave activa de una activa (ni ausente ni true)', () => {
    const sinActiva: PlantillaWhatsApp = {
      id: 'propia-1',
      nombre: 'Promo quesos',
      contexto: 'cliente',
      texto: 'Hola {cliente}!',
    };
    const doc = plantillasWhatsAppConverter.toFirestore([
      sinActiva,
      { ...sinActiva, id: 'propia-2', activa: true },
    ]) as { plantillas: Record<string, unknown>[] };
    expect(doc.plantillas).toHaveLength(2);
    for (const p of doc.plantillas) {
      expect(p).not.toHaveProperty('activa');
    }
  });

  it('round-trip: una propia inactiva conserva activa: false', () => {
    const doc = plantillasWhatsAppConverter.toFirestore([propiaInactiva]);
    const reconstruido = plantillasWhatsAppConverter.fromFirestore(snapshotDe(doc), {});
    expect(reconstruido).toEqual([propiaInactiva]);
  });

  it('fromFirestore: activa true o ausente → sin la clave; false → activa: false', () => {
    const base = { nombre: 'X', contexto: 'venta', texto: 'Hola' };
    const [conTrue, sinClave, conFalse] = plantillasWhatsAppConverter.fromFirestore(
      snapshotDe({
        plantillas: [
          { ...base, id: 'a', activa: true },
          { ...base, id: 'b' },
          { ...base, id: 'c', activa: false },
        ],
      }),
      {},
    );
    expect(conTrue).not.toHaveProperty('activa');
    expect(sinClave).not.toHaveProperty('activa');
    expect(conFalse).toEqual({ ...base, id: 'c', activa: false });
  });
});
