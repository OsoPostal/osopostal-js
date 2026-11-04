// Servidor estático mínimo, sin dependencias, para la demo y el E2E.
// Uso: node scripts/serve.mjs --port 5500 --root packages/widget
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export function createStaticServer(root) {
  const base = resolve(root);

  return createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    let file = normalize(join(base, decodeURIComponent(pathname)));

    if (!file.startsWith(base)) {
      response.writeHead(403).end();
      return;
    }

    try {
      if (statSync(file).isDirectory()) {
        if (!pathname.endsWith('/')) {
          response.writeHead(301, { Location: `${pathname}/` }).end();
          return;
        }
        file = join(file, 'index.html');
      }
      statSync(file);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    response.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(file).pipe(response);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? fallback : process.argv[index + 1];
  };
  const port = Number(arg('port', '5500'));
  const root = arg('root', '.');

  createStaticServer(root).listen(port, () => {
    console.log(`Sirviendo ${resolve(root)} en http://localhost:${port}/`);
    console.log(`Demo: http://localhost:${port}/demo/`);
  });
}
