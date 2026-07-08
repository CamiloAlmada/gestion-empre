import { defineConfig } from 'vitest/config';

// Config aparte para la suite de reglas de Firestore. Corre en Node (no jsdom)
// contra el emulador levantado por `firebase emulators:exec` (script test:rules).
// Se mantiene separada de vitest.config.ts para NO mezclarla con los tests de
// `src` (que corren en CI sin emulador): el script `test` normal no la toca.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    // El emulador es un recurso compartido: un solo worker evita carreras entre
    // archivos al limpiar/sembrar la base entre casos.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
