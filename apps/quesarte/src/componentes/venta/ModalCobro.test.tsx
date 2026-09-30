import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money } from '@gestion/core';
import { ModalCobro } from './ModalCobro';

afterEach(cleanup);

describe('ModalCobro', () => {
  it('"Confirmar" arranca deshabilitado hasta elegir un medio de pago', () => {
    render(<ModalCobro abierto onCerrar={vi.fn()} total={money(123450)} procesando={false} hayCliente={false} onConfirmar={vi.fn()} />);

    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));

    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('muestra el total formateado', () => {
    render(<ModalCobro abierto onCerrar={vi.fn()} total={money(123450)} procesando={false} hayCliente={false} onConfirmar={vi.fn()} />);
    expect(screen.getByText('$ 1.234,50')).toBeTruthy();
  });

  it('confirmar llama a onConfirmar con el medio de pago elegido', () => {
    const onConfirmar = vi.fn();
    render(<ModalCobro abierto onCerrar={vi.fn()} total={money(1000)} procesando={false} hayCliente={false} onConfirmar={onConfirmar} />);

    fireEvent.click(screen.getByRole('button', { name: 'Transferencia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onConfirmar).toHaveBeenCalledWith('transferencia');
  });

  it('procesando deshabilita las opciones y muestra "Procesando…"', () => {
    render(<ModalCobro abierto onCerrar={vi.fn()} total={money(1000)} procesando hayCliente={false} onConfirmar={vi.fn()} />);

    expect(screen.getByText('Procesando…')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Efectivo' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('al reabrirse limpia el medio de pago elegido', () => {
    const { rerender } = render(
      <ModalCobro abierto onCerrar={vi.fn()} total={money(1000)} procesando={false} hayCliente={false} onConfirmar={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Efectivo' }));
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(false);

    rerender(<ModalCobro abierto={false} onCerrar={vi.fn()} total={money(1000)} procesando={false} hayCliente={false} onConfirmar={vi.fn()} />);
    rerender(<ModalCobro abierto onCerrar={vi.fn()} total={money(1000)} procesando={false} hayCliente={false} onConfirmar={vi.fn()} />);

    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('sin cliente, "A cobrar" está deshabilitado y se ve "Elegí un cliente"', () => {
    render(<ModalCobro abierto onCerrar={vi.fn()} total={money(1000)} procesando={false} hayCliente={false} onConfirmar={vi.fn()} />);

    const boton = screen.getByRole('button', { name: 'A cobrar' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(screen.getByText('Elegí un cliente')).toBeTruthy();
    expect(boton.getAttribute('aria-describedby')).toBe(screen.getByText('Elegí un cliente').id);
  });

  it('con cliente, elegir "A cobrar" y confirmar llama a onConfirmar con a_cobrar', () => {
    const onConfirmar = vi.fn();
    render(<ModalCobro abierto onCerrar={vi.fn()} total={money(1000)} procesando={false} hayCliente onConfirmar={onConfirmar} />);

    expect((screen.getByRole('button', { name: 'A cobrar' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('Elegí un cliente')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'A cobrar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));

    expect(onConfirmar).toHaveBeenCalledWith('a_cobrar');
  });

  it('con "A cobrar" elegido, si se quita el cliente no se puede confirmar a_cobrar', () => {
    const onConfirmar = vi.fn();
    const { rerender } = render(
      <ModalCobro abierto onCerrar={vi.fn()} total={money(1000)} procesando={false} hayCliente onConfirmar={onConfirmar} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'A cobrar' }));

    rerender(<ModalCobro abierto onCerrar={vi.fn()} total={money(1000)} procesando={false} hayCliente={false} onConfirmar={onConfirmar} />);

    const confirmar = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    fireEvent.click(confirmar);
    expect(onConfirmar).not.toHaveBeenCalled();

    // Al volver a tener cliente, la selección quedó limpia.
    rerender(<ModalCobro abierto onCerrar={vi.fn()} total={money(1000)} procesando={false} hayCliente onConfirmar={onConfirmar} />);
    expect((screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
