# @osopostal/js

Cliente de la API pública de [OsoPostal](https://osopostal.com) y autocompletado de
direcciones mexicanas por código postal (datos de SEPOMEX). Sin dependencias, con ESM, CJS
y tipos de TypeScript.

Para instalar el autocompletado con una etiqueta `<script>`, sin bundler, usa
[`@osopostal/widget`](https://www.npmjs.com/package/@osopostal/widget).

```sh
npm install @osopostal/js
```

Necesitas la **key pública** (`osp_pk_...`) de una integración del panel de OsoPostal, con
los dominios de tu sitio entre sus dominios permitidos (`localhost` acepta cualquier
puerto). Nunca uses la key secreta (`osp_sk_...`) en el navegador.

## Autocompletar un formulario

```js
import { attach } from '@osopostal/js';

const controller = attach('#checkout', {
  publicKey: 'osp_pk_...',
  fields: {
    cp: '[name=cp]',
    estado: '[name=estado]',
    municipio: '[name=municipio]',
    ciudad: '[name=ciudad]',
    colonia: '[name=colonia]',
  },
});

// Al desmontar el formulario:
controller.detach();
```

Si los campos tienen `data-osopostal="cp"`, `data-osopostal="estado"`, etc., no hace falta
`fields`.

Al escribir los 5 dígitos del CP, `attach` consulta la API y:

- Llena estado, municipio y ciudad, solo si están vacíos o los llenó el propio
  controlador. Nunca sobrescribe lo que escribió el usuario. Si el CP cambia, limpia lo que
  llenó y vuelve a consultar.
- **Estado:** si es un `<select>`, elige la opción comparando sin acentos ni mayúsculas
  contra el nombre, la clave y el código ISO, y reconoce nombres comunes como `CDMX`,
  `Estado de México`, `Coahuila`, `Michoacán` o `Veracruz`. Si es un input, escribe el
  valor en el formato de `estadoFormat`.
- **Colonia:** muestra un `<select>` con las colonias del CP y la opción *Mi colonia no
  aparece*, que vuelve a mostrar el campo original. El campo original siempre es el que se
  envía con el formulario.
- **Nunca bloquea el formulario:** ante un error o un timeout, los campos quedan
  editables. Un CP que no existe se informa con un mensaje discreto, sin invalidar el campo.
- Anuncia el estado de la consulta en una región `aria-live` ligada al campo del CP.

Cada `attach` es independiente, así que una página puede tener varios formularios (por
ejemplo, facturación y envío). Para que compartan la caché, pásales el mismo `client`.

### React

```jsx
import { attach } from '@osopostal/js';
import { useEffect, useRef } from 'react';

function DireccionForm() {
  const form = useRef(null);

  useEffect(() => {
    const controller = attach(form.current, { publicKey: 'osp_pk_...' });
    return () => controller.detach();
  }, []);

  return (
    <form ref={form}>
      <input name="cp" data-osopostal="cp" />
      <input name="colonia" data-osopostal="colonia" />
      {/* … */}
    </form>
  );
}
```

El controlador avisa los cambios con eventos `input` y `change`, así que los formularios
controlados (React, Vue, etc.) reciben los valores que escribe.

## API

### `attach(scope, options)`

`scope` es el formulario o el contenedor donde buscar los campos: un elemento, un selector
CSS o `document`. Devuelve un `Controller`.

| Opción | Descripción |
| --- | --- |
| `publicKey` | Key pública (`osp_pk_...`). |
| `client` | Un cliente de `createClient`, en lugar de `publicKey` y las demás opciones del cliente. |
| `fields` | Selectores CSS o elementos de `cp`, `estado`, `municipio`, `ciudad` y `colonia`. Por defecto, `[data-osopostal="<campo>"]`. Solo `cp` es obligatorio. |
| `estadoFormat` | `'nombre'` (por defecto, `Ciudad de México`), `'clave'` (INEGI, `09`) o `'iso'` (`MX-CMX`). |
| `debounce` | Espera tras el último dígito antes de consultar, en ms. Por defecto `250`. |
| `texts` | Textos de la interfaz (ver abajo). |
| `onResolved`, `onNotFound`, `onError` | Callbacks con el mismo `detail` que los eventos. |
| `baseUrl`, `timeout`, `headers`, `fetch` | Opciones del cliente (ver `createClient`). |

`Controller`:

- `lookup(codigoPostal)`: consulta un CP sin esperar al debounce.
- `detach()`: quita los listeners y los elementos agregados. Los valores escritos se
  conservan.

#### Textos

```js
attach(form, {
  publicKey: 'osp_pk_...',
  texts: {
    loading: 'Buscando código postal…',
    notFound: 'No encontramos este código postal. Puedes llenar los datos a mano.',
    error: '', // vacío: los errores son silenciosos
    coloniaPlaceholder: 'Selecciona tu colonia',
    coloniaNotListed: 'Mi colonia no aparece',
    coloniaLabel: 'Colonia', // label del select si el campo original no tiene <label>
  },
});
```

#### Eventos

El formulario (o el campo del CP, si `scope` es `document`) emite eventos que burbujean:

| Evento | `detail` |
| --- | --- |
| `osopostal:resolved` | `{ codigoPostal, postalCode, branding }` |
| `osopostal:not-found` | `{ codigoPostal }` |
| `osopostal:error` | `{ codigoPostal, error }` (un `OsoPostalError`) |

#### Estilos

| Clase | Elemento |
| --- | --- |
| `.osopostal-status` | Mensaje de estado (`data-state`: `idle`, `loading`, `resolved`, `not-found`, `error`). |
| `.osopostal-colonia` | Select de colonias; además copia las clases del campo original. |
| `.osopostal-branding` | Marca de agua. |

Los estilos que agrega el controlador tienen especificidad cero y se sobrescriben con
cualquier regla propia.

### `createClient(options)`

Cliente de la API sin interfaz, por ejemplo para validar un CP o armar tu propio formulario.

```js
import { createClient, OsoPostalError } from '@osopostal/js';

const client = createClient({ publicKey: 'osp_pk_...' });

try {
  const result = await client.lookup('06000');

  if (result.status === 'found') {
    const { estado, municipio, asentamientos } = result.postalCode;
    console.log(estado.nombre, municipio.nombre, asentamientos.map((a) => a.nombre));
  } else {
    console.log(`El CP ${result.codigoPostal} no existe`);
  }
} catch (error) {
  if (error instanceof OsoPostalError) console.log(error.code, error.status);
}
```

| Opción | Descripción |
| --- | --- |
| `publicKey` | Key pública. Se envía en el query string para evitar el preflight de CORS. |
| `baseUrl` | URL base de la API. Por defecto `https://api.osopostal.com/v1`. |
| `timeout` | Tiempo máximo por consulta, en ms. Por defecto `3000`. |
| `headers` | Headers extra, por ejemplo para un proxy propio. En el navegador provocan un preflight de CORS. |
| `fetch` | Implementación de `fetch`. Por defecto la global. |

`lookup(codigoPostal, { signal })`:

- Resuelve con `{ status: 'found', postalCode, branding }` o con
  `{ status: 'not-found', codigoPostal }`. Un CP que no existe no es un error.
- Guarda los resultados en una caché en memoria durante la sesión (`clearCache()` la vacía).
- Sin `signal`, cada consulta cancela la anterior que siga pendiente. Con `signal`, la
  cancelación queda en tus manos.
- Rechaza con un `OsoPostalError`, cuyo `code` es el de la API (`invalid_public_key`,
  `origin_not_allowed`, `rate_limited`, …) o uno local: `invalid_postal_code`, `aborted`,
  `timeout`, `network_error`, `invalid_response` o `http_error`.

### Utilidades

- `coloniaOptions(asentamientos)`: las colonias sin duplicados idénticos y con el texto de
  cada opción. Si un nombre se repite, agrega el tipo (`San Juan — Barrio`).
- `formatEstado(estado, formato)`, `estadoCandidates(estado, formato)`,
  `findOption(select, candidatos)` y `normalizeText(texto)`: la normalización de estados
  que usa `attach`.

## Marca de agua

En el plan free, `attach` muestra la línea *Autocompletado por OsoPostal* junto al campo
de colonia, con un enlace (`branding: true` en la respuesta). El plan pro la quita.
Ocultarla con CSS en el plan free viola los términos de servicio.

## Licencia

MIT
