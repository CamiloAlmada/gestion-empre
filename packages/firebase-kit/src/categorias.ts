import { doc, setDoc, writeBatch, type Firestore } from 'firebase/firestore';
import {
  type Categoria,
  type Producto,
  claveCategoria,
  claveCategoriaValida,
} from '@gestion/core';
import { categoriaConverter } from './converters/categoria';
import { CategoriaDuplicadaError, CategoriaInvalidaError } from './errores';

/**
 * Gestión del vocabulario de categorías (`categorias/{id} → { nombre, orden,
 * clave }`), usado por la pantalla de administración de categorías (solo admin).
 *
 * ## Los datos de validación se INYECTAN; acá no se lee de Firestore
 *
 * `crearCategoria` y `renombrarCategoria` reciben `existentes` (las categorías)
 * y `productos` como arrays, y NO los leen del SDK. Los provee la pantalla desde
 * las suscripciones `onSnapshot` que ya tiene abiertas (`useCollection`), que son
 * estrictamente mejores que una lectura a demanda: están en memoria, llegan al
 * instante e incluyen las escrituras locales todavía sin ack (latency
 * compensation).
 *
 * Es la misma regla que documenta `proveedores.ts`, y la puso ahí el mismo
 * incidente: bajo captive portal —la red dice estar viva, `navigator.onLine`
 * vale `true`, pero no pasa tráfico— un `getDocs` **se cuelga esperando al
 * servidor en vez de caer a caché**. Medido en el alta de proveedores: 48
 * segundos de spinner sin salida. Este módulo tenía el mismo patrón
 * `getDocs`-antes-de-escribir, y ni siquiera con el timeout que llegó a tener
 * proveedores: crear o renombrar una categoría se congelaba igual.
 *
 * Los dos parámetros son OBLIGATORIOS a propósito. Opcionales dejarían que un
 * caller nuevo se saltee el chequeo de duplicados o el fan-out sin enterarse;
 * así lo obliga el compilador.
 *
 * Beneficio secundario: las validaciones vuelven a ser lógica pura sobre arrays,
 * testeables sin mockear lecturas de Firebase.
 *
 * Las mutaciones multi-documento (renombrar, reordenar) siguen yendo en un
 * `writeBatch` atómico, coherente con el resto del kit (nunca `runTransaction`,
 * que exigiría servidor).
 *
 * ## El id del documento ES la clave del nombre
 *
 * `categorias/{id}` cumple SIEMPRE `id === claveCategoria(nombre)`. Esa es la
 * garantía estructural de que no hay dos categorías con el mismo nombre: dos
 * categorías homónimas serían literalmente el mismo documento. La garantía dura
 * la da `firestore.rules`, que exige `categoriaId == request.resource.data.clave`
 * en create y en update. Ver `categoria.ts` en `core`.
 *
 * El chequeo de duplicados contra `existentes` NO es esa garantía: es solo la
 * fuente del **mensaje de error amigable**. Si `existentes` viene incompleto y
 * el duplicado se cuela, las dos escrituras van al MISMO path y convergen en un
 * único documento al sincronizar. Ahí está la diferencia con `proveedores.ts`,
 * donde el mismo chequeo es la ÚNICA defensa (id autogenerado) y saltearlo
 * parte el historial en dos fichas.
 *
 * Consecuencia para el renombre: si la clave cambia, el documento se MUEVE de
 * path (set del nuevo + delete del viejo en el mismo batch). Dejar el id viejo
 * rompería el invariante y, peor, un alta posterior del nombre viejo pisaría el
 * documento renombrado.
 *
 * ## La carrera del fan-out es la de siempre, no una nueva
 *
 * El renombre re-etiqueta los productos que referencian el nombre anterior. Con
 * la lista inyectada, un producto que la suscripción todavía no trajo queda sin
 * re-etiquetar y apunta a una categoría que ya no existe.
 *
 * Esa carrera existía IGUAL con `getDocs`: `writeBatch` es atómico en la
 * ESCRITURA pero no valida read-set, así que un producto creado entre la lectura
 * y el commit se perdía del fan-out de las dos maneras. Lo único que aportaba
 * `getDocs` era frescura, y bajo captive portal no la aporta: cuelga. Cambiar a
 * `runTransaction` —lo único que cerraría la carrera— está descartado en este
 * kit porque exige servidor, que es justo lo que no hay.
 *
 * Además el producto huérfano ya es un estado manejado por la UI: ver `huerfana`
 * y el texto "(sin definir)" en `ModalProducto.tsx`.
 */

