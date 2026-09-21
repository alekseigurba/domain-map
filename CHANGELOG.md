# Changelog

What changed in each release, newest first. A release is a version in
`package.json` and a git tag of the same name — see "Publish a version of this
package" in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). A release with more to
say than fits here has a page of its own under [docs/releases/](docs/releases/).

## Unreleased

## 2.2.0 — 2026-09-21

The map gains an Assistant, with a model behind it or without, and a description
of its own. No breaking changes — map files stay version 2, a 2.1 deployment
still opens one written here, and the four new environment variables are
optional. Full notes: [docs/releases/2.2.0.md](docs/releases/2.2.0.md).

### Added

- **Assistant**, in the header: ask an AI about the map, and review what it says
  as changes. It swaps the details column for a list of skills — write a
  description, fill in every blank one, grill the boundaries, find the missing
  connections, compare the map with an industry standard, trace a flow across it,
  or ask a question of your own. A skill follows the selection: *Describe* is
  about the capability you have picked, *Grill the boundaries* about the domain,
  or the whole map with nothing picked.
- **A model of your choosing behind it.** Set `ASSISTANT_API_URL` and
  `ASSISTANT_API_KEY` and an owner gets **Send** where Copy prompt was: pick a
  skill, send it, and the answer's cards are added to the review below. *Ask
  your own* opens a box for your question. Only the exchange in hand is shown —
  what was just asked, and the answer's summary — and nothing of a conversation
  is written down; the model is still reminded of the last few turns, from the
  page's memory and no further, and a line under the answer says how many and
  lets you **Start over**. The URL is anything that answers chat completions — a
  free local Ollama, OpenAI, Azure OpenAI, a corporate gateway — or Anthropic's
  Messages API; `ASSISTANT_MODEL`, by the API's own id for it, and
  `ASSISTANT_API_STYLE` are there for the cases the URL does not settle. The key
  stays on the server, and Send's tooltip says which model and host a message —
  and with it the whole map — goes to. Viewers never get Send.
- **And without one, copy and paste.** With neither variable set, **Copy prompt**
  puts the task, the map and the format to answer in on the clipboard, for
  whichever chat you use, and **Review reply** brings the answer back. No key is
  stored and nothing leaves the map unless you copy it out; the label says *No
  model connected yet*. An owner with a model connected keeps this too, behind
  **Use another chat**.
- **Replies come back as cards**, whichever way they came. Every suggestion says
  what it proposes, why, what applying it would do in plain words, and the shapes
  it names — press one and the map shows it. **Apply** makes the change as one
  Ctrl+Z, however much the card holds; **Apply all** works through what is left.
  A reply is checked against the same rules the editor keeps, and a card with
  anything wrong in it is refused whole, with the reason on it. A reply can
  describe, rename, add, move a capability to another domain and connect. It
  cannot remove anything or move a shape about: what should go comes back as a
  note, for you to delete by hand.
- **What the map goes out as.** A prompt carries the whole map with its drawing
  left out — titles, descriptions, types, what is joined to what — and no
  positions or colours. Owners' names stay behind unless *Include owners' names*
  is ticked.
- **What the business is**: the map has a description of its own. With nothing
  selected, the details panel is about the map itself, and that is where it is
  read and written. It heads every prompt, and is what makes a review specific to
  your business rather than generic; it is saved, versioned, exported and undone
  with the map. While it is empty the Assistant says so in a line, and offers
  **Describe the business**, which drafts it from what is on the map.
- **Skills are files**, `app/skills/<name>/SKILL.md`, in the agent-skills form,
  so an agent pointed at the folder loads the same prompts the page builds. Each
  says which operations its reply may use — a reply to *Describe* that renames
  something is refused. They are internal so far: a consumer repo cannot add or
  reword one until that part of 2.2 is built.
- **`options.assistant`** on `createDomainMapServer`: a `{ chat, host, model }`
  of your own, for a model that speaks neither chat completions nor the Messages
  API. The server warns at startup when a model is connected and everyone is an
  owner, since any of them can then send the map out on its key.

## 2.1.1 — 2026-09-20

Icons on the map grow up: larger, in their own colours, laid out by what is
drawn in them, and placed on whichever side of the title suits the shape. No
breaking changes — map files stay version 2, and a 2.1.0 deployment still opens
one written here. Full notes: [docs/releases/2.1.1.md](docs/releases/2.1.1.md).

### Added

- **Icon placement**: over the title, left of it, under it or right of it. It is
  in the Shape section of a capability and a touchpoint once they wear an icon,
  and of an actor always, where it moves the figure. Beside the title, the icon
  goes out into the end of the oval — room the words could not use — so the
  title gives up a little width and none of its rows. Over the title is where
  an icon has always been, and a map that never chooses is drawn and written
  exactly as before. The choice is a field the file may leave out, so map files
  stay version 2 and a 2.1.0 deployment still opens one: it reads past the
  field and draws the icon on top.
- **Icon weight**, a slider under the icon picker, from 0.5× to 4×: how heavy an
  SVG icon's lines are drawn, as a multiple of what its file says. An icon drawn
  with a fine line for the screen it was made on can be a hairline on the map;
  this makes it read without redrawing the file. It is a multiple rather than a
  width because a width means nothing without its grid — 2 is a bold line on a
  24-unit icon and a fine one on a 64. A picture that is not an SVG has no lines
  to weigh, and is not offered the slider. Export SVG carries the icon at the
  weight it is drawn.

### Changed

- **The gap between an icon and its title is the one the map chose**, and a
  small one. It is measured from what is drawn to what is drawn — the ink of the
  icon to the letters — where it used to be measured box to box, so the margin
  inside an icon's file and the leading over a row of type were both added to
  it, and a wide drawing in a square file floated well clear of its title. An
  icon is laid out by its ink altogether now: a wide one gets a wide, short box
  rather than a sliver in a square one.
- **An icon is larger, and no longer costs a title its rows.** It is drawn half
  as large again as the type under it, where it used to be barely larger, and it
  rides up into the crown of the oval — room a row of words could never use —
  so a title that read in two rows without an icon reads in two rows with one.
  A short last row sits lower than a full one, and what it gives up goes to the
  icon. Where a shape really is full, the icon gives way before the words do,
  down to the size of the type and no further. Adding an icon used to mean
  cutting the title or shrinking the font to get it back, which shrank the icon
  with it; a map drawn that way can have its type set back up.
- **An icon keeps its own colours** on the map and in Export SVG. It used to be
  flattened to the title's black, which turned a full-colour drawing into a
  silhouette, and a set of icons told apart by colour into one icon.
- **An actor's figure is nearly a third larger**, and is measured by its ink
  rather than by the grid it was drawn on, so the air round it is the same air
  an icon gets. It gives way to a long name the way an icon does.
- **The example map was redrawn**, and the demo in the README recorded again
  over it. A map already in the database is not touched: the seed fills an empty
  store once.

## 2.1.0 — 2026-09-19

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
- **The example map opens with the Presentation layer hidden.** A fresh install
  shows the terrain first — domains, capabilities and the lines between them —
  and the eye in the layer control brings the touchpoints and actors up over
  it. A map already in the database is not touched: the seed fills an empty
  store once.

### Fixed

- **A domain reaches out for a capability dragged onto it**, wherever it comes
  from. The lobe used to re-form only for a capability dragged out of that same
  domain and back in without the button being let go; one arriving from another
  domain, or from open ground, landed on a shape that had not made room for it.
  The hover rim follows the domain about to receive it too, rather than staying
  on the one the drag set off from.

## 2.0.1 — 2026-09-18

### Changed

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
