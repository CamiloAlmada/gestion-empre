// @ts-check
import baseConfig from '@gestion/config/eslint';

/**
 * ESLint flat config de @gestion/core. Reutiliza la config base compartida del
 * monorepo (@gestion/config/eslint) sin agregar reglas específicas: core es
 * TypeScript puro y las reglas base ya cubren `no-explicit-any` y el recomendado.
 */
export default [...baseConfig];
