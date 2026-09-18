# Domain map

A shared **map** of your organization, so flow conversations start from context instead of a blank whiteboard.

The map is the fixed terrain: your domains and the business capabilities within them, each in a deliberate position. Whereas a diagram's layout is arbitrary -- rearrange it and nothing is lost -- a map anchors elements geometrically, so position carries meaning, and the terrain stays learnable across teams.

![example.svg](example.svg)

Flows are overlays. Trace a payment authorization from checkout through invoicing, financial booking, and settlement, and the route shows which teams are involved and how each participates in the end-to-end flow. Think of Google Maps as the terrain and your planned route as the overlay.

Establish the context once. Then draw on top of it -- with a marker or digitally -- every time after.

## Run it

```bash
# everything in Docker: the app, and the Postgres its versions live in
docker compose up

# or with Node, against that same Postgres
docker compose up -d postgres
npm install
npm start
```

Then open <http://localhost:8000>.

## Stop it

`Ctrl+C` stops the container in the foreground. From another terminal, or after `docker compose up -d`:

```bash
# remove the containers but keep the volumes: the icons, the settings and the versions
docker compose down

# remove the volumes too, and the map goes back to the example
docker compose down -v
```

## Copy and brand it

Another repo can install this as a package and supply its own branding, rather than forking it. Scaffold one:

```bash
npx --package=github:alekseigurba/domain-map create-domain-map-app acme-domain-map --title "Acme domain map"
```

That writes a repo holding only what is yours -- a ten-line server, a `brand/` folder of token overrides and a `seed/` folder with your starting map -- and installs the app from a git tag. [BRANDING.md](BRANDING.md) is the contract: which files a consumer may override, which are internal, and how the palette follows the stylesheet.

The `Dockerfile` and `docker-compose.yml` in this repo run the example app. A consumer repo gets its own, which installs the package instead of copying `app/`.

## Publish a version of this package

Consumers install this package from a **git tag**, so a release is a version in
`package.json` and a tag of the same name. There is no build step and nothing
goes to the npm registry.

Notes live in the repo, not only on the tag:

- [CHANGELOG.md](CHANGELOG.md) is the index — a section per version, newest
  first, and an `## Unreleased` section at the top to write into as you go.
- [docs/releases/](docs/releases/) holds a page per release that needs more than
  a list: what broke, and what it means for a repo built on this package.
  [2.0.0](docs/releases/2.0.0.md) is one; most releases will not need one.
- An upgrade that takes steps gets a guide of its own, such as
  [docs/upgrade-v1-to-v2.md](docs/upgrade-v1-to-v2.md).

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
