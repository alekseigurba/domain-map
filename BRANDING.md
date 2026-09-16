# Building on domain-map

This package is meant to be installed by another repo, branded, and upgraded —
not forked. Your repo holds two folders and a ten-line server; everything else
stays here and moves forward with the version you pin.

## Start a repo

```bash
npx --package=github:alekseigurba/domain-map create-domain-map-app acme-domain-map --title "Acme domain map"
cd acme-domain-map
npm install
npm run start:dev
```

That writes a working repo: a server, a brand directory, a seed directory, a
Dockerfile and a compose file. Open <http://localhost:8000> and it is already
your colour, your logo and your map.

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

It fills an empty store **once**. After that the store is the source of truth and
`seed/` is never consulted again, so editing these files will not disturb a map
anyone has worked on. To start over, delete the store: `rm -rf storage`, or
`docker compose down -v`.

## Upgrading

```bash
npm install domain-map@github:alekseigurba/domain-map#v1.1.0
```

Pin a tag rather than a range. There is no build step in this package, so npm
installs straight from the tag and what you get is exactly what is in it.
