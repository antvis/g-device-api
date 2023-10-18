import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve('./examples'),
  server: { port: 8080, open: '/' },
  base: '/g-device-api/',
  define: {
    global: {},
  },
});
