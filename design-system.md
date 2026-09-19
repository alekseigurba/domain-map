# Design System

The map is the subject; everything else is chrome. This page records the tokens
the chrome is built from and the page elements built out of them.
[`app/css/tokens.css`](../app/css/tokens.css) is the source of truth, and
[`app/css/layout.css`](../app/css/layout.css) is where the elements below are drawn.

Scope: the page — header, panels, footer, controls, icons, type. The shapes
drawn inside the diagram are not described here; they live in
[`app/js/geometry.js`](../app/js/geometry.js) and
[`app/css/diagram.css`](../app/css/diagram.css).

## Type

| Token | Family |
| --- | --- |
| `--font-heading` | `"Poppins"` — the page title, and every label drawn in the map |
| `--font-text` | `"Poppins"` — everything in the chrome |

Poppins is the only face bundled, self-hosted from
[`app/fonts/`](../app/fonts/) and declared in
[`app/css/fonts.css`](../app/css/fonts.css). It has no variable cut, so it ships as
three static weights — 300, 400 and 600, the ones `--fw-*` names.

| Token | Size | Used for |
| --- | --- | --- |
| `--fs-200` | 13px | sidebars, chips, fields, footer |
| `--fs-300` | 14px | small chrome |
| `--fs-400` | 16px | body default, stage buttons |
| `--fs-500` | 22px | header title |
| `--fs-600` | 28px | available |
| `--fs-700` | 36px | available |
| `--fs-800` | 46px | available |
| `--fs-900` | 56px | available |

Chrome runs on the two smallest steps, aliased as `--fs-xs`/`--fs-s`, with
`--fs-m` for the title. Weights are 300 / 400 / 600 (`--fw-light`,
`--fw-regular`, `--fw-semibold`); line heights 1.1 / 1.2 / 1.5 / 1.7
(`--lh-xs` … `--lh-l`).

Section and panel headings are uppercase, semibold, `0.1em` tracking, in
`--ink-soft` — a label for the group below, not a voice of its own.

## Color

The raw scales are declared verbatim as `--r-*`: brand 100–600, haze 200–600,
sage 200–600, charcoal 200–600, azure, amethyst, ember, orange, blue, red, green,
focused, neutral-white. Brand is the one scale a deployment replaces with its own; sage is haze tinted
toward it, so the chrome carries the brand without competing with the map's fills. Everything else names
what a color does here.

| Token | Raw | Where |
| --- | --- | --- |
| `--paper` | neutral-white | the stage, and controls sitting on chrome |
| `--chrome` | sage-200 | header, footer, both sidebars |
| `--chrome-hover` | sage-400 | hovered rows and buttons |
| `--line` / `--line-strong` | sage-500 / sage-600 | dividers, button borders |
| `--ink` / `--ink-soft` | charcoal-400 / charcoal-300 | text, secondary text |
| `--ink-invert` | neutral-white | text on a filled control |
| `--selection` | focused-400 | selection outlines, active controls |
| `--selected-row` | brand-200 | the selected row in the tree, a step past the sage hover |
| `--danger` | red-100 | the delete button's hover |

Unsaved work is the one thing in the header worth interrupting for, so the Save
chip goes orange-400 on white while it is dirty. A typed value that is not yet a
color turns its field's border red-400 rather than throwing the text away.

### Shape palette

Twenty-four fills, `--c1` … `--c24`, laid out the way the swatch grid shows
them: six across and four down, each column one family — greens, blues, pinks
and purples, yellows, oranges and browns, reds. A 12 or 18 swatch palette keeps
the top two or three rows, so every family stays in it.

A new capability is drawn in `--c1`. A new domain's default, `#d4d1cf`, is not
in the stock palette, so it takes the nearest swatch, `--c3`, at 20% opacity;
and a capability added into a domain starts in the domain's own color — the
README's *Shape defaults* chapter says where that is set. A map carries its own
copy of the palette once one has been edited, and its size can be set to 12, 18
or 24 in **Edit palette**.

| | | | | | |
| --- | --- | --- | --- | --- | --- |
| 1 `#86a27b` | 2 `#7fc6d8` | 3 `#e8bbd5` | 4 `#fede49` | 5 `#b06a46` | 6 `#f57a8c` |
| 7 `#51a45c` | 8 `#3c94a3` | 9 `#a1a4ec` | 10 `#fee986` | 11 `#d36e3b` | 12 `#e08aac` |
| 13 `#77bc80` | 14 `#5985ab` | 15 `#a86cd1` | 16 `#d3b23b` | 17 `#f2c3aa` | 18 `#f66598` |
| 19 `#0d9c08` | 20 `#aedbe6` | 21 `#a85bad` | 22 `#f1982b` | 23 `#9f4e4e` | 24 `#d86161` |

