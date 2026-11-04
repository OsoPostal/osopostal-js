export { createClient, DEFAULT_BASE_URL, DEFAULT_TIMEOUT, OsoPostalError } from './client';
export type { Client, ClientOptions, LookupOptions, OsoPostalErrorCode } from './client';
export { attach, coloniaOptions, DEFAULT_TEXTS } from './attach';
export type {
  AttachOptions,
  Controller,
  ErrorDetail,
  FieldName,
  FieldTarget,
  NotFoundDetail,
  ResolvedDetail,
  Texts,
} from './attach';
export { estadoCandidates, findOption, formatEstado, normalizeText } from './normalize';
export type {
  Asentamiento,
  Estado,
  EstadoFormat,
  LookupResult,
  Municipio,
  PostalCode,
  PublicPostalCodeResponse,
} from './types';
