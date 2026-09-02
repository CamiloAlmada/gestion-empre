import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot, type Firestore } from 'firebase/firestore';
import type { Usuario } from '@gestion/core';
import { usuarioConverter } from './converters/usuario';

/**
 * Estado y acciones de autenticación expuestos por `useAuth()`.
 *
 * - `usuario`: cuenta de Firebase Auth (o `null` si no hay sesión).
 * - `perfil`: documento `usuarios/{uid}` en vivo (o `null` si no existe / no se
 *   puede leer). El guard de la app decide el acceso según `perfil.activo`.
 * - `cargando`: `true` mientras la sesión O el perfil estén resolviéndose. Con
 *   sesión activa no vuelve a `false` hasta que el perfil resolvió DE VERDAD,
 *   para no exponer un instante de `perfil: null` engañoso. Un "no existe"
 *   que viene de la caché local no cuenta como resolución (ver el JSDoc de
 *   `ProveedorAuth`).
 */
export interface EstadoAuth {
  usuario: User | null;
  perfil: Usuario | null;
  cargando: boolean;
  ingresarConEmail: (email: string, password: string) => Promise<void>;
  restablecerPassword: (email: string) => Promise<void>;
  salir: () => Promise<void>;
}

const ContextoAuth = createContext<EstadoAuth | null>(null);

/**
 * Los campos de `Usuario` que se comparan para decidir si un snapshot trae
 * algo nuevo. El `satisfies` obliga a que estén TODOS: si mañana se le agrega
 * un campo al tipo, esto deja de compilar en vez de comparar de menos —y
 * dejar la UI vieja— en silencio.
 */
const CLAVES_USUARIO = {
  uid: true,
  nombre: true,
  email: true,
  rol: true,
  activo: true,
} satisfies Record<keyof Usuario, true>;

/**
 * Igualdad campo a campo entre el perfil vigente y el que trae un snapshot.
 * Todos los campos de `Usuario` son primitivos, así que `===` alcanza.
 *
 * Sirve para no crear un objeto nuevo cuando el snapshot del servidor
 * confirma lo que ya teníamos de la caché: con `includeMetadataChanges: true`
 * ese segundo snapshot llega SIEMPRE, y sin esta comparación re-renderizaría
 * a todos los consumidores de `useAuth()` por nada.
 */
function mismoPerfil(anterior: Usuario | null, nuevo: Usuario): boolean {
  if (anterior === null) {
    return false;
  }
  return (Object.keys(CLAVES_USUARIO) as Array<keyof Usuario>).every(
    (clave) => anterior[clave] === nuevo[clave],
  );
}

export interface ProveedorAuthProps {
  auth: Auth;
  db: Firestore;
  children: ReactNode;
}

/**
 * Provee el estado de autenticación a toda la app con UNA sola suscripción a
 * `onAuthStateChanged` y UNA sola suscripción `onSnapshot` al perfil del usuario
 * actual. Cuando la sesión cambia, la suscripción al perfil anterior se
 * desmonta antes de abrir la nueva (cleanup del efecto). El perfil en vivo
 * importa: si un admin desactiva a alguien, esa sesión pierde acceso sin
 * re-login.
 *
 * Los métodos de sesión no atrapan errores: los propagan para que el llamador
 * decida cómo mostrarlos.
 *
 * ## Por qué el listener del perfil mira `metadata.fromCache` (2026-09-02)
 *
 * Bug de producción: el dueño borró los datos del sitio en Chrome Android
 * (lo que vacía la persistencia de Firestore), volvió a loguearse y vio
 * "Cuenta no autorizada" con su doc `usuarios/{uid}` intacto y `activo: true`.
 *
 * Con la caché vacía, si el watch stream falla una vez o pasan ~10 s sin
 * respuesta, el SDK pasa a `OnlineState.Offline` y le entrega al listener un
 * snapshot VACÍO servido desde la caché (`exists() === false`,
 * `metadata.fromCache === true`). El `unavailable` nunca llega al callback de
 * error: el SDK degrada a caché en vez de fallar. Ese "no existe" de una
 * caché vacía se volvía `perfil: null` con `cargando: false`, y el guard lo
 * leía como cuenta no autorizada.
 *
 * De ahí las tres ramas del `next` (con `includeMetadataChanges: true`, sin
 * el cual el snapshot del servidor puede no re-emitirse si trae los mismos
 * datos):
 * - `exists()` — se acepta venga de caché o del servidor. Un vendedor con el
 *   perfil ya cacheado tiene que poder entrar sin red (regla de oro 6).
 * - `!exists()` desde caché — NO es una respuesta, es la ausencia de una: no
 *   se toca el estado, `cargando` sigue en `true` y el listener (que queda
 *   vivo) entregará el snapshot real al reconectar. El costo aceptado es que
 *   un usuario sin doc Y sin red se queda en el spinner en vez de ver
 *   "Cuenta no autorizada"; el falso negativo era mucho peor.
 * - `!exists()` confirmado por el servidor — ahí sí, `perfil: null` resuelto.
 */