## Spacing, radius, icon sizes

Spacing is `--space-025` … `--space-200` (4, 8, 12, 16, 24, 32px); the four gaps
the layout uses, `--gap-1` … `--gap-4`, are aliases onto its first four steps.
Radii are `--radius-s|m|l|xl` (4/8/12/16px) and icon boxes `--icon-s|m|l`
(16/24/32px).

## Icons

Button icons are plain `.svg` files under [`app/icons/`](../app/icons/) —
`add-domain`, `add-capability`, `collapse`, `delete`, `reset`,
`capability-colors`, `palette`. Each `[data-icon]`
placeholder in the markup is *replaced* by the fetched `<svg>`
([`app/js/icons.js`](../app/js/icons.js)), not merely pointed at it: only a node
that is part of the page can take its stroke from the button's own
`currentColor`, which is what makes hover, `aria-pressed` and the danger state
reach the drawing. They are drawn at `--icon-s`, unfilled, 1.4 stroke, round
caps and joins.

The two add icons are the tree's swatches drawn large with a plus inside: the
domain's uneven blob — four quarter-ellipses, like the swatch's
`border-radius` but pushed further off round so it still reads at 16px — and the
capability's flatter oval.

The collapse icon is one drawing used four ways: the details copy mirrors the
menu copy, and each flips again when pressed, so it always points the way the
panel would move.

Capability icons are a different thing: files a user uploads, kept under
`data/icons/` and referenced by name, so an exported map names its icons rather
than carrying them. `.svg`, `.png`, `.jpg`, `.jpeg` or `.webp`, under 512 KB,
and an SVG carrying script is refused rather than served back from this origin.

## The page

A three-row grid — header, main, footer — pinned to the viewport; nothing
scrolls but the panels. `main` is three columns: the hierarchy panel, the stage,
the details panel, both panels 250px and both collapsible to a `--rail-w` 28px
rail. The stage is
`--paper`; everything else is `--chrome`.

The one column of that outer grid is `minmax(0, 1fr)` rather than the `auto` it
would be by default, which caps the page at the screen: sized by its content, the
column takes the width of the widest thing in the page — the header's row of
chips — and on a narrower screen every row grows past the viewport and carries
the details panel off the right-hand edge, where nothing scrolls to reach it.

There is one breakpoint, **a phone held upright** (`max-width: 640px` and
`orientation: portrait`), described at the end of this chapter. It is written
down once, in `layout.css`, which hands the answer to the script in a `--phone`
custom property, so that "is this the phone layout" is asked of the layout
itself rather than of a media query copied into `main.js`.

### Header

Brand on the left — logo at `--icon-m` beside the one heading on the page —
actions on the right. **Save** and the triangle beside it are one split control
with no seam between them: the button writes the version being edited, the
triangle opens the rest. Its menu is `position: fixed` and placed in script,
because the header does not scroll and would otherwise clip a long list. Then
**Export** and **Import**, which move a JSON document in and out by hand, with
**Export SVG** between them: the diagram as a picture, without the selection or
the edit chrome, cropped to 10px around the ink. Unlike an exported map it
carries its icons and its type inside it, since a picture has no server to ask.
**Getting around** and **About** close the row, and each opens the same modal as
the palette editor, placed for what it holds. Getting around is one sentence on
panning and zooming, then every shortcut: a table for each thing they act on —
shapes, renaming a domain, connectors — under a small heading, and a paragraph
for the palette editor. It is centered on the page and wide, since it is read on
its own rather than beside anything. About holds the README's first chapter, copied into the
page, pinned to the top right corner under the button, and wider than the
palette editor, since it holds prose rather than controls.

### Panels

Both are the same frame: the body, then `panel__actions` and a `panel__foot`,
pushed together to the bottom. The hierarchy panel adds a `panel__head` above
the body, with no divider under it: the uppercase title, **Domains**, and at the
far end of the row the controls acting on the whole tree — **Collapse all**, an
icon chip. The chip overhangs the row, so the title sets its height and the tree
starts as close under the title as a section's rows do under a tree caption. The
details panel has no title: its accordion headings already say
what is in it.

