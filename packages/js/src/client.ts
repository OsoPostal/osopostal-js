import type { LookupResult, PublicPostalCodeResponse } from './types';

export const DEFAULT_BASE_URL = 'https://api.osopostal.com/v1';
export const DEFAULT_TIMEOUT = 3000;

export interface ClientOptions {
  /** Key pública (`osp_pk_...`). Se envía en el query string para evitar el preflight de CORS. */
  publicKey?: string;
  /** URL base de la API, sin `/` final. Por defecto `https://api.osopostal.com/v1`. */
  baseUrl?: string;
  /** Tiempo máximo por consulta en milisegundos. Por defecto 3000. */
  timeout?: number;
  /**
   * Headers extra para cada petición. Pensado para proxies propios (por ejemplo,
   * un backend que agrega la key secreta). Ojo: en el navegador, un header
   * propio convierte la petición en no simple y provoca un preflight de CORS.
   */
  headers?: Record<string, string>;
  /** Implementación de `fetch`. Por defecto la global. */
  fetch?: typeof fetch;
}

export interface LookupOptions {
  /**
   * Señal para cancelar la consulta. Si se pasa, quien llama controla la
   * cancelación; si no, cada `lookup` cancela la consulta anterior sin señal
   * que siga pendiente.
   */
  signal?: AbortSignal;
}

export interface Client {
  /** Consulta un código postal de 5 dígitos. Un CP inexistente resuelve con `status: 'not-found'`. */
  lookup(codigoPostal: string, options?: LookupOptions): Promise<LookupResult>;
  /** Vacía la caché en memoria de la sesión. */
  clearCache(): void;
}

export type OsoPostalErrorCode =
  | 'invalid_postal_code'
  | 'aborted'
  | 'timeout'
  | 'network_error'
  | 'invalid_response'
  | (string & {});

/** Error de una consulta. `code` es el de la API (`origin_not_allowed`, `rate_limited`...) o uno local. */
export class OsoPostalError extends Error {
  readonly code: OsoPostalErrorCode;
  readonly status: number | undefined;

  constructor(code: OsoPostalErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'OsoPostalError';
    this.code = code;
    this.status = status;
  }
}

const POSTAL_CODE = /^\d{5}$/;

export function createClient(options: ClientOptions = {}): Client {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const cache = new Map<string, LookupResult>();
  let pending: AbortController | undefined;

  function urlFor(codigoPostal: string): string {
    const url = `${baseUrl}/public/codigos-postales/${codigoPostal}`;

    return options.publicKey ? `${url}?key=${encodeURIComponent(options.publicKey)}` : url;
  }

  async function lookup(codigoPostal: string, lookupOptions: LookupOptions = {}): Promise<LookupResult> {
    if (!POSTAL_CODE.test(codigoPostal)) {
      throw new OsoPostalError('invalid_postal_code', `"${codigoPostal}" no es un código postal de 5 dígitos.`);
    }

    const cached = cache.get(codigoPostal);
    if (cached) {
      return cached;
    }

    const controller = new AbortController();
    const external = lookupOptions.signal;

    if (external) {
      if (external.aborted) {
        throw abortedError();
      }
      external.addEventListener('abort', () => controller.abort(), { once: true });
    } else {
      pending?.abort();
      pending = controller;
    }

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    try {
      const fetchImpl = options.fetch ?? globalThis.fetch;
      let response: Response;

      try {
        response = await fetchImpl(urlFor(codigoPostal), {
          method: 'GET',
          headers: { Accept: 'application/json', ...options.headers },
          signal: controller.signal,
          credentials: 'omit',
        });
      } catch (error) {
        if (timedOut) {
          throw new OsoPostalError('timeout', `La consulta tardó más de ${timeout} ms.`);
        }
        if (controller.signal.aborted) {
          throw abortedError();
        }
        throw new OsoPostalError('network_error', error instanceof Error ? error.message : 'Error de red.');
      }

      const body = await readJson(response, controller.signal, () => timedOut, timeout);

      if (response.status === 404) {
        const result: LookupResult = { status: 'not-found', codigoPostal };
        cache.set(codigoPostal, result);
        return result;
      }

      if (!response.ok) {
        const error = errorFrom(body);
        throw new OsoPostalError(
          error?.code ?? 'http_error',
          error?.message ?? `La API respondió con ${response.status}.`,
          response.status,
        );
      }

      const data = (body as PublicPostalCodeResponse | undefined)?.data;
      if (!data || typeof data.codigo_postal !== 'string' || !Array.isArray(data.asentamientos)) {
        throw new OsoPostalError('invalid_response', 'La respuesta de la API no tiene el formato esperado.', response.status);
      }

      const result: LookupResult = {
        status: 'found',
        postalCode: data,
        branding: (body as PublicPostalCodeResponse).meta?.widget?.branding !== false,
      };
      cache.set(codigoPostal, result);
      return result;
    } finally {
      clearTimeout(timer);
      if (pending === controller) {
        pending = undefined;
      }
    }
  }

  return {
    lookup,
    clearCache: () => cache.clear(),
  };
}

function abortedError(): OsoPostalError {
  return new OsoPostalError('aborted', 'La consulta se canceló.');
}

async function readJson(
  response: Response,
  signal: AbortSignal,
  timedOut: () => boolean,
  timeout: number,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    if (timedOut()) {
      throw new OsoPostalError('timeout', `La consulta tardó más de ${timeout} ms.`);
    }
    if (signal.aborted) {
      throw abortedError();
    }
    if (response.ok) {
      throw new OsoPostalError('invalid_response', 'La respuesta de la API no es JSON.', response.status);
    }
    return undefined;
  }
}

function errorFrom(body: unknown): { code?: string; message?: string } | undefined {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error: unknown }).error;
    if (error && typeof error === 'object') {
      return error as { code?: string; message?: string };
    }
  }
  return undefined;
}
