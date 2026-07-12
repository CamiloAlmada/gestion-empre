import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { money, type Cliente } from '@gestion/core';
import { ListaClientesInactivos } from './ListaClientesInactivos';
import type { ClienteInactivo } from './inactividad';

const mocks = vi.hoisted(() => ({ useDoc: vi.fn() }));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return { ...actual, useDoc: mocks.useDoc };
});

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coleccion: string, id: string) => ({
    __path: `${coleccion}/${id}`,
    withConverter: function withConverter(this: unknown) {
      return this;
    },
  }),
}));

function clienteDe(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 3, totalHistoricoCents: money(0) },
    ...over,
  };
}

// Default sin datos (BotonWhatsApp autooculta): se re-establece en cada
// `beforeEach` porque `vi.clearAllMocks()` limpia calls/results pero NO la
// implementación (`mockReturnValue` sobrevive) — sin este reset explícito,
// un `mockImplementation` de un test anterior se filtraría al siguiente.
beforeEach(() => {
  mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ListaClientesInactivos', () => {
  it('muestra nombre, días sin venir y total histórico de cada fila', () => {
    const filas: ClienteInactivo[] = [
      { cliente: clienteDe({ id: 'c1', nombre: 'Marta', stats: { cantidadVentas: 3, totalHistoricoCents: money(250000) } }), diasSinVenir: 45 },
    ];

    render(<ListaClientesInactivos clientes={filas} db={{} as never} />);

    expect(screen.getByText('Marta')).toBeTruthy();
    expect(screen.getByText('Hace 45 días')).toBeTruthy();
    expect(screen.getByText('$ 2.500,00')).toBeTruthy();
  });

  it('1 día sin venir: singular correcto', () => {
    const filas: ClienteInactivo[] = [{ cliente: clienteDe({ id: 'c1', nombre: 'Marta' }), diasSinVenir: 1 }];

    render(<ListaClientesInactivos clientes={filas} db={{} as never} />);

    expect(screen.getByText('Hace 1 día')).toBeTruthy();
  });

  it('cliente con teléfono normalizable: la fila incluye el botón de WhatsApp con "diasSinVenir" precargado', () => {
    mocks.useDoc.mockImplementation((ref: { __path: string } | null) => {
      if (ref?.__path === 'configuracion/plantillasWhatsApp') {
        return {
          datos: [{ id: 'p1', nombre: 'Te extrañamos', contexto: 'inactivo', texto: 'Hola {cliente}, hace {diasSinVenir} días' }],
          cargando: false,
          error: null,
        };
      }
      return { datos: null, cargando: false, error: null };
    });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const filas: ClienteInactivo[] = [
      { cliente: clienteDe({ id: 'c1', nombre: 'Marta', telefonoE164: '59899123456' }), diasSinVenir: 45 },
    ];

    render(<ListaClientesInactivos clientes={filas} db={{} as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp a Marta' }));

    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe(`https://wa.me/59899123456?text=${encodeURIComponent('Hola Marta, hace 45 días')}`);
  });

  it('cliente sin teléfono normalizable: la fila no muestra el botón de WhatsApp', () => {
    const filas: ClienteInactivo[] = [{ cliente: clienteDe({ id: 'c1', nombre: 'Marta' }), diasSinVenir: 45 }];

    render(<ListaClientesInactivos clientes={filas} db={{} as never} />);

    expect(screen.queryByRole('button', { name: /Enviar WhatsApp/ })).toBeNull();
  });

  it('lista vacía: no renderiza filas', () => {
    render(<ListaClientesInactivos clientes={[]} db={{} as never} />);

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });
});
