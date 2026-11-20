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
sage 200–600, charcoal 200–600, night 100–700, azure, amethyst, ember, orange, blue, red, green,
focused, neutral-white. Brand is the one scale a deployment replaces with its own; sage is haze tinted
toward it, so the chrome carries the brand without competing with the map's fills. Night is what sage
and charcoal are, for the dark theme. Everything else names what a color does here, once for each theme.

| Token | Light | Dark | Where |
| --- | --- | --- | --- |
| `--paper` | neutral-white | night-700 `#141613` | the stage, and controls sitting on chrome |
| `--chrome` | sage-200 | night-600 `#1c1f1b` | header, footer, both sidebars |
| `--chrome-hover` | sage-400 | night-500 `#2a2e28` | hovered rows and buttons |
| `--line` / `--line-strong` | sage-500 / sage-600 | night-400 `#333831` / night-300 `#4b5247` | dividers, button borders |
| `--line-quiet` | charcoal-200 | charcoal-300 | the edge of a card that is only a note |
| `--ink` / `--ink-soft` | charcoal-400 / charcoal-300 | night-100 `#e7eae4` / night-200 `#a0a69c` | text, secondary text |
| `--ink-strong` | charcoal-600 | neutral-white | what is being typed into a field in Edit mode |
| `--ink-invert` | neutral-white | neutral-white | text on a control filled with the brand color or the orange |
| `--selection` | focused-400 | `#4a9bff` | selection outlines, active controls |
| `--selection-ink` | neutral-white | night-700 | text on a control filled with the selection |
| `--selected-row` | brand-200 | brand-400 at 38% over night-600 | the selected row in the tree, a step past the hover |
| `--danger` | red-100 | `#3a1c1c` | the delete button's hover |
| `--error` / `--error-ink` | red-400 / `#8c2f18` | `#f1857c` / `#f3a092` | a border or an edge on what went wrong, and the sentence that says what did |
| `--swatch-edge` | black at 25% | white at 30% | round a swatch in the tree, so a pale one still has an outline |
| `--scrim` | near-black at 8% | black at 30% | over the page behind a dialog |
| `--shadow-weight` | 1 | 3 | how much of every shadow there is |

### The dark theme

The page follows the system until someone chooses in the profile popup, and
`data-theme` on the root says which theme it is in — put there before the first
paint by `js/theme-first.js`, and after that by [`app/js/theme.js`](app/js/theme.js).
The dark theme is the one block in `tokens.css` under `:root[data-theme="dark"]`:
the semantic tokens of the table above said again, and the lines and the
capability's rim from further down the file. No other stylesheet names the
theme, with one exception that is a sentence rather than a color — the line in
the palette editor that is only true on a dark page.

The stage is the darkest surface where it was the lightest, and the chrome a
shade lighter where it was a shade darker, so the two keep their order of
importance: the map is what the page is built round. Ink on paper is close to
15 to 1 in both themes, and `--ink-soft` on chrome better than 5 to 1 in both. A selected
row is mixed from the brand color rather than named, so a brand that has never
heard of the dark theme still has one in its own color.

Three things do not turn. `--ink-invert` is white in both, because the fills it
is read on — the brand color, the orange of unsaved work — are the same fills.
The color picker's own gradients are the color space, not chrome. And a shadow
is cast in black whatever the theme; there is just three times as much of it,
since next to nothing shows against a page that is already dark.

**Adding a color from now on.** A color is written in `tokens.css` and nowhere
else: a rule in another stylesheet that names a hex, an `rgb()` or a raw
`--r-*` scale is one the dark theme cannot reach. So a new element is drawn in
the semantic tokens there are. Where none fits, a new one is declared in the
`:root` block with its light value, then looked at on a dark page: if it is
wrong there it is said again in the dark block, and held to 4.5 to 1 against
what it sits on where it is text. A token whose value is the same in both
themes — a size, a weight, the brand color — is declared once. Anything an
exported SVG will carry is a plain hex or `rgba()`, not a `color-mix()`, which
an SVG reader outside a browser does not know.

Unsaved work is the one thing in the header worth interrupting for, so the Save
chip goes orange-400 on white while it is dirty. A typed value that is not yet a
color turns its field's border red-400 rather than throwing the text away.

### Markers

