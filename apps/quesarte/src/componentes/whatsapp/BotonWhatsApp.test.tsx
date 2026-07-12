import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { FirestoreError } from 'firebase/firestore';
import { peso, type Configuracion, type PlantillaWhatsApp } from '@gestion/core';
import { BotonWhatsApp } from './BotonWhatsApp';

const mocks = vi.hoisted(() => ({ useDoc: vi.fn() }));

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

interface EstadoDocFalso<T> {
  datos: T | null;
  cargando: boolean;
  error: FirestoreError | null;
}

function okConfig(datos: Configuracion | null): EstadoDocFalso<Configuracion> {
  return { datos, cargando: false, error: null };
}

function okPlantillas(datos: PlantillaWhatsApp[] | null): EstadoDocFalso<PlantillaWhatsApp[]> {
  return { datos, cargando: false, error: null };
}

function configuracionDe(over: Partial<Configuracion> = {}): Configuracion {
  return {
    nombreNegocio: 'Quesarte',
    umbralPiezaAgotadaGramos: peso(0),
    metodoProrrateo: 'por_peso',
    ...over,
  };
}

/** Configura `useDoc` según el path de la ref (BotonWhatsApp suscribe DOS
 * documentos: `configuracion/general` y `configuracion/plantillasWhatsApp`). */
function configurarDocs(opciones: {
  configuracion?: EstadoDocFalso<Configuracion>;
  plantillas?: EstadoDocFalso<PlantillaWhatsApp[]>;
}) {
  mocks.useDoc.mockImplementation((ref: RefFalsa) => {
    if (ref.__path === 'configuracion/general') {
      return opciones.configuracion ?? okConfig(null);
    }
    if (ref.__path === 'configuracion/plantillasWhatsApp') {
      return opciones.plantillas ?? okPlantillas(null);
    }
    return { datos: null, cargando: false, error: null };
  });
}

