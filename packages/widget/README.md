# @osopostal/widget

Autocompleta formularios de dirección mexicanos a partir del código postal, con una sola
etiqueta `<script>`. Al escribir los 5 dígitos del CP, llena estado, municipio y ciudad, y
convierte el campo de colonia en una lista de las colonias de ese CP.

Usa la API pública de [OsoPostal](https://osopostal.com) (datos de SEPOMEX). El núcleo,
sin dependencias, está en [`@osopostal/js`](https://www.npmjs.com/package/@osopostal/js).

## Antes de empezar

1. Crea una integración en el panel de OsoPostal y copia su **key pública** (`osp_pk_...`).
2. Agrega los **dominios permitidos** de tu sitio a la integración. La key pública solo
   funciona desde esos dominios (`localhost` acepta cualquier puerto, para desarrollo).

La key pública puede ir en el HTML de tu sitio: solo permite consultar códigos postales
y solo desde tus dominios. Nunca uses la key secreta (`osp_sk_...`) en el navegador.

## Instalación con `<script>`

Indica los campos con selectores CSS en el propio `<script>`:

```html
<script src="https://cdn.jsdelivr.net/npm/@osopostal/widget@1"
        data-key="osp_pk_..."
        data-cp="#cp" data-estado="#estado" data-municipio="#municipio" data-colonia="#colonia"
        defer></script>
```

O marca los campos con atributos `data-osopostal` y omite los selectores:

```html
<form data-osopostal-form>
  <input name="cp" data-osopostal="cp">
  <input name="colonia" data-osopostal="colonia">
  <input name="municipio" data-osopostal="municipio">
  <input name="ciudad" data-osopostal="ciudad">
  <select name="estado" data-osopostal="estado">…</select>
</form>

<script src="https://cdn.jsdelivr.net/npm/@osopostal/widget@1" data-key="osp_pk_..." defer></script>
```

`data-osopostal-form` delimita cada formulario, así que una página puede tener varios (por
ejemplo, dirección de facturación y de envío), cada uno independiente. Sin
`data-osopostal-form`, cada `<form>` con un campo `data-osopostal="cp"` cuenta como un
formulario.

La URL `@osopostal/widget@1` recibe todas las versiones compatibles de la mayor 1. Los
cambios incompatibles salen en una nueva versión mayor y no te llegan sin que cambies la URL.

### Opciones del `<script>`

| Atributo | Descripción |
| --- | --- |
| `data-key` | Key pública. Obligatoria. |
| `data-cp`, `data-estado`, `data-municipio`, `data-ciudad`, `data-colonia` | Selectores CSS de los campos. Solo `data-cp` es obligatorio. |
| `data-estado-format` | Cómo escribir el estado: `nombre` (por defecto, `Ciudad de México`), `clave` (INEGI, `09`) o `iso` (`MX-CMX`). |
| `data-timeout` | Tiempo máximo por consulta, en ms. Por defecto `3000`. |
| `data-debounce` | Espera tras el último dígito antes de consultar, en ms. Por defecto `250`. |
| `data-base-url` | URL base de la API. Por defecto `https://api.osopostal.com/v1`. |

Con atributos en los campos, el formato del estado también se puede elegir por formulario
con `data-osopostal-estado-format` en el elemento `data-osopostal-form`.

## Cómo se comporta

- **Solo llena campos vacíos** o que llenó el propio widget. Nunca sobrescribe lo que
  escribió el usuario. Si el CP cambia, limpia lo que llenó y vuelve a consultar.
- **Estado:** si es un `<select>`, elige la opción comparando sin acentos ni mayúsculas
  contra el nombre, la clave y el código ISO, y reconoce nombres comunes como `CDMX`,
  `Estado de México`, `Coahuila`, `Michoacán` o `Veracruz`. Si es un input, escribe el
  valor en el formato elegido.
- **Colonia:** muestra un `<select>` con las colonias del CP y la opción *Mi colonia no
  aparece*, que vuelve a mostrar el campo original para escribirla a mano. El campo
  original siempre es el que se envía con el formulario, así que tu backend no cambia.
- **Nunca bloquea el formulario.** Ante un error de red, un timeout o un error de la API,
  los campos quedan editables y el formulario se puede enviar. Un CP que no existe se
  informa con un mensaje discreto, sin invalidar el campo.
- **Accesible:** anuncia el estado de la consulta en una región `aria-live` ligada al
  campo del CP, y el select de colonias usa el `<label>` del campo original.

## SPAs y formularios que aparecen después

El widget inicializa los formularios que existen cuando carga. Para los que aparecen
después, usa `window.OsoPostal`:

```js
// Busca formularios nuevos (atributos data-osopostal o selectores del <script>) y los inicializa.
window.OsoPostal.init();

// O inicializa uno a mano; usa la key del <script> si no pasas publicKey.
const controller = window.OsoPostal.attach('#checkout', {
  fields: { cp: '[name=zip]', estado: '[name=state]', colonia: '[name=colonia]' },
});

// Al desmontar el formulario:
controller.detach();
```

`window.OsoPostal.attach` acepta las mismas opciones que `attach` de
[`@osopostal/js`](https://www.npmjs.com/package/@osopostal/js#attachscope-options). En una
SPA con bundler conviene usar `@osopostal/js` directamente.

## Eventos

El formulario emite eventos DOM que burbujean hasta `document`:

```js
document.addEventListener('osopostal:resolved', (event) => {
  const { codigoPostal, postalCode } = event.detail;
});
document.addEventListener('osopostal:not-found', (event) => { /* event.detail.codigoPostal */ });
document.addEventListener('osopostal:error', (event) => { /* event.detail.error.code */ });
```

Un `osopostal:error` con `error.code === 'origin_not_allowed'` indica que el dominio de la
página no está entre los dominios permitidos de la integración.

## Estilos

Los elementos que agrega el widget usan estilos mínimos con especificidad cero, fáciles de
sobrescribir:

| Clase | Elemento |
| --- | --- |
| `.osopostal-status` | Mensaje de estado (`data-state`: `idle`, `loading`, `resolved`, `not-found`, `error`). |
| `.osopostal-colonia` | Select de colonias; además copia las clases del campo original. |
| `.osopostal-branding` | Marca de agua. |

## Marca de agua

En el plan free, el widget muestra la línea *Autocompletado por OsoPostal* junto al campo
de colonia, con un enlace. El plan pro la quita. Ocultarla con CSS en el plan free viola
los términos de servicio.

## Licencia

MIT
