# Building on domain-map

This package is meant to be installed by another repo, branded, and upgraded —
not forked. Your repo holds two folders and a ten-line server; everything else
stays here and moves forward with the version you pin.

## Start a repo

```bash
npx --package=github:alekseigurba/domain-map create-domain-map-app acme-domain-map --title "Acme domain map"
cd acme-domain-map
docker compose up
```

That writes a working repo: a server, a brand directory, a seed directory, a
Dockerfile, a compose file and DEPLOY.md. Compose builds it and runs the
Postgres the versions live in. Open <http://localhost:8000> and it is already
your colour, your logo and your map.

To work on the app itself rather than run it, Node will do, against the same
database: `npm install && npm run db && npm run start:dev`.

## What it needs to run

`DATABASE_URL` — the versions of the map are rows in Postgres, and the server
does not start without one. The compose file in the scaffolded repo runs one.
Everything else — the icons, the logo and `data/settings.json` — stays in the
file store under `STORAGE_DIR`, so a deployment has a volume and a database.

`ASSISTANT_API_URL` and `ASSISTANT_API_KEY` — the model behind the map's
Assistant, and optional. With both, an owner talks to it in the page; without
them the Assistant writes prompts to copy into a chat of their own. The URL is
posted to as it stands, so it is anything that answers chat completions — OpenAI,
Azure OpenAI, Azure AI Foundry, a gateway, Ollama — or Anthropic's Messages API;
`ASSISTANT_API_STYLE` (`openai` or `anthropic`) says which where the URL does
not, and `ASSISTANT_MODEL` names a model where the URL does not — by the API's
own id for it, `claude-haiku-4-5` rather than `haiku`. The key stays on
the server. Every message carries the whole map to that URL, drafts included, and
every contributor may send one — which is everyone who signs in, until an
administrator says otherwise.

`OWNER_EMAILS` — read **once**, into an empty people table the first time the
server starts: the first address becomes the administrator and the rest
contributors. After that, who may do what is managed in the app, in *Users &
access*, and the variable is not looked at again. Left empty, the first person to
sign in is the administrator, and the server warns about that at startup. With
sign-in off, whoever is there is an administrator, which is what makes `npm run
start:dev` work with no configuration at all. There may be several
administrators; for the day they have all left, `npm run make-administrator --
someone@example.com` against `DATABASE_URL` makes someone an administrator —
from a repo built on the package, as
`node node_modules/domain-map/scripts/make-administrator.mjs someone@example.com`,
and on a Container App through `az containerapp exec` into the running revision.

## What you may override

Any path under `brandDir` shadows the package's file at the same path. That is a
sharp tool, so only this list is supported:

| Path | Use it for |
| --- | --- |
| `css/brand.css` | **The main one.** Colours, type, the map's fills, in both themes — see *The dark theme* below. Loaded last by both pages, so it wins. |
| `favicon.svg` | The tab icon. |
| `fonts/*` | Your own woff2 files, declared from `css/brand.css`. |
| `css/fonts.css` | Only if you want to drop the bundled Poppins faces entirely. |
| `js/defaults.js` | What a new domain, capability, touchpoint, actor or area looks like. See the caveat below. One written before 2.3 has no `AREA_SHAPE` and still loads: a new area falls back on the package's own. The three layers are not here: they are a fixed model, in `rules.js`, and not a deployment's to redefine. |

A server of your own is a parameter rather than a file to shadow:
`createDomainMapServer` takes `databaseUrl`, `owners` — what `OWNER_EMAILS`
is, seeded once — `storageDir`, `store`, `auth`, `assistant` and `routes`, the
last under *Pages and routes of your own* below. An `assistant` of your own is `{ chat, host, model }`,
for a model that speaks neither of the two shapes above:
`chat({ system, messages }, { signal })` answers with the model's text, and
`host` and `model` are what the page tells a contributor their messages go to.
An `auth` of your own answers `{ handle, user, required, warnings }`, where
`user(request)` gives `{ source, subject, name, username, email }` or null.
`source` is the door someone came in by and `subject` the provider's own id for
them — `entra` and the object id, in the package's own — and the two are how the
server finds the person's row; without them the email stands in, and without
that nobody can be told apart and everyone is a viewer. The package's own is
`createAuth(env, { onSignIn })`, and the hook is what records a sign-in as it
happens; an auth without one is entered on the person's first request instead.

`skills/*` — what the Assistant can be asked — is **not on this list yet**. The
skill files are new in 2.2 and their format will move once it has met a
connected model, so a brand that shadows one today is on its own. Adding and
rewording skills from a consumer repo is planned for 2.2, and not built yet.

Pages of your own — a path the package does not have — are supported too, and
are under *Pages and routes of your own* below.

