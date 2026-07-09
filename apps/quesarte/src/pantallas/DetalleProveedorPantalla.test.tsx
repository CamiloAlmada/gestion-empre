import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { ProveedorToasts } from '@gestion/ui';
import type { Proveedor } from '@gestion/core';
import { DetalleProveedorPantalla } from './DetalleProveedorPantalla';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  actualizarProveedor: vi.fn(),
  desactivarProveedor: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
    actualizarProveedor: mocks.actualizarProveedor,
    desactivarProveedor: mocks.desactivarProveedor,
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
  collection: (_db: unknown, path: string) => crearRefFalsa(path),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
}));

interface EstadoColeccionFalso<T> {
  datos: T[];
  cargando: boolean;
  error: unknown;
}

let estadoProveedores: EstadoColeccionFalso<Proveedor> = { datos: [], cargando: false, error: null };

mocks.useCollection.mockImplementation(() => estadoProveedores);

function configurarCollection(overrides: { datos?: Proveedor[]; cargando?: boolean; error?: unknown }) {
  estadoProveedores = {
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  };
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
    estadoProveedores = { datos: [], cargando: false, error: null };
  });

  it('estado cargando', () => {
    configurarCollection({ cargando: true });

    renderizar('p1');

    expect(screen.getByText('Cargando proveedor…')).toBeTruthy();
  });

  it('estado error muestra mensaje y botón de reintento', () => {
    configurarCollection({ error: new Error('boom') });

    renderizar('p1');

    expect(screen.getByRole('alert').textContent).toContain('No se pudo cargar el proveedor.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('id inexistente (o desactivado): mensaje de no encontrado con link al listado', () => {
    configurarCollection({ datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })] });

    renderizar('otro-id');

    expect(screen.getByRole('alert').textContent).toContain('No encontramos ese proveedor.');
    expect(screen.getByRole('link', { name: 'Volver a Proveedores' }).getAttribute('href')).toBe(
      '/stock/proveedores',
    );
  });

  it('header: título con el nombre del proveedor y volver a Proveedores', () => {
    configurarCollection({ datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })] });

    renderizar('p1');

    expect(screen.getByTestId('titulo-header').textContent).toBe('Quesos del Norte');
    expect(screen.getByTestId('volver-header').textContent).toBe('Proveedores:/stock/proveedores');
  });

  it('muestra contacto, dirección, RUT y notas cuando están presentes', () => {
    configurarCollection({
      datos: [
        proveedorDe({
          id: 'p1',
          nombre: 'Quesos del Norte',
          contactoNombre: 'Juan Pérez',
          telefono: '099123456',
          direccion: 'Ruta 5 km 100',
          rut: '210000000000',
          notas: 'Prefiere que se llame antes de ir.',
        }),
      ],
    });

    renderizar('p1');

    expect(screen.getByText('Juan Pérez')).toBeTruthy();
    expect(screen.getByText('099123456')).toBeTruthy();
    expect(screen.getByText('Ruta 5 km 100')).toBeTruthy();
    expect(screen.getByText('210000000000')).toBeTruthy();
    expect(screen.getByText('Prefiere que se llame antes de ir.')).toBeTruthy();
  });

  it('muestra las cuentas de pago listas para copiar', () => {
    configurarCollection({
      datos: [
        proveedorDe({
          id: 'p1',
          nombre: 'Quesos del Norte',
          pagos: [{ banco: 'Itaú', cuenta: '123-456', titular: 'Juan Pérez', moneda: 'UYU' }],
        }),
      ],
    });

    renderizar('p1');

    expect(screen.getByText('Itaú')).toBeTruthy();
    expect(screen.getByText('123-456')).toBeTruthy();
    expect(screen.getByText('Titular: Juan Pérez')).toBeTruthy();
    expect(screen.getByText('UYU')).toBeTruthy();
  });

  it('sin cuentas de pago: mensaje explícito', () => {
    configurarCollection({ datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })] });

    renderizar('p1');

    expect(screen.getByText('Sin cuentas cargadas.')).toBeTruthy();
  });

  it('historial de compras: placeholder de Fase 2', () => {
    configurarCollection({ datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })] });

    renderizar('p1');

    expect(screen.getByText('Disponible con el módulo de compras (Fase 2).')).toBeTruthy();
  });

  describe('edición', () => {
    it('el modal de edición llega precargado con los datos actuales', () => {
      configurarCollection({
        datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte', telefono: '099123456' })],
      });

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

      expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Quesos del Norte');
      expect((screen.getByLabelText('Teléfono (opcional)') as HTMLInputElement).value).toBe('099123456');
    });

    it('guarda la edición delegando en actualizarProveedor', async () => {
      configurarCollection({ datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })] });
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
      configurarCollection({
        datos: [
          proveedorDe({
            id: 'p1',
            nombre: 'Quesos del Norte',
            pagos: [{ banco: 'Itaú', cuenta: '123-456' }],
          }),
        ],
      });
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
      configurarCollection({ datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })] });

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));

      expect(mocks.desactivarProveedor).not.toHaveBeenCalled();
      expect(screen.getByText('Desactivar Quesos del Norte')).toBeTruthy();
    });

    it('confirmar desactiva, avisa y vuelve al listado', async () => {
      configurarCollection({ datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })] });
      mocks.desactivarProveedor.mockResolvedValue(undefined);

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));

      await waitFor(() => expect(mocks.desactivarProveedor).toHaveBeenCalledWith({}, 'p1'));
      expect(await screen.findByText('Listado de proveedores')).toBeTruthy();
    });

    it('sin conexión: navega al listado sin esperar el ack', async () => {
      configurarCollection({ datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })] });
      mocks.useOnlineStatus.mockReturnValue(false);
      mocks.desactivarProveedor.mockResolvedValue(undefined);

      renderizar('p1');
      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));

      expect(screen.getByText('Listado de proveedores')).toBeTruthy();
      expect(mocks.desactivarProveedor).toHaveBeenCalledTimes(1);
    });
  });
});
