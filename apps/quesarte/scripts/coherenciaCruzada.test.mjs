import { describe, expect, it } from 'vitest';
import { claveCategoria } from '@gestion/core';
import { construirDatosDemo, construirDatosReportes, statsDesdeVentas } from './generador.mjs';

/**
 * Tests de COHERENCIA CRUZADA sobre el dataset que arma `generador.mjs`.
 *
 * `generador.test.mjs` y `mapeoAdmin.test.mjs` verifican cada documento por
 * separado (byte a byte contra los converters reales, invariantes de un solo
 * documento). Eso NO alcanza: hay invariantes que viven ENTRE documentos, y
 * ningún test de un solo documento puede verlos. El caso real que motivó esta
 * batería: el seed llegó a crear una segunda categoría "Quesos" (mismo nombre,
 * dos documentos) sin que ningún test lo detectara, porque cada documento, por
 * separado, era perfectamente válido (ver `docs/02-dominio-quesarte.md`,
 * sección "Categoría").
 *
 * Todo lo de acá corre 100% en memoria sobre lo que devuelven
 * `construirDatosDemo`/`construirDatosReportes` (el generador puro, sin
 * Firebase): no hay red, no hay emulador.
 *
 * Convención de cada invariante: una función `xxxInvalidos(...)` que NUNCA
 * lanza — devuelve la lista (posiblemente vacía) de violaciones encontradas,
 * cada una con los ids concretos de los documentos involucrados. El `it`
 * afirma que esa lista está vacía, y si no lo está, el mensaje de la aserción
 * (más el diff de Vitest) muestra el/los documento(s) concreto(s) que la
 * violan — nunca solo "falló".
 *
 * Nota sobre el estado del repo al escribir esto: hay otra tarea en curso
 * (migración de ids de `categorias` a su forma canónica, ver
 * `packages/core/src/categoria.ts`) tocando `generador.mjs` en simultáneo.
 * Ninguno de los checks de acá depende de si `categoria.id` lleva el prefijo
 * `demo-` o es la clave canónica: todos comparan por `claveCategoria(nombre)`,
 * no por `id`.
 */

// ── Datasets bajo prueba (una sola construcción, reusada por todos los `it`) ─

const AHORA_DEMO = new Date('2026-07-12T15:00:00.000Z');
const AHORA_REPORTES = new Date('2026-07-24T15:00:00.000Z');

const datosDemo = construirDatosDemo(AHORA_DEMO);
const datosReportes = construirDatosReportes(AHORA_REPORTES);

// ── Helpers genéricos ────────────────────────────────────────────────────────

/** Mapa `id -> documento`, para lookups O(1) en los checks referenciales. */
function porId(items) {
  return new Map(items.map((item) => [item.id, item]));
}

/** Agrupa `items` por `claveFn(item)`; devuelve solo los grupos con 2+ elementos. */
function gruposConDuplicados(items, claveFn) {
  const porClave = new Map();
  for (const item of items) {
    const clave = claveFn(item);
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push(item);
  }
  return [...porClave.entries()].filter(([, grupo]) => grupo.length > 1);
}

/** Mensaje de aserción legible: título + volcado de cada violación concreta. */
function formatearViolaciones(titulo, violaciones) {
  if (violaciones.length === 0) return `${titulo}: sin violaciones`;
  const detalle = violaciones.map((v) => `  - ${JSON.stringify(v)}`).join('\n');
  return `${titulo} — ${violaciones.length} violación(es):\n${detalle}`;
}

/** Azúcar para el patrón repetido `expect(violaciones).toEqual([])` con mensaje. */
function esperarSinViolaciones(titulo, violaciones) {
  expect(violaciones, formatearViolaciones(titulo, violaciones)).toEqual([]);
}

// ── Invariante 1: claves de categoría únicas (EL bug que se nos escapó) ─────

/**
 * Dos categorías con la misma `claveCategoria(nombre)` (trim + lowercase) son,
 * por invariante de dominio, la MISMA categoría (ver docs/02, "Categoría" /
 * `packages/core/src/categoria.ts`). Si el generador arma dos objetos
 * `Categoria` distintos con nombres que colisionan en su clave, el seed
 * duplicaría una categoría — exactamente el bug real que motivó esta batería.
 */
function categoriasClaveDuplicada(categorias) {
  return gruposConDuplicados(categorias, (c) => claveCategoria(c.nombre)).map(([clave, grupo]) => ({
    clave,
    categorias: grupo.map((c) => ({ id: c.id, nombre: c.nombre })),
  }));
}

