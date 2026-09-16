# {{title}}

Built on [domain-map]({{packageUrl}}), installed as a package. This repo holds only what is ours: the branding and the starting map.

```bash
npm install
npm run start:dev
```

Then open <http://localhost:8000>.

## What is in here

| Path | What it is |
| --- | --- |
| `server.mjs` | The whole integration — ten lines that point the package at the two folders below. |
| `brand/css/brand.css` | Token overrides: colours, typeface, the map's 24 shape fills. |
| `brand/favicon.svg` | The tab icon. Any file under `brand/` shadows the package's copy of it. |
| `seed/data/settings.json` | Header logo, page title and footer text. |
| `seed/data/versions/bnpl-example.json` | The map a fresh store starts with — an example to replace with your own. |
| `seed/data/icons/` | The icon library a fresh store starts with. |

`seed/` fills an empty store **once**. After that the store is the source of truth, so editing these files does not change a map anyone has worked on — that is deliberate. To start over, delete the store (`rm -rf storage`, or `docker compose down -v`).

## Upgrading

```bash
{{upgradeExample}}
```

Read the package's BRANDING.md first. Files under `brand/` that are not on its supported list — anything in `brand/js/`, in particular — can break on an upgrade, because they shadow the app's internals.
