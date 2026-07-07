import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';

export interface UseAuthResult {
  usuario: User | null;
  cargando: boolean;
  ingresarConEmail: (email: string, password: string) => Promise<void>;
  ingresarConGoogle: () => Promise<void>;
  salir: () => Promise<void>;
}

/**
 * Expone el estado de autenticación de una instancia de `Auth` dada y los
 * métodos para iniciar/cerrar sesión. No mantiene estado global de módulo:
 * cada llamada recibe su propia instancia de `Auth` por parámetro.
 *
 * Los métodos de login/logout no atrapan errores: los propagan para que
 * quien los invoque decida cómo mostrarlos (toast, mensaje de formulario, etc).
 */
export function useAuth(auth: Auth): UseAuthResult {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    setCargando(true);
    const desuscribir = onAuthStateChanged(auth, (usuarioActual) => {
      setUsuario(usuarioActual);
      setCargando(false);
    });

    return desuscribir;
  }, [auth]);

  const ingresarConEmail = useCallback(
    async (email: string, password: string) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    [auth],
  );

  const ingresarConGoogle = useCallback(async () => {
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, [auth]);

  const salir = useCallback(async () => {
    await signOut(auth);
  }, [auth]);

  return { usuario, cargando, ingresarConEmail, ingresarConGoogle, salir };
}
