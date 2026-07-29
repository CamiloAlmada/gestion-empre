import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Proveedor } from '@gestion/core';
import {
  crearProveedor,
  actualizarProveedor,
  desactivarProveedor,
  reactivarProveedor,
  LARGO_MAX_NOMBRE_PROVEEDOR,
  type DatosProveedor,
} from './proveedores';
import { ProveedorDuplicadoError, ProveedorInvalidoError } from './errores';

// Mock de `firebase/firestore` como en clientes.test.ts: solo las ESCRITURAS y
// las fábricas de referencias. El chequeo de duplicados ya no lee del SDK —
// recibe `existentes`, la lista que la pantalla tiene suscrita—, así que es
// lógica pura sobre un array y no necesita mock ninguno.
//
// Por eso desaparecieron los tests de la vieja escalera
// `getDocs` → timeout → `getDocsFromCache` → lista vacía: se borraron junto con
// el código que testeaban. Y no se reescriben: declaraban por construcción que
// esas dos llamadas del SDK son independientes, que era justo la hipótesis a
// verificar (ver el JSDoc del módulo, "Por qué el chequeo NO lee del SDK").
const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  contador: { n: 0 },
  // Sentinela de `deleteField()`: el mock devuelve SIEMPRE esta misma referencia,
  // así los tests afirman que un campo se marca para borrado comparando identidad
  // (mismo patrón que clientes.test.ts).
  borrar: { __op: 'deleteField' } as const,
}));

interface RefFalsa {
  id: string;
  path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string, id: string): RefFalsa {
  const ref: RefFalsa = { id, path, withConverter: () => ref };
  return ref;
}

interface ColeccionFalsa {
  __collection: string;
  withConverter: () => ColeccionFalsa;
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string): ColeccionFalsa => {
    const c: ColeccionFalsa = { __collection: path, withConverter: () => c };
    return c;
  },
  doc: (dbOrColeccion: unknown, ...segmentos: string[]) => {
    if (segmentos.length === 0) {
      const { __collection } = dbOrColeccion as { __collection: string };
      const id = `auto-${(mocks.contador.n += 1)}`;
      return crearRef(`${__collection}/${id}`, id);
    }
    return crearRef(segmentos.join('/'), segmentos[segmentos.length - 1] ?? '');
  },
  setDoc: (ref: RefFalsa, datos: unknown) => mocks.setDoc(ref, datos),
  updateDoc: (ref: RefFalsa, datos: unknown) => mocks.updateDoc(ref, datos),
  deleteField: () => mocks.borrar,
}));

const db = {} as never;

/** Colección vacía: el caso de la mayoría de los tests, que no miran duplicados. */
const NINGUNO: readonly Proveedor[] = [];

/** Payload del `updateDoc` que se disparó (falla si no hubo ninguno). */
function cambiosEscritos(): Record<string, unknown> {
  const llamada = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>] | undefined;
  if (llamada === undefined) throw new Error('no se llamó a updateDoc');
  return llamada[1];
}

/** Datos completos de un proveedor, para los tests de reemplazo total. */
const DATOS_COMPLETOS: DatosProveedor = {
  nombre: 'Lácteos Colonia',
  contactoNombre: 'Ana',
  telefono: '099111222',
  email: 'ana@lacteos.uy',
  direccion: 'Ruta 1 km 60',
  rut: '210000000012',
  notas: 'Entrega los martes',
  pagos: [{ banco: 'BROU', cuenta: '001234567' }],
};

function proveedor(over: Partial<Proveedor> & Pick<Proveedor, 'id' | 'nombre'>): Proveedor {
  return { fechaAlta: new Date('2026-01-01'), activo: true, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contador.n = 0;
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.updateDoc.mockResolvedValue(undefined);
});

