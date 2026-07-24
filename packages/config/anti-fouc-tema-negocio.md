# Anti-FOUC de "Colores del negocio" (docs/06-ui-ux.md §4)

Snippet canónico para el script inline de `index.html` que evita el flash de
tema base al arrancar la app, cuando el negocio tiene un tema propio
guardado (tercer eje de tema, tanda TM). **Copy-paste documentado, no plugin
de Vite**: cada app de este monorepo tiene su propio `index.html` y su propio
proyecto Firebase — no hay runtime compartido entre apps, así que un snippet
portable pegado a mano es más simple y más auditable línea por línea que una
dependencia nueva.

## Requisitos previos

Este snippet asume que la app YA tiene el anti-FOUC base de Modo/Estilo
(docs §4, dos primeros ejes) y que, en el punto donde se pega, ya existe una
variable `modoEfectivo` (`'light'` | `'dark'`) calculada — ver
`apps/quesarte/index.html` para el anti-FOUC base completo de referencia.

También asume que la app usa `@gestion/ui` y que su `ProveedorTemaNegocio`
(`packages/ui/src/ProveedorTemaNegocio.tsx`) va a reutilizar el mismo
`<style id="tema-negocio">` / atributo `data-tema-negocio` que este snippet
crea (ver `packages/ui/src/temaNegocio.ts`, `ID_STYLE_TEMA_NEGOCIO` /
`ATRIBUTO_TEMA_NEGOCIO`) — los nombres están hardcodeados a propósito en
ambos lados, no son configurables.

## Dónde pegarlo

Dentro del `try` del script anti-FOUC existente, **después** de calcular
`modoEfectivo` y **antes** de fijar `<meta name="theme-color">`.

## El snippet

```js
// BEGIN anti-fouc-tema-negocio (snippet canónico, ver
// packages/config/anti-fouc-tema-negocio.md — copiar tal cual a la
// próxima app, requiere `modoEfectivo` ya calculado arriba).
var colorTemaNegocio = null;
var cacheTemaNegocio = window.localStorage.getItem('temaNegocio');
if (cacheTemaNegocio) {
  var datosTemaNegocio = JSON.parse(cacheTemaNegocio);
  if (
    datosTemaNegocio &&
    datosTemaNegocio.v === 1 &&
    typeof datosTemaNegocio.css === 'string' &&
    datosTemaNegocio.css.indexOf(':root[data-tema-negocio]') === 0 &&
    datosTemaNegocio.css.indexOf('</style') === -1
  ) {
    var styleTemaNegocio = document.createElement('style');
    styleTemaNegocio.id = 'tema-negocio';
    styleTemaNegocio.textContent = datosTemaNegocio.css;
    document.head.appendChild(styleTemaNegocio);
    document.documentElement.setAttribute('data-tema-negocio', '');

    var hexTemaNegocio = datosTemaNegocio.themeColor && datosTemaNegocio.themeColor[modoEfectivo];
    if (typeof hexTemaNegocio === 'string' && /^#[0-9a-f]{6}$/i.test(hexTemaNegocio)) {
      colorTemaNegocio = hexTemaNegocio;
    }
  }
}
// END anti-fouc-tema-negocio
```

Y al fijar `theme-color`, preferir `colorTemaNegocio` sobre el mapa estático
de la app:

```js
var metaThemeColor = document.querySelector('meta[name="theme-color"]');
if (metaThemeColor) {
  metaThemeColor.setAttribute(
    'content',
    colorTemaNegocio || MAPA_THEME_COLOR[estiloEfectivo][modoEfectivo],
  );
}
```

## Por qué cada chequeo de sanidad

El cache es `localStorage`, escrito por `escribirCacheTemaNegocio`
(`packages/ui/src/temaNegocio.ts`) pero LEÍDO acá sin ningún tipo — un dato
corrupto, de otra versión, o (peor) manipulado a mano en devtools no debe
poder romper el `<head>` del documento:

- `v === 1`: shape de cache de una versión que este script entiende. Un bump
  futuro de `CacheTemaNegocio.v` obliga a revisar este snippet antes de
  confiar en el cache viejo.
- `typeof css === 'string'`: nunca asumir el tipo de algo que salió de
  `JSON.parse` sobre un string arbitrario.
- `css.indexOf(':root[data-tema-negocio]') === 0`: el bloque DEBE empezar
  exactamente con el selector que `serializarVariablesTemaNegocio` emite —
  cualquier otra cosa (texto random, otro selector) no es el CSS que
  esperamos y no se inyecta.
- `css.indexOf('</style') === -1`: la salvaguarda contra inyección. El valor
  se asigna con `textContent` (nunca `innerHTML`), que ya de por sí no
  ejecuta HTML/JS — este chequeo es una segunda capa: ni siquiera un
  `</style><script>...` armado a mano en el string logra cerrar la etiqueta
  antes de tiempo si en algún punto el pipeline cambiara a `innerHTML`.
- El hex de `theme-color` se valida con `/^#[0-9a-f]{6}$/i` porque ese valor
  viaja directo a un atributo del navegador (`meta[content]`): un string que
  no sea un hex de 6 dígitos simplemente se ignora y cae al mapa estático,
  nunca se asigna a ciegas.

## Qué pasa si el cache no pasa la sanidad, o no existe

`colorTemaNegocio` queda en `null` y no se crea el `<style>` ni se fija el
atributo: la app arranca con el tema base (mismo comportamiento que un
negocio sin tema propio). El primer render de React reconcilia todo esto de
verdad vía `SincronizadorTemaNegocio` + `ProveedorTemaNegocio`
(`apps/quesarte/src/componentes/SincronizadorTemaNegocio.tsx` en Quesarte) —
este script es solo el atajo visual antes de que el bundle cargue, nunca la
fuente de verdad.

## Sin tests

Este script no tiene test unitario (corre antes de que exista cualquier
runtime de JS con el que testear, en un `<script>` plano dentro de
`index.html`) — la cobertura es este documento + revisión línea por línea en
el review de cada app que lo pega.
