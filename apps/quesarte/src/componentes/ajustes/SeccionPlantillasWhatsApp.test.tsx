import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FirestoreError } from 'firebase/firestore';
import { PLANTILLAS_SEED, type PlantillaWhatsApp } from '@gestion/core';
import { ProveedorToasts } from '@gestion/ui';
import { SeccionPlantillasWhatsApp } from './SeccionPlantillasWhatsApp';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  useDoc: vi.fn(),
  guardarPlantillasWhatsApp: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    useDoc: mocks.useDoc,
    guardarPlantillasWhatsApp: mocks.guardarPlantillasWhatsApp,
  };
});

vi.mock('../../firebase', () => ({ db: {} }));

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

const ID_GENERADO = 'id-generado-1';

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, nombre: string) => ({ __coleccion: nombre }),
  // `doc(collection(...))` genera un id local (sin ruta); `doc(db, col, id)` es una ref.
  doc: (...args: unknown[]) =>
    args.length === 1 ? { id: ID_GENERADO } : crearRef(`${args[1] as string}/${args[2] as string}`),
}));

interface EstadoDocFalso {
  datos: PlantillaWhatsApp[] | null;
  cargando: boolean;
  error: FirestoreError | null;
}

function configurarPlantillas(estado: EstadoDocFalso) {
  mocks.useDoc.mockImplementation(() => estado);
}

function renderizar() {
  return render(
    <ProveedorToasts>
      <SeccionPlantillasWhatsApp />
    </ProveedorToasts>,
  );
}

