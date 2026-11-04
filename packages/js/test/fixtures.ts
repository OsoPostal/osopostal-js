import type { PublicPostalCodeResponse } from '../src/types';

export const CENTRO: PublicPostalCodeResponse = {
  data: {
    codigo_postal: '06000',
    estado: { clave: '09', nombre: 'Ciudad de México', iso: 'MX-CMX' },
    municipio: { clave: '015', nombre: 'Cuauhtémoc' },
    asentamientos: [
      { nombre: 'Centro (Área 1)', tipo: 'Colonia', zona: 'Urbano', ciudad: 'Ciudad de México' },
      { nombre: 'Centro (Área 2)', tipo: 'Colonia', zona: 'Urbano', ciudad: 'Ciudad de México' },
    ],
  },
  meta: { widget: { branding: true } },
};

export const TOLUCA: PublicPostalCodeResponse = {
  data: {
    codigo_postal: '50000',
    estado: { clave: '15', nombre: 'México', iso: 'MX-MEX' },
    municipio: { clave: '106', nombre: 'Toluca' },
    asentamientos: [{ nombre: 'Toluca de Lerdo Centro', tipo: 'Colonia', zona: 'Urbano', ciudad: 'Toluca de Lerdo' }],
  },
  meta: { widget: { branding: false } },
};

export const RESPONSES: Record<string, PublicPostalCodeResponse> = { '06000': CENTRO, '50000': TOLUCA };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export interface MockFetch {
  (input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  calls: string[];
}

/**
 * `fetch` falso: responde con los fixtures por CP, 404 para el resto, o con
 * `override` si se pasa. Respeta la señal de cancelación.
 */
export function mockFetch(override?: (url: string) => Response | Promise<Response> | undefined): MockFetch {
  const calls: string[] = [];
  const fn = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(url);

    return new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));

      const custom = override?.(url);
      if (custom) {
        Promise.resolve(custom).then(resolve, reject);
        return;
      }
      const cp = /codigos-postales\/(\d{5})/.exec(url)?.[1] ?? '';
      const body = RESPONSES[cp];
      resolve(
        body
          ? json(body)
          : json({ error: { code: 'postal_code_not_found', message: `El código postal ${cp} no existe.` } }, 404),
      );
    });
  }) as MockFetch;
  fn.calls = calls;

  return fn;
}

/** Simula que el usuario escribe en un campo. */
export function type(field: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Simula que el usuario elige una opción. */
export function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}