**Everything else under the package's `app/` is internal.** `app/js/main.js`,
`diagram.js`, `store.js` and the rest change between versions without notice.
Shadowing one of them will work, and will then break on an upgrade at a moment
of the package's choosing rather than yours.

## The dark theme

The page has a light theme and a dark one. It follows the system until someone
chooses under the avatar, and a brand is worn in both.

**A brand that says nothing about dark is dark all the same.** The dark theme
is one block in `tokens.css` that says again what each semantic token is, under
`:root[data-theme="dark"]`. That selector outranks the plain `:root` a
`brand.css` is written in, so a brand's light paper does not win there and
leave the page half of each: where the dark block names a token, the dark block
holds. What it does not name is yours in both themes, and that is most of a
brand:

- `--r-brand-400` goes where the brand colour went — the badge, the avatar, the
  primary button on the sign-in screen, the edge of a card — and carries white
  type in both themes, so pick one that does. The selected row is mixed from it
  on dark, where on light it is your `--r-brand-200`.
- `--c1` … `--c24` are your fills in both themes. On a dark map each is drawn as
  its dark counterpart — the same colour in less light — worked out from the
  swatch, so a recoloured `--c1` has a dark `--c1` without your saying so.
- Your type, your spacing, your logo.

What does not follow is the tint of the chrome. `sage` is the light theme's;
the dark theme's surfaces and lines are the `night` scale, a near-neutral with
the same faint lean toward the package's green.

**To say more, restate tokens.** The raw `night` scale is declared on `:root`
like every raw scale, so it is retinted where `sage` is:

```css
:root {
  --r-night-700: #151416;   /* the stage: the darkest surface */
  --r-night-600: #1e1c20;   /* header, footer, sidebars */
  --r-night-500: #2b2830;   /* a hovered row or button */
  --r-night-400: #37333c;   /* dividers */
  --r-night-300: #4f4a56;   /* button and field borders */
  --r-night-200: #a6a1ab;   /* secondary text */
  --r-night-100: #e9e6ec;   /* text */
}
```

A semantic token is restated under the dark theme's own selector, since a plain
`:root` is outranked there:

```css
:root[data-theme="dark"] {
  --selection: #c58bff;
  --selection-ink: #1a0f24;   /* what is written on a control filled with it */
  --connector-presentation: #d7a4ff;
}
```

The tokens the dark block names, and so the ones that need that selector, are
`--ink`, `--ink-soft`, `--ink-strong`, `--paper`, `--chrome`, `--chrome-hover`,
`--line`, `--line-strong`, `--line-quiet`, `--selection`, `--selection-ink`,
`--selected-row`, `--danger`, `--error`, `--error-ink`, `--swatch-edge`,
`--scrim`, `--shadow-weight`, `--capability-border` and the three
`--connector-*` colours. Hold text to 4.5 to 1 against what it sits on, as the
package's own values do; `design-system.md` has those.

**To choose a fill's dark counterpart by hand**, name it: `--c1-dark` …
`--c24-dark`, on `:root`, read once when the page loads as `--c1` is. What you
name holds for your own swatch. Once someone edits that swatch in a map, it is
another colour, and its counterpart is worked out again. Keep a named one light
enough for black type — about `#7a7a7a` in brightness, or lighter — since a
capability's title stays black on a solid fill.

**The logo is a stored file**, drawn as it is on a header that is now sometimes
dark. Use a mark that holds on both grounds.

**A page of your own wears the theme** by loading the one script that says it
before the first paint, ahead of the stylesheets:

```html
<script src="/js/theme-first.js"></script>
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/brand.css">
```

It puts `data-theme="light"` or `"dark"` on the root from what this browser
chose in the map, or from the system when it has not chosen, and the tokens do
the rest. Rules of your own that differ by theme key on the same attribute.
Like `/js/viewport.js`, it is promised to hold still.

## Pages and routes of your own

A repo built on the package may be more than a branded map: a page or two of
its own beside it, signed in to by the same people. Both halves are supported.

**New files under `brandDir` are served as they are.** A path the package does
not have — `pipelines.html`, `js/pipelines/board.js`, `css/pipelines.css` — is
served from the brand directory at that path, behind the same sign-in as the map:
someone without a session is sent to sign in and comes back to the page they
asked for. Pick names the package is unlikely to take, since a file it later
ships at the same path would be shadowed by yours. A page of your own may import
the package's modules from the same origin — `/js/viewport.js` is the one meant
for it, below — and may link `/css/tokens.css` and `/css/brand.css` to wear the
map's colours, with `/js/theme-first.js` ahead of them to wear its theme; the
rest of `js/` is still internal.

**`routes` answers requests of your own.** It is a function, or an array of
them, each `(request, response, context) => boolean`, sync or async:

