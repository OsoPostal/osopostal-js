import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AttachOptions, attach, type Controller, createClient } from '../src';
import { CENTRO, choose, json, type MockFetch, mockFetch, type } from './fixtures';

const FORM = `
  <form id="direccion">
    <label for="cp">Código postal</label>
    <input id="cp" name="cp" data-osopostal="cp">
    <label for="estado">Estado</label>
    <input id="estado" name="estado" data-osopostal="estado">
    <label for="municipio">Municipio</label>
    <input id="municipio" name="municipio" data-osopostal="municipio">
    <label for="ciudad">Ciudad</label>
    <input id="ciudad" name="ciudad" data-osopostal="ciudad">
    <label for="colonia">Colonia</label>
    <input id="colonia" name="colonia" class="form-control" data-osopostal="colonia" required>
    <button>Enviar</button>
  </form>
`;

let controllers: Controller[] = [];

afterEach(() => {
  for (const controller of controllers) {
    controller.detach();
  }
  controllers = [];
  document.body.innerHTML = '';
});

function setup(html = FORM, options: AttachOptions = {}, fetch: MockFetch = mockFetch()) {
  document.body.innerHTML = html;
  const form = document.querySelector('form') as HTMLFormElement;
  const controller = attach(form, { fetch, debounce: 0, ...options });
  controllers.push(controller);
  const $ = <T extends Element = HTMLInputElement>(selector: string) => form.querySelector(selector) as T;

  return {
    form,
    fetch,
    controller,
    $,
    cp: $('#cp'),
    estado: $<HTMLInputElement | HTMLSelectElement>('#estado'),
    municipio: $('#municipio'),
    ciudad: $('#ciudad'),
    colonia: $('#colonia'),
    coloniaSelect: () => form.querySelector('select.osopostal-colonia') as HTMLSelectElement,
    status: () => form.querySelector('.osopostal-status') as HTMLElement,
    branding: () => form.querySelector('.osopostal-branding') as HTMLElement,
  };
}

