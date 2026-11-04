import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig([
  {
    entry: { osopostal: 'src/index.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.min.js' }),
    minify: true,
    sourcemap: true,
    clean: true,
    target: 'es2019',
    platform: 'browser',
    define: { __VERSION__: JSON.stringify(version) },
    // El núcleo va dentro del bundle: el widget se carga con un solo <script>.
    noExternal: ['@osopostal/js'],
  },
  {
    entry: { index: 'src/index.ts' },
    // Sin formato, tsup usa CJS y con "type": "module" emite index.d.cts.
    format: ['esm'],
    dts: { only: true, resolve: true },
    clean: false,
  },
]);
