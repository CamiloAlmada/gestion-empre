import { describe, expect, it } from 'vitest';
import { clienteConverter, ventaConverter } from '@gestion/firebase-kit';
import { construirDatosDemo } from './generador.mjs';
import { clienteADoc, ventaADoc } from './mapeoAdmin.mjs';

// Estos tests son la red de seguridad contra el drift entre `mapeoAdmin.mjs`
// (duplicado a mano para el SDK admin) y los converters REALES del kit (SDK
// cliente, `@gestion/firebase-kit`). Corren en jsdom (config por defecto de esta
// app), donde importar `firebase/firestore` es seguro (igual que el resto de los
// tests de `src/`); `seed-demo.mjs` en cambio corre con `firebase-admin` y nunca
// importa los converters del kit (ver comentario en `mapeoAdmin.mjs`).
//
// `xxxConverter.toFirestore()` es una función pura (no toca red ni requiere una
// app de Firebase inicializada): se puede invocar directo sobre un objeto de
// dominio y comparar la salida.

const AHORA = new Date('2026-07-12T15:00:00.000Z');
const { clientes, ventas } = construirDatosDemo(AHORA);

describe('mapeoAdmin vs. converters reales de @gestion/firebase-kit', () => {
  it.each(clientes.map((c) => [c.id, c]))(
    'clienteADoc(%s) coincide byte a byte con clienteConverter.toFirestore()',
    (_id, cliente) => {
      expect(clienteADoc(cliente)).toEqual(clienteConverter.toFirestore(cliente));
    },
  );

  it.each(ventas.map((v) => [v.id, v]))(
    'ventaADoc(%s) coincide byte a byte con ventaConverter.toFirestore()',
    (_id, venta) => {
      expect(ventaADoc(venta)).toEqual(ventaConverter.toFirestore(venta));
    },
  );
});
