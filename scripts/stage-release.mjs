// Deja en staging de npm (`pnpm stage publish`) cada paquete con una versión
// nueva y crea su tag `<nombre>@<versión>`. Un maintainer la aprueba después
// con 2FA en npmjs.com (Staged Packages) o con `pnpm stage approve <id>`.
//
// Corre en cada push a main sin changesets pendientes, así que es idempotente:
// se salta las versiones que ya tienen tag en origin (staged o publicadas) o
// que ya están en npm. Una versión staged no aparece en `npm view` y npm
// rechaza volver a subirla, por eso el tag es la marca de "ya enviada".
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const run = (command, args) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function tagExists(tag) {
  return run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]) !== '';
}

function isPublished(name, version) {
  try {
    return run('npm', ['view', `${name}@${version}`, 'version']) === version;
  } catch {
    return false; // E404: la versión (o el paquete) no existe todavía.
  }
}

const staged = [];

for (const dir of readdirSync(join(root, 'packages'))) {
  const cwd = join(root, 'packages', dir);
  const { name, version, private: isPrivate } = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  const tag = `${name}@${version}`;

  if (isPrivate) continue;
  if (tagExists(tag) || isPublished(name, version)) {
    console.log(`= ${tag}: ya enviada, se omite.`);
    continue;
  }

  console.log(`→ ${tag}: enviando a staging…`);
  execFileSync('pnpm', ['stage', 'publish', '--access', 'public', '--no-git-checks'], { cwd, stdio: 'inherit' });

  run('git', ['tag', tag]);
  run('git', ['push', 'origin', `refs/tags/${tag}`]);
  staged.push(tag);
}

if (staged.length > 0) {
  console.log(`\nEn staging: ${staged.join(', ')}.`);
  console.log('Apruébalas con 2FA en npmjs.com → Staged Packages, o con `pnpm stage approve <id>`.');
} else {
  console.log('Nada nuevo que enviar a staging.');
}
