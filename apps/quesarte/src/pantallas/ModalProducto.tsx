import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { Button, Input, Modal, MoneyInput, useToasts } from '@gestion/ui';
import type { Categoria, ModoPrecio, ModoStock, Money, Producto } from '@gestion/core';
import {
  CategoriaDuplicadaError,
  CategoriaInvalidaError,
  crearCategoria,
  useOnlineStatus,
} from '@gestion/firebase-kit';
import { db } from '../firebase';
import { ETIQUETAS_MODO_PRECIO, ETIQUETAS_MODO_STOCK } from '../componentes/stock/etiquetasProducto';

export { ETIQUETAS_MODO_PRECIO, ETIQUETAS_MODO_STOCK };

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

/**
 * Datos validados que salen del formulario, discriminados por `tipo`
 * (UI-5b, docs/06-ui-ux.md §2): el ALTA sigue emitiendo `modoPrecio`/
 * `modoStock`/`precioVentaCents` REQUERIDOS (`crearProducto` los necesita
 * para construir el documento); la EDICIÓN ni siquiera los tiene en su tipo
 * — no se recolectan en el formulario. El precio se fija en el alta y se
 * cambia SOLO en la sección Precios (costo y margen a la vista ahí): la
 * edición de la ficha nunca lo escribe, cierra el doble camino de escritura
 * que había entre el modal de catálogo y el de precios. El llamador narrowea
 * por `datos.tipo` antes de invocar `crearProducto`/`actualizarProducto` (ver
 * `Productos.tsx`/`DetalleProductoPantalla.tsx`).
 */
export interface DatosAltaProducto {
  tipo: 'alta';
  nombre: string;
  categoria: string;
  modoPrecio: ModoPrecio;
  modoStock: ModoStock;
  precioVentaCents: Money;
  umbralAlertaStock?: number;
}

export interface DatosEdicionProducto {
  tipo: 'edicion';
  nombre: string;
  categoria: string;
  umbralAlertaStock?: number;
  activo: boolean;
}

export type DatosProductoFormulario = DatosAltaProducto | DatosEdicionProducto;

