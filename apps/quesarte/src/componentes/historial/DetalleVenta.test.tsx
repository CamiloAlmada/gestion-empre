import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { FirestoreError } from 'firebase/firestore';
import { money, peso, type Cliente, type Usuario, type Venta } from '@gestion/core';
import { DetalleVenta } from './DetalleVenta';

// `DataTable` con `filaCompacta` (docs/06-ui-ux.md §3) renderiza SIEMPRE la
// tabla completa Y la lista compacta a la vez (visibilidad por CSS, no
// evaluado en jsdom). Las aserciones de contenido se scopean a la tabla; la
// lista compacta se testea aparte, más abajo.
function tabla() {
  return within(screen.getByRole('table'));
}

const mocks = vi.hoisted(() => ({ useDoc: vi.fn() }));

// `importOriginal` (no un stub manual): `DetalleVenta` ahora también importa
// `clienteConverter` (lookup del cliente para el botón de WhatsApp, WA-C2) y
// `BotonWhatsApp` importa a su vez `configuracionConverter`/
// `plantillasWhatsAppConverter` — más simple reusar los reales (nunca se
// invocan de verdad: la ref falsa de abajo ignora `.withConverter(...)`) que
// mantener un stub manual sincronizado con cada converter nuevo.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return { ...actual, useDoc: mocks.useDoc };
});

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coleccion: string, id: string) => crearRef(`${coleccion}/${id}`),
}));

function venta(over: Partial<Venta> = {}): Venta {
  return {
    id: 'v1',
    numero: 1001,
    fecha: new Date(2026, 0, 5, 14, 30),
    usuarioId: 'uid-vendedor-largo',
    items: [
      {
        productoId: 'p1',
        nombreProducto: 'Queso Colonia',
        gramos: peso(500),
        precioUnitCents: money(100000),
        subtotalCents: money(50000),
      },
      {
        productoId: 'p2',
        nombreProducto: 'Miel 500g',
        unidades: 2,
        precioUnitCents: money(15000),
        subtotalCents: money(30000),
      },
    ],
    totalCents: money(80000),
    medioPago: 'debito',
    estado: 'completada',
    ...over,
  };
}

function usuario(over: Partial<Usuario> = {}): Usuario {
  return {
    uid: 'uid-vendedor-largo',
    nombre: 'Ana Vendedora',
    email: 'ana@a.com',
    rol: 'vendedor',
    activo: true,
    ...over,
  };
}

function cliente(over: Partial<Cliente> & Pick<Cliente, 'id' | 'nombre'>): Cliente {
  return {
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    stats: { cantidadVentas: 1, totalHistoricoCents: money(80000) },
    ...over,
  };
}

interface EstadoDocFalso<T> {
  datos: T | null;
  cargando: boolean;
  error: FirestoreError | null;
}

function ok<T>(datos: T | null): EstadoDocFalso<T> {
  return { datos, cargando: false, error: null };
}

interface RefFalsa {
  __path: string;
}

/** Enruta `useDoc` por el `__path` de la ref falsa (mismo criterio que
 * `DetalleClientePantalla.test.tsx`): `DetalleVenta` suscribe hasta CUATRO
 * documentos distintos (usuario del vendedor, cliente de la venta, y los DOS
 * que arma `BotonWhatsApp` por dentro: configuración general y plantillas). */
function configurarUseDoc(opciones: {
  usuario?: EstadoDocFalso<Usuario>;
  cliente?: EstadoDocFalso<Cliente>;
  plantillas?: EstadoDocFalso<{ id: string; nombre: string; contexto: string; texto: string }[]>;
}) {
  mocks.useDoc.mockImplementation((ref: RefFalsa | null) => {
    if (ref === null) return ok(null);
    if (ref.__path.startsWith('usuarios/')) return opciones.usuario ?? ok(null);
    if (ref.__path.startsWith('clientes/')) return opciones.cliente ?? ok(null);
    if (ref.__path === 'configuracion/plantillasWhatsApp') return opciones.plantillas ?? ok(null);
    // `configuracion/general` (codigoPaisDefault/nombreNegocio): sin
    // configuración explícita en estos tests — `BotonWhatsApp` ya cubre sus
    // fallbacks (`{negocio}` literal, `codigoPaisDefault` default) en su
    // propia suite.
    return ok(null);
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DetalleVenta - cabecera e ítems', () => {
  it('muestra número, fecha/hora, medio de pago, ítems y total', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Venta #1001' })).toBeTruthy();
    expect(screen.getByText('05/01/2026 14:30')).toBeTruthy();
    expect(screen.getByText('Medio de pago: Débito')).toBeTruthy();
    expect(tabla().getByText('Queso Colonia')).toBeTruthy();
    expect(tabla().getByText('500 g')).toBeTruthy();
    expect(tabla().getByText('Miel 500g')).toBeTruthy();
    expect(tabla().getByText('2 unidades')).toBeTruthy();
    expect(screen.getByText('Total: $ 800,00')).toBeTruthy();
  });

  it('venta con cliente asociado: muestra "Cliente: {nombre}" (denormalizado, doc 07)', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta({ clienteId: 'c1', clienteNombre: 'Ana Pérez' })}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.getByText('Cliente: Ana Pérez')).toBeTruthy();
  });

  it('venta anónima (sin clienteNombre): no muestra la línea de cliente', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.queryByText(/^Cliente:/)).toBeNull();
  });

  it('"Volver a Historial" llama a onVolver', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });
    const onVolver = vi.fn();

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={onVolver}
        onAnular={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Volver a Historial/ }));

    expect(onVolver).toHaveBeenCalled();
  });
});

