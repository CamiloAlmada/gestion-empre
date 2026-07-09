export { initFirebase, type FirebaseConfig, type FirebaseServices } from './init';
export { ProveedorAuth, useAuth, type EstadoAuth, type ProveedorAuthProps } from './ProveedorAuth';
export { useOnlineStatus } from './useOnlineStatus';
export { useDoc, type EstadoDoc } from './useDoc';
export { useCollection, type EstadoCollection } from './useCollection';

export { usuarioConverter } from './converters/usuario';
export { productoConverter } from './converters/producto';
export { piezaConverter } from './converters/pieza';
export { ventaConverter } from './converters/venta';
export { movimientoConverter } from './converters/movimiento';
export { configuracionConverter } from './converters/configuracion';
export { categoriaConverter } from './converters/categoria';
export { clienteConverter } from './converters/cliente';
export { proveedorConverter } from './converters/proveedor';

export {
  registrarVenta,
  anularVenta,
  type EntradaVenta,
  type ItemEntradaVenta,
  type ClienteVenta,
} from './ventas';
export {
  crearCliente,
  actualizarCliente,
  desactivarCliente,
  type DatosCliente,
} from './clientes';
export {
  crearProveedor,
  actualizarProveedor,
  desactivarProveedor,
  type DatosProveedor,
} from './proveedores';
export {
  ajustarStock,
  ingresarPiezas,
  type EntradaAjuste,
  type TipoAjuste,
  type EntradaIngresoPiezas,
  type PiezaIngreso,
} from './stock';
export { invitarUsuario, type EntradaInvitacion } from './invitaciones';
export {
  crearCategoria,
  renombrarCategoria,
  intercambiarOrdenCategorias,
} from './categorias';
export {
  ErrorEscrituraPOS,
  StockInsuficienteError,
  VentaVaciaError,
  TotalIncoherenteError,
  ItemInvalidoError,
  AnulacionInvalidaError,
  AjusteInvalidoError,
  IngresoInvalidoError,
  ErrorCategoria,
  CategoriaInvalidaError,
  CategoriaDuplicadaError,
  ErrorCliente,
  ClienteInvalidoError,
  ErrorProveedor,
  ProveedorInvalidoError,
  ErrorInvitacion,
  EmailInvalidoError,
  DatosInvitacionInvalidosError,
  EmailYaRegistradoError,
  PerfilNoCreadoError,
} from './errores';
