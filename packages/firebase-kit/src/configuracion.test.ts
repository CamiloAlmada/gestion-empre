import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLANTILLAS_SEED, type PlantillaWhatsApp } from '@gestion/core';
import { guardarConfiguracionGeneral, guardarPlantillasWhatsApp } from './configuracion';
import { ConfiguracionInvalidaError } from './errores';

// Mismo patrón que clientes.test.ts: capturamos `setDoc` para afirmar el doc y las
// opciones (merge) que escriben las funciones. `withConverter` es identidad en el
// mock, así que se afirma sobre el objeto de dominio que recibe `setDoc`.
const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
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
  setDoc: (ref: RefFalsa, datos: unknown, opciones?: unknown) => mocks.setDoc(ref, datos, opciones),
}));

const db = {} as never;

function plantilla(sobre: Partial<PlantillaWhatsApp> = {}): PlantillaWhatsApp {
  return { id: 'p1', nombre: 'Pedido listo', contexto: 'venta', texto: 'Hola', ...sobre };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setDoc.mockResolvedValue(undefined);
});

describe('guardarConfiguracionGeneral', () => {
  it('escribe codigoPaisDefault y nombreNegocio con MERGE (no pisa otras claves)', async () => {
    await guardarConfiguracionGeneral(db, { codigoPaisDefault: '598', nombreNegocio: '  Quesarte  ' });
    const [ref, datos, opciones] = mocks.setDoc.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
      unknown,
    ];
    expect(ref.path).toBe('configuracion/general');
    expect(datos).toEqual({ codigoPaisDefault: '598', nombreNegocio: 'Quesarte' }); // recortado
    expect(opciones).toEqual({ merge: true });
  });

  it('rechaza codigoPais con no-dígitos', async () => {
    await expect(
      guardarConfiguracionGeneral(db, { codigoPaisDefault: '+598', nombreNegocio: 'Q' }),
    ).rejects.toThrow(ConfiguracionInvalidaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('rechaza codigoPais de más de 4 dígitos', async () => {
    await expect(
      guardarConfiguracionGeneral(db, { codigoPaisDefault: '12345', nombreNegocio: 'Q' }),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });

  it('rechaza codigoPais vacío', async () => {
    await expect(
      guardarConfiguracionGeneral(db, { codigoPaisDefault: '   ', nombreNegocio: 'Q' }),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });

  it('rechaza nombreNegocio vacío tras trim', async () => {
    await expect(
      guardarConfiguracionGeneral(db, { codigoPaisDefault: '598', nombreNegocio: '   ' }),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });

  it('rechaza nombreNegocio de más de 80 caracteres', async () => {
    await expect(
      guardarConfiguracionGeneral(db, { codigoPaisDefault: '598', nombreNegocio: 'x'.repeat(81) }),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });
});

describe('guardarPlantillasWhatsApp', () => {
  it('siembra PLANTILLAS_SEED sin error y las escribe limpias', async () => {
    await guardarPlantillasWhatsApp(db, PLANTILLAS_SEED);
    const [ref, datos] = mocks.setDoc.mock.calls[0] as [RefFalsa, PlantillaWhatsApp[]];
    expect(ref.path).toBe('configuracion/plantillasWhatsApp');
    expect(datos).toHaveLength(PLANTILLAS_SEED.length);
    expect(datos[0]).toEqual({
      id: 'pedido-listo',
      nombre: 'Pedido listo',
      contexto: 'venta',
      texto: PLANTILLAS_SEED[0]!.texto,
    });
  });

  it('recorta strings y descarta claves ajenas de cada plantilla', async () => {
    const conBasura = { ...plantilla({ nombre: '  Aviso  ' }), color: 'rojo' } as PlantillaWhatsApp;
    await guardarPlantillasWhatsApp(db, [conBasura]);
    const [, datos] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>[]];
    expect(datos[0]).toEqual({ id: 'p1', nombre: 'Aviso', contexto: 'venta', texto: 'Hola' });
    expect(datos[0]).not.toHaveProperty('color');
  });

  it('acepta una lista vacía (permite dejar sin plantillas)', async () => {
    await guardarPlantillasWhatsApp(db, []);
    const [, datos] = mocks.setDoc.mock.calls[0] as [RefFalsa, PlantillaWhatsApp[]];
    expect(datos).toEqual([]);
  });

  it('rechaza más de 20 plantillas', async () => {
    const muchas = Array.from({ length: 21 }, (_, i) => plantilla({ id: `p${i}` }));
    await expect(guardarPlantillasWhatsApp(db, muchas)).rejects.toThrow(ConfiguracionInvalidaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('rechaza ids duplicados', async () => {
    await expect(
      guardarPlantillasWhatsApp(db, [plantilla({ id: 'x' }), plantilla({ id: 'x' })]),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });

  it('rechaza contexto fuera de la unión', async () => {
    await expect(
      guardarPlantillasWhatsApp(db, [plantilla({ contexto: 'promo' as never })]),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });

  it('rechaza texto vacío', async () => {
    await expect(
      guardarPlantillasWhatsApp(db, [plantilla({ texto: '   ' })]),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });

  it('rechaza texto de más de 1000 caracteres', async () => {
    await expect(
      guardarPlantillasWhatsApp(db, [plantilla({ texto: 'x'.repeat(1001) })]),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });

  it('rechaza id de más de 40 caracteres', async () => {
    await expect(
      guardarPlantillasWhatsApp(db, [plantilla({ id: 'x'.repeat(41) })]),
    ).rejects.toThrow(ConfiguracionInvalidaError);
  });
});
