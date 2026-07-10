import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { ProveedorToasts } from '@gestion/ui';
import type { Proveedor } from '@gestion/core';
import { DetalleProveedorPantalla } from './DetalleProveedorPantalla';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  useDoc: vi.fn(),
  actualizarProveedor: vi.fn(),
  desactivarProveedor: vi.fn(),
  reactivarProveedor: vi.fn(),
}));

// Mismo criterio que DetalleClientePantalla.test.tsx (tarea RE-1: la ficha
// pasó de `useCollection` filtrada por activos a `useDoc` sobre el documento
// puntual, para que un proveedor inactivo tenga ficha visible).
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    useDoc: mocks.useDoc,
    actualizarProveedor: mocks.actualizarProveedor,
    desactivarProveedor: mocks.desactivarProveedor,
    reactivarProveedor: mocks.reactivarProveedor,
  };
});

vi.mock('../firebase', () => ({ db: {} }));

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRefFalsa(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, coleccion: string, id: string) => crearRefFalsa(`${coleccion}/${id}`),
}));

interface EstadoDocFalso<T> {
  datos: T | null;
  cargando: boolean;
  error: FirestoreError | null;
}

function configurarProveedor(estado: EstadoDocFalso<Proveedor>) {
  mocks.useDoc.mockImplementation((ref: RefFalsa | null) => {
    if (ref === null) return { datos: null, cargando: false, error: null };
    return estado;
  });
}

function estadoOkDoc<T>(datos: T): EstadoDocFalso<T> {
  return { datos, cargando: false, error: null };
}

function proveedorDe(over: Partial<Proveedor> & Pick<Proveedor, 'id'>): Proveedor {
  return {
    nombre: 'Proveedor',
    fechaAlta: new Date('2026-01-01'),
    activo: true,
    ...over,
  };
}

function VisorHeader() {
  const config = useHeaderActual();
  return (
    <div>
      <p data-testid="titulo-header">{config?.titulo}</p>
      <p data-testid="volver-header">{config?.volverA ? `${config.volverA.etiqueta}:${config.volverA.a}` : ''}</p>
      <div data-testid="acciones-header">{config?.acciones}</div>
    </div>
  );
}

function PlaceholderListado() {
  return <div>Listado de proveedores</div>;
}

