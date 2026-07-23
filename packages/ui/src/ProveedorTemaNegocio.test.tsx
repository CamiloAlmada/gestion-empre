import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { ProveedorTemaNegocio, useTemaNegocio, type EstadoTemaNegocio } from './ProveedorTemaNegocio';
import type { TokensGenerados } from './temaNegocio';

function crearTokens(matiz: number): TokensGenerados {
  return {
    version: 1,
    tema: { version: 1, matiz, tinte: 'neutro' },
    variables: { '--fondo-light': `oklch(0.9 0.05 ${matiz})` },
    themeColor: { light: '#eeeeee', dark: '#111111' },
    reporte: {},
  };
}

function envolver(tokens: TokensGenerados | null) {
  return function Envoltorio({ children }: { children: ReactNode }) {
    return <ProveedorTemaNegocio tokens={tokens}>{children}</ProveedorTemaNegocio>;
  };
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
    const tokens = crearTokens(200);

    renderHook(() => useTemaNegocio(), { wrapper: envolver(tokens) });

    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
    expect(document.getElementById('tema-negocio')?.textContent).toContain(
      'oklch(0.9 0.05 200)',
    );
    const cache = JSON.parse(window.localStorage.getItem('temaNegocio') ?? '{}') as {
      v: number;
      css: string;
    };
    expect(cache.v).toBe(1);
    expect(cache.css).toContain('oklch(0.9 0.05 200)');
  });

  it('con tokens null, limpia el documento y no deja cache', () => {
    renderHook(() => useTemaNegocio(), { wrapper: envolver(null) });

    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
    expect(window.localStorage.getItem('temaNegocio')).toBeNull();
  });

  it('al desmontar, limpia el documento (no deja el atributo pisado)', () => {
    const { unmount } = renderHook(() => useTemaNegocio(), {
      wrapper: envolver(crearTokens(200)),
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
      <ProveedorTemaNegocio tokens={crearTokens(200)}>
        <Sonda onEstado={onEstado} />
      </ProveedorTemaNegocio>,
    );
    expect(document.getElementById('tema-negocio')?.textContent).toContain(
      'oklch(0.9 0.05 200)',
    );

    rerender(
      <ProveedorTemaNegocio tokens={crearTokens(50)}>
        <Sonda onEstado={onEstado} />
      </ProveedorTemaNegocio>,
    );

    expect(document.getElementById('tema-negocio')?.textContent).toContain('oklch(0.9 0.05 50)');
    expect((estado as EstadoTemaNegocio | null)?.tokens?.tema.matiz).toBe(50);
    const cache = JSON.parse(window.localStorage.getItem('temaNegocio') ?? '{}') as {
      css: string;
    };
    expect(cache.css).toContain('oklch(0.9 0.05 50)');
    expect(cache.css).not.toContain('oklch(0.9 0.05 200)');
  });

  it('previsualizar aplica el draft al documento sin tocar el cache persistido', () => {
    const persistidos = crearTokens(200);
    const { result } = renderHook(() => useTemaNegocio(), { wrapper: envolver(persistidos) });

    act(() => {
      result.current.previsualizar(crearTokens(300));
    });

    expect(document.getElementById('tema-negocio')?.textContent).toContain(
      'oklch(0.9 0.05 300)',
    );
    expect(result.current.tokens?.tema.matiz).toBe(300);
    const cache = JSON.parse(window.localStorage.getItem('temaNegocio') ?? '{}') as {
      css: string;
    };
    expect(cache.css).toContain('oklch(0.9 0.05 200)');
    expect(cache.css).not.toContain('oklch(0.9 0.05 300)');
  });

  it('restaurar descarta el preview y vuelve a reflejar la prop vigente', () => {
    const persistidos = crearTokens(200);
    const { result } = renderHook(() => useTemaNegocio(), { wrapper: envolver(persistidos) });

    act(() => {
      result.current.previsualizar(crearTokens(300));
    });
    expect(result.current.tokens?.tema.matiz).toBe(300);

    act(() => {
      result.current.restaurar();
    });

    expect(result.current.tokens?.tema.matiz).toBe(200);
    expect(document.getElementById('tema-negocio')?.textContent).toContain(
      'oklch(0.9 0.05 200)',
    );
  });

  it('restaurar sin tokens persistidos (null) limpia el documento', () => {
    const { result } = renderHook(() => useTemaNegocio(), { wrapper: envolver(null) });

    act(() => {
      result.current.previsualizar(crearTokens(300));
    });
    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);

    act(() => {
      result.current.restaurar();
    });

    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
    expect(result.current.tokens).toBeNull();
  });

  it('sobrevive al montaje doble de StrictMode sin duplicar el <style> ni romper', () => {
    const tokens = crearTokens(200);

    render(
      <StrictMode>
        <ProveedorTemaNegocio tokens={tokens}>
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