describe('attach: llenado', () => {
  it('llena estado, municipio, ciudad y muestra el select de colonias', async () => {
    const { cp, estado, municipio, ciudad, colonia, coloniaSelect } = setup();

    type(cp, '06000');

    await vi.waitFor(() => expect(municipio.value).toBe('Cuauhtémoc'));
    expect(estado.value).toBe('Ciudad de México');
    expect(ciudad.value).toBe('Ciudad de México');

    const select = coloniaSelect();
    expect(Array.from(select.options).map((option) => option.text)).toEqual([
      'Selecciona tu colonia',
      'Centro (Área 1)',
      'Centro (Área 2)',
      'Mi colonia no aparece',
    ]);
    expect(select.style.display).toBe('');
    expect(select.className).toContain('form-control');
    expect(colonia.style.display).toBe('none');
    expect(colonia.value).toBe('');
  });

  it('no consulta hasta tener 5 dígitos e ignora lo que no es dígito', async () => {
    const { cp, fetch, municipio } = setup();

    type(cp, '0600');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetch.calls).toHaveLength(0);

    type(cp, '06 000');
    await vi.waitFor(() => expect(municipio.value).toBe('Cuauhtémoc'));
    expect(fetch.calls).toHaveLength(1);
  });

  it('espera el debounce antes de consultar', async () => {
    vi.useFakeTimers();
    try {
      const { cp, fetch } = setup(FORM, { debounce: 300 });

      type(cp, '06000');
      vi.advanceTimersByTime(299);
      expect(fetch.calls).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(fetch.calls).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('avisa a los frameworks con eventos input y change', async () => {
    const { cp, municipio } = setup();
    const events: string[] = [];
    municipio.addEventListener('input', () => events.push('input'));
    municipio.addEventListener('change', () => events.push('change'));

    type(cp, '06000');

    await vi.waitFor(() => expect(events).toEqual(['input', 'change']));
  });

  it('no sobrescribe lo que el usuario escribió a mano', async () => {
    const { cp, municipio, estado, colonia, coloniaSelect } = setup();
    municipio.value = 'Mi municipio';
    colonia.value = 'Colonia inventada';

    type(cp, '06000');

    await vi.waitFor(() => expect(estado.value).toBe('Ciudad de México'));
    expect(municipio.value).toBe('Mi municipio');
    expect(colonia.value).toBe('Colonia inventada');
    expect(colonia.style.display).toBe('');
    expect(coloniaSelect().style.display).toBe('none');
  });

  it('usa el formato de estado elegido en un input', async () => {
    const { cp, estado } = setup(FORM, { estadoFormat: 'iso' });

    type(cp, '06000');

    await vi.waitFor(() => expect(estado.value).toBe('MX-CMX'));
  });

  it('elige la opción del select de estado y respeta la que eligió el usuario', async () => {
    const html = FORM.replace(
      '<input id="estado" name="estado" data-osopostal="estado">',
      `<select id="estado" name="estado" data-osopostal="estado">
         <option value="">Selecciona</option>
         <option value="AG">Aguascalientes</option>
         <option value="DF">CDMX</option>
         <option value="EM">Estado de Mexico</option>
       </select>`,
    );
    const { cp, estado } = setup(html);

    type(cp, '06000');
    await vi.waitFor(() => expect(estado.value).toBe('DF'));

    // Cambio de CP: el widget limpia el estado que eligió y elige el nuevo.
    type(cp, '50000');
    await vi.waitFor(() => expect(estado.value).toBe('EM'));

    // Si el usuario cambia el estado a mano, ya no se toca.
    choose(estado as HTMLSelectElement, 'AG');
    type(cp, '06000');
    await vi.waitFor(() => expect((document.querySelector('#municipio') as HTMLInputElement).value).toBe('Cuauhtémoc'));
    expect(estado.value).toBe('AG');
  });

  it('elige la opción en un select de estados sin placeholder', async () => {
    const html = FORM.replace(
      '<input id="estado" name="estado" data-osopostal="estado">',
      `<select id="estado" name="estado" data-osopostal="estado">
         <option value="01">Aguascalientes</option>
         <option value="09">Ciudad de México</option>
       </select>`,
    );
    const { cp, estado } = setup(html, { estadoFormat: 'clave' });

    type(cp, '06000');

    await vi.waitFor(() => expect(estado.value).toBe('09'));
  });

  it('no toca un select de estado con una opción preseleccionada por el servidor', async () => {
    const html = FORM.replace(
      '<input id="estado" name="estado" data-osopostal="estado">',
      `<select id="estado" name="estado" data-osopostal="estado">
         <option value="01" selected>Aguascalientes</option>
         <option value="09">Ciudad de México</option>
       </select>`,
    );
    const { cp, estado, municipio } = setup(html);

    type(cp, '06000');

    await vi.waitFor(() => expect(municipio.value).toBe('Cuauhtémoc'));
    expect(estado.value).toBe('01');
  });

  it('acepta selectores y elementos en lugar de atributos data-osopostal', async () => {
    document.body.innerHTML = `
      <div id="envio">
        <input id="zip"><input id="state"><input id="city">
      </div>`;
    const fetch = mockFetch();
    controllers.push(
      attach('#envio', {
        fetch,
        debounce: 0,
        fields: { cp: '#zip', estado: document.querySelector('#state') as Element, municipio: '#city' },
      }),
    );

    type(document.querySelector('#zip') as HTMLInputElement, '06000');

    await vi.waitFor(() => expect((document.querySelector('#city') as HTMLInputElement).value).toBe('Cuauhtémoc'));
    expect((document.querySelector('#state') as HTMLInputElement).value).toBe('Ciudad de México');
  });

  it('falla con un mensaje claro si no encuentra el campo del CP', () => {
    document.body.innerHTML = '<form></form>';

    expect(() => attach('form')).toThrow('no se encontró el campo del código postal');
    expect(() => attach('#nada')).toThrow('no se encontró "#nada"');
  });
});

describe('attach: colonias', () => {
  it('sincroniza el input original al elegir una colonia', async () => {
    const { cp, colonia, coloniaSelect } = setup();
    type(cp, '06000');
    await vi.waitFor(() => expect(coloniaSelect().options.length).toBe(4));

    choose(coloniaSelect(), '1');

    expect(colonia.value).toBe('Centro (Área 2)');
    expect(colonia.style.display).toBe('none');
    expect(new FormData(colonia.form as HTMLFormElement).get('colonia')).toBe('Centro (Área 2)');
  });

  it('"Mi colonia no aparece" muestra el input original y lo enfoca', async () => {
    const { cp, colonia, coloniaSelect } = setup();
    type(cp, '06000');
    await vi.waitFor(() => expect(coloniaSelect().options.length).toBe(4));
    choose(coloniaSelect(), '0');

    choose(coloniaSelect(), '__osopostal_other__');

    expect(colonia.style.display).toBe('');
    expect(colonia.value).toBe('');
    expect(document.activeElement).toBe(colonia);
    expect(colonia.required).toBe(true);
    expect(coloniaSelect().required).toBe(false);
  });

  it('mueve el required y el label al select mientras el input está oculto', async () => {
    const { cp, colonia, coloniaSelect, form } = setup();
    type(cp, '06000');
    await vi.waitFor(() => expect(coloniaSelect().options.length).toBe(4));

    const select = coloniaSelect();
    expect(colonia.required).toBe(false);
    expect(select.required).toBe(true);
    expect((form.querySelector('label[for]:nth-of-type(5)') as HTMLLabelElement).htmlFor).toBe(select.id);
    expect(select.labels?.[0]?.textContent).toBe('Colonia');
    expect(form.checkValidity()).toBe(false);

    choose(select, '0');
    expect(form.checkValidity()).toBe(true);
  });

  it('usa aria-label si el input de colonia no tiene label', async () => {
    const { cp, coloniaSelect } = setup(FORM.replace('<label for="colonia">Colonia</label>', ''), {
      texts: { coloniaLabel: 'Tu colonia' },
    });
    type(cp, '06000');

    await vi.waitFor(() => expect(coloniaSelect().getAttribute('aria-label')).toBe('Tu colonia'));
  });

  it('elige sola la colonia si el CP tiene una', async () => {
    const { cp, colonia, ciudad, coloniaSelect } = setup();

    type(cp, '50000');

    await vi.waitFor(() => expect(colonia.value).toBe('Toluca de Lerdo Centro'));
    expect(coloniaSelect().value).toBe('0');
    expect(ciudad.value).toBe('Toluca de Lerdo');
  });

  it('llena la ciudad de la colonia elegida cuando el CP tiene varias ciudades', async () => {
    const response = structuredClone(CENTRO);
    const [first, second] = response.data.asentamientos;
    if (first) first.ciudad = null;
    if (second) second.ciudad = 'Otra ciudad';
    const { cp, ciudad, coloniaSelect } = setup(FORM, {}, mockFetch(() => json(response)));

    type(cp, '06000');
    await vi.waitFor(() => expect(coloniaSelect().options.length).toBe(4));
    expect(ciudad.value).toBe('Otra ciudad'); // Una sola ciudad distinta de null.

    const twoCities = structuredClone(CENTRO);
    const [a] = twoCities.data.asentamientos;
    if (a) a.ciudad = 'Ciudad A';
    const other = setup(FORM, {}, mockFetch(() => json(twoCities)));
    type(other.cp, '06000');
    await vi.waitFor(() => expect(other.coloniaSelect().options.length).toBe(4));
    expect(other.ciudad.value).toBe('');

    choose(other.coloniaSelect(), '0');
    expect(other.ciudad.value).toBe('Ciudad A');
  });

  it('distingue colonias con el mismo nombre por su tipo', async () => {
    const response = structuredClone(CENTRO);
    response.data.asentamientos = [
      { nombre: 'San Juan', tipo: 'Colonia', zona: 'Urbano', ciudad: null },
      { nombre: 'San Juan', tipo: 'Barrio', zona: 'Urbano', ciudad: null },
    ];
    const { cp, coloniaSelect } = setup(FORM, {}, mockFetch(() => json(response)));

    type(cp, '06000');

    await vi.waitFor(() =>
      expect(Array.from(coloniaSelect().options).map((option) => option.text)).toEqual([
        'Selecciona tu colonia',
        'San Juan — Colonia',
        'San Juan — Barrio',
        'Mi colonia no aparece',
      ]),
    );
  });

  it('muestra una sola vez las colonias idénticas (CP 85203)', async () => {
    const response = structuredClone(CENTRO);
    const bordo = { nombre: 'Bordo del Canal Bajo', tipo: 'Ranchería', zona: 'Rural', ciudad: null };
    response.data.asentamientos = [
      { nombre: 'Bordo del Canal Alto', tipo: 'Ejido', zona: 'Rural', ciudad: null },
      bordo,
      { ...bordo },
      { nombre: 'El Ranchito', tipo: 'Rancho', zona: 'Rural', ciudad: null },
      { nombre: 'El Ranchito', tipo: 'Ranchería', zona: 'Rural', ciudad: null },
    ];
    const { cp, colonia, coloniaSelect } = setup(FORM, {}, mockFetch(() => json(response)));

    type(cp, '06000');

    await vi.waitFor(() =>
      expect(Array.from(coloniaSelect().options).map((option) => option.text)).toEqual([
        'Selecciona tu colonia',
        'Bordo del Canal Alto',
        'Bordo del Canal Bajo',
        'El Ranchito — Rancho',
        'El Ranchito — Ranchería',
        'Mi colonia no aparece',
      ]),
    );
    choose(coloniaSelect(), '3');
    expect(colonia.value).toBe('El Ranchito');
  });

  it('con "no aparece" activo, un CP nuevo vuelve a mostrar la lista', async () => {
    const { cp, colonia, coloniaSelect } = setup();
    type(cp, '06000');
    await vi.waitFor(() => expect(coloniaSelect().options.length).toBe(4));
    choose(coloniaSelect(), '__osopostal_other__');
    type(colonia, 'Mi colonia escrita');

    type(cp, '50000');

    // La lista del CP nuevo está visible y, con una sola colonia, elegida.
    await vi.waitFor(() => expect(coloniaSelect().options.length).toBe(3));
    expect(coloniaSelect().style.display).toBe('');
    expect(colonia.style.display).toBe('none');
    expect(colonia.value).toBe('Toluca de Lerdo Centro');

    // Si vuelve a elegir "no aparece", recupera lo que había escrito.
    choose(coloniaSelect(), '__osopostal_other__');
    expect(colonia.style.display).toBe('');
    expect(colonia.value).toBe('Mi colonia escrita');
  });

  it('con "no aparece" activo y un CP sin colonias en la lista, conserva lo escrito', async () => {
    const { cp, colonia, coloniaSelect, municipio } = setup();
    type(cp, '06000');
    await vi.waitFor(() => expect(coloniaSelect().options.length).toBe(4));
    choose(coloniaSelect(), '__osopostal_other__');
    type(colonia, 'Mi colonia escrita');
    type(municipio, 'Mi municipio');

    type(cp, '99999');

    await vi.waitFor(() => expect(document.querySelector('.osopostal-status')?.textContent).toContain('No encontramos'));
    expect(colonia.style.display).toBe('');
    expect(colonia.value).toBe('Mi colonia escrita');
  });

  it('con "no aparece" activo, un CP nuevo que incluye lo escrito lo elige en la lista', async () => {
    const { cp, colonia, coloniaSelect } = setup();
    type(cp, '50000');
    await vi.waitFor(() => expect(coloniaSelect().options.length).toBe(3));
    choose(coloniaSelect(), '__osopostal_other__');
    type(colonia, 'centro (area 2)');

    type(cp, '06000');

    await vi.waitFor(() => expect(coloniaSelect().value).toBe('1'));
    expect(colonia.value).toBe('Centro (Área 2)');
  });
});

describe('attach: campos dentro de su <label>', () => {
  const WRAPPED = `
    <form>
      <label>Código postal <input name="cp" data-osopostal="cp"></label>
      <label>Colonia <input name="colonia" data-osopostal="colonia" required></label>
    </form>`;

  it('inserta el estado y la marca de agua después del label, no dentro', async () => {
    const { form } = setup(WRAPPED);
    const cp = form.querySelector('[name=cp]') as HTMLInputElement;
    const [cpLabel, coloniaLabel] = Array.from(form.querySelectorAll('label'));

    expect(cpLabel?.nextElementSibling?.className).toBe('osopostal-status');
    expect(coloniaLabel?.nextElementSibling?.className).toBe('osopostal-branding');
    expect(form.querySelector('label .osopostal-status, label .osopostal-branding')).toBeNull();

    type(cp, '06000');
    await vi.waitFor(() => expect(form.querySelector('select.osopostal-colonia')?.getAttribute('aria-label')).toBe('Colonia'));
  });

  it('el label apunta al select con la lista y al input en modo "no aparece"', async () => {
    const { form, coloniaSelect, controller } = setup(WRAPPED);
    const cp = form.querySelector('[name=cp]') as HTMLInputElement;
    const colonia = form.querySelector('[name=colonia]') as HTMLInputElement;
    const label = form.querySelectorAll('label')[1] as HTMLLabelElement;
    expect(label.control).toBe(colonia);

    type(cp, '06000');
    await vi.waitFor(() => expect(coloniaSelect().options.length).toBe(4));
    expect(label.control).toBe(coloniaSelect());

    choose(coloniaSelect(), '__osopostal_other__');
    expect(label.control).toBe(colonia);
    expect(label.hasAttribute('for')).toBe(false);

    choose(coloniaSelect(), '0');
    expect(label.control).toBe(coloniaSelect());

    controller.detach();
    expect(label.hasAttribute('for')).toBe(false);
    expect(label.control).toBe(colonia);
  });
});

describe('attach: cambio de CP', () => {
  it('limpia lo que llenó y vuelve a consultar', async () => {
    const { cp, estado, municipio, colonia, coloniaSelect, fetch } = setup();
    type(cp, '06000');
    await vi.waitFor(() => expect(municipio.value).toBe('Cuauhtémoc'));
    choose(coloniaSelect(), '0');

    type(cp, '0600');

    expect(estado.value).toBe('');
    expect(municipio.value).toBe('');
    expect(colonia.value).toBe('');
    expect(colonia.style.display).toBe('');
    expect(colonia.required).toBe(true);
    expect(coloniaSelect().style.display).toBe('none');

    type(cp, '50000');
    await vi.waitFor(() => expect(municipio.value).toBe('Toluca'));
    expect(fetch.calls).toHaveLength(2);
  });

  it('conserva lo que el usuario corrigió después del llenado', async () => {
    const { cp, municipio, estado } = setup();
    type(cp, '06000');
    await vi.waitFor(() => expect(municipio.value).toBe('Cuauhtémoc'));

    type(municipio, 'Corregido a mano');
    type(cp, '50000');

    await vi.waitFor(() => expect(estado.value).toBe('México'));
    expect(municipio.value).toBe('Corregido a mano');
  });

  it('descarta la respuesta de un CP anterior que llega tarde', async () => {
    let release: (() => void) | undefined;
    const fetch = mockFetch((url) =>
      url.includes('06000')
        ? new Promise<Response>((resolve) => {
            release = () => resolve(json(CENTRO));
          })
        : undefined,
    );
    const { cp, municipio } = setup(FORM, {}, fetch);

    type(cp, '06000');
    await vi.waitFor(() => expect(release).toBeDefined());
    type(cp, '50000');
    await vi.waitFor(() => expect(municipio.value).toBe('Toluca'));

    release?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(municipio.value).toBe('Toluca');
  });
});

describe('attach: fail-open y CP no encontrado', () => {
  it('ante un 403 deja los campos editables y emite osopostal:error', async () => {
    const fetch = mockFetch(() =>
      json({ error: { code: 'origin_not_allowed', message: 'Origen no permitido.' } }, 403),
    );
    const onError = vi.fn();
    const { form, cp, colonia, status, coloniaSelect } = setup(FORM, { onError }, fetch);
    const listener = vi.fn();
    form.addEventListener('osopostal:error', listener);

    type(cp, '06000');

    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce());
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ codigoPostal: '06000', error: { code: 'origin_not_allowed' } });
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail.error.code).toBe('origin_not_allowed');
    expect(status().textContent).toBe('');
    expect(status().dataset.state).toBe('error');
    expect(colonia.style.display).toBe('');
    expect(colonia.disabled).toBe(false);
    expect(coloniaSelect().style.display).toBe('none');

    for (const field of form.querySelectorAll('input')) {
      field.value = field.value || 'x';
    }
    expect(form.checkValidity()).toBe(true);
  });

  it('ante un timeout no bloquea el formulario', async () => {
    const onError = vi.fn();
    setup(FORM, { onError, timeout: 20 }, mockFetch(() => new Promise<Response>(() => {})));

    type(document.querySelector('#cp') as HTMLInputElement, '06000');

    await vi.waitFor(() => expect(onError.mock.calls[0]?.[0].error.code).toBe('timeout'));
  });

  it('muestra un mensaje configurable si el error no debe ser silencioso', async () => {
    const { cp, status } = setup(FORM, { texts: { error: 'Llena tu dirección a mano.' } }, mockFetch(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    ));

    type(cp, '06000');

    await vi.waitFor(() => expect(status().textContent).toBe('Llena tu dirección a mano.'));
  });

  it('informa un CP no encontrado sin invalidar el formulario', async () => {
    const onNotFound = vi.fn();
    const { form, cp, status } = setup(FORM, { onNotFound });
    const listener = vi.fn();
    form.addEventListener('osopostal:not-found', listener);

    type(cp, '99999');

    await vi.waitFor(() => expect(onNotFound).toHaveBeenCalledWith({ codigoPostal: '99999' }));
    expect(listener).toHaveBeenCalledOnce();
    expect(status().textContent).toContain('No encontramos este código postal');
    expect(cp.validity.valid).toBe(true);
  });
});