What Draw mode draws with. A flow traced over the map has to read against every
fill in the palette and against the greys the lines are drawn in, so the markers
are the saturated ends of the raw scales, where the palette is pale.

| Token | Raw | Where |
| --- | --- | --- |
| `--marker-red` | red-400 | the marker first in hand |
| `--marker-orange` | orange-400 | |
| `--marker-green` | green-400 | |
| `--marker-blue` | azure-400 | |
| `--marker-ink` | charcoal-400 | black, for a word written beside a route |
| `--marker-width` | 6px | how wide a marker is on screen as a stroke is made |

A stroke names its marker — `data-marker="red"` — rather than carrying a colour,
and [`diagram.css`](app/css/diagram.css) says once what each name looks like, for
the stroke on the map and the disc in the tray alike. So restating one of these
tokens, in a theme or in a brand, recolours what has already been drawn.

### Shape palette

Twenty-four fills, `--c1` … `--c24`, laid out the way the swatch grid shows
them: six across and four down, each column one family — greens, blues, pinks
and purples, yellows, oranges and browns, reds. A 12 or 18 swatch palette keeps
the top two or three rows, so every family stays in it.

A new capability is drawn in `--c1`. A new domain's default, `#d4d1cf`, is not
in the stock palette, so it takes the nearest swatch, `--c3`, at 20% opacity;
and a capability added into a domain starts in the domain's own color — the
*Shape defaults* chapter below says where that is set. An area's default,
`#5985ab`, is `--c14`: it is worn as a line, so it wants a swatch that reads as
one. A map carries its own
copy of the palette once one has been edited, and its size can be set to 12, 18
or 24 in **Edit palette**.

| | | | | | |
| --- | --- | --- | --- | --- | --- |
| 1 `#86a27b` | 2 `#7fc6d8` | 3 `#e8bbd5` | 4 `#fede49` | 5 `#b06a46` | 6 `#f57a8c` |
| 7 `#51a45c` | 8 `#3c94a3` | 9 `#a1a4ec` | 10 `#fee986` | 11 `#d36e3b` | 12 `#e08aac` |
| 13 `#77bc80` | 14 `#5985ab` | 15 `#a86cd1` | 16 `#d3b23b` | 17 `#f2c3aa` | 18 `#f66598` |
| 19 `#0d9c08` | 20 `#aedbe6` | 21 `#a85bad` | 22 `#f1982b` | 23 `#9f4e4e` | 24 `#d86161` |

### The palette on dark paper

A map has one palette, and it is the one above: `--c1` … `--c24` are copied into
a map file when its palette is edited, so they mean the same thing in both
themes. On a dark map each swatch is drawn as its **dark counterpart**, worked
out from the swatch by `darkCounterpart` in
[`app/js/geometry.js`](app/js/geometry.js): the same color in less light. Every
channel is dimmed by the same share, as light, so hue and saturation are what
they were; a color keeps 27% of its own brightness on top of a floor of 0.18 in
luminance, which halves the pale end and leaves it the pale end; and nothing is
ever lifted, so a swatch already below that line — eight of these — is drawn as
it is. The stock palette comes out as:

| | | | | | |
| --- | --- | --- | --- | --- | --- |
| 1 `#7b9571` | 2 `#66a1b0` | 3 `#b693a7` | 4 `#bda534` | 5 `#b06a46` | 6 `#dc6d7d` |
| 7 `#4c9b57` | 8 `#3c94a3` | 9 `#8a8dcc` | 10 `#b9aa60` | 11 `#d16d3a` | 12 `#c67998` |
| 13 `#65a16d` | 14 `#5985ab` | 15 `#a86cd1` | 16 `#af942f` | 17 `#bc9783` | 18 `#e55d8d` |
| 19 `#0d9c08` | 20 `#84a7b0` | 21 `#a85bad` | 22 `#ce8223` | 23 `#9f4e4e` | 24 `#d86161` |

These are not tokens. They are what the rule gives for the tokens above, and a
map's own palette, or a brand's, gets the same rule. A stylesheet that wants to
choose one by hand names it `--c1-dark` … `--c24-dark`; what it names holds for
the stylesheet's own swatch, and is dropped for a swatch a map has since made
another color.