// ── Invariante 2: producto.categoria referencia una categoría existente ─────

/**
 * Un producto cuya `categoria` (nombre denormalizado) no matchea la clave de
 * NINGUNA categoría del dataset aparece silenciosamente bajo "Sin categoría"
 * en la UI (ver docs/02): no revienta nada, así que ningún test de un solo
 * documento lo detecta.
 */
function productosConCategoriaInexistente(productos, categorias) {
  const clavesValidas = new Set(categorias.map((c) => claveCategoria(c.nombre)));
  return productos
    .filter((p) => !clavesValidas.has(claveCategoria(p.categoria)))
    .map((p) => ({ productoId: p.id, categoria: p.categoria }));
}

// ── Invariante 3: claves de proveedor únicas ────────────────────────────────

/**
 * A diferencia de categoría, NO existe un `claveProveedor` en `@gestion/core`:
 * `crearProveedor` (`packages/firebase-kit/src/proveedores.ts:69`) no aplica
 * ningún chequeo de duplicados, ni siquiera el débil de aplicación. No hay
 * ninguna red de este lado tampoco. La normalización de acá (trim + lowercase)
 * es el mismo criterio mínimo de "mismo nombre" que usa `claveCategoria`, pero
 * es local a este test — no reimplementa una función de dominio inexistente.
 */
function proveedoresNombreDuplicado(proveedores) {
  return gruposConDuplicados(proveedores, (p) => p.nombre.trim().toLowerCase()).map(([clave, grupo]) => ({
    clave,
    proveedores: grupo.map((p) => ({ id: p.id, nombre: p.nombre })),
  }));
}

// ── Invariante 4: clientes.stats coherente con las ventas sembradas ─────────

/**
 * `cliente.stats` es un cache (doc `tipos.ts`, `StatsCliente`): la fuente de
 * verdad son las ventas. Recalculamos con la MISMA `statsDesdeVentas` que usa
 * el generador, sobre las ventas `completada` efectivamente asociadas a ese
 * cliente en el dataset, y comparamos contra lo declarado. Ventas anuladas se
 * excluyen a propósito: en producción una anulación resta de `stats`
 * (`tipos.ts`: "`+1` al vender, `−1` al anular"), así que un cliente cuyas
 * stats sí contaran una venta anulada estaría mal, aunque HOY ningún cliente
 * del dataset tenga una venta anulada propia (ver más abajo).
 */
function clientesStatsDesincronizados(clientes, ventas) {
  const violaciones = [];
  for (const cliente of clientes) {
    const propias = ventas.filter((v) => v.clienteId === cliente.id && v.estado === 'completada');
    if (propias.length === 0) {
      violaciones.push({ clienteId: cliente.id, problema: 'sin ninguna venta completada propia en el dataset' });
      continue;
    }
    const recalculadas = statsDesdeVentas(propias);
    const coincide =
      cliente.stats.cantidadVentas === recalculadas.cantidadVentas &&
      cliente.stats.totalHistoricoCents === recalculadas.totalHistoricoCents &&
      cliente.stats.primeraCompra?.getTime() === recalculadas.primeraCompra.getTime() &&
      cliente.stats.ultimaCompra?.getTime() === recalculadas.ultimaCompra.getTime();
    if (!coincide) {
      violaciones.push({ clienteId: cliente.id, statsDeclarados: cliente.stats, statsRecalculados: recalculadas });
    }
  }
  return violaciones;
}

// ── Invariante 5: integridad referencial general ────────────────────────────

/** producto.proveedorPrincipalId (si está) referencia un proveedor existente. */
function productosConProveedorPrincipalInexistente(productos, proveedoresPorId) {
  return productos
    .filter((p) => p.proveedorPrincipalId !== undefined && !proveedoresPorId.has(p.proveedorPrincipalId))
    .map((p) => ({ productoId: p.id, proveedorPrincipalId: p.proveedorPrincipalId }));
}

