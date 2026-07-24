import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { generarPaleta } from '@gestion/core';
import { ProveedorTema, ProveedorTemaNegocio, useTema, useTemaNegocio } from '@gestion/ui';
import { MAPA_THEME_COLOR, MetaThemeColor } from './MetaThemeColor';

/**
 * jsdom no implementa `matchMedia` (la propiedad ni siquiera existe en
 * `window`, así que no se puede `vi.spyOn` — hace falta `vi.stubGlobal`): se
 * reemplaza por un doble mínimo que soporta `matches`,
 * `addEventListener('change', ...)` y un helper `simularCambio` para
 * disparar la transición en vivo (mismo mecanismo que usa `MetaThemeColor`
 * en modo "system"). Se limpia con `vi.unstubAllGlobals()` en `afterEach`.
 */
function instalarMatchMediaFalso(matchesInicial: boolean) {
  let matches = matchesInicial;
  let listeners: Array<() => void> = [];

  const mql = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_tipo: string, listener: () => void) => {
      listeners.push(listener);
    },
    removeEventListener: (_tipo: string, listener: () => void) => {
      listeners = listeners.filter((l) => l !== listener);
    },
  } as unknown as MediaQueryList;

  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql));

  return {
    simularCambio: (nuevoValor: boolean) => {
      matches = nuevoValor;
      listeners.forEach((listener) => listener());
    },
  };
}

/** Semilla de "Colores del negocio" usada por los tests que ejercitan la
 * cascada `tokens?.themeColor` — cualquier semilla válida alcanza, no hace
 * falta un preset real. */
const SEMILLA_TEMA_NEGOCIO = { version: 1 as const, matiz: 200, tinte: 'frio' as const };

/** Arnés de prueba: monta `MetaThemeColor` (no renderiza nada propio) junto
 * a botones que ejercitan `useTema()` para cambiar tema/estilo en vivo (como
 * haría la pantalla de Ajustes) y `useTemaNegocio()` para simular el preview
 * en vivo del editor de "Colores del negocio" (SeccionColoresNegocio). */
function Arnes() {
  const { setTema, setEstilo } = useTema();
  const { previsualizar, restaurar } = useTemaNegocio();
  return (
    <>
      <MetaThemeColor />
      <button onClick={() => setTema('light')}>tema light</button>
      <button onClick={() => setTema('dark')}>tema dark</button>
      <button onClick={() => setTema('system')}>tema system</button>
      <button onClick={() => setEstilo('minimalista')}>estilo minimalista</button>
      <button onClick={() => setEstilo('calido')}>estilo calido</button>
      <button onClick={() => previsualizar(generarPaleta(SEMILLA_TEMA_NEGOCIO))}>
        previsualizar tema negocio
      </button>
      <button onClick={() => restaurar()}>restaurar tema negocio</button>
    </>
  );
}

function envolver({ children }: { children: ReactNode }) {
  return (
    <ProveedorTema>
      <ProveedorTemaNegocio tokens={null}>{children}</ProveedorTemaNegocio>
    </ProveedorTema>
  );
}

function leerContentMeta(): string | null {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null;
}

describe('MetaThemeColor', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-estilo');

    // Simula el <meta> real de index.html, ausente en el documento jsdom
    // limpio de cada test.
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute('content', '#000000');
    document.head.appendChild(meta);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-estilo');
    document.querySelectorAll('meta[name="theme-color"]').forEach((nodo) => nodo.remove());
  });

  it('con tema "system" y SO en claro, fija el color minimalista-light', () => {
    instalarMatchMediaFalso(false);

    render(<Arnes />, { wrapper: envolver });

    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.minimalista.light);
  });

  it('con tema "system" y SO en oscuro, fija el color minimalista-dark', () => {
    instalarMatchMediaFalso(true);

    render(<Arnes />, { wrapper: envolver });

    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.minimalista.dark);
  });

  it('tema "dark" explícito ignora la preferencia del SO', () => {
    instalarMatchMediaFalso(false);

    render(<Arnes />, { wrapper: envolver });
    fireEvent.click(screen.getByRole('button', { name: 'tema dark' }));

    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.minimalista.dark);
  });

  it('estilo "calido" + tema "light" fija el color calido-light', () => {
    instalarMatchMediaFalso(false);

    render(<Arnes />, { wrapper: envolver });
    fireEvent.click(screen.getByRole('button', { name: 'estilo calido' }));
    fireEvent.click(screen.getByRole('button', { name: 'tema light' }));

    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.calido.light);
  });

  it('estilo "calido" + tema "dark" fija el color calido-dark', () => {
    instalarMatchMediaFalso(false);

    render(<Arnes />, { wrapper: envolver });
    fireEvent.click(screen.getByRole('button', { name: 'estilo calido' }));
    fireEvent.click(screen.getByRole('button', { name: 'tema dark' }));

    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.calido.dark);
  });

  it('en modo "system", sigue en vivo un cambio de prefers-color-scheme', () => {
    const { simularCambio } = instalarMatchMediaFalso(false);

    render(<Arnes />, { wrapper: envolver });
    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.minimalista.light);

    simularCambio(true);

    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.minimalista.dark);
  });

  it('fuera de modo "system" no escucha cambios de prefers-color-scheme', () => {
    const { simularCambio } = instalarMatchMediaFalso(false);

    render(<Arnes />, { wrapper: envolver });
    fireEvent.click(screen.getByRole('button', { name: 'tema light' }));
    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.minimalista.light);

    simularCambio(true);

    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.minimalista.light);
  });

  it('si no existe el <meta name="theme-color">, no rompe el render', () => {
    document.querySelectorAll('meta[name="theme-color"]').forEach((nodo) => nodo.remove());
    instalarMatchMediaFalso(false);

    expect(() => render(<Arnes />, { wrapper: envolver })).not.toThrow();
  });

  it('con tokens de negocio (preview del editor de Ajustes), usa SU hex en vez del mapa estático', () => {
    instalarMatchMediaFalso(false);
    const esperado = generarPaleta(SEMILLA_TEMA_NEGOCIO);

    render(<Arnes />, { wrapper: envolver });
    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.minimalista.light);

    fireEvent.click(screen.getByRole('button', { name: 'previsualizar tema negocio' }));

    expect(leerContentMeta()).toBe(esperado.themeColor.light);
  });

  it('con tokens de negocio, sigue el modo efectivo (dark) y usa el hex de ESE modo', () => {
    instalarMatchMediaFalso(false);
    const esperado = generarPaleta(SEMILLA_TEMA_NEGOCIO);

    render(<Arnes />, { wrapper: envolver });
    fireEvent.click(screen.getByRole('button', { name: 'previsualizar tema negocio' }));
    fireEvent.click(screen.getByRole('button', { name: 'tema dark' }));

    expect(leerContentMeta()).toBe(esperado.themeColor.dark);
  });

  it('sin tokens de negocio (o tras restaurar), vuelve a caer al mapa estático', () => {
    instalarMatchMediaFalso(false);
    const esperado = generarPaleta(SEMILLA_TEMA_NEGOCIO);

    render(<Arnes />, { wrapper: envolver });
    fireEvent.click(screen.getByRole('button', { name: 'previsualizar tema negocio' }));
    expect(leerContentMeta()).toBe(esperado.themeColor.light);

    fireEvent.click(screen.getByRole('button', { name: 'restaurar tema negocio' }));

    expect(leerContentMeta()).toBe(MAPA_THEME_COLOR.minimalista.light);
  });
});