The floor is where black type reads at 4.5 to 1, which is the point of it: a
capability's title is black on every swatch in both themes, and an icon drawn to
hold against the light palette holds against this one. Only a shape made
see-through, where the dark paper comes up through the fill, turns its title
white — and an actor's figure with it. Everywhere a shape's color is shown —
the tree's swatches, the color grid in the details panel — it is the color the
map is drawn in, so the counterpart on a dark page. The palette editor is the
one place that shows the palette itself.

## Spacing, radius, icon sizes

Spacing is `--space-025` … `--space-200` (4, 8, 12, 16, 24, 32px); the four gaps
the layout uses, `--gap-1` … `--gap-4`, are aliases onto its first four steps.
Radii are `--radius-s|m|l|xl` (4/8/12/16px) and icon boxes `--icon-s|m|l`
(16/24/32px).

## Icons

Button icons are plain `.svg` files under [`app/icons/`](../app/icons/) —
`add-domain`, `add-capability`, `collapse`, `delete`, `reset`,
`capability-colors`, `palette`, `eraser`, `undo`. Each `[data-icon]`
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
On the map an icon is drawn as its file has it, in its own colours, and nothing
in the stylesheet restyles it: an `<image>` is a document of its own. The one
thing a map may change is how heavy an SVG's lines are, which
[`app/js/icon-art.js`](../app/js/icon-art.js) does by making another drawing
from the file. An icon is laid out by its ink rather than its file, so the
margin an icon is drawn with costs nothing; which side of the title it sits on,
and how the two share a shape, is `iconStack` in
[`app/js/geometry.js`](../app/js/geometry.js).

Icons meant for the map read best drawn with a line of 1.5 to 2 on a 24-unit
grid, round caps, in colours that hold against the palette. Button icons are
another convention — a 16-unit grid and no stroke or colour of their own, as
above — and a file drawn for one is the wrong weight as the other.

## The page

A three-row grid — header, main, footer — pinned to the viewport; nothing
scrolls but the panels. `main` is three columns: the hierarchy panel, the stage,
the details panel, both panels `--panel-w` — **300px**, and never more than 24%
of the window — and both collapsible to a `--rail-w` 28px rail. The stage is
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
because the header does not scroll and would otherwise clip a long list.
**Draw** follows the version chip and is a switch, not an action: pressed, it
holds `--selected-row` and a marker is in hand over a locked map. It leaves the
row while Edit is on, since the two are never on together. Then
**Export** and **Import**, which move a JSON document in and out by hand, with
**Export SVG** between them: the diagram as a picture, without the selection or
the edit chrome, cropped to 10px around the ink. Unlike an exported map it
carries its icons and its type inside it, since a picture has no server to ask,
and whatever has been drawn on the map with a marker.
**Assistant** comes next, and is the other chip in the row that is a switch rather
than an action: it swaps the details column for the Assistant and back. Unpressed
it keeps its ink like the chips beside it — it is still a thing to press — and
pressed it holds `--selected-row`, the fill the tree gives what is selected.
**Getting around** and **About** close the row, and each opens the same modal as
the palette editor, placed for what it holds. Getting around is one sentence on
panning and zooming, then every shortcut: a table for each thing they act on —
shapes, renaming a domain, connectors — under a small heading, and a paragraph
for the palette editor. It is centered on the page and wide, since it is read on
its own rather than beside anything. About holds the README's first chapter, copied into the
page, pinned to the top right corner under the button, and wider than the
palette editor, since it holds prose rather than controls.

Last in the row, the **avatar**: initials in a circle, or a silhouette when
sign-in is off. It opens the **profile popup**, pinned under it like About and
narrower: the name, the address, one line saying the role and what it may do —
*Viewer — sees the published map, and nothing else* — then **Theme**, and, in the foot, **Users & access**
for everyone who works on the map, **Sign out**, and Close on the right.
Theme is an `--ink-soft` label and three chips on one row — **System**, **Light**,
**Dark** — sharing what the label leaves; the one in force is filled with
`--selection`, as the palette's size is. It is here rather than in the header
because it is whoever is looking's and not the map's: the browser keeps it, as
it keeps which panels are folded.

### Versions

