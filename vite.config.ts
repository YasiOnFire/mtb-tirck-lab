import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { existsSync } from 'node:fs';

const downloadedModelsAvailable = [
  './public/models/downloaded/torque.glb',
  './public/assets/rider/imported-rider.glb',
  './public/assets/helmet/imported-helmet.glb',
].every(file => existsSync(new URL(file, import.meta.url)));

export default defineConfig({
  plugins: [vue()], base: './',
  define: { __DOWNLOADED_MODELS_AVAILABLE__: JSON.stringify(downloadedModelsAvailable) },
  test: { include: ['src/tests/**/*.test.ts'] },
  build: { chunkSizeWarningLimit: 1800 }
});
