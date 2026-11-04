import type { Estado, EstadoFormat } from './types';

/** Minúsculas, sin acentos, sin puntuación y con espacios colapsados. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nombres alternativos comunes en los selects de estado de las tiendas,
 * por clave INEGI. El nombre oficial, la clave y el ISO se agregan aparte.
 */
const ALIASES: Record<string, string[]> = {
  '05': ['Coahuila'],
  '09': ['CDMX', 'Distrito Federal', 'DF', 'Ciudad de Mexico', 'Mexico City'],
  '15': ['Estado de Mexico', 'Edo de Mexico', 'Edo Mex', 'Edomex', 'Mexico State'],
  '16': ['Michoacan'],
  '30': ['Veracruz'],
};

/** Valor del estado en el formato pedido. */
export function formatEstado(estado: Estado, format: EstadoFormat): string {
  if (format === 'clave') {
    return estado.clave;
  }
  if (format === 'iso') {
    return estado.iso ?? estado.nombre;
  }
  return estado.nombre;
}

/**
 * Formas en que un estado puede aparecer en un `<select>`, de la más a la
 * menos específica: el formato elegido primero, luego el resto.
 */
export function estadoCandidates(estado: Estado, format: EstadoFormat): string[] {
  const iso = estado.iso ?? '';
  const candidates = [
    formatEstado(estado, format),
    estado.nombre,
    estado.clave,
    String(Number(estado.clave)),
    iso,
    iso.replace(/^MX-/, ''),
    ...(ALIASES[estado.clave] ?? []),
  ];

  return [...new Set(candidates.filter(Boolean).map(normalizeText))];
}

/**
 * Busca la opción del `<select>` que corresponde al estado. Compara contra el
 * `value` y el texto de cada opción, sin acentos ni mayúsculas.
 */
export function findOption(select: HTMLSelectElement, candidates: string[]): HTMLOptionElement | undefined {
  const options = Array.from(select.options).filter((option) => !option.disabled);

  for (const candidate of candidates) {
    const match = options.find(
      (option) => normalizeText(option.value) === candidate || normalizeText(option.text) === candidate,
    );
    if (match) {
      return match;
    }
  }

  return undefined;
}