The chip in the header names the version open and tags it **Published** or, in
the quiet badge, **Shared** — what Save would do is always in view, since a
shared version is never saved over. The dialog it opens is centred and 920px
wide — measured against a shared row with all five actions and all three tags,
so nothing is behind a scroll bar — and holds two lists under small uppercase
headings in the dialog title's style: **My sandbox**, then **Shared**. Each is
the same table — name with its tags in a 16rem box, when, by whom, actions — and
says so in its rows' place when it is empty. On a phone each row is a card: the
name cut where the card ends, and the actions wrapping. A sandbox row offers
Open, Rename, Share and Delete; a shared row Open, Take a copy, and then only
what this person may do: Rename and Delete for whoever shared it and for a
publisher, Publish for a publisher, so a row never carries a button that would
be refused. The shared version this person put there wears a quiet **Yours** tag
beside Published and Open. Every button in the dialog is held down while an
action is on its way, and the lists are read again after.

### Users & access

Who may open the map and what each may do: the roster, a dialog laid out like
Versions — centred, a table with a row a person, but 760px, since a row here
carries one action — and reached from the profile popup, which shuts as it
opens, since who may do what belongs with who you are. Under the title, the
**key**: the four roles lowest first, a two-column grid of each name in
`--fw-semibold` against its sentence in `--ink-soft`, the same sentence the
profile popup and a role's pointer carry. A row is the name in `--fw-semibold`
with a quiet **You** badge beside it when it is, the address under the name in
`--ink-soft`, the role, when they were last here (*Not yet* before a first
sign-in), and the row's actions. The row that is you takes `--chrome`, as the
open version does. Between the role and the last sign-in, **Sandbox**: how many
versions theirs holds, or *Empty* — never what. For an administrator the role is
a `<select>` the height of a chip offering all four, on every row but their own,
which reads as it is; picking Administrator asks first. The action is
**Remove**, a danger chip like Delete, which asks first about someone who has
signed in and names what their sandbox holds. At the foot, before Close, an
administrator's form: a name box, an address box and a role select in one row,
and **Add** — the same `.field__input` and `.field__select` the details panel
uses, wrapping to a short form on a phone. Contributors and publishers see the
same rows with words where the controls are, and no form. A viewer is not shown
the dialog at all.

The sign-in screen's bypass, when it is on, is a small form above its button:
a name box and a role select at 40px, the height of the buttons beside them,
in the page's own field style.

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

The tree below the head is rows of the same 13px: an 18px caret column kept even
where there is nothing to fold so labels line up, a swatch in the shape's own
color whose silhouette says which kind it is, and an ellipsized label. The
selected row is `--selected-row` and semibold. The sections after the domains —
Unassigned Capabilities, Touchpoints and Actors — stand a `--gap-3` apart
from the list above them.

A connector has no section of its own. Every line hangs directly under the
element it starts from — a capability's lines under the capability, an actor's
under the actor — one indent deeper, with no heading in between. One rule for
all four kinds, and no line listed twice.

A capability's **features** hang under it the same way, one indent deeper and
before its lines: what it is made of, then where it reaches. A feature's swatch
is a small bubble in its capability's colour — the shape it is on the map —
which is what tells its row from a line's rule. A feature that starts lines
carries them under it, a step deeper again, and a domain's own lines hang under
the domain after its capabilities: every line under the shape it was drawn
from, whatever kind that is.

### Details panel

An **accordion**: a first section headed by what is selected, **Domain** or
**Capability** (title, description, owner, and a capability's icon — what the
thing *is*), then Shape (how it looks). A capability's domain heads its section;
a domain's capability count closes its own. A connector's first section is named
for its kind — **Cross-domain connector** and **Internal domain connector** as a
pair, **Touchpoint connector**, **User interaction** — and holds its **Label**: the two capabilities it joins, with a dash
between them, as the menu names it. Those headings all open and
shut as one panel, so the choice holds as the selection moves between kinds. The heading is the control that
opens its own section. Every control in it is the same size — the title is not
special — and each sits under a small `--ink-soft` label, except in Shape: font
size, weight, the shape or title size and a connector's line are short choices, so each sits beside
its label on one row, as does a connector's Anchor checkbox. A domain's opacity follows its color, since it says how
much of that color shows.

The **Owner** box is a text field with the people on the list behind it — a
`datalist`, so the names come up as they are typed and the box still takes a
team or someone outside — and a **hint** under it in `--ink-soft` at
`--fs-200`: the address of the person the name was picked from, or that they
are no longer on the list. Nothing under a typed name. Browsing, it is the same
quiet box every field is, and a viewer's has no list behind it.

