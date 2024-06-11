import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import path from 'path';

export default defineConfig({
  root: path.resolve('./examples'),
  server: { port: 8080, open: '/' },
  base: '/g-device-api/',
  define: {
    global: {},
  },
  plugins: [wasm(), topLevelAwait()],
  assetsInclude: ['**/*.dds'],
});
