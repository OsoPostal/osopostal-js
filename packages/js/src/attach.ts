import { type Client, type ClientOptions, createClient, OsoPostalError } from './client';
import { estadoCandidates, findOption, formatEstado, normalizeText } from './normalize';
import type { Asentamiento, EstadoFormat, PostalCode } from './types';

export type FieldName = 'cp' | 'estado' | 'municipio' | 'ciudad' | 'colonia';

/** Selector CSS (dentro del formulario) o el elemento mismo. */
export type FieldTarget = string | Element;

export interface Texts {
  /** Mensaje mientras se consulta el CP. */
  loading: string;
  /** Mensaje si el CP no existe. */
  notFound: string;
  /** Mensaje ante un error de red o de la API. Vacío por defecto: el error es silencioso. */
  error: string;
  /** Primera opción del select de colonias. */
  coloniaPlaceholder: string;
  /** Última opción del select de colonias, que muestra el campo original. */
  coloniaNotListed: string;
  /** Label accesible del select de colonias si el campo original no tiene `<label>`. */
  coloniaLabel: string;
}

export const DEFAULT_TEXTS: Texts = {
  loading: 'Buscando código postal…',
  notFound: 'No encontramos este código postal. Puedes llenar los datos a mano.',
  error: '',
  coloniaPlaceholder: 'Selecciona tu colonia',
  coloniaNotListed: 'Mi colonia no aparece',
  coloniaLabel: 'Colonia',
};

export interface ResolvedDetail {
  codigoPostal: string;
  postalCode: PostalCode;
  branding: boolean;
}

export interface NotFoundDetail {
  codigoPostal: string;
}

export interface ErrorDetail {
  codigoPostal: string;
  error: OsoPostalError;
}

export interface AttachOptions extends ClientOptions {
  /** Cliente ya creado (para compartir la caché entre formularios). Si se pasa, se ignoran las opciones del cliente. */
  client?: Client;
  /** Campos del formulario. Por defecto, `[data-osopostal="cp"]`, `[data-osopostal="estado"]`, etc. */
  fields?: Partial<Record<FieldName, FieldTarget>>;
  /** Formato del estado: nombre (`Ciudad de México`), clave INEGI (`09`) o ISO (`MX-CMX`). Por defecto `nombre`. */
  estadoFormat?: EstadoFormat;
  /** Espera tras el último dígito antes de consultar, en milisegundos. Por defecto 250. */
  debounce?: number;
  texts?: Partial<Texts>;
  onResolved?: (detail: ResolvedDetail) => void;
  onNotFound?: (detail: NotFoundDetail) => void;
  onError?: (detail: ErrorDetail) => void;
}

export interface Controller {
  /** Consulta un CP a mano, sin esperar el debounce. */
  lookup(codigoPostal: string): Promise<void>;
  /** Quita los listeners y los elementos agregados y deja el formulario como estaba. Los valores escritos se conservan. */
  detach(): void;
}

type Fillable = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const BRANDING_URL = 'https://osopostal.com/';
const OTHER_VALUE = '__osopostal_other__';
const STYLE_ID = 'osopostal-styles';
const ATTACHED = new WeakMap<Element, Controller>();
let uid = 0;

/**
 * Autocompleta un formulario de dirección a partir del código postal.
 *
 * @param scope Formulario (o contenedor) donde buscar los campos, un selector CSS o `document`.
 */
