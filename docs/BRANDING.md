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
| `css/brand.css` | **The main one.** Colours, type, the map's fills. Loaded last by both pages, so it wins. |
| `favicon.svg` | The tab icon. |
| `fonts/*` | Your own woff2 files, declared from `css/brand.css`. |
| `css/fonts.css` | Only if you want to drop the bundled Poppins faces entirely. |
| `js/defaults.js` | What a new domain, capability, touchpoint, actor or area looks like. See the caveat below. One written before 2.3 has no `AREA_SHAPE` and still loads: a new area falls back on the package's own. The three layers are not here: they are a fixed model, in `rules.js`, and not a deployment's to redefine. |

A server of your own is a parameter rather than a file to shadow:
`createDomainMapServer` takes `databaseUrl`, `owners` — what `OWNER_EMAILS`
is, seeded once — `storageDir`, `store`, `auth` and `assistant`. An `assistant` of your own is `{ chat, host, model }`,
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

**Everything else under the package's `app/` is internal.** `app/js/main.js`,
`diagram.js`, `store.js` and the rest change between versions without notice.
Shadowing one of them will work, and will then break on an upgrade at a moment
of the package's choosing rather than yours.

## Branding with stored settings

The header logo, the page title and the footer come from `data/settings.json` in
the **store**, not from the brand directory, so they can be changed on a running
instance without a deploy:

```json
{
  "logoSrc": "api/files/data/brand/logo.svg",
  "logoAlt": "logo",
  "title": "Acme domain map",
  "footer": "Acme domain map"
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
