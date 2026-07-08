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

describe('Modal', () => {
  afterEach(() => {
    cleanup();
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
});