With **nothing selected** the panel is about the map itself. A **Map** section
holds **What the business is** — the map's own description, a text area like any
other description — above the sentence that says nothing is selected. It opens
and shuts with the other first sections. Browsing a map that has no description,
the section is left out: an empty box that cannot be typed into says nothing.

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
it lands, as a single undo step. The swatches and the picker show the palette as
the map holds it, which is how the light theme draws it; on a dark page the
shapes behind are drawn in dark counterparts, and an `--ink-soft` line above the
foot says so, there and only there.

### Assistant

The details column, holding something else. It is not a third column, which
would come out of the stage on a laptop, and not a dialog, which would cover the
map its cards point at. `data-column="assistant"` on `main` is the whole switch:
the stylesheet hides the fields and the action strip and shows `.assistant`, and
widens the column from `--panel-w` to `--assistant-w`, **420px** and never more
than 40% of the window — a prompt, an answer and a card's reasoning are
sentences, and the panel's own width sets them five words to the line.
Folded to a rail, the column is the rail it always is, actions and all.

Two sections under the accordion's static headings, **Ask** and **Review**. The
frame is written in `index.html` and only what moves is rebuilt, so the map can
change under a text area without taking the caret out of a sentence.

**Ask** reads down in the order it is used. While the map does not say what the
business is, it opens on one `--ink-soft` line saying what that costs and which
skill drafts it; the field itself is the details panel's, and once it is filled
in the line goes. Then the **skills**: chips in three groups, each under an 11px
uppercase caption — Write, Grill, Ask. Every chip takes its share of what its
row has left, so each row runs the width of the column: left to their own widths
the rows end raggedly, and a third of the panel is white space shaped like a
staircase. The chosen chip is filled with `--selection`, as the palette's size
in force is: among a dozen identical chips a border alone does not say which you
are on. One that needs a selection it has not got is disabled, and its tooltip
says what to pick. Below the chips: a line saying what the chosen skill does,
**About** — what the task is about, which follows the selection — and the one
thing the skill asks for, if it asks.

What follows depends on whether the server has a model connected.

- **Without one**, a single button, **Copy prompt**, and under it the
  **callout** — paper on chrome with a 3px `--r-brand-400` edge, a semibold
  title over `--ink-soft` text — which answers the question the button raises:
  where does this go? *No model connected yet*, with what to do instead; *Using
  another chat*; or, for a viewer, *Take it to a chat of your own*. It is under
  the button rather than at the head of the column because that is when the
  question is asked.
- **With one**, for an owner, **Send**, and no callout: where a message goes is
  Send's tooltip, there for whoever wonders and out of the way for everyone
  else. Under Send, once something has been asked, the **exchange**: one box,
  paper with a `--line-strong` border like a field, because it is read rather
  than pressed. What was asked is semibold; the answer under it keeps the
  model's own line breaks. There is only ever one — the next Send replaces it —
  so there is no thread, no bubbles and nothing to scroll back through. Awaited,
  it reads *Thinking… 12s* in `--ink-soft` on tabular figures, so it does not
  jitter; failed, it takes a `--r-red-400` border and the error ink, and says
  what the model's API said. Under it a 12px `--ink-soft` line, *2 earlier turns
  remembered · Start over*, is the only sign of what the model is reminded of
  and the page does not show.

Only **Ask your own** puts a box to type in on the column; every other skill is
its chip and Send.

Below all of it, for an owner with a model connected, **Use another chat** is a
12px underlined link, not a chip: it changes how the column works, which is not
something to press by accident. It swaps Send for Copy prompt and the reply box,
and reads *Back to* the host while it has.

Buttons in this column keep a `--line-strong` border and a paper fill. In the
chrome a button is borderless until it is pointed at, which suits a strip of
actions under a panel; here they sit among fields and paragraphs, where a word
with no edge does not read as a button.

**Review** is an owner's. Copying by hand, it opens on the reply box and
**Review reply**, which wait for Edit mode with a line saying so; in a
conversation they are not there, and the section itself stays away until an
answer has brought a card. Then a count — *3 to apply · 1 note · 1 not
applicable* — with **Apply all** and **Clear**, and the cards, which stay
readable in either mode and are applied in Edit.