function plantilla(over: Partial<PlantillaWhatsApp> & Pick<PlantillaWhatsApp, 'id' | 'contexto'>): PlantillaWhatsApp {
  return { nombre: 'Plantilla', texto: 'Hola {cliente}!', ...over };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BotonWhatsApp - sin teléfono normalizable', () => {
  it('sin telefono ni telefonoE164: no renderiza nada', () => {
    configurarDocs({});
    const { container } = render(
      <BotonWhatsApp contexto="cliente" valores={{ cliente: 'Ana' }} db={{} as never} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('telefono no normalizable (letras): no renderiza nada', () => {
    configurarDocs({});
    const { container } = render(
      <BotonWhatsApp telefono="no-es-un-telefono" contexto="cliente" valores={{ cliente: 'Ana' }} db={{} as never} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('BotonWhatsApp - fallback de normalización (cliente pre-WA-B)', () => {
  it('sin telefonoE164, normaliza `telefono` con el codigoPaisDefault de configuracion/general', () => {
    configurarDocs({
      configuracion: okConfig(configuracionDe()),
      plantillas: okPlantillas([plantilla({ id: 'p1', contexto: 'cliente', texto: 'Hola {cliente}!' })]),
    });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<BotonWhatsApp telefono="099 123 456" contexto="cliente" valores={{ cliente: 'Ana' }} db={{} as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp a Ana' }));

    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain('https://wa.me/59899123456?text=');
  });
});

describe('BotonWhatsApp - link resuelto (UNA plantilla, click directo)', () => {
  it('arma la URL wa.me con el número y el mensaje resuelto (encodeURIComponent)', () => {
    configurarDocs({
      configuracion: okConfig(null),
      plantillas: okPlantillas([
        plantilla({ id: 'p1', contexto: 'inactivo', nombre: 'Te extrañamos', texto: 'Hola {cliente}! {diasSinVenir} días 😊' }),
      ]),
    });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <BotonWhatsApp
        telefonoE164="59899123456"
        contexto="inactivo"
        valores={{ cliente: 'Marta', diasSinVenir: '45' }}
        db={{} as never}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp a Marta' }));

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, target, features] = spy.mock.calls[0] as [string, string, string];
    expect(url).toBe(
      `https://wa.me/59899123456?text=${encodeURIComponent('Hola Marta! 45 días 😊')}`,
    );
    expect(target).toBe('_blank');
    expect(features).toBe('noopener,noreferrer');
  });

  it('resuelve {negocio} desde configuracion/general, sin que el caller lo pase', () => {
    configurarDocs({
      configuracion: okConfig(configuracionDe()),
      plantillas: okPlantillas([plantilla({ id: 'p1', contexto: 'inactivo', texto: 'Hola {cliente}, de {negocio}' })]),
    });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <BotonWhatsApp telefonoE164="59899123456" contexto="inactivo" valores={{ cliente: 'Marta' }} db={{} as never} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp a Marta' }));

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe(`https://wa.me/59899123456?text=${encodeURIComponent('Hola Marta, de Quesarte')}`);
  });

  it('sin nombreNegocio en configuracion: {negocio} queda literal', () => {
    configurarDocs({
      configuracion: okConfig(null),
      plantillas: okPlantillas([plantilla({ id: 'p1', contexto: 'inactivo', texto: 'Hola {cliente}, de {negocio}' })]),
    });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <BotonWhatsApp telefonoE164="59899123456" contexto="inactivo" valores={{ cliente: 'Marta' }} db={{} as never} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp a Marta' }));

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe(`https://wa.me/59899123456?text=${encodeURIComponent('Hola Marta, de {negocio}')}`);
  });
});

describe('BotonWhatsApp - selector (VARIAS plantillas del contexto)', () => {
  it('con más de una plantilla del contexto, el toque abre un selector; elegir una arma el link y cierra', () => {
    configurarDocs({
      configuracion: okConfig(null),
      plantillas: okPlantillas([
        plantilla({ id: 'p1', contexto: 'venta', nombre: 'Pedido listo', texto: 'Hola {cliente}, pedido listo' }),
        plantilla({ id: 'p2', contexto: 'venta', nombre: 'Otra opción', texto: 'Hola {cliente}, otra' }),
        plantilla({ id: 'p3', contexto: 'cliente', nombre: 'No debería aparecer', texto: 'irrelevante' }),
      ]),
    });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<BotonWhatsApp telefonoE164="59899123456" contexto="venta" valores={{ cliente: 'Ana' }} db={{} as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp a Ana' }));

    // No abre wa.me todavía: primero el selector.
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText('Pedido listo')).toBeTruthy();
    expect(screen.getByText('Otra opción')).toBeTruthy();
    expect(screen.queryByText('No debería aparecer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Otra opción' }));

    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe(`https://wa.me/59899123456?text=${encodeURIComponent('Hola Ana, otra')}`);
  });
});

describe('BotonWhatsApp - fallback a PLANTILLAS_SEED', () => {
  it('sin doc de plantillas (ausente): usa el seed para el contexto', () => {
    configurarDocs({ configuracion: okConfig(null), plantillas: okPlantillas(null) });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<BotonWhatsApp telefonoE164="59899123456" contexto="cliente" valores={{ cliente: 'Ana' }} db={{} as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp a Ana' }));

    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = spy.mock.calls[0] as [string];
    // Seed de contexto 'cliente' (doc 08): "Aviso de llegada".
    expect(url).toContain(encodeURIComponent('Llegó mercadería nueva'));
  });

  it('doc de plantillas vacío ([]): también cae al seed', () => {
    configurarDocs({ configuracion: okConfig(null), plantillas: okPlantillas([]) });
    const spy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<BotonWhatsApp telefonoE164="59899123456" contexto="venta" valores={{ cliente: 'Ana', items: 'Queso', total: '$ 100' }} db={{} as never} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar WhatsApp a Ana' }));

    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain(encodeURIComponent('Tu pedido está listo'));
  });

  it('ninguna plantilla del contexto (ni en el doc ni en el seed): no renderiza', () => {
    // El doc trae plantillas (no está vacío), pero ninguna del contexto pedido
    // -> NO cae al seed (el seed solo es fallback de doc AUSENTE/VACÍO), y no
    // hay nada que ofrecer: el botón no debe aparecer.
    configurarDocs({
      configuracion: okConfig(null),
      plantillas: okPlantillas([plantilla({ id: 'p1', contexto: 'venta' })]),
    });

    const { container } = render(
      <BotonWhatsApp telefonoE164="59899123456" contexto="cliente" valores={{ cliente: 'Ana' }} db={{} as never} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