/** compra.proveedorId (si está) existe, y `proveedorNombre` denormalizado coincide. */
function comprasConProveedorInvalido(compras, proveedoresPorId) {
  const violaciones = [];
  for (const compra of compras) {
    if (compra.proveedorId === undefined) continue; // opcional por retrocompat (doc 03/07)
    const proveedor = proveedoresPorId.get(compra.proveedorId);
    if (proveedor === undefined) {
      violaciones.push({ compraId: compra.id, proveedorId: compra.proveedorId, problema: 'proveedor inexistente' });
    } else if (proveedor.nombre !== compra.proveedorNombre) {
      violaciones.push({
        compraId: compra.id,
        proveedorId: compra.proveedorId,
        problema: `proveedorNombre desincronizado: compra="${compra.proveedorNombre}" vs. proveedor="${proveedor.nombre}"`,
      });
    }
  }
  return violaciones;
}

/** compra.items[].productoId existe, y `nombreProducto` denormalizado coincide. */
function itemsCompraInvalidos(compras, productosPorId) {
  const violaciones = [];
  for (const compra of compras) {
    for (const item of compra.items) {
      const producto = productosPorId.get(item.productoId);
      if (producto === undefined) {
        violaciones.push({ compraId: compra.id, productoId: item.productoId, problema: 'producto inexistente' });
      } else if (producto.nombre !== item.nombreProducto) {
        violaciones.push({
          compraId: compra.id,
          productoId: item.productoId,
          problema: `nombreProducto desincronizado: item="${item.nombreProducto}" vs. producto="${producto.nombre}"`,
        });
      }
    }
  }
  return violaciones;
}

/** pieza.productoId existe. */
function piezasConProductoInexistente(piezas, productosPorId) {
  return piezas.filter((pz) => !productosPorId.has(pz.productoId)).map((pz) => ({ piezaId: pz.id, productoId: pz.productoId }));
}

/**
 * pieza.compraId (si está) existe, y su `costoKgCents` coincide con el
 * `costoRealKgCents` del ítem de esa compra para el mismo producto (la pieza
 * hereda ese costo al confirmarse la compra, ver docs/03 y `tipos.ts`).
 */
function piezasConCompraOCostoInvalido(piezas, comprasPorId) {
  const violaciones = [];
  for (const pz of piezas) {
    if (pz.compraId === undefined) continue; // pieza cargada manualmente, sin compra de origen
    const compra = comprasPorId.get(pz.compraId);
    if (compra === undefined) {
      violaciones.push({ piezaId: pz.id, compraId: pz.compraId, problema: 'compra inexistente' });
      continue;
    }
    const item = compra.items.find((i) => i.productoId === pz.productoId);
    if (item === undefined) {
      violaciones.push({ piezaId: pz.id, compraId: pz.compraId, problema: 'la compra no tiene ítem de este producto' });
    } else if (item.costoRealKgCents !== pz.costoKgCents) {
      violaciones.push({
        piezaId: pz.id,
        compraId: pz.compraId,
        problema: `costoKgCents desincronizado: pieza=${pz.costoKgCents} vs. ítem de compra=${item.costoRealKgCents}`,
      });
    }
  }
  return violaciones;
}

/** movimiento.productoId existe. */
function movimientosConProductoInexistente(movimientos, productosPorId) {
  return movimientos
    .filter((m) => !productosPorId.has(m.productoId))
    .map((m) => ({ movimientoId: m.id, productoId: m.productoId }));
}

/** movimiento.piezaId (si está) existe, y pertenece al mismo producto que el movimiento. */
function movimientosConPiezaInvalida(movimientos, piezasPorId) {
  const violaciones = [];
  for (const m of movimientos) {
    if (m.piezaId === undefined) continue;
    const pieza = piezasPorId.get(m.piezaId);
    if (pieza === undefined) {
      violaciones.push({ movimientoId: m.id, piezaId: m.piezaId, problema: 'pieza inexistente' });
    } else if (pieza.productoId !== m.productoId) {
      violaciones.push({
        movimientoId: m.id,
        piezaId: m.piezaId,
        problema: `pieza.productoId=${pieza.productoId} no coincide con movimiento.productoId=${m.productoId}`,
      });
    }
  }
  return violaciones;
}

/**
 * movimiento.origenId es coherente con `origenTipo`: si es `compra`/`venta`,
 * el documento origen existe; si es `ajuste`, el movimiento se autoreferencia
 * (mismo criterio de `crearMovimiento` en `generador.mjs`: sin `origenId`
 * explícito, "el movimiento ES el registro").
 */
