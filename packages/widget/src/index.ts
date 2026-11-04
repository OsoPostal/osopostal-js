import {
  type AttachOptions,
  attach as attachCore,
  type Client,
  type Controller,
  createClient,
  type EstadoFormat,
  type FieldName,
} from '@osopostal/js';

export type { AttachOptions, Controller } from '@osopostal/js';

declare const __VERSION__: string;

export interface OsoPostalGlobal {
  version: string;
  /** Inicializa un formulario a mano. Usa la key del `<script>` si no se pasa `publicKey`. */
  attach(scope: Element | Document | string, options?: AttachOptions): Controller;
  /** Busca formularios nuevos (por ejemplo, en una SPA) y los inicializa. */
  init(root?: ParentNode): Controller[];
  createClient: typeof createClient;
}

declare global {
  interface Window {
    OsoPostal?: OsoPostalGlobal;
  }
}

const FIELDS: FieldName[] = ['cp', 'estado', 'municipio', 'ciudad', 'colonia'];
const ESTADO_FORMATS: EstadoFormat[] = ['nombre', 'clave', 'iso'];

// `currentScript` solo existe mientras el script se ejecuta: se lee al cargar.
const script = typeof document !== 'undefined' ? (document.currentScript as HTMLScriptElement | null) : null;
const clients = new Map<string, Client>();

/** Opciones del `<script>`: `data-key`, `data-base-url`, `data-estado-format`, `data-timeout`, `data-debounce`. */
function scriptDefaults(): AttachOptions {
  const data = script?.dataset ?? {};
  const options: AttachOptions = {};

  if (data.key) options.publicKey = data.key;
  if (data.baseUrl) options.baseUrl = data.baseUrl;
  if (data.estadoFormat && (ESTADO_FORMATS as string[]).includes(data.estadoFormat)) {
    options.estadoFormat = data.estadoFormat as EstadoFormat;
  }
  if (data.timeout && Number(data.timeout) > 0) options.timeout = Number(data.timeout);
  if (data.debounce && Number(data.debounce) >= 0) options.debounce = Number(data.debounce);

  return options;
}

/** Un cliente por key y URL base: los formularios de la página comparten la caché. */
function sharedClient(options: AttachOptions): Client {
  const id = `${options.baseUrl ?? ''}|${options.publicKey ?? ''}`;
  let client = clients.get(id);
  if (!client) {
    client = createClient(options);
    clients.set(id, client);
  }
  return client;
}

export function attach(scope: Element | Document | string, options: AttachOptions = {}): Controller {
  const merged: AttachOptions = { ...scriptDefaults(), ...options };
  return attachCore(scope, { ...merged, client: merged.client ?? sharedClient(merged) });
}

function tryAttach(scope: Element | Document, options: AttachOptions, found: Controller[]): void {
  try {
    found.push(attach(scope, options));
  } catch (error) {
    console.warn(error instanceof Error ? error.message : error);
  }
}

function isAttached(element: Element | null): boolean {
  return !!element?.hasAttribute('data-osopostal-attached');
}

/**
 * Inicializa los formularios de la página:
 * 1. Con los selectores del `<script>` (`data-cp`, `data-estado`...).
 * 2. Con atributos en los campos (`data-osopostal="cp"`), un formulario por cada
 *    `[data-osopostal-form]` o, si no hay, por cada `<form>` con un campo de CP.
 */
export function init(root: ParentNode = document): Controller[] {
  const controllers: Controller[] = [];
  const data = script?.dataset ?? {};

  if (!scriptDefaults().publicKey) {
    console.warn('OsoPostal: falta data-key en el <script> del widget.');
    return controllers;
  }

  // 1. Selectores en el <script>.
  if (data.cp) {
    const cpFields = Array.from(root.querySelectorAll(data.cp));
    for (const cp of cpFields) {
      if (isAttached(cp)) continue;
      const fields: Partial<Record<FieldName, string | Element>> = { cp };
      // Con un solo campo de CP, los selectores se buscan en todo el documento;
      // con varios (facturación y envío), dentro del formulario de cada uno.
      const scope: Element | Document = cpFields.length === 1 ? document : (cp.closest('form') ?? document);
      for (const name of FIELDS) {
        const selector = name === 'cp' ? undefined : data[name];
        if (selector) {
          const field = scope.querySelector(selector);
          if (field) fields[name] = field;
        }
      }
      tryAttach(scope, { fields }, controllers);
    }
  }

  // 2. Atributos en los campos.
  for (const form of Array.from(root.querySelectorAll('[data-osopostal-form]'))) {
    if (isAttached(form.querySelector('[data-osopostal="cp"]'))) continue;
    tryAttach(form, formOptions(form), controllers);
  }
  for (const cp of Array.from(root.querySelectorAll('[data-osopostal="cp"]'))) {
    if (isAttached(cp)) continue;
    const form = cp.closest('form');
    tryAttach(form ?? document, form ? formOptions(form) : {}, controllers);
  }

  return controllers;
}

/** Opciones por formulario: `data-osopostal-estado-format`. */
function formOptions(form: Element): AttachOptions {
  const format = form.getAttribute('data-osopostal-estado-format');
  return format && (ESTADO_FORMATS as string[]).includes(format) ? { estadoFormat: format as EstadoFormat } : {};
}

if (typeof window !== 'undefined') {
  window.OsoPostal = { version: __VERSION__, attach, init, createClient };

  if (script?.dataset.key || script?.dataset.cp) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => init(), { once: true });
    } else {
      init();
    }
  }
}
