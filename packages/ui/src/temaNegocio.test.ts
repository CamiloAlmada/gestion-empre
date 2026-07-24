import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generarPaleta, type TokensGenerados } from '@gestion/core';
import {
  aplicarTemaNegocio,
  borrarCacheTemaNegocio,
  escribirCacheTemaNegocio,
  leerCacheTemaNegocio,
  limpiarTemaNegocio,
  type CacheTemaNegocio,
} from './temaNegocio';

// Tokens REALES del motor (no maquetas a mano): esto además ejercita el
// shape completo que produce generarPaleta (27 variables + reporte de AA),
// no una versión parcial que el tipo del contrato ya no permite construir.
const TOKENS_MIEL: TokensGenerados = generarPaleta({ version: 1, matiz: 78, tinte: 'neutro' });
const TOKENS_MAR: TokensGenerados = generarPaleta({ version: 1, matiz: 200, tinte: 'frio' });

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
    it('crea el <style id="tema-negocio"> en <head> con las 27 variables y el atributo en <html>', () => {
      aplicarTemaNegocio(TOKENS_MIEL);

      const style = document.getElementById('tema-negocio');
      expect(style).not.toBeNull();
      expect(style?.tagName).toBe('STYLE');
      expect(style?.parentElement).toBe(document.head);

      const css = style?.textContent ?? '';
      expect(css.startsWith(':root[data-tema-negocio] {\n')).toBe(true);
      expect(css.endsWith('\n}')).toBe(true);
      const nombres = Object.entries(TOKENS_MIEL.variables);
      expect(nombres).toHaveLength(27);
      for (const [nombre, valor] of nombres) {
        expect(css).toContain(`  ${nombre}: ${valor};`);
      }
      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
    });

    it('al reaplicar con otro tema reemplaza el contenido sin duplicar el <style>', () => {
      aplicarTemaNegocio(TOKENS_MIEL);
      aplicarTemaNegocio(TOKENS_MAR);

      const styles = document.head.querySelectorAll('#tema-negocio');
      expect(styles).toHaveLength(1);
      const css = styles[0]?.textContent ?? '';
      expect(css).toContain(`  --fondo-light: ${TOKENS_MAR.variables['--fondo-light']};`);
      expect(css).not.toContain(TOKENS_MIEL.variables['--fondo-light']);
      expect(css).not.toContain(TOKENS_MIEL.variables['--color-primary-500']);
    });
  });

  describe('limpiarTemaNegocio', () => {
    it('quita el atributo de <html> y vacía el <style> sin quitarlo del head', () => {
      aplicarTemaNegocio(TOKENS_MIEL);

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
    it('escribirCacheTemaNegocio guarda { v: 1, css, themeColor }, con el MISMO css que aplicarTemaNegocio inyecta', () => {
      aplicarTemaNegocio(TOKENS_MIEL);
      const cssInyectado = document.getElementById('tema-negocio')?.textContent;

      escribirCacheTemaNegocio(TOKENS_MIEL);

      const crudo = window.localStorage.getItem('temaNegocio');
      expect(crudo).not.toBeNull();
      const parseado = JSON.parse(crudo ?? '') as CacheTemaNegocio;
      expect(parseado.v).toBe(1);
      expect(parseado.css).toBe(cssInyectado);
      expect(parseado.themeColor).toEqual(TOKENS_MIEL.themeColor);
    });

    it('borrarCacheTemaNegocio elimina la clave', () => {
      escribirCacheTemaNegocio(TOKENS_MIEL);
      expect(window.localStorage.getItem('temaNegocio')).not.toBeNull();

      borrarCacheTemaNegocio();

      expect(window.localStorage.getItem('temaNegocio')).toBeNull();
    });

    it('tolera localStorage no disponible sin lanzar', () => {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('localStorage no disponible');
      });

      expect(() => escribirCacheTemaNegocio(TOKENS_MIEL)).not.toThrow();

      setItemSpy.mockRestore();
    });

    describe('leerCacheTemaNegocio', () => {
      it('sin nada guardado: null', () => {
        expect(leerCacheTemaNegocio()).toBeNull();
      });

      it('con un cache válido (el mismo que escribirCacheTemaNegocio produce): lo devuelve tal cual', () => {
        escribirCacheTemaNegocio(TOKENS_MIEL);

        const leido = leerCacheTemaNegocio();

        expect(leido).toEqual({
          v: 1,
          css: expect.stringContaining(TOKENS_MIEL.variables['--fondo-light']) as unknown as string,
          themeColor: TOKENS_MIEL.themeColor,
        });
      });

      it('JSON corrupto (no parsea): null, sin lanzar', () => {
        window.localStorage.setItem('temaNegocio', '{no es json');

        expect(() => leerCacheTemaNegocio()).not.toThrow();
        expect(leerCacheTemaNegocio()).toBeNull();
      });

      it('v de otra versión: null', () => {
        window.localStorage.setItem(
          'temaNegocio',
          JSON.stringify({ v: 2, css: ':root[data-tema-negocio] {\n}', themeColor: { light: '#fff', dark: '#000' } }),
        );

        expect(leerCacheTemaNegocio()).toBeNull();
      });

      it('css que no empieza con el selector esperado: null', () => {
        window.localStorage.setItem(
          'temaNegocio',
          JSON.stringify({ v: 1, css: 'body { color: red }', themeColor: { light: '#fff', dark: '#000' } }),
        );

        expect(leerCacheTemaNegocio()).toBeNull();
      });

      it('css con un intento de cierre de </style> inyectado: null (salvaguarda contra inyección)', () => {
        window.localStorage.setItem(
          'temaNegocio',
          JSON.stringify({
            v: 1,
            css: ':root[data-tema-negocio] {\n}</style><script>alert(1)</script>',
            themeColor: { light: '#fff', dark: '#000' },
          }),
        );

        expect(leerCacheTemaNegocio()).toBeNull();
      });

      it('themeColor con una clave faltante o no-string: null', () => {
        window.localStorage.setItem(
          'temaNegocio',
          JSON.stringify({ v: 1, css: ':root[data-tema-negocio] {\n}', themeColor: { light: '#fff' } }),
        );

        expect(leerCacheTemaNegocio()).toBeNull();
      });

      it('tolera localStorage no disponible (getItem lanza): null, sin propagar', () => {
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('localStorage no disponible');
        });

        expect(() => leerCacheTemaNegocio()).not.toThrow();
        expect(leerCacheTemaNegocio()).toBeNull();

        getItemSpy.mockRestore();
      });
    });
  });
});