export function attach(scope: Element | Document | string, options: AttachOptions = {}): Controller {
  const root = typeof scope === 'string' ? document.querySelector(scope) : scope;
  if (!root) {
    throw new Error(`OsoPostal: no se encontró "${String(scope)}".`);
  }

  const found = resolveField(root, options.fields?.cp, 'cp');
  if (!found) {
    throw new Error('OsoPostal: no se encontró el campo del código postal.');
  }
  const cpField: Fillable = found;

  ATTACHED.get(cpField)?.detach();

  const fields = {
    estado: resolveField(root, options.fields?.estado, 'estado'),
    municipio: resolveField(root, options.fields?.municipio, 'municipio'),
    ciudad: resolveField(root, options.fields?.ciudad, 'ciudad'),
    colonia: resolveField(root, options.fields?.colonia, 'colonia'),
  };

  const client = options.client ?? createClient(options);
  const texts: Texts = { ...DEFAULT_TEXTS, ...options.texts };
  const estadoFormat = options.estadoFormat ?? 'nombre';
  const debounce = options.debounce ?? 250;
  const eventTarget: Element = root instanceof Element ? root : cpField;
  const doc = cpField.ownerDocument;
  const id = `osopostal-${++uid}`;

  injectStyles(doc);

  /** Valores que escribió el widget: solo esos (o los vacíos) se pueden sobrescribir o limpiar. */
  const filled = new Map<Fillable, string>();
  /** Selects que el usuario cambió a mano. */
  const touched = new WeakSet<HTMLSelectElement>();
  const initialIndex = new Map<HTMLSelectElement, number>();
  for (const field of Object.values(fields)) {
    if (field instanceof HTMLSelectElement) {
      initialIndex.set(field, field.selectedIndex);
    }
  }

  let requested: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: AbortController | undefined;
  let asentamientos: Asentamiento[] = [];

  // Región aria-live con el estado de la consulta, después del campo del CP.
  const status = doc.createElement('div');
  status.id = `${id}-status`;
  status.className = 'osopostal-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  outside(cpField).insertAdjacentElement('afterend', status);
  const describedBy = cpField.getAttribute('aria-describedby');
  cpField.setAttribute('aria-describedby', describedBy ? `${describedBy} ${status.id}` : status.id);
  cpField.setAttribute('data-osopostal-attached', '');

  // Marca de agua, junto al campo de colonia (o al estado si no hay colonia).
  const branding = doc.createElement('div');
  branding.className = 'osopostal-branding';
  branding.hidden = true;
  branding.append('Autocompletado por ');
  const brandingLink = doc.createElement('a');
  brandingLink.href = brandingHref(doc);
  brandingLink.target = '_blank';
  brandingLink.rel = 'noopener';
  brandingLink.textContent = 'OsoPostal';
  branding.append(brandingLink);
  (fields.colonia ? outside(fields.colonia) : status).insertAdjacentElement('afterend', branding);

  const colonia = fields.colonia instanceof HTMLSelectElement ? undefined : fields.colonia;
  const coloniaUi = colonia ? createColoniaUi(colonia) : undefined;

  // ── Valores ────────────────────────────────────────────────────────────

  function canWrite(field: Fillable): boolean {
    if (filled.get(field) === field.value || field.value === '') {
      return true;
    }
    if (field instanceof HTMLSelectElement) {
      const hasExplicitDefault = Array.from(field.options).some((option) => option.defaultSelected);
      return !touched.has(field) && !hasExplicitDefault && field.selectedIndex === initialIndex.get(field);
    }
    return false;
  }

  function write(field: Fillable, value: string): void {
    if (field.value !== value) {
      field.value = value;
      notify(field);
    }
    filled.set(field, field.value);
  }

  function fill(field: Fillable | undefined, value: string | undefined, candidates?: string[]): void {
    if (!field || value === undefined || !canWrite(field)) {
      return;
    }
    if (field instanceof HTMLSelectElement) {
      const option = findOption(field, candidates ?? [normalizeText(value)]);
      if (option) {
        write(field, option.value);
      }
      return;
    }
    write(field, value);
  }

  function clearFilled(): void {
    for (const [field, value] of filled) {
      if (field.value !== value) {
        continue;
      }
      if (field instanceof HTMLSelectElement) {
        field.selectedIndex = initialIndex.get(field) ?? -1;
      } else {
        field.value = '';
      }
      notify(field);
    }
    filled.clear();
  }

  // ── Colonias ───────────────────────────────────────────────────────────

  function createColoniaUi(input: HTMLInputElement | HTMLTextAreaElement) {
    // `labels` cubre el <label for> y el <label> que envuelve al input.
    const label = input.labels?.[0] ?? null;
    const originalFor = label?.getAttribute('for') ?? null;
    const wrapped = !!label && label.contains(input);

    const select = doc.createElement('select');
    select.id = `${id}-colonia`;
    select.className = `${input.className} osopostal-colonia`.trim();
    select.style.display = 'none';
    // Dentro de un <label> envolvente, el select va después del input: así, al
    // quitar el `for`, el label vuelve a apuntar al input (su primer control).
    input.insertAdjacentElement(wrapped ? 'afterend' : 'beforebegin', select);

    if (!label || wrapped) {
      select.setAttribute('aria-label', (wrapped && label?.textContent?.trim()) || texts.coloniaLabel);
    }

    const original = { display: input.style.display, required: input.required };
    let open = false;
    let items: Asentamiento[] = [];
    /** El usuario eligió "Mi colonia no aparece" y escribe la colonia a mano. */
    let manual = false;
    /** Lo que escribió a mano, para devolverlo si vuelve a elegir "no aparece" con otro CP. */
    let manualText = '';

    function showInput(): void {
      input.style.display = original.display;
      input.required = original.required;
      select.required = false;
      if (label) {
        if (originalFor === null) {
          label.removeAttribute('for');
        } else {
          label.setAttribute('for', originalFor);
        }
      }
    }

    function hideInput(): void {
      input.style.display = 'none';
      // El input oculto no puede ser `required`: el navegador bloquearía el envío sin poder enfocarlo.
      input.required = false;
      select.required = original.required;
      if (label) {
        label.htmlFor = select.id;
      }
    }

    function onChange(): void {
      if (select.value === OTHER_VALUE) {
        manual = true;
        showInput();
        if (canWrite(input)) {
          write(input, manualText);
        }
        filled.delete(input);
        manualText = '';
        input.focus();
        return;
      }
      manual = false;
      hideInput();
      const asentamiento = items[Number(select.value)];
      write(input, asentamiento ? asentamiento.nombre : '');
      if (asentamiento?.ciudad) {
        fill(fields.ciudad, asentamiento.ciudad);
      }
    }

    select.addEventListener('change', onChange);

    return {
      show(list: Asentamiento[]): void {
        const options = coloniaOptions(list);
        items = options.items;
        let current = items.findIndex((item) => normalizeText(item.nombre) === normalizeText(input.value));

        if (manual) {
          // Cambió el CP con una colonia escrita a mano: se vuelve a mostrar la
          // lista y el texto se guarda para cuando elija otra vez "no aparece".
          manual = false;
          if (current === -1 && input.value !== '') {
            manualText = input.value;
            input.value = '';
            notify(input);
          }
          filled.delete(input);
        } else if (!canWrite(input) && current === -1) {
          return; // El usuario ya escribió una colonia que no está en la lista.
        }

        select.replaceChildren(
          new Option(texts.coloniaPlaceholder, ''),
          ...options.labels.map((text, index) => new Option(text, String(index))),
          new Option(texts.coloniaNotListed, OTHER_VALUE),
        );

        if (current === -1 && items.length === 1) {
          current = 0;
        }
        select.value = current === -1 ? '' : String(current);
        select.style.display = '';
        open = true;
        hideInput();
        if (current !== -1) {
          onChange();
        }
      },
      hide(): void {
        if (!open) {
          return;
        }
        open = false;
        items = [];
        select.style.display = 'none';
        select.replaceChildren();
        showInput();
      },
      destroy(): void {
        this.hide();
        select.removeEventListener('change', onChange);
        select.remove();
      },
    };
  }

  // ── Consulta ───────────────────────────────────────────────────────────

  function setStatus(message: string, state: string): void {
    status.textContent = message;
    status.setAttribute('data-state', state);
  }

  function cancel(): void {
    clearTimeout(timer);
    timer = undefined;
    inflight?.abort();
    inflight = undefined;
  }

  function reset(): void {
    clearFilled();
    coloniaUi?.hide();
    branding.hidden = true;
    asentamientos = [];
    setStatus('', 'idle');
  }

  function dispatch<T>(name: string, detail: T): void {
    eventTarget.dispatchEvent(new CustomEvent(`osopostal:${name}`, { bubbles: true, detail }));
  }

  function apply(codigoPostal: string, postalCode: PostalCode, showBranding: boolean): void {
    asentamientos = postalCode.asentamientos;
    const { estado, municipio } = postalCode;

    fill(fields.estado, formatEstado(estado, estadoFormat), estadoCandidates(estado, estadoFormat));
    fill(fields.municipio, municipio.nombre);

    const cities = [...new Set(asentamientos.map((item) => item.ciudad).filter((city): city is string => !!city))];
    if (cities.length === 1) {
      fill(fields.ciudad, cities[0]);
    }

    if (coloniaUi && asentamientos.length > 0) {
      coloniaUi.show(asentamientos);
    } else if (fields.colonia instanceof HTMLSelectElement && asentamientos.length === 1) {
      fill(fields.colonia, asentamientos[0]?.nombre);
    }

    branding.hidden = !showBranding;
    setStatus('', 'resolved');

    const detail: ResolvedDetail = { codigoPostal, postalCode, branding: showBranding };
    options.onResolved?.(detail);
    dispatch('resolved', detail);
  }

  async function run(codigoPostal: string): Promise<void> {
    cancel();
    requested = codigoPostal;
    const controller = new AbortController();
    inflight = controller;
    setStatus(texts.loading, 'loading');

    try {
      const result = await client.lookup(codigoPostal, { signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      if (result.status === 'found') {
        apply(codigoPostal, result.postalCode, result.branding);
      } else {
        setStatus(texts.notFound, 'not-found');
        const detail: NotFoundDetail = { codigoPostal };
        options.onNotFound?.(detail);
        dispatch('not-found', detail);
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        return;
      }
      // Fail-open: los campos quedan editables y el formulario se puede enviar.
      const error =
        caught instanceof OsoPostalError ? caught : new OsoPostalError('network_error', String(caught));
      setStatus(texts.error, 'error');
      const detail: ErrorDetail = { codigoPostal, error };
      options.onError?.(detail);
      dispatch('error', detail);
    } finally {
      if (inflight === controller) {
        inflight = undefined;
      }
    }
  }

  function digits(): string {
    return cpField.value.replace(/\D/g, '');
  }

  function onCpInput(): void {
    const value = digits();
    if (value === requested) {
      return;
    }
    cancel();
    if (requested !== undefined) {
      reset();
    }
    if (value.length !== 5) {
      requested = undefined;
      return;
    }
    requested = value;
    timer = setTimeout(() => {
      timer = undefined;
      void run(value);
    }, debounce);
  }

  function onCpChange(): void {
    onCpInput();
    if (timer !== undefined && requested !== undefined) {
      void run(requested);
    }
  }

  function onSelectChange(event: Event): void {
    if (event.isTrusted && event.target instanceof HTMLSelectElement) {
      touched.add(event.target);
    }
  }

  cpField.addEventListener('input', onCpInput);
  cpField.addEventListener('change', onCpChange);
  const selects = Object.values(fields).filter((field): field is HTMLSelectElement => field instanceof HTMLSelectElement);
  for (const select of selects) {
    select.addEventListener('change', onSelectChange);
  }

  const controller: Controller = {
    async lookup(codigoPostal: string): Promise<void> {
      if (codigoPostal !== requested) {
        reset();
      }
      await run(codigoPostal);
    },
    detach(): void {
      cancel();
      cpField.removeEventListener('input', onCpInput);
      cpField.removeEventListener('change', onCpChange);
      for (const select of selects) {
        select.removeEventListener('change', onSelectChange);
      }
      coloniaUi?.destroy();
      status.remove();
      branding.remove();
      if (describedBy === null) {
        cpField.removeAttribute('aria-describedby');
      } else {
        cpField.setAttribute('aria-describedby', describedBy);
      }
      cpField.removeAttribute('data-osopostal-attached');
      ATTACHED.delete(cpField);
    },
  };

  ATTACHED.set(cpField, controller);

  return controller;
}

function resolveField(root: Element | Document, target: FieldTarget | undefined, name: FieldName): Fillable | undefined {
  const element = target instanceof Element ? target : root.querySelector(target ?? `[data-osopostal="${name}"]`);

  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element;
  }

  return undefined;
}

/**
 * Opciones del select de colonias. Quita las entradas idénticas (SEPOMEX repite
 * algunas con los mismos datos) y, si un nombre se repite, agrega el tipo y,
 * si hace falta, la zona y la ciudad: "San Juan — Barrio".
 */
export function coloniaOptions(list: Asentamiento[]): { items: Asentamiento[]; labels: string[] } {
  const seen = new Set<string>();
  const items = list.filter((item) => {
    const key = [item.nombre, item.tipo, item.zona, item.ciudad ?? ''].map(normalizeText).join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  const extras = items.map((): string[] => []);
  const labelAt = (index: number) => {
    const extra = extras[index] ?? [];
    const nombre = items[index]?.nombre ?? '';
    return extra.length > 0 ? `${nombre} — ${extra.join(', ')}` : nombre;
  };

  for (const detail of [(item: Asentamiento) => item.tipo, (item: Asentamiento) => item.zona, (item: Asentamiento) => item.ciudad]) {
    const keys = items.map((_, index) => normalizeText(labelAt(index)));
    const repeated = new Set(keys.filter((key, index) => keys.indexOf(key) !== index));
    if (repeated.size === 0) {
      break;
    }
    items.forEach((item, index) => {
      const value = detail(item);
      if (repeated.has(keys[index] ?? '') && value) {
        extras[index]?.push(value);
      }
    });
  }

  return { items, labels: items.map((_, index) => labelAt(index)) };
}

/** El <label> que envuelve al campo, o el campo: lo que se inserta va después, fuera del label. */
function outside(field: Fillable): Element {
  return field.closest('label') ?? field;
}

/** Avisa a los frameworks (React, Vue...) que el valor cambió. */
function notify(field: Fillable): void {
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

function brandingHref(doc: Document): string {
  const params = new URLSearchParams({
    utm_source: 'widget',
    utm_medium: 'referral',
    utm_campaign: 'branding',
  });
  const host = doc.location?.hostname;
  if (host) {
    params.set('utm_content', host);
  }
  return `${BRANDING_URL}?${params.toString()}`;
}

function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

/** Estilos mínimos con especificidad cero (`:where`), fáciles de sobrescribir. */
function injectStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) {
    return;
  }
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    ':where(.osopostal-status){font-size:.875em;margin-top:.25em;min-height:0}' +
    ':where(.osopostal-status:empty){margin:0}' +
    ':where(.osopostal-branding){font-size:.75em;opacity:.7;margin-top:.25em}' +
    ':where(.osopostal-branding a){color:inherit}';
  doc.head.append(style);
}
