import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aplicarTemaNegocio,
  borrarCacheTemaNegocio,
  escribirCacheTemaNegocio,
  limpiarTemaNegocio,
  type CacheTemaNegocio,
  type TokensGenerados,
} from './temaNegocio';

function crearTokens(overrides: Partial<TokensGenerados> = {}): TokensGenerados {
  return {
    version: 1,
    tema: { version: 1, matiz: 200, tinte: 'neutro' },
    variables: {
      '--fondo-light': 'oklch(0.98 0.01 200)',
      '--fondo-dark': 'oklch(0.15 0.01 200)',
      '--color-primary-500': 'oklch(0.65 0.12 200)',
    },
    themeColor: { light: '#fafafa', dark: '#111111' },
    reporte: {},
    ...overrides,
  };
}

function limpiarDom(): void {
  document.getElementById('tema-negocio')?.remove();
  document.documentElement.removeAttribute('data-tema-negocio');
}

describe('temaNegocio', () => {
  beforeEach(() => {
    limpiarDom();
    window.localStorage.clear();
  });

  afterEach(() => {
    limpiarDom();
    window.localStorage.clear();
  });

  describe('aplicarTemaNegocio', () => {
    it('crea el <style id="tema-negocio"> en <head> con el CSS y el atributo en <html>', () => {
      aplicarTemaNegocio(crearTokens());

      const style = document.getElementById('tema-negocio');
      expect(style).not.toBeNull();
      expect(style?.tagName).toBe('STYLE');
      expect(style?.parentElement).toBe(document.head);
      expect(style?.textContent).toBe(
        ":root[data-tema-negocio] {\n  --fondo-light: oklch(0.98 0.01 200);\n  --fondo-dark: oklch(0.15 0.01 200);\n  --color-primary-500: oklch(0.65 0.12 200);\n}",
      );
      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
    });

    it('al reaplicar reemplaza el contenido sin duplicar el <style>', () => {
      aplicarTemaNegocio(crearTokens());
      aplicarTemaNegocio(
        crearTokens({ variables: { '--fondo-light': 'oklch(0.5 0.2 40)' } }),
      );

      const styles = document.head.querySelectorAll('#tema-negocio');
      expect(styles).toHaveLength(1);
      expect(styles[0]?.textContent).toBe(
        ':root[data-tema-negocio] {\n  --fondo-light: oklch(0.5 0.2 40);\n}',
      );
    });
  });

  describe('limpiarTemaNegocio', () => {
    it('quita el atributo de <html> y vacía el <style> sin quitarlo del head', () => {
      aplicarTemaNegocio(crearTokens());

      limpiarTemaNegocio();

      const style = document.getElementById('tema-negocio');
      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
      expect(style).not.toBeNull();
      expect(style?.textContent).toBe('');
    });

    it('no rompe si se llama sin haber aplicado nada antes', () => {
      expect(() => limpiarTemaNegocio()).not.toThrow();
      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
    });
  });

  describe('cache de localStorage', () => {
    it('escribirCacheTemaNegocio guarda { v: 1, css, themeColor } con el mismo CSS que se inyecta', () => {
      const tokens = crearTokens();

      escribirCacheTemaNegocio(tokens);

      const crudo = window.localStorage.getItem('temaNegocio');
      expect(crudo).not.toBeNull();
      const parseado = JSON.parse(crudo ?? '') as CacheTemaNegocio;
      expect(parseado).toEqual({
        v: 1,
        css: ':root[data-tema-negocio] {\n  --fondo-light: oklch(0.98 0.01 200);\n  --fondo-dark: oklch(0.15 0.01 200);\n  --color-primary-500: oklch(0.65 0.12 200);\n}',
        themeColor: { light: '#fafafa', dark: '#111111' },
      });
    });

    it('borrarCacheTemaNegocio elimina la clave', () => {
      escribirCacheTemaNegocio(crearTokens());
      expect(window.localStorage.getItem('temaNegocio')).not.toBeNull();

      borrarCacheTemaNegocio();

      expect(window.localStorage.getItem('temaNegocio')).toBeNull();
    });

    it('tolera localStorage no disponible sin lanzar', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage no disponible');
      });

      expect(() => escribirCacheTemaNegocio(crearTokens())).not.toThrow();

      setItemSpy.mockRestore();
    });
  });
});
