import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { FirestoreError } from 'firebase/firestore';
import { money, VERSION_COSTEO, type ItemVenta, type Venta } from '@gestion/core';
import { ProveedorHeader } from '../componentes/header/ContextoHeader';
import { Reportes } from './Reportes';

const mocks = vi.hoisted(() => ({
  useCollection: vi.fn(),
  useDoc: vi.fn(() => ({ datos: null, cargando: false, error: null })),
  useOnlineStatus: vi.fn(),
}));

vi.mock('@gestion/firebase-kit', () => ({
  useCollection: mocks.useCollection,
  // `useAlertasStock`/`useContextoAlertas` (tarea B3): la home ahora también
  // suscribe `productos`, `piezas` y `configuracion/general` para el bloque de
  // alertas. Con las colecciones vacías y sin config, ese bloque cae en su
  // estado de "todo en orden" y no interfiere con lo que testea este archivo.
  useDoc: mocks.useDoc,
  useOnlineStatus: mocks.useOnlineStatus,
  configuracionConverter: {},
  piezaConverter: {},
  productoConverter: {},
  ventaConverter: {},
}));

vi.mock('../firebase', () => ({ db: {} }));

interface RefFalsa {
  __path: string;
  withConverter: () => RefFalsa;
}

function crearRef(path: string): RefFalsa {
  const ref: RefFalsa = { __path: path, withConverter: () => ref };
  return ref;
}

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => crearRef(path),
  doc: (_db: unknown, coleccion: string, id: string) => crearRef(`${coleccion}/${id}`),
  query: (ref: RefFalsa, ...clausulas: unknown[]) => ({ ...ref, __clausulas: clausulas }),
  orderBy: (...args: unknown[]) => ({ __tipo: 'orderBy', args }),
  where: (...args: unknown[]) => ({ __tipo: 'where', args }),
}));

interface EstadoFalso<T> {
  datos: T[];
  cargando: boolean;
  error: FirestoreError | null;
}

function estadoOk<T>(datos: T[]): EstadoFalso<T> {
  return { datos, cargando: false, error: null };
}

function configurarVentas(estado: EstadoFalso<Venta>) {
  mocks.useCollection.mockImplementation((q: RefFalsa | null) => {
    if (q === null) return { datos: [], cargando: false, error: null };
    if (q.__path === 'ventas') return estado;
    return { datos: [], cargando: false, error: null };
  });
}

/** Ítem con costeo congelado real (`costoItemCents` conocido): cuenta para
 * la ganancia y para la cobertura de costo (ver `costeo.ts`). */
function itemConCosto(over: Partial<ItemVenta> = {}): ItemVenta {
  return {
    productoId: 'p1',
    nombreProducto: 'Queso Colonia',
    precioUnitCents: money(10000),
    subtotalCents: money(10000),
    costeo: {
      v: VERSION_COSTEO,
      fuente: 'promedio',
      origen: 'venta',
      costoUnitCents: money(6000),
      costoItemCents: money(6000),
    },
    ...over,
  };
}

/** Ítem SIN costeo (dato legado o sin base de costo): no aporta ganancia y
 * cuenta como línea sin costo en `CoberturaCosto`. */
function itemSinCosto(over: Partial<ItemVenta> = {}): ItemVenta {
  return {
    productoId: 'p2',
    nombreProducto: 'Miel',
    precioUnitCents: money(10000),
    subtotalCents: money(10000),
    ...over,
  };
}

function ventaCon(fecha: Date, items: ItemVenta[], over: Partial<Venta> = {}): Venta {
  const totalCents = money(items.reduce((acc, i) => acc + i.subtotalCents, 0));
  return {
    id: `v-${fecha.getTime()}`,
    numero: fecha.getTime(),
    fecha,
    usuarioId: 'u1',
    items,
    totalCents,
    medioPago: 'efectivo',
    estado: 'completada',
    ...over,
  };
}

/**
 * "Ahora" fijo de toda la suite: el **día 3** de julio de 2026 a las 11:00,
 * en hora LOCAL del runner (`offsetMinutosLocal` y las `fecha` de las
 * ventas de prueba usan el mismo criterio de hora local, así que el
 * resultado es determinista sin importar el huso del entorno de CI).
 *
 * A propósito NO es fin de mes: es el ejemplo exacto del sesgo que corrigió
 * el review — con la granularidad por defecto ('mes'), el 3 de julio a las
 * 11 el período actual lleva 2 días y medio. Cualquier test que compare
 * contra el período anterior tiene que demostrar que la comparación es
 * contra el TRAMO equivalente del mes anterior, no contra el mes anterior
 * completo (ver `Reportes - período en curso` más abajo).
 */
