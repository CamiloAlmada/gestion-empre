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
 *   sesión activa no vuelve a `false` hasta que el primer snapshot del perfil
 *   llegó, para no exponer un instante de `perfil: null` engañoso.
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
      (snapshot) => {
        setPerfil(snapshot.exists() ? snapshot.data() : null);
        setUidPerfilResuelto(usuario.uid);
      },
      () => {
        // Un error de lectura por reglas (usuario sin doc, sin permiso) no es
        // excepción de negocio: se traduce a `perfil: null` con `cargando: false`.
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