A **card** is paper with a 3px left edge that says what kind it is before a word
is read: `--r-brand-400` for one that can be applied, `--r-charcoal-200` for a
note, `--r-red-400` for one that was refused. It holds a semibold title (a note
wears a quiet **Note** badge), the reasoning in `--ink-soft`, then each
operation in plain words — *Move Fraud Detection into Credit & Risk Assessment*
— with whatever it would write onto the map set off under it behind a `--line`
rule, as the quotation it is. A citation is 12px italic and ends *worth
checking*. The shapes the card names are chips on `--chrome`, quieter than the
actions, cut short rather than let a long title widen the card; pressing one
selects the shape and brings it into view, showing its layer first if it was
hidden. A refusal is a sentence in the error ink. **Apply** and **Dismiss** sit
at the right; a note has **Done** instead, and a refused card only **Dismiss**.

### Stage chrome

As little as possible, and all of it in the corners: the zoom stack bottom
right, a one-line hint bottom left in `--fs-xs` `--ink-soft`, and the kebab menu
that hangs off a selected domain — a floating row of chips on paper, positioned
by the diagram. The cursor carries the mode: grab, grabbing while panning,
crosshair while connecting.

While **Draw** is on, the **marker tray** has the top left corner — the one the
Add buttons hold in Edit mode, which it is never on together with. It is one row
on the layer control's see-through paper, with a `--line-strong` border: the
five markers, each a disc of its own colour the size of a chip, the one in hand
ringed in `--selection` the way a swatch in the details panel is; a hairline;
then the eraser, undo and clear as icon chips, which have no edge until they are
pointed at, and **Done**. The eraser is the one switch among them and holds
`--selected-row` while it is in hand; clear fills `--danger` under the pointer,
as Delete does. The row wraps rather than run off a narrow stage, and on a phone
every control on it steps up to 32px, a size a finger lands on. The cursor is a
crosshair over open ground and shapes alike — a shape's own cursor offers to
move it, and nothing on a locked map moves — and a hand while Space is held.
With the eraser in hand a ring in `--ink` shows how far it reaches: for a mouse
or a pen, since a finger has no pointer to draw it round.

A **stroke** is drawn in its marker's colour at 90%, so a title it crosses can
still be read, round at its ends and its corners, and as wide on the map as the
marker was on screen when it was made. It takes no pointer: what is under it is
still the thing pressed.

### Levels and the zoom

The stage draws more the closer it is looked at, and moves nothing to do it;
and its lines are drawn at one of three levels. `app/js/zoom.js` decides what;
these are the elements that come of it.

- **The level control** — `.level`, the first thing in the zoom stack and as
  wide as one of its buttons: a slider stood on end on a paper panel with a
  `--line-strong` border, finest at the top, the way + is over −. Its three
  stops are lettered beside the track, **F**, **C**, **D**, in `--ink-soft` at
  10px, the one in force in `--ink` and semibold; a letter presses as the
  slider drags. The control's title says what the level in force draws, and
  the footer's status line names the level as it changes.
- **A folded line** — every line lifted to the same two places, as one. It is
  a `.connector-group` like any line and wears `--connector-public`. Its weight
  is its own and is set in screen pixels, 2.5 to 7 by how many lines it carries
  (`--fold-width`, set on the line by the diagram). Over open ground it is
  straight; with a shape in its way it is curved round it. Standing for one
  line it is picked as that line and wears the selected state; standing for
  several it takes only the hover rim, and names itself in the chip with a
  third row in `--ink-soft` for the count.
- **Pips** — `.cap__pip`, a row of dots along the foot of a shut capability
  that holds features, one each up to seven, in the title's ink at 30%.
- **An open capability** — `.cap--open`. Its name is `.cap__heading`, bold, in
  the crown of the oval at an eighth of the oval's shorter radius; its icon is
  not drawn.
- **A feature** — `.feature`, in a stack of its own over the lines, so a line
  passes behind a bubble and never through its name. A bubble of white at
  `--feature-fill-opacity` over the capability's fill, with a one-pixel rim in
  `--capability-border` that does not scale with the zoom, and its name in the
  capability's ink at the one size the capability's layout chose. Hover lifts
  the fill to 80%; selected, the rim is `--selection` at two pixels; in hand it
  is at 85%, and the one it would trade places with is ringed in `--selection`.
  It borrows its colour from what is under it, so it needs none and follows any
  palette. White in both themes, since a capability's fill is kept light enough
  for black type in either; where a see-through capability on the dark map
  turns its title white, the bubble is `--paper` instead
  (`.feature--inverted`).
