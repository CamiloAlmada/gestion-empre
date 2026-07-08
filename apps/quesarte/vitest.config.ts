import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
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