function renderizar(id = 'p1') {
  return render(
    <MemoryRouter initialEntries={[`/stock/proveedor/${id}`]}>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorHeader />
          <Routes>
            <Route path="/stock/proveedor/:id" element={<DetalleProveedorPantalla />} />
            <Route path="/stock/proveedores" element={<PlaceholderListado />} />
          </Routes>
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

describe('DetalleProveedorPantalla', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
  });

  it('estado cargando', () => {
    configurarProveedor({ datos: null, cargando: true, error: null });

    renderizar('p1');

    expect(screen.getByText('Cargando proveedor…')).toBeTruthy();
  });

  it('estado error muestra mensaje y botón de reintento', () => {
    configurarProveedor({ datos: null, cargando: false, error: { code: 'unavailable' } as FirestoreError });

    renderizar('p1');

    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar el proveedor.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('id inexistente: mensaje de no encontrado con link al listado', () => {
    configurarProveedor({ datos: null, cargando: false, error: null });

    renderizar('otro-id');

    expect(screen.getByRole('alert').textContent).toContain('No encontramos ese proveedor.');
    expect(screen.getByRole('link', { name: 'Volver a Proveedores' }).getAttribute('href')).toBe(
      '/stock/proveedores',
    );
  });

  it('header: título con el nombre del proveedor y volver a Proveedores', () => {
    configurarProveedor(estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })));

    renderizar('p1');

    expect(screen.getByTestId('titulo-header').textContent).toBe('Quesos del Norte');
    expect(screen.getByTestId('volver-header').textContent).toBe('Proveedores:/stock/proveedores');
  });

  it('muestra contacto, dirección, RUT y notas cuando están presentes', () => {
    configurarProveedor(
      estadoOkDoc(
        proveedorDe({
          id: 'p1',
          nombre: 'Quesos del Norte',
          contactoNombre: 'Juan Pérez',
          telefono: '099123456',
          direccion: 'Ruta 5 km 100',
          rut: '210000000000',
          notas: 'Prefiere que se llame antes de ir.',
        }),
      ),
    );

    renderizar('p1');

    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(screen.getByText('099123456')).toBeTruthy();
    expect(screen.getByText('Ruta 5 km 100')).toBeTruthy();
    expect(screen.getByText('210000000000')).toBeTruthy();
    expect(screen.getByText('Prefiere que se llame antes de ir.')).toBeTruthy();
  });

  it('muestra las cuentas de pago listas para copiar', () => {
    configurarProveedor(
      estadoOkDoc(
        proveedorDe({
          id: 'p1',
          nombre: 'Quesos del Norte',
          pagos: [{ banco: 'Itaú', cuenta: '123-456', titular: 'Juan Pérez', moneda: 'UYU' }],
        }),
      ),
    );

    renderizar('p1');

    expect(screen.getByText('Itaú')).toBeTruthy();
    expect(screen.getByText('123-456')).toBeTruthy();
    expect(screen.getByText('Titular: Juan Pérez')).toBeTruthy();
    expect(screen.getByText('UYU')).toBeTruthy();
  });

  it('sin cuentas de pago: mensaje explícito', () => {
    configurarProveedor(estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })));

    renderizar('p1');

    expect(screen.getByText('Sin cuentas cargadas.')).toBeTruthy();
  });

  it('historial de compras: placeholder de Fase 2', () => {
    configurarProveedor(estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })));

    renderizar('p1');

    expect(screen.getByText('Disponible con el módulo de compras (Fase 2).')).toBeTruthy();
  });

  describe('edición', () => {
    it('el modal de edición llega precargado con los datos actuales', () => {
      configurarProveedor(
        estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte', telefono: '099123456' })),
      );

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

      expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Quesos del Norte');
      expect((screen.getByLabelText('Teléfono (opcional)') as HTMLInputElement).value).toBe('099123456');
    });

    it('guarda la edición delegando en actualizarProveedor', async () => {
      configurarProveedor(estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })));
      mocks.actualizarProveedor.mockResolvedValue(undefined);

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte SRL' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.actualizarProveedor).toHaveBeenCalledTimes(1));
      const [, id, datos] = mocks.actualizarProveedor.mock.calls[0] as [unknown, string, { nombre: string }];
      expect(id).toBe('p1');
      expect(datos.nombre).toBe('Quesos del Norte SRL');
      expect(await screen.findByText('Proveedor actualizado.')).toBeTruthy();
    });

    it('agregar y quitar una cuenta de pago en la edición', async () => {
      configurarProveedor(
        estadoOkDoc(
          proveedorDe({
            id: 'p1',
            nombre: 'Quesos del Norte',
            pagos: [{ banco: 'Itaú', cuenta: '123-456' }],
          }),
        ),
      );
      mocks.actualizarProveedor.mockResolvedValue(undefined);

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

      // Precargada la cuenta existente:
      expect((screen.getByLabelText('Banco') as HTMLInputElement).value).toBe('Itaú');

      // Agrega una segunda cuenta:
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar cuenta' }));
      const bancos = screen.getAllByLabelText('Banco') as HTMLInputElement[];
      const cuentas = screen.getAllByLabelText('Número de cuenta') as HTMLInputElement[];
      fireEvent.change(bancos[1]!, { target: { value: 'Santander' } });
      fireEvent.change(cuentas[1]!, { target: { value: '999-111' } });

      // Quita la primera cuenta original:
      fireEvent.click(screen.getByRole('button', { name: 'Quitar cuenta 1' }));

      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.actualizarProveedor).toHaveBeenCalledTimes(1));
      const [, , datos] = mocks.actualizarProveedor.mock.calls[0] as [
        unknown,
        string,
        { pagos?: { banco: string; cuenta: string }[] },
      ];
      expect(datos.pagos).toEqual([{ banco: 'Santander', cuenta: '999-111', titular: undefined, moneda: undefined }]);
    });
  });

  describe('desactivación', () => {
    it('pide confirmación antes de desactivar', () => {
      configurarProveedor(estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })));

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));

      expect(mocks.desactivarProveedor).not.toHaveBeenCalled();
      expect(screen.getByText('Desactivar Quesos del Norte')).toBeTruthy();
    });

    it('confirmar desactiva, avisa y vuelve al listado', async () => {
      configurarProveedor(estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })));
      mocks.desactivarProveedor.mockResolvedValue(undefined);

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));

      await waitFor(() => expect(mocks.desactivarProveedor).toHaveBeenCalledWith({}, 'p1'));
      expect(await screen.findByText('Listado de proveedores')).toBeTruthy();
    });

    it('sin conexión: navega al listado sin esperar el ack', async () => {
      configurarProveedor(estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })));
      mocks.useOnlineStatus.mockReturnValue(false);
      mocks.desactivarProveedor.mockResolvedValue(undefined);

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));

      expect(screen.getByText('Listado de proveedores')).toBeTruthy();
      expect(mocks.desactivarProveedor).toHaveBeenCalledTimes(1);
    });
  });

  describe('reactivación (tarea RE-1)', () => {
    it('proveedor inactivo: la ficha es visible (useDoc, no filtra por activo), con badge "Inactivo"', () => {
      configurarProveedor(
        estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte', activo: false })),
      );

      renderizar('p1');

      expect(screen.getByText('Quesos del Norte')).toBeTruthy();
      expect(screen.getByText('Inactivo')).toBeTruthy();
    });

    it('proveedor inactivo: el header ofrece "Reactivar" en vez de "Desactivar"', () => {
      configurarProveedor(
        estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte', activo: false })),
      );

      renderizar('p1');

      expect(screen.getByRole('button', { name: 'Reactivar' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Desactivar' })).toBeNull();
    });

    it('proveedor activo: no ofrece "Reactivar"', () => {
      configurarProveedor(estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })));

      renderizar('p1');

      expect(screen.queryByRole('button', { name: 'Reactivar' })).toBeNull();
    });

    it('reactivar (sin modal de confirmación, doc 06 §6): llama a reactivarProveedor y avisa con éxito', async () => {
      configurarProveedor(
        estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte', activo: false })),
      );
      mocks.reactivarProveedor.mockResolvedValue(undefined);

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }));

      await waitFor(() => expect(mocks.reactivarProveedor).toHaveBeenCalledWith({}, 'p1'));
      expect(await screen.findByText('Proveedor reactivado.')).toBeTruthy();
    });

    it('sin conexión: reactiva sin esperar el ack y avisa que falta sincronizar', async () => {
      configurarProveedor(
        estadoOkDoc(proveedorDe({ id: 'p1', nombre: 'Quesos del Norte', activo: false })),
      );
      mocks.useOnlineStatus.mockReturnValue(false);
      mocks.reactivarProveedor.mockResolvedValue(undefined);

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }));

      expect(mocks.reactivarProveedor).toHaveBeenCalledTimes(1);
      expect(
        await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.'),
      ).toBeTruthy();
    });
  });
});
