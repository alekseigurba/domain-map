# Changelog

What changed in each release, newest first. A release is a version in
`package.json` and a git tag of the same name — see "Publish a version of this
package" in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). A release with more to
say than fits here has a page of its own under [docs/releases/](docs/releases/).

## Unreleased

The map gains layers, and two new kinds of element to put on them.
**Breaking**: map files are version 2, and a 2.0.x deployment refuses one. There
is no migration to run — a version 1 file still reads, and everything in it
lands on the base layer. Full notes:
[docs/releases/2.1.0.md](docs/releases/2.1.0.md).

### Added

- **Layers.** A map holds an ordered stack, bottom first, and ships with two:
  "Core Business Domains" (the base) and "Presentation". The list is data, so a
  third layer is a row in the file rather than a release.
- **A layer control** in the bottom left corner of the diagram. The eye hides a
  layer above the base; the base layer cannot be hidden, only dimmed. Using it
  changes your tab alone — in Edit mode it sets what the map opens at for
  everyone, and that is saved with the map.
- **Touchpoints and actors**, two kinds of their own alongside domains and
  capabilities: a rounded box and a ringed figure, both on the Presentation
  layer, neither belonging to a domain. **Add a touchpoint** and **Add an
  actor** sit under Add a capability, with an **Add to** picker saying which
  layer a new shape lands on, and each kind gets a section in the menu and in
  the details panel.
- **Connectors between any two shapes** that carry connection points — a
  capability, a touchpoint or an actor. A line belongs to the topmost layer it
  touches, so hiding that layer takes the line with it.
- **Type**, on every kind of element: a picker over a list of choices, with a
  box to add one. Each kind keeps its own list, the lists travel with the map,
  and a choice something is typed with cannot be removed — it says how many
  hold it instead.

### Changed

- **Export SVG** writes what is on screen: a hidden layer is not in the file,
  and a dimmed one is dimmed in it. Export (JSON) still writes the whole map.
- **View mode** shows title, description, owner and type as text rather than as
  greyed-out boxes, drops the icon picker entirely, and no longer offers a fold
  control on the one section it leaves.
- The "Drag to pan…" line under the map is gone; the layer control has that
  corner, and what the line said is in **Getting around**.
- An empty `OWNER_EMAILS` makes everyone who signs in an owner, where before it
  left nobody able to edit. The server still warns about it at startup. A
  deployment that relied on an empty list to keep the map read-only needs to
  name its owners now.

## 1.0.0 — 2026-09-16

Version 1.

## 2.0.0-pre.1 — 2026-09-18

The versions of the map move into Postgres, and who may change them is now a
role. **Breaking**: the server does not start without `DATABASE_URL`, and the
API for versions has moved. Upgrading a 1.x repo:
[docs/upgrade-v1-to-v2.md](docs/upgrade-v1-to-v2.md). Full notes:
[docs/releases/2.0.0.md](docs/releases/2.0.0.md).

### Added

- **Roles.** `OWNER_EMAILS` lists who may open any version, edit, save, delete
  and publish. Everyone else who signs in sees the published version only. With
  sign-in off, everyone is an owner.
- **A published version**, which is what the plain URL opens for everyone.
  `?version=<name>` opens another one, for an owner.
- **A Versions dialog** for owners: open, save as new, publish and delete, with
  who last saved each one and when.
- **A profile popup** under an initials avatar, holding the name, email, role
  and Sign out.
- **Postgres**, holding the versions and the published pointer. Schema is
  numbered `.sql` files applied at startup. `pg` is the first runtime dependency.
- `DEPLOY.md` in a scaffolded repo: Azure Container Apps, with Postgres beside
  the app on a mounted volume.

### Changed

- A new version is named `v1`, `v2`, `v3` by the server; there is no name field.
- Saving over a version somebody else saved in the meantime is refused, and the
  map can be saved as a new version instead.
- The published version cannot be deleted until another one is published.
- Writes to `/api/files` are an owner's, and the seed map is `seed/data/versions/v1.json`.

### Removed

- Renaming a version, and saving over some other version than the one open.
- The browser's memory of the last version it had open: a fresh visit opens the
  published one.

## Earlier releases

1.0.0 to 1.0.2 predate this file. Their history is in the git log.