Actions sit at the foot because they are what you do to what is above them —
add a domain or a capability under the tree you just read, delete under the
properties of the thing selected. Delete is the most final, so it sits furthest
down, away from the controls that only adjust. A selected domain adds **Reset
shapes** and **Reset colors** above it. **Edit palette** heads the
details panel's strip and is the one action left with nothing selected, since
the palette belongs to the map rather than to anything on it.

Collapsed, a panel keeps its actions and loses everything else: the tree and the
fields are what you folded it away to be rid of, and the head goes with
them. Labels drop, the wide buttons square off to `--chip-h`, and they sit at
the bottom of the rail just above the collapse toggle, which likewise drops the
**Collapse** label it carries beside its icon while the panel is open.
The browser remembers which panels are collapsed, so the page reopens the way it
was left.

### Controls

Every sidebar control is the same chip: 24px tall (`--chip-h`), `--radius-m`
corners, 13px label. In the header and the panels a button has no fill or border
of its own — it is the chrome it sits on — and shows its border only under the
pointer or keyboard focus. Delete still fills red on hover, and Save with unsaved
changes stays orange. `.btn--chip-icon` is that chip as a square
holding an icon; `.btn--wide` is the same button opened out full width, icon
first and label following, so the icon does not move when a panel opens. Every
button at the foot of a panel, the collapse toggle included, is one of these, as
wide as the panel less its padding; in the domains panel they sit at the right
and swap round, label first and icon last.
`.btn--icon` is the larger 32px control the stage uses, and the only one that is
not a chip.

The tree below the head is rows of the same 13px: a caret column kept even where
there is nothing to fold so labels line up, a swatch in the shape's own color
whose silhouette says which kind it is, and an ellipsized label. The selected
row is `--selected-row` and semibold. The sections after the domains —
Unassigned Capabilities and Connectors — stand a `--gap-3` apart
from the list above them.

### Details panel

An **accordion**: a first section headed by what is selected, **Domain** or
**Capability** (title, description, owner, and a capability's icon — what the
thing *is*), then Shape (how it looks). A capability's domain heads its section;
a domain's capability count closes its own. A connector's first section is named
for its kind — **Public connector** across a boundary, **Domain connector**
within one — and holds its **Label**: the two capabilities it joins, with a dash
between them, as the menu names it. Those headings all open and
shut as one panel, so the choice holds as the selection moves between kinds. The heading is the control that
opens its own section. Every control in it is the same size — the title is not
special — and each sits under a small `--ink-soft` label, except in Shape: font
size, weight, the shape or title size and a connector's line are short choices, so each sits beside
its label on one row, as does a connector's Anchor checkbox. A domain's opacity follows its color, since it says how
much of that color shows.

Color is picked from a grid of six-across swatches. The palette itself is edited
from **Edit palette** at the head of the panel's action strip, in a modal in the
bottom right corner, 20px in, over a scrim light enough to watch the map's shapes
change color behind it: a native `<dialog>`, so the page behind is inert, Esc or
a click on the backdrop shuts it, and focus goes back to the button. It is one
narrow column, tall rather than wide, standing over the details panel so that it
keeps off the diagram. At the top, the palette size (the size in force is filled
in, not merely outlined, since a border alone does not say which of three
identical chips you are on) and the swatches, pressed to choose the one being
edited. It opens on the swatch the selected shape wears. Below them, a picker
that is always open on that swatch:
a saturation and brightness area, a hue strip, and the hex field. Dragging and
typing each keep the other in step as they go, and a drag is written once, when
it lands, as a single undo step.

### Stage chrome

As little as possible, and all of it in the corners: the zoom stack bottom
right, a one-line hint bottom left in `--fs-xs` `--ink-soft`, and the kebab menu
that hangs off a selected domain — a floating row of chips on paper, positioned
by the diagram. The cursor carries the mode: grab, grabbing while panning,
crosshair while connecting.

### Footer

13px `--ink-soft`: the settings text on the left, then the map's counts and a
status line that clears itself after about a second and a half. Both run on
tabular figures so they do not jitter as they change.

### On a phone

Upright on a phone there is no room for a column at either side of the map, so
the map takes the width. The hierarchy panel goes — the diagram is already the
view of the same thing — and so do the footer, whose counts and status are the
least of what the map is owed, and the stage's hint, whose corner is a finger's
width from the zoom stack and whose advice, scroll and press Edit, is a desk's.

