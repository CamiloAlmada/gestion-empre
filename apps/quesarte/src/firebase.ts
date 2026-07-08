import { initFirebase, type FirebaseConfig, type FirebaseServices } from '@gestion/firebase-kit';

const CLAVES_REQUERIDAS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

type ClaveFirebase = (typeof CLAVES_REQUERIDAS)[number];

/**
 * Arma la configuración de Firebase a partir de las variables de entorno
 * `VITE_FIREBASE_*`. La validación pasa en tiempo de ejecución (no en el
 * build, que debe poder correr sin `.env`): si falta alguna variable, lanza
 * un error legible que enumera cuáles.
 */
export function obtenerConfigFirebase(): FirebaseConfig {
  const env = import.meta.env as unknown as Record<ClaveFirebase, string | undefined>;
  const faltantes = CLAVES_REQUERIDAS.filter((clave) => !env[clave]);

  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables de entorno de Firebase: ${faltantes.join(', ')}. ` +
        'Copiá .env.example a .env.development (o .env.production) y completá los valores del proyecto Firebase.',
    );
  }

  return {
    apiKey: env.VITE_FIREBASE_API_KEY as string,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string,
    projectId: env.VITE_FIREBASE_PROJECT_ID as string,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
    appId: env.VITE_FIREBASE_APP_ID as string,
  };
}

const servicios: FirebaseServices = initFirebase(obtenerConfigFirebase());

export const { app, auth, db } = servicios;
