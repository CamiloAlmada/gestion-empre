/**
 * Config base compartida de Prettier para todos los packages y apps del monorepo.
 * Se usa así (prettier.config.js del package/app):
 *
 *   export { default } from "@gestion/config/prettier"
 *
 * @type {import("prettier").Config}
 */
export default {
  singleQuote: true,
  semi: true,
  printWidth: 100,
  trailingComma: 'all',
};
