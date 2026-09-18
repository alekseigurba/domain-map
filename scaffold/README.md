# {{title}}

Built on [domain-map]({{packageUrl}}), installed as a package. This repo holds only what is ours: the branding and the starting map.

```bash
npm install
npm run db          # Postgres in Docker, where the versions of the map live
npm run start:dev
```

Then open <http://localhost:8000>. `docker compose up` runs the whole thing
instead, app and database together.

## What is in here

| Path | What it is |
| --- | --- |
| `server.mjs` | The whole integration — ten lines that point the package at the two folders below. |
| `brand/css/brand.css` | Token overrides: colours, typeface, the map's 24 shape fills. |
| `brand/favicon.svg` | The tab icon. Any file under `brand/` shadows the package's copy of it. |
| `seed/data/settings.json` | Header logo, page title and footer text. |
| `seed/data/versions/v1.json` | The map to start from — an example to replace with your own. |
| `seed/data/icons/` | The icon library a fresh store starts with. |
| `DEPLOY.md` | Running this on Azure Container Apps, with Postgres beside it. |

`seed/` fills an empty store **once**, and its `data/versions/` fills an empty database once. After that the store and the database are the source of truth, so editing these files does not change a map anyone has worked on — that is deliberate. To start over, delete both (`rm -rf storage`, or `docker compose down -v`).

## Who may edit

Everyone who signs in sees the published version. `OWNER_EMAILS` says who may do more than look: open any version, edit, save, delete and publish. With sign-in off, as in `dev.env`, everyone is an owner.

## Upgrading

```bash
{{upgradeExample}}
```

Read the package's BRANDING.md first. Files under `brand/` that are not on its supported list — anything in `brand/js/`, in particular — can break on an upgrade, because they shadow the app's internals.
