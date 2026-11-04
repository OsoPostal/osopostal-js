/** Estado tal como lo devuelve la API (`data.estado`). */
export interface Estado {
  /** Clave INEGI de dos dígitos, por ejemplo `09`. */
  clave: string;
  nombre: string;
  /** Código ISO 3166-2, por ejemplo `MX-CMX`. */
  iso: string | null;
}

/** Municipio o alcaldía (`data.municipio`). */
export interface Municipio {
  clave: string;
  nombre: string;
}

/** Asentamiento (colonia, fraccionamiento, barrio...) del código postal. */
export interface Asentamiento {
  nombre: string;
  tipo: string;
  zona: string;
  ciudad: string | null;
}

/** Datos de un código postal (`data` de la respuesta). */
export interface PostalCode {
  codigo_postal: string;
  estado: Estado;
  municipio: Municipio;
  asentamientos: Asentamiento[];
}

/** Respuesta completa del endpoint público. */
export interface PublicPostalCodeResponse {
  data: PostalCode;
  meta?: {
    widget?: {
      branding?: boolean;
    };
  };
}

/** Resultado de `lookup`: un 404 no es un error, es un resultado. */
export type LookupResult =
  | {
      status: 'found';
      postalCode: PostalCode;
      /** `true` si el plan muestra la marca de agua de OsoPostal. */
      branding: boolean;
    }
  | {
      status: 'not-found';
      codigoPostal: string;
    };

export type EstadoFormat = 'nombre' | 'clave' | 'iso';
