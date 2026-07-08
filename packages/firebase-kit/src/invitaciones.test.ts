import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Rol } from '@gestion/core';
import { invitarUsuario, type EntradaInvitacion } from './invitaciones';
import {
  DatosInvitacionInvalidosError,
  EmailInvalidoError,
  EmailYaRegistradoError,
  PerfilNoCreadoError,
} from './errores';

// Mocks de las tres áreas de Firebase que toca el flujo. Cada uno es
// configurable por test (createUser/setDoc/sendReset pueden fallar) y todos
// registran orden de invocación vía `mock.invocationCallOrder`, que usamos para
// afirmar la secuencia create → setDoc → sendPasswordResetEmail.
const mocks = vi.hoisted(() => ({
  initializeApp: vi.fn(),
  deleteApp: vi.fn(),
  getAuth: vi.fn(),
  createUser: vi.fn(),
  sendReset: vi.fn(),
  signOut: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn(),
}));

vi.mock('firebase/app', () => ({
  initializeApp: mocks.initializeApp,
  deleteApp: mocks.deleteApp,
}));

vi.mock('firebase/auth', () => ({
  getAuth: mocks.getAuth,
  createUserWithEmailAndPassword: mocks.createUser,
  sendPasswordResetEmail: mocks.sendReset,
  signOut: mocks.signOut,
}));

vi.mock('firebase/firestore', () => ({
  doc: mocks.doc,
  setDoc: mocks.setDoc,
}));

// El converter es identidad en unit: afirmamos sobre el objeto de dominio que
// recibe `setDoc`, no sobre la serialización.
interface RefFalsa {
  path: string;
  withConverter: () => RefFalsa;
}

// `db` (principal, sesión admin) es opaco: solo se pasa a `doc`.
const db = { __principal: true } as never;

const config = {
  apiKey: 'k',
  authDomain: 'a',
  projectId: 'p',
  storageBucket: 's',
  messagingSenderId: 'm',
  appId: 'i',
};

const entradaValida: EntradaInvitacion = {
  email: 'nuevo@ejemplo.com',
  nombre: 'Persona Nueva',
  rol: 'vendedor',
};

