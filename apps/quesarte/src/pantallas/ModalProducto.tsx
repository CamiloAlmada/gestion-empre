import { useEffect, useState } from 'react';
import { Button, Input, Modal, MoneyInput } from '@gestion/ui';
import type { ModoPrecio, ModoStock, Money, Producto } from '@gestion/core';

/** Etiquetas en español de `modoPrecio` (docs/02-dominio-quesarte.md). */
export const ETIQUETAS_MODO_PRECIO: Record<ModoPrecio, string> = {
  por_kg: 'Por kg',
  por_unidad: 'Por unidad',
};

/** Etiquetas en español de `modoStock` (docs/02-dominio-quesarte.md). */
export const ETIQUETAS_MODO_STOCK: Record<ModoStock, string> = {
  fraccionado_por_pieza: 'Fraccionado por pieza',
  pieza_entera: 'Pieza entera',
  granel: 'Granel',
  unidad_simple: 'Unidad simple',
};

const OPCIONES_MODO_PRECIO: { valor: ModoPrecio; etiqueta: string }[] = [
  { valor: 'por_kg', etiqueta: ETIQUETAS_MODO_PRECIO.por_kg },
  { valor: 'por_unidad', etiqueta: ETIQUETAS_MODO_PRECIO.por_unidad },
];

const OPCIONES_MODO_STOCK: { valor: ModoStock; etiqueta: string }[] = [
  { valor: 'fraccionado_por_pieza', etiqueta: ETIQUETAS_MODO_STOCK.fraccionado_por_pieza },
  { valor: 'pieza_entera', etiqueta: ETIQUETAS_MODO_STOCK.pieza_entera },
  { valor: 'granel', etiqueta: ETIQUETAS_MODO_STOCK.granel },
  { valor: 'unidad_simple', etiqueta: ETIQUETAS_MODO_STOCK.unidad_simple },
];

/** Datos validados que salen del formulario. `Productos.tsx` decide, según
 * alta o edición, qué campos efectivamente escribe (ver `crearProducto` /
 * `actualizarProducto`): modoPrecio/modoStock solo se usan en alta. */
export interface DatosProductoFormulario {
  nombre: string;
  categoria: string;
  modoPrecio: ModoPrecio;
  modoStock: ModoStock;
  precioVentaCents: Money;
  umbralAlertaStock?: number;
  activo: boolean;
}

export interface ModalProductoProps {
  abierto: boolean;
  /** `null` = alta. Con producto, `modoPrecio`/`modoStock` quedan fijos. */
  producto: Producto | null;
  /** `true` mientras `onGuardar` está resolviendo (deshabilita los botones). */
  guardando: boolean;
  onGuardar: (datos: DatosProductoFormulario) => void;
  onCerrar: () => void;
}

interface Errores {
  nombre?: string;
  categoria?: string;
  precio?: string;
  umbral?: string;
}

/** Grupo de opciones excluyentes (mismo patrón que el selector de tema de
 * Ajustes.tsx): `role="group"` + `aria-pressed` por botón. */
