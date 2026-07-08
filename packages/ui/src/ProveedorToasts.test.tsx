import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ProveedorToasts, useToasts } from './ProveedorToasts';
import { DURACION_TOAST_MS } from './Toast';

function Consumidor() {
  const { mostrarToast } = useToasts();
  return (
    <div>
      <button type="button" onClick={() => mostrarToast('Guardado con éxito', 'exito')}>
        exito
      </button>
      <button type="button" onClick={() => mostrarToast('Algo salió mal', 'error')}>
        error
      </button>
      <button type="button" onClick={() => mostrarToast('Aviso informativo')}>
        info
      </button>
    </div>
  );
}

function renderizar() {
  return render(
    <ProveedorToasts>
      <Consumidor />
    </ProveedorToasts>,
  );
}

describe('ProveedorToasts / useToasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('mostrarToast tipo "exito" renderiza con role="status"', () => {
    renderizar();

    act(() => {
      fireEvent.click(screen.getByText('exito'));
    });

    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Guardado con éxito');
  });

  it('mostrarToast tipo "error" renderiza con role="alert"', () => {
    renderizar();

    act(() => {
      fireEvent.click(screen.getByText('error'));
    });

    const toast = screen.getByRole('alert');
    expect(toast.textContent).toContain('Algo salió mal');
  });

  it('mostrarToast sin tipo (default "info") usa role="status"', () => {
    renderizar();

    act(() => {
      fireEvent.click(screen.getByText('info'));
    });

    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Aviso informativo');
  });

  it('se auto-descarta a los 5 segundos', () => {
    renderizar();

    act(() => {
      fireEvent.click(screen.getByText('exito'));
    });
    expect(screen.queryByText('Guardado con éxito')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(DURACION_TOAST_MS);
    });

    expect(screen.queryByText('Guardado con éxito')).toBeNull();
  });

  it('no se descarta antes de tiempo', () => {
    renderizar();

    act(() => {
      fireEvent.click(screen.getByText('exito'));
    });

    act(() => {
      vi.advanceTimersByTime(DURACION_TOAST_MS - 100);
    });

    expect(screen.queryByText('Guardado con éxito')).not.toBeNull();
  });

  it('cada toast tiene su propio temporizador: uno nuevo no reinicia el de los anteriores', () => {
    renderizar();

    // Toast A a t=0.
    act(() => {
      fireEvent.click(screen.getByText('exito'));
    });

    // A los 4s (todavía dentro de la ventana de A), se agrega el toast B.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Guardado con éxito')).not.toBeNull();
    act(() => {
      fireEvent.click(screen.getByText('error'));
    });
    expect(screen.queryByText('Algo salió mal')).not.toBeNull();

    // 1s más: A llega a sus 5s exactos desde SU creación y debe descartarse;
    // B lleva solo 1s y debe seguir. Si el timer de A se hubiera reiniciado
    // al montar B (bug del Bloqueante 2), A seguiría visible acá.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Guardado con éxito')).toBeNull();
    expect(screen.queryByText('Algo salió mal')).not.toBeNull();

    // 4s más (5s desde la creación de B): B también se descarta.
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText('Algo salió mal')).toBeNull();
  });

  it('el botón cerrar descarta el toast inmediatamente', () => {
    renderizar();

    act(() => {
      fireEvent.click(screen.getByText('exito'));
    });
    expect(screen.queryByText('Guardado con éxito')).not.toBeNull();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
    });

    expect(screen.queryByText('Guardado con éxito')).toBeNull();
  });

  it('useToasts fuera de un ProveedorToasts lanza un error claro', () => {
    function ConsumidorSuelto() {
      useToasts();
      return null;
    }
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<ConsumidorSuelto />)).toThrow(
      'useToasts debe usarse dentro de un <ProveedorToasts>.',
    );

    errorSpy.mockRestore();
  });
});
