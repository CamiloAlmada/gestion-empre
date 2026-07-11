import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';

/** Wrapper con el botón disparador real, para poder probar el retorno de foco. */
function ModalDeCasoDePrueba({
  contenido = 'Contenido',
  acciones,
}: {
  contenido?: string;
  acciones?: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div>
      <button type="button" onClick={() => setAbierto(true)}>
        Abrir modal
      </button>
      <Modal
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        titulo="Título de prueba"
        acciones={acciones}
      >
        {contenido}
      </Modal>
    </div>
  );
}

/** Devuelve el `<dialog>` cuyo contenido incluye `texto` (para distinguir entre varios montados a la vez). */
function dialogConTexto(texto: string): HTMLDialogElement {
  const dialog = Array.from(document.querySelectorAll('dialog')).find((d) => d.textContent?.includes(texto));
  if (dialog === undefined) {
    throw new Error(`No se encontró un <dialog> con texto "${texto}"`);
  }
  return dialog;
}

describe('Modal', () => {
  afterEach(() => {
    cleanup();
    // Los tests de scroll lock tocan un estado global (document.body): se
    // resetea acá para no filtrar entre tests.
    document.body.style.overflow = '';
  });

  it('no está abierto (sin atributo open) hasta que abierto=true', () => {
    render(<ModalDeCasoDePrueba />);

    const dialog = document.querySelector('dialog');
    expect(dialog?.open).toBe(false);
  });

  it('abre el <dialog> nativo al pasar abierto=true', () => {
    render(<ModalDeCasoDePrueba />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    const dialog = document.querySelector('dialog');
    expect(dialog?.open).toBe(true);
    expect(screen.getByText('Título de prueba')).toBeTruthy();
    expect(screen.getByText('Contenido')).toBeTruthy();
  });

  it('el título está asociado vía aria-labelledby', () => {
    render(<ModalDeCasoDePrueba />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    const tituloId = dialog.getAttribute('aria-labelledby');
    expect(tituloId).toBeTruthy();
    expect(document.getElementById(tituloId as string)?.textContent).toBe('Título de prueba');
  });

  it('Escape cierra el modal y llama a onCerrar', () => {
    render(<ModalDeCasoDePrueba />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(dialog.open).toBe(false);
  });

  it('click en el backdrop (target = el propio <dialog>) cierra el modal', () => {
    render(<ModalDeCasoDePrueba />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    fireEvent.click(dialog);

    expect(dialog.open).toBe(false);
  });

  it('click dentro del contenido NO cierra el modal', () => {
    render(<ModalDeCasoDePrueba />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    fireEvent.click(screen.getByText('Contenido'));

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
  });

  it('el foco vuelve al disparador al cerrar', () => {
    render(<ModalDeCasoDePrueba />);
    const disparador = screen.getByRole('button', { name: 'Abrir modal' });

    // fireEvent.click no mueve el foco por sí solo (a diferencia de un click
    // real en un navegador): se simula ese paso explícitamente para que el
    // Modal capture el disparador correcto en document.activeElement.
    disparador.focus();
    fireEvent.click(disparador);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(document.activeElement).toBe(disparador);
  });

  it('un botón de "acciones" que llama a onCerrar (y el padre hace setState) no duplica el aviso', () => {
    const onCerrarSpy = vi.fn();

    function ModalControladoPorEstado() {
      const [abierto, setAbierto] = useState(true);
      // Patrón típico de consumo: el botón de "Cancelar" llama directamente
      // al mismo `onCerrar` que se le pasa al Modal, y ESE callback decide
      // cerrar actualizando el estado (no llama a dialog.close() él mismo).
      function onCerrar() {
        onCerrarSpy();
        setAbierto(false);
      }

      return (
        <Modal
          abierto={abierto}
          onCerrar={onCerrar}
          titulo="T"
          acciones={
            <button type="button" onClick={onCerrar}>
              Cancelar
            </button>
          }
        >
          contenido
        </Modal>
      );
    }

    render(<ModalControladoPorEstado />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(false);
    expect(onCerrarSpy).toHaveBeenCalledTimes(1);
  });

  it('onCerrar se llama exactamente una vez al cerrar con Escape', () => {
    const onCerrar = vi.fn();
    function Envoltorio() {
      return (
        <Modal abierto={true} onCerrar={onCerrar} titulo="T">
          contenido
        </Modal>
      );
    }
    render(<Envoltorio />);

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it('bloquea el scroll del body mientras está abierto', () => {
    render(<ModalDeCasoDePrueba />);
    expect(document.body.style.overflow).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    expect(document.body.style.overflow).toBe('hidden');
  });

  it('al cerrar restaura el valor previo del body (no asume que era vacío)', () => {
    document.body.style.overflow = 'scroll';
    render(<ModalDeCasoDePrueba />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));
    expect(document.body.style.overflow).toBe('hidden');

    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(document.body.style.overflow).toBe('scroll');
  });

  it('al desmontar con el modal abierto restaura el overflow previo del body', () => {
    document.body.style.overflow = '';
    const { unmount } = render(
      <Modal abierto={true} onCerrar={vi.fn()} titulo="T">
        contenido
      </Modal>,
    );

    expect(document.body.style.overflow).toBe('hidden');

    unmount();

    expect(document.body.style.overflow).toBe('');
  });

  it('modales encadenados (A abre → B abre → B cierra → A cierra) no rompen la restauración', () => {
    function DosModales() {
      const [aAbierto, setAAbierto] = useState(false);
      const [bAbierto, setBAbierto] = useState(false);

      return (
        <div>
          <button type="button" onClick={() => setAAbierto(true)}>
            Abrir A
          </button>
          <Modal abierto={aAbierto} onCerrar={() => setAAbierto(false)} titulo="A">
            <button type="button" onClick={() => setBAbierto(true)}>
              Abrir B
            </button>
          </Modal>
          <Modal abierto={bAbierto} onCerrar={() => setBAbierto(false)} titulo="B">
            contenido B
          </Modal>
        </div>
      );
    }

    render(<DosModales />);
    expect(document.body.style.overflow).toBe('');

    // A abre: guarda el overflow original ('') y bloquea.
    fireEvent.click(screen.getByRole('button', { name: 'Abrir A' }));
    expect(document.body.style.overflow).toBe('hidden');

    // B abre encima de A: guarda el 'hidden' que dejó A, sigue bloqueado.
    fireEvent.click(screen.getByRole('button', { name: 'Abrir B' }));
    expect(document.body.style.overflow).toBe('hidden');

    // B cierra: restaura lo que B guardó ('hidden') — A sigue abierto, el
    // body NO debe desbloquearse todavía.
    fireEvent.keyDown(dialogConTexto('contenido B'), { key: 'Escape' });
    expect(document.body.style.overflow).toBe('hidden');

    // A cierra: restaura el valor original ('').
    fireEvent.keyDown(dialogConTexto('Abrir B'), { key: 'Escape' });
    expect(document.body.style.overflow).toBe('');
  });

  it('el área scrolleable del contenido lleva aire lateral para que el ring de foco no se recorte (UI-4f)', () => {
    render(<ModalDeCasoDePrueba />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir modal' }));

    // "Contenido" es un string pasado directo como `children`: el propio
    // `div.overflow-y-auto` es el elemento con ese texto (no hay un wrapper
    // intermedio), así que `getByText` ya devuelve el contenedor a probar.
    const contenedorScrolleable = screen.getByText('Contenido');
    expect(contenedorScrolleable.className).toContain('overflow-y-auto');
    // `px-0.5` (2px) le da al contenedor el margen exacto que necesita el
    // `focus-visible:ring-2` (2px, sin ring-offset en los inputs de
    // formulario) antes de su propio borde de recorte; `-mx-0.5` compensa
    // ese padding para que el ancho visible del contenido no cambie
    // (docs/06-ui-ux.md §5, UI-4f).
    expect(contenedorScrolleable.className).toContain('px-0.5');
    expect(contenedorScrolleable.className).toContain('-mx-0.5');
  });
});