/**
 * Valida y normaliza un nombre de categoría: recorta espacios, exige no vacío y
 * exige que su clave sirva como id de documento de Firestore.
 *
 * Sin la segunda validación, un nombre como `.` o `a/b` llegaría al SDK y
 * explotaría con un error críptico en inglés en vez de un mensaje de dominio.
 *
 * @throws {CategoriaInvalidaError} si queda vacío tras `trim()` o si su clave no
 *   es un id válido.
 */
function exigirNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) {
    throw new CategoriaInvalidaError('El nombre de la categoría no puede estar vacío.');
  }
  if (!claveCategoriaValida(claveCategoria(limpio))) {
    throw new CategoriaInvalidaError(
      `"${limpio}" no es un nombre de categoría válido: no puede contener "/", ni ser "." o "..", ni tener la forma "__nombre__".`,
    );
  }
  return limpio;
}

/**
 * Crea una categoría nueva con nombre normalizado y `orden = max(orden) + 1` (0 si
 * no hay ninguna). El id del documento ES la clave del nombre, nunca un id
 * autogenerado: ahí vive la garantía de unicidad.
 *
 * @param existentes Categorías ya conocidas por la pantalla (las de su
 *   suscripción `useCollection`). De ahí salen el chequeo de duplicados y el
 *   cálculo de `orden`. Un alta en lote DEBE acumular localmente lo que va
 *   creando y volver a pasarlo acá: la suscripción no se actualiza dentro del
 *   bucle, y dos altas seguidas con la misma lista se pisarían el `orden`.
 * @throws {CategoriaInvalidaError} si el nombre queda vacío o su clave no sirve
 *   como id de documento.
 * @throws {CategoriaDuplicadaError} si ya existe una categoría con ese nombre en
 *   `existentes`. Es el mensaje amigable, no la garantía: ver el doc del módulo.
 */
export async function crearCategoria(
  db: Firestore,
  nombre: string,
  existentes: readonly Categoria[],
): Promise<{ categoriaId: string }> {
  const nombreLimpio = exigirNombre(nombre);
  const claveNueva = claveCategoria(nombreLimpio);

  if (existentes.some((c) => claveCategoria(c.nombre) === claveNueva)) {
    throw new CategoriaDuplicadaError(`Ya existe una categoría llamada "${nombreLimpio}".`);
  }

  const orden = existentes.length === 0 ? 0 : Math.max(...existentes.map((c) => c.orden)) + 1;

  const ref = doc(db, 'categorias', claveNueva).withConverter(categoriaConverter);
  const categoria: Categoria = { id: claveNueva, nombre: nombreLimpio, orden };
  await setDoc(ref, categoria);

  return { categoriaId: claveNueva };
}