function movimientosConOrigenInvalido(movimientos, { comprasPorId, ventasPorId }) {
  const violaciones = [];
  for (const m of movimientos) {
    if (m.origenTipo === 'compra' && !comprasPorId.has(m.origenId)) {
      violaciones.push({ movimientoId: m.id, origenId: m.origenId, problema: 'origenTipo=compra sin compra existente' });
    } else if (m.origenTipo === 'venta' && !ventasPorId.has(m.origenId)) {
      violaciones.push({ movimientoId: m.id, origenId: m.origenId, problema: 'origenTipo=venta sin venta existente' });
    } else if (m.origenTipo === 'ajuste' && m.origenId !== m.id) {
      violaciones.push({ movimientoId: m.id, origenId: m.origenId, problema: 'origenTipo=ajuste debería autoreferenciarse' });
    }
  }
  return violaciones;
}

/** venta.items[].productoId existe (nombre denormalizado coincide) y piezaId (si está) existe y es del mismo producto. */
function itemsVentaInvalidos(ventas, productosPorId, piezasPorId) {
  const violaciones = [];
  for (const venta of ventas) {
    for (const item of venta.items) {
      const producto = productosPorId.get(item.productoId);
      if (producto === undefined) {
        violaciones.push({ ventaId: venta.id, productoId: item.productoId, problema: 'producto inexistente' });
      } else if (producto.nombre !== item.nombreProducto) {
        violaciones.push({
          ventaId: venta.id,
          productoId: item.productoId,
          problema: `nombreProducto desincronizado: item="${item.nombreProducto}" vs. producto="${producto.nombre}"`,
        });
      }
      if (item.piezaId === undefined) continue;
      const pieza = piezasPorId.get(item.piezaId);
      if (pieza === undefined) {
        violaciones.push({ ventaId: venta.id, piezaId: item.piezaId, problema: 'pieza inexistente' });
      } else if (pieza.productoId !== item.productoId) {
        violaciones.push({
          ventaId: venta.id,
          piezaId: item.piezaId,
          problema: `pieza.productoId=${pieza.productoId} no coincide con item.productoId=${item.productoId}`,
        });
      }
    }
  }
  return violaciones;
}

/** venta.clienteId (si está) existe, y `clienteNombre` denormalizado coincide. */
function ventasConClienteInvalido(ventas, clientesPorId) {
  const violaciones = [];
  for (const venta of ventas) {
    if (venta.clienteId === undefined) continue; // venta anónima: válida (doc 07)
    const cliente = clientesPorId.get(venta.clienteId);
    if (cliente === undefined) {
      violaciones.push({ ventaId: venta.id, clienteId: venta.clienteId, problema: 'cliente inexistente' });
    } else if (cliente.nombre !== venta.clienteNombre) {
      violaciones.push({
        ventaId: venta.id,
        clienteId: venta.clienteId,
        problema: `clienteNombre desincronizado: venta="${venta.clienteNombre}" vs. cliente="${cliente.nombre}"`,
      });
    }
  }
  return violaciones;
}

// ── Invariante 6: coherencia del costeo congelado ───────────────────────────

/**
 * Reglas duras de `congelarCosteo` (`packages/core/src/costeo.ts`), releídas
 * desde el resultado ya congelado en cada `ItemVenta`:
 * - `fuente: 'pieza'` ⇒ trae `compraId` (copiado de `Pieza.compraId`).
 * - `fuente: 'sin_costo'` ⇒ NUNCA trae montos (`costoUnitCents`/`costoItemCents`).
 * - cualquier otra fuente (`'promedio'`) ⇒ SÍ trae montos.
 * - `compraId` solo puede venir de `fuente: 'pieza'`.
 */
function itemsCosteoIncoherentes(ventas) {
  const violaciones = [];
  for (const venta of ventas) {
    for (const item of venta.items) {
      const costeo = item.costeo;
      if (costeo === undefined) continue; // "versión 0": no aplica, este generador nace todo v1
      const tieneMontos = costeo.costoUnitCents !== undefined && costeo.costoItemCents !== undefined;
      if (costeo.fuente === 'pieza' && costeo.compraId === undefined) {
        violaciones.push({ ventaId: venta.id, productoId: item.productoId, problema: 'fuente=pieza sin compraId' });
      }
      if (costeo.fuente === 'sin_costo' && tieneMontos) {
        violaciones.push({ ventaId: venta.id, productoId: item.productoId, problema: 'fuente=sin_costo con montos' });
      }
      if (costeo.fuente !== 'sin_costo' && !tieneMontos) {
        violaciones.push({ ventaId: venta.id, productoId: item.productoId, problema: `fuente=${costeo.fuente} sin montos` });
      }
      if (costeo.fuente !== 'pieza' && costeo.compraId !== undefined) {
        violaciones.push({
          ventaId: venta.id,
          productoId: item.productoId,
          problema: `compraId presente con fuente=${costeo.fuente} (solo 'pieza' debería traerlo)`,
        });
      }
    }
  }
  return violaciones;
}

