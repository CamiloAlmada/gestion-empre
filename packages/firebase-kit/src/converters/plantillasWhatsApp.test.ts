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
