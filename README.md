# osopostal-js

Paquetes de JavaScript de [OsoPostal](https://osopostal.com): autocompletado de direcciones
mexicanas a partir del código postal.

| Paquete | Qué es |
| --- | --- |
| [`@osopostal/js`](packages/js) | Núcleo sin dependencias: cliente de la API pública (`createClient`) y controlador de autocompletado (`attach`). ESM + CJS + tipos. |
| [`@osopostal/widget`](packages/widget) | Bundle IIFE que se autoinicializa desde un `<script>` y expone `window.OsoPostal`. |

```html
<script src="https://cdn.jsdelivr.net/npm/@osopostal/widget@1"
        data-key="osp_pk_..."
        data-cp="#cp" data-estado="#estado" data-municipio="#municipio" data-colonia="#colonia"
        defer></script>
```

## Desarrollo

Requiere Node 20+ y pnpm.

```sh
pnpm install
pnpm build       # tsup: dist/ de ambos paquetes
pnpm typecheck
pnpm test        # Vitest + jsdom
pnpm size        # presupuesto: @osopostal/widget < 10 KB gzip
pnpm e2e         # build + Playwright contra el mock de la API (e2e/mock-api.mjs)
```

### Demo

```sh
pnpm demo        # http://localhost:5500/demo/
```

La demo lee `?key=osp_pk_...&baseUrl=...` del query string. Por defecto apunta a la app
local (`https://osopostal.test/v1`); `localhost` debe estar entre los dominios permitidos
de la integración.

### Mock de la API (E2E)

`node e2e/server.mjs` levanta el mock en `http://localhost:4010/v1` y la demo en
`http://localhost:5173/demo/`. Keys del mock:

| Key | Comportamiento |
| --- | --- |
| `osp_pk_test` | Permite `http://localhost:5173`, con marca de agua (free). |
| `osp_pk_pro` | Permite `http://localhost:5173`, sin marca de agua (pro). |
| `osp_pk_blocked` | Solo permite `https://mitienda.com`: responde 403 `origin_not_allowed`. |

CP con datos: `06000` y `50000`; cualquier otro responde 404.

## Publicación

Versionado semántico con [Changesets](https://github.com/changesets/changesets). La versión
mayor solo cambia con cambios incompatibles del snippet o de la API pública, porque el
snippet queda en sitios de terceros con la mayor fijada (`@1`).

1. `pnpm changeset` en cada PR con cambios publicables.
2. Al fusionar a `main`, el workflow `Release` abre el PR "Version Packages".
3. Al fusionar ese PR, `Release` deja las versiones nuevas en el **staging** de npm
   (`scripts/stage-release.mjs`) y crea sus tags `<paquete>@<versión>`.
4. Un maintainer revisa y aprueba cada versión con 2FA en npmjs.com → *Staged Packages*
   (o con `pnpm stage approve <id>`). Hasta entonces no llega a npm ni a jsDelivr.
5. Tras aprobar el widget, correr a mano el workflow `Verificar jsDelivr`, que purga el
   caché y comprueba que `@osopostal/widget@<mayor>` sirva la versión nueva.

El staging agrega una aprobación humana con 2FA a cada versión: el snippet `@1` se
actualiza solo en todas las tiendas, así que un workflow comprometido no debe poder
publicar por su cuenta.

La publicación usa [trusted publishing](https://docs.npmjs.com/trusted-publishers/): no hay
`NPM_TOKEN`. pnpm cambia el token OIDC de GitHub Actions por uno temporal de npm y agrega
provenance. Cada paquete tiene configurado en npmjs.com (*Settings → Trusted publishing*)
este trusted publisher:

| Campo | Valor |
| --- | --- |
| Organization or user | `OsoPostal` |
| Repository | `osopostal-js` |
| Workflow filename | `release.yml` |
| Allowed actions | ninguna marcada (`npm stage publish` siempre está permitido) |

Un paquete nuevo debe existir en npm antes de configurar su trusted publisher, así que su
primera versión se publica a mano con `npm login` y `pnpm changeset publish` (con 2FA).

Si se rechaza una versión en staging, borra su tag (`git push origin :refs/tags/<tag>`) para
que el siguiente push a `main` la vuelva a enviar.
