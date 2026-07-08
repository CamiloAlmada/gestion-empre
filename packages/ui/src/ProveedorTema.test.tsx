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
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
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
});
