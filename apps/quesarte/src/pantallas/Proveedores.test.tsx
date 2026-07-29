import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router';
import { ProveedorToasts } from '@gestion/ui';
import type { Proveedor } from '@gestion/core';
import { ProveedorDuplicadoError } from '@gestion/firebase-kit';
import { Proveedores } from './Proveedores';
import { StockLayout } from '../componentes/stock/StockLayout';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  crearProveedor: vi.fn(),
  useAuth: vi.fn(),
}));

// Mismo criterio que Productos.test.tsx/Usuarios.test.tsx: `proveedorConverter`
// pasa tal cual (identidad, no se ejercita); solo se mockean los hooks y la
// única operación de I/O de la pantalla (`crearProveedor`, ya provista por
// packages/firebase-kit — CP-A). La query se arma con las funciones REALES
// de 'firebase/firestore' (mockeadas más abajo para no requerir un `db` real).
// `useAuth` (UI-4): la consume `StockLayout`, que ahora envuelve esta ruta —
// fija un admin, mismo criterio que `Compras.test.tsx`/`Precios.test.tsx`.
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
    crearProveedor: mocks.crearProveedor,
    useAuth: mocks.useAuth,
  };
});

mocks.useAuth.mockReturnValue({
  usuario: { uid: 'u1' },
  perfil: { uid: 'u1', nombre: 'Ana', email: 'ana@a.com', rol: 'admin', activo: true },
  cargando: false,
  ingresarConEmail: vi.fn(),
  restablecerPassword: vi.fn(),
  salir: vi.fn(),
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

/** Expone el header contextual actual, para aserirlo sin montar `Shell`
 * completo (mismo criterio que Productos.test.tsx). */
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

/** Placeholder de la ruta de ficha: solo confirma a qué `id` navegó. */
function PlaceholderFicha() {
  const { id } = useParams<{ id: string }>();
  return <div>Ficha de {id}</div>;
}

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/stock/proveedores']}>
      <ProveedorToasts>
        <ProveedorHeader>
          <VisorHeader />
          <Routes>
            <Route element={<StockLayout />}>
              <Route path="/stock/proveedores" element={<Proveedores />} />
            </Route>
            <Route path="/stock/proveedor/:id" element={<PlaceholderFicha />} />
          </Routes>
        </ProveedorHeader>
      </ProveedorToasts>
    </MemoryRouter>,
  );
}

