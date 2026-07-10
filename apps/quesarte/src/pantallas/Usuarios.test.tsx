import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { ProveedorTema, ProveedorToasts } from '@gestion/ui';
import type { Usuario } from '@gestion/core';
import { Usuarios } from './Usuarios';
import { ProveedorHeader, useHeaderActual } from '../componentes/header/ContextoHeader';

// `DataTable` con `filaCompacta` (docs/06-ui-ux.md §3) renderiza SIEMPRE la
// tabla completa Y la lista compacta a la vez — la visibilidad la decide CSS
// responsive que jsdom no evalúa (ver DataTable.tsx). Por eso los controles
// (switch, grupo de rol) y el texto de cada fila aparecen dos veces en el
// DOM de test; las aserciones/interacciones que necesitan UNA instancia
// puntual se scopean a la tabla (fuente de verdad de siempre). La lista
// compacta se testea aparte, explícitamente, más abajo.
function tabla() {
  return within(screen.getByRole('table'));
}

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useOnlineStatus: vi.fn(() => true),
  useCollection: vi.fn(),
  invitarUsuario: vi.fn(),
  updateDoc: vi.fn(),
}));

// Igual criterio que Productos.test.tsx: `usuarioConverter` y las clases de
// error pasan tal cual (identidad/reales); solo se mockean los hooks y la
// única operación de I/O de la pantalla (`invitarUsuario`). La query en sí
// se arma con las funciones REALES de 'firebase/firestore' (no hace I/O),
// contra el `db` real de test (env vars falsas, ver vitest.config.ts).
vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useAuth: mocks.useAuth,
    useOnlineStatus: mocks.useOnlineStatus,
    useCollection: mocks.useCollection,
    invitarUsuario: mocks.invitarUsuario,
  };
});

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('firebase/firestore')>();
  return {
    ...actual,
    updateDoc: mocks.updateDoc,
  };
});

function authPorDefecto() {
  return {
    usuario: { uid: 'u1' },
    perfil: {
      uid: 'u1',
      nombre: 'Ana Pérez',
      email: 'ana@quesarte.com',
      rol: 'admin' as 'admin' | 'vendedor',
      activo: true,
    },
    cargando: false,
    ingresarConEmail: vi.fn(),
    restablecerPassword: vi.fn(),
    salir: vi.fn(),
  };
}

function configurarAuth(overrides: Partial<ReturnType<typeof authPorDefecto>> = {}) {
  mocks.useAuth.mockReturnValue({ ...authPorDefecto(), ...overrides });
}

function configurarCollection(overrides: { datos?: Usuario[]; cargando?: boolean; error?: unknown }) {
  mocks.useCollection.mockReturnValue({
    datos: overrides.datos ?? [],
    cargando: overrides.cargando ?? false,
    error: overrides.error ?? null,
  });
}

const usuariosFalsos: Usuario[] = [
  { uid: 'u1', nombre: 'Ana Pérez', email: 'ana@quesarte.com', rol: 'admin', activo: true },
  { uid: 'u2', nombre: 'Beto Gómez', email: 'beto@quesarte.com', rol: 'vendedor', activo: true },
  { uid: 'u3', nombre: 'Carla Ruiz', email: 'carla@quesarte.com', rol: 'vendedor', activo: false },
];

/** Expone el header contextual actual como texto, para aserirlo sin montar
 * `Shell` completo (mismo criterio que `Stock.test.tsx`/`Productos.test.tsx`). */
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

function renderizar() {
  return render(
    <MemoryRouter>
      <ProveedorTema>
        <ProveedorToasts>
          <ProveedorHeader>
            <VisorHeader />
            <Usuarios />
          </ProveedorHeader>
        </ProveedorToasts>
      </ProveedorTema>
    </MemoryRouter>,
  );
}

