import { deleteApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import type { Rol, Usuario } from '@gestion/core';
import type { FirebaseConfig } from './init';
import { usuarioConverter } from './converters/usuario';
import {
  DatosInvitacionInvalidosError,
  EmailInvalidoError,
  EmailYaRegistradoError,
  PerfilNoCreadoError,
} from './errores';

/**
 * Alta de usuarios por invitación desde la app (decidido con el dueño, ver la
 * nota "Auth y alta de usuarios (v2)" de `docs/04-plan-fases.md`). Sin Cloud
 * Functions: todo el flujo corre en el cliente del admin.
 *
 * El problema que resuelve: `createUserWithEmailAndPassword` deja logueada en la
 * instancia de Auth a la cuenta recién creada. Si lo hiciéramos sobre la
 * instancia principal, el admin quedaría deslogueado y en su lugar entraría el
 * invitado. Por eso se levanta una **instancia secundaria** de Firebase (misma
 * `config`, nombre único) solo para crear la cuenta; la principal —la sesión del
 * admin— nunca se toca.
 *
 * El doc `usuarios/{uid}`, en cambio, se escribe con la instancia PRINCIPAL (`db`):
 * son los permisos del admin los que autorizan el `create` (las reglas exigen
 * `esAdmin()` + shape exacto `{nombre, email, rol, activo}`). La secundaria, recién
 * logueada como el invitado, no tendría permiso para crearlo.
 */

/** Datos que ingresa el admin en la pantalla "Usuarios". */
export interface EntradaInvitacion {
  email: string;
  nombre: string;
  rol: Rol;
}

// Alfabeto amplio para la contraseña descartable: mayúsculas, minúsculas,
// dígitos y símbolos. No se muestra ni se persiste nunca; su único fin es que la
// cuenta exista para disparar el `sendPasswordResetEmail`, con el que el
// invitado define su contraseña real.
const ALFABETO_PASSWORD =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}';
const LARGO_PASSWORD = 40;

/**
 * Genera una contraseña aleatoria criptográficamente segura con muestreo por
 * rechazo, para no introducir sesgo de módulo (se descartan los bytes que caen
 * fuera del mayor múltiplo del tamaño del alfabeto). Se descarta apenas creada
 * la cuenta: el acceso real lo define el invitado vía el email de reseteo.
 */
function generarPasswordAleatoria(): string {
  const n = ALFABETO_PASSWORD.length;
  const maxSinSesgo = Math.floor(256 / n) * n;
  let password = '';
  while (password.length < LARGO_PASSWORD) {
    const bytes = new Uint8Array(LARGO_PASSWORD);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < maxSinSesgo) {
        password += ALFABETO_PASSWORD[byte % n];
        if (password.length === LARGO_PASSWORD) break;
      }
    }
  }
  return password;
}

// Forma de email pragmática: algo@algo.algo sin espacios. No pretende validar el
// RFC 5322 completo (imposible con un regex sano); Auth es la autoridad final y
// devuelve `auth/invalid-email`. Esto solo evita el round-trip en errores obvios.
const FORMA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Códigos de error de Firebase Auth que sabemos mapear a un error de dominio. */
function mapearErrorAuth(error: unknown): unknown {
  const codigo = (error as { code?: unknown }).code;
  if (codigo === 'auth/email-already-in-use') {
    return new EmailYaRegistradoError(
      'Ya existe una cuenta con ese email. El usuario ya fue invitado.',
    );
  }
  if (codigo === 'auth/invalid-email') {
    return new EmailInvalidoError('El email no tiene un formato válido.');
  }
  // Error desconocido (red, cuota, config): se propaga tal cual.
  return error;
}

