import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __VERSION__: JSON.stringify('0.0.0-test') },
  resolve: {
    alias: { '@osopostal/js': fileURLToPath(new URL('../js/src/index.ts', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
  },
});
