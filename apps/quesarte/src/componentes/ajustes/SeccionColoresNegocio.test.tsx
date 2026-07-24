import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { generarPaleta, PRESETS_TEMA, type TokensGenerados } from '@gestion/core';
import { ProveedorTema, ProveedorTemaNegocio, ProveedorToasts } from '@gestion/ui';
import { SeccionColoresNegocio } from './SeccionColoresNegocio';

const mocks = vi.hoisted(() => ({
  useOnlineStatus: vi.fn(() => true),
  guardarTemaNegocio: vi.fn(),
  borrarTemaNegocio: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gestion/firebase-kit')>();
  return {
    ...actual,
    useOnlineStatus: mocks.useOnlineStatus,
    guardarTemaNegocio: mocks.guardarTemaNegocio,
    borrarTemaNegocio: mocks.borrarTemaNegocio,
  };
});

vi.mock('../../firebase', () => ({ db: {} }));

/** jsdom no implementa `matchMedia` (mismo motivo que MetaThemeColor.test.tsx:
 * hace falta `vi.stubGlobal`, no alcanza con `vi.spyOn`). El componente solo
 * lo usa para resolver `modoEfectivo` de la galería — un doble mínimo alcanza. */
function instalarMatchMediaFalso() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

const PRESET_MIEL = PRESETS_TEMA.find((p) => p.id === 'miel')!;
const PRESET_OLIVA = PRESETS_TEMA.find((p) => p.id === 'oliva')!;

function renderizar(tokensIniciales: TokensGenerados | null = null) {
  return render(
    <ProveedorToasts>
      <ProveedorTema>
        <ProveedorTemaNegocio tokens={tokensIniciales}>
          <SeccionColoresNegocio />
        </ProveedorTemaNegocio>
      </ProveedorTema>
    </ProveedorToasts>,
  );
}

/** La galería REAL de `@gestion/ui` (`GaleriaPresetsTema`) expone cada
 * preset como `role="radio"` dentro de un `radiogroup` (contrato de
 * accesibilidad de esa tarea, no "button") — mismo criterio de query que
 * `packages/ui/src/GaleriaPresetsTema.test.tsx`. */
function elegirPreset(preset: (typeof PRESETS_TEMA)[number]) {
  fireEvent.click(screen.getByRole('radio', { name: new RegExp(preset.nombre) }));
}

describe('SeccionColoresNegocio', () => {
  beforeEach(() => {
    instalarMatchMediaFalso();
    // `vi.clearAllMocks()` (en el afterEach) limpia llamadas, pero NO
    // restaura un `mockReturnValue` anterior — sin este reset explícito, un
    // test "sin conexión" anterior dejaría `useOnlineStatus` en `false` para
    // siempre (mismo gotcha que SeccionNegocio.test.tsx).
    mocks.useOnlineStatus.mockReturnValue(true);
    mocks.guardarTemaNegocio.mockResolvedValue(undefined);
    mocks.borrarTemaNegocio.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-tema-negocio');
  });

  it('sin tema persistido: no ofrece "Volver a los colores originales"', () => {
    renderizar(null);

    expect(screen.queryByRole('button', { name: 'Volver a los colores originales' })).toBeNull();
  });

  it('con tema persistido: ofrece "Volver a los colores originales"', () => {
    renderizar(generarPaleta(PRESET_MIEL.tema));

    expect(screen.getByRole('button', { name: 'Volver a los colores originales' })).toBeTruthy();
  });

  it('elegir un preset marca su radio (aria-checked), previsualiza en vivo (data-tema-negocio) y muestra Guardar/Descartar', () => {
    renderizar(null);
    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
    // Sin tema persistido, la base es "Miel" (ver TEMA_BASE en el
    // componente): su radio arranca marcado.
    expect(screen.getByRole('radio', { name: new RegExp(PRESET_MIEL.nombre) }).getAttribute('aria-checked')).toBe(
      'true',
    );

    elegirPreset(PRESET_OLIVA);

    expect(screen.getByRole('radio', { name: new RegExp(PRESET_OLIVA.nombre) }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.getByRole('radio', { name: new RegExp(PRESET_MIEL.nombre) }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeTruthy();
    expect(
      screen.getByText('Estás viendo una vista previa. Guardá para aplicarla a todo el equipo.'),
    ).toBeTruthy();
  });

  it('elegir el preset que YA es el persistido no ofrece Guardar/Descartar (sin cambios reales)', () => {
    renderizar(generarPaleta(PRESET_MIEL.tema));

    elegirPreset(PRESET_MIEL);

    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
  });

  it('Guardar (en línea) llama a guardarTemaNegocio con el tema elegido y avisa con un toast', async () => {
    renderizar(null);

    elegirPreset(PRESET_OLIVA);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(mocks.guardarTemaNegocio).toHaveBeenCalledTimes(1));
    expect(mocks.guardarTemaNegocio).toHaveBeenCalledWith(
      {},
      { matiz: PRESET_OLIVA.tema.matiz, tinte: PRESET_OLIVA.tema.tinte },
    );
    expect(await screen.findByText('Colores del negocio guardados.')).toBeTruthy();
  });

  it('Guardar sin conexión: dispara la escritura sin esperar y avisa con un toast informativo', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    renderizar(null);

    elegirPreset(PRESET_OLIVA);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(mocks.guardarTemaNegocio).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Guardado sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
  });

  it('Descartar restaura el tema persistido, sin llamar a guardarTemaNegocio', () => {
    renderizar(null);

    elegirPreset(PRESET_OLIVA);
    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(mocks.guardarTemaNegocio).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Guardar' })).toBeNull();
    // Sin tema persistido (null), restaurar = volver a "sin tema del negocio".
    expect(document.documentElement.hasAttribute('data-tema-negocio')).toBe(false);
  });

  it('mover el slider de matiz a un valor que no coincide con ningún preset: ningún radio queda marcado y aparece "Personalizado"', () => {
    renderizar(null);
    expect(screen.queryByText('Personalizado')).toBeNull();

    // 17° no coincide con ningún preset de PRESETS_TEMA (78/52/130/245/300/215).
    fireEvent.change(screen.getByRole('slider', { name: 'Matiz de marca' }), { target: { value: '17' } });

    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.getAttribute('aria-checked')).toBe('false');
    }
    expect(screen.getByText('Personalizado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeTruthy();
  });

  it('"Volver a los colores originales" pide confirmación antes de borrar', () => {
    renderizar(generarPaleta(PRESET_MIEL.tema));

    fireEvent.click(screen.getByRole('button', { name: 'Volver a los colores originales' }));

    expect(
      screen.getByText('Todos los usuarios van a volver a ver los colores estándar.'),
    ).toBeTruthy();
    expect(mocks.borrarTemaNegocio).not.toHaveBeenCalled();
  });

  it('confirmar el restablecimiento (en línea) llama a borrarTemaNegocio y avisa con un toast', async () => {
    renderizar(generarPaleta(PRESET_MIEL.tema));

    fireEvent.click(screen.getByRole('button', { name: 'Volver a los colores originales' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer' }));

    await waitFor(() => expect(mocks.borrarTemaNegocio).toHaveBeenCalledTimes(1));
    expect(mocks.borrarTemaNegocio).toHaveBeenCalledWith({});
    expect(await screen.findByText('Colores del negocio restablecidos.')).toBeTruthy();
  });

  it('restablecer sin conexión: dispara la escritura sin esperar y avisa con un toast informativo', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    renderizar(generarPaleta(PRESET_MIEL.tema));

    fireEvent.click(screen.getByRole('button', { name: 'Volver a los colores originales' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer' }));

    expect(mocks.borrarTemaNegocio).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Restablecido sin conexión. Se sincronizará al reconectar.')).toBeTruthy();
  });

  it('muestra el panel de contraste AA (ReporteContrasteAa) con el tema activo', () => {
    renderizar(generarPaleta(PRESET_MIEL.tema));

    // Texto real de packages/ui/src/ReporteContrasteAa.tsx — el motor
    // garantiza AA por construcción, así que esta línea es siempre de éxito.
    expect(screen.getByText('Contraste verificado: todos los pares cumplen AA')).toBeTruthy();
    // El detalle (tabla de pares) vive plegado en un <details>/<summary>.
    expect(screen.getByText('Ver detalle')).toBeTruthy();
  });
});