describe('crearProveedor', () => {
  it('crea con activo true, fechaAlta y los pagos provistos', async () => {
    const { proveedorId } = await crearProveedor(
      db,
      {
        nombre: '  Lácteos Colonia  ',
        rut: '210000000012',
        pagos: [{ banco: 'BROU', cuenta: '001234567' }],
      },
      NINGUNO,
    );

    const [ref, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toMatch(/^proveedores\//);
    expect(proveedorId).toBe(ref.id);
    expect(prov.nombre).toBe('Lácteos Colonia'); // recortado
    expect(prov.activo).toBe(true);
    expect(prov.fechaAlta).toBeInstanceOf(Date);
    expect(prov.rut).toBe('210000000012');
    expect(prov.pagos).toEqual([{ banco: 'BROU', cuenta: '001234567' }]);
    expect(prov.contactoNombre).toBeUndefined();
  });

  it('devuelve una sincronizacion que resuelve con el ack del servidor', async () => {
    const { sincronizacion } = await crearProveedor(db, { nombre: 'La Rural' }, NINGUNO);
    await expect(sincronizacion).resolves.toBeUndefined();
  });

  it('el alta OMITE los campos vacíos, sin deleteField (sería un error en un setDoc)', async () => {
    // El alta no cambió con el reemplazo total de la edición: acá `undefined`
    // significa "campo ausente" y el converter no lo escribe. `deleteField()`
    // sobre un documento que todavía no existe es inválido.
    await crearProveedor(
      db,
      {
        nombre: 'La Rural',
        telefono: '   ',
        email: '',
      },
      NINGUNO,
    );

    const [, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(prov.nombre).toBe('La Rural');
    expect(prov.contactoNombre).toBeUndefined();
    expect(prov.telefono).toBeUndefined();
    expect(prov.email).toBeUndefined();
    expect(prov.direccion).toBeUndefined();
    expect(prov.rut).toBeUndefined();
    expect(prov.notas).toBeUndefined();
    expect(Object.values(prov)).not.toContain(mocks.borrar);
  });

  it('resuelve con el id aunque el ack nunca llegue (sin conexión)', async () => {
    // Fase 1 no espera al servidor: con el `setDoc` colgado, la promesa externa
    // igual resuelve y la pantalla puede seguir usando el id.
    const colgada = new Promise<void>(() => {});
    mocks.setDoc.mockReturnValue(colgada);

    const { proveedorId, sincronizacion } = await crearProveedor(db, { nombre: 'La Rural' }, NINGUNO);

    expect(proveedorId).toMatch(/^auto-/);
    expect(sincronizacion).toBe(colgada);
  });

  it('el rechazo del servidor viaja por sincronizacion, no por la promesa externa', async () => {
    mocks.setDoc.mockRejectedValue(new Error('permission-denied'));

    const { sincronizacion } = await crearProveedor(db, { nombre: 'La Rural' }, NINGUNO);

    await expect(sincronizacion).rejects.toThrow('permission-denied');
  });

  it('rechaza nombre vacío tras trim y no escribe', async () => {
    await expect(crearProveedor(db, { nombre: '  ' }, NINGUNO)).rejects.toThrow(ProveedorInvalidoError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('acepta un nombre de exactamente el largo máximo', async () => {
    const nombre = 'a'.repeat(LARGO_MAX_NOMBRE_PROVEEDOR);
    await crearProveedor(db, { nombre }, NINGUNO);
    const [, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(prov.nombre).toBe(nombre);
  });

  it('rechaza un nombre más largo que el máximo y no escribe', async () => {
    const nombre = 'a'.repeat(LARGO_MAX_NOMBRE_PROVEEDOR + 1);
    await expect(crearProveedor(db, { nombre }, NINGUNO)).rejects.toThrow(ProveedorInvalidoError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });

  it('mide el largo tras trim: 120 caracteres rodeados de espacios es válido', async () => {
    const nombre = 'a'.repeat(LARGO_MAX_NOMBRE_PROVEEDOR);
    await crearProveedor(db, { nombre: `   ${nombre}   ` }, NINGUNO);
    const [, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(prov.nombre).toBe(nombre);
  });

  it('acepta nombres con "/" o "." (el id es autogenerado, no deriva del nombre)', async () => {
    await crearProveedor(db, { nombre: 'Distribuidora S.A. / Colonia' }, NINGUNO);
    const [ref, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(prov.nombre).toBe('Distribuidora S.A. / Colonia');
    expect(ref.id).toMatch(/^auto-/);
  });

  describe('unicidad del nombre', () => {
    it('rechaza un duplicado exacto y no escribe', async () => {
      const existentes = [proveedor({ id: 'p1', nombre: 'La Rural' })];

      await expect(crearProveedor(db, { nombre: 'La Rural' }, existentes)).rejects.toThrow(
        ProveedorDuplicadoError,
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it('rechaza un duplicado que solo difiere en mayúsculas y espacios de borde', async () => {
      const existentes = [proveedor({ id: 'p1', nombre: 'La Rural' })];

      await expect(crearProveedor(db, { nombre: '  LA rural ' }, existentes)).rejects.toThrow(
        ProveedorDuplicadoError,
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it('nombra al proveedor existente en el mensaje, no al que se tipeó', async () => {
      const existentes = [proveedor({ id: 'p1', nombre: 'La Rural' })];

      await expect(crearProveedor(db, { nombre: 'la rural' }, existentes)).rejects.toThrow(
        'Ya existe un proveedor llamado "La Rural".',
      );
    });

    it('un homónimo INACTIVO también es duplicado, con un mensaje que invita a reactivarlo', async () => {
      const existentes = [proveedor({ id: 'p1', nombre: 'La Rural', activo: false })];

      await expect(crearProveedor(db, { nombre: 'La Rural' }, existentes)).rejects.toThrow(
        'Ya existe un proveedor llamado "La Rural" (está inactivo, podés reactivarlo).',
      );
      expect(mocks.setDoc).not.toHaveBeenCalled();
    });

    it('NO pliega acentos: "Café" y "Cafe" son dos proveedores distintos', async () => {
      const existentes = [proveedor({ id: 'p1', nombre: 'Café Brasilero' })];

      await crearProveedor(db, { nombre: 'Cafe Brasilero' }, existentes);

      const [, prov] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
      expect(prov.nombre).toBe('Cafe Brasilero');
    });

    it('NO pliega la eñe: "Niño" y "Nino" son dos proveedores distintos', async () => {
      const existentes = [proveedor({ id: 'p1', nombre: 'El Niño' })];

      await crearProveedor(db, { nombre: 'El Nino' }, existentes);

      expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    });

    it('deja pasar un nombre distinto aunque haya otros proveedores', async () => {
      const existentes = [
        proveedor({ id: 'p1', nombre: 'La Rural' }),
        proveedor({ id: 'p2', nombre: 'Lácteos Colonia' }),
      ];

      const { proveedorId } = await crearProveedor(db, { nombre: 'Granja del Sur' }, existentes);

      expect(mocks.setDoc).toHaveBeenCalledTimes(1);
      expect(proveedorId).toMatch(/^auto-/);
    });

    it('con la lista vacía (suscripción todavía sin datos) el chequeo se saltea y el alta procede', async () => {
      // Degradación aceptada, ver el JSDoc del módulo: el chequeo es
      // best-effort. Antes lo mismo pasaba con la caché fría del SDK; ahora el
      // caso es "la pantalla todavía no recibió el primer snapshot".
      const { proveedorId } = await crearProveedor(db, { nombre: 'La Rural' }, []);

      expect(proveedorId).toMatch(/^auto-/);
      expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    });
  });
});

describe('actualizarProveedor', () => {
  it('actualiza datos sin tocar activo ni fechaAlta', async () => {
    await actualizarProveedor(
      db,
      'prov-1',
      {
        nombre: 'Lácteos Colonia',
        telefono: '099999999',
      },
      NINGUNO,
    );
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('proveedores/prov-1');
    expect(cambios.nombre).toBe('Lácteos Colonia');
    expect(cambios.telefono).toBe('099999999');
    expect(cambios).not.toHaveProperty('activo');
    expect(cambios).not.toHaveProperty('fechaAlta');
    // El resto de los campos opcionales no vino: se borran (reemplazo total).
    expect(cambios.email).toBe(mocks.borrar);
  });

  it('devuelve una sincronizacion que resuelve con el ack del servidor', async () => {
    const { sincronizacion } = await actualizarProveedor(db, 'prov-1', { nombre: 'La Rural' }, NINGUNO);
    await expect(sincronizacion).resolves.toBeUndefined();
  });

  it('resuelve aunque el ack nunca llegue (sin conexión)', async () => {
    const colgada = new Promise<void>(() => {});
    mocks.updateDoc.mockReturnValue(colgada);

    const { sincronizacion } = await actualizarProveedor(db, 'prov-1', { nombre: 'La Rural' }, NINGUNO);

    expect(sincronizacion).toBe(colgada);
  });

  it('el rechazo del servidor viaja por sincronizacion, no por la promesa externa', async () => {
    mocks.updateDoc.mockRejectedValue(new Error('permission-denied'));

    const { sincronizacion } = await actualizarProveedor(db, 'prov-1', { nombre: 'La Rural' }, NINGUNO);

    await expect(sincronizacion).rejects.toThrow('permission-denied');
  });

  it('rechaza nombre vacío y no escribe', async () => {
    await expect(actualizarProveedor(db, 'prov-1', { nombre: '' }, NINGUNO)).rejects.toThrow(
      ProveedorInvalidoError,
    );
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  it('rechaza un nombre más largo que el máximo y no escribe', async () => {
    const nombre = 'a'.repeat(LARGO_MAX_NOMBRE_PROVEEDOR + 1);
    await expect(actualizarProveedor(db, 'prov-1', { nombre }, NINGUNO)).rejects.toThrow(
      ProveedorInvalidoError,
    );
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });

  // El update es un REEMPLAZO TOTAL de los campos opcionales: `datos` es la foto
  // completa del formulario, no un delta. Vaciar un campo en el modal (que manda
  // `undefined`) tiene que BORRARLO del documento; antes se omitía del payload y
  // el valor viejo sobrevivía —con `pagos` eso dejaba una cuenta bancaria dada de
  // baja a la vista para copiar en una transferencia—.
  describe('borrado de campos opcionales', () => {
    const CAMPOS_TEXTO = ['contactoNombre', 'telefono', 'email', 'direccion', 'rut', 'notas'] as const;

    it.each(CAMPOS_TEXTO)('borra %s cuando llega ausente', async (campo) => {
      const sinEseCampo: DatosProveedor = { ...DATOS_COMPLETOS };
      delete sinEseCampo[campo];

      await actualizarProveedor(db, 'p1', sinEseCampo, NINGUNO);

      expect(cambiosEscritos()[campo]).toBe(mocks.borrar);
    });

    it.each(CAMPOS_TEXTO)('borra %s cuando llega vacío o en blanco', async (campo) => {
      await actualizarProveedor(db, 'p1', { ...DATOS_COMPLETOS, [campo]: '   ' }, NINGUNO);

      expect(cambiosEscritos()[campo]).toBe(mocks.borrar);
    });

    it('borra pagos cuando se quitan TODAS las cuentas (lista vacía)', async () => {
      await actualizarProveedor(db, 'p1', { ...DATOS_COMPLETOS, pagos: [] }, NINGUNO);

      expect(cambiosEscritos().pagos).toBe(mocks.borrar);
    });

    it('borra pagos cuando llega ausente', async () => {
      const sinPagos: DatosProveedor = { ...DATOS_COMPLETOS };
      delete sinPagos.pagos;

      await actualizarProveedor(db, 'p1', sinPagos, NINGUNO);

      expect(cambiosEscritos().pagos).toBe(mocks.borrar);
    });

    it('"sin cuentas" se persiste como campo ausente, nunca como pagos: []', async () => {
      await actualizarProveedor(db, 'p1', { ...DATOS_COMPLETOS, pagos: [] }, NINGUNO);

      expect(cambiosEscritos().pagos).not.toEqual([]);
    });

    it('reemplaza pagos por la lista nueva, más corta, exactamente', async () => {
      await actualizarProveedor(
        db,
        'p1',
        {
          ...DATOS_COMPLETOS,
          pagos: [
            { banco: 'BROU', cuenta: '001234567' },
            { banco: 'Itaú', cuenta: '999' },
            { banco: 'Santander', cuenta: '777' },
          ],
        },
        NINGUNO,
      );
      mocks.updateDoc.mockClear();

      await actualizarProveedor(
        db,
        'p1',
        {
          ...DATOS_COMPLETOS,
          pagos: [{ banco: 'Itaú', cuenta: '999' }],
        },
        NINGUNO,
      );

      expect(cambiosEscritos().pagos).toEqual([{ banco: 'Itaú', cuenta: '999' }]);
    });

    it('omite titular/moneda ausentes de cada cuenta (el update no pasa por el converter)', async () => {
      // Firestore rechaza `undefined` y este `updateDoc` no tiene converter que
      // lo limpie: la cuenta se serializa acá, igual que en `pagoADoc`.
      await actualizarProveedor(
        db,
        'p1',
        {
          ...DATOS_COMPLETOS,
          pagos: [{ banco: 'BROU', cuenta: '001', titular: undefined, moneda: 'UYU' }],
        },
        NINGUNO,
      );

      const [cuenta] = cambiosEscritos().pagos as Record<string, unknown>[];
      expect(cuenta).toEqual({ banco: 'BROU', cuenta: '001', moneda: 'UYU' });
      expect(cuenta).not.toHaveProperty('titular');
    });

    it('un update que solo cambia el nombre NO borra el resto de los campos', async () => {
      // El caso que protege contra el arreglo demasiado entusiasta: el modal
      // manda todo, y todo lo que viene con contenido se conserva.
      await actualizarProveedor(db, 'p1', { ...DATOS_COMPLETOS, nombre: 'Lácteos Colonia S.A.' }, NINGUNO);

      expect(cambiosEscritos()).toEqual({
        nombre: 'Lácteos Colonia S.A.',
        contactoNombre: 'Ana',
        telefono: '099111222',
        email: 'ana@lacteos.uy',
        direccion: 'Ruta 1 km 60',
        rut: '210000000012',
        notas: 'Entrega los martes',
        pagos: [{ banco: 'BROU', cuenta: '001234567' }],
      });
    });

    it('recorta los campos de texto que sí tienen contenido', async () => {
      await actualizarProveedor(db, 'p1', { ...DATOS_COMPLETOS, telefono: '  099111222  ' }, NINGUNO);

      expect(cambiosEscritos().telefono).toBe('099111222');
    });
  });

  describe('unicidad del nombre', () => {
    it('permite corregir solo las mayúsculas del propio nombre', async () => {
      const existentes = [proveedor({ id: 'p1', nombre: 'la rural' })];

      await actualizarProveedor(db, 'p1', { nombre: 'La Rural' }, existentes);

      const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
      expect(ref.path).toBe('proveedores/p1');
      expect(cambios.nombre).toBe('La Rural');
    });

    it('rechaza chocar con OTRO proveedor y no escribe', async () => {
      const existentes = [
        proveedor({ id: 'p1', nombre: 'La Rural' }),
        proveedor({ id: 'p2', nombre: 'Lácteos Colonia' }),
      ];

      await expect(actualizarProveedor(db, 'p2', { nombre: 'la rural' }, existentes)).rejects.toThrow(
        ProveedorDuplicadoError,
      );
      expect(mocks.updateDoc).not.toHaveBeenCalled();
    });

    it('rechaza chocar con otro proveedor INACTIVO, con el mensaje que lo distingue', async () => {
      const existentes = [
        proveedor({ id: 'p1', nombre: 'La Rural', activo: false }),
        proveedor({ id: 'p2', nombre: 'Lácteos Colonia' }),
      ];

      await expect(actualizarProveedor(db, 'p2', { nombre: 'La Rural' }, existentes)).rejects.toThrow(
        'Ya existe un proveedor llamado "La Rural" (está inactivo, podés reactivarlo).',
      );
      expect(mocks.updateDoc).not.toHaveBeenCalled();
    });

    it('edita aunque el proveedor no esté en `existentes` (suscripción incompleta)', async () => {
      const existentes = [proveedor({ id: 'p1', nombre: 'Lácteos Colonia' })];

      await actualizarProveedor(db, 'p-fuera-de-la-lista', { nombre: 'La Rural' }, existentes);

      expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    });
  });
});

describe('desactivarProveedor', () => {
  it('escribe solo activo:false (no borra)', async () => {
    await desactivarProveedor(db, 'prov-1');
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('proveedores/prov-1');
    expect(cambios).toEqual({ activo: false });
  });
});

describe('reactivarProveedor', () => {
  it('escribe solo activo:true (inversa de desactivarProveedor)', async () => {
    await reactivarProveedor(db, 'prov-1');
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('proveedores/prov-1');
    expect(cambios).toEqual({ activo: true });
  });
});