The details panel stays, because what is selected is the one thing the map itself
cannot say, but it comes back as a **sheet** across the foot of the screen: a
40px bar naming the selection — a capability's or domain's title, a connector's
two ends, or *Nothing selected*, the same words the panel shows in its body —
with a chevron that points the way the sheet would move, as the collapse icon
does. Pressing it opens the sheet to half the screen (`50dvh`), showing the same
accordion and the same action strip as the wide layout, and presses back down to
the bar. It is a row of the grid rather than something floating over the map, so
the stage it is fitted to is the stage that is left, and the zoom stack is never
underneath it. The row snaps between its two heights, as the panels either side
of a wide map do: animating it would leave the stage still growing when the map
is first fitted to it, and the map off centre.

The bar and the **Collapse** toggle in the panel's own foot are one switch on one
state, `data-details`, so the script has nothing phone-shaped in it beyond the
bar's own label; the foot's toggle stands down here, and shut, the sheet is the
bar and nothing else — the fields and the actions leave rather than ride clipped
below the edge where a keyboard could still reach them. What the browser
remembers is how the panels were left beside a map on a wide screen, so it does
not decide how much of a phone's screen the fields cover on arrival: a sheet
arrives shut.

The header keeps everything it has, since a row that overflows leaves Sign out
and About off the edge for good. The brand takes a row of its own and the chips
take the next one, where they keep their width and are swiped along — two rows,
whatever arrives later, so the identity chip lengthens the strip rather than
wrapping it and resizing the stage under a map already fitted to it. The sheet's
fields step up to `--fs-400`: under 16px a phone zooms the whole page in when a
field is tapped, and leaves it zoomed.

`100dvh` rather than `100vh`, because a phone's toolbars slide in and out of the
way and `vh` does not notice, which would leave the foot of the sheet under them.

## Links

A permalink names what it points at: `#/capability/payment-authorization`, not a
uuid. Slugs are derived from titles, so a rename moves the link; duplicates get
a numeric suffix (`dunning-2`).

## Branding

The header logo and title and the footer text come from `data/settings.json` in
the store, shipped as [`seed/data/settings.json`](../seed/data/settings.json) — no
rebuild, no code change. `logoSrc` names any URL the page can reach, and the
mark that ships is a stored file like the map itself:
[`seed/data/brand/logo.svg`](../seed/data/brand/logo.svg) seeds the object
`data/brand/logo.svg`, which `logoSrc` reaches as `api/files/data/brand/logo.svg`.
Replacing the logo is a `PUT` to that key, not a rebuild. It sits under its own
prefix rather than `data/icons/` so it stays out of the capability icon picker,
which lists whatever that folder holds.

If the file will not load — an empty volume, a store whose settings still name
the path the app used to ship, a `logoSrc` pointing at nothing — the header
falls back to the `◈` glyph rather than showing a broken image. An explicit
`"logo": ""` asks for no mark at all.

The tab wears [`app/favicon.svg`](../app/favicon.svg), which is fixed. It is asked
for before any store request has finished, so it is a static file rather than
anything the settings name.

## Documents

A map is JSON, and a version is just a file with a name. Edits are held in the
page until **Save** writes the whole map to the version being edited; the
triangle saves to another version or opens one, and `Export`/`Import` move the
same document in and out by hand. Unsaved edits and the undo history are kept in
the tab's session storage, so they survive a refresh; closing the tab still
loses them, which is why the page asks before it goes. Shapes reference each other by `key` — a slug
of the title — so a document reads like prose and can be edited by hand. An
empty store is seeded once from [`seed/`](../seed), which mirrors the store's own key
space: everything it holds sits under `data/`, so one volume covers the lot.

## Shape defaults

What a new shape looks like is set in one file, [`app/js/defaults.js`](app/js/defaults.js):

```js
export const DOMAIN_SHAPE = Object.freeze({
  title: 'New\ndomain',
  color: '#d4d1cf',
  opacity: 20,
  fontSize: 72,
  fontWeight: 'regular',
  titleScale: 1,
});

export const CAPABILITY_SHAPE = Object.freeze({
  title: 'New capability',
  color: '#86a27b',
  fontSize: 32,
  fontWeight: 'regular',
  sizeScale: 1,
  stretch: 2,
});

export const TOUCHPOINT_SHAPE = Object.freeze({
  title: 'New touchpoint',
  color: '#7fc6d8',
  fontSize: 32,
  fontWeight: 'regular',
  sizeScale: 1,
  stretch: 2,
});

export const ACTOR_SHAPE = Object.freeze({
  title: 'New actor',
  color: '#a1a4ec',
  fontSize: 32,
  fontWeight: 'regular',
  sizeScale: 1,
});
```

