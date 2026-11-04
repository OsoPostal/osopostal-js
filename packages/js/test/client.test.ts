import { describe, expect, it } from 'vitest';
import { createClient, OsoPostalError } from '../src';
import { CENTRO, json, mockFetch } from './fixtures';

describe('createClient', () => {
  it('consulta el endpoint público con la key en el query string', async () => {
    const fetch = mockFetch();
    const client = createClient({ publicKey: 'osp_pk_test', fetch });

    const result = await client.lookup('06000');

    expect(fetch.calls).toEqual(['https://api.osopostal.com/v1/public/codigos-postales/06000?key=osp_pk_test']);
    expect(result).toEqual({ status: 'found', postalCode: CENTRO.data, branding: true });
  });

  it('acepta otra URL base y headers propios (proxy)', async () => {
    let headers: HeadersInit | undefined;
    const fetch = mockFetch();
    const client = createClient({
      baseUrl: 'https://mitienda.com/osopostal/',
      headers: { 'X-Proxy': '1' },
      fetch: (input, init) => {
        headers = init?.headers;
        return fetch(input, init);
      },
    });

    await client.lookup('06000');

    expect(fetch.calls).toEqual(['https://mitienda.com/osopostal/public/codigos-postales/06000']);
    expect(headers).toMatchObject({ Accept: 'application/json', 'X-Proxy': '1' });
  });

  it('guarda en caché los resultados, incluido el 404', async () => {
    const fetch = mockFetch();
    const client = createClient({ publicKey: 'osp_pk_test', fetch });

    await client.lookup('06000');
    await client.lookup('06000');
    expect(await client.lookup('99999')).toEqual({ status: 'not-found', codigoPostal: '99999' });
    await client.lookup('99999');

    expect(fetch.calls).toHaveLength(2);

    client.clearCache();
    await client.lookup('06000');
    expect(fetch.calls).toHaveLength(3);
  });

  it('marca branding en false solo si la API lo dice', async () => {
    const client = createClient({
      fetch: mockFetch(() => json({ ...CENTRO, meta: { widget: { branding: false } } })),
    });

    expect(await client.lookup('06000')).toMatchObject({ branding: false });
  });

  it('rechaza un CP que no tiene 5 dígitos sin hacer la petición', async () => {
    const fetch = mockFetch();
    const client = createClient({ fetch });

    await expect(client.lookup('0600')).rejects.toMatchObject({ code: 'invalid_postal_code' });
    expect(fetch.calls).toHaveLength(0);
  });

  it('convierte los errores de la API en OsoPostalError con su código', async () => {
    const client = createClient({
      fetch: mockFetch(() =>
        json({ error: { code: 'origin_not_allowed', message: 'Origen no permitido.', details: { origin: 'x' } } }, 403),
      ),
    });

    const error = await client.lookup('06000').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(OsoPostalError);
    expect(error).toMatchObject({ code: 'origin_not_allowed', status: 403, message: 'Origen no permitido.' });
  });

  it('no guarda los errores en caché', async () => {
    let fail = true;
    const fetch = mockFetch(() => (fail ? json({ error: { code: 'rate_limited', message: '' } }, 429) : undefined));
    const client = createClient({ fetch });

    await expect(client.lookup('06000')).rejects.toMatchObject({ code: 'rate_limited' });
    fail = false;
    await expect(client.lookup('06000')).resolves.toMatchObject({ status: 'found' });
  });

  it('reporta los errores de red y las respuestas inválidas', async () => {
    const offline = createClient({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(offline.lookup('06000')).rejects.toMatchObject({ code: 'network_error' });

    const html = createClient({ fetch: mockFetch(() => new Response('<html>', { status: 200 })) });
    await expect(html.lookup('06000')).rejects.toMatchObject({ code: 'invalid_response' });

    const shape = createClient({ fetch: mockFetch(() => json({ data: {} })) });
    await expect(shape.lookup('06000')).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('corta la consulta al pasar el timeout', async () => {
    const client = createClient({ timeout: 20, fetch: mockFetch(() => new Promise<Response>(() => {})) });

    await expect(client.lookup('06000')).rejects.toMatchObject({ code: 'timeout' });
  });

  it('cancela la consulta anterior si cambia el CP', async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetch = mockFetch((url) =>
      url.includes('06000') ? new Promise<Response>((resolve) => pending.push(resolve)) : undefined,
    );
    const client = createClient({ fetch });

    const first = client.lookup('06000');
    const second = client.lookup('50000');

    await expect(first).rejects.toMatchObject({ code: 'aborted' });
    await expect(second).resolves.toMatchObject({ status: 'found' });
  });

  it('con una señal propia no cancela las consultas de otros', async () => {
    const fetch = mockFetch();
    const client = createClient({ fetch });
    const controller = new AbortController();

    const first = client.lookup('06000', { signal: controller.signal });
    const second = client.lookup('50000', { signal: new AbortController().signal });
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);

    controller.abort();
    await expect(client.lookup('99998', { signal: controller.signal })).rejects.toMatchObject({ code: 'aborted' });
  });
});
