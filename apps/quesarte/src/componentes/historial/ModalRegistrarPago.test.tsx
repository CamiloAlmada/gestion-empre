import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { cobroInicial, money, type Venta } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { ModalRegistrarPago } from './ModalRegistrarPago';

const mocks = vi.hoisted(() => {
  class CobroInvalidoError extends Error {}
  return { registrarPago: vi.fn(), CobroInvalidoError };
});

vi.mock('@gestion/firebase-kit', () => ({
  registrarPago: mocks.registrarPago,
  CobroInvalidoError: mocks.CobroInvalidoError,
}));

function ventaACobrar(over: Partial<Venta> = {}): Venta {
  return {
    id: 'v1',
    numero: 1001,
    fecha: new Date(2026, 0, 5, 14, 30),
    usuarioId: 'u1',
    items: [],
    totalCents: money(150000),
    medioPago: 'a_cobrar',
    estado: 'completada',
    clienteId: 'c1',
    clienteNombre: 'Ana',
    cobro: cobroInicial(),
    ...over,
  };
}

function renderizar(props: Partial<Parameters<typeof ModalRegistrarPago>[0]> = {}) {
  return render(
    <ProveedorToasts>
      <ModalRegistrarPago
        abierto={true}
        onCerrar={props.onCerrar ?? (() => {})}
        db={{} as never}
        venta={ventaACobrar()}
        usuarioId="admin1"
        enLinea={true}
        {...props}
      />
    </ProveedorToasts>,
  );
}

function elegirMedio(medio: string) {
  fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: medio } });
}

function elegirFecha(valor: string) {
  fireEvent.change(screen.getByLabelText('Fecha y hora del pago'), { target: { value: valor } });
}

const botonConfirmar = () => screen.getByRole('button', { name: 'Confirmar pago' });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ModalRegistrarPago - formulario', () => {
  it('muestra el saldo pendiente como monto, deshabilitado', () => {
    renderizar({ venta: ventaACobrar({ totalCents: money(150000) }) });

    const monto = screen.getByLabelText('Monto') as HTMLInputElement;
    expect(monto.value).toBe('1.500,00');
    expect(monto.disabled).toBe(true);
  });

  it('el medio de pago no tiene default y ofrece solo los cuatro reales', () => {
    renderizar();

    const select = screen.getByLabelText('Medio de pago') as HTMLSelectElement;
    expect(select.value).toBe('');
    const etiquetas = Array.from(select.options).map((o) => o.textContent);
    expect(etiquetas).toEqual([
      'Elegí un medio de pago',
      'Efectivo',
      'Débito',
      'Crédito',
      'Transferencia',
    ]);
  });

  it('sin medio elegido, "Confirmar pago" está deshabilitado y no escribe', () => {
    renderizar();

    const boton = botonConfirmar() as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.click(boton);
    expect(mocks.registrarPago).not.toHaveBeenCalled();

    elegirMedio('efectivo');
    expect((botonConfirmar() as HTMLButtonElement).disabled).toBe(false);
  });

  it('la fecha arranca en "ahora" (no en el futuro) y la referencia admite hasta 60 caracteres', () => {
    renderizar();

    const fecha = screen.getByLabelText('Fecha y hora del pago') as HTMLInputElement;
    expect(fecha.type).toBe('datetime-local');
    expect(fecha.value).not.toBe('');
    expect(fecha.value <= fecha.max).toBe(true);
    expect((screen.getByLabelText('Número de operación (opcional)') as HTMLInputElement).maxLength).toBe(60);
  });
});

