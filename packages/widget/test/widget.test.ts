import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OsoPostalGlobal } from '../src';
import { mockFetch, type } from '../../js/test/fixtures';

/**
 * Carga el widget como lo haría el navegador: con `document.currentScript`
 * apuntando a un <script> con los atributos data-*.
 */
async function loadWidget(data: Record<string, string>): Promise<OsoPostalGlobal> {
  const script = document.createElement('script');
  for (const [name, value] of Object.entries(data)) {
    script.setAttribute(`data-${name}`, value);
  }
  document.head.append(script);
  Object.defineProperty(document, 'currentScript', { value: script, configurable: true });

  vi.resetModules();
  await import('../src/index');
  Object.defineProperty(document, 'currentScript', { value: null, configurable: true });

  return window.OsoPostal as OsoPostalGlobal;
}

const field = (selector: string) => document.querySelector(selector) as HTMLInputElement;

let fetch: ReturnType<typeof mockFetch>;

beforeEach(() => {
  fetch = mockFetch();
  vi.stubGlobal('fetch', fetch);
});

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  delete window.OsoPostal;
  vi.unstubAllGlobals();
});

describe('@osopostal/widget', () => {
  it('se inicializa con los selectores del <script>', async () => {
    document.body.innerHTML = `
      <form>
        <input id="cp"><input id="estado"><input id="municipio"><input id="colonia">
      </form>`;

    await loadWidget({
      key: 'osp_pk_test',
      cp: '#cp',
      estado: '#estado',
      municipio: '#municipio',
      colonia: '#colonia',
      debounce: '0',
    });
    type(field('#cp'), '06000');

    await vi.waitFor(() => expect(field('#municipio').value).toBe('Cuauhtémoc'));
    expect(field('#estado').value).toBe('Ciudad de México');
    expect(document.querySelector('select.osopostal-colonia')).not.toBeNull();
    expect(fetch.calls[0]).toBe('https://api.osopostal.com/v1/public/codigos-postales/06000?key=osp_pk_test');
  });

  it('toma la URL base, el formato del estado y el timeout del <script>', async () => {
    document.body.innerHTML = '<form><input id="cp"><input id="estado"></form>';

    await loadWidget({
      key: 'osp_pk_test',
      'base-url': 'http://localhost:4010/v1',
      'estado-format': 'iso',
      cp: '#cp',
      estado: '#estado',
      debounce: '0',
    });
    type(field('#cp'), '06000');

    await vi.waitFor(() => expect(field('#estado').value).toBe('MX-CMX'));
    expect(fetch.calls[0]).toBe('http://localhost:4010/v1/public/codigos-postales/06000?key=osp_pk_test');
  });

  it('con selectores que coinciden con varios CP, inicializa cada formulario por separado', async () => {
    document.body.innerHTML = `
      <form id="a"><input class="cp"><input class="mun"></form>
      <form id="b"><input class="cp"><input class="mun"></form>`;

    await loadWidget({ key: 'osp_pk_test', cp: '.cp', municipio: '.mun', debounce: '0' });
    type(field('#b .cp'), '50000');

    await vi.waitFor(() => expect(field('#b .mun').value).toBe('Toluca'));
    expect(field('#a .mun').value).toBe('');
  });

  it('se inicializa con atributos data-osopostal, un controlador por data-osopostal-form', async () => {
    document.body.innerHTML = `
      <div data-osopostal-form id="facturacion">
        <input data-osopostal="cp"><input data-osopostal="municipio">
      </div>
      <div data-osopostal-form id="envio" data-osopostal-estado-format="clave">
        <input data-osopostal="cp"><input data-osopostal="estado"><input data-osopostal="municipio">
      </div>`;

    await loadWidget({ key: 'osp_pk_test', debounce: '0' });
    type(field('#facturacion [data-osopostal="cp"]'), '06000');
    type(field('#envio [data-osopostal="cp"]'), '50000');

    await vi.waitFor(() => expect(field('#facturacion [data-osopostal="municipio"]').value).toBe('Cuauhtémoc'));
    await vi.waitFor(() => expect(field('#envio [data-osopostal="municipio"]').value).toBe('Toluca'));
    expect(field('#envio [data-osopostal="estado"]').value).toBe('15');
  });

  it('usa el <form> como límite si no hay data-osopostal-form', async () => {
    document.body.innerHTML = `
      <form id="a"><input data-osopostal="cp"><input data-osopostal="municipio"></form>
      <form id="b"><input data-osopostal="cp"><input data-osopostal="municipio"></form>`;

    await loadWidget({ key: 'osp_pk_test', debounce: '0' });
    type(field('#a [data-osopostal="cp"]'), '06000');

    await vi.waitFor(() => expect(field('#a [data-osopostal="municipio"]').value).toBe('Cuauhtémoc'));
    expect(field('#b [data-osopostal="municipio"]').value).toBe('');
  });

  it('espera a DOMContentLoaded si el documento sigue cargando', async () => {
    Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });
    await loadWidget({ key: 'osp_pk_test', debounce: '0' });
    document.body.innerHTML = '<form><input data-osopostal="cp"><input data-osopostal="municipio"></form>';
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });

    document.dispatchEvent(new Event('DOMContentLoaded'));
    type(field('[data-osopostal="cp"]'), '06000');

    await vi.waitFor(() => expect(field('[data-osopostal="municipio"]').value).toBe('Cuauhtémoc'));
  });

  it('expone window.OsoPostal.attach con la key del <script> para SPAs', async () => {
    const OsoPostal = await loadWidget({ key: 'osp_pk_test' });
    document.body.innerHTML = '<form id="tarde"><input name="zip"><input name="mun"></form>';

    OsoPostal.attach('#tarde', { fields: { cp: '[name=zip]', municipio: '[name=mun]' }, debounce: 0 });
    type(field('[name=zip]'), '06000');

    await vi.waitFor(() => expect(field('[name=mun]').value).toBe('Cuauhtémoc'));
    expect(fetch.calls[0]).toContain('key=osp_pk_test');
    expect(OsoPostal.version).toBe('0.0.0-test');
  });

  it('init no vuelve a inicializar formularios ya inicializados', async () => {
    document.body.innerHTML = '<form><input data-osopostal="cp"></form>';
    const OsoPostal = await loadWidget({ key: 'osp_pk_test', debounce: '0' });

    expect(document.querySelectorAll('.osopostal-status')).toHaveLength(1);

    document.body.insertAdjacentHTML('beforeend', '<form id="nuevo"><input data-osopostal="cp"></form>');
    expect(OsoPostal.init()).toHaveLength(1);
    expect(OsoPostal.init()).toHaveLength(0);
    expect(document.querySelectorAll('.osopostal-status')).toHaveLength(2);
  });

  it('comparte la caché entre formularios con la misma key', async () => {
    document.body.innerHTML = `
      <form id="a"><input data-osopostal="cp"><input data-osopostal="municipio"></form>
      <form id="b"><input data-osopostal="cp"><input data-osopostal="municipio"></form>`;

    await loadWidget({ key: 'osp_pk_test', debounce: '0' });
    type(field('#a [data-osopostal="cp"]'), '06000');
    await vi.waitFor(() => expect(field('#a [data-osopostal="municipio"]').value).toBe('Cuauhtémoc'));
    type(field('#b [data-osopostal="cp"]'), '06000');
    await vi.waitFor(() => expect(field('#b [data-osopostal="municipio"]').value).toBe('Cuauhtémoc'));

    expect(fetch.calls).toHaveLength(1);
  });

  it('avisa en consola si falta data-key y no inicializa nada', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<form><input id="cp"></form>';

    await loadWidget({ cp: '#cp' });

    expect(warn).toHaveBeenCalledWith('OsoPostal: falta data-key en el <script> del widget.');
    expect(document.querySelector('.osopostal-status')).toBeNull();
    warn.mockRestore();
  });
});