```js
createDomainMapServer({
  brandDir: here('brand'),
  routes: async (request, response, { url, who, may, json, readJson, failure }) => {
    if (url.pathname !== '/api/pipelines') return false;
    if (!(await may('contributor'))) throw failure(403, 'Only a contributor can see the pipelines.');
    const { person, role } = await who();
    json(response, 200, { pipelines: [], for: person?.name, role });
    return true;
  },
});
```

They are tried in order after sign-in has let the request through and before the
package's own API and files; the first to answer `true` has answered it, and
`false` passes it on. So a route is never offered a request from someone who has
not signed in, nor `/health`, nor the sign-in routes under `/auth/`. Put a route
that answers JSON under `/api/` — `/api/pipelines/`, say — so that a lapsed
session is answered with a 401 rather than a redirect to the sign-in page. Your
routes run first, so one that claims a path the package answers — `/api/files`,
`/api/me`, `/api/published`, `/api/versions`, `/api/drafts`, `/api/people`,
`/api/assistant/` — hides the package's own.

`context` holds:

| Key | What it is |
| --- | --- |
| `url` | The request's URL, parsed. |
| `env` | What the server reads instead of `process.env`. |
| `user` | The session, `{ source, subject, name, username, email, method }`, or null with sign-in off. |
| `who()` | Resolves to `{ user, person, role }`: the person's row and their role, read from Postgres once per request and only if asked, since the role can change between clicks. With sign-in off there is one local person and they are an administrator. |
| `may(role)` | Resolves to whether whoever is asking is at least `role` — `viewer`, `contributor`, `publisher` or `administrator`. |
| `json(response, status, body)` | Answers with JSON. |
| `readJson(request)` | The body parsed, or a 400 or 413 thrown that says why not. |
| `failure(status, message)` | An error to `throw`: the server answers `{ error: message }` with that status, as its own API does. |

**What you may import by name.** `domain-map` is `createDomainMapServer`;
`domain-map/auth` is the package's own sign-in, `createAuth(env, { onSignIn })`,
for a server of your own that wants the same gate; `domain-map/roles` is the four
roles, `ROLES` lowest first, and `atLeast(role, needed)`. Anything under `app/` is
`domain-map/app/...`, but only `app/js/viewport.js` and `app/js/theme-first.js`
are promised to hold still.

**`app/js/viewport.js` is the pan and zoom maths**, with no DOM and no store, so
a page of your own can pan and zoom a drawing the way the map does. A view is
`{ k, x, y }` — the zoom, and where the world's origin lands on the stage in
screen pixels — and every function answers with a new one:
`clampZoom(k, { min, max })`, `zoomAt(view, point, factor, limits)`,
`panBy(view, dx, dy)`, `centerOn(view, point, size)`,
`fitBox(box, size, { padding, min, max })`, `viewportCenter(view, size)`,
`screenToWorld(view, point)`, `worldToScreen(view, point)`, `unionBox(boxes)` and
`wheelFactor(deltaY)`, with the map's limits as `ZOOM_LIMITS`. A glide from one
view to another is `between(from, to, t, size)`, the view `t` of the way there,
with `eased(t)` to spend the time the way the map does. A `size` is
anything with a `width` and a `height`, so the stage's `getBoundingClientRect()`
will do. In the browser it is `import * as viewport from '/js/viewport.js'`.

## Branding with stored settings

The header logo, the page title and the footer come from `data/settings.json` in
the **store**, not from the brand directory, so they can be changed on a running
instance without a deploy:

```json
{
  "logoSrc": "api/files/data/brand/logo.svg",
  "logoAlt": "logo",
  "title": "Acme domain map",
  "footer": "Acme domain map",
  "blurb": "Optional: the sign-in page's one line under the title"
}
```


## How seeding works

`seed/` mirrors the store's key space exactly: `seed/data/icons/gear.svg` becomes
the object `data/icons/gear.svg`. Each folder is filled only when the store holds
nothing in it yet, counting only that folder and not the ones below it — so a
store that has maps but no icons still gets the icons.

`seed/data/versions/` is the exception: versions are rows in Postgres, so those
files fill an **empty versions table** instead, and the newest of them is
published. A store left over from before 2.0 has its `data/versions/*.json`
imported instead of the seed's, so an upgrade carries its maps over; the files
stay where they are, as a backup, but the file API no longer serves them.

Either way it happens **once**. After that the database and the store are the
source of truth and `seed/` is never consulted again, so editing these files will
not disturb a map anyone has worked on. To start over, delete both: `rm -rf
storage`, or `docker compose down -v`.

## Upgrading

```bash
npm install domain-map@github:alekseigurba/domain-map#v2.0.0
```

Coming from 1.x, this one is not just a version bump: it wants a Postgres and a
list of owners. [upgrade-v1-to-v2.md](upgrade-v1-to-v2.md) is the
short way through it.

Pin a tag rather than a range. There is no build step in this package, so npm
installs straight from the tag and what you get is exactly what is in it.