const ALFABETO_ESPERADO = /^[A-Za-z0-9!@#$%^&*()\-_=+[\]{}]{40}$/;

beforeEach(() => {
  vi.clearAllMocks();

  // Instancia secundaria: un app opaco que recuerda su nombre único.
  mocks.initializeApp.mockImplementation((_config: unknown, nombre: string) => ({
    __name: nombre,
  }));
  mocks.deleteApp.mockResolvedValue(undefined);

  // Cada `getAuth` devuelve un auth fresco y mutable (el código le setea
  // `languageCode = 'es'`).
  mocks.getAuth.mockImplementation((app: unknown) => ({
    __app: app,
    languageCode: undefined as string | undefined,
  }));

  mocks.createUser.mockResolvedValue({ user: { uid: 'uid-nuevo' } });
  mocks.sendReset.mockResolvedValue(undefined);
  mocks.signOut.mockResolvedValue(undefined);
  mocks.setDoc.mockResolvedValue(undefined);

  mocks.doc.mockImplementation((_db: unknown, ...segmentos: string[]): RefFalsa => {
    const ref: RefFalsa = { path: segmentos.join('/'), withConverter: () => ref };
    return ref;
  });
});

describe('invitarUsuario — flujo feliz', () => {
  it('crea cuenta, perfil y email en ese orden y devuelve el uid', async () => {
    const resultado = await invitarUsuario(db, config, entradaValida);

    expect(resultado).toEqual({ uid: 'uid-nuevo' });

    // Orden: create → setDoc → sendPasswordResetEmail.
    const [ordenCreate] = mocks.createUser.mock.invocationCallOrder as [number];
    const [ordenSetDoc] = mocks.setDoc.mock.invocationCallOrder as [number];
    const [ordenReset] = mocks.sendReset.mock.invocationCallOrder as [number];
    expect(ordenCreate).toBeLessThan(ordenSetDoc);
    expect(ordenSetDoc).toBeLessThan(ordenReset);
  });

  it('crea el perfil sobre la instancia PRINCIPAL con el shape exacto de las reglas', async () => {
    await invitarUsuario(db, config, entradaValida);

    // `doc` se llama con `db` (principal) y la ruta usuarios/{uid}.
    expect(mocks.doc).toHaveBeenCalledWith(db, 'usuarios', 'uid-nuevo');

    // El objeto persistido es exactamente { uid, nombre, email, rol, activo }.
    const [, usuarioEscrito] = mocks.setDoc.mock.calls[0] as [unknown, unknown];
    expect(usuarioEscrito).toEqual({
      uid: 'uid-nuevo',
      nombre: 'Persona Nueva',
      email: 'nuevo@ejemplo.com',
      rol: 'vendedor',
      activo: true,
    });
  });

  it('usa una instancia secundaria con nombre único y auth en español', async () => {
    await invitarUsuario(db, config, entradaValida);

    const [, nombreSecundaria] = mocks.initializeApp.mock.calls[0] as [unknown, string];
    expect(nombreSecundaria).toMatch(/^invitacion-/);
    // La cuenta se crea contra la secundaria (getAuth de la app secundaria), en
    // español; la principal nunca recibe getAuth acá.
    const [authUsado, emailUsado] = mocks.createUser.mock.calls[0] as [
      { languageCode?: string },
      string,
    ];
    expect(authUsado.languageCode).toBe('es');
    expect(emailUsado).toBe('nuevo@ejemplo.com');
  });

  it('destruye la instancia secundaria (signOut + deleteApp) al terminar', async () => {
    await invitarUsuario(db, config, entradaValida);

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.deleteApp).toHaveBeenCalledTimes(1);
    // deleteApp sobre la instancia secundaria (la que se inicializó, no la
    // principal): reconocible por su nombre único `invitacion-…`.
    const [appDestruida] = mocks.deleteApp.mock.calls[0] as [{ __name?: string }];
    expect(appDestruida.__name).toMatch(/^invitacion-/);
  });

  it('recorta espacios de email y nombre antes de persistir', async () => {
    await invitarUsuario(db, config, {
      email: '  nuevo@ejemplo.com  ',
      nombre: '  Persona Nueva  ',
      rol: 'admin',
    });

    const [, usuarioEscrito] = mocks.setDoc.mock.calls[0] as [unknown, unknown];
    expect(usuarioEscrito).toEqual({
      uid: 'uid-nuevo',
      nombre: 'Persona Nueva',
      email: 'nuevo@ejemplo.com',
      rol: 'admin',
      activo: true,
    });
  });
});

describe('invitarUsuario — contraseña descartable', () => {
  it('genera una contraseña de 40 chars del alfabeto amplio', async () => {
    await invitarUsuario(db, config, entradaValida);

    const [, , password] = mocks.createUser.mock.calls[0] as [unknown, unknown, string];
    expect(password).toMatch(ALFABETO_ESPERADO);
  });

  it('genera contraseñas distintas y nombres de app distintos entre llamadas', async () => {
    await invitarUsuario(db, config, entradaValida);
    await invitarUsuario(db, config, entradaValida);

    const [, , pass1] = mocks.createUser.mock.calls[0] as [unknown, unknown, string];
    const [, , pass2] = mocks.createUser.mock.calls[1] as [unknown, unknown, string];
    expect(pass1).not.toBe(pass2);

    const [, nombre1] = mocks.initializeApp.mock.calls[0] as [unknown, string];
    const [, nombre2] = mocks.initializeApp.mock.calls[1] as [unknown, string];
    expect(nombre1).not.toBe(nombre2);
  });
});

