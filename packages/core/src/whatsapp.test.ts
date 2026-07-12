import { describe, it, expect } from 'vitest';
import {
  resolverPlantilla,
  construirLinkWhatsApp,
  PLANTILLAS_SEED,
  type PlantillaWhatsApp,
} from './whatsapp.js';

describe('resolverPlantilla', () => {
  it('reemplaza los placeholders del doc 08', () => {
    const texto =
      'Hola {cliente}! Tu pedido está listo: {items}. Total: {total}. ¿A qué hora te queda bien pasar a buscarlo?';
    const out = resolverPlantilla(texto, {
      cliente: 'Marta',
      items: 'Queso Colonia 0,5 kg, Salame entero',
      total: '$ 1.234,00',
    });
    expect(out).toBe(
      'Hola Marta! Tu pedido está listo: Queso Colonia 0,5 kg, Salame entero. Total: $ 1.234,00. ¿A qué hora te queda bien pasar a buscarlo?',
    );
  });

  it('es genérico: resuelve cualquier clave presente en valores', () => {
    expect(resolverPlantilla('{a}-{b}-{a}', { a: 'X', b: 'Y' })).toBe('X-Y-X');
  });

  it('deja literal el placeholder sin valor (plantilla mal escrita visible)', () => {
    expect(resolverPlantilla('Hola {cliente}, faltan {desconocido}', { cliente: 'Ana' })).toBe(
      'Hola Ana, faltan {desconocido}',
    );
  });

  it('un valor vacío resuelve a cadena vacía (valor presente, no faltante)', () => {
    expect(resolverPlantilla('a{x}b', { x: '' })).toBe('ab');
  });

  it('no re-resuelve placeholders inyectados por un valor (un solo pase)', () => {
    expect(resolverPlantilla('{a}', { a: '{b}', b: 'NO' })).toBe('{b}');
  });

  it('deja literales las llaves malformadas o anidadas', () => {
    expect(resolverPlantilla('{a{b}}', { b: 'X' })).toBe('{aX}');
    expect(resolverPlantilla('sin cierre {x', { x: 'V' })).toBe('sin cierre {x');
    expect(resolverPlantilla('} suelta {', { x: 'V' })).toBe('} suelta {');
    expect(resolverPlantilla('{}', { '': 'vacia' })).toBe('{}'); // {} no es placeholder válido
  });

  it('no toca claves heredadas del prototipo', () => {
    expect(resolverPlantilla('{toString}', {})).toBe('{toString}');
  });
});

describe('construirLinkWhatsApp — encoding', () => {
  it('arma la URL wa.me con el texto url-encoded', () => {
    expect(construirLinkWhatsApp('59899123456', 'Hola')).toBe(
      'https://wa.me/59899123456?text=Hola',
    );
  });

  it('codifica caracteres especiales, salto de línea, espacio, emoji y acento', () => {
    // & ? = # → %26 %3F %3D %23 ; '\n' → %0A ; ' ' → %20 ; 😊 → %F0%9F%98%8A ; á → %C3%A1
    expect(construirLinkWhatsApp('123456789', 'a&b?c=d#e\nf 😊 á')).toBe(
      'https://wa.me/123456789?text=a%26b%3Fc%3Dd%23e%0Af%20%F0%9F%98%8A%20%C3%A1',
    );
  });

  it('deja literal lo que encodeURIComponent no codifica (! ( ) . - _ ~ *)', () => {
    expect(construirLinkWhatsApp('123456789', "!()-._~*'")).toBe(
      "https://wa.me/123456789?text=!()-._~*'",
    );
  });

  it('lanza RangeError si el teléfono no es solo dígitos', () => {
    expect(() => construirLinkWhatsApp('+59899123456', 'x')).toThrow(RangeError);
    expect(() => construirLinkWhatsApp('', 'x')).toThrow(RangeError);
    expect(() => construirLinkWhatsApp('599 123', 'x')).toThrow(RangeError);
  });
});

describe('seed "Te extrañamos" resuelto de punta a punta', () => {
  it('resuelve y codifica el mensaje seed completo (emoji, acento, saltos)', () => {
    const plantilla = PLANTILLAS_SEED.find((p) => p.id === 'te-extranamos')!;
    const mensaje = resolverPlantilla(plantilla.texto, {
      cliente: 'Ana',
      diasSinVenir: '45',
      negocio: 'Quesarte',
    });
    expect(mensaje).toBe(
      'Hola Ana! Hace 45 días que no te vemos por Quesarte. Esta semana tenemos novedades que te pueden gustar 😊',
    );

    const url = construirLinkWhatsApp('59899123456', mensaje);
    expect(url.startsWith('https://wa.me/59899123456?text=')).toBe(true);
    expect(url).toContain('Hola%20Ana!'); // espacio codificado, '!' literal
    expect(url).toContain('d%C3%ADas'); // "días" con acento
    expect(url).toContain('%F0%9F%98%8A'); // 😊
    // El texto codificado round-trippea exactamente al mensaje resuelto.
    const textoCodificado = url.slice('https://wa.me/59899123456?text='.length);
    expect(decodeURIComponent(textoCodificado)).toBe(mensaje);
  });
});

describe('PLANTILLAS_SEED', () => {
  it('trae las 3 plantillas del doc 08 con sus contextos', () => {
    expect(PLANTILLAS_SEED).toHaveLength(3);
    const porId = new Map(PLANTILLAS_SEED.map((p) => [p.id, p]));
    expect(porId.get('pedido-listo')?.contexto).toBe('venta');
    expect(porId.get('te-extranamos')?.contexto).toBe('inactivo');
    expect(porId.get('aviso-llegada')?.contexto).toBe('cliente');
  });

  it('los textos seed son los exactos del doc 08', () => {
    const porId = new Map(PLANTILLAS_SEED.map((p) => [p.id, p]));
    expect(porId.get('pedido-listo')?.texto).toBe(
      'Hola {cliente}! Tu pedido está listo: {items}. Total: {total}. ¿A qué hora te queda bien pasar a buscarlo?',
    );
    expect(porId.get('aviso-llegada')?.texto).toBe(
      'Hola {cliente}! Llegó mercadería nueva que suele gustarte. ¡Te esperamos!',
    );
  });

  it('los ids son únicos', () => {
    const ids = PLANTILLAS_SEED.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('el tipo exportado describe las plantillas', () => {
    const p: PlantillaWhatsApp = PLANTILLAS_SEED[0]!;
    expect(typeof p.nombre).toBe('string');
  });
});