function GrupoOpciones<T extends string>({
  label,
  opciones,
  valor,
  onChange,
}: {
  label: string;
  opciones: { valor: T; etiqueta: string }[];
  valor: T;
  onChange: (valor: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-texto">{label}</span>
      <div
        role="group"
        aria-label={label}
        className="flex flex-wrap gap-1 rounded-xl border border-borde p-1"
      >
        {opciones.map((opcion) => {
          const activa = opcion.valor === valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={activa}
              onClick={() => onChange(opcion.valor)}
              className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
                activa ? 'bg-primary-600 text-white' : 'text-texto-secundario hover:text-texto'
              }`}
            >
              {opcion.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Modal de alta/edición de producto. Es UNA sola instancia estable (patrón de
 * `Modal`, ver `Modal.test.tsx`): no se desmonta al cerrar, el contenido
 * siempre está en el árbol y el estado del formulario se resetea vía efecto
 * cuando `abierto` pasa a `true` (no por remount).
 *
 * `modoPrecio`/`modoStock` solo son editables en alta: cambiarlos con stock
 * vivo corrompería el inventario (piezas y stock agregado ya creados bajo el
 * modo anterior). En edición se muestran como texto fijo.
 */
export function ModalProducto({
  abierto,
  producto,
  guardando,
  onGuardar,
  onCerrar,
}: ModalProductoProps) {
  const esAlta = producto === null;

  const [nombre, setNombre] = useState('');
  const [categoria, setCategoria] = useState('');
  const [modoPrecio, setModoPrecio] = useState<ModoPrecio>('por_kg');
  const [modoStock, setModoStock] = useState<ModoStock>('fraccionado_por_pieza');
  const [precio, setPrecio] = useState<Money | null>(null);
  const [umbralTexto, setUmbralTexto] = useState('');
  const [activo, setActivo] = useState(true);
  const [errores, setErrores] = useState<Errores>({});

  // Resetea el formulario cada vez que el modal se abre (alta nueva o
  // edición de un producto puntual). `producto` queda fijo mientras el modal
  // está abierto (es la instantánea capturada al tocar "Editar"), así que
  // esto no reescribe lo que el usuario está tipeando en el medio.
  useEffect(() => {
    if (!abierto) return;
    setNombre(producto?.nombre ?? '');
    setCategoria(producto?.categoria ?? '');
    setModoPrecio(producto?.modoPrecio ?? 'por_kg');
    setModoStock(producto?.modoStock ?? 'fraccionado_por_pieza');
    setPrecio(producto?.precioVentaCents ?? null);
    setUmbralTexto(producto?.umbralAlertaStock !== undefined ? String(producto.umbralAlertaStock) : '');
    setActivo(producto?.activo ?? true);
    setErrores({});
  }, [abierto, producto]);

  function construirPayload(): DatosProductoFormulario | null {
    const nuevosErrores: Errores = {};
    const nombreLimpio = nombre.trim();
    const categoriaLimpia = categoria.trim();

    if (nombreLimpio === '') nuevosErrores.nombre = 'Ingresá el nombre del producto.';
    if (categoriaLimpia === '') nuevosErrores.categoria = 'Ingresá la categoría.';
    if (precio === null) nuevosErrores.precio = 'Ingresá el precio de venta.';

    let umbral: number | undefined;
    const umbralLimpio = umbralTexto.trim();
    if (umbralLimpio !== '') {
      if (!/^\d+$/.test(umbralLimpio)) {
        nuevosErrores.umbral = 'El umbral debe ser un número entero mayor o igual a 0.';
      } else {
        umbral = Number(umbralLimpio);
      }
    }

    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) return null;

    return {
      nombre: nombreLimpio,
      categoria: categoriaLimpia,
      modoPrecio,
      modoStock,
      // Validado arriba: si llegamos acá, precio no es null.
      precioVentaCents: precio as Money,
      umbralAlertaStock: umbral,
      activo: esAlta ? true : activo,
    };
  }

  function handleGuardarClick() {
    const payload = construirPayload();
    if (payload !== null) onGuardar(payload);
  }

  const etiquetaPrecio = modoPrecio === 'por_kg' ? 'Precio por kg' : 'Precio por unidad';

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={esAlta ? 'Nuevo producto' : 'Editar producto'}
      acciones={
        <>
          <Button variante="secundaria" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardarClick} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Nombre" value={nombre} onChange={setNombre} error={errores.nombre} />
        <Input
          label="Categoría"
          value={categoria}
          onChange={setCategoria}
          error={errores.categoria}
        />

        {esAlta ? (
          <>
            <GrupoOpciones
              label="Modo de precio"
              opciones={OPCIONES_MODO_PRECIO}
              valor={modoPrecio}
              onChange={setModoPrecio}
            />
            <GrupoOpciones
              label="Modo de stock"
              opciones={OPCIONES_MODO_STOCK}
              valor={modoStock}
              onChange={setModoStock}
            />
          </>
        ) : (
          <div className="flex flex-col gap-1 rounded-xl border border-borde p-3">
            <p className="text-sm text-texto">
              <span className="font-medium">Modo de precio:</span>{' '}
              {ETIQUETAS_MODO_PRECIO[modoPrecio]}
            </p>
            <p className="text-sm text-texto">
              <span className="font-medium">Modo de stock:</span> {ETIQUETAS_MODO_STOCK[modoStock]}
            </p>
            <p className="text-xs text-texto-secundario">No se puede cambiar después del alta.</p>
          </div>
        )}

        <MoneyInput label={etiquetaPrecio} value={precio} onChange={setPrecio} error={errores.precio} />

        <Input
          label="Umbral de alerta de stock (opcional)"
          type="number"
          value={umbralTexto}
          onChange={setUmbralTexto}
          error={errores.umbral}
          placeholder="Ej: 200"
        />

        {!esAlta && (
          <GrupoOpciones
            label="Estado"
            opciones={[
              { valor: 'activo', etiqueta: 'Activo' },
              { valor: 'inactivo', etiqueta: 'Inactivo' },
            ]}
            valor={activo ? 'activo' : 'inactivo'}
            onChange={(v) => setActivo(v === 'activo')}
          />
        )}
      </div>
    </Modal>
  );
}
