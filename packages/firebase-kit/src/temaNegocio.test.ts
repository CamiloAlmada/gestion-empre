import { beforeEach, describe, expect, it, vi } from 'vitest';
import { borrarTemaNegocio, guardarTemaNegocio } from './temaNegocio';
import { ConfiguracionInvalidaError } from './errores';

// Mismo patrón que configuracion.test.ts: capturamos `setDoc`/`deleteDoc` para
// afirmar el doc y los datos que escriben las funciones. `withConverter` es
// identidad en el mock, así que se afirma sobre el objeto de dominio crudo.
const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
}));

interface RefFalsa {
  path: string;
  withConverter: () => RefFalsa;
}

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segmentos: string[]): RefFalsa => {
    const ref: RefFalsa = { path: segmentos.join('/'), withConverter: () => ref };
    return ref;
  },
  setDoc: (ref: RefFalsa, datos: unknown, opciones?: unknown) =>
    mocks.setDoc(ref, datos, opciones),
  deleteDoc: (ref: RefFalsa) => mocks.deleteDoc(ref),
}));

const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.deleteDoc.mockResolvedValue(undefined);
});

describe('guardarTemaNegocio', () => {
  it('escribe version 1 + matiz + tinte en configuracion/tema, sin opciones de merge (reemplazo completo)', async () => {
    await guardarTemaNegocio(db, { matiz: 200, tinte: 'neutro' });
    const [ref, datos, opciones] = mocks.setDoc.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
      unknown,
    ];
    expect(ref.path).toBe('configuracion/tema');
    expect(datos).toEqual({ version: 1, matiz: 200, tinte: 'neutro' });
    expect(opciones).toBeUndefined(); // sin `{merge: true}`: reemplazo completo del doc
  });

  it('acepta matiz en los bordes del rango (0 y 359)', async () => {
    await guardarTemaNegocio(db, { matiz: 0, tinte: 'frio' });
    await guardarTemaNegocio(db, { matiz: 359, tinte: 'calido' });
    expect(mocks.setDoc).toHaveBeenCalledTimes(2);
  });

  it('rechaza matiz negativo', async () => {
    await expect(guardarTemaNegocio(db, { matiz: -1, tinte: 'neutro' })).rejects.toThrow(
      ConfiguracionInvalidaError,
    );
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('rechaza matiz >= 360', async () => {
    await expect(guardarTemaNegocio(db, { matiz: 360, tinte: 'neutro' })).rejects.toThrow(
      ConfiguracionInvalidaError,
    );
  });

  it('rechaza matiz no entero', async () => {
    await expect(guardarTemaNegocio(db, { matiz: 200.5, tinte: 'neutro' })).rejects.toThrow(
      ConfiguracionInvalidaError,
    );
  });

  it('rechaza matiz no numérico', async () => {
    await expect(
      guardarTemaNegocio(db, { matiz: '200' as unknown as number, tinte: 'neutro' }),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });

  it('rechaza tinte fuera de la unión', async () => {
    await expect(
      guardarTemaNegocio(db, { matiz: 200, tinte: 'oscuro' as never }),
    ).rejects.toThrow(ConfiguracionInvalidaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});

describe('borrarTemaNegocio', () => {
  it('borra configuracion/tema ("Volver a los colores originales")', async () => {
    await borrarTemaNegocio(db);
    expect(mocks.deleteDoc).toHaveBeenCalledTimes(1);
    const [ref] = mocks.deleteDoc.mock.calls[0] as [RefFalsa];
    expect(ref.path).toBe('configuracion/tema');
  });
});