describe('Proveedores', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
    estadoProveedores = { datos: [], cargando: false, error: null };
  });

  it('header contextual: título "Proveedores", sin volverA (docs/06 §2) y acción "Agregar proveedor"', () => {
    configurarCollection({ datos: [] });

    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Proveedores');
    expect(screen.getByTestId('volver-header').textContent).toBe('');
    expect(screen.getAllByRole('button', { name: 'Agregar proveedor' }).length).toBeGreaterThan(0);
  });

  it('muestra el SelectorSeccion con Productos, Compras, Proveedores y Precios; Proveedores activo (UI-5)', () => {
    configurarCollection({ datos: [] });

    renderizar();

    expect(screen.getByRole('navigation', { name: 'Secciones de Stock' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Productos' }).getAttribute('href')).toBe('/stock');
    expect(screen.getByRole('link', { name: 'Proveedores' }).getAttribute('aria-current')).toBe('page');
  });

  it('la acción de agregar es un "+" cuadrado con aria-label, sin el texto largo "Agregar proveedor" visible en el cluster (docs/06-ui-ux.md §2, 2026-07-10)', () => {
    configurarCollection({ datos: [] });

    renderizar();

    const boton = screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!;
    // El nombre accesible sale del `aria-label`, no de texto visible: el
    // botón en sí no repite la palabra "proveedor" (antes era una píldora
    // con el texto completo).
    expect(boton.getAttribute('aria-label')).toBe('Agregar proveedor');
    expect(boton.textContent).not.toContain('proveedor');
  });

  it('estado cargando', () => {
    configurarCollection({ cargando: true });

    renderizar();

    expect(screen.getByText('Cargando proveedores…')).toBeTruthy();
  });

  it('estado error muestra mensaje y botón de reintento', () => {
    configurarCollection({ error: new Error('boom') });

    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar los proveedores.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('estado vacío ofrece alta', () => {
    configurarCollection({ datos: [] });

    renderizar();

    expect(screen.getByText('No hay proveedores todavía.')).toBeTruthy();
  });

  it('renderiza el listado en orden, con contacto/teléfono cuando existen', () => {
    configurarCollection({
      datos: [
        proveedorDe({ id: 'p1', nombre: 'Quesos del Norte', contactoNombre: 'Juan', telefono: '099123456' }),
        proveedorDe({ id: 'p2', nombre: 'Miel Artesanal' }),
      ],
    });

    renderizar();

    expect(screen.getByText('Quesos del Norte')).toBeTruthy();
    expect(screen.getByText('Juan · 099123456')).toBeTruthy();
    expect(screen.getByText('Miel Artesanal')).toBeTruthy();
  });

  it('la búsqueda filtra por nombre ignorando acentos', () => {
    configurarCollection({
      datos: [
        proveedorDe({ id: 'p1', nombre: 'Quesos Añejo' }),
        proveedorDe({ id: 'p2', nombre: 'Miel Artesanal' }),
      ],
    });

    renderizar();
    fireEvent.change(screen.getByLabelText('Buscar proveedor'), { target: { value: 'anejo' } });

    expect(screen.getByText('Quesos Añejo')).toBeTruthy();
    expect(screen.queryByText('Miel Artesanal')).toBeNull();
  });

  it('tocar una fila navega a su ficha (/stock/proveedor/:id)', () => {
    configurarCollection({ datos: [proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' })] });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: /Quesos del Norte/ }));

    expect(screen.getByText('Ficha de p1')).toBeTruthy();
  });

  it('la query NO filtra por activo (tarea RE-1: trae toda la colección, filtro client-side)', () => {
    configurarCollection({ datos: [] });

    renderizar();

    const llamada = mocks.useCollection.mock.calls[0]![0] as { __clausulas: unknown[] };
    expect(llamada.__clausulas).not.toContainEqual(
      expect.objectContaining({ __tipo: 'where' }),
    );
  });

  it('lista los proveedores activos por defecto, oculta los inactivos (tarea RE-1)', () => {
    configurarCollection({
      datos: [
        proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' }),
        proveedorDe({ id: 'p2', nombre: 'Miel Artesanal', activo: false }),
      ],
    });

    renderizar();

    expect(screen.getByText('Quesos del Norte')).toBeTruthy();
    expect(screen.queryByText('Miel Artesanal')).toBeNull();
  });

  it('"Mostrar inactivos" revela los proveedores desactivados, con badge "Inactivo" (tarea RE-1)', () => {
    configurarCollection({
      datos: [
        proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' }),
        proveedorDe({ id: 'p2', nombre: 'Miel Artesanal', activo: false }),
      ],
    });

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar inactivos' }));

    expect(screen.getByText('Miel Artesanal')).toBeTruthy();
    expect(screen.getByText('Inactivo')).toBeTruthy();
  });

  it('el toggle "Mostrar inactivos" expone aria-pressed (mismo patrón que Clientes)', () => {
    configurarCollection({ datos: [] });

    renderizar();
    const boton = screen.getByRole('button', { name: 'Mostrar inactivos' });
    expect(boton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(boton);
    expect(boton.getAttribute('aria-pressed')).toBe('true');
  });

  describe('alta', () => {
    it('valida el nombre requerido y no llama a crearProveedor', () => {
      configurarCollection({ datos: [] });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(screen.getByText('Ingresá el nombre del proveedor.')).toBeTruthy();
      expect(mocks.crearProveedor).not.toHaveBeenCalled();
    });

    it('crea un proveedor con los datos básicos y cierra con éxito', async () => {
      configurarCollection({ datos: [] });
      mocks.crearProveedor.mockResolvedValue({ proveedorId: 'nuevo', sincronizacion: Promise.resolve() });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.crearProveedor).toHaveBeenCalledTimes(1));
      const [, datos] = mocks.crearProveedor.mock.calls[0] as [unknown, { nombre: string }];
      expect(datos.nombre).toBe('Quesos del Norte');
      expect(await screen.findByText('Proveedor creado.')).toBeTruthy();
    });

    it('duplicado: el toast muestra el mensaje del error y el modal sigue abierto', async () => {
      configurarCollection({ datos: [] });
      mocks.crearProveedor.mockRejectedValue(
        new ProveedorDuplicadoError('Ya existe un proveedor llamado "La Rural".'),
      );

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'La Rural' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByText('Ya existe un proveedor llamado "La Rural".')).toBeTruthy();
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
    });

    it('la sincronización (ack) que rechaza avisa con un toast en vez de quedar como unhandled rejection', async () => {
      configurarCollection({ datos: [] });
      mocks.crearProveedor.mockResolvedValue({
        proveedorId: 'nuevo',
        sincronizacion: Promise.reject(new Error('offline')),
      });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      // Mismo mensaje que offline: el fallo es del ack, no de la fase 1, y ese
      // matiz no depende de lo que dijera `navigator.onLine`.
      expect(await screen.findByText('No se pudo sincronizar el proveedor creado.')).toBeTruthy();
    });

    // EL test del episodio del captive portal: `navigator.onLine` vale `true`
    // (red muerta que dice estar viva) y el ack no llega NUNCA. Antes, tanto el
    // cierre del modal como el `finally` que baja `guardando` colgaban de ese
    // `await sincronizacion`, así que el modal quedaba congelado en
    // "Guardando…" y la única salida era recargar la página.
    it('EN LÍNEA con un ack que nunca resuelve: el modal cierra igual y "Guardando…" se libera', async () => {
      configurarCollection({ datos: [] });
      mocks.useOnlineStatus.mockReturnValue(true);
      mocks.crearProveedor.mockResolvedValue({
        proveedorId: 'nuevo',
        sincronizacion: new Promise<void>(() => {}),
      });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        const dialog = document.querySelector('dialog') as HTMLDialogElement;
        expect(dialog.open).toBe(false);
      });

      // Y el alta quedó liberada: el próximo "+" abre el modal con "Guardar"
      // habilitado, no con "Guardando…" para siempre.
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(false);
    });

    it('en línea: el ack que resuelve DESPUÉS del cierre avisa éxito', async () => {
      configurarCollection({ datos: [] });
      let resolverAck!: () => void;
      mocks.crearProveedor.mockResolvedValue({
        proveedorId: 'nuevo',
        sincronizacion: new Promise<void>((resolve) => {
          resolverAck = resolve;
        }),
      });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => {
        const dialog = document.querySelector('dialog') as HTMLDialogElement;
        expect(dialog.open).toBe(false);
      });
      expect(screen.queryByText('Proveedor creado.')).toBeNull(); // todavía no

      resolverAck();
      expect(await screen.findByText('Proveedor creado.')).toBeTruthy();
    });

    it('le pasa a crearProveedor la colección suscrita, para el chequeo de duplicados', async () => {
      // El chequeo ya no lee del SDK: sale de la suscripción de esta pantalla
      // (ver el JSDoc de `packages/firebase-kit/src/proveedores.ts`). La lista
      // va ENTERA, sin el filtro de "Mostrar inactivos": un homónimo inactivo
      // también es duplicado.
      configurarCollection({
        datos: [
          proveedorDe({ id: 'p1', nombre: 'Quesos del Norte' }),
          proveedorDe({ id: 'p2', nombre: 'Miel Artesanal', activo: false }),
        ],
      });
      mocks.crearProveedor.mockResolvedValue({ proveedorId: 'nuevo', sincronizacion: Promise.resolve() });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'La Rural' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.crearProveedor).toHaveBeenCalledTimes(1));
      const [, , existentes] = mocks.crearProveedor.mock.calls[0] as [unknown, unknown, Proveedor[]];
      expect(existentes.map((p) => p.id)).toEqual(['p1', 'p2']);
    });

    it('agregar una cuenta de pago sin banco/cuenta bloquea el guardado', () => {
      configurarCollection({ datos: [] });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte' } });
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar cuenta' }));
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(screen.getByText('Cada cuenta necesita banco y número de cuenta.')).toBeTruthy();
      expect(mocks.crearProveedor).not.toHaveBeenCalled();
    });

    it('carga una cuenta de pago completa y la envía dentro de pagos[]', async () => {
      configurarCollection({ datos: [] });
      mocks.crearProveedor.mockResolvedValue({ proveedorId: 'nuevo', sincronizacion: Promise.resolve() });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte' } });
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar cuenta' }));
      fireEvent.change(screen.getByLabelText('Banco'), { target: { value: 'Itaú' } });
      fireEvent.change(screen.getByLabelText('Número de cuenta'), { target: { value: '123-456' } });
      fireEvent.change(screen.getByLabelText('Titular (opcional)'), { target: { value: 'Juan Pérez' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.crearProveedor).toHaveBeenCalledTimes(1));
      const [, datos] = mocks.crearProveedor.mock.calls[0] as [
        unknown,
        { pagos?: { banco: string; cuenta: string; titular?: string }[] },
      ];
      expect(datos.pagos).toEqual([{ banco: 'Itaú', cuenta: '123-456', titular: 'Juan Pérez', moneda: undefined }]);
    });

    it('quitar una cuenta la elimina del borrador antes de guardar', async () => {
      configurarCollection({ datos: [] });
      mocks.crearProveedor.mockResolvedValue({ proveedorId: 'nuevo', sincronizacion: Promise.resolve() });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte' } });
      fireEvent.click(screen.getByRole('button', { name: '+ Agregar cuenta' }));
      fireEvent.click(screen.getByRole('button', { name: 'Quitar cuenta 1' }));
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.crearProveedor).toHaveBeenCalledTimes(1));
      const [, datos] = mocks.crearProveedor.mock.calls[0] as [unknown, { pagos?: unknown[] }];
      expect(datos.pagos).toBeUndefined();
    });

    it('sin conexión: la fase 1 igual resuelve (id ya asignado), cierra el modal y avisa sin esperar el ack', async () => {
      configurarCollection({ datos: [] });
      mocks.useOnlineStatus.mockReturnValue(false);
      let resolverSincronizacion!: () => void;
      mocks.crearProveedor.mockResolvedValue({
        proveedorId: 'nuevo',
        sincronizacion: new Promise<void>((resolve) => {
          resolverSincronizacion = resolve;
        }),
      });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      // No espera el ack (sigue sin resolver) para cerrar el modal ni avisar.
      expect(await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(false);
      expect(mocks.crearProveedor).toHaveBeenCalledTimes(1);

      resolverSincronizacion();
    });

    // Salida de emergencia del alta colgada: con la red muerta y
    // `navigator.onLine === true`, la fase 1 podía tardar (hoy tiene techo de
    // 5 s) y el ack puede no llegar NUNCA. Con los dos botones deshabilitados
    // el usuario quedaba encerrado hasta recargar la página.
    describe('cancelar durante el guardado', () => {
      /** Alta cuya fase 1 queda en vuelo hasta que el test la suelte. */
      function altaEnVuelo() {
        let resolver!: (valor: { proveedorId: string; sincronizacion: Promise<void> }) => void;
        mocks.crearProveedor.mockReturnValue(
          new Promise((resolve) => {
            resolver = resolve;
          }),
        );
        return (valor: { proveedorId: string; sincronizacion: Promise<void> }) => resolver(valor);
      }

      function abrirYGuardar(nombre: string) {
        fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
        fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: nombre } });
        fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
      }

      it('"Cancelar" NO se deshabilita mientras se guarda, y cierra el modal', async () => {
        configurarCollection({ datos: [] });
        altaEnVuelo();

        renderizar();
        abrirYGuardar('Quesos del Norte');
        await waitFor(() => expect(mocks.crearProveedor).toHaveBeenCalledTimes(1));

        const cancelar = screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement;
        expect(cancelar.disabled).toBe(false);
        expect((screen.getByRole('button', { name: 'Guardando…' }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(cancelar);

        const dialog = document.querySelector('dialog') as HTMLDialogElement;
        expect(dialog.open).toBe(false);
      });

      it('el alta que aterriza después de cancelar NO avisa éxito', async () => {
        configurarCollection({ datos: [] });
        const soltarFase1 = altaEnVuelo();

        renderizar();
        abrirYGuardar('Quesos del Norte');
        await waitFor(() => expect(mocks.crearProveedor).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

        await act(async () => {
          soltarFase1({ proveedorId: 'nuevo', sincronizacion: Promise.resolve() });
        });

        expect(screen.queryByText('Proveedor creado.')).toBeNull();
        const dialog = document.querySelector('dialog') as HTMLDialogElement;
        expect(dialog.open).toBe(false);
      });

      it('cancelar libera el guardado: el siguiente intento encuentra "Guardar" habilitado', async () => {
        // Sin esto, un ack que no llega nunca (online, red muerta) dejaría
        // `guardando` en true para siempre y el modal inutilizable.
        configurarCollection({ datos: [] });
        const soltarFase1 = altaEnVuelo();

        renderizar();
        abrirYGuardar('Quesos del Norte');
        await waitFor(() => expect(mocks.crearProveedor).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

        // La fase 1 aterriza con un ack que nunca resuelve: el `finally` de esa
        // operación no va a correr jamás.
        await act(async () => {
          soltarFase1({ proveedorId: 'nuevo', sincronizacion: new Promise<void>(() => {}) });
        });

        fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
        expect((screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement).disabled).toBe(false);
      });

      it('sin conexión: tras cancelar, la sincronización que rechaza SIGUE avisando (el catch queda enganchado)', async () => {
        configurarCollection({ datos: [] });
        mocks.useOnlineStatus.mockReturnValue(false);
        const soltarFase1 = altaEnVuelo();

        renderizar();
        abrirYGuardar('Quesos del Norte');
        await waitFor(() => expect(mocks.crearProveedor).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

        await act(async () => {
          soltarFase1({ proveedorId: 'nuevo', sincronizacion: Promise.reject(new Error('offline')) });
        });

        expect(await screen.findByText('No se pudo sincronizar el proveedor creado.')).toBeTruthy();
        // Pero no se anuncia éxito de algo que el usuario dio por perdido.
        expect(screen.queryByText('Guardado sin conexión. Se sincronizará al reconectar.')).toBeNull();
      });
    });

    it('sin conexión: si la sincronización rechaza después, avisa con un toast de fallo (no queda como unhandled rejection)', async () => {
      configurarCollection({ datos: [] });
      mocks.useOnlineStatus.mockReturnValue(false);
      mocks.crearProveedor.mockResolvedValue({
        proveedorId: 'nuevo',
        sincronizacion: Promise.reject(new Error('offline')),
      });

      renderizar();
      fireEvent.click(screen.getAllByRole('button', { name: 'Agregar proveedor' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Quesos del Norte' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(await screen.findByText('No se pudo sincronizar el proveedor creado.')).toBeTruthy();
    });
  });
});