export function ProveedorAuth({ auth, db, children }: ProveedorAuthProps) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [perfil, setPerfil] = useState<Usuario | null>(null);
  const [cargandoAuth, setCargandoAuth] = useState(true);
  // uid cuyo perfil ya resolvió (haya doc o no); `null` si todavía ninguno
  // resolvió para el usuario actual. Distingue "perfil aún sin cargar" de
  // "perfil resuelto en null", que `perfil` por sí solo no puede.
  const [uidPerfilResuelto, setUidPerfilResuelto] = useState<string | null>(null);

  // Suscripción única a la sesión.
  useEffect(() => {
    const desuscribir = onAuthStateChanged(auth, (usuarioActual) => {
      setUsuario(usuarioActual);
      setCargandoAuth(false);
    });
    return desuscribir;
  }, [auth]);

  // Suscripción única al perfil, atada al usuario actual. Al cambiar de usuario
  // el cleanup desuscribe el snapshot anterior antes de abrir el nuevo.
  useEffect(() => {
    if (usuario === null) {
      setPerfil(null);
      setUidPerfilResuelto(null);
      return;
    }

    // Usuario nuevo: el perfil anterior deja de valer hasta que llegue su
    // snapshot (mantiene `cargando` en true mientras tanto).
    setPerfil(null);
    setUidPerfilResuelto(null);

    const ref = doc(db, 'usuarios', usuario.uid).withConverter(usuarioConverter);
    const desuscribir = onSnapshot(
      ref,
      // Sin esto, el snapshot del servidor que solo confirma lo que ya está
      // en caché no se re-emite, y nunca sabríamos que el "no existe" de la
      // caché quedó descartado.
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.exists()) {
          // Hay perfil: vale igual venga de caché o del servidor (offline-first).
          const datos = snapshot.data();
          setPerfil((anterior) => (mismoPerfil(anterior, datos) ? anterior : datos));
          setUidPerfilResuelto(usuario.uid);
          return;
        }
        if (snapshot.metadata.fromCache) {
          // "No existe" según una caché que puede estar vacía (datos del sitio
          // borrados, primer login en el dispositivo, red caída). No es una
          // respuesta: no se toca el estado, así que `cargando` sigue en `true`
          // y este mismo listener entregará el snapshot del servidor al
          // reconectar. Ver el bloque "Por qué el listener del perfil mira
          // `metadata.fromCache`" en el JSDoc de arriba.
          return;
        }
        // El servidor confirmó que el doc no existe: cuenta no autorizada de verdad.
        setPerfil(null);
        setUidPerfilResuelto(usuario.uid);
      },
      () => {
        // Solo llega `permission-denied` (reglas): la indisponibilidad de red
        // NO cae acá, el SDK la degrada al snapshot desde caché que maneja el
        // callback de arriba. Un rechazo por reglas no es excepción de
        // negocio: se traduce a `perfil: null` con `cargando: false`.
        setPerfil(null);
        setUidPerfilResuelto(usuario.uid);
      },
    );
    return desuscribir;
  }, [usuario, db]);

  const ingresarConEmail = useCallback(
    async (email: string, password: string) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    [auth],
  );

  const restablecerPassword = useCallback(
    async (email: string) => {
      await sendPasswordResetEmail(auth, email);
    },
    [auth],
  );

  const salir = useCallback(async () => {
    await signOut(auth);
  }, [auth]);

  const perfilResuelto = usuario !== null && uidPerfilResuelto === usuario.uid;
  const cargando = cargandoAuth || (usuario !== null && !perfilResuelto);

  const valor = useMemo<EstadoAuth>(
    () => ({ usuario, perfil, cargando, ingresarConEmail, restablecerPassword, salir }),
    [usuario, perfil, cargando, ingresarConEmail, restablecerPassword, salir],
  );

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>;
}

/**
 * Acceso al estado de autenticación. Debe usarse dentro de un `<ProveedorAuth>`.
 */
export function useAuth(): EstadoAuth {
  const contexto = useContext(ContextoAuth);
  if (contexto === null) {
    throw new Error('useAuth debe usarse dentro de un <ProveedorAuth>.');
  }
  return contexto;
}
