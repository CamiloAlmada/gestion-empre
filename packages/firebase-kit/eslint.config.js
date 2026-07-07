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
];