// ── Invariantes extra: el estado de stock final debe reconstruirse desde el
// ledger de movimientos (auditoría inmutable). Si un movimiento se pierde o
// un ajuste de stock se hace por fuera del ledger, esto lo detecta aunque
// cada documento, por separado, sea válido. ──────────────────────────────────

/** producto.stockGranelGramos (si aplica) == suma de deltaGramos de sus movimientos. */
function stockGranelDesincronizado(productos, movimientos) {
  const violaciones = [];
  for (const p of productos) {
    if (p.stockGranelGramos === undefined) continue; // no es modoStock 'granel'
    const suma = movimientos
      .filter((m) => m.productoId === p.id && m.deltaGramos !== undefined)
      .reduce((acc, m) => acc + m.deltaGramos, 0);
    if (suma !== p.stockGranelGramos) {
      violaciones.push({ productoId: p.id, stockGranelGramos: p.stockGranelGramos, sumaMovimientos: suma });
    }
  }
  return violaciones;
}

/** producto.stockUnidades (si aplica) == suma de deltaUnidades de sus movimientos. */
function stockUnidadesDesincronizado(productos, movimientos) {
  const violaciones = [];
  for (const p of productos) {
    if (p.stockUnidades === undefined) continue; // no es modoStock 'unidad_simple'
    const suma = movimientos
      .filter((m) => m.productoId === p.id && m.deltaUnidades !== undefined)
      .reduce((acc, m) => acc + m.deltaUnidades, 0);
    if (suma !== p.stockUnidades) {
      violaciones.push({ productoId: p.id, stockUnidades: p.stockUnidades, sumaMovimientos: suma });
    }
  }
  return violaciones;
}

/** pieza.pesoRestanteGramos == suma de deltaGramos de los movimientos de ESA pieza (incluido su ingreso). */
function piezasPesoDesincronizado(piezas, movimientos) {
  const violaciones = [];
  for (const pz of piezas) {
    const suma = movimientos
      .filter((m) => m.piezaId === pz.id && m.deltaGramos !== undefined)
      .reduce((acc, m) => acc + m.deltaGramos, 0);
    if (suma !== pz.pesoRestanteGramos) {
      violaciones.push({ piezaId: pz.id, pesoRestanteGramos: pz.pesoRestanteGramos, sumaMovimientos: suma });
    }
  }
  return violaciones;
}

// ════════════════════════════════════════════════════════════════════════════
// construirDatosReportes: el dataset grande (catálogo + compras + ventas +
// ajustes + movimientos + proveedores + clientes), donde vive la mayoría de
// las relaciones entre documentos.
// ════════════════════════════════════════════════════════════════════════════