describe('invitarUsuario — validaciones previas (sin tocar Firebase)', () => {
  it('rechaza email con forma inválida antes de inicializar Firebase', async () => {
    await expect(
      invitarUsuario(db, config, { ...entradaValida, email: 'no-es-email' }),
    ).rejects.toBeInstanceOf(EmailInvalidoError);
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });

  it('rechaza nombre vacío (o solo espacios)', async () => {
    await expect(
      invitarUsuario(db, config, { ...entradaValida, nombre: '   ' }),
    ).rejects.toBeInstanceOf(DatosInvitacionInvalidosError);
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });

  it('rechaza un rol fuera de la unión', async () => {
    await expect(
      invitarUsuario(db, config, { ...entradaValida, rol: 'gerente' as unknown as Rol }),
    ).rejects.toBeInstanceOf(DatosInvitacionInvalidosError);
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });
});

describe('invitarUsuario — mapeo de errores de Auth', () => {
  it('mapea auth/email-already-in-use a EmailYaRegistradoError sin crear perfil ni email', async () => {
    mocks.createUser.mockRejectedValue({ code: 'auth/email-already-in-use' });

    await expect(invitarUsuario(db, config, entradaValida)).rejects.toBeInstanceOf(
      EmailYaRegistradoError,
    );
    expect(mocks.setDoc).not.toHaveBeenCalled();
    expect(mocks.sendReset).not.toHaveBeenCalled();
    // Cleanup igual.
    expect(mocks.deleteApp).toHaveBeenCalledTimes(1);
  });

  it('mapea auth/invalid-email a EmailInvalidoError', async () => {
    // Email de forma válida local, pero Auth lo rechaza.
    mocks.createUser.mockRejectedValue({ code: 'auth/invalid-email' });

    await expect(invitarUsuario(db, config, entradaValida)).rejects.toBeInstanceOf(
      EmailInvalidoError,
    );
    expect(mocks.deleteApp).toHaveBeenCalledTimes(1);
  });

  it('propaga un error de Auth desconocido tal cual, con cleanup', async () => {
    const desconocido = { code: 'auth/network-request-failed' };
    mocks.createUser.mockRejectedValue(desconocido);

    await expect(invitarUsuario(db, config, entradaValida)).rejects.toBe(desconocido);
    expect(mocks.deleteApp).toHaveBeenCalledTimes(1);
  });
});

describe('invitarUsuario — fallo parcial y cleanup', () => {
  it('si setDoc falla lanza PerfilNoCreadoError y NO envía el email', async () => {
    mocks.setDoc.mockRejectedValue(new Error('permission-denied'));

    await expect(invitarUsuario(db, config, entradaValida)).rejects.toBeInstanceOf(
      PerfilNoCreadoError,
    );
    // La cuenta ya se creó, pero el email de invitación no se manda.
    expect(mocks.createUser).toHaveBeenCalledTimes(1);
    expect(mocks.sendReset).not.toHaveBeenCalled();
    // Cleanup igual.
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.deleteApp).toHaveBeenCalledTimes(1);
  });

  it('destruye la secundaria aunque el envío del email falle, propagando el error', async () => {
    const fallo = new Error('sendPasswordResetEmail falló');
    mocks.sendReset.mockRejectedValue(fallo);

    await expect(invitarUsuario(db, config, entradaValida)).rejects.toBe(fallo);
    expect(mocks.deleteApp).toHaveBeenCalledTimes(1);
  });

  it('destruye la secundaria aunque signOut falle en el cleanup', async () => {
    mocks.signOut.mockRejectedValue(new Error('signOut falló'));

    // El flujo terminó bien; un fallo de limpieza no debe romper el resultado.
    await expect(invitarUsuario(db, config, entradaValida)).resolves.toEqual({
      uid: 'uid-nuevo',
    });
    expect(mocks.deleteApp).toHaveBeenCalledTimes(1);
  });
});
