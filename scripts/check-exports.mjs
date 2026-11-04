// Verifica que todas las rutas de main/module/types/exports/jsdelivr/unpkg de
// cada paquete existan después del build (evita publicar sin tipos o sin bundle).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const packagesDir = new URL('../packages/', import.meta.url).pathname;
const missing = [];

function collect(value, out) {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object') for (const nested of Object.values(value)) collect(nested, out);
  return out;
}

for (const name of readdirSync(packagesDir)) {
  const dir = join(packagesDir, name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const paths = collect([pkg.main, pkg.module, pkg.types, pkg.jsdelivr, pkg.unpkg, pkg.exports], []);
  for (const path of new Set(paths)) {
    if (!existsSync(join(dir, path))) missing.push(`${pkg.name}: ${path}`);
  }
}

if (missing.length > 0) {
  console.error(`Rutas de package.json que no existen tras el build:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log('Todas las rutas de package.json existen.');
