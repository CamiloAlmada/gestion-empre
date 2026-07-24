import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { doc } from 'firebase/firestore';
import { temaNegocioConverter, useAuth, useDoc } from '@gestion/firebase-kit';
import { ProveedorTemaNegocio, type TokensGenerados } from '@gestion/ui';
import { generarPaleta } from '@gestion/core';
import { db } from '../firebase';

export interface SincronizadorTemaNegocioProps {
  children: ReactNode;
}

/**
 * Puente entre Firestore (`configuracion/tema`) y `<ProveedorTemaNegocio>`
 * (docs/06-ui-ux.md §4, tanda TM): suscribe el doc, corre `generarPaleta`
 * sobre la semilla válida y alimenta los tokens resultantes al proveedor de
 * `@gestion/ui`, que es quien sabe pintarlos en el documento.
 *
 * DÓNDE VIVE: se monta envolviendo `<App />` en `main.tsx`, DENTRO de
 * `<ProveedorAuth>` pero fuera de `<RutaProtegida>` — el tema del negocio
 * debe verse también en `/login` (docs §4: "el tema debe verse en Login"),
 * así que no puede depender de que haya sesión iniciada para renderizar sus
 * `children`. Necesita estar dentro de `ProveedorAuth` igual, por el punto
 * siguiente.
 *
 * PERMISOS VS. "SIN TEMA": las reglas de Firestore exigen usuario activo
 * para LEER `configuracion/tema` (`allow read: if usuarioActivo()`). Sin
 * sesión (la pantalla de Login), `useDoc` no recibe "no existe el doc": recibe
 * un ERROR `permission-denied`. Son dos cosas distintas y hay que tratarlas
 * distinto:
 *
 * - Doc CONFIRMADO ausente (lectura exitosa, sin doc) o corrupto/versión
 *   futura (`temaNegocioConverter` lo tolera y devuelve `null`): el negocio
 *   de verdad no tiene tema propio → tokens `null` (CONFIRMADO, ver el
 *   tri-estado de `ProveedorTemaNegocioProps.tokens` en `@gestion/ui`), la
 *   app cae al tema base.
 * - Cargando, o error de lectura (permission-denied en `/login`, o
 *   cualquier otro transitorio): NO es una confirmación de nada, es "no
 *   sé" — se mantiene el último valor CONFIRMADO tal cual estaba (ver el
 *   effect de abajo, que solo actualiza el estado cuando `cargando` es
 *   `false` Y `error` es `null`). El estado ARRANCA en `undefined`
 *   (tri-estado, no `null`) precisamente para que este "no sé" tenga un
 *   valor propio que `ProveedorTemaNegocio` sabe NO tocar (ni el DOM que
 *   pintó el script anti-FOUC ni el cache de `localStorage`) — un `null`
 *   inicial habría sido indistinguible de "confirmado sin tema" y le habría
 *   ordenado limpiar todo en cada arranque, incluido en `/login` (bug real
 *   de producción, ver el review que motivó este tri-estado).
 *
 * RESUSCRIPCIÓN AL INICIAR SESIÓN: el SDK de Firestore no reintenta solo un
 * listener de `onSnapshot` que recibió `permission-denied` — queda
 * terminado. Para que, al iniciar sesión, se vuelva a pedir el doc con
 * permisos reales (en vez de quedarse para siempre en el error de cuando
 * todavía no había sesión), la referencia se memoiza con el usuario actual
 * como dependencia: cambia de IDENTIDAD en cada login/logout, y `useDoc`
 * abre una suscripción nueva cada vez que cambia (ver su propio doc).
 */
export function SincronizadorTemaNegocio({ children }: SincronizadorTemaNegocioProps) {
  const { usuario } = useAuth();

  const temaRef = useMemo(
    () => doc(db, 'configuracion', 'tema').withConverter(temaNegocioConverter),
    [usuario],
  );
  const { datos: semilla, cargando, error } = useDoc(temaRef);

  const tokensCalculados = useMemo<TokensGenerados | null>(() => {
    if (semilla === null) return null;
    try {
      return generarPaleta(semilla);
    } catch {
      // Último fusible, no código con cobertura de "camino feliz": el AA de
      // `generarPaleta` es por construcción (anclaje de luminancia WCAG,
      // packages/core/src/paleta.ts) y el test exhaustivo de la tanda TM
      // exige 0 reparaciones en las 1080 combinaciones matiz×tinte — este
      // catch no debería dispararse nunca en la práctica. Si algún día lo
      // hace (p. ej. una receta futura que rompa el anclaje), el fallo es
      // puramente cosmético: preferimos caer en silencio al tema base antes
      // que tirar abajo toda la app. No se loguea a consola a propósito: no
      // es algo accionable por el usuario ni por soporte — mismo criterio
      // que `temaNegocioConverter` ante un dato corrupto.
      return null;
    }
  }, [semilla]);

  // Arranca en `undefined` ("todavía no sé"), NO en `null` ("confirmado sin
  // tema") — ver el JSDoc de arriba y el de `ProveedorTemaNegocioProps.tokens`.
  const [tokens, setTokens] = useState<TokensGenerados | null | undefined>(undefined);

  useEffect(() => {
    // Ver el comentario "PERMISOS VS. SIN TEMA" arriba: mientras carga o hay
    // un error de lectura no hay nada CONFIRMADO todavía, así que no se toca
    // el estado. Solo una respuesta definitiva de Firestore (con o sin doc
    // válido) actualiza lo que recibe `ProveedorTemaNegocio`.
    if (cargando || error !== null) return;
    setTokens(tokensCalculados);
  }, [cargando, error, tokensCalculados]);

  return <ProveedorTemaNegocio tokens={tokens}>{children}</ProveedorTemaNegocio>;
}