describe('construirDatosReportes — coherencia cruzada', () => {
  const { categorias, proveedores, productos, piezas, compras, movimientos, ventas, clientes } = datosReportes;
  const proveedoresPorId = porId(proveedores);
  const productosPorId = porId(productos);
  const piezasPorId = porId(piezas);
  const comprasPorId = porId(compras);
  const ventasPorId = porId(ventas);
  const clientesPorId = porId(clientes);

  describe('unicidad', () => {
    it('ninguna categoría del dataset comparte clave con otra (el bug que se nos escapó)', () => {
      esperarSinViolaciones('Categorías con clave duplicada', categoriasClaveDuplicada(categorias));
    });

    it('ningún proveedor del dataset comparte nombre (normalizado) con otro', () => {
      esperarSinViolaciones('Proveedores con nombre duplicado', proveedoresNombreDuplicado(proveedores));
    });
  });

  describe('integridad referencial', () => {
    it('todo producto.categoria corresponde a una categoría existente del dataset', () => {
      esperarSinViolaciones('Productos con categoría inexistente', productosConCategoriaInexistente(productos, categorias));
    });

    it('todo producto.proveedorPrincipalId (si está) referencia un proveedor existente', () => {
      esperarSinViolaciones(
        'Productos con proveedorPrincipalId inexistente',
        productosConProveedorPrincipalInexistente(productos, proveedoresPorId),
      );
    });

    it('toda compra.proveedorId existe, y proveedorNombre denormalizado coincide', () => {
      esperarSinViolaciones('Compras con proveedor inválido', comprasConProveedorInvalido(compras, proveedoresPorId));
    });

    it('todo ítem de compra referencia un producto existente, y nombreProducto denormalizado coincide', () => {
      esperarSinViolaciones('Ítems de compra inválidos', itemsCompraInvalidos(compras, productosPorId));
    });

    it('toda pieza referencia un producto existente', () => {
      esperarSinViolaciones('Piezas con producto inexistente', piezasConProductoInexistente(piezas, productosPorId));
    });

    it('toda pieza con compraId referencia una compra existente, con costoKgCents coherente con esa compra', () => {
      esperarSinViolaciones('Piezas con compra/costo inválido', piezasConCompraOCostoInvalido(piezas, comprasPorId));
    });

    it('todo movimiento referencia un producto existente', () => {
      esperarSinViolaciones('Movimientos con producto inexistente', movimientosConProductoInexistente(movimientos, productosPorId));
    });

    it('todo movimiento con piezaId referencia una pieza existente del mismo producto', () => {
      esperarSinViolaciones('Movimientos con pieza inválida', movimientosConPiezaInvalida(movimientos, piezasPorId));
    });

    it('todo movimiento.origenId es coherente con su origenTipo (compra/venta existen; ajuste se autoreferencia)', () => {
      esperarSinViolaciones(
        'Movimientos con origen inválido',
        movimientosConOrigenInvalido(movimientos, { comprasPorId, ventasPorId }),
      );
    });

    it('todo ítem de venta referencia un producto existente (nombre denormalizado coincide) y, si tiene pieza, es del mismo producto', () => {
      esperarSinViolaciones('Ítems de venta inválidos', itemsVentaInvalidos(ventas, productosPorId, piezasPorId));
    });

    it('toda venta con clienteId referencia un cliente existente, con clienteNombre denormalizado coherente', () => {
      esperarSinViolaciones('Ventas con cliente inválido', ventasConClienteInvalido(ventas, clientesPorId));
    });
  });

  describe('costeo congelado', () => {
    it('todo ítem de venta con costeo es coherente con las reglas de congelarCosteo (fuente↔compraId↔montos)', () => {
      esperarSinViolaciones('Ítems con costeo incoherente', itemsCosteoIncoherentes(ventas));
    });
  });

  describe('el stock final se reconstruye exactamente desde el ledger de movimientos', () => {
    it('stockGranelGramos de cada producto granel == suma de deltaGramos de sus movimientos', () => {
      esperarSinViolaciones('Stock granel desincronizado', stockGranelDesincronizado(productos, movimientos));
    });

    it('stockUnidades de cada producto unidad_simple == suma de deltaUnidades de sus movimientos', () => {
      esperarSinViolaciones('Stock por unidades desincronizado', stockUnidadesDesincronizado(productos, movimientos));
    });

    it('pesoRestanteGramos de cada pieza == suma de deltaGramos de sus propios movimientos', () => {
      esperarSinViolaciones('Piezas con peso desincronizado', piezasPesoDesincronizado(piezas, movimientos));
    });
  });

  describe('clientes', () => {
    it('los 2 clientes de reportes tienen stats coherentes con sus ventas completadas propias', () => {
      esperarSinViolaciones('Clientes con stats desincronizadas', clientesStatsDesincronizados(clientes, ventas));
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// construirDatosDemo (WA-D): dataset chico (6 clientes + ventas). Menos
// relaciones que reportar, pero las mismas dos que aplican (cliente↔venta) se
// verifican igual — es el dataset que la demo de WhatsApp/fidelización usa.
// ════════════════════════════════════════════════════════════════════════════

describe('construirDatosDemo — coherencia cruzada', () => {
  const { clientes, ventas } = datosDemo;
  const clientesPorId = porId(clientes);

  it('toda venta con clienteId referencia un cliente existente, con clienteNombre denormalizado coherente', () => {
    esperarSinViolaciones('Ventas con cliente inválido', ventasConClienteInvalido(ventas, clientesPorId));
  });

  it('los 6 clientes tienen stats coherentes con sus ventas completadas propias', () => {
    esperarSinViolaciones('Clientes con stats desincronizadas', clientesStatsDesincronizados(clientes, ventas));
  });
});
