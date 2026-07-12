import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crearCliente, actualizarCliente, desactivarCliente, reactivarCliente } from './clientes';
import { ClienteInvalidoError } from './errores';

// Mock de `firebase/firestore` en el estilo de ventas.test.ts: capturamos `setDoc`
// y `updateDoc` para afirmar el doc/parciales que escriben las funciones. Los
// converters no se ejercitan acá (unit): `withConverter` es identidad y se afirma
// sobre el objeto de dominio que recibe `setDoc`.
const mocks = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  contador: { n: 0 },
  // Sentinela de `deleteField()`: el mock devuelve SIEMPRE esta misma referencia,
  // así los tests afirman que un campo se marca para borrado comparando identidad.
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

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => ({ __collection: path }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contador.n = 0;
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.updateDoc.mockResolvedValue(undefined);
});

describe('crearCliente', () => {
  it('expone el clienteId SÍNCRONAMENTE (sin esperar el ack) y una confirmacion que resuelve', async () => {
    // El id se genera client-side: está disponible en el objeto devuelto, sin
    // await. `confirmacion` es la promesa del setDoc (el ack del servidor).
    const resultado = crearCliente(db, { nombre: 'Marta' });
    expect(typeof resultado.clienteId).toBe('string');
    expect(resultado.clienteId.length).toBeGreaterThan(0);
    expect(resultado.confirmacion).toBeInstanceOf(Promise);
    // El setDoc ya se disparó de forma síncrona dentro de crearCliente.
    expect(mocks.setDoc).toHaveBeenCalledTimes(1);
    await expect(resultado.confirmacion).resolves.toBeUndefined();
  });

  it('alta rápida (solo nombre): stats en cero, activo true, fechaAlta y sin opcionales', () => {
    const antes = Date.now();
    const { clienteId } = crearCliente(db, { nombre: '  Marta  ' });
    const despues = Date.now();

    const [ref, cliente] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toMatch(/^clientes\//);
    expect(clienteId).toBe(ref.id);
    expect(cliente.nombre).toBe('Marta'); // recortado
    expect(cliente.activo).toBe(true);
    expect(cliente.stats).toEqual({ cantidadVentas: 0, totalHistoricoCents: 0 });
    expect(cliente.fechaAlta).toBeInstanceOf(Date);
    const alta = (cliente.fechaAlta as Date).getTime();
    expect(alta).toBeGreaterThanOrEqual(antes);
    expect(alta).toBeLessThanOrEqual(despues);
    // Opcionales de contacto no provistos quedan undefined (el converter los omite).
    expect(cliente.alias).toBeUndefined();
    expect(cliente.telefono).toBeUndefined();
  });

  it('alta completa: guarda los datos de contacto provistos', () => {
    crearCliente(db, {
      nombre: 'Marta González',
      alias: 'Marta la de enfrente',
      telefono: '099123456',
      notas: 'Sábados',
    });
    const [, cliente] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(cliente.alias).toBe('Marta la de enfrente');
    expect(cliente.telefono).toBe('099123456');
    expect(cliente.notas).toBe('Sábados');
    expect(cliente.email).toBeUndefined();
  });

  it('deriva telefonoE164 del telefono display (local UY → E.164 sin +)', () => {
    crearCliente(db, { nombre: 'Marta', telefono: '099 123 456' });
    const [, cliente] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(cliente.telefono).toBe('099 123 456'); // display recortado tal cual
    expect(cliente.telefonoE164).toBe('59899123456');
  });

  it('respeta el codigoPais provisto por el caller al derivar', () => {
    crearCliente(db, { nombre: 'Juan', telefono: '011 4123 4567' }, '54');
    const [, cliente] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(cliente.telefonoE164).toBe('541141234567');
  });

  it('omite telefonoE164 si el telefono NO es normalizable (el botón no se mostrará)', () => {
    crearCliente(db, { nombre: 'Marta', telefono: 'no tengo' });
    const [, cliente] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    // 'no tengo' no matchea la entrada válida de normalizarTelefono → null → omitido.
    expect(cliente.telefono).toBe('no tengo');
    expect(cliente.telefonoE164).toBeUndefined();
  });

  it('omite telefonoE164 si no hay telefono', () => {
    crearCliente(db, { nombre: 'Marta' });
    const [, cliente] = mocks.setDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(cliente.telefonoE164).toBeUndefined();
  });

  it('rechaza nombre vacío tras trim SINCRÓNICAMENTE y no escribe', () => {
    expect(() => crearCliente(db, { nombre: '   ' })).toThrow(ClienteInvalidoError);
    expect(mocks.setDoc).not.toHaveBeenCalled();
  });
});

describe('actualizarCliente', () => {
  it('actualiza contacto sin tocar stats ni activo, y deriva telefonoE164 del telefono escrito', async () => {
    await actualizarCliente(db, 'cli-1', { nombre: 'Marta', telefono: '098 000 111' });
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('clientes/cli-1');
    expect(cambios).toEqual({
      nombre: 'Marta',
      telefono: '098 000 111',
      telefonoE164: '59898000111',
    });
    expect(cambios).not.toHaveProperty('stats');
    expect(cambios).not.toHaveProperty('activo');
  });

  it('no toca telefonoE164 si el update no escribe telefono (queda intacto en el doc)', async () => {
    await actualizarCliente(db, 'cli-1', { nombre: 'Marta', email: 'm@x.uy' });
    const [, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(cambios).toEqual({ nombre: 'Marta', email: 'm@x.uy' });
    expect(cambios).not.toHaveProperty('telefonoE164');
  });

  it('BORRA telefonoE164 (deleteField) si el telefono se reescribe a algo no normalizable', async () => {
    await actualizarCliente(db, 'cli-1', { nombre: 'Marta', telefono: 'sin numero' });
    const [, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(cambios.telefono).toBe('sin numero');
    // Marca de borrado: el E.164 viejo no debe quedar apuntando a otro número.
    expect(cambios.telefonoE164).toBe(mocks.borrar);
  });

  it('respeta el codigoPais provisto por el caller al derivar en el update', async () => {
    await actualizarCliente(db, 'cli-1', { nombre: 'Juan', telefono: '011 4123 4567' }, '54');
    const [, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(cambios.telefonoE164).toBe('541141234567');
  });

  it('rechaza nombre vacío y no escribe', async () => {
    await expect(actualizarCliente(db, 'cli-1', { nombre: '' })).rejects.toThrow(
      ClienteInvalidoError,
    );
    expect(mocks.updateDoc).not.toHaveBeenCalled();
  });
});

describe('desactivarCliente', () => {
  it('escribe solo activo:false (no borra)', async () => {
    await desactivarCliente(db, 'cli-1');
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('clientes/cli-1');
    expect(cambios).toEqual({ activo: false });
  });
});

describe('reactivarCliente', () => {
  it('escribe solo activo:true (inversa de desactivarCliente)', async () => {
    await reactivarCliente(db, 'cli-1');
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [RefFalsa, Record<string, unknown>];
    expect(ref.path).toBe('clientes/cli-1');
    expect(cambios).toEqual({ activo: true });
  });
});
