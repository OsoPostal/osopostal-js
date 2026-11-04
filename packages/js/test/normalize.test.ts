import { describe, expect, it } from 'vitest';
import { estadoCandidates, findOption, formatEstado, normalizeText } from '../src';

const CDMX = { clave: '09', nombre: 'Ciudad de México', iso: 'MX-CMX' };
const EDOMEX = { clave: '15', nombre: 'México', iso: 'MX-MEX' };
const VERACRUZ = { clave: '30', nombre: 'Veracruz de Ignacio de la Llave', iso: 'MX-VER' };

function select(options: Array<[string, string]>): HTMLSelectElement {
  const element = document.createElement('select');
  for (const [value, text] of options) {
    element.append(new Option(text, value));
  }
  return element;
}

describe('normalización de estados', () => {
  it('compara sin acentos, mayúsculas ni espacios extra', () => {
    expect(normalizeText('  Ciudad  de MÉXICO. ')).toBe('ciudad de mexico');
  });

  it('formatea el estado por nombre, clave o ISO', () => {
    expect(formatEstado(CDMX, 'nombre')).toBe('Ciudad de México');
    expect(formatEstado(CDMX, 'clave')).toBe('09');
    expect(formatEstado(CDMX, 'iso')).toBe('MX-CMX');
    expect(formatEstado({ ...CDMX, iso: null }, 'iso')).toBe('Ciudad de México');
  });

  it.each([
    ['nombre sin acentos', [['', 'Selecciona'], ['CMX', 'Ciudad de Mexico']], 'CMX'],
    ['alias CDMX', [['a', 'Aguascalientes'], ['cdmx', 'CDMX']], 'cdmx'],
    ['alias Distrito Federal', [['df', 'Distrito Federal']], 'df'],
    ['clave sin cero', [['1', 'Aguascalientes'], ['9', 'Ciudad de México']], '9'],
    ['ISO sin prefijo', [['AGU', 'Aguascalientes'], ['CMX', 'CDMX']], 'CMX'],
  ] as Array<[string, Array<[string, string]>, string]>)('encuentra CDMX por %s', (_, options, expected) => {
    expect(findOption(select(options), estadoCandidates(CDMX, 'nombre'))?.value).toBe(expected);
  });

  it('prefiere el formato elegido', () => {
    const element = select([
      ['09', 'Ciudad de México'],
      ['MX-CMX', 'Ciudad de México (ISO)'],
    ]);

    expect(findOption(element, estadoCandidates(CDMX, 'iso'))?.value).toBe('MX-CMX');
    expect(findOption(element, estadoCandidates(CDMX, 'clave'))?.value).toBe('09');
  });

  it('reconoce los nombres cortos de estados con nombre oficial largo', () => {
    expect(findOption(select([['VER', 'Veracruz']]), estadoCandidates(VERACRUZ, 'nombre'))?.value).toBe('VER');
    expect(findOption(select([['MEX', 'Estado de México']]), estadoCandidates(EDOMEX, 'nombre'))?.value).toBe('MEX');
  });

  it('no confunde el Estado de México con la Ciudad de México', () => {
    const element = select([
      ['CMX', 'Ciudad de México'],
      ['MEX', 'México'],
    ]);

    expect(findOption(element, estadoCandidates(EDOMEX, 'nombre'))?.value).toBe('MEX');
    expect(findOption(element, estadoCandidates(CDMX, 'nombre'))?.value).toBe('CMX');
  });
});