describe('DetalleVenta - nombre del vendedor', () => {
  it('vendedor: no hace lookup y muestra "—"', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(mocks.useDoc).toHaveBeenCalledWith(null);
    expect(screen.getByText('Vendedor: —')).toBeTruthy();
  });

  it('admin: resuelve el nombre vía lookup a usuarios', () => {
    mocks.useDoc.mockReturnValue({
      datos: usuario({ nombre: 'Ana Vendedora' }),
      cargando: false,
      error: null,
    });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={true}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(mocks.useDoc).toHaveBeenCalledWith(
      expect.objectContaining({ __path: 'usuarios/uid-vendedor-largo' }),
    );
    expect(screen.getByText('Vendedor: Ana Vendedora')).toBeTruthy();
  });

  it('admin: sin doc resuelto (cargando o borrado), cae al uid acortado', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: true, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={true}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.getByText('Vendedor: uid-vend')).toBeTruthy();
  });
});

describe('DetalleVenta - botón Anular (permisos)', () => {
  it('vendedor: no ve el botón Anular venta', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Anular venta' })).toBeNull();
  });

  it('admin: ve el botón y lo dispara con onAnular', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });
    const onAnular = vi.fn();

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={true}
        db={{} as never}
        onVolver={() => {}}
        onAnular={onAnular}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Anular venta' }));

    expect(onAnular).toHaveBeenCalled();
  });

  it('admin: venta ya anulada no muestra el botón Anular', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta({ estado: 'anulada' })}
        esAdmin={true}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Anular venta' })).toBeNull();
    expect(screen.getByText('Anulada')).toBeTruthy();
  });
});

describe('DetalleVenta - fila compacta (mobile, docs/06-ui-ux.md §3)', () => {
  it('muestra nombre, cantidad, precio unitario y subtotal de cada ítem en la lista compacta', () => {
    mocks.useDoc.mockReturnValue({ datos: null, cargando: false, error: null });

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    const lista = within(screen.getByRole('list'));
    expect(lista.getByText('Queso Colonia')).toBeTruthy();
    expect(lista.getByText('500 g')).toBeTruthy();
    expect(lista.getByText('$ 1.000,00 /kg')).toBeTruthy();
    expect(lista.getByText('$ 500,00')).toBeTruthy();
    expect(lista.getByText('Miel 500g')).toBeTruthy();
    expect(lista.getByText('2 unidades')).toBeTruthy();
  });
});

describe('DetalleVenta - botón WhatsApp (WA-C2, doc 08)', () => {
  it('venta con cliente con teléfono: muestra el botón con {items}/{total} resueltos', () => {
    configurarUseDoc({
      cliente: ok(cliente({ id: 'c1', nombre: 'Ana Pérez', telefonoE164: '59899123456' })),
      plantillas: ok([{ id: 'p1', nombre: 'Pedido listo', contexto: 'venta', texto: 'Hola {cliente}: {items}. Total {total}' }]),
    });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <DetalleVenta
        venta={venta({ clienteId: 'c1', clienteNombre: 'Ana Pérez' })}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    const boton = screen.getByRole('button', { name: 'Enviar WhatsApp a Ana Pérez' });
    fireEvent.click(boton);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe(
      `https://wa.me/59899123456?text=${encodeURIComponent(
        'Hola Ana Pérez: Queso Colonia 500 g, Miel 500g 2 unidades. Total $ 800,00',
      )}`,
    );
  });

  it('venta sin cliente asociado: no muestra el botón WhatsApp', () => {
    configurarUseDoc({});

    render(
      <DetalleVenta
        venta={venta()}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: /Enviar WhatsApp/ })).toBeNull();
  });

  it('venta anulada, aunque tenga cliente con teléfono: no muestra el botón WhatsApp (no hay "pedido listo" que avisar)', () => {
    configurarUseDoc({
      cliente: ok(cliente({ id: 'c1', nombre: 'Ana Pérez', telefonoE164: '59899123456' })),
      plantillas: ok([{ id: 'p1', nombre: 'Pedido listo', contexto: 'venta', texto: 'Hola {cliente}' }]),
    });

    render(
      <DetalleVenta
        venta={venta({ clienteId: 'c1', clienteNombre: 'Ana Pérez', estado: 'anulada' })}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: /Enviar WhatsApp/ })).toBeNull();
  });

  it('cliente asociado sin teléfono normalizable: no muestra el botón WhatsApp', () => {
    configurarUseDoc({
      cliente: ok(cliente({ id: 'c1', nombre: 'Ana Pérez' })),
      plantillas: ok([{ id: 'p1', nombre: 'Pedido listo', contexto: 'venta', texto: 'Hola {cliente}' }]),
    });

    render(
      <DetalleVenta
        venta={venta({ clienteId: 'c1', clienteNombre: 'Ana Pérez' })}
        esAdmin={false}
        db={{} as never}
        onVolver={() => {}}
        onAnular={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: /Enviar WhatsApp/ })).toBeNull();
  });
});