/**
 * Invita a un usuario: crea su cuenta de Auth sin desloguear al admin, crea su
 * doc `usuarios/{uid}` (`activo: true`) y le manda el email para que defina su
 * contraseña. Devuelve el `uid` de la cuenta creada.
 *
 * Flujo (la instancia secundaria se destruye SIEMPRE, haya éxito o error):
 *   1. Valida los datos localmente (fail fast, sin tocar Firebase).
 *   2. Levanta una instancia secundaria de Firebase con nombre único.
 *   3. Crea la cuenta de Auth con una contraseña aleatoria descartable.
 *   4. Escribe `usuarios/{uid}` con la sesión ADMIN (`db`), shape exacto.
 *   5. Dispara `sendPasswordResetEmail` (el "mail de invitación", en español).
 *   6. `finally`: `signOut` + `deleteApp` de la secundaria.
 *
 * Manejo de errores (todos tipados, extienden `ErrorInvitacion`):
 *   - Datos inválidos → `EmailInvalidoError` / `DatosInvitacionInvalidosError`.
 *   - Email ya registrado → `EmailYaRegistradoError`.
 *   - Cuenta creada pero `setDoc` falló → `PerfilNoCreadoError`.
 *
 * LIMITACIÓN CONOCIDA (`PerfilNoCreadoError`): si el paso 3 crea la cuenta pero
 * el paso 4 falla, la cuenta de Auth queda HUÉRFANA (sin doc de perfil). No es
 * un riesgo de acceso —sin doc, el guard y las reglas la tratan como "no
 * autorizada"—, pero reintentar la invitación con el mismo email dará
 * `EmailYaRegistradoError`: el cliente NO puede borrar la cuenta ajena. La
 * huérfana se resuelve desde la consola de Firebase (borrar la cuenta de Auth,
 * o crearle el doc `usuarios/{uid}` a mano).
 *
 * @param db      Instancia PRINCIPAL de Firestore (sesión del admin: sus
 *                permisos autorizan el `create` de `usuarios/{uid}`).
 * @param config  Config de cliente del proyecto (la misma de la app), para
 *                levantar la instancia secundaria.
 * @param entrada Datos ingresados por el admin: email, nombre y rol.
 */
export async function invitarUsuario(
  db: Firestore,
  config: FirebaseConfig,
  entrada: EntradaInvitacion,
): Promise<{ uid: string }> {
  const email = entrada.email.trim();
  const nombre = entrada.nombre.trim();
  const { rol } = entrada;

  // 1. Validaciones previas: fail fast antes de tocar Firebase.
  if (!FORMA_EMAIL.test(email)) {
    throw new EmailInvalidoError('El email no tiene un formato válido.');
  }
  if (nombre.length === 0) {
    throw new DatosInvitacionInvalidosError('El nombre no puede estar vacío.');
  }
  if (rol !== 'admin' && rol !== 'vendedor') {
    throw new DatosInvitacionInvalidosError(`Rol inválido: ${String(rol)}.`);
  }

  // 2. Instancia secundaria con nombre único: el timestamp evita chocar con la
  //    app principal y el sufijo aleatorio, con una invitación concurrente que
  //    caiga en el mismo milisegundo.
  const sufijo = Math.floor(Math.random() * 1e9).toString(36);
  const nombreSecundaria = `invitacion-${Date.now()}-${sufijo}`;
  const secundaria = initializeApp(config, nombreSecundaria);
  const authSecundaria = getAuth(secundaria);
  // Email de reseteo (la "invitación") en español.
  authSecundaria.languageCode = 'es';

  try {
    // 3. Crear la cuenta de Auth. Esto loguea al invitado EN LA SECUNDARIA; la
    //    principal (el admin) sigue intacta.
    let uid: string;
    try {
      const credencial = await createUserWithEmailAndPassword(
        authSecundaria,
        email,
        generarPasswordAleatoria(),
      );
      uid = credencial.user.uid;
    } catch (error) {
      throw mapearErrorAuth(error);
    }

    // 4. Crear el perfil con la sesión ADMIN (`db`). El converter escribe solo
    //    { nombre, email, rol, activo }: el shape exacto que exigen las reglas.
    try {
      const ref = doc(db, 'usuarios', uid).withConverter(usuarioConverter);
      const usuario: Usuario = { uid, nombre, email, rol, activo: true };
      await setDoc(ref, usuario);
    } catch {
      // La cuenta ya existe pero se quedó sin perfil: fallo parcial crítico.
      throw new PerfilNoCreadoError(
        `Se creó la cuenta de ${email} pero no su perfil; quedó sin acceso. ` +
          'Reintentar la invitación con el mismo email dará "email ya registrado": ' +
          'resolvelo desde la consola de Firebase.',
      );
    }

    // 5. Email de invitación ("establecé tu contraseña"). Solo se envía si el
    //    perfil se creó bien.
    await sendPasswordResetEmail(authSecundaria, email);

    return { uid };
  } finally {
    // 6. Cleanup SIEMPRE: desloguear al invitado de la secundaria y destruirla.
    //    Se protege cada paso: un fallo de limpieza no debe tapar el error real
    //    (ni el resultado) del flujo.
    try {
      await signOut(authSecundaria);
    } catch {
      // Ignorado a propósito: la secundaria se destruye igual abajo.
    }
    try {
      await deleteApp(secundaria);
    } catch {
      // Ignorado a propósito: no hay nada más que hacer con la instancia.
    }
  }
}