describe('attach: eventos, accesibilidad y marca de agua', () => {
  it('emite osopostal:resolved y llama a onResolved', async () => {
    const onResolved = vi.fn();
    const { form, cp } = setup(FORM, { onResolved });
    const listener = vi.fn();
    document.addEventListener('osopostal:resolved', listener);

    type(cp, '06000');

    await vi.waitFor(() => expect(onResolved).toHaveBeenCalledOnce());
    expect(onResolved).toHaveBeenCalledWith({ codigoPostal: '06000', postalCode: CENTRO.data, branding: true });
    const event = listener.mock.calls[0]?.[0] as CustomEvent;
    expect(event.target).toBe(form);
    expect(event.detail.postalCode.codigo_postal).toBe('06000');
    document.removeEventListener('osopostal:resolved', listener);
  });

  it('anuncia la consulta en una región aria-live ligada al campo del CP', async () => {
    let release: (() => void) | undefined;
    const fetch = mockFetch(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(json(CENTRO));
        }),
    );
    const { cp, status, municipio } = setup(FORM, { texts: { loading: 'Consultando…' } }, fetch);
    const region = status();

    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(cp.getAttribute('aria-describedby')).toBe(region.id);

    type(cp, '06000');
    await vi.waitFor(() => expect(region.textContent).toBe('Consultando…'));
    release?.();
    await vi.waitFor(() => expect(municipio.value).toBe('Cuauhtémoc'));
    expect(region.textContent).toBe('');
  });

  it('muestra la marca de agua con enlace y UTM si branding es true', async () => {
    const { cp, branding, colonia } = setup();
    expect(branding().hidden).toBe(true);

    type(cp, '06000');

    await vi.waitFor(() => expect(branding().hidden).toBe(false));
    expect(branding().textContent).toBe('Autocompletado por OsoPostal');
    const link = branding().querySelector('a') as HTMLAnchorElement;
    const url = new URL(link.href);
    expect(url.origin).toBe('https://osopostal.com');
    expect(url.searchParams.get('utm_source')).toBe('widget');
    expect(url.searchParams.get('utm_medium')).toBe('referral');
    expect(url.searchParams.get('utm_content')).toBe('localhost');
    expect(link.rel).toBe('noopener');
    expect(colonia.nextElementSibling).toBe(branding());
  });

  it('no muestra la marca de agua si branding es false', async () => {
    const { cp, branding, municipio } = setup();

    type(cp, '50000');

    await vi.waitFor(() => expect(municipio.value).toBe('Toluca'));
    expect(branding().hidden).toBe(true);
  });
});