describe('SeccionPlantillasWhatsApp', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
  });

  it('cargando', () => {
    configurarPlantillas({ datos: null, cargando: true, error: null });
    renderizar();
    expect(screen.getByText('Cargando plantillas…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón de reintento', () => {
    configurarPlantillas({ datos: null, cargando: false, error: { code: 'unavailable' } as FirestoreError });
    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar las plantillas.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  describe('estado vacío (doc ausente o lista vacía)', () => {
    it('ofrece "Cargar plantillas iniciales"', () => {
      configurarPlantillas({ datos: null, cargando: false, error: null });
      renderizar();

      expect(screen.getByText('Todavía no hay plantillas de WhatsApp configuradas.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Cargar plantillas iniciales' })).toBeTruthy();
    });

    it('sembrar llama a guardarPlantillasWhatsApp con PLANTILLAS_SEED', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarPlantillas({ datos: [], cargando: false, error: null });
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Cargar plantillas iniciales' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledWith({}, PLANTILLAS_SEED);
      expect(await screen.findByText('Plantillas iniciales cargadas.')).toBeTruthy();
    });
  });

  describe('doc guardado con las 3 plantillas viejas (sin recordatorio de cobro)', () => {
    const editadas: PlantillaWhatsApp[] = PLANTILLAS_SEED.filter((p) => p.contexto !== 'cobro').map((p) => ({
      ...p,
      nombre: `${p.nombre} (editada)`,
      texto: `Texto editado de ${p.id}`,
    }));

    it('lista las 4 y conserva las ediciones de las 3 guardadas', () => {
      configurarPlantillas({ datos: editadas, cargando: false, error: null });
      renderizar();

      expect(screen.getAllByRole('button', { name: 'Editar' })).toHaveLength(4);
      expect(screen.getByText('Pedido listo (editada)')).toBeTruthy();
      expect(screen.getByText('Texto editado de pedido-listo')).toBeTruthy();
      expect(screen.getByText('Recordatorio de cobro')).toBeTruthy();
      expect(screen.getByText('Cobro')).toBeTruthy();
    });

    it('al guardar una edición persiste las 4, sin pisar las editadas y con la de cobro del seed', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarPlantillas({ datos: editadas, cargando: false, error: null });
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo nombre' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      const [, guardada] = mocks.guardarPlantillasWhatsApp.mock.calls[0] as [unknown, PlantillaWhatsApp[]];
      expect(guardada).toHaveLength(4);
      // Orden: las existentes primero (sin reordenar), la faltante al final.
      expect(guardada.map((p) => p.id)).toEqual(['pedido-listo', 'te-extranamos', 'aviso-llegada', 'recordatorio-cobro']);
      expect(guardada[0]!.nombre).toBe('Nuevo nombre');
      expect(guardada[1]).toEqual(editadas[1]);
      expect(guardada[2]).toEqual(editadas[2]);
      expect(guardada[3]).toEqual(PLANTILLAS_SEED.find((p) => p.id === 'recordatorio-cobro'));
    });
  });

  describe('con plantillas', () => {
    function configurarConSeed() {
      configurarPlantillas({ datos: PLANTILLAS_SEED as PlantillaWhatsApp[], cargando: false, error: null });
    }

    it('lista nombre y contexto legible de cada plantilla', () => {
      configurarConSeed();
      renderizar();

      expect(screen.getByText('Pedido listo')).toBeTruthy();
      expect(screen.getByText('Venta')).toBeTruthy();
      expect(screen.getByText('Te extrañamos')).toBeTruthy();
      expect(screen.getByText('Cliente inactivo')).toBeTruthy();
      expect(screen.getByText('Aviso de llegada')).toBeTruthy();
      // Match exacto: "Cliente" (aviso-llegada) no colisiona con "Cliente inactivo" (te-extranamos).
      expect(screen.getAllByText('Cliente')).toHaveLength(1);
      expect(screen.getByText('Recordatorio de cobro')).toBeTruthy();
      expect(screen.getByText('Cobro')).toBeTruthy();
    });

    it('editar: precarga nombre y texto, guarda la lista completa con el cambio', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);

      const inputNombre = screen.getByLabelText('Nombre') as HTMLInputElement;
      expect(inputNombre.value).toBe('Pedido listo');

      fireEvent.change(inputNombre, { target: { value: 'Pedido para retirar' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      const [, listaGuardada] = mocks.guardarPlantillasWhatsApp.mock.calls[0] as [unknown, PlantillaWhatsApp[]];
      expect(listaGuardada).toHaveLength(4);
      expect(listaGuardada.find((p) => p.id === 'pedido-listo')?.nombre).toBe('Pedido para retirar');
      // El resto de la lista queda intacta (edición atómica de UN elemento).
      expect(listaGuardada.find((p) => p.id === 'te-extranamos')).toEqual(PLANTILLAS_SEED[1]);
      expect(await screen.findByText('Plantilla guardada.')).toBeTruthy();
    });

    it('"Restaurar texto original" repone el borrador del modal sin guardar todavía', () => {
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Roto' } });
      fireEvent.click(screen.getByRole('button', { name: 'Restaurar texto original' }));

      expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Pedido listo');
      expect(mocks.guardarPlantillasWhatsApp).not.toHaveBeenCalled();
    });

    it('"Restaurar iniciales" pide confirmación y llama a guardarPlantillasWhatsApp con el seed completo', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar iniciales' }));
      expect(
        screen.getByText('Repone nombre y texto de las plantillas iniciales. Tus plantillas propias no cambian.'),
      ).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledWith({}, PLANTILLAS_SEED);
      expect(await screen.findByText('Plantillas restauradas.')).toBeTruthy();
    });

    it('cancelar la confirmación de "Restaurar iniciales" no llama a guardarPlantillasWhatsApp', () => {
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar iniciales' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(mocks.guardarPlantillasWhatsApp).not.toHaveBeenCalled();
    });

    it('sin conexión: dispara la escritura sin esperar y avisa con un toast informativo', () => {
      mocks.useOnlineStatus.mockReturnValue(false);
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarConSeed();
      renderizar();

      fireEvent.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Guardado sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
    });
  });

  describe('plantillas propias (crear, desactivar, reactivar)', () => {
    const propia: PlantillaWhatsApp = {
      id: 'propia-1',
      nombre: 'Promo de miel',
      contexto: 'cliente',
      texto: 'Hola {cliente}! Llegó miel nueva.',
    };
    const inactiva: PlantillaWhatsApp = {
      id: 'propia-2',
      nombre: 'Vieja promo',
      contexto: 'venta',
      texto: 'Texto viejo',
      activa: false,
    };

    function configurarLista(lista: PlantillaWhatsApp[]) {
      configurarPlantillas({ datos: lista, cargando: false, error: null });
    }

    function botonesDeFila(nombre: string) {
      const fila = screen.getByText(nombre).closest('li') as HTMLElement;
      return within(fila);
    }

    it('crear persiste [...lista, nueva] con el id generado y sin la clave activa', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarLista([...PLANTILLAS_SEED, propia]);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Retiro demorado' } });
      fireEvent.change(screen.getByLabelText('Contexto'), { target: { value: 'venta' } });
      fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'Hola {cliente}, demoramos un poco.' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      const [, guardada] = mocks.guardarPlantillasWhatsApp.mock.calls[0] as [unknown, PlantillaWhatsApp[]];
      expect(guardada).toEqual([
        ...PLANTILLAS_SEED,
        propia,
        {
          id: ID_GENERADO,
          nombre: 'Retiro demorado',
          contexto: 'venta',
          texto: 'Hola {cliente}, demoramos un poco.',
        },
      ]);
      expect('activa' in guardada[guardada.length - 1]!).toBe(false);
      expect(await screen.findByText('Plantilla creada.')).toBeTruthy();
    });

    it('crear valida nombre y texto vacíos y no persiste', () => {
      configurarLista([...PLANTILLAS_SEED]);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Nueva plantilla' }));
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      expect(screen.getByText('Ingresá el nombre de la plantilla.')).toBeTruthy();
      expect(screen.getByText('Ingresá el texto de la plantilla.')).toBeTruthy();
      expect(mocks.guardarPlantillasWhatsApp).not.toHaveBeenCalled();
    });

    it('con la lista vacía (estado vacío) no hay "Nueva plantilla"', () => {
      configurarPlantillas({ datos: [], cargando: false, error: null });
      renderizar();

      expect(screen.queryByRole('button', { name: 'Nueva plantilla' })).toBeNull();
    });

    it('con 20 plantillas "Nueva plantilla" queda deshabilitado y se avisa el máximo', () => {
      const propias: PlantillaWhatsApp[] = Array.from({ length: 16 }, (_, i) => ({
        id: `propia-${i}`,
        nombre: `Propia ${i}`,
        contexto: 'venta',
        texto: 'Texto',
      }));
      configurarLista([...PLANTILLAS_SEED, ...propias]);
      renderizar();

      expect((screen.getByRole('button', { name: 'Nueva plantilla' }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText('Llegaste al máximo de 20 plantillas')).toBeTruthy();
    });

    it('con 19 plantillas todavía se puede crear', () => {
      const propias: PlantillaWhatsApp[] = Array.from({ length: 15 }, (_, i) => ({
        id: `propia-${i}`,
        nombre: `Propia ${i}`,
        contexto: 'venta',
        texto: 'Texto',
      }));
      configurarLista([...PLANTILLAS_SEED, ...propias]);
      renderizar();

      expect((screen.getByRole('button', { name: 'Nueva plantilla' }) as HTMLButtonElement).disabled).toBe(false);
      expect(screen.queryByText(/Llegaste al máximo/)).toBeNull();
    });

    it('editar una propia permite cambiar el contexto y persiste nombre, contexto y texto', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarLista([...PLANTILLAS_SEED, propia]);
      renderizar();

      fireEvent.click(botonesDeFila('Promo de miel').getByRole('button', { name: 'Editar' }));
      expect((screen.getByLabelText('Contexto') as HTMLSelectElement).value).toBe('cliente');
      fireEvent.change(screen.getByLabelText('Contexto'), { target: { value: 'inactivo' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      const [, guardada] = mocks.guardarPlantillasWhatsApp.mock.calls[0] as [unknown, PlantillaWhatsApp[]];
      expect(guardada.find((p) => p.id === 'propia-1')).toEqual({ ...propia, contexto: 'inactivo' });
    });

    it('una de fábrica no permite cambiar el contexto ni muestra Desactivar/Reactivar', () => {
      configurarLista([...PLANTILLAS_SEED, propia]);
      renderizar();

      const fila = botonesDeFila('Pedido listo');
      expect(fila.queryByRole('button', { name: 'Desactivar' })).toBeNull();
      expect(fila.queryByRole('button', { name: 'Reactivar' })).toBeNull();
      // Solo la propia ofrece Desactivar.
      expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(1);

      fireEvent.click(fila.getByRole('button', { name: 'Editar' }));
      expect(screen.queryByLabelText('Contexto')).toBeNull();
      expect(screen.getByRole('button', { name: 'Restaurar texto original' })).toBeTruthy();
    });

    it('editar una de fábrica conserva su contexto', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarLista([...PLANTILLAS_SEED]);
      renderizar();

      fireEvent.click(botonesDeFila('Pedido listo').getByRole('button', { name: 'Editar' }));
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Pedido listo!' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      const [, guardada] = mocks.guardarPlantillasWhatsApp.mock.calls[0] as [unknown, PlantillaWhatsApp[]];
      expect(guardada.find((p) => p.id === 'pedido-listo')).toEqual({
        ...PLANTILLAS_SEED[0]!,
        nombre: 'Pedido listo!',
      });
    });

    it('desactivar pide confirmación y persiste activa:false solo en esa plantilla', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarLista([...PLANTILLAS_SEED, propia]);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
      expect(
        screen.getByText('La plantilla deja de aparecer en el botón de WhatsApp. Podés reactivarla cuando quieras.'),
      ).toBeTruthy();
      expect(mocks.guardarPlantillasWhatsApp).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      const [, guardada] = mocks.guardarPlantillasWhatsApp.mock.calls[0] as [unknown, PlantillaWhatsApp[]];
      expect(guardada).toEqual([...PLANTILLAS_SEED, { ...propia, activa: false }]);
      expect(await screen.findByText('Plantilla desactivada.')).toBeTruthy();
    });

    it('cancelar la confirmación de desactivar no persiste nada', () => {
      configurarLista([...PLANTILLAS_SEED, propia]);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      expect(mocks.guardarPlantillasWhatsApp).not.toHaveBeenCalled();
    });

    it('una inactiva muestra el badge "Inactiva" y Reactivar (sin Desactivar)', () => {
      configurarLista([...PLANTILLAS_SEED, inactiva]);
      renderizar();

      const fila = botonesDeFila('Vieja promo');
      expect(fila.getByText('Inactiva')).toBeTruthy();
      expect(fila.getByRole('button', { name: 'Reactivar' })).toBeTruthy();
      expect(fila.queryByRole('button', { name: 'Desactivar' })).toBeNull();
      expect(screen.getAllByText('Inactiva')).toHaveLength(1);
    });

    it('reactivar no pide confirmación y persiste la plantilla sin la clave activa', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      configurarLista([...PLANTILLAS_SEED, inactiva]);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      const [, guardada] = mocks.guardarPlantillasWhatsApp.mock.calls[0] as [unknown, PlantillaWhatsApp[]];
      const reactivada = guardada.find((p) => p.id === 'propia-2')!;
      expect('activa' in reactivada).toBe(false);
      expect(reactivada).toEqual({ id: 'propia-2', nombre: 'Vieja promo', contexto: 'venta', texto: 'Texto viejo' });
      expect(await screen.findByText('Plantilla reactivada.')).toBeTruthy();
    });

    it('restaurar iniciales conserva las propias (incluida una inactiva) y repone las de fábrica', async () => {
      mocks.guardarPlantillasWhatsApp.mockResolvedValue(undefined);
      const editadaDeFabrica: PlantillaWhatsApp = { ...PLANTILLAS_SEED[0]!, nombre: 'Editada', texto: 'Cambiado' };
      configurarLista([editadaDeFabrica, propia, inactiva, ...PLANTILLAS_SEED.slice(1)]);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Restaurar iniciales' }));
      fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));

      await waitFor(() => expect(mocks.guardarPlantillasWhatsApp).toHaveBeenCalledTimes(1));
      const [, guardada] = mocks.guardarPlantillasWhatsApp.mock.calls[0] as [unknown, PlantillaWhatsApp[]];
      expect(guardada).toEqual([PLANTILLAS_SEED[0], propia, inactiva, ...PLANTILLAS_SEED.slice(1)]);
      expect(guardada.find((p) => p.id === 'propia-2')?.activa).toBe(false);
    });

    it('error al desactivar: avisa y no cierra la confirmación', async () => {
      mocks.guardarPlantillasWhatsApp.mockRejectedValue(new Error('fallo'));
      configurarLista([...PLANTILLAS_SEED, propia]);
      renderizar();

      fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar desactivación' }));

      expect(await screen.findByText('No se pudo desactivar la plantilla. Intentá de nuevo.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Confirmar desactivación' })).toBeTruthy();
    });
  });
});
