import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { generarPaleta, type TokensGenerados } from '@gestion/core';
import { ProveedorTemaNegocio, useTemaNegocio, type EstadoTemaNegocio } from './ProveedorTemaNegocio';
import { aplicarTemaNegocio, escribirCacheTemaNegocio } from './temaNegocio';

// Tokens REALES del motor (no maquetas a mano) — dos matices distintos para
// los tests que necesitan diferenciar "el tema anterior" de "el nuevo".
const TOKENS_MIEL: TokensGenerados = generarPaleta({ version: 1, matiz: 78, tinte: 'neutro' });
const TOKENS_LAVANDA: TokensGenerados = generarPaleta({ version: 1, matiz: 300, tinte: 'frio' });
const TOKENS_MAR: TokensGenerados = generarPaleta({ version: 1, matiz: 245, tinte: 'frio' });

function envolver(tokens: TokensGenerados | null | undefined) {
  return function Envoltorio({ children }: { children: ReactNode }) {
    return <ProveedorTemaNegocio tokens={tokens}>{children}</ProveedorTemaNegocio>;
  };
}

/** Simula lo que el script anti-FOUC de `index.html` ya dejó en el DOM y en
 * `localStorage` ANTES de que React monte (ver
 * `packages/config/anti-fouc-tema-negocio.md`): un `<style id="tema-negocio">`
 * con contenido real, el atributo en `<html>`, y el mismo cache que
 * `escribirCacheTemaNegocio` produce. Los tests de "arranque con `tokens:
 * undefined`" (BLOQ-1, tanda TM7) parten de este estado para comprobar que
 * el proveedor NO lo toca mientras no hay una respuesta confirmada. */
function simularAntiFouc(tokens: TokensGenerados): void {
  aplicarTemaNegocio(tokens);
  escribirCacheTemaNegocio(tokens);
}

/** Sonda que expone el estado del contexto a la variable que le pasan, para
 * poder inspeccionarlo entre `rerender`s de `render` (no de `renderHook`,
 * que no permite cambiar las props del wrapper después del montaje). */
function Sonda({ onEstado }: { onEstado: (estado: EstadoTemaNegocio) => void }) {
  const estado = useTemaNegocio();
  onEstado(estado);
  return null;
}

function limpiarDom(): void {
  document.getElementById('tema-negocio')?.remove();
  document.documentElement.removeAttribute('data-tema-negocio');
}