export interface ModalProductoProps {
  abierto: boolean;
  /** `null` = alta. Con producto, `modoPrecio`/`modoStock`/precio quedan fijos
   * (no se muestran ni se editan acá). */
  producto: Producto | null;
  /** `true` mientras `onGuardar` está resolviendo (deshabilita los botones). */
  guardando: boolean;
  /** Vocabulario vigente, YA ordenado por `orden` (arma la query el
   * llamador). Opciones del select de categoría — se actualiza solo vía la
   * `useCollection` del padre cuando se crea una categoría nueva acá adentro. */
  categorias: Categoria[];
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
        className="flex flex-wrap gap-1 rounded-elemento border border-borde p-1"
      >
        {opciones.map((opcion) => {
          const activa = opcion.valor === valor;
          return (
            <button
              key={opcion.valor}
              type="button"
              aria-pressed={activa}
              onClick={() => onChange(opcion.valor)}
              className={`min-h-[44px] flex-1 rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
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

/** Valor centinela de la opción "+ Nueva categoría…" del select: nunca puede
 * chocar con un nombre real (el select solo ofrece nombres `trim()`eados no
 * vacíos como opciones normales). */
const VALOR_NUEVA_CATEGORIA = '__crear_categoria__';

interface CampoCategoriaProps {
  /** Se resetea el sub-formulario de creación cada vez que el modal (padre)
   * pasa a abierto — mismo criterio que el resto de los campos de
   * `ModalProducto`, ver su propio `useEffect`. */
  abierto: boolean;
  categorias: Categoria[];
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  /** Cierra el modal entero: lo dispara el link "Gestionar categorías" antes
   * de navegar (docs/06-ui-ux.md §2, picker de categoría). */
  onCerrarModal: () => void;
}

/**
 * Select nativo de categoría (reemplaza el `Input` de texto libre — CAT-2)
 * con creación inline (UI-5b, docs/06-ui-ux.md §2, "Picker de categoría con
 * creación inline" — condición del dueño al aprobar la mudanza de Categorías
 * a Ajustes: el momento de necesidad real de dar de alta un producto NUNCA
 * obliga a salir del flujo para crear la categoría que falta).
 *
 * No `SearchSelect`: el vocabulario esperado del negocio es un puñado de
 * categorías (Quesos, Embutidos, Miel, Frutos secos, Especias…), muy por
 * debajo de donde un combobox con filtro empieza a pagar su complejidad; el
 * `<select>` nativo es más rápido de operar y no necesita polyfill de
 * teclado/focus (ver reporte de CAT-2).
 *
 * El valor es el NOMBRE de la categoría (`Producto.categoria` es
 * denormalizado, no guarda el id — docs/02-dominio-quesarte.md). Un producto
 * existente puede tener una categoría que ya no está definida en el
 * vocabulario (renombrada por fuera del flujo normal, o texto libre
 * histórico todavía no migrado): se agrega como opción extra "(sin
 * definir)" para no perder el valor ni bloquear la edición del resto del
 * producto.
 *
 * Elegir "+ Nueva categoría…" cambia a un sub-formulario (nombre + Crear/
 * Cancelar) SIN tocar `value` todavía: recién al crear con éxito se
 * selecciona la categoría nueva (por nombre) y se vuelve al select — la
 * lista viva llega sola por la `useCollection` del padre, no hace falta
 * refrescar nada acá. "Cancelar" vuelve al select dejando `value` como
 * estaba (no crea nada).
 *
 * **Sin conexión, la creación queda BLOQUEADA** (review UI-5, hallazgo M1):
 * `crearCategoria` chequea duplicados con un `getDocs` que offline resuelve
 * de CACHÉ, y el `setDoc` de la categoría nueva se commitea siempre al
 * reconectar — Firestore no revalida duplicados server-side (no hay
 * constraint ni transacción para esto). Con caché stale (dispositivo recién
 * instalado, o categoría creada mientras tanto en otro equipo) el patrón
 * híbrido offline de docs/06-ui-ux.md §8 generaría un duplicado silencioso.
 * Mismo motivo exacto por el que `Categorias.tsx` bloquea TODA mutación de
 * vocabulario sin conexión (ver su JSDoc) — este picker sigue ese mismo
 * criterio: la opción "+ Nueva categoría…" del select queda deshabilitada
 * offline (con un hint visible ANTES de que el usuario llegue a tipear
 * nada) y, si la conexión se corta mientras el sub-formulario ya está
 * abierto, el botón "Crear" también se deshabilita con el mismo aviso. El
 * `<select>` (elegir una categoría YA creada) y el link "Gestionar
 * categorías" siguen usables sin conexión — solo la ESCRITURA se bloquea.
 */
function CampoCategoria({ abierto, categorias, value, onChange, error, onCerrarModal }: CampoCategoriaProps) {
  const id = useId();
  const idError = `${id}-error`;
  const idHint = `${id}-hint`;
  const enLinea = useOnlineStatus();
  const { mostrarToast } = useToasts();

  const [modo, setModo] = useState<'select' | 'crear'>('select');
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [creando, setCreando] = useState(false);
  const [errorCrear, setErrorCrear] = useState<string | undefined>();

  // Mismo criterio que `ModalProducto`: el sub-formulario de creación vuelve
  // a su estado inicial cada vez que el modal se reabre, no solo al montar.
  useEffect(() => {
    if (!abierto) return;
    setModo('select');
    setNombreNuevo('');
    setErrorCrear(undefined);
    setCreando(false);
  }, [abierto]);

  const huerfana = value !== '' && !categorias.some((c) => c.nombre === value);

  function handleChangeSelect(valor: string) {
    if (valor === VALOR_NUEVA_CATEGORIA) {
      // Defensivo: la opción ya viene `disabled` en el `<select>` sin
      // conexión (un navegador real no dispara `onChange` con ella
      // seleccionada), pero un `change` sintético no respeta eso — sin este
      // guard se podría entrar al sub-formulario igual.
      if (!enLinea) return;
      setModo('crear');
      setNombreNuevo('');
      setErrorCrear(undefined);
      return;
    }
    onChange(valor);
  }

  function cancelarCreacion() {
    setModo('select');
    setNombreNuevo('');
    setErrorCrear(undefined);
  }

  /**
   * A diferencia del resto de las escrituras del proyecto (patrón híbrido
   * offline de docs/06-ui-ux.md §8), esta acción NO tiene rama offline
   * (review UI-5, hallazgo M1): el chequeo de duplicados de `crearCategoria`
   * es un `getDocs` client-side contra caché, nunca revalidado
   * server-side — crear sin conexión podría generar un duplicado silencioso
   * si la caché está stale. La UI ya deja esta función inalcanzable offline
   * (opción del select y botón "Crear" deshabilitados, ver el JSX); el
   * guard de acá es la defensa de fondo, mismo criterio que
   * `handleChangeSelect` arriba.
   */
  async function handleCrear() {
    if (!enLinea) return;
    const nombreLimpio = nombreNuevo.trim();
    if (nombreLimpio === '') {
      setErrorCrear('Ingresá el nombre de la categoría.');
      return;
    }
    setErrorCrear(undefined);

    setCreando(true);
    try {
      await crearCategoria(db, nombreLimpio);
      onChange(nombreLimpio);
      setModo('select');
      setNombreNuevo('');
      mostrarToast('Categoría creada.', 'exito');
    } catch (err) {
      if (err instanceof CategoriaDuplicadaError || err instanceof CategoriaInvalidaError) {
        setErrorCrear(err.message);
      } else {
        mostrarToast('No se pudo crear la categoría. Intentá de nuevo.', 'error');
      }
    } finally {
      setCreando(false);
    }
  }

  if (modo === 'crear') {
    return (
      <div className="flex flex-col gap-2 rounded-elemento border border-borde p-3">
        <Input
          label="Nombre de la nueva categoría"
          value={nombreNuevo}
          onChange={setNombreNuevo}
          error={errorCrear}
          disabled={creando || !enLinea}
          placeholder="Ej: Especias"
        />
        {/* La conexión se cortó con el sub-formulario ya abierto (si hubiera
            estado offline desde el principio, ni se podía llegar acá: la
            opción "+ Nueva categoría…" del select queda deshabilitada más
            abajo). Mismo tratamiento visual que el banner de `Categorias.tsx`. */}
        {!enLinea && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-advertencia">
            <span aria-hidden="true">⚠</span> Necesitás conexión para crear categorías.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variante="secundaria" onClick={cancelarCreacion} disabled={creando}>
            Cancelar
          </Button>
          <Button onClick={() => void handleCrear()} disabled={creando || !enLinea}>
            {creando ? 'Creando…' : 'Crear'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        Categoría
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => handleChangeSelect(e.target.value)}
        aria-invalid={error !== undefined ? true : undefined}
        aria-describedby={error !== undefined ? idError : !enLinea || categorias.length === 0 ? idHint : undefined}
        className={`min-h-11 rounded-control border bg-superficie px-3 py-2 text-texto outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${
          error ? 'border-peligro' : 'border-borde'
        }`}
      >
        <option value="" disabled>
          Elegí una categoría
        </option>
        {categorias.map((c) => (
          <option key={c.id} value={c.nombre}>
            {c.nombre}
          </option>
        ))}
        {huerfana && <option value={value}>{value} (sin definir)</option>}
        {/* Sin conexión, crear queda deshabilitado (review UI-5, M1: el
            chequeo de duplicados de `crearCategoria` es client-side contra
            caché, nunca revalidado server-side — ver el JSDoc de
            `CampoCategoria`). Elegir una categoría YA creada (el resto de
            las opciones de este mismo select) sigue andando offline. */}
        <option value={VALOR_NUEVA_CATEGORIA} disabled={!enLinea}>
          + Nueva categoría…
        </option>
      </select>
      {error !== undefined ? (
        <p id={idError} className="text-sm text-peligro">
          {error}
        </p>
      ) : !enLinea ? (
        <p id={idHint} role="status" className="flex items-center gap-1.5 text-sm text-advertencia">
          <span aria-hidden="true">⚠</span> Necesitás conexión para crear categorías.
        </p>
      ) : (
        categorias.length === 0 && (
          <p id={idHint} className="text-sm text-texto-secundario">
            Todavía no hay categorías: creá la primera con "+ Nueva categoría…".
          </p>
        )
      )}
      <Link
        to="/ajustes/categorias"
        onClick={onCerrarModal}
        className="self-start text-sm font-medium text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 dark:text-primary-300"
      >
        Gestionar categorías
      </Link>
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
 * modo anterior). En edición se muestran como texto fijo. El PRECIO
 * directamente no se muestra en edición (docs/06-ui-ux.md §2, UI-5b): se
 * fija en el alta y se cambia solo en la sección Precios.
 */
export function ModalProducto({
  abierto,
  producto,
  guardando,
  categorias,
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
    // Solo relevante en alta: la edición no muestra ni valida precio.
    setPrecio(null);
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
    if (esAlta && precio === null) nuevosErrores.precio = 'Ingresá el precio de venta.';

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

    if (esAlta) {
      return {
        tipo: 'alta',
        nombre: nombreLimpio,
        categoria: categoriaLimpia,
        modoPrecio,
        modoStock,
        // Validado arriba: si llegamos acá, precio no es null.
        precioVentaCents: precio as Money,
        umbralAlertaStock: umbral,
      };
    }

    return {
      tipo: 'edicion',
      nombre: nombreLimpio,
      categoria: categoriaLimpia,
      umbralAlertaStock: umbral,
      activo,
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
        <CampoCategoria
          abierto={abierto}
          categorias={categorias}
          value={categoria}
          onChange={setCategoria}
          error={errores.categoria}
          onCerrarModal={onCerrar}
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
          <div className="flex flex-col gap-1 rounded-elemento border border-borde p-3">
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

        {/* Precio SOLO en alta (docs/06-ui-ux.md §2, UI-5b): se fija acá y se
            cambia SOLO desde la sección Precios (costo y margen a la vista
            ahí) — la edición de la ficha nunca lo muestra ni lo escribe. */}
        {esAlta && (
          <MoneyInput label={etiquetaPrecio} value={precio} onChange={setPrecio} error={errores.precio} />
        )}

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
