import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

/**
 * Configuración de cliente de un proyecto Firebase. La arma cada app a partir
 * de sus variables de entorno `VITE_FIREBASE_*`; este package no lee env vars.
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

/**
 * Inicializa Firebase (App, Auth y Firestore) con persistencia offline de
 * Firestore habilitada (multi-tab). Es idempotente: si la app ya fue
 * inicializada previamente (por ejemplo por un hot-reload o por una llamada
 * anterior), reusa la instancia existente en lugar de fallar.
 */
export function initFirebase(config: FirebaseConfig): FirebaseServices {
  const appExistente = getApps()[0];
  const app = appExistente ?? initializeApp(config);
  const auth = getAuth(app);

  // `initializeFirestore` solo puede llamarse una vez por app: si la app ya
  // existía, Firestore ya fue inicializado (con persistencia) en la primera
  // llamada y hay que reusarlo con `getFirestore` en lugar de reinicializarlo.
  const db = appExistente
    ? getFirestore(app)
    : initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });

  return { app, auth, db };
}
