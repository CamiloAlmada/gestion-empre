export { redondearHalfUp } from './redondeo.js';
export {
  type Money,
  money,
  sumarMoney,
  multiplicarMoney,
  calcularTicketPromedio,
  moneyDesdePesos,
  formatearMoney,
} from './money.js';
export {
  type Peso,
  peso,
  sumarPeso,
  restarPeso,
  pesoNoNegativo,
  pesoDesdeKg,
  formatearPeso,
  formatearPesoForzado,
} from './peso.js';
export type {
  ModoPrecio,
  ModoStock,
  EstadoPieza,
  MedioPago,
  EstadoVenta,
  TipoMovimiento,
  Rol,
  Categoria,
  Producto,
  Pieza,
  ItemVenta,
  Venta,
  MovimientoStock,
  Usuario,
  Configuracion,
  StatsCliente,
  Cliente,
  DatosPago,
  Proveedor,
  EstadoCompra,
  ConceptoGasto,
  GastoCompra,
  PiezaCompra,
  ItemCompra,
  Compra,
} from './tipos.js';
export { type ItemCobrable, calcularSubtotal } from './precio.js';
export { type PiezaElegida, elegirPieza } from './fifo.js';
export {
  type MetodoProrrateo,
  type ItemProrrateable,
  repartirProporcional,
  prorratearGastos,
} from './prorrateo.js';
export {
  calcularCostoRealCents,
  calcularCostoRealKgCents,
  nuevoCostoPromedio,
} from './costos.js';
export {
  BPS_TOTAL,
  precioDesdeMargen,
  margenDesdePrecio,
  markupDesdePrecio,
  redondearComercial,
  precioSugerido,
} from './margen.js';
export { normalizarTelefono } from './telefono.js';
export {
  type ContextoPlantilla,
  type PlantillaWhatsApp,
  resolverPlantilla,
  construirLinkWhatsApp,
  PLANTILLAS_SEED,
} from './whatsapp.js';
export {
  type ConfigInactividad,
  type EntradaInactividad,
  type ResultadoInactividad,
  clasificarInactividad,
} from './fidelizacion.js';
export {
  type RgbLineal,
  type ResultadoClamp,
  parseHex,
  componenteSrgbALineal,
  componenteLinealASrgb,
  hexASrgbLineal,
  parseOklch,
  oklchASrgbLineal,
  dentroDeGamut,
  clampGamut,
  luminanciaRelativa,
  ratioContraste,
  oklchAHex,
  maxChromaEnGamut,
  serializarOklch,
} from './color.js';
export {
  type TinteFondo,
  type TemaPersonalizado,
  type PresetTema,
  normalizarTema,
  esTemaValido,
  PRESETS_TEMA,
} from './tema.js';
export {
  type NombreVariable,
  type ReferenciaColor,
  type Modo,
  type ParAA,
  type ResultadoPar,
  type ReporteContraste,
  PARES_AA,
  verificarPares,
} from './contrasteAa.js';
export {
  type TokensGenerados,
  ErrorPaletaInvalida,
  generarPaleta,
} from './paleta.js';
