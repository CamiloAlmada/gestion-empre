import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ProveedorTema, useTema } from './ProveedorTema';

function envolver({ children }: { children: ReactNode }) {
  return <ProveedorTema>{children}</ProveedorTema>;
}

describe('ProveedorTema / useTema', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-estilo');
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-estilo');
  });

  it('sin nada guardado, arranca en "system" y no fija data-theme', () => {
    const { result } = renderHook(() => useTema(), { wrapper: envolver });

    expect(result.current.tema).toBe('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('lee el tema guardado en localStorage al montar', () => {
    window.localStorage.setItem('tema', 'dark');

    const { result } = renderHook(() => useTema(), { wrapper: envolver });

    expect(result.current.tema).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ignora un valor inválido guardado y cae a "system"', () => {
    window.localStorage.setItem('tema', 'azul');

    const { result } = renderHook(() => useTema(), { wrapper: envolver });

    expect(result.current.tema).toBe('system');
  });

  it('setTema("light") persiste y fija data-theme="light"', () => {
    const { result } = renderHook(() => useTema(), { wrapper: envolver });

    act(() => {
      result.current.setTema('light');
    });

    expect(result.current.tema).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('tema')).toBe('light');
  });

  it('setTema("dark") persiste y fija data-theme="dark"', () => {
    const { result } = renderHook(() => useTema(), { wrapper: envolver });

    act(() => {
      result.current.setTema('dark');
    });

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(window.localStorage.getItem('tema')).toBe('dark');
  });

  it('volver a setTema("system") remueve el atributo data-theme', () => {
    const { result } = renderHook(() => useTema(), { wrapper: envolver });

    act(() => {
      result.current.setTema('dark');
    });
    expect(document.documentElement.hasAttribute('data-theme')).toBe(true);

    act(() => {
      result.current.setTema('system');
    });

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(window.localStorage.getItem('tema')).toBe('system');
  });

  it('useTema fuera de un ProveedorTema lanza un error claro', () => {
    function Consumidor() {
      useTema();
      return null;
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Consumidor />)).toThrow(
      'useTema debe usarse dentro de un <ProveedorTema>.',
    );

    errorSpy.mockRestore();
    expect(screen.queryByText('nunca')).toBeNull();
  });

  it('expone la API completa: tema, setTema, estilo y setEstilo', () => {
    const { result } = renderHook(() => useTema(), { wrapper: envolver });

    expect(typeof result.current.tema).toBe('string');
    expect(typeof result.current.setTema).toBe('function');
    expect(typeof result.current.estilo).toBe('string');
    expect(typeof result.current.setEstilo).toBe('function');
  });

  describe('eje estilo', () => {
    it('sin nada guardado, arranca en "minimalista" y no fija data-estilo', () => {
      const { result } = renderHook(() => useTema(), { wrapper: envolver });

      expect(result.current.estilo).toBe('minimalista');
      expect(document.documentElement.hasAttribute('data-estilo')).toBe(false);
    });

    it('lee el estilo guardado en localStorage al montar', () => {
      window.localStorage.setItem('estilo', 'calido');

      const { result } = renderHook(() => useTema(), { wrapper: envolver });

      expect(result.current.estilo).toBe('calido');
      expect(document.documentElement.getAttribute('data-estilo')).toBe('calido');
    });

    it('ignora un valor inválido guardado y cae a "minimalista"', () => {
      window.localStorage.setItem('estilo', 'oscuro-total');

      const { result } = renderHook(() => useTema(), { wrapper: envolver });

      expect(result.current.estilo).toBe('minimalista');
      expect(document.documentElement.hasAttribute('data-estilo')).toBe(false);
    });

    it('si localStorage.getItem lanza, cae a "minimalista" sin romper', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('localStorage no disponible');
      });

      const { result } = renderHook(() => useTema(), { wrapper: envolver });

      expect(result.current.estilo).toBe('minimalista');

      getItemSpy.mockRestore();
    });

    it('setEstilo("calido") persiste y fija data-estilo="calido"', () => {
      const { result } = renderHook(() => useTema(), { wrapper: envolver });

      act(() => {
        result.current.setEstilo('calido');
      });

      expect(result.current.estilo).toBe('calido');
      expect(document.documentElement.getAttribute('data-estilo')).toBe('calido');
      expect(window.localStorage.getItem('estilo')).toBe('calido');
    });

    it('volver a setEstilo("minimalista") remueve el atributo data-estilo', () => {
      const { result } = renderHook(() => useTema(), { wrapper: envolver });

      act(() => {
        result.current.setEstilo('calido');
      });
      expect(document.documentElement.hasAttribute('data-estilo')).toBe(true);

      act(() => {
        result.current.setEstilo('minimalista');
      });

      expect(document.documentElement.hasAttribute('data-estilo')).toBe(false);
      expect(window.localStorage.getItem('estilo')).toBe('minimalista');
    });

    it('setEstilo funciona sin afectar el eje tema y viceversa', () => {
      const { result } = renderHook(() => useTema(), { wrapper: envolver });

      act(() => {
        result.current.setTema('dark');
        result.current.setEstilo('calido');
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(document.documentElement.getAttribute('data-estilo')).toBe('calido');

      act(() => {
        result.current.setTema('light');
      });

      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(document.documentElement.getAttribute('data-estilo')).toBe('calido');
    });
  });
});
