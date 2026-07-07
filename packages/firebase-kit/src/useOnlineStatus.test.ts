import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

function setNavigatorOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOnlineStatus', () => {
  const onLineOriginal = window.navigator.onLine;

  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    cleanup();
    setNavigatorOnLine(onLineOriginal);
    vi.restoreAllMocks();
  });

  it('arranca reflejando navigator.onLine', () => {
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(true);
  });

  it('pasa a false cuando el navegador dispara "offline"', () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current).toBe(false);
  });

  it('vuelve a true cuando el navegador dispara "online"', () => {
    setNavigatorOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current).toBe(true);
  });

  it('limpia los listeners de online/offline al desmontar', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();

    const eventosAgregados = addSpy.mock.calls.map(([evento]) => evento);
    const eventosRemovidos = removeSpy.mock.calls.map(([evento]) => evento);

    expect(eventosAgregados).toEqual(expect.arrayContaining(['online', 'offline']));
    expect(eventosRemovidos).toEqual(expect.arrayContaining(['online', 'offline']));
  });
});