describe('ModalRegistrarPago - en línea', () => {
  it('envía la fecha ELEGIDA, el medio, la referencia recortada, el saldo y el usuarioId', async () => {
    mocks.registrarPago.mockResolvedValue(undefined);
    const onCerrar = vi.fn();
    const venta = ventaACobrar();
    renderizar({ venta, onCerrar });

    elegirMedio('transferencia');
    elegirFecha('2026-03-10T09:45');
    fireEvent.change(screen.getByLabelText('Número de operación (opcional)'), {
      target: { value: '  OP-12345  ' },
    });
    fireEvent.click(botonConfirmar());

    await waitFor(() => expect(mocks.registrarPago).toHaveBeenCalledTimes(1));
    const [db, ventaEnviada, datos] = mocks.registrarPago.mock.calls[0] as [
      unknown,
      Venta,
      {
        montoCents: number;
        medioPago: string;
        fecha: Date;
        referencia?: string;
        usuarioId: string;
      },
    ];
    expect(db).toEqual({});
    expect(ventaEnviada).toBe(venta);
    expect(datos.montoCents).toBe(150000);
    expect(datos.medioPago).toBe('transferencia');
    expect(datos.fecha.getTime()).toBe(new Date(2026, 2, 10, 9, 45).getTime());
    expect(datos.referencia).toBe('OP-12345');
    expect(datos.usuarioId).toBe('admin1');

    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
    expect(screen.getByText('Pago registrado.')).toBeTruthy();
  });

  it('referencia vacía: no se envía', async () => {
    mocks.registrarPago.mockResolvedValue(undefined);
    renderizar();

    elegirMedio('efectivo');
    fireEvent.click(botonConfirmar());

    await waitFor(() => expect(mocks.registrarPago).toHaveBeenCalled());
    expect(mocks.registrarPago.mock.calls[0]?.[2].referencia).toBeUndefined();
  });

  it('una fecha futura se rechaza sin escribir', () => {
    const onCerrar = vi.fn();
    renderizar({ onCerrar });

    elegirMedio('efectivo');
    elegirFecha('2099-01-01T10:00');
    fireEvent.click(botonConfirmar());

    expect(screen.getByText('La fecha del pago no puede ser futura.')).toBeTruthy();
    expect(mocks.registrarPago).not.toHaveBeenCalled();
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('sin fecha, pide indicarla y no escribe', () => {
    renderizar();

    elegirMedio('efectivo');
    elegirFecha('');
    fireEvent.click(botonConfirmar());

    expect(screen.getByText('Indicá la fecha y hora del pago.')).toBeTruthy();
    expect(mocks.registrarPago).not.toHaveBeenCalled();
  });

  it('error SÍNCRONO del kit (CobroInvalidoError): muestra su mensaje y no cierra', () => {
    mocks.registrarPago.mockImplementation(() => {
      throw new mocks.CobroInvalidoError('La venta v1 ya tiene 20 pagos, el máximo permitido.');
    });
    const onCerrar = vi.fn();
    renderizar({ onCerrar });

    elegirMedio('efectivo');
    fireEvent.click(botonConfirmar());

    expect(screen.getByRole('alert').textContent).toBe(
      'La venta v1 ya tiene 20 pagos, el máximo permitido.',
    );
    expect(onCerrar).not.toHaveBeenCalled();
    // Y se puede reintentar: el botón no quedó trabado en "Registrando…".
    expect((botonConfirmar() as HTMLButtonElement).disabled).toBe(false);
  });

  it('error síncrono de core (RangeError por sobrepago): mensaje claro y no cierra', () => {
    mocks.registrarPago.mockImplementation(() => {
      throw new RangeError('aplicarPago(): el cobrado superaría el total');
    });
    const onCerrar = vi.fn();
    renderizar({ onCerrar });

    elegirMedio('efectivo');
    fireEvent.click(botonConfirmar());

    expect(screen.getByRole('alert').textContent).toContain('supera lo que falta cobrar');
    expect(onCerrar).not.toHaveBeenCalled();
  });

  it('el servidor rechaza el commit: toast de error y no cierra', async () => {
    mocks.registrarPago.mockRejectedValue(new Error('permission-denied'));
    const onCerrar = vi.fn();
    renderizar({ onCerrar });

    elegirMedio('efectivo');
    fireEvent.click(botonConfirmar());

    await waitFor(() =>
      expect(screen.getByText('No se pudo registrar el pago. Intentá de nuevo.')).toBeTruthy(),
    );
    expect(onCerrar).not.toHaveBeenCalled();
  });
});

describe('ModalRegistrarPago - offline (patrón §8)', () => {
  it('dispara sin esperar el ack, cierra al toque y avisa con toast info', async () => {
    let resolver: () => void = () => {};
    mocks.registrarPago.mockReturnValue(
      new Promise<void>((resolve) => {
        resolver = resolve;
      }),
    );
    const onCerrar = vi.fn();
    renderizar({ onCerrar, enLinea: false });

    elegirMedio('transferencia');
    fireEvent.click(botonConfirmar());

    expect(onCerrar).toHaveBeenCalled();
    expect(
      screen.getByText('Pago guardado sin conexión. Se sincronizará al reconectar.'),
    ).toBeTruthy();

    resolver();
    await Promise.resolve();
  });

  it('si el servidor lo rechaza al sincronizar, avisa con un toast de error', async () => {
    mocks.registrarPago.mockRejectedValue(new Error('rechazada'));
    renderizar({ enLinea: false });

    elegirMedio('efectivo');
    fireEvent.click(botonConfirmar());

    await waitFor(() =>
      expect(
        screen.getByText('No se pudo sincronizar el pago. Revisá la venta en el historial.'),
      ).toBeTruthy(),
    );
  });

  it('un error síncrono offline tampoco cierra el modal', () => {
    mocks.registrarPago.mockImplementation(() => {
      throw new mocks.CobroInvalidoError('La venta no es una venta a cobrar.');
    });
    const onCerrar = vi.fn();
    renderizar({ onCerrar, enLinea: false });

    elegirMedio('efectivo');
    fireEvent.click(botonConfirmar());

    expect(screen.getByRole('alert').textContent).toBe('La venta no es una venta a cobrar.');
    expect(onCerrar).not.toHaveBeenCalled();
  });
});
