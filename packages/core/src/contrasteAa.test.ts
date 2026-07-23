import { describe, it, expect } from 'vitest';
import { PARES_AA, verificarPares, type NombreVariable } from './contrasteAa.js';
import { generarPaleta } from './paleta.js';

describe('PARES_AA (tabla de datos)', () => {
  it('es la unión Minimalista+Cálido: incluye borde/fondo y excluye WhatsApp', () => {
    const ids = PARES_AA.map((p) => p.id);
    expect(ids).toContain('borde/fondo-light');
    expect(ids).toContain('borde/fondo-dark');
    expect(ids.some((id) => /whatsapp/i.test(id))).toBe(false);
    expect(PARES_AA.some((p) => p.fg.includes('whatsapp') || p.bg.includes('whatsapp'))).toBe(false);
  });

  it('ids únicos, umbrales 4.5|3 y el único literal es #ffffff', () => {
    expect(new Set(PARES_AA.map((p) => p.id)).size).toBe(PARES_AA.length);
    for (const par of PARES_AA) {
      expect(par.umbral === 4.5 || par.umbral === 3).toBe(true);
      for (const ref of [par.fg, par.bg]) {
        expect(ref === '#ffffff' || ref.startsWith('--')).toBe(true);
      }
    }
  });
});

describe('verificarPares', () => {
  const { variables } = generarPaleta({ version: 1, matiz: 78, tinte: 'neutro' });

  it('reporte alineado con PARES_AA (mismo orden e ids) y todos pasan en una paleta válida', () => {
    const reporte = verificarPares(variables);
    expect(reporte.resultados.map((r) => r.id)).toEqual(PARES_AA.map((p) => p.id));
    expect(reporte.todosPasan).toBe(true);
    for (const r of reporte.resultados) expect(r.pasa).toBe(r.ratio >= r.umbral);
  });

  it('detecta un par que no cumple (todosPasan se cae)', () => {
    // Ensuciar el texto light hasta un gris casi ilegible sobre fondo.
    const roto: Record<NombreVariable, string> = { ...variables, '--texto-light': 'oklch(0.9 0.01 75)' };
    const reporte = verificarPares(roto);
    expect(reporte.todosPasan).toBe(false);
    const textoFondo = reporte.resultados.find((r) => r.id === 'texto/fondo-light');
    expect(textoFondo?.pasa).toBe(false);
  });

  it('resuelve el literal #ffffff en los pares de botón', () => {
    const reporte = verificarPares(variables);
    const boton = reporte.resultados.find((r) => r.id === 'boton-primario-light');
    expect(boton?.fgResuelto).toBe('#ffffff');
  });
});
