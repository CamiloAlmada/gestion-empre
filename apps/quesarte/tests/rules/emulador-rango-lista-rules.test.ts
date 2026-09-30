import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, type DocumentData } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Regresión del comportamiento del EMULADOR con rangos de lista (spike A2 de
// docs/11-cobros-diferidos.md). Las reglas de cobros diferidos verifican que
// los pagos anteriores queden intactos con `nuevo.pagos[0:n] == viejo.pagos`.
// Eso anda para n >= 1, pero `l[0:0]` NO devuelve `[]`: lanza "Index out of
// bound" y la regla deniega. Sin guarda, el PRIMER pago de toda venta a cobrar
// (lista vacía) y el deshacer del ÚNICO pago serían rechazados. Por eso
// `firestore.rules` escribe `n == 0 || lista[0:n] == ...`.
//
// Si una versión futura del emulador devuelve `[]` para `[0:0]`, el primer test
// falla: la guarda sigue siendo correcta (y barata), pero vale revisar el
// comentario de firestore.rules. Carga su propio `.rules` bajo un projectId
// aparte, así que no pisa las reglas reales de las otras suites.

const PROJECT_ID = 'demo-rango-lista';
const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(HERE, 'emulador-rango-lista.rules');

let testEnv: RulesTestEnvironment;

function crear(coleccion: string, data: DocumentData): Promise<void> {
  return setDoc(doc(testEnv.unauthenticatedContext().firestore(), coleccion, 'x'), data);
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('emulador: operador de rango de listas', () => {
  it('l[0:0] LANZA "Index out of bound" (no devuelve [])', async () => {
    const error = await crear('rango00', { l: [1, 2] }).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toMatch(/Index out of bound/);
  });

  it('l[0:0] sobre la lista vacía también lanza', async () => {
    await assertFails(crear('rango00', { l: [] }));
  });

  it('un rango vacío que no empieza en 0 (l[1:1]) sí devuelve []', async () => {
    await assertSucceeds(crear('rango11', { l: [1, 2] }));
  });

  it('l[0:n] con n >= 1 compara el prefijo por valor', async () => {
    await assertSucceeds(crear('rango0n', { l: [1, 2, 3], n: 2, esperado: [1, 2] }));
    await testEnv.clearFirestore();
    await assertFails(crear('rango0n', { l: [1, 9, 3], n: 2, esperado: [1, 2] }));
  });

  it('con la guarda de firestore.rules, n == 0 pasa', async () => {
    await assertSucceeds(crear('rangoConGuarda', { l: [1, 2], n: 0, esperado: [] }));
  });
});