describe('Usuarios', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.useOnlineStatus.mockReturnValue(true);
  });

  it('header contextual: título "Usuarios" y volver a Ajustes', () => {
    configurarAuth();
    configurarCollection({ datos: [] });

    renderizar();

    expect(screen.getByTestId('titulo-header').textContent).toBe('Usuarios');
    expect(screen.getByTestId('volver-header').textContent).toBe('Ajustes:/ajustes');
  });

  it('la acción de agregar es un "+" cuadrado con aria-label "Invitar usuario", sin texto largo visible (docs/06-ui-ux.md §2, 2026-07-10)', () => {
    configurarAuth();
    configurarCollection({ datos: [] });

    renderizar();

    const boton = screen.getByRole('button', { name: 'Invitar usuario' });
    expect(boton.getAttribute('aria-label')).toBe('Invitar usuario');
    expect(boton.textContent).not.toContain('usuario');
  });

  it('renderiza el listado con nombre, correo, rol y estado', () => {
    configurarAuth();
    configurarCollection({ datos: usuariosFalsos });

    renderizar();

    expect(tabla().getByText('Ana Pérez')).toBeTruthy();
    expect(tabla().getByText('beto@quesarte.com')).toBeTruthy();
    expect(tabla().getByText('carla@quesarte.com')).toBeTruthy();
    // switches de estado: 2 activos, 1 inactivo.
    expect(tabla().getAllByRole('switch', { name: /Desactivar a/ }).length).toBe(2);
    expect(tabla().getByRole('switch', { name: 'Activar a Carla Ruiz' })).toBeTruthy();
  });

  it('la fila del propio usuario tiene los controles deshabilitados y muestra la nota', () => {
    configurarAuth();
    configurarCollection({ datos: usuariosFalsos });

    renderizar();

    expect(tabla().getByText('No podés modificar tu propia cuenta.')).toBeTruthy();
    const switchPropio = tabla().getByRole('switch', { name: 'Desactivar a Ana Pérez' });
    expect(switchPropio.hasAttribute('disabled')).toBe(true);
    const grupoRolPropio = tabla().getByRole('group', { name: 'Rol de Ana Pérez' });
    for (const boton of grupoRolPropio.querySelectorAll('button')) {
      expect(boton.hasAttribute('disabled')).toBe(true);
    }
  });

  it('los controles de otra fila no están deshabilitados', () => {
    configurarAuth();
    configurarCollection({ datos: usuariosFalsos });

    renderizar();

    const switchAjeno = tabla().getByRole('switch', { name: 'Desactivar a Beto Gómez' });
    expect(switchAjeno.hasAttribute('disabled')).toBe(false);
  });

  it('togglear el switch de otro usuario llama a updateDoc con { activo }', async () => {
    configurarAuth();
    configurarCollection({ datos: usuariosFalsos });
    mocks.updateDoc.mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(tabla().getByRole('switch', { name: 'Desactivar a Beto Gómez' }));

    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledTimes(1));
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [{ path?: string }, Record<string, unknown>];
    expect(ref.path).toBe('usuarios/u2');
    expect(cambios).toEqual({ activo: false });
    expect(await screen.findByText('Usuario actualizado.')).toBeTruthy();
  });

  it('cambiar el rol de otro usuario llama a updateDoc con { rol }', async () => {
    configurarAuth();
    configurarCollection({ datos: usuariosFalsos });
    mocks.updateDoc.mockResolvedValue(undefined);

    renderizar();
    const grupoRol = tabla().getByRole('group', { name: 'Rol de Beto Gómez' });
    fireEvent.click(
      Array.from(grupoRol.querySelectorAll('button')).find((b) => b.textContent === 'Administrador')!,
    );

    await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledTimes(1));
    const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [{ path?: string }, Record<string, unknown>];
    expect(ref.path).toBe('usuarios/u2');
    expect(cambios).toEqual({ rol: 'admin' });
  });

  it('sin conexión: dispara el update sin esperar el ack y avisa que falta sincronizar', async () => {
    configurarAuth();
    configurarCollection({ datos: usuariosFalsos });
    mocks.useOnlineStatus.mockReturnValue(false);
    mocks.updateDoc.mockResolvedValue(undefined);

    renderizar();
    fireEvent.click(tabla().getByRole('switch', { name: 'Desactivar a Beto Gómez' }));

    expect(mocks.updateDoc).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Guardado sin conexión. Se sincronizará al reconectar.'),
    ).toBeTruthy();
  });

  it('estado cargando', () => {
    configurarAuth();
    configurarCollection({ cargando: true });

    renderizar();

    expect(screen.getByText('Cargando usuarios…')).toBeTruthy();
  });

  it('estado error muestra mensaje y botón de reintento', () => {
    configurarAuth();
    configurarCollection({ error: new Error('boom') });

    renderizar();

    expect(screen.getByRole('alert').textContent).toContain('No se pudieron cargar los usuarios.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('estado vacío', () => {
    configurarAuth();
    configurarCollection({ datos: [] });

    renderizar();

    expect(screen.getByText('No hay usuarios todavía.')).toBeTruthy();
  });

  it('banner de offline explica que no se pueden invitar usuarios', () => {
    configurarAuth();
    mocks.useOnlineStatus.mockReturnValue(false);
    configurarCollection({ datos: usuariosFalsos });

    renderizar();

    expect(screen.getByRole('status').textContent).toContain(
      'no se pueden invitar usuarios hasta reconectar',
    );
  });

  describe('invitar usuario', () => {
    it('valida campos requeridos y no llama a invitarUsuario', () => {
      configurarAuth();
      configurarCollection({ datos: [] });

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));
      fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

      expect(screen.getByText('Ingresá el correo.')).toBeTruthy();
      expect(screen.getByText('Ingresá el nombre.')).toBeTruthy();
      expect(mocks.invitarUsuario).not.toHaveBeenCalled();
    });

    it('llama a invitarUsuario con la EntradaInvitacion correcta (rol default vendedor)', async () => {
      configurarAuth();
      configurarCollection({ datos: [] });
      mocks.invitarUsuario.mockResolvedValue({ uid: 'nuevo' });

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'nuevo@quesarte.com' } });
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo Vendedor' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

      await waitFor(() => expect(mocks.invitarUsuario).toHaveBeenCalledTimes(1));
      const [, , entrada] = mocks.invitarUsuario.mock.calls[0] as [unknown, unknown, unknown];
      expect(entrada).toEqual({ email: 'nuevo@quesarte.com', nombre: 'Nuevo Vendedor', rol: 'vendedor' });
    });

    it('permite elegir rol Administrador', async () => {
      configurarAuth();
      configurarCollection({ datos: [] });
      mocks.invitarUsuario.mockResolvedValue({ uid: 'nuevo' });

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'nuevo@quesarte.com' } });
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nueva Admin' } });
      fireEvent.click(screen.getByRole('button', { name: 'Administrador' }));
      fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

      await waitFor(() => expect(mocks.invitarUsuario).toHaveBeenCalledTimes(1));
      const [, , entrada] = mocks.invitarUsuario.mock.calls[0] as [unknown, unknown, { rol: string }];
      expect(entrada.rol).toBe('admin');
    });

    it('éxito: muestra el toast "Invitación enviada a <email>" y cierra el modal', async () => {
      configurarAuth();
      configurarCollection({ datos: [] });
      mocks.invitarUsuario.mockResolvedValue({ uid: 'nuevo' });

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'nuevo@quesarte.com' } });
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo Vendedor' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

      expect(await screen.findByText('Invitación enviada a nuevo@quesarte.com')).toBeTruthy();
      await waitFor(() => {
        const dialog = document.querySelector('dialog');
        expect(dialog?.open).toBe(false);
      });
    });

    it('EmailYaRegistradoError: muestra el error en el campo correo y NO cierra el modal', async () => {
      const { EmailYaRegistradoError } = await import('@gestion/firebase-kit');
      configurarAuth();
      configurarCollection({ datos: [] });
      mocks.invitarUsuario.mockRejectedValue(
        new EmailYaRegistradoError('Ya existe una cuenta con ese email.'),
      );

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'repetido@quesarte.com' } });
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Alguien' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

      expect(await screen.findByText('Ya existe una cuenta con ese correo.')).toBeTruthy();
      const dialog = document.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBe(true);
    });

    it('EmailInvalidoError: muestra el mensaje del error en el campo correo', async () => {
      const { EmailInvalidoError } = await import('@gestion/firebase-kit');
      configurarAuth();
      configurarCollection({ datos: [] });
      mocks.invitarUsuario.mockRejectedValue(
        new EmailInvalidoError('El email no tiene un formato válido.'),
      );

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'raro' } });
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Alguien' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

      expect(await screen.findByText('El email no tiene un formato válido.')).toBeTruthy();
    });

    it('DatosInvitacionInvalidosError: muestra el mensaje del error en el campo nombre', async () => {
      const { DatosInvitacionInvalidosError } = await import('@gestion/firebase-kit');
      configurarAuth();
      configurarCollection({ datos: [] });
      mocks.invitarUsuario.mockRejectedValue(
        new DatosInvitacionInvalidosError('Rol inválido: gerente.'),
      );

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'nuevo@quesarte.com' } });
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Alguien' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

      expect(await screen.findByText('Rol inválido: gerente.')).toBeTruthy();
    });

    it('PerfilNoCreadoError: muestra el aviso accionable como toast de error y cierra el modal', async () => {
      const { PerfilNoCreadoError } = await import('@gestion/firebase-kit');
      configurarAuth();
      configurarCollection({ datos: [] });
      mocks.invitarUsuario.mockRejectedValue(new PerfilNoCreadoError('detalle técnico interno'));

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));
      fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'nuevo@quesarte.com' } });
      fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Alguien' } });
      fireEvent.click(screen.getByRole('button', { name: 'Invitar' }));

      const mensaje = await screen.findByText(
        'La cuenta se creó pero el perfil no. Contactá al desarrollador para completarla desde la ' +
          'consola — reintentar con el mismo email va a fallar.',
      );
      expect(mensaje).toBeTruthy();
      expect(mensaje.closest('[role="alert"]')).toBeTruthy();
      await waitFor(() => {
        const dialog = document.querySelector('dialog');
        expect(dialog?.open).toBe(false);
      });
    });

    it('sin conexión: el botón Invitar está deshabilitado y muestra el aviso', () => {
      configurarAuth();
      configurarCollection({ datos: [] });
      mocks.useOnlineStatus.mockReturnValue(false);

      renderizar();
      fireEvent.click(screen.getByRole('button', { name: 'Invitar usuario' }));

      expect(screen.getByText('Necesitás conexión para invitar usuarios.')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Invitar' }).hasAttribute('disabled')).toBe(true);
      expect(mocks.invitarUsuario).not.toHaveBeenCalled();
    });
  });

  describe('fila compacta (mobile, docs/06-ui-ux.md §3)', () => {
    function lista() {
      return within(screen.getByRole('list'));
    }

    it('muestra nombre y correo de cada usuario, con los mismos controles de rol/estado que la tabla', () => {
      configurarAuth();
      configurarCollection({ datos: usuariosFalsos });

      renderizar();

      expect(lista().getByText('Beto Gómez')).toBeTruthy();
      expect(lista().getByText('beto@quesarte.com')).toBeTruthy();
      expect(lista().getByRole('switch', { name: 'Desactivar a Beto Gómez' })).toBeTruthy();
      expect(lista().getByRole('group', { name: 'Rol de Beto Gómez' })).toBeTruthy();
    });

    it('togglear el switch de la fila compacta llama a updateDoc igual que en la tabla', async () => {
      configurarAuth();
      configurarCollection({ datos: usuariosFalsos });
      mocks.updateDoc.mockResolvedValue(undefined);

      renderizar();
      fireEvent.click(lista().getByRole('switch', { name: 'Desactivar a Beto Gómez' }));

      await waitFor(() => expect(mocks.updateDoc).toHaveBeenCalledTimes(1));
      const [ref, cambios] = mocks.updateDoc.mock.calls[0] as [{ path?: string }, Record<string, unknown>];
      expect(ref.path).toBe('usuarios/u2');
      expect(cambios).toEqual({ activo: false });
    });

    it('la fila compacta del propio usuario también tiene los controles deshabilitados', () => {
      configurarAuth();
      configurarCollection({ datos: usuariosFalsos });

      renderizar();

      const switchPropio = lista().getByRole('switch', { name: 'Desactivar a Ana Pérez' });
      expect(switchPropio.hasAttribute('disabled')).toBe(true);
    });
  });
});
