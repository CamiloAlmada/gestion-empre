import { describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { ProveedorHeader, useHeader, useHeaderActual } from './ContextoHeader';

afterEach(() => cleanup());

/** Consumidor mínimo que expone el estado actual del header como texto, para
 * poder aserirlo sin depender de `Shell` (que además renderiza tabs/rutas). */
function VisorHeader() {
  const config = useHeaderActual();
  return (
    <div>
      <p data-testid="titulo">{config?.titulo ?? '(sin título)'}</p>
      <p data-testid="volver">{config?.volverA ? `${config.volverA.etiqueta}:${config.volverA.a}` : '(sin volver)'}</p>
    </div>
  );
}

function Pantalla({ titulo, volverA }: { titulo: string; volverA?: { etiqueta: string; a: string } }) {
  useHeader({ titulo, volverA });
  return <p>Contenido de {titulo}</p>;
}

describe('useHeader / ProveedorHeader', () => {
  it('useHeaderActual() empieza en null antes de que cualquier pantalla lo setee', () => {
    render(
      <ProveedorHeader>
        <VisorHeader />
      </ProveedorHeader>,
    );

    expect(screen.getByTestId('titulo').textContent).toBe('(sin título)');
  });

  it('una pantalla que llama a useHeader() setea el título', () => {
    render(
      <ProveedorHeader>
        <VisorHeader />
        <Pantalla titulo="Productos" />
      </ProveedorHeader>,
    );

    expect(screen.getByTestId('titulo').textContent).toBe('Productos');
    expect(screen.getByTestId('volver').textContent).toBe('(sin volver)');
  });

  it('propaga volverA cuando la pantalla lo pasa', () => {
    render(
      <ProveedorHeader>
        <VisorHeader />
        <Pantalla titulo="Usuarios" volverA={{ etiqueta: 'Ajustes', a: '/ajustes' }} />
      </ProveedorHeader>,
    );

    expect(screen.getByTestId('volver').textContent).toBe('Ajustes:/ajustes');
  });

  it('al desmontar la pantalla, vuelve a null (fallback del llamador)', () => {
    function Envoltorio({ montado }: { montado: boolean }) {
      return (
        <ProveedorHeader>
          <VisorHeader />
          {montado && <Pantalla titulo="Productos" />}
        </ProveedorHeader>
      );
    }

    const { rerender } = render(<Envoltorio montado={true} />);
    expect(screen.getByTestId('titulo').textContent).toBe('Productos');

    rerender(<Envoltorio montado={false} />);
    expect(screen.getByTestId('titulo').textContent).toBe('(sin título)');
  });

  it('acciones con identidad inestable (JSX literal nuevo en cada render) no dispara un loop infinito', () => {
    let renders = 0;
    function PantallaAccionesInestables() {
      renders += 1;
      // A propósito: un literal JSX nuevo en cada render, como hacen Stock,
      // Productos, Usuarios y DetalleProductoPantalla (`acciones: <Button>…</Button>`).
      useHeader({ titulo: 'Productos', acciones: <button type="button">Agregar</button> });
      return <p>Contenido</p>;
    }

    render(
      <ProveedorHeader>
        <VisorHeader />
        <PantallaAccionesInestables />
      </ProveedorHeader>,
    );

    // Sin la corrección (acciones en el array de dependencias del efecto de
    // useHeader) esto no se estabiliza nunca: `setConfig` re-renderiza todo
    // el árbol de `ProveedorHeader` —incluida esta pantalla, por ser
    // descendiente—, que crea un `acciones` con una identidad distinta, que
    // vuelve a disparar el efecto — sin fin (reproducido a mano: cuelga el
    // proceso de test). Acá se verifica que los renders se estabilizan en un
    // puñado, no que crezcan sin límite.
    expect(renders).toBeLessThan(5);
    expect(screen.getByTestId('titulo').textContent).toBe('Productos');
  });

  it('accionHeader con identidad inestable (JSX literal nuevo en cada render) no dispara un loop infinito', () => {
    let renders = 0;
    function PantallaAccionHeaderInestable() {
      renders += 1;
      // A propósito: un literal JSX nuevo en cada render, igual que el caso
      // de `acciones` de arriba — `accionHeader` (2026-07-10, atajo a
      // Historial en Venta) sigue el mismo patrón de exclusión de deps.
      useHeader({ titulo: 'Venta', accionHeader: <a href="/historial">Historial</a> });
      return <p>Contenido</p>;
    }

    render(
      <ProveedorHeader>
        <VisorHeader />
        <PantallaAccionHeaderInestable />
      </ProveedorHeader>,
    );

    expect(renders).toBeLessThan(5);
    expect(screen.getByTestId('titulo').textContent).toBe('Venta');
  });

  it('useHeader fuera de un ProveedorHeader explota con un mensaje claro', () => {
    // Silencia el log de error esperado de React al capturar la excepción.
    const consoleError = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Pantalla titulo="Productos" />)).toThrow(/ProveedorHeader/);
    } finally {
      console.error = consoleError;
    }
  });
});
