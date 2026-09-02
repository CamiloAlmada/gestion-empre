import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Agrupa dependencias de `node_modules` en chunks vendor separados del
 * código de la app (F2-D0, docs/04: nota de bundle). Elegido por sobre
 * `splitVendorChunkPlugin` (built-in de Vite) porque ese plugin junta TODO
 * `node_modules` en un único chunk "vendor" — acá se necesitan dos grupos
 * bien diferenciados por frecuencia de cambio:
 *
 * - `vendor-firebase`: el SDK de Firebase (Auth + Firestore), el más
 *   pesado y el que menos cambia entre deploys de la app.
 * - `vendor-react`: React + react-dom + react-router (+ `scheduler`,
 *   dependencia interna de react-dom que siempre se actualiza junto con
 *   él) — también estable entre deploys propios.
 *
 * El resto (código de la app: `Venta` + `Shell` + contexts en el chunk
 * principal, cada pantalla ruteada en su propio chunk lazy, ver App.tsx)
 * NO se toca acá: Rollup lo sigue partiendo como ya lo hacía por los
 * `import()` dinámicos.
 *
 * Beneficio en una PWA de deploys frecuentes: hoy cada deploy invalidaba
 * el chunk principal entero (~960 kB) aunque solo cambiara código propio;
 * con los vendors separados, una actualización que no toca dependencias
 * solo re-descarga el código de la app.
 */
function chunkVendor(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  if (/[\\/]node_modules[\\/](@firebase|firebase)[\\/]/.test(id)) {
    return 'vendor-firebase';
  }
  if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id)) {
    return 'vendor-react';
  }
  return undefined;
}

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: chunkVendor,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-source.svg'],
      manifest: {
        name: 'Quesarte',
        short_name: 'Quesarte',
        description: 'Gestión de venta y stock para la quesería',
        lang: 'es',
        start_url: '/',
        display: 'standalone',
        // Mismo negro que theme_color (2026-09-02): es el fondo de la pantalla
        // de arranque y del marco con que Chrome envuelve la app instalada en
        // Android 15+. En blanco, el splash parpadeaba claro en modo oscuro.
        background_color: '#040302',
        // Negro del fondo oscuro Minimalista (MAPA_THEME_COLOR.minimalista.dark en
        // apps/quesarte/src/componentes/MetaThemeColor.tsx). Antes era el ámbar
        // primario, y en el WebAPK de Android la barra de estado tomaba ESTE
        // valor e ignoraba el <meta name="theme-color"> que la app actualiza al
        // cambiar los colores del negocio: quedaba una franja dorada fija sobre
        // una app azul (reporte del dueño, 2026-09-02). El manifest admite un solo
        // color, y el dueño pidió negro: integra con el fondo oscuro y es neutro
        // frente a cualquier paleta de marca.
        theme_color: '#040302',
        icons: [
          {
            src: 'icons/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