/**
 * Renombra una categoría y propaga el nuevo nombre al campo `categoria` de los
 * productos que lo referencian (denormalizado), en UN batch atómico: o se
 * renombra y se re-etiquetan todos, o no cambia nada.
 *
 * El chequeo de duplicados excluye la propia categoría, de modo que corregir solo
 * el uso de mayúsculas ("quesos" → "Quesos") es válido.
 *
 * Como el id del documento ES la clave del nombre, hay dos casos:
 *
 * - **La clave no cambia** (solo cambiaron mayúsculas o espacios de borde): el
 *   documento se queda donde está y se actualiza in-place.
 * - **La clave cambia**: el documento se MUEVE a su nuevo path, con un `set` del
 *   nuevo (conservando `orden`) y un `delete` del viejo dentro del MISMO batch,
 *   junto al fan-out a productos. Conservar el id viejo no es opción: si "Quesos"
 *   (id `quesos`) pasara a llamarse "Fiambres" pero siguiera viviendo en `quesos`,
 *   un alta posterior de "Quesos" escribiría en ese mismo path y PISARÍA a
 *   Fiambres. El invariante tiene que valer siempre, no solo en el alta.
 *
 * Efecto colateral útil: renombrar un documento heredado (id autogenerado, previo
 * a la migración de ids) lo reubica en su path canónico.
 *
 * @param existentes Categorías ya conocidas por la pantalla: de ahí salen la
 *   categoría actual (para el nombre anterior y el `orden`) y el chequeo de
 *   duplicados.
 * @param productos Productos ya conocidos por la pantalla. El fan-out filtra EN
 *   MEMORIA por `categoria === nombreAnterior` (igualdad exacta, igual que la
 *   query que reemplaza). Los que la suscripción no haya traído quedan afuera;
 *   ver la carrera en el doc del módulo.
 * @throws {CategoriaInvalidaError} si el nombre nuevo queda vacío, si su clave no
 *   sirve como id de documento, o si la categoría `categoriaId` no está en
 *   `existentes`.
 * @throws {CategoriaDuplicadaError} si otra categoría ya usa ese nombre.
 */
export async function renombrarCategoria(
  db: Firestore,
  categoriaId: string,
  nombreNuevo: string,
  existentes: readonly Categoria[],
  productos: readonly Producto[],
): Promise<void> {
  const nombreLimpio = exigirNombre(nombreNuevo);
  const claveNueva = claveCategoria(nombreLimpio);

  const actual = existentes.find((c) => c.id === categoriaId);
  if (actual === undefined) {
    throw new CategoriaInvalidaError(`No existe la categoría ${categoriaId}.`);
  }

  const chocaConOtra = existentes.some(
    (c) => c.id !== categoriaId && claveCategoria(c.nombre) === claveNueva,
  );
  if (chocaConOtra) {
    throw new CategoriaDuplicadaError(`Ya existe una categoría llamada "${nombreLimpio}".`);
  }

  const nombreAnterior = actual.nombre;

  // Productos que referencian el nombre anterior (denormalizado). Igualdad
  // exacta contra el nombre viejo. Escala esperada: decenas de productos, muy
  // lejos del límite de 500 operaciones del batch de Firestore; si esto creciera
  // a cientos, habría que paginar el batch.
  const aReetiquetar = productos.filter((p) => p.categoria === nombreAnterior);

  const batch = writeBatch(db);
  if (claveNueva === categoriaId) {
    // La clave no cambió: el documento ya está en su path canónico. Se reescribe
    // `clave` junto al nombre para que un documento heredado (sin el campo) quede
    // completo sin necesidad de moverlo.
    batch.update(doc(db, 'categorias', categoriaId), {
      nombre: nombreLimpio,
      clave: claveNueva,
    });
  } else {
    // La clave cambió: el documento se muda de path. `set` + `delete` en el mismo
    // batch, así nunca existen las dos versiones ni ninguna.
    batch.set(doc(db, 'categorias', claveNueva).withConverter(categoriaConverter), {
      id: claveNueva,
      nombre: nombreLimpio,
      orden: actual.orden,
    });
    batch.delete(doc(db, 'categorias', categoriaId));
  }
  for (const producto of aReetiquetar) {
    batch.update(doc(db, 'productos', producto.id), { categoria: nombreLimpio });
  }
  await batch.commit();
}

/**
 * Intercambia los `orden` de dos categorías en UN batch atómico (subir/bajar una
 * categoría en la lista de Stock). Recibe las entidades ya resueltas por la UI
 * (que ya tiene la lista cargada), sin leer de Firestore.
 */
export async function intercambiarOrdenCategorias(
  db: Firestore,
  categoriaA: Categoria,
  categoriaB: Categoria,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'categorias', categoriaA.id), { orden: categoriaB.orden });
  batch.update(doc(db, 'categorias', categoriaB.id), { orden: categoriaA.orden });
  await batch.commit();
}
