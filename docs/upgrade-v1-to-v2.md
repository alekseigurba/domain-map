# Upgrading a repo from 1.x to 2.0

2.0 moves the versions of the map into Postgres and puts roles in front of
editing. Your brand, your seed and your `server.mjs` are untouched; what changes
is what the app needs to run, and who may change the map once it does.

| | 1.x | 2.0 |
| --- | --- | --- |
| Versions | JSON files in the store | rows in Postgres |
| Needs | a volume | a volume **and** a database |
| Who may edit | anyone who could sign in | the addresses in `OWNER_EMAILS` |
| Everyone else | could edit too | sees the published version only |

Your maps come across on the first start. Nothing is deleted.

## 1. Pin the new version

```bash
npm install domain-map@github:alekseigurba/domain-map#v2.0.0
```

## 2. Give it a Postgres

Add one to `docker-compose.yml` beside your app — this is what a scaffolded repo
now ships with:

```yaml
services:
  your-app:
    environment:
      DATABASE_URL: postgres://acme:acme@postgres:5432/acme
      OWNER_EMAILS: "you@example.com, someone@example.com"
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: acme
      POSTGRES_PASSWORD: acme
      POSTGRES_DB: acme
    volumes:
      - acme-db:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U acme -d acme"]
      interval: 2s
      retries: 30

volumes:
  acme-db:
```

Somewhere other than compose — Azure, say — set `DATABASE_URL` to a database of
your own. `DEPLOY.md` in a scaffolded repo has one way of doing it.

## 3. Say who may edit

`OWNER_EMAILS` is a comma-separated list, matched against the address people
sign in with. Leave it empty and everyone can look while nobody can edit; the
server says so at startup. With sign-in off, everyone is an owner.

## 4. Start it

```bash
docker compose up --build
```

`--build` matters: without it Docker reuses the image you already have, and you
upgrade nothing. The log tells you what happened:

```
Applied migration 001-versions.sql
Imported 3 versions: first-draft, team-review, v2
```

Your `data/versions/*.json` are read out of the store, kept under their own
names, and the one saved most recently becomes the **published** version — the
map everyone lands on. Open the app as an owner and check the Versions dialog
reads the way you expect; publish a different one from there if the wrong one
came out on top.

## Afterwards

- The old files stay in the volume as a backup, but the file API no longer
  serves them. Postgres is the live copy from now on, so back **it** up:
  `pg_dump` beside whatever you already do for the volume.
- New versions the app creates are named `v1`, `v2`, `v3`. Imported names are
  left as they are, and counted out of the numbering.
- If you build the image from the scaffold's `Dockerfile`, commit
  `package-lock.json` once you have one — the build is reproducible with it.

## If something is wrong

**The server exits with "DATABASE_URL is not set."** It has no database. Step 2.

**Nobody can edit.** `OWNER_EMAILS` is empty or does not match the address people
actually sign in with. The profile popup shows the role it worked out for you.

**It came up with the old app.** The image is stale: `docker compose up --build`.

**Nothing was imported and the map is the example.** The versions table already
had rows, or the store had no `data/versions/` for it to read. `docker compose
down -v` clears both, at the cost of everything in them.

## Going back

1.x reads the files in the store, which are as they were on the day you
upgraded. Anything saved since then lives in Postgres only, so export those
versions from the app first.