The same file holds the stack a new map is drawn on, and where each kind of
shape is added unless the layer picker says otherwise:

```js
export const LAYERS = Object.freeze([
  Object.freeze({ key: 'core', title: 'Core Business Domains' }),
  Object.freeze({ key: 'presentation', title: 'Presentation' }),
]);

export const HOME_LAYER = Object.freeze({
  domain: 'core',
  capability: 'core',
  touchpoint: 'presentation',
  actor: 'presentation',
});
```

Change a value, then check the file:

```bash
node tests/defaults.test.mjs
```

With `npm start`, reload the page to pick the change up. The Docker image copies `app/` in when it is built, so rebuild it with `docker compose up --build`.

### Allowed values

| Value | Domain | Capability |
| --- | --- | --- |
| `title` | Up to 200 characters. `\n` starts a new line. | Up to 200 characters |
| `color` | A hex color, `#rgb` or `#rrggbb` | A hex color, `#rgb` or `#rrggbb` |
| `opacity` | 10 to 100, in steps of 10 | Not a setting: capabilities are always solid |
| `fontSize` | `32`, `36`, `48`, `64`, `72`, `80`, `100` | `24`, `32`, `36`, `48`, `52`, `56`, `64`, `72`, `80` |
| `fontWeight` | `regular` or `bold` | `regular` or `bold` |
| `titleScale` | `0.6`, `0.8`, `1`, `1.25`, `1.5`, `2` (the **Title size** list) | Not used |
| `sizeScale` | Not used | `1` to `3`, in steps of `0.2` (the **Shape size** list) |
| `stretch` | Not used | `-2` tall, `-1`, `0` round, `1`, `2` wide (the steps of Ctrl+< and Ctrl+>) |

Use only these values. A font size or stretch that isn't in its list still draws, but a map saved with it fails validation the next time it's opened. The test catches that. A scale that isn't in its list draws and saves, but the details panel can't show it as selected.

To offer another size, add it to the list in both [`app/js/geometry.js`](app/js/geometry.js), which the details panel reads, and [`app/js/rules.js`](app/js/rules.js), which decides what a map file may hold.

### How the color is picked

A shape stores a palette swatch, not a color. When a shape is created, its default color is looked up in the map's current palette: it gets the swatch with exactly that color, or the closest one. In the stock palette, `#86a27b` is swatch 1, and `#d4d1cf` is not in it at all, so a new domain gets the closest one, swatch 3 (`#e8bbd5`). If a map's palette has been edited and no longer has the color, the shape gets the closest swatch.

### Where the defaults apply

- **Add a domain** uses `DOMAIN_SHAPE` and places the domain beside the rest of the map.
- **Add a capability** uses `CAPABILITY_SHAPE`. Where the capability goes depends on what is selected:
  - A domain: inside that domain. In an empty domain it goes under the title, centered on it. Otherwise it goes in the first spot that is clear of the other capabilities and the title.
  - A capability: on top of it, 20 px right and 20 px down, in the same domain if it has one.
  - Nothing: on open ground beside the map.

  A capability that lands inside a domain, including one added with **Add lobe** from the domain's ⋮ menu, takes the domain's color instead of the default. This happens only when it is added, so you can change the color afterwards.
- **Reset shapes** appears at the bottom of the details panel when a domain is selected. It sets the domain's color, opacity, font size, weight and title size back to `DOMAIN_SHAPE`. It sets the color, font size, weight, shape size and stretch of every capability in the domain back to `CAPABILITY_SHAPE`. Titles, icons, positions and a dragged title width don't change.
- **Add a touchpoint** uses `TOUCHPOINT_SHAPE` and **Add an actor** uses `ACTOR_SHAPE`. Neither belongs to a domain, so both land on open ground beside the map, on the layer the **Add to** picker names — Presentation unless it has been changed.
- **Reset colors**, below it, gives every capability in the domain the domain's color.
- **Map files**: if a file leaves out a field, the field gets its default. The exception is color, which falls back to swatch 1.

Both reset buttons can be undone with Ctrl+Z. Changing a default doesn't change shapes that already exist.
