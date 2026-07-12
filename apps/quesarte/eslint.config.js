// @ts-check
import baseConfig from '@gestion/config/eslint';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        window: 'readonly',
        navigator: 'readonly',
        document: 'readonly',
      },
    },
  },
  {
    // Scripts de mantenimiento (WA-D: seed de demo) corren en Node puro, sin
    // navegador: globals propios en vez de los de `window`/`document` de arriba.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
      },
    },
  },
];