- **Connection points** — every shape a line may end on carries them, and
  shows its own when pointed at or picked, never those of what is inside it. A
  domain's sit on its outline; a feature shows every other one, at a size that
  goes with its bubble.
- **A domain's edge** — `.domain__edge`, on a selected domain in Edit mode: a
  band along the outline, 14px wide on screen, that takes the pointer and
  shows at 28% `--selection` under it. The cursor is a hand, closed while a
  lobe is being resized.

The diagram hands the zoom to the stylesheet as `--k` on the stage's `<svg>`,
and anything measured on screen divides by it. A line's weight is still its
scope's width in map units, drawn between two widths on screen:

| Token | Value | What it holds |
| --- | --- | --- |
| `--connector-least` | 2.25px | the least a line is drawn, however far out |
| `--connector-selected-least` | 4.5px | the same for a picked line, so it still reads as picked |
| `--connector-most` | 14px | the most, however far in |
| `--connector-reach` | 20px | how near the pointer has to come to take a line |
| `--connector-reach-touch` | 40px | the same under a finger (`pointer: coarse`) |
| `--feature-fill-opacity` | 0.62 | how much white a feature's bubble lays over its capability |

A new stage element that should keep its size on screen divides by `--k` the
same way; one that belongs to the terrain is left in map units and scales with
it.

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

The Assistant is the same sheet: its bar reads *Assistant* rather than the
selection, its fields step up to `--fs-400` with the rest, and the width it takes
on a wide screen means nothing here, where the sheet is as wide as the screen.

`100dvh` rather than `100vh`, because a phone's toolbars slide in and out of the
way and `vh` does not notice, which would leave the foot of the sheet under them.

## Areas

An area is a boundary, not terrain, and is drawn to be told from a domain at a
glance: a **band**, the tightest rounded line round everything it holds, where a
domain is a blob grown from what is inside it. The band stands `AREA_PAD` (64px)
off its members' real outlines: room enough to read as a line round a team
rather than an outline of its shapes. That is most of the 75px the app leaves
between two domains, so on a tightly packed map the bands of two teams side by
side overlap in the gap.

