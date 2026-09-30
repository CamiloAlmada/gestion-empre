import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIAS_AVISO_VENCIMIENTO_MAX,
  DIAS_AVISO_VENCIMIENTO_MIN,
  PLANTILLAS_SEED,
  type PlantillaWhatsApp,
} from '@gestion/core';
import {
  guardarConfiguracionGeneral,
  guardarDiasAvisoVencimiento,
  guardarPlantillasWhatsApp,
} from './configuracion';
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

describe('guardarDiasAvisoVencimiento', () => {
  it('escribe SOLO su clave, con MERGE (no pisa el resto de configuracion/general)', async () => {
    await guardarDiasAvisoVencimiento(db, 14);
    const [ref, datos, opciones] = mocks.setDoc.mock.calls[0] as [
      RefFalsa,
      Record<string, unknown>,
      unknown,
    ];
    expect(ref.path).toBe('configuracion/general');
    expect(datos).toEqual({ diasAvisoVencimiento: 14 });
    expect(opciones).toEqual({ merge: true });
  });

  it('acepta los extremos del rango', async () => {
    await guardarDiasAvisoVencimiento(db, DIAS_AVISO_VENCIMIENTO_MIN);
    await guardarDiasAvisoVencimiento(db, DIAS_AVISO_VENCIMIENTO_MAX);
    expect(mocks.setDoc).toHaveBeenCalledTimes(2);
  });

  it('rechaza 0 y negativos', async () => {
    await expect(guardarDiasAvisoVencimiento(db, 0)).rejects.toThrow(ConfiguracionInvalidaError);
    await expect(guardarDiasAvisoVencimiento(db, -1)).rejects.toThrow(ConfiguracionInvalidaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('rechaza por encima del máximo', async () => {
    await expect(
      guardarDiasAvisoVencimiento(db, DIAS_AVISO_VENCIMIENTO_MAX + 1),
    ).rejects.toThrow(ConfiguracionInvalidaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('rechaza un decimal (rompería el conteo de días de calendario)', async () => {
    await expect(guardarDiasAvisoVencimiento(db, 7.5)).rejects.toThrow(ConfiguracionInvalidaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('el mensaje de error nombra el rango, en español', async () => {
    await expect(guardarDiasAvisoVencimiento(db, 500)).rejects.toThrow(/entre 1 y 90/);
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

  it('acepta el contexto cobro (recordatorio de deuda, doc 11)', async () => {
    await guardarPlantillasWhatsApp(db, [
      plantilla({ id: 'rc', contexto: 'cobro', texto: 'Hola {cliente}, quedan {deuda}' }),
    ]);
    const [, datos] = mocks.setDoc.mock.calls[0] as [RefFalsa, PlantillaWhatsApp[]];
    expect(datos[0]?.contexto).toBe('cobro');
  });

  it('acepta los cuatro contextos en una misma lista', async () => {
    const contextos = ['venta', 'cliente', 'inactivo', 'cobro'] as const;
    await guardarPlantillasWhatsApp(
      db,
      contextos.map((contexto) => plantilla({ id: `p-${contexto}`, contexto })),
    );
    const [, datos] = mocks.setDoc.mock.calls[0] as [RefFalsa, PlantillaWhatsApp[]];
    expect(datos.map((p) => p.contexto)).toEqual([...contextos]);
  });

  it('rechaza un contexto que coincide con una clave heredada de Object', async () => {
    await expect(
      guardarPlantillasWhatsApp(db, [plantilla({ contexto: 'toString' as never })]),
    ).rejects.toThrow(ConfiguracionInvalidaError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
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

  describe('activa (baja lógica de propias, doc 08)', () => {
    const [pedidoListo] = PLANTILLAS_SEED;

    it('una propia con activa: false se persiste con la clave', async () => {
      await guardarPlantillasWhatsApp(db, [plantilla({ id: 'propia-1', activa: false })]);
      const [, datos] = mocks.setDoc.mock.calls[0] as [RefFalsa, PlantillaWhatsApp[]];
      expect(datos[0]).toEqual({
        id: 'propia-1',
        nombre: 'Pedido listo',
        contexto: 'venta',
        texto: 'Hola',
        activa: false,
      });
    });

    it('activa: true se omite (ausente = activa)', async () => {
      await guardarPlantillasWhatsApp(db, [
        plantilla({ id: 'propia-1', activa: true }),
        { ...pedidoListo!, activa: true },
      ]);
      const [, datos] = mocks.setDoc.mock.calls[0] as [RefFalsa, PlantillaWhatsApp[]];
      expect(datos[0]).not.toHaveProperty('activa');
      expect(datos[1]).toEqual({ ...pedidoListo! });
    });

    it('rechaza activa que no es booleano, sin escribir', async () => {
      const mal = { ...plantilla({ id: 'propia-1' }), activa: 'si' } as unknown as PlantillaWhatsApp;
      await expect(guardarPlantillasWhatsApp(db, [mal])).rejects.toThrow(
        /"activa" debe ser verdadero o falso/,
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it('rechaza desactivar una plantilla de fábrica, sin escribir', async () => {
      await expect(
        guardarPlantillasWhatsApp(db, [{ ...pedidoListo!, activa: false }]),
      ).rejects.toThrow(
        new ConfiguracionInvalidaError('Las plantillas iniciales no se pueden desactivar.'),
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it('rechaza cambiarle el contexto a una plantilla de fábrica, sin escribir', async () => {
      await expect(
        guardarPlantillasWhatsApp(db, [{ ...pedidoListo!, contexto: 'cliente' }]),
      ).rejects.toThrow(
        new ConfiguracionInvalidaError('A las plantillas iniciales no se les puede cambiar el contexto.'),
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it('una de fábrica con nombre y texto editados (mismo contexto) se guarda', async () => {
      await guardarPlantillasWhatsApp(db, [
        { ...pedidoListo!, nombre: 'Listo!', texto: 'Ya está, {cliente}' },
      ]);
      const [, datos] = mocks.setDoc.mock.calls[0] as [RefFalsa, PlantillaWhatsApp[]];
      expect(datos[0]).toEqual({ ...pedidoListo!, nombre: 'Listo!', texto: 'Ya está, {cliente}' });
    });

    it('una propia puede tener cualquier contexto y quedar inactiva', async () => {
      await guardarPlantillasWhatsApp(db, [
        ...PLANTILLAS_SEED,
        plantilla({ id: 'propia-cobro', contexto: 'cobro', activa: false }),
      ]);
      const [, datos] = mocks.setDoc.mock.calls[0] as [RefFalsa, PlantillaWhatsApp[]];
      expect(datos).toHaveLength(PLANTILLAS_SEED.length + 1);
      expect(datos.at(-1)).toMatchObject({ contexto: 'cobro', activa: false });
    });
  });
});
