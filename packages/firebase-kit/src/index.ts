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