const AHORA = new Date(2026, 6, 3, 11, 0, 0);

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/reportes']}>
      <ProveedorHeader>
        <Reportes />
      </ProveedorHeader>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  mocks.useOnlineStatus.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('Reportes - estados', () => {
  it('cargando: muestra el mensaje de carga', () => {
    configurarVentas({ datos: [], cargando: true, error: null });

    renderizar();

    expect(screen.getByText('Cargando reportes…')).toBeTruthy();
  });

  it('error: muestra mensaje y botón Reintentar', () => {
    const error = { code: 'unavailable' } as FirestoreError;
    configurarVentas({ datos: [], cargando: false, error });

    renderizar();

    expect(
      screen.getByText('No se pudieron cargar los reportes. Revisá tu conexión e intentá de nuevo.'),
    ).toBeTruthy();
    const boton = screen.getByRole('button', { name: 'Reintentar' });
    expect(() => fireEvent.click(boton)).not.toThrow();
  });

  it('vacío: "Todavía no hay ventas en este período." cuando no hay ventas', () => {
    configurarVentas(estadoOk([]));

    renderizar();

    expect(screen.getByText('Todavía no hay ventas en este período.')).toBeTruthy();
  });
});

describe('Reportes - ganancia y comparación (criterio doc 04:478)', () => {
  it('sin período anterior con datos: NO muestra ninguna variación (unión sin-base de VariacionPeriodo)', () => {
    const esteMes = [ventaCon(new Date(2026, 6, 1, 10, 0), [itemConCosto()])];
    configurarVentas(estadoOk(esteMes));

    renderizar();

    // Default 'mes', en curso (ver AHORA): el hero lo dice en su propio título.
    expect(screen.getByText('Ganancia de lo que va del mes')).toBeTruthy();
    expect(screen.getByText('Sin datos del período anterior para comparar')).toBeTruthy();
    // Costo 100% cubierto y sin base de comparación: ningún porcentaje inventado en pantalla.
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('cobertura de costo menor a 100%: se aclara en lenguaje llano junto a la ganancia', () => {
    const esteMes = [ventaCon(new Date(2026, 6, 1, 10, 0), [itemConCosto(), itemSinCosto()])];
    configurarVentas(estadoOk(esteMes));

    renderizar();

    expect(screen.getByText('Ganancia calculada sobre el 50% de lo vendido.')).toBeTruthy();
  });
});

describe('Reportes - período en curso (corrección post-review: nunca en curso vs. completo)', () => {
  it(
    'día 3 del mes: compara contra el MISMO TRAMO del mes anterior, no contra el mes anterior completo ' +
      '(con la implementación anterior a la corrección esto daría ~-44%, una caída falsa)',
    () => {
      // Julio (mes en curso, AHORA = 03/07 11:00): 5 ventas entre el 1 y el 3
      // a la mañana, ganancia 4000 c/u = 20000 total.
      const julioEnCurso = [
        ventaCon(new Date(2026, 6, 1, 8, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 6, 1, 20, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 6, 2, 8, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 6, 2, 20, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 6, 3, 8, 0), [itemConCosto()]), // antes de las 11:00 (AHORA)
      ];
      // Junio, MISMO tramo (1º al 3 antes de las 11:00): mismo patrón, misma
      // ganancia total (20000) — la comparación honesta debería dar ~0%.
      const junioMismoTramo = [
        ventaCon(new Date(2026, 5, 1, 8, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 5, 1, 20, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 5, 2, 8, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 5, 2, 20, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 5, 3, 8, 0), [itemConCosto()]), // antes de las 11:00 del 3/6
      ];
      // Resto de junio (del 3 a las 11:00 en adelante): NO existía en julio
      // todavía, así que NO puede entrar en la comparación. Con el mes
      // anterior COMPLETO (bug original) esto sumaría 16000 más de ganancia
      // al período anterior (36000 en vez de 20000) y la variación pasaría
      // de ~0% a real ≈ (20000-36000)*10000/36000 ≈ -4444 bps ≈ -44% —
      // exactamente la caída falsa que este test tiene que demostrar que NO
      // ocurre.
      const junioFueraDelTramo = [
        ventaCon(new Date(2026, 5, 10, 8, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 5, 15, 8, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 5, 20, 8, 0), [itemConCosto()]),
        ventaCon(new Date(2026, 5, 25, 8, 0), [itemConCosto()]),
      ];
      configurarVentas(estadoOk([...julioEnCurso, ...junioMismoTramo, ...junioFueraDelTramo]));

      renderizar();

      // El título dice que es parcial, no el mes entero — Adrián no tiene
      // que preguntarle a nadie qué está mirando.
      expect(screen.getByText('Ganancia de lo que va del mes')).toBeTruthy();
      expect(screen.getByText('$ 200,00')).toBeTruthy(); // 5 × 4000 = 20.000 centésimos
      // La comparación honesta: 20.000 vs. 20.000 (el mismo tramo) = 0%,
      // NUNCA el ~-44% que daría comparar contra junio completo.
      expect(screen.getByText('0% vs. el mismo tramo del mes anterior')).toBeTruthy();
      expect(screen.queryByText(/-44/)).toBeNull();
      expect(screen.getByText('Vendido')).toBeTruthy();
      expect(screen.getByText('$ 500,00')).toBeTruthy(); // 5 × 10.000 vendido
      expect(screen.getByText('5 ventas')).toBeTruthy();
    },
  );

  it('la corrección generaliza a otra granularidad: semana en curso también titula "lo que va de"', () => {
    // No repite el escenario del test de arriba (eso ya demuestra el
    // número): solo confirma que 'semana' pasa por el mismo camino que
    // 'mes' (`periodoEnCurso`/`tituloGanancia` son genéricos en
    // `Granularidad`, no un caso especial de "mes").
    const estaSemana = [ventaCon(new Date(2026, 6, 1, 8, 0), [itemConCosto()])];
    configurarVentas(estadoOk(estaSemana));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));

    expect(screen.getByText('Ganancia de lo que va de la semana')).toBeTruthy();
  });
});

