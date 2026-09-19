# CLAUDE.md

Working notes for Claude Code on this repo. The repo documents itself, so this
file holds only what the code and the docs do not say. Read the pointers first.

## Read first

- [README.md](README.md) — what the map is for and how it is used.
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — the layout of the repo, running
  it, the tests, and how a release is cut.
- [docs/BRANDING.md](docs/BRANDING.md) — what a consumer repo may override and
  what is internal.
- [design-system.md](design-system.md) — the tokens and chrome the stylesheets
  follow; `app/css/tokens.css` is the source of truth. A new page element or
  token is recorded there.
- [CHANGELOG.md](CHANGELOG.md) and [docs/releases/](docs/releases/) — what
  shipped, and what is planned.

## Architecture rules

- No build step, no framework, no bundler. `app/` is ES modules the browser
  loads as they are.
- No new runtime dependency without asking. `pg` is the only one.
- `app/js/store.js` is the single source of truth for the map. Every change to
  the map is a change there; menu, details and diagram read from it.
- `app/js/geometry.js` is pure: no DOM writes, no store. Shape maths lives there
  so it runs headless under test.
- `app/js/diagram.js` renders and turns gestures into intents. It calls back
  into `actions` and never talks to the API.
- `app/js/rules.js` is the model: the layers, what connects to what, the
  limits. A brand may restyle shapes through `defaults.js`; it may not redefine
  rules.
- `app/js/document.js` reads and writes map files. A change to the file's shape
  is a document version bump and a release page.

## Working agreements

- Never commit or push. Leave changes in the working tree; the owner reviews
  and commits.
- Run `npm test` before reporting a task done, and say plainly if anything
  fails. Tests are plain scripts with no runner; a new pure function gets
  checks in the matching test file, in the same `check('reads like a
  sentence', ...)` form.
- Every user-facing change gets an entry under `## Unreleased` in
  `CHANGELOG.md` in the same task, in the house voice. Internal refactors do
  not.
- Release pages under `docs/releases/` start as the owner's plan: plain bullets
  in the owner's words. When an item ships, write it up on the page for the
  release it lands in, in the voice of [2.1.0.md](docs/releases/2.1.0.md), and
  remove the plan bullet. A known issue listed on a release page is removed
  when it is fixed.
- Do not touch `seed/`, `scripts/migrations/` or `scaffold/` unless the task
  asks for it.

## House voice

Comments, docs and changelog entries share one voice. Match it.

- Full sentences of prose that say why, not what. A comment restating the code
  is noise; one that explains a choice, a trade-off, or a consequence that is
  not obvious earns its place.
- Concrete over abstract: "the lobes pull the body off the domain's point",
  not "the layout is adjusted".
- British spelling: colour, centre, behaviour. Em-dashes for asides, as the
  existing text does.
- Names say what a thing is to the person using the map — lobe, blob,
  catchment, kebab, chip — not how it is built.
- A changelog entry leads with the thing in bold, then says what it means for
  someone using the map. A release page explains the model behind a change,
  not only the change.

## Environment

- Windows 11. Shell commands run in PowerShell or Git Bash; Node paths take
  forward slashes either way.
- Postgres comes from `docker compose up -d postgres`. `npm start` reads
  `dev.env`: sign-in off, everyone an owner, port 8000.
- `storage/` is the live file store, rebuilt from `seed/` on a fresh start, and
  gitignored.
- `core.autocrlf` is `input`: the repo holds LF, and some working-copy files
  carry CRLF. Keep whichever line ending a file already has when editing it,
  so a diff shows the change and nothing else.
- `tests/auth.test.mjs` and `tests/versions.test.mjs` start the real server
  against a throwaway database, so they need Postgres up. The rest need
  nothing.
