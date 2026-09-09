import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'dist/client',
  resolve: {
    alias: {
      three: fileURLToPath(new URL('./dist/client/assets/three.module.js', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    outDir: '../build',
  },
});
