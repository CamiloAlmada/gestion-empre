import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    // test-setup.ts: polyfill de <dialog> para jsdom, necesario desde que
    // Productos.tsx renderiza el `Modal` de @gestion/ui en tests.
    setupFiles: ['./src/test-setup.ts'],
    // `scripts/**` (WA-D, seed de demo): módulos puros del generador, cubiertos
    // acá para reusar la resolución de workspace (`@gestion/core`,
    // `@gestion/firebase-kit`) que ya usa el resto de la suite. `seed-demo.mjs`
    // (el shell con `firebase-admin`) NO tiene test unitario: es el orquestador
    // fino, sin lógica propia más allá del guardrail (manual, ver README).
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    // Valores falsos: alcanzan para que `src/firebase.ts` no aborte por
    // validación de env vars. `@gestion/firebase-kit` se mockea en los tests
    // que lo necesitan, así que nunca se usan para hablar con Firebase real.
    env: {
      VITE_FIREBASE_API_KEY: 'api-key-de-test',
      VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'test-project',
      VITE_FIREBASE_STORAGE_BUCKET: 'test-project.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:0000000000000000000000',
    },
  },
});