describe('Reportes - offline', () => {
  it('sin conexión: muestra el aviso local específico de Reportes', () => {
    mocks.useOnlineStatus.mockReturnValue(false);
    configurarVentas(estadoOk([]));

    renderizar();

    expect(
      screen.getByText(/Sin conexión: se calcula con lo guardado en este dispositivo\./),
    ).toBeTruthy();
  });

  it('en línea: no muestra el aviso de conexión', () => {
    configurarVentas(estadoOk([]));

    renderizar();

    expect(screen.queryByText(/Sin conexión/)).toBeNull();
  });
});

describe('Reportes - selector de período', () => {
  it('arranca en "Mes" (doc 04:478 nombra el mes; ver justificación en Reportes.tsx) y cambia al tocar otra opción', () => {
    configurarVentas(estadoOk([]));

    renderizar();

    const dia = screen.getByRole('button', { name: 'Día' });
    const mes = screen.getByRole('button', { name: 'Mes' });
    expect(mes.getAttribute('aria-pressed')).toBe('true');
    expect(dia.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(dia);

    expect(dia.getAttribute('aria-pressed')).toBe('true');
    expect(mes.getAttribute('aria-pressed')).toBe('false');
  });
});

// UI-4c (docs/06-ui-ux.md §2): el swipe usa la MISMA detección de gesto que
// Stock (`useSwipeHorizontal`, `@gestion/ui`) — acá solo se verifica que la
// traducción a "período siguiente/anterior" (`useSwipePeriodo`) queda bien
// cableada a esta pantalla, no se reexplican umbral/dominancia/exclusión
// (eso ya lo cubren `useSwipeHorizontal.test.tsx` y `useSwipePeriodo.test.tsx`).
function swipe(
  contenedor: HTMLElement,
  origen: { x: number; y: number },
  destino: { x: number; y: number },
  nace: HTMLElement = contenedor,
) {
  fireEvent.touchStart(nace, { touches: [{ clientX: origen.x, clientY: origen.y }] });
  fireEvent.touchEnd(contenedor, { changedTouches: [{ clientX: destino.x, clientY: destino.y }] });
}

describe('Reportes - swipe de período (mismo gesto que Stock, UI-4c)', () => {
  it('el contenedor lleva la altura mínima que estira el área de swipe al viewport completo (UI-4d)', () => {
    configurarVentas(estadoOk([]));

    renderizar();

    const layout = screen.getByTestId('layout-reportes');
    expect(layout.className).toContain(
      'min-h-[calc(100dvh-var(--altura-header)-var(--altura-zona-inferior)',
    );
  });

  it('swipe hacia la izquierda avanza de Día a Semana', () => {
    configurarVentas(estadoOk([]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Día' }));

    const layout = screen.getByTestId('layout-reportes');
    swipe(layout, { x: 300, y: 100 }, { x: 200, y: 100 }); // dx = -100

    const semana = screen.getByRole('button', { name: 'Semana' });
    expect(semana.getAttribute('aria-pressed')).toBe('true');
  });

  it('swipe hacia la derecha retrocede de Semana a Día', () => {
    configurarVentas(estadoOk([]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));

    const layout = screen.getByTestId('layout-reportes');
    swipe(layout, { x: 100, y: 100 }, { x: 220, y: 100 }); // dx = +120

    const dia = screen.getByRole('button', { name: 'Día' });
    expect(dia.getAttribute('aria-pressed')).toBe('true');
  });

  it('en el último período (Mes, el default), swipe hacia la izquierda no hace nada (sin wrap-around)', () => {
    configurarVentas(estadoOk([]));

    renderizar();

    const layout = screen.getByTestId('layout-reportes');
    swipe(layout, { x: 300, y: 100 }, { x: 200, y: 100 });

    const mes = screen.getByRole('button', { name: 'Mes' });
    expect(mes.getAttribute('aria-pressed')).toBe('true');
  });

  it('en el primer período (Día), swipe hacia la derecha no hace nada (sin wrap-around)', () => {
    configurarVentas(estadoOk([]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Día' }));

    const layout = screen.getByTestId('layout-reportes');
    swipe(layout, { x: 100, y: 100 }, { x: 220, y: 100 });

    const dia = screen.getByRole('button', { name: 'Día' });
    expect(dia.getAttribute('aria-pressed')).toBe('true');
  });

  it('un gesto vertical dominante no cambia el período', () => {
    configurarVentas(estadoOk([]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Día' }));

    const layout = screen.getByTestId('layout-reportes');
    swipe(layout, { x: 200, y: 100 }, { x: 260, y: 260 }); // dx = 60, dy = 160

    const dia = screen.getByRole('button', { name: 'Día' });
    expect(dia.getAttribute('aria-pressed')).toBe('true');
  });

  it('un gesto que nace en el GrupoSegmentado (con scroll horizontal propio) no cambia el período', () => {
    configurarVentas(estadoOk([]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Día' }));

    const selector = screen.getByRole('group', { name: 'Período del reporte' });
    // jsdom no calcula layout real: se simula que el selector tiene scroll
    // horizontal propio (mismo criterio que `useSwipeHorizontal.test.tsx`) —
    // hace falta tanto el par scrollWidth/clientWidth como el `overflowX`
    // computado, que el hook exige en conjunto para excluir el gesto.
    selector.style.overflowX = 'auto';
    Object.defineProperty(selector, 'scrollWidth', { value: 600, configurable: true });
    Object.defineProperty(selector, 'clientWidth', { value: 300, configurable: true });

    const layout = screen.getByTestId('layout-reportes');
    swipe(layout, { x: 300, y: 100 }, { x: 200, y: 100 }, selector);

    const dia = screen.getByRole('button', { name: 'Día' });
    expect(dia.getAttribute('aria-pressed')).toBe('true');
  });

  it('cambiar el período con swipe actualiza el link de "Para mirar" con replace (misma URL que el selector visible)', () => {
    configurarVentas(estadoOk([]));

    renderizar();

    const layout = screen.getByTestId('layout-reportes');
    swipe(layout, { x: 100, y: 100 }, { x: 220, y: 100 }); // derecha: Mes -> Semana

    const link = screen.getByRole('link', { name: /Rentabilidad por producto y categoría/ });
    expect(link.getAttribute('href')).toBe('/reportes/rentabilidad?periodo=semana');
  });
});

describe('Reportes - "Para mirar" reenvía el período al drill-down (tarea B2)', () => {
  it('sin tocar el selector, el link no lleva query (el default "mes" es implícito en las DOS pantallas por igual)', () => {
    configurarVentas(estadoOk([]));

    renderizar();

    // No hace falta escribir el default a la URL: `granularidadDesdeParam`
    // resuelve 'mes' en la home y en el drill-down con el MISMO fallback, así
    // que un link sin `?periodo=` sigue siendo el período correcto de
    // cualquier lado. Ver el siguiente test para el caso que sí importa: el
    // usuario ELIGIÓ un período distinto del default.
    const link = screen.getByRole('link', { name: /Rentabilidad por producto y categoría/ });
    expect(link.getAttribute('href')).toBe('/reportes/rentabilidad');
  });

  it('cambiar el período en la home actualiza el link SIN que la tarea B2 haya tocado registro.ts', () => {
    configurarVentas(estadoOk([]));

    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Semana' }));

    const link = screen.getByRole('link', { name: /Rentabilidad por producto y categoría/ });
    expect(link.getAttribute('href')).toBe('/reportes/rentabilidad?periodo=semana');
  });
});