describe('attach: varios formularios y detach', () => {
  it('cada formulario es independiente', async () => {
    document.body.innerHTML = `
      <form id="facturacion"><input data-osopostal="cp"><input data-osopostal="municipio"></form>
      <form id="envio"><input data-osopostal="cp"><input data-osopostal="municipio"></form>`;
    const client = createClient({ fetch: mockFetch() });
    controllers.push(attach('#facturacion', { client, debounce: 0 }), attach('#envio', { client, debounce: 0 }));
    const field = (form: string, name: string) =>
      document.querySelector(`#${form} [data-osopostal="${name}"]`) as HTMLInputElement;

    type(field('facturacion', 'cp'), '06000');
    type(field('envio', 'cp'), '50000');

    await vi.waitFor(() => expect(field('facturacion', 'municipio').value).toBe('Cuauhtémoc'));
    await vi.waitFor(() => expect(field('envio', 'municipio').value).toBe('Toluca'));
  });

  it('detach restaura el formulario original', async () => {
    const template = document.createElement('template');
    template.innerHTML = FORM;
    const before = (template.content.querySelector('form') as HTMLFormElement).innerHTML;
    const { controller, form, cp, colonia, municipio, fetch } = setup();
    type(cp, '06000');
    await vi.waitFor(() => expect(municipio.value).toBe('Cuauhtémoc'));

    controller.detach();

    expect(form.querySelector('.osopostal-status, .osopostal-branding, select')).toBeNull();
    expect(colonia.style.display).toBe('');
    expect(colonia.required).toBe(true);
    expect(cp.hasAttribute('aria-describedby')).toBe(false);
    expect(form.querySelector('label[for="colonia"]')).not.toBeNull();
    expect(form.innerHTML.replace(/ style=""/g, '')).toBe(before);

    type(cp, '50000');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetch.calls).toHaveLength(1);
  });

  it('volver a llamar attach sobre el mismo campo reemplaza al anterior', async () => {
    const { form, cp, fetch } = setup();
    controllers.push(attach(form, { fetch, debounce: 0 }));

    expect(form.querySelectorAll('.osopostal-status')).toHaveLength(1);
    type(cp, '06000');
    await vi.waitFor(() => expect(fetch.calls).toHaveLength(1));
  });

  it('lookup consulta a mano sin esperar el debounce', async () => {
    const { controller, municipio } = setup(FORM, { debounce: 10_000 });

    await controller.lookup('06000');

    expect(municipio.value).toBe('Cuauhtémoc');
  });
});
