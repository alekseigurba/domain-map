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

- **Layers.** Two of them, bottom first: "Business Domains" and
  "Presentation Layer". They are a fixed conceptual model, not a list a map may
  edit — which layer an element is on follows from what it is, so a domain is
  always core and an actor is always presentation.
- **A layer control** in the bottom left corner of the diagram, one row per
  layer reading `title · selected · dim · eye`. The eye hides a layer above the
  base; the base layer cannot be hidden, only dimmed. Hiding a layer drops
  anything selected on it. Using the control changes your tab alone — in Edit
  mode it sets what the map opens at for everyone, and that is saved with the
  map and unwound by Ctrl-Z and Cancel.
- **Touchpoints and actors**, two kinds of their own alongside domains and
  capabilities: a rounded box and a ringed figure, both on the Presentation
  layer, neither belonging to a domain. Each gets a section in the menu and in
  the details panel.
- **Add buttons on the diagram**, beside the layer control, offering the kinds
  the selected layer takes. Which layer is being worked on is a box on that
  layer's row, one at a time, in Edit mode only; selecting a hidden layer shows
  it, and hiding the one being worked on moves the work back to the base layer.
- **Connectors down the stack**: an actor joins a touchpoint, a touchpoint joins
  a capability, a capability joins a capability. Anything else is refused as it
  is drawn. A line is filed under its upper end whichever way round it was
  drawn, so an actor's line is always the actor's, and presentation lines are
  drawn in their own deep teal.
- **A line hangs under what it starts from**: in the menu, every connector sits
  directly beneath its own element — a capability's lines under the capability,
  a touchpoint's under the touchpoint, an actor's under the actor. No headings,
  no section of connectors at the foot of the tree, and no line listed twice.
  An actor's and a touchpoint's lines are written under them in the file too.
- **A line's row says where it goes**, not where it came from: "to" in the
  quieter ink, then the far end's title in the far end's own colour. Where it
  came from is the row above it. The whole name is on the pointer, on the row
  for a screen reader, and in the Details panel.
- **The four lines are named** in the details panel: User interaction,
  Touchpoint connector, and **Internal domain connector** / **Cross-domain
  connector** as a pair — what was one Public connector and one Domain
  connector.
- **Type**, on every kind of element: a picker over a list of choices, with a
  box to add one. Each kind keeps its own list, the lists travel with the map,
  and a choice something is typed with cannot be removed — it says how many hold
  it instead.
- The **Add** buttons moved to the top left corner of the diagram, opposite the
  layer control at the foot. All four share one width, so switching layers
  changes what they say and not how big they are, and each shows its border
  only under the pointer, as a button in the header does.
- The layer control's icons are **icon files** now rather than shapes drawn in
  CSS, so a brand replaces them along with the rest. Each row holds its width
  at what its title measures in bold, so picking a layer moves nothing.
- The menu and Details panels are **a notch tighter** throughout — about a
  third more of a long map on screen at once — and a section heading no longer
  runs onto a second line.
- **Rename a version**, from its row in the Versions dialog — dropped in 2.0.0
  and back now. The name is also the version's address, so renaming moves it
  and old `?version=` links fall back to the published map; the question says
  so before it is answered. Renaming is not saving: nothing in the map changes,
  and neither does when it was last saved.
- **Opacity**, on every kind, on one scale of 10 to 100. A capability and a
  touchpoint start solid, an actor at half, a domain at the 20 it always had.
- A new actor arrives at 1.4× rather than 1×: a person standing outside the
  business should not be the size of a part of it. Actors already drawn keep
  the size they were drawn at.

### Changed

- **Export SVG** writes what is on screen: a hidden layer is not in the file,
  and a dimmed one is dimmed in it. Export (JSON) still writes the whole map.
- **View mode** shows title, description, owner and type as text rather than as
  greyed-out boxes, drops the icon picker entirely, and no longer offers a fold
  control on the one section it leaves.
- The "Drag to pan…" line under the map is gone; the layer control has that
  corner, and what the line said is in **Getting around**.
- The layer stack moved from `defaults.js` to `rules.js`: a brand may restyle
  its shapes, but not redefine what the two layers mean.
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