| Part | How it is drawn |
| --- | --- |
| Border | Solid, `--area-border-width` (**6px**, the weight of a capability's rim), round joins, in the area's swatch. Solid because dashes are chrome here — an empty slot, a lobe handle, a line being drawn. |
| Wash | The swatch again at the area's own opacity, **10%** by default. An area's opacity runs 0–100, where every other shape stops at 10: 0 is a border and no wash. It is what still reads when the map is zoomed out and the line has gone thin. |
| Title | Rows riding the border like a legend, `--font-heading`, bold 64px by default, with the border broken behind the block by 0.4em either side. Its only rows are the breaks typed into it; nothing wraps, so a row is as long as its words. The rows stand outside the band with the nearest astride the line — above it at the top, below it at the bottom, astride at either side, shading between as the title slides. It wears the border's colour **deepened** until it holds 4.5:1 against `--paper` — half the palette is too pale to read as type — so a blue line keeps a blue title and a yellow one gets an olive. |
| Hover and selection | A halo under the border, 8px wider than it: `--line-strong` at 90% on hover and for an area about to receive a dragged shape, `--selection` when picked. The border keeps its own colour inside the halo. |
| Handles | The border, caught by an unseen 26px line, and the title's box. The wash takes no pointer at all: the inside of an area is open ground. |

In the hierarchy an area's swatch is a small rounded box drawn as a border in
its colour, open in the middle, the way the map draws it. Its details carry a
**Holds** section between Metadata and Shape: what it holds, as chips that show
the shape on the map.

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
same document in and out by hand. Unsaved edits and the undo history — and the
Assistant's cards, which name the same records — are kept in
the tab's session storage, every list the map has, so they survive a refresh; closing the tab still
loses them, which is why the page asks before it goes. What has been drawn on
the map with a marker is kept there too, under a key of its own, and is no part
of the document: no version holds it and no export of the map carries it. Shapes reference each other by `key` — a slug
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

export const AREA_SHAPE = Object.freeze({
  title: 'New area',
  color: '#5985ab',
  opacity: 10,
  fontSize: 64,
  fontWeight: 'bold',
  titleScale: 1,
});

export const CAPABILITY_SHAPE = Object.freeze({
  title: 'New capability',
  color: '#86a27b',
  fontSize: 32,
  fontWeight: 'regular',
  sizeScale: 1,
  stretch: 2,
  opacity: 100,
});

export const TOUCHPOINT_SHAPE = Object.freeze({
  title: 'New touchpoint',
  color: '#7fc6d8',
  fontSize: 32,
  fontWeight: 'regular',
  sizeScale: 1,
  stretch: 2,
  opacity: 100,
});

export const ACTOR_SHAPE = Object.freeze({
  title: 'New actor',
  color: '#a1a4ec',
  fontSize: 32,
  fontWeight: 'regular',
  sizeScale: 1.4,
  opacity: 50,
});
```

A brand's own `defaults.js` written before 2.3 has no `AREA_SHAPE` in it. The
app reads it off the module rather than asking for it by name, so such a file
still loads, and a new area falls back on the values above.

The layers are **not** here. They are a fixed conceptual model rather than a
setting, so they live in [`app/js/rules.js`](app/js/rules.js), which a brand
directory does not shadow:

```js
export const LAYERS = Object.freeze([
  Object.freeze({ key: 'areas', title: 'Areas' }),
  Object.freeze({ key: 'core', title: 'Domains' }),
  Object.freeze({ key: 'presentation', title: 'Presentation' }),
]);

/** Which layer each kind is on. No element carries a layer of its own. */
export const LAYER_OF = Object.freeze({
  area: 'areas',
  domain: 'core',
  capability: 'core',
  touchpoint: 'presentation',
  actor: 'presentation',
});
```

A deployment may restyle its shapes; it may not redefine what the three layers
mean, or which kind of element is on which.

Change a value, then check the file:

```bash
node tests/defaults.test.mjs
```

With `npm start`, reload the page to pick the change up. The Docker image copies `app/` in when it is built, so rebuild it with `docker compose up --build`.

### Allowed values

| Value | Domain | Capability, touchpoint, actor | Area |
| --- | --- | --- | --- |
| `title` | Up to 200 characters. `\n` starts a new line. | Up to 200 characters | Up to 200 characters, on one line |
| `color` | A hex color, `#rgb` or `#rrggbb` | A hex color, `#rgb` or `#rrggbb` | A hex color, `#rgb` or `#rrggbb` |
| `opacity` | 10 to 100, in steps of 10 | 10 to 100, in steps of 10 | **0** to 100, in steps of 10: 0 is a border and no wash |
| `fontSize` | `32`, `36`, `48`, `64`, `72`, `80`, `100` | `24`, `32`, `36`, `48`, `52`, `56`, `64`, `72`, `80` | The domain's list |
| `fontWeight` | `regular` or `bold` | `regular` or `bold` | `regular` or `bold` |
| `titleScale` | `0.6`, `0.8`, `1`, `1.25`, `1.5`, `2` (the **Title size** list): the room round the title | Not used | The same list, and it sizes the words themselves — there is no lobe round a title that rides a border |
| `sizeScale` | Not used | `1` to `3`, in steps of `0.2` (the **Shape size** list) | Not used: an area is as large as what it holds |
| `stretch` | Not used | `-2` tall, `-1`, `0` round, `1`, `2` wide (the steps of Ctrl+< and Ctrl+>). Not an actor, which is a circle. | Not used |

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
- **Add a touchpoint** uses `TOUCHPOINT_SHAPE` and **Add an actor** uses `ACTOR_SHAPE`. Neither belongs to a domain, so both land on open ground beside the map. The Add buttons sit at the bottom of the diagram and offer only the kinds the selected layer takes, so a touchpoint can only ever be added to the Presentation layer.
- **Add an area** uses `AREA_SHAPE`, and appears when Areas is the layer picked. The area lands empty on open ground beside the map, as a band just long enough for its title. The first wears the default color; each one after it takes the next swatch no other area wears, since two teams side by side in one color read as one.
- **Reset colors**, below it, gives every capability in the domain the domain's color.
- **Map files**: if a file leaves out a field, the field gets its default. The exception is color, which falls back to swatch 1.

Both reset buttons can be undone with Ctrl+Z. Changing a default doesn't change shapes that already exist.
