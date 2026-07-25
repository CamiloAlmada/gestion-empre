import { describe, expect, it } from 'vitest';
import {
  LARGO_MAX_CLAVE_CATEGORIA,
  claveCategoria,
  claveCategoriaValida,
} from './categoria.js';

describe('claveCategoria', () => {
  it('baja a minúsculas', () => {
    expect(claveCategoria('Quesos')).toBe('quesos');
    expect(claveCategoria('QUESOS')).toBe('quesos');
    expect(claveCategoria('QuEsOs')).toBe('quesos');
  });

  it('recorta espacios de borde', () => {
    expect(claveCategoria('  Frutos secos  ')).toBe('frutos secos');
    expect(claveCategoria('\tMiel\n')).toBe('miel');
  });

  it('conserva los espacios internos (Firestore los acepta en el id)', () => {
    expect(claveCategoria('Frutos Secos')).toBe('frutos secos');
  });

  it('es idempotente: la clave de una clave es la misma clave', () => {
    for (const nombre of ['Quesos', '  Frutos Secos ', 'ÑOQUIS', 'Café']) {
      const clave = claveCategoria(nombre);
      expect(claveCategoria(clave)).toBe(clave);
    }
  });

  describe('Unicode: no pliega acentos ni eñe', () => {
    it('baja la eñe a minúscula pero la conserva', () => {
      expect(claveCategoria('Ñoquis')).toBe('ñoquis');
      expect(claveCategoria('ÑOQUIS')).toBe('ñoquis');
    });

    it('baja las vocales acentuadas pero conserva el acento', () => {
      expect(claveCategoria('CAFÉ')).toBe('café');
      expect(claveCategoria('Café')).toBe('café');
    });

    it('"Café" y "Cafe" son categorías DISTINTAS (no se pliega el acento)', () => {
      expect(claveCategoria('Café')).not.toBe(claveCategoria('Cafe'));
    });
  });

  it('nombres que solo difieren en mayúsculas o espacios comparten clave', () => {
    expect(claveCategoria('  quESOS ')).toBe(claveCategoria('Quesos'));
  });
});

describe('claveCategoriaValida', () => {
  it('acepta claves normales, incluidas las que tienen acento o eñe', () => {
    for (const clave of ['quesos', 'frutos secos', 'ñoquis', 'café', 'miel-2', 'a']) {
      expect(claveCategoriaValida(clave)).toBe(true);
    }
  });

  it('rechaza la clave vacía', () => {
    expect(claveCategoriaValida('')).toBe(false);
  });

  it('rechaza claves con "/" (romperían la ruta del documento)', () => {
    expect(claveCategoriaValida('a/b')).toBe(false);
    expect(claveCategoriaValida('/')).toBe(false);
    expect(claveCategoriaValida('quesos/frescos')).toBe(false);
  });

  it('rechaza "." y ".." (ids reservados de Firestore)', () => {
    expect(claveCategoriaValida('.')).toBe(false);
    expect(claveCategoriaValida('..')).toBe(false);
  });

  it('rechaza la forma reservada __algo__', () => {
    expect(claveCategoriaValida('__x__')).toBe(false);
    expect(claveCategoriaValida('__proto__')).toBe(false);
    expect(claveCategoriaValida('____')).toBe(false);
  });

  it('acepta guiones bajos que NO forman la envoltura reservada', () => {
    expect(claveCategoriaValida('__x')).toBe(true);
    expect(claveCategoriaValida('x__')).toBe(true);
    expect(claveCategoriaValida('fru_tos')).toBe(true);
  });

  it('acepta "..." y otros puntos que no son "." ni ".."', () => {
    expect(claveCategoriaValida('...')).toBe(true);
    expect(claveCategoriaValida('a.b')).toBe(true);
  });

  it('acepta el largo máximo y rechaza uno más', () => {
    expect(claveCategoriaValida('q'.repeat(LARGO_MAX_CLAVE_CATEGORIA))).toBe(true);
    expect(claveCategoriaValida('q'.repeat(LARGO_MAX_CLAVE_CATEGORIA + 1))).toBe(false);
  });
});
