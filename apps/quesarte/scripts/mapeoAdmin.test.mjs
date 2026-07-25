import { describe, expect, it } from 'vitest';
import {
  categoriaConverter,
  clienteConverter,
  compraConverter,
  movimientoConverter,
  piezaConverter,
  productoConverter,
  proveedorConverter,
  ventaConverter,
} from '@gestion/firebase-kit';
import { claveCategoria } from '@gestion/core';
import { construirDatosDemo, construirDatosReportes } from './generador.mjs';
import {
  categoriaADoc,
  clienteADoc,
  compraADoc,
  movimientoADoc,
  piezaADoc,
  productoADoc,
  proveedorADoc,
  ventaADoc,
} from './mapeoAdmin.mjs';

// Estos tests son la red de seguridad contra el drift entre `mapeoAdmin.mjs`
// (duplicado a mano para el SDK admin) y los converters REALES del kit (SDK
// cliente, `@gestion/firebase-kit`). Corren en jsdom (config por defecto de esta
// app), donde importar `firebase/firestore` es seguro (igual que el resto de los
// tests de `src/`); `seed-demo.mjs` en cambio corre con `firebase-admin` y nunca
// importa los converters del kit (ver comentario en `mapeoAdmin.mjs`).
//
// `xxxConverter.toFirestore()` es una función pura (no toca red ni requiere una
// app de Firebase inicializada): se puede invocar directo sobre un objeto de
// dominio y comparar la salida.

const AHORA = new Date('2026-07-12T15:00:00.000Z');
const { clientes, ventas } = construirDatosDemo(AHORA);

describe('mapeoAdmin vs. converters reales de @gestion/firebase-kit (WA-D)', () => {
  it.each(clientes.map((c) => [c.id, c]))(
    'clienteADoc(%s) coincide byte a byte con clienteConverter.toFirestore()',
    (_id, cliente) => {
      expect(clienteADoc(cliente)).toEqual(clienteConverter.toFirestore(cliente));
    },
  );

  it.each(ventas.map((v) => [v.id, v]))(
    'ventaADoc(%s) coincide byte a byte con ventaConverter.toFirestore()',
    (_id, venta) => {
      expect(ventaADoc(venta)).toEqual(ventaConverter.toFirestore(venta));
    },
  );
});

// ── Reportes (Fase 3): mismo criterio, extendido a las entidades nuevas ─────
// (incluido `costeo` embebido en los ítems de venta, ver `itemADoc` de
// `mapeoAdmin.mjs` — el punto crítico: si el converter real cambia la forma del
// congelado y el espejo no se actualiza, este test rompe).

const datosReportes = construirDatosReportes(AHORA);

describe('mapeoAdmin vs. converters reales de @gestion/firebase-kit (Reportes)', () => {
  it.each(datosReportes.categorias.map((c) => [c.id, c]))(
    'categoriaADoc(%s) coincide byte a byte con categoriaConverter.toFirestore()',
    (_id, categoria) => {
      expect(categoriaADoc(categoria)).toEqual(categoriaConverter.toFirestore(categoria));
    },
  );

  it.each(datosReportes.proveedores.map((p) => [p.id, p]))(
    'proveedorADoc(%s) coincide byte a byte con proveedorConverter.toFirestore()',
    (_id, proveedor) => {
      expect(proveedorADoc(proveedor)).toEqual(proveedorConverter.toFirestore(proveedor));
    },
  );

  it.each(datosReportes.productos.map((p) => [p.id, p]))(
    'productoADoc(%s) coincide byte a byte con productoConverter.toFirestore()',
    (_id, producto) => {
      expect(productoADoc(producto)).toEqual(productoConverter.toFirestore(producto));
    },
  );

  it.each(datosReportes.piezas.map((p) => [p.id, p]))(
    'piezaADoc(%s) coincide byte a byte con piezaConverter.toFirestore()',
    (_id, pieza) => {
      expect(piezaADoc(pieza)).toEqual(piezaConverter.toFirestore(pieza));
    },
  );

  it.each(datosReportes.compras.map((c) => [c.id, c]))(
    'compraADoc(%s) coincide byte a byte con compraConverter.toFirestore()',
    (_id, compra) => {
      expect(compraADoc(compra)).toEqual(compraConverter.toFirestore(compra));
    },
  );

  it.each(datosReportes.movimientos.map((m) => [m.id, m]))(
    'movimientoADoc(%s) coincide byte a byte con movimientoConverter.toFirestore()',
    (_id, movimiento) => {
      expect(movimientoADoc(movimiento)).toEqual(movimientoConverter.toFirestore(movimiento));
    },
  );

  it.each(datosReportes.clientes.map((c) => [c.id, c]))(
    'clienteADoc(%s) coincide byte a byte con clienteConverter.toFirestore() (clientes de Reportes)',
    (_id, cliente) => {
      expect(clienteADoc(cliente)).toEqual(clienteConverter.toFirestore(cliente));
    },
  );

  it.each(datosReportes.ventas.map((v) => [v.id, v]))(
    'ventaADoc(%s) coincide byte a byte con ventaConverter.toFirestore() (incluye costeo)',
    (_id, venta) => {
      expect(ventaADoc(venta)).toEqual(ventaConverter.toFirestore(venta));
    },
  );

  it('al menos un ítem de venta trae costeo con montos (fuente pieza o promedio)', () => {
    const conMontos = datosReportes.ventas
      .flatMap((v) => v.items)
      .filter((i) => i.costeo?.costoItemCents !== undefined);
    expect(conMontos.length).toBeGreaterThan(0);
  });

  it('los ítems de Orégano (sin costo conocido) tienen costeo fuente sin_costo, sin montos', () => {
    const oreganoId = datosReportes.productos.find((p) => p.nombre === 'Orégano').id;
    const itemsOregano = datosReportes.ventas.flatMap((v) => v.items).filter((i) => i.productoId === oreganoId);
    expect(itemsOregano.length).toBeGreaterThan(0);
    for (const item of itemsOregano) {
      expect(item.costeo.fuente).toBe('sin_costo');
      expect(item.costeo.costoItemCents).toBeUndefined();
      expect(item.costeo.costoUnitCents).toBeUndefined();
    }
  });

  it('todas las categorías del seed tienen id === claveCategoria(nombre)', () => {
    for (const categoria of datosReportes.categorias) {
      expect(categoria.id).toBe(claveCategoria(categoria.nombre));
    }
  });
});
