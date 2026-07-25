import { describe, expect, it } from 'vitest';
import {
  calcularCostoRealCents,
  calcularCostoRealKgCents,
  clasificarCosteo,
  clasificarInactividad,
  normalizarTelefono,
  sumarMoney,
} from '@gestion/core';
import {
  construirDatosDemo,
  construirDatosReportes,
  PREFIJO_DEMO,
  PRODUCTOS_REPORTES,
  statsDesdeVentas,
} from './generador.mjs';

// `ahora` fijo: el generador es puro (recibe la fecha, nunca lee el reloj), así
// que estos tests son 100% deterministas sin importar cuándo corra la suite.
const AHORA = new Date('2026-07-12T15:00:00.000Z');

// Resultado esperado de `clasificarInactividad` para cada uno de los 6 clientes
// de demo (WA-D), en el mismo orden en que los arma `construirDatosDemo`. Ver
// el doc de la tarea: 1 activo, 2 inactivo por ritmo, 3 inactivo por umbral
// global, 4 activo (nuevo), 5 activo (sin teléfono), 6 activo (teléfono no
// normalizable).
const INACTIVO_ESPERADO = [false, true, true, false, false, false];

describe('construirDatosDemo', () => {
  const { clientes, ventas } = construirDatosDemo(AHORA);

  it('crea exactamente 6 clientes, todos con id prefijado demo-', () => {
    expect(clientes).toHaveLength(6);
    for (const cliente of clientes) {
      expect(cliente.id.startsWith(PREFIJO_DEMO)).toBe(true);
    }
  });

  it('todas las ventas están prefijadas demo- y asociadas a un cliente demo', () => {
    expect(ventas.length).toBeGreaterThan(0);
    const idsClientes = new Set(clientes.map((c) => c.id));
    for (const venta of ventas) {
      expect(venta.id.startsWith(PREFIJO_DEMO)).toBe(true);
      expect(venta.estado).toBe('completada');
      expect(idsClientes.has(venta.clienteId)).toBe(true);
    }
  });

  it('cada venta tiene totalCents igual a la suma de subtotales de sus ítems', () => {
    for (const venta of ventas) {
      const suma = sumarMoney(...venta.items.map((item) => item.subtotalCents));
      expect(venta.totalCents).toBe(suma);
    }
  });

  it('los ids de cliente e ids de venta son todos únicos', () => {
    expect(new Set(clientes.map((c) => c.id)).size).toBe(clientes.length);
    expect(new Set(ventas.map((v) => v.id)).size).toBe(ventas.length);
  });

  // Hallazgo del review de WA-D (WA-F3): `numero` NO puede ser `fecha.getTime()`
  // (mostraría "Venta #1752332400000" en el historial frente al dueño durante la
  // demo). Debe ser un correlativo chico, GLOBAL a los 6 clientes, 1..N, creciendo
  // con la fecha — ver el comentario grande sobre `numero` en `generador.mjs`.
  describe('numero de venta: correlativo chico, global y cronológico (WA-F3)', () => {
    it('es 1..N sin huecos ni repetidos, N = cantidad total de ventas', () => {
      const numeros = ventas.map((v) => v.numero).sort((a, b) => a - b);
      expect(numeros).toEqual(Array.from({ length: ventas.length }, (_, i) => i + 1));
    });

    it('el array `ventas` devuelto ya viene ordenado cronológicamente por fecha', () => {
      for (let i = 1; i < ventas.length; i++) {
        expect(ventas[i].fecha.getTime()).toBeGreaterThanOrEqual(ventas[i - 1].fecha.getTime());
      }
    });

    it('numero crece estrictamente junto con la posición cronológica (numero == índice + 1)', () => {
      ventas.forEach((venta, indice) => {
        expect(venta.numero).toBe(indice + 1);
      });
    });

    it('la venta más vieja de TODOS los clientes es numero 1 y la más nueva es numero N (rango global, no por cliente)', () => {
      const masVieja = ventas.reduce((a, b) => (a.fecha.getTime() <= b.fecha.getTime() ? a : b));
      const masNueva = ventas.reduce((a, b) => (a.fecha.getTime() >= b.fecha.getTime() ? a : b));
      expect(masVieja.numero).toBe(1);
      expect(masNueva.numero).toBe(ventas.length);
      // La más vieja (cliente 3, ~70 días) y la más nueva (cliente 5, ~2 días) son
      // de DISTINTOS clientes: si `numero` se reiniciara por cliente, ninguna de
      // las dos aserciones de arriba se cumpliría a la vez.
      expect(masVieja.clienteId).not.toBe(masNueva.clienteId);
    });
  });

  it.each(clientes.map((cliente, indice) => [indice, cliente]))(
    'cliente %i: stats coherentes con sus propias ventas (cantidad, total, primera/última compra)',
    (_indice, cliente) => {
      const propias = ventas.filter((v) => v.clienteId === cliente.id);
      const statsRecalculadas = statsDesdeVentas(propias);
      expect(cliente.stats).toEqual(statsRecalculadas);
      expect(cliente.stats.cantidadVentas).toBe(propias.length);
    },
  );

  it.each(clientes.map((cliente, indice) => [indice, cliente]))(
    'cliente %i: clasificarInactividad(defaults) da el resultado esperado por la spec de WA-D',
    (indice, cliente) => {
      const resultado = clasificarInactividad(cliente.stats, AHORA);
      expect(resultado.inactivo).toBe(INACTIVO_ESPERADO[indice]);
    },
  );

  it('cliente 2 (inactivo por ritmo propio) tiene más total histórico que el cliente 3 (inactivo por umbral): lidera la lista de inactivos', () => {
    const [, c2, c3] = clientes;
    expect(c2.stats.totalHistoricoCents).toBeGreaterThan(c3.stats.totalHistoricoCents);
  });

  it('cliente 1 (frecuente activo) tiene ritmo propio ~7 días y última compra reciente', () => {
    const [c1] = clientes;
    const resultado = clasificarInactividad(c1.stats, AHORA);
    expect(resultado.promedioDiasEntreCompras).toBeCloseTo(7, 1);
    expect(resultado.diasSinVenir).toBeLessThanOrEqual(5);
  });

  it('cliente 3 (ocasional) tiene menos de 3 compras: la clasificación usa el umbral global, no ritmo propio', () => {
    const [, , c3] = clientes;
    const resultado = clasificarInactividad(c3.stats, AHORA);
    expect(resultado.promedioDiasEntreCompras).toBeUndefined();
    expect(c3.stats.cantidadVentas).toBeLessThan(3);
  });

  it('cliente 5: sin campo telefono (no solo vacío) → sin telefonoE164', () => {
    const c5 = clientes[4];
    expect(Object.hasOwn(c5, 'telefono')).toBe(false);
    expect(Object.hasOwn(c5, 'telefonoE164')).toBe(false);
  });

  it('cliente 6: teléfono no normalizable → tiene telefono display pero no telefonoE164', () => {
    const c6 = clientes[5];
    expect(c6.telefono).toBe('consultar en mostrador');
    expect(Object.hasOwn(c6, 'telefonoE164')).toBe(false);
    expect(normalizarTelefono(c6.telefono)).toBeNull();
  });

  it.each(
    clientes
      .filter((c) => c.telefono !== undefined && c.id !== 'demo-cliente-06-telefono-no-normalizable')
      .map((c) => [c.id, c]),
  )('%s: telefonoE164 coincide con normalizarTelefono(telefono) de @gestion/core', (_id, cliente) => {
    expect(cliente.telefonoE164).toBe(normalizarTelefono(cliente.telefono));
  });

  it('es determinista: dos llamadas con el mismo `ahora` producen el mismo dataset', () => {
    const otra = construirDatosDemo(AHORA);
    expect(otra).toEqual({ clientes, ventas });
  });

  it('las fechas son relativas a `ahora`: correr con otro `ahora` desplaza las fechas pero conserva la clasificación', () => {
    const otroAhora = new Date(AHORA.getTime() + 10 * 86_400_000); // +10 días
    const otro = construirDatosDemo(otroAhora);
    for (const [indice, cliente] of otro.clientes.entries()) {
      const resultado = clasificarInactividad(cliente.stats, otroAhora);
      expect(resultado.inactivo).toBe(INACTIVO_ESPERADO[indice]);
    }
    // Las fechas absolutas sí cambiaron (no quedaron ancladas al primer `ahora`).
    expect(otro.clientes[0].stats.ultimaCompra).not.toEqual(clientes[0].stats.ultimaCompra);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// construirDatosReportes (Fase 3): catálogo, compras con costo real, ventas con
// costeo congelado, ajustes/merma y una anulación.
// ════════════════════════════════════════════════════════════════════════════

const AHORA_REPORTES = new Date('2026-07-24T15:00:00.000Z');
const datosReportes = construirDatosReportes(AHORA_REPORTES);

describe('construirDatosReportes', () => {
  it('es determinista: misma ahora + misma semilla (default) ⇒ mismo dataset', () => {
    const otra = construirDatosReportes(AHORA_REPORTES);
    expect(otra).toEqual(datosReportes);
  });

  it('una semilla distinta cambia la composición de las ventas (no es un valor fijo ignorado)', () => {
    const otra = construirDatosReportes(AHORA_REPORTES, { seed: 7 });
    expect(otra.ventas.length).not.toBe(datosReportes.ventas.length);
  });

  it('todos los ids (de todas las colecciones) son únicos; los no-categorías llevan prefijo demo-', () => {
    const conPrefijo = [
      ...datosReportes.proveedores,
      ...datosReportes.productos,
      ...datosReportes.piezas,
      ...datosReportes.compras,
      ...datosReportes.movimientos,
      ...datosReportes.ventas,
      ...datosReportes.clientes,
    ];
    const todos = [...datosReportes.categorias, ...conPrefijo];
    const ids = new Set();
    for (const o of conPrefijo) {
      expect(o.id.startsWith(PREFIJO_DEMO)).toBe(true);
    }
    for (const o of todos) {
      expect(ids.has(o.id)).toBe(false);
      ids.add(o.id);
    }
    expect(ids.size).toBe(todos.length);
  });

  it('cubre los 4 modoStock del dominio', () => {
    const modos = new Set(datosReportes.productos.map((p) => p.modoStock));
    expect(modos).toEqual(new Set(['fraccionado_por_pieza', 'pieza_entera', 'granel', 'unidad_simple']));
  });

  describe('casos borde de UI (pedidos por la tarea)', () => {
    it('hay un producto con nombre largo', () => {
      const def = PRODUCTOS_REPORTES.find((p) => p.casoBorde === 'nombre-largo');
      expect(def).toBeDefined();
      expect(def.nombre.length).toBeGreaterThan(40);
    });

    it('alto volumen / bajo margen: más ítems vendidos que cualquier otro producto, y margen positivo pero chico', () => {
      const def = PRODUCTOS_REPORTES.find((p) => p.casoBorde === 'alto-volumen-bajo-margen');
      const producto = datosReportes.productos.find((p) => p.nombre === def.nombre);
      const cantidadItems = datosReportes.ventas.flatMap((v) => v.items).filter((i) => i.productoId === producto.id).length;
      const otrosConteos = PRODUCTOS_REPORTES.filter((p) => p.slug !== def.slug).map((p) => {
        const otro = datosReportes.productos.find((x) => x.nombre === p.nombre);
        return datosReportes.ventas.flatMap((v) => v.items).filter((i) => i.productoId === otro.id).length;
      });
      expect(cantidadItems).toBeGreaterThan(Math.max(...otrosConteos));

      const margenBps = ((producto.precioVentaCents - producto.costoPromedioCents) / producto.precioVentaCents) * 10000;
      expect(margenBps).toBeGreaterThan(0);
      expect(margenBps).toBeLessThan(1500); // < 15%: "bajo margen"
    });

    it('bajo volumen / alto margen: entre los menos vendidos, y margen holgado', () => {
      const def = PRODUCTOS_REPORTES.find((p) => p.casoBorde === 'bajo-volumen-alto-margen');
      const producto = datosReportes.productos.find((p) => p.nombre === def.nombre);
      const cantidadItems = datosReportes.ventas.flatMap((v) => v.items).filter((i) => i.productoId === producto.id).length;
      const conteos = PRODUCTOS_REPORTES.map((p) => {
        const otro = datosReportes.productos.find((x) => x.nombre === p.nombre);
        return datosReportes.ventas.flatMap((v) => v.items).filter((i) => i.productoId === otro.id).length;
      });
      expect(cantidadItems).toBeLessThanOrEqual(Math.min(...conteos.filter((n) => n > 0)) + 5);

      const margenBps = ((producto.precioVentaCents - producto.costoPromedioCents) / producto.precioVentaCents) * 10000;
      expect(margenBps).toBeGreaterThan(4000); // > 40%: "alto margen"
    });

    it('Orégano nunca aparece en ninguna compra y queda sin costo conocido (costoPromedioCents 0)', () => {
      const def = PRODUCTOS_REPORTES.find((p) => p.casoBorde === 'sin-costo-conocido');
      const producto = datosReportes.productos.find((p) => p.nombre === def.nombre);
      expect(producto.costoPromedioCents).toBe(0);
      for (const compra of datosReportes.compras) {
        expect(compra.items.some((i) => i.productoId === producto.id)).toBe(false);
      }
      // Pero SÍ tiene stock (entró por ajuste manual, no por Compras).
      expect(producto.stockGranelGramos).toBeGreaterThan(0);
    });
  });

  describe('invariantes de negocio', () => {
    it('ninguna cantidad de stock (producto ni pieza) queda negativa en ningún momento observable (estado final)', () => {
      for (const p of datosReportes.productos) {
        if (p.stockGranelGramos !== undefined) expect(p.stockGranelGramos).toBeGreaterThanOrEqual(0);
        if (p.stockUnidades !== undefined) expect(p.stockUnidades).toBeGreaterThanOrEqual(0);
      }
      for (const pz of datosReportes.piezas) {
        expect(pz.pesoRestanteGramos).toBeGreaterThanOrEqual(0);
        expect(pz.pesoRestanteGramos).toBeLessThanOrEqual(pz.pesoInicialGramos);
      }
    });

    it('cada venta tiene totalCents igual a la suma de subtotales de sus ítems', () => {
      for (const venta of datosReportes.ventas) {
        const suma = sumarMoney(...venta.items.map((i) => i.subtotalCents));
        expect(venta.totalCents).toBe(suma);
      }
    });

    it('cada compra: factura, gastos, prorrateo y costo real cierran exactamente (recalculado con @gestion/core)', () => {
      for (const compra of datosReportes.compras) {
        expect(sumarMoney(...compra.items.map((i) => i.costoFacturaCents))).toBe(compra.totalFacturaCents);
        expect(sumarMoney(...compra.gastos.map((g) => g.montoCents))).toBe(compra.totalGastosCents);
        expect(sumarMoney(...compra.items.map((i) => i.gastoProrrateadoCents))).toBe(compra.totalGastosCents);
        expect(sumarMoney(compra.totalFacturaCents, compra.totalGastosCents)).toBe(compra.totalRealCents);
        for (const item of compra.items) {
          expect(calcularCostoRealCents(item.costoFacturaCents, item.gastoProrrateadoCents)).toBe(
            item.costoRealCents,
          );
          if (item.gramos !== undefined) {
            expect(calcularCostoRealKgCents(item.costoRealCents, item.gramos)).toBe(item.costoRealKgCents);
          } else {
            expect(item.costoRealKgCents).toBeUndefined();
          }
        }
      }
    });

    it('todo ítem de venta clasifica como real o sin_dato (nunca legado): todas nacen con costeo v1', () => {
      for (const venta of datosReportes.ventas) {
        for (const item of venta.items) {
          expect(['real', 'sin_dato']).toContain(clasificarCosteo(item));
        }
      }
    });

    it('hay al menos una venta anulada', () => {
      const anuladas = datosReportes.ventas.filter((v) => v.estado === 'anulada');
      expect(anuladas.length).toBeGreaterThanOrEqual(1);
    });

    it('el rango de fechas de las ventas cubre varios meses (para comparar mes vs. mes anterior)', () => {
      const fechas = datosReportes.ventas.map((v) => v.fecha.getTime());
      const rangoDias = (Math.max(...fechas) - Math.min(...fechas)) / 86_400_000;
      expect(rangoDias).toBeGreaterThan(90);
    });

    it('hay muchas ventas (para ejercitar la UI con volumen real, no un puñado)', () => {
      expect(datosReportes.ventas.length).toBeGreaterThan(100);
    });

    it('la mayoría de las ventas son anónimas (sin cliente); algunas sí lo tienen', () => {
      const conCliente = datosReportes.ventas.filter((v) => v.clienteId !== undefined);
      expect(conCliente.length).toBeGreaterThan(0);
      expect(conCliente.length).toBeLessThan(datosReportes.ventas.length / 2);
    });

    it('los 2 clientes de reportes tienen stats coherentes con sus propias ventas', () => {
      expect(datosReportes.clientes).toHaveLength(2);
      for (const cliente of datosReportes.clientes) {
        const propias = datosReportes.ventas.filter((v) => v.clienteId === cliente.id);
        expect(cliente.stats).toEqual(statsDesdeVentas(propias));
        expect(propias.length).toBeGreaterThan(0);
      }
    });

    it('hay movimientos de merma y de ajuste (positivo y negativo)', () => {
      const tipos = new Set(datosReportes.movimientos.map((m) => m.tipo));
      expect(tipos.has('merma')).toBe(true);
      expect(tipos.has('ajuste_positivo')).toBe(true);
      expect(tipos.has('ajuste_negativo')).toBe(true);
      expect(tipos.has('ingreso_compra')).toBe(true);
      expect(tipos.has('venta')).toBe(true);
      expect(tipos.has('devolucion')).toBe(true);
    });

    it('la venta anulada tiene su devolución (movimiento) con el mismo delta invertido', () => {
      const anulada = datosReportes.ventas.find((v) => v.estado === 'anulada');
      const devolucion = datosReportes.movimientos.find(
        (m) => m.tipo === 'devolucion' && m.origenId === anulada.id,
      );
      expect(devolucion).toBeDefined();
      expect(devolucion.deltaGramos).toBe(anulada.items[0].gramos);
    });
  });
});
