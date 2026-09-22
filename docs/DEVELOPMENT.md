# Working on domain-map

This is the repo behind the package. If you only want to run a map, or to brand
one for your own organization, the [README](../README.md) is the place to
start; if you are building a repo on top of this package,
[BRANDING.md](BRANDING.md) is the contract between the two.

## Run it from a checkout

The versions of the map are rows in Postgres, and the server does not start
without a `DATABASE_URL`. The compose file runs one:

```bash
docker compose up -d postgres
npm install
npm start
```

`npm start` reads [dev.env](../dev.env), which switches sign-in **off**: every
page and every API call goes straight through, and whoever is there is the
administrator. Drop `AUTH_ENABLED` to bring the gate back — the sign-in screen
then offers *Bypass (dev)*, with a name and a role, so every role can be tried:
a name makes a person, the first name in is the administrator, and asking for
the administrator's role afterwards hands it over — or export `AUTH_TENANT_ID`,
`AUTH_CLIENT_ID` and `AUTH_CLIENT_SECRET` to try Microsoft sign-in locally.
Anything already set in the shell wins over the file.

Roles are rows in Postgres, seeded once from `OWNER_EMAILS` and managed in
*Users & access* after that. For a database whose administrator has gone,
`npm run make-administrator -- someone@example.com` makes someone else the
administrator; it reads `dev.env` for `DATABASE_URL` when there is one.

To try the Assistant with a model behind it, export `ASSISTANT_API_URL` and
`ASSISTANT_API_KEY` before `npm start` — a local Ollama at
`http://localhost:11434/v1/chat/completions` wants any key at all — and the
startup lines say what it is connected to. Without them the Assistant writes
prompts to copy, which is what the tests and the demo run with.

The file store — the icons, the logo and `data/settings.json` — lands in
`storage/` beside the checkout, seeded from `seed/` the first time. The seed
fills an empty store **once**; after that the store and the database are the
source of truth. To start over, `rm -rf storage` and `docker compose down -v`.

## Tests

```bash
npm test
```

Each test is a plain script that prints its checks and exits non-zero on the
first failing run — no test runner, no framework. `npm test` runs them in order
(defaults, geometry, layers, seed, links, suggestions, auth, versions, people,
assistant), and any one of them also runs on its own:

```bash
node tests/geometry.test.mjs
```

## What is where

| Path | What it is |
| --- | --- |
| `app/` | The whole client: no build step, no framework, ES modules the browser loads as they are. |
| `app/js/store.js` | The single source of truth. Menu, details and diagram all read from it, and every change to the map is a change here. |
| `app/js/diagram.js` | The SVG: rendering, hit-testing, dragging, connectors. |
| `app/js/geometry.js` | The maths behind the shapes — blob outlines, lobe placement, snap points, and the band an area draws round what it holds. |
| `app/js/icon-art.js` | An icon as the map draws it: the file with its lines weighed, and where in it the drawing is. It needs a fetch and a canvas, so it is here and not in `geometry.js`, which only keeps what was measured. |
| `app/js/defaults.js` | How a new shape of each kind looks, and what *Reset shapes* puts back. `tests/defaults.test.mjs` checks the values. |
| `app/js/suggestions.js` | What goes out to an AI chat and what is let back in: the brief of the map, the reply parser, and the checks every operation passes before it becomes a card. Pure, like `geometry.js`, so `tests/suggestions.test.mjs` runs it headless against the seed map and the shipped skills. |
| `app/js/assistant.js` | The Assistant column: skills, the conversation or the prompt to copy, and the cards. It hands a checked card back to `main.js` to be applied, which is where a change is placed and recorded for undo. |
| `scripts/assistant.mjs` | The model behind the Assistant, when `ASSISTANT_API_URL` and `ASSISTANT_API_KEY` name one: the two request shapes, one retry, and the API's own words when it says no. `tests/assistant.test.mjs` runs it against a stand-in model on a local port. |
| `app/skills/` | One folder per skill, each a `SKILL.md` in the agent-skills form, with the two formats a prompt writes in. [Its README](../app/skills/README.md) says what a skill file holds. |
| `scripts/server.mjs` | The server a consumer repo imports as `createDomainMapServer`. |
| `scripts/roles.mjs` | The four roles, lowest first, and what each may do. |
| `scripts/people-store.mjs` | The people and their logins in Postgres: who a sign-in turns out to be, a role given, the administrator's role handed over, the seed from `OWNER_EMAILS`. `tests/people.test.mjs` runs it through the real server. |
| `scripts/make-administrator.mjs` | `npm run make-administrator`: someone made the administrator from outside the app. |
| `app/js/people.js` | Users & access: the roster, and what the administrator can do on it. |
| `scripts/serve.mjs` | The CLI over it, for running the stock app from this checkout. |
| `scripts/create-app.mjs` | `create-domain-map-app`: writes a consumer repo from `scaffold/`. |
| `scripts/migrations/` | Numbered `.sql`, applied in name order at startup and recorded in a table of their own. There is nothing to run by hand. |
| `seed/` | The example map, settings, logo and icon library a fresh install starts from. |
| `scaffold/` | The repo `create-domain-map-app` writes, `{{placeholders}}` and all. |
| `design-system.md` | The tokens, type scale and colour rules the stylesheets follow. |
| `docs/BRANDING.md` | What a consumer repo may override, and what is internal. |