describe('ProveedorTemaNegocio / useTemaNegocio', () => {
  beforeEach(() => {
    limpiarDom();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    limpiarDom();
    window.localStorage.clear();
  });

  it('con tokens !== null, aplica el CSS/atributo y escribe el cache', () => {
    renderHook(() => useTemaNegocio(), { wrapper: envolver(TOKENS_MIEL) });

    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
    expect(document.getElementById('tema-negocio')?.textContent).toContain(
      TOKENS_MIEL.variables['--fondo-light'],
    );
    const cache = JSON.parse(window.localStorage.getItem('temaNegocio') ?? '{}') as {
      v: number;
      css: string;
    };
    expect(cache.v).toBe(1);
    expect(cache.css).toContain(TOKENS_MIEL.variables['--fondo-light']);
  });

  it('con tokens null, limpia el documento y no deja cache', () => {
    renderHook(() => useTemaNegocio(), { wrapper: envolver(null) });

    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
    expect(window.localStorage.getItem('temaNegocio')).toBeNull();
  });

  // BLOQ-1 (review senior de la tanda TM, TM7): `tokens: undefined` es
  // "todavía no sé" (Firestore cargando, o permission-denied en /login) — a
  // diferencia de `null` ("confirmado: sin tema"), NO debe tocar ni el DOM
  // ni el cache. Antes de este fix, el proveedor solo conocía `null`, así
  // que el primer render con la respuesta de Firestore todavía sin resolver
  // (el estado inicial real de cualquier `SincronizadorTemaNegocio`) pisaba
  // con `limpiarTemaNegocio()`/`borrarCacheTemaNegocio()` lo que el script
  // anti-FOUC de `index.html` ya había pintado — flash tema→base→tema en
  // CADA arranque con tema guardado, y en /login (permission-denied
  // permanente durante toda la sesión) el tema quedaba borrado y el cache
  // eliminado, dejando al PRÓXIMO arranque sin anti-FOUC siquiera.
  describe('tokens: undefined ("todavía no sé", BLOQ-1)', () => {
    it('arranque con el DOM y el cache que dejó el anti-FOUC: quedan INTACTOS', () => {
      simularAntiFouc(TOKENS_MIEL);

      renderHook(() => useTemaNegocio(), { wrapper: envolver(undefined) });

      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
      expect(document.getElementById('tema-negocio')?.textContent).toContain(
        TOKENS_MIEL.variables['--fondo-light'],
      );
      const cache = JSON.parse(window.localStorage.getItem('temaNegocio') ?? '{}') as { css: string };
      expect(cache.css).toContain(TOKENS_MIEL.variables['--fondo-light']);
    });

    it('permission-denied desde el arranque (mismo caso que /login sin sesión): ídem intactos', () => {
      // Mismo escenario que arriba, pero nombrado por el caso de negocio
      // real que lo dispara: sin sesión, `useDoc` recibe un error de
      // permisos, nunca una respuesta confirmada — el estado se queda en
      // `undefined` toda la sesión (ver SincronizadorTemaNegocio.tsx).
      simularAntiFouc(TOKENS_MIEL);

      renderHook(() => useTemaNegocio(), { wrapper: envolver(undefined) });

      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
      expect(window.localStorage.getItem('temaNegocio')).not.toBeNull();
    });

    it('sin nada pintado todavía (primer arranque sin cache): tampoco escribe nada', () => {
      renderHook(() => useTemaNegocio(), { wrapper: envolver(undefined) });

      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
      expect(window.localStorage.getItem('temaNegocio')).toBeNull();
    });

    it('el contexto expone tokens: undefined (no lo colapsa a null)', () => {
      const { result } = renderHook(() => useTemaNegocio(), { wrapper: envolver(undefined) });

      expect(result.current.tokens).toBeUndefined();
    });

    it('al desmontar sin haber tocado nada, no limpia lo que dejó el anti-FOUC', () => {
      simularAntiFouc(TOKENS_MIEL);

      const { unmount } = renderHook(() => useTemaNegocio(), { wrapper: envolver(undefined) });
      unmount();

      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
    });

    it('transición undefined → null (doc confirmado inexistente): recién ahí limpia DOM y cache', () => {
      simularAntiFouc(TOKENS_MIEL);
      let estado: EstadoTemaNegocio | null = null;
      const onEstado = (e: EstadoTemaNegocio) => {
        estado = e;
      };

      const { rerender } = render(
        <ProveedorTemaNegocio tokens={undefined}>
          <Sonda onEstado={onEstado} />
        </ProveedorTemaNegocio>,
      );
      // Todavía intacto: la carga inicial no resolvió.
      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);

      rerender(
        <ProveedorTemaNegocio tokens={null}>
          <Sonda onEstado={onEstado} />
        </ProveedorTemaNegocio>,
      );

      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
      expect(window.localStorage.getItem('temaNegocio')).toBeNull();
      expect((estado as EstadoTemaNegocio | null)?.tokens).toBeNull();
    });

    it('transición undefined → tokens (doc válido): aplica y cachea recién ahí', () => {
      let estado: EstadoTemaNegocio | null = null;
      const onEstado = (e: EstadoTemaNegocio) => {
        estado = e;
      };

      const { rerender } = render(
        <ProveedorTemaNegocio tokens={undefined}>
          <Sonda onEstado={onEstado} />
        </ProveedorTemaNegocio>,
      );
      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);

      rerender(
        <ProveedorTemaNegocio tokens={TOKENS_MIEL}>
          <Sonda onEstado={onEstado} />
        </ProveedorTemaNegocio>,
      );

      expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
      expect((estado as EstadoTemaNegocio | null)?.tokens?.tema.matiz).toBe(78);
      expect(window.localStorage.getItem('temaNegocio')).not.toBeNull();
    });

    it('previsualizar funciona igual mientras tokens todavía es undefined (el editor solo abre logueado, pero el tipo no lo exige)', () => {
      const { result } = renderHook(() => useTemaNegocio(), { wrapper: envolver(undefined) });

      act(() => {
        result.current.previsualizar(TOKENS_MAR);
      });

      expect(result.current.tokens?.tema.matiz).toBe(245);
      expect(document.getElementById('tema-negocio')?.textContent).toContain(
        TOKENS_MAR.variables['--fondo-light'],
      );
      // El preview nunca toca el cache — mismo criterio que con tokens null.
      expect(window.localStorage.getItem('temaNegocio')).toBeNull();
    });
  });

  it('al desmontar, limpia el documento (no deja el atributo pisado)', () => {
    const { unmount } = renderHook(() => useTemaNegocio(), {
      wrapper: envolver(TOKENS_MIEL),
    });
    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);

    unmount();

    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
  });

  it('cambiar la prop tokens reaplica y reescribe el cache con el nuevo valor', () => {
    let estado: EstadoTemaNegocio | null = null;
    const onEstado = (e: EstadoTemaNegocio) => {
      estado = e;
    };

    const { rerender } = render(
      <ProveedorTemaNegocio tokens={TOKENS_MIEL}>
        <Sonda onEstado={onEstado} />
      </ProveedorTemaNegocio>,
    );
    expect(document.getElementById('tema-negocio')?.textContent).toContain(
      TOKENS_MIEL.variables['--fondo-light'],
    );

    rerender(
      <ProveedorTemaNegocio tokens={TOKENS_LAVANDA}>
        <Sonda onEstado={onEstado} />
      </ProveedorTemaNegocio>,
    );

    expect(document.getElementById('tema-negocio')?.textContent).toContain(
      TOKENS_LAVANDA.variables['--fondo-light'],
    );
    expect((estado as EstadoTemaNegocio | null)?.tokens?.tema.matiz).toBe(300);
    const cache = JSON.parse(window.localStorage.getItem('temaNegocio') ?? '{}') as {
      css: string;
    };
    expect(cache.css).toContain(TOKENS_LAVANDA.variables['--fondo-light']);
    expect(cache.css).not.toContain(TOKENS_MIEL.variables['--fondo-light']);
  });

  it('previsualizar aplica el draft al documento sin tocar el cache persistido', () => {
    const { result } = renderHook(() => useTemaNegocio(), { wrapper: envolver(TOKENS_MIEL) });

    act(() => {
      result.current.previsualizar(TOKENS_MAR);
    });

    expect(document.getElementById('tema-negocio')?.textContent).toContain(
      TOKENS_MAR.variables['--fondo-light'],
    );
    expect(result.current.tokens?.tema.matiz).toBe(245);
    const cache = JSON.parse(window.localStorage.getItem('temaNegocio') ?? '{}') as {
      css: string;
    };
    expect(cache.css).toContain(TOKENS_MIEL.variables['--fondo-light']);
    expect(cache.css).not.toContain(TOKENS_MAR.variables['--fondo-light']);
  });

  it('restaurar descarta el preview y vuelve a reflejar la prop vigente', () => {
    const { result } = renderHook(() => useTemaNegocio(), { wrapper: envolver(TOKENS_MIEL) });

    act(() => {
      result.current.previsualizar(TOKENS_MAR);
    });
    expect(result.current.tokens?.tema.matiz).toBe(245);

    act(() => {
      result.current.restaurar();
    });

    expect(result.current.tokens?.tema.matiz).toBe(78);
    expect(document.getElementById('tema-negocio')?.textContent).toContain(
      TOKENS_MIEL.variables['--fondo-light'],
    );
  });

  it('restaurar sin tokens persistidos (null) limpia el documento', () => {
    const { result } = renderHook(() => useTemaNegocio(), { wrapper: envolver(null) });

    act(() => {
      result.current.previsualizar(TOKENS_MAR);
    });
    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);

    act(() => {
      result.current.restaurar();
    });

    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
    expect(result.current.tokens).toBeNull();
  });

  it('sobrevive al montaje doble de StrictMode sin duplicar el <style> ni romper', () => {
    render(
      <StrictMode>
        <ProveedorTemaNegocio tokens={TOKENS_MIEL}>
          <div>hijo</div>
        </ProveedorTemaNegocio>
      </StrictMode>,
    );

    const estilos = document.head.querySelectorAll('#tema-negocio');
    expect(estilos).toHaveLength(1);
    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
    expect(screen.getByText('hijo')).toBeInTheDocument();
  });

  it('useTemaNegocio fuera de un ProveedorTemaNegocio lanza un error claro', () => {
    function Consumidor() {
      useTemaNegocio();
      return null;
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Consumidor />)).toThrow(
      'useTemaNegocio debe usarse dentro de un <ProveedorTemaNegocio>.',
    );

    errorSpy.mockRestore();
  });
});
