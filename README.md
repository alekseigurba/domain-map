# Domain map

A shared **map** of your organization, so flow conversations start from context instead of a blank whiteboard.

The map is the fixed terrain: your domains and the business capabilities within them, each in a deliberate position. Whereas a diagram's layout is arbitrary -- rearrange it and nothing is lost -- a map anchors elements geometrically, so position carries meaning, and the terrain stays learnable across teams.

![example.svg](example.svg)

Flows are overlays. Trace a payment authorization from checkout through invoicing, financial booking, and settlement, and the route shows which teams are involved and how each participates in the end-to-end flow. Think of Google Maps as the terrain and your planned route as the overlay.

Establish the context once. Then draw on top of it -- with a marker or digitally -- every time after.

## Run it

```bash
# run wih Node
npm start

# or with Docker, which keeps the map, the icons and the settings in one volume
docker compose up
```

Then open <http://localhost:8000>.

## Stop it

`Ctrl+C` stops the container in the foreground. From another terminal, or after `docker compose up -d`:

```bash
# remove the container but keep the `domain-map-data` volume
docker compose down

# remove the volume too
docker compose down -v
```

## Copy and brand it

Another repo can install this as a package and supply its own branding, rather than forking it. Scaffold one:

```bash
npx --package=github:alekseigurba/domain-map create-domain-map-app acme-domain-map --title "Acme domain map"
```

That writes a repo holding only what is yours -- a ten-line server, a `brand/` folder of token overrides and a `seed/` folder with your starting map -- and installs the app from a git tag. [BRANDING.md](BRANDING.md) is the contract: which files a consumer may override, which are internal, and how the palette follows the stylesheet.

The `Dockerfile` and `docker-compose.yml` in this repo run the example app. A consumer repo gets its own, which installs the package instead of copying `app/`.
