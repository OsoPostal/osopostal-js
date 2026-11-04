// Presupuesto de tamaño del bundle: < 10 KB gzip.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const LIMIT = 10 * 1024;
const file = new URL('../dist/osopostal.min.js', import.meta.url);
const size = gzipSync(readFileSync(file), { level: 9 }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(2)} KB`;

console.log(`@osopostal/widget: ${kb(size)} gzip (límite ${kb(LIMIT)})`);

if (size > LIMIT) {
  console.error('El bundle supera el presupuesto de tamaño.');
  process.exit(1);
}
