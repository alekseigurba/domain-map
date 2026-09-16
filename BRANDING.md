# Building on domain-map

This package is meant to be installed by another repo, branded, and upgraded —
not forked. Your repo holds two folders and a ten-line server; everything else
stays here and moves forward with the version you pin.

## Start a repo

```bash
# The bin lives inside the `domain-map` package, so npx has to be told where to
# find it: `npx create-domain-map-app` on its own looks for a package of that
# name on the npm registry, and there is none.
npx --package=github:alekseigurba/domain-map create-domain-map-app acme-domain-map \
  --title "Acme domain map" --color "#7b2d8e"

# Add --ssh if you keep your own fork private: the repo it writes then depends
# on a git+ssh URL rather than the https one.
cd acme-domain-map
npm install
npm run start:dev
```

That writes a working repo: a server, a brand directory, a seed directory, a
Dockerfile and a compose file. Open <http://localhost:8000> and it is already
your colour, your logo and your map.

## The integration

```js
import { createDomainMapServer } from 'domain-map';
import { fileURLToPath } from 'node:url';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

createDomainMapServer({
  brandDir: here('brand'),
  seedDir: here('seed'),
}).listen(8000);
```

| Option | Default | What it is |
| --- | --- | --- |
| `brandDir` | `$BRAND_DIR`, else none | Files here are served instead of the package's copy of the same path. |
| `seedDir` | `$SEED_DIR`, else the package's | What an empty store is filled from. **Replaces** the package's, never merges. |
| `storageDir` | `$STORAGE_DIR`, else `./storage` | Where the store writes. Resolved against the working directory, because the data is yours. |
| `store` | a directory store on `storageDir` | `{ read(key), write(key, body), list(prefix) }`. The whole contract — enough to put S3 behind it. |
| `auth` | Entra ID from the environment | `{ handle(request, response, url), warnings }`. Supply your own for a provider that is not Microsoft. |
| `root` | the package's `app/` | The app's own static files. You should not need this. |
| `log` / `warn` | `console.log` / `console.warn` | Where the startup lines go. |

It returns an ordinary `http.Server` that has not been listened on. Seeding
starts immediately and the first request waits for it, so there is no async
setup step and no window where a request is served from an unseeded store.

## What you may override

Any path under `brandDir` shadows the package's file at the same path. That is a
sharp tool, so only this list is supported:

| Path | Use it for |
| --- | --- |
| `css/brand.css` | **The main one.** Colours, type, the map's fills. Loaded last by both pages, so it wins. |
| `favicon.svg` | The tab icon. |
| `fonts/*` | Your own woff2 files, declared from `css/brand.css`. |
| `css/fonts.css` | Only if you want to drop the bundled Poppins faces entirely. |
| `js/defaults.js` | What a new domain or capability looks like. See the caveat below. |

**Everything else under the package's `app/` is internal.** `app/js/main.js`,
`diagram.js`, `store.js` and the rest change between versions without notice.
Shadowing one of them will work, and will then break on an upgrade at a moment
of the package's choosing rather than yours.

## Branding with tokens

Every visual decision is a custom property on `:root` in the package's
`tokens.css`, so `css/brand.css` is the whole of a rebrand:

```css
:root {
  --r-brand-400: #7b2d8e;   /* the brand colour, throughout the chrome */
  --font-heading: "Acme Grotesk";
  --font-text: "Acme Grotesk";
  --c1: #7b2d8e;               /* swatch 1 of the map's 24 shape fills */
}
```

`--r-brand-100` … `--r-brand-600` is the one raw scale meant to be replaced;
everything else in the chrome is named for what it is (haze, sage, charcoal) and
stays put.

One thing that catches people: the panel surfaces and dividers come from `sage`,
which ships as haze tinted toward the *default* green. Override `--r-brand-400`
alone and you get your colour on the buttons but faintly green panels behind
them. For a thorough rebrand, retint those four as well:

```css
:root {
  --r-sage-200: #f4f1f5;   /* --chrome: header, footer, both sidebars */
  --r-sage-400: #ebe4ed;   /* --chrome-hover */
  --r-sage-500: #dbcfdd;   /* --line */
  --r-sage-600: #c6b7c9;   /* --line-strong */
}
```

The 24 fills matter more than they look. The app reads `--c1` … `--c24` back out
of the stylesheet at startup, so the palette the map draws with follows your
tokens — as long as the map file itself carries no `palette` key. The scaffolded
starter map deliberately omits one for that reason. Once someone edits the
palette inside the app, that map keeps its own copy and stops following the
stylesheet, which is the behaviour you want: their edit outlives your deploy.

Two constraints:

- `css/brand.css` must stay a `<link>` in the head. The palette is read once when
  the module first runs, so a stylesheet injected later is read too late.
- If sign-in is on, the sign-in page is branded too — it is served before any
  session exists, along with `css/brand.css`, `favicon.svg` and `fonts/`.

## Branding with stored settings

The header logo, the page title and the footer come from `data/settings.json` in
the **store**, not from the brand directory, so they can be changed on a running
instance without a deploy:

```json
{
  "logoSrc": "api/files/data/brand/logo.svg",
  "logoAlt": "Acme domain map",
  "title": "Acme domain map",
  "footer": "Maintained by the architecture team"
}
```

Ship your copy at `seed/data/settings.json` and it becomes the starting value.

## How seeding works

`seed/` mirrors the store's key space exactly: `seed/data/icons/gear.svg` becomes
the object `data/icons/gear.svg`. Each folder is filled only when the store holds
nothing in it yet, counting only that folder and not the ones below it — so a
store that has maps but no icons still gets the icons.

It fills an empty store **once**. After that the store is the source of truth and
`seed/` is never consulted again, so editing these files will not disturb a map
anyone has worked on. To start over, delete the store: `rm -rf storage`, or
`docker compose down -v`.

## The overlay caveat, and what to do about it

`js/defaults.js` is supported but it is a shadow of a real module, so a version
that changes the shape schema breaks your copy silently — a missing field does
not fall back on anything. Point your CI at the package's own check:

```bash
node node_modules/domain-map/tests/defaults.test.mjs brand/js/defaults.js
```

It validates your defaults against the same rules the map importer uses, which
turns a silent breakage into a failed build. Run it on every upgrade.

## Upgrading

```bash
npm install domain-map@github:OWNER/REPO#v1.1.0
```

Pin a tag rather than a range. There is no build step in this package, so npm
installs straight from the tag and what you get is exactly what is in it.
