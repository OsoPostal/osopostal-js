// Mock del endpoint público de OsoPostal con las mismas reglas que la app:
// key pública en el query string, Origin permitido por integración, CORS y
// errores con el formato { error: { code, message } }.
import { createServer } from 'node:http';

export const KEYS = {
  // Free: localhost está permitido y lleva marca de agua.
  osp_pk_test: { origins: ['http://localhost:5173'], branding: true },
  // Pro: sin marca de agua.
  osp_pk_pro: { origins: ['http://localhost:5173'], branding: false },
  // Solo permite otro dominio: el widget recibe 403 origin_not_allowed.
  osp_pk_blocked: { origins: ['https://mitienda.com'], branding: true },
};

const POSTAL_CODES = {
  '06000': {
    codigo_postal: '06000',
    estado: { clave: '09', nombre: 'Ciudad de México', iso: 'MX-CMX' },
    municipio: { clave: '015', nombre: 'Cuauhtémoc' },
    asentamientos: [
      { nombre: 'Centro (Área 1)', tipo: 'Colonia', zona: 'Urbano', ciudad: 'Ciudad de México' },
      { nombre: 'Centro (Área 2)', tipo: 'Colonia', zona: 'Urbano', ciudad: 'Ciudad de México' },
      { nombre: 'Centro (Área 3)', tipo: 'Colonia', zona: 'Urbano', ciudad: 'Ciudad de México' },
    ],
  },
  '50000': {
    codigo_postal: '50000',
    estado: { clave: '15', nombre: 'México', iso: 'MX-MEX' },
    municipio: { clave: '106', nombre: 'Toluca' },
    asentamientos: [{ nombre: 'Toluca de Lerdo Centro', tipo: 'Colonia', zona: 'Urbano', ciudad: 'Toluca de Lerdo' }],
  },
};

const EXPOSED = 'X-RateLimit-Remaining, X-RateLimit-Burst-Remaining, X-RateLimit-Daily-Remaining, Retry-After, X-Data-Version';

export function createMockApi() {
  return createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const origin = request.headers.origin;

    const send = (status, body) => {
      const headers = { 'Content-Type': 'application/json', Vary: 'Origin', 'Access-Control-Expose-Headers': EXPOSED };
      if (origin) headers['Access-Control-Allow-Origin'] = origin;
      response.writeHead(status, headers).end(JSON.stringify(body));
    };

    const match = /^\/v1\/public\/codigos-postales\/([^/]+)$/.exec(url.pathname);
    if (request.method !== 'GET' || !match) {
      send(404, { error: { code: 'not_found', message: 'Ruta no encontrada.' } });
      return;
    }

    const integration = KEYS[url.searchParams.get('key') ?? ''];
    if (!integration) {
      send(401, { error: { code: 'invalid_public_key', message: 'Key pública ausente, inválida o revocada.' } });
      return;
    }

    if (!origin || !integration.origins.includes(origin)) {
      send(403, {
        error: { code: 'origin_not_allowed', message: 'El origen no está permitido.', details: { origin: origin ?? null } },
      });
      return;
    }

    const postalCode = POSTAL_CODES[match[1]];
    if (!postalCode) {
      send(404, { error: { code: 'postal_code_not_found', message: `El código postal ${match[1]} no existe.` } });
      return;
    }

    send(200, { data: postalCode, meta: { widget: { branding: integration.branding } } });
  });
}