## Publish a version of this package

Consumers install this package from a **git tag**, so a release is a version in
`package.json` and a tag of the same name. There is no build step and nothing
goes to the npm registry.

Notes live in the repo, not only on the tag:

- [CHANGELOG.md](../CHANGELOG.md) is the index — a section per version, newest
  first, and an `## Unreleased` section at the top to write into as you go.
- [docs/releases/](releases/) holds a page per release that needs more than a
  list: what broke, and what it means for a repo built on this package.
  [2.0.0](releases/2.0.0.md) is one; most releases will not need one.
- An upgrade that takes steps gets a guide of its own under `docs/`, named for
  the hop it covers, and linked from the release page.

```bash
# 1. Move the Unreleased entries under a heading for the version, with today's
#    date, and write docs/releases/<version>.md if the release earns one.
npm version 2.0.1 --no-git-tag-version   # writes package.json + lockfile
npm test
git commit -am "Release 2.0.1"
git tag v2.0.1
git push origin main --tags
```

A consumer then upgrades with the tag, and `create-domain-map-app` pins new
repos to whichever version it was run from:

```bash
npm install domain-map@github:alekseigurba/domain-map#v2.0.1
```

### Trying one out first

A prerelease is the same thing with a `-pre` version, which sorts **before** the
release it leads to, so nothing picks it up by accident:

```bash
npm version 2.1.0-pre.1 --no-git-tag-version
git commit -am "2.1.0-pre.1" && git tag v2.1.0-pre.1 && git push origin main --tags
```

Point one repo at it — a staging copy, not the one everyone uses:

```bash
npm install domain-map@github:alekseigurba/domain-map#v2.1.0-pre.1

# or scaffold a throwaway repo from it, pinned to that tag
npx --package=github:alekseigurba/domain-map#v2.1.0-pre.1 create-domain-map-app acme-domain-map
```

Keep going as `-pre.2`, `-pre.3`, and when it holds up, release the version
itself. Tags are cheap; moving one that someone has installed is not, so cut a
new one instead.

## The demo in the README

[demo.gif](demo.gif) is a recording of the real app, driven through the example
seed: a domain added, two capabilities put in it, arranged, and one of them
connected across to a capability in another domain. It closes on the eye in the
layer control: the seed opens with the Presentation layer hidden, so showing it
is the last thing the recording does, and the touchpoints arrive over a map the
viewer has already read.

It is captured rather than drawn — a Playwright script clicks and drags the app
at 1440x900 and two device pixels to one, writes one PNG per frame with a
pointer painted into the page, and ffmpeg folds the frames into a 20fps GIF at
half that size. Neither tool is a dependency of this repo, so the script lives
outside it. Re-record whenever the chrome around the map changes enough that
the recording misleads — a new control in a corner, a panel that moves.
