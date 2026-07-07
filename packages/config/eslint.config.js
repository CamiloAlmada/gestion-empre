// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

/**
 * Config base compartida de ESLint (flat config) para todos los packages y apps
 * del monorepo. Se usa así:
 *
 *   import baseConfig from "@gestion/config/eslint"
 *
 *   export default [
 *     ...baseConfig,
 *     // reglas específicas del package/app
 *   ]
 */
export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  eslintConfigPrettier,
  {
    ignores: ['dist/**', '.turbo/**', 'node_modules/**', 'coverage/**'],
  },
);
