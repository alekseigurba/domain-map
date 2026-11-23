# Changelog

What changed in each release, newest first. A release is a version in
`package.json` and a git tag of the same name — see "Publish a version of this
package" in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md). A release with more to
say than fits here has a page of its own under [docs/releases/](docs/releases/).

## Unreleased

## 2.7.0 — 2026-11-23

Who leads what, as two layers of people over the map; teams, and the map lit
up by who works on it; a slideshow made of the map, to work on and to present;
and a version shared with a few rather than with everyone, with the groups
that makes practical. One migration, `006-groups.sql`, applied at startup; map
files move to version 6. Full notes:
[docs/releases/2.7.0.md](docs/releases/2.7.0.md).

### Added

- **Product roles and Engineering roles, two layers of people.** A map can say
  who leads an area or a domain: a product lead or a product manager on one
  layer, an engineering lead, a tech lead or an architect on the other. Each
  person is a card — their icon on the left, and beside it their name with
  their role under it, the icon as tall as the two lines together — hung on
  what they own, beyond an area's title and off a domain's edge by its name,
  so it covers nothing of the shape. The card is paper let through, with the
  quietest of rims, so what it lies over is still there to be seen, and a
  band down its leading edge is the colour of its layer — warm for product,
  cool for engineering, the same two colours the layers wear in the layer
  control — so a product lead and an engineering lead on one domain are told
  apart before either name is read. Several on one shape stack away from it,
  product nearest, and where two shapes sit close the cards of one step
  further out rather than land on the other's, or on an area's name. Fit to
  screen holds the cards with the rest. The two layers sit at the top of the
  layer control with the same eye and dim buttons as the rest, so the map can
  be read for product alone, for engineering alone, or for neither.
- **A person's card goes where you put it.** Where the map hangs a card is
  only where it starts. In Edit mode, drag it anywhere — beside the domain,
  inside the area, clear of a line — and it stays there, measured from the
  shape it is on, so it goes with the domain when the domain is moved and with
  an area's name when the area grows. Someone who owns three things has three
  cards, each put where it reads best. The cards nobody has moved close up
  behind one that has, and **Put cards back** in the person's details hands
  theirs back to the map. On a locked map a card is pressed to read who it is,
  and a drag that starts on one moves the map, as it does on any shape.
- **A role is typed in once and picked after.** A person has a name, a
  **Role** and an icon. The roles are the map's own lists, one for each of the
  two layers, kept as Type choices are: type *Product lead* into the box and it
  is on the list for everyone after. The icon is one of five figures the app
  carries — three women and two men, there in every deployment — or anything
  from the icon library, where your own are added; someone given a role takes
  the icon the others in that role wear, so a variant is picked once a role
  and changed only for whoever is to be told apart. In Edit mode, pick one of the two
  layers and an area or a domain, and *Add a product role* or *Add an
  engineering role*; or name someone from the shape's own details, which list
  who leads it. A person may own several areas and domains, and one left
  owning nothing is taken off the map, since there is nowhere to draw them.
- **Teams.** A map can name the teams that work on it — product teams,
  enabling teams, a mission team, whatever the organisation calls them. A team
  is a name, a description, an owner and a **Type** from a list of the map's
  own, as an area's is, and it is put on what it works on: an area, a domain, a
  capability, or several of them across the map, which is how a team that
  belongs to no one domain is said. A team is people, not a shape, so nothing
  is drawn for it. The details of an area, a domain or a capability list its
  **Teams** — the ones on it, and after them, quieter, the ones it has through
  the domain or the area that holds it — and in Edit mode put another on it,
  or make a new one that starts there.
- **The map lit up by a team.** **Teams**, in the header, opens a legend of
  them in the top right corner, under their Types, each with how many shapes
  it is on. Press one and the map shows it: what the team is on is ringed,
  what it reaches through that — the capabilities of its domain, everything in
  its area — is left as it is drawn, and the rest stands back, lines and all.
  Press a Type and every team of it is lit together, which is the map by what
  sort of team works on it. A lit team stays lit while shapes are picked, so
  what it is on can be read one by one; pressing it again, or putting the
  legend away, gives the map back. Everyone has it, viewers too, and a team has
  a link of its own like any shape.
- **Slideshow.** The map as a deck: a postcard for every area, then every
  domain in it, and after each domain one for each of its capabilities; what
  is in no area follows the same way. A postcard is the shape as the map draws
  it beside its words — its name, what it is, its owner, who leads it, its
  teams, what it holds and what it is joined to — and says only what there is
  something to say about. Across the top of every slide is where its shape
  sits, */area/domain/capability*, so a slide met in the middle of a
  presentation says what it is a part of. The deck is made of the map, so
  there is nothing to keep in step: a domain added is a slide added. It opens
  on the slide of whatever is selected.
- **Edit and Present, as a slide program has them.** *Edit* is the deck with
  the slide's title, description, owner and Type as fields: a word changed on
  a slide is a word changed on the map, undone and saved as any other.
  *Present* is the slide in hand and nothing else, full screen where the
  browser allows it: the arrow keys, Space or a press step through, Home and
  End go to either end, and Esc comes back to the deck. A viewer presents the
  published map as anyone does.
- **A slide's picture, and one of your own.** Each slide chooses what it shows
  of its shape: the shape alone, the shape with its neighbours and the lines
  between them, or a picture **uploaded** for the slide — a screenshot of the
  thing the shape stands for, a photograph, a sketch, up to 5 MB. An uploaded
  picture is shown whole, never cropped, and is kept by name when the slide
  goes back to the drawing, so returning to it is one press and not another
  upload. Pictures are stored beside the icons, in a folder of their own.
- **A version shared with a few.** A shared version used to be every
  contributor's to see. **Share** now asks who with: everyone who works on the
  map, or the people and the groups ticked. One shared with a few is seen by
  them, by whoever shared it, and by the administrators — and to everyone else
  it is not there: not in their Shared list, not at its name in a link, not to
  copy. The Shared list says who each version is shared with, and whoever
  shared it changes that from the same place. Shared again after a fix, a
  version keeps who it was shared with, so a correction does not open it to
  everyone. Someone it is shared with can open it and take a copy, and cannot
  share it further.
- **Groups, in Users & access.** A group is a name and the people in it, and is
  the map's own: an administrator makes one from people already on the list,
  with no directory and no security group behind it. **Groups** is the
  dialog's other view — name a group, put people in it from a list of who is
  not in it yet, take one out from their chip — and everyone who works on the
  map can read them, since a version is shared with a group by whoever shares
  it. Deleting a group opens nothing to everyone: what was shared with it alone
  is then its sharer's and the administrators'.

### Changed

- **Settings, behind a gear beside your avatar.** The header is for what is
  done to the map while reading or editing it, so what is set up or looked up
  has moved behind one button: **Theme**, **Getting around**, **Users &
  access**, **Assistant model**, and **Export**, **Export SVG** and
  **Import**. Each row says what its button is for, and a row is only there
  for whoever may press it — a viewer has Theme, Getting around and the two
  exports. The avatar now opens what it says: who you are, your role and what
  it may do, and **Sign out**.
- **The pips on a shut capability can be counted.** The row of dots that says
  how many features a capability holds is half as large again and twice as
  dark, so it reads at the zoom the map is usually looked at from; on an oval
  that stands tall a full row is drawn a little smaller, to stay inside it.
- **Map files are version 6**: the teams are written at the foot of the file,
  each with what it is on by key, and after them the people in roles, as
  `productRoles` and `engineeringRoles`; two layers join the stack; the Types
  gain a list for teams and one for each layer's roles; and an area, a domain
  or a capability says what its postcard shows when that is not the shape
  alone, and names the picture uploaded for it. Versions 1 to 5 still read, as
  a map with no teams and nobody named, and a deployment from before this
  refuses a version 6 file.
- **The published map is everyone's.** A version shared with a few cannot be
  published until it is shared with everyone, and the published version cannot
  be shared with fewer: Publish is held down on such a row and says why. A
  publisher renames and deletes what anyone shared, as before, among the
  versions they are shown.
- **Sharing is asked about in a dialog of its own**, where it used to be a
  yes-or-no question. It opens on *Everyone*, which is what a share was, so
  sharing as before is the same two presses.
- **Versions is wider**, 1100px where there is the room, for the column saying
  who a shared version is shared with.
- **An administrator sees every shared version**, whoever it is shared with.
  Somebody has to be able to tidy up after a sharer who has gone, and the
  administrators already run the list of who can see anything at all.

### Fixed

- **Undo takes back what was typed.** A title, a description or an owner typed
  into its field is on the map as it is typed, so by the time the change was
  recorded the map already said the new thing — and Ctrl+Z put back the very
  words it was meant to take away. A field now keeps what it last handed over,
  and undo returns to that. Leaving a field nothing was typed into no longer
  records a step that undoes nothing.
- **Undo takes off an icon given to a shape that had none.** Ctrl+Z after
  picking a capability's or a touchpoint's first icon left the icon on it: the
  step handed back "no icon" in a form the map reads as nothing said.

## 2.6.1 — 2026-11-23

A feature that leans, a line's shape set beside the line, the Assistant's model
and its key managed in the app, a people list that can be searched and cleared
out, and the lines of the domain level put right. Map files stay version 5; one
migration, applied at startup as they all are. Full notes:
[docs/releases/2.6.1.md](docs/releases/2.6.1.md).

### Added

- **A feature leans, as a capability does.** Ctrl with < or > on a selected
  feature steps its bubble through the five shapes a capability's oval has:
  wide, a little wide, round, a little tall, tall. Wide is the shape a feature
  has always had, made by the row it sits in; a step at a time its two radii
  trade places, so stood up it is the same bubble a quarter turn round, and
  taller than its row. Its neighbours are not moved for it — drag it to where
  it has the room, as a capability stood up in a crowded domain is — and it
  sets its own name no larger than the rest, smaller where its new shape is
  too narrow for it, without resetting theirs. The lean is a field the file
  may leave out, written only when a feature is not wide, so map files stay
  version 5 and a 2.6.0 deployment still opens one, drawing the feature wide.
- **A line's shape, beside the line.** A selected line in Edit mode carries a
  small **i** beside its middle. Press it, or press I, and the two things there
  are to set about how a line is drawn open next to it: **Curved** or
  **Straight**, and **Anchor**, which keeps the line on the points it was drawn
  to. They are the same two the details panel holds, and the two stay in step.
  I again, Esc, a press on the map or a turn of the wheel shuts it.
- **The Assistant's model, switched and keyed from the app.** An administrator
  has **Assistant model** under the avatar: the model **On** or **Off**, which
  takes effect at the next message with no redeploy, and a **new key** for it.
  The address is still the deployment's — `ASSISTANT_API_URL` — but a key
  expires, and replacing one no longer takes a release: the key typed here is
  used in place of `ASSISTANT_API_KEY`, and a deployment given an address and
  no key at all can be connected from the page. The key goes one way. It is
  typed into a box that shows dots, sent once, and kept sealed — encrypted
  with a key derived from `AUTH_SESSION_SECRET`, which is not in the database
  — and no route answers with it: the dialog shows a fixed row of dots for it,
  when it was set and by whom. **Try it** asks the model for one word and says
  whether it took the key; what an API says when it refuses one is passed on
  with the key taken out, whole or starred. A server with no
  `AUTH_SESSION_SECRET` will not keep a key, and says so; one whose secret has
  changed says the kept key can no longer be opened, and runs on the
  deployment's until it is set again. `dev.env` carries a secret for trying
  this locally, which is a laptop's and no deployment's.
- **Two skills for the Assistant.** *Word the lines* rewrites the descriptions
  on lines that read as steps in a flow — "triggers", "is stored in", "checks
  whether" — as what one side provides the other: a line has two ends and no
  direction, and a map whose lines say who calls whom is read as a call graph.
  *Question the ownership* looks at the map through its areas, as who answers
  for what today: where a domain leans on another team's, where two areas are
  joined by many lines, what nobody holds. It reports; it does not redraw a
  domain to fit a team.
- **Users & access finds people.** A box looks someone up by name or address as
  it is typed, and two lists narrow the rows by role and by when someone was
  last here — the last 7, 30 or 90 days, not in the last 90, or not yet. The
  list is shown twenty-five to a page, with how many there are and which are on
  show. A last sign-in from another year says which year.
- **A clear-out for people who have not been back.** Everyone who signs in once
  is on the list for good, so an administrator can remove whoever has not
  signed in for 90 days, 180 days or a year, or since a day of their choosing —
  everyone, or the viewers, contributors or publishers alone. It counts them as
  it is set, and its button removes nobody: **Preview…** turns the list into
  exactly the people who would go, each with their role, their sandbox and when
  they were last here, under a bar that says what removing them costs. **Remove**
  is pressed there, or **Cancel**. Only the people shown are ever taken, and of
  them only those still away: someone who signs in while the list is being read
  is spared. Someone added by email who never came counts from the day they
  were added. Administrators are never taken this way, nor whoever is asking,
  and a day within the last 30 is refused: nobody that recent is inactive,
  whatever was picked. Anyone removed who can still sign in comes back as a
  contributor, as anyone new does.

### Changed

- **Curved or Straight is a toggle, and a line's Shape section starts open.**
  Both words are in sight and either is one press, where the list had to be
  opened to see the other. The section is open when a line is first selected:
  a line has no name to come first, and its shape is most of what there is to
  set on one.
- **A folded line is drawn broken.** At the domain and capability levels a line
  the level drew — every line lifted to the same two places, as one — is dashed,
  and a line someone drew is whole. Both wear the cross-domain colour and a
  fold of one line weighs what a line does, so on a map where a domain is
  joined to a domain by hand the two could not be told apart. Export SVG draws
  the same.
- **Users & access is wider, and its key is at the foot.** The dialog is 1000px
  on a screen that has the room, and a long name or address wraps inside its
  own column, so a row is read without scrolling sideways. What each role may
  do comes after the list, which is what the dialog is opened for.
- **The Assistant is told what an area is for, and how a line is worded.** Every
  skill reads the same account of the map, and it now says that an area is how
  the organisation is cut today — a lens over the map that never defines a
  domain — and that a line's description is a promise or a fact exchanged, not
  a step in a flow. *Question the connections* rewrites a line worded as a
  call.

### Fixed

- **A line at the domain level no longer ends in the middle of a domain.** A
  domain's connection points are found where rays from the middle of its body
  leave its outline, and a ray that left exactly through a corner of the
  outline could be read as leaving through none, which put the point on the
  middle of the body: a line then ran into the blob and stopped on whatever
  capability sat there. Which rays did depended on the last digits of the
  outline, so it came and went as a lobe was resized.
- **A folded line crosses the gap between the two shapes it joins.** Each end
  was the point facing the other shape's middle, chosen without regard to the
  other end, and round a large domain the two could be a lobe out of step: a
  line with a hand's width to cross set off sideways along the boundary. It
  now runs between the pair of points that lie closest, as a line nobody has
  anchored does.
- **A domain keeps a smooth outline when its title is dragged off it.** The
  outline was found along rays from the middle of the body, and a ray that
  crossed the surface more than once — under the end of a title hanging off the
  edge — could report only one crossing, so the outline leapt along the ray
  and the blob had a bite taken out of it. It is walked along the surface
  itself now, wherever that goes; and a title whose middle is off the blob
  stands on a shoulder as wide as itself rather than hanging by a neck. A
  domain whose title is on it is drawn as it was.
- **Collapse stays at the foot of both panels.** Folded, the hierarchy panel
  had nothing left over its Collapse button to hold it down, and the button
  rose to the top of the rail, away from where it had just been pressed.
- **Getting around says what a line may join.** It still said nothing connects
  to a domain, which 2.6.0 changed.

## 2.6.0 — 2026-11-20

Features inside a capability, lines between domains, capabilities and features
in any combination, a level for how much of the lines is drawn, and a deep zoom
that opens a capability onto what it holds; a marker to draw flows on the map
with; and a dark theme. No migration; map files move to version 5. Full notes:
[docs/releases/2.6.0.md](docs/releases/2.6.0.md).

### Added

- **Features, inside a capability.** A capability can hold features: what it
  does, named one by one, each with a description, an owner and a Type as every
  shape has. *Add a feature*, on the Domains layer, puts one into the
  capability that is selected; the menu lists them under their capability and
  the details panel as chips. A feature has no size or colour of its own — it
  is drawn inside its capability's oval, in rows, in the order the capability
  holds it — and in Edit mode it is dragged like a capability is: about its
  oval, onto another feature to trade places, or into another capability.
  `[` and `]` move it along the list, and *Put back in its row* undoes a place
  given by hand.
- **Lines between domains, capabilities and features, in any combination.** A
  connector may end on a domain or a feature as well as on a capability, so one
  part of a map can be drawn down to its features while another is left as a
  domain that talks to a domain. Point at any of the three in Edit mode and its
  connection points appear — round a domain's blob, round a feature's bubble —
  and a line is drawn between them as it always was. The one line refused is
  from a shape to the one that holds it, which says nothing.
- **A level for the lines.** A slider over the zoom buttons says how much of
  the lines is spelt out: **F**, where every line really ends; **C**, where a
  line to a feature leaves from its capability; **D**, where every line leaves
  from a domain and the lines between two domains are one, heavier the more it
  stands for, each domain keeping its two strongest. Pick a domain there and
  every line it has is drawn; pick a capability and its own lines leave from
  it. The map opens at F, and the level is the same browsing and editing, so
  what is on the stage does not change when Edit is left. It is your tab's,
  like a layer hidden while browsing.
- **A domain's lobes are resized by its boundary.** In Edit mode the boundary
  of a selected domain is a handle: drag it out and the lobe behind that
  stretch grows, drag it in and it shrinks, the capability staying the size it
  is. A roomier domain is one a capability can be moved about in without
  slipping out of it. *Reset shapes* puts every lobe back.
- **Deep zoom.** The map says more the closer you look, and nothing on it moves
  as you do. Zoom in on a capability and it opens onto its features, its own
  name moved up into the crown of the oval; pull back and it shuts, wearing a
  row of pips along its foot for what it holds, and a line that ended on one of
  its features leaves from the capability instead. Three features open sooner
  than thirty, and a map whose features are set small zooms in past where it
  used to stop. Double-click a domain or a capability to glide in to it; Fit to
  screen glides back out.
- **Draw**, in the header, puts a marker in your hand and locks the map under
  it, so a flow can be traced across the terrain — which teams a payment passes
  through, where an order waits — without anything on the map being picked up
  or moved. A tray on the stage holds five markers, an eraser that takes a
  whole stroke, undo and clear. What you draw stays where it was drawn as the
  map is panned and zoomed, and it is yours alone: it is in no version, nobody
  else sees it, and anyone can draw, a viewer included. It survives a refresh
  and goes with the tab, or when another version is opened in its place. Hold
  Space, or use two fingers, to move the map with the marker in hand. Draw
  stands down while Edit is on.
- **Export SVG carries the drawing.** A picture exported with a flow drawn on
  the map has the flow in it, over the map, in the colours it was drawn in.
- **Pages and routes of your own.** A repo built on the package can put a page
  beside the map — `pipelines.html` and its scripts in the brand directory — and
  answer requests of its own with `routes` on `createDomainMapServer`. Both sit
  behind the same sign-in as the map, and a route is told who is asking and what
  their role lets them do, so the people who work on the map can work on the new
  page without a second list of who may. BRANDING.md has the contract.
- **`domain-map/auth` and `domain-map/roles`** can be imported by name, for a
  server that wants the package's sign-in and roles without the rest of it.
- **The pan and zoom maths as a module of its own**, `app/js/viewport.js`, with
  a zoom to fit any box of the world as well as the whole map. A page of your
  own imports it from `/js/viewport.js` and pans and zooms the way the map does,
  the glide between two views included. Fit to screen, the wheel and the pinch
  land exactly where they did.
- **A dark theme.** The page is dark when the device is and light when it is
  not, until you say otherwise: **Theme**, under the avatar, offers System,
  Light and Dark. The choice is the browser's own, like which panels are
  folded, and the sign-in screen follows it. Everything turns — the chrome, the
  dialogs, the Assistant, the paper the map is drawn on — and the page opens in
  its theme rather than flashing white first.
- **The map's colours on dark paper.** A map still has one palette. On a dark
  map each swatch is drawn as its dark counterpart, the same colour in less
  light, so the pale end of a palette stops being the brightest thing on the
  screen and a capability's title is still black on its oval. Nothing is kept
  for it: the counterpart is worked out from the swatch, so a map with a
  palette of its own and a brand that recoloured the stock one are dark without
  a change to either. **Edit palette** goes on editing the colours as the light
  theme draws them, and says so while the page is dark. A shape made
  see-through shows the dark paper through it, and there its title turns white.
- **Export SVG draws the theme on screen.** From the dark theme the picture is
  the dark map on its dark paper; switch to Light first for one to print.
- **A brand in the dark.** A brand written before there was a dark theme comes
  out dark all the same, with its own colour where the brand colour goes.
  BRANDING.md says how one restates its tokens for it, and how a page of your
  own wears the theme.

### Changed

- **A line goes round what is in its way.** A curved line nobody has shaped,
  and every line drawn at a coarser level, is bent round a domain or a loose
  capability that lies between its ends rather than drawn across it. It is a
  leaning and not a law: a shape too large to go round, or a gap too narrow to
  thread, and the line goes straight. A line you have bent yourself keeps its
  bends, and a straight one stays straight.
- **A line keeps a width you can see.** A line's weight is in map units, so
  from the helicopter view it thinned to a hair. It is now never drawn under
  about two pixels on screen, nor over fourteen zoomed far in. The band round
  a line that takes the pointer is held to a width on screen as well, twice as
  wide under a finger, so a line can be picked on a phone from any zoom.
- **Browsing, a drag pans from wherever it starts.** Outside Edit mode nothing
  on the map can be moved, so a drag that starts on a domain or a capability
  now moves the map, as one on open ground does; a click still picks the
  shape. In Edit mode a drag on a shape moves the shape, as it did.
- **Export SVG draws what the stage draws**, as it always has — which now
  means the lines at the level the slider is on, and a capability's features
  when it is open.
- **Map files are version 5**: a capability's features are written under it, a
  line at the top of the file says when an end is a domain or a feature, and a
  capability may carry the size of its lobe. Versions 1 to 4 still read, as a
  map whose capabilities hold nothing, and a deployment from before this
  refuses a version 5 file.
- **A repo from `create-domain-map-app` names its Docker stack after itself.**
  Its `docker-compose.yml` sets the project name and both container names from
  the repo's name — `acme-domain-map` and `acme-domain-map-postgres` — where
  Compose used to take them from the folder it was checked out in. Two maps in
  folders of one name, or one in a folder called `domain-map` beside this
  package's own checkout, were one project, and a `docker compose down` in
  either stopped both. A repo made before this carries its own copy of the
  file: add `name:` at the top and a `container_name:` to each service to get
  the same.

### Fixed

- **A refresh no longer drops the areas from unsaved changes.** The tab keeps
  unsaved work across a refresh, and what it kept left out the areas: the map
  came back with every shape out of its team, and saving it then wrote the
  areas out of the file for good. They are kept now, with everything else.

## 2.5.1 — 2026-09-22

More than one administrator, people taken off the list, and a Versions dialog
that shows every action without scrolling. One migration, applied at startup;
map files stay version 4. Full notes:
[docs/releases/2.5.1.md](docs/releases/2.5.1.md).

### Added

- **More than one administrator.** The role select on a row in Users & access
  offers Administrator like any other role, and asks first, since the person
  can then do everything you can. Nobody changes their own row — another
  administrator does — so the map is never left without one. Handing over is
  making someone an administrator and letting them take you down.
- **Remove**, on every row but your own, takes someone off the list. Someone
  added who never signed in goes at once; someone who has is asked about
  first, and the question says how many versions their sandbox holds, since
  those go with them. What they shared stays shared. Someone who can still
  sign in comes back as a contributor, as anyone new does: to keep a person
  out, take away their access in Entra; to keep them read-only, make them a
  viewer.
- **What each role may do**, at the head of Users & access: the four roles and
  a sentence each, lowest first. The same sentence is on the pointer over a
  role, and in the profile popup under your name.

### Changed

- **Versions is wider**, 920px where it was 760, so a publisher's Publish and
  Delete are no longer behind a scroll bar since the column saying who saved or
  shared a version arrived. The name column grew with it, so a version tagged
  Published, Open and Yours still shows its name.
- **`npm run make-administrator` adds an administrator** and leaves everyone
  else as they are, where it used to demote the one there was.
- *Make administrator* and `PUT /api/administrator` are gone: `PATCH
  /api/people/<id>` with the role `administrator` does it, and `DELETE
  /api/people/<id>` takes someone off the list.

### Fixed

- **Versions and Users & access fit a phone.** A long version name carried its
  card off the right-hand edge, a shared version's five actions ran off after
  it, and on the roster the row's button was drawn over the date.

## 2.5.0 — 2026-09-22

Four roles instead of two, a list of the people the map knows, an owner picked
from it, and a sandbox for every contributor beside the shared versions — the
two releases planned as 2.4 and 2.5, shipped as one. Full notes:
[docs/releases/2.5.0.md](docs/releases/2.5.0.md).

### Added

- **A sandbox of your own.** What you save is yours until you share it: nobody
  else — not a publisher, not the administrator — is shown what is in it. *Save
  as new* goes there, numbered `v1`, `v2`… by your sandbox alone, and Users &
  access says how many versions each sandbox holds, never what.
- **Share** puts a fixed copy of a sandbox version among the **Shared**
  versions, which every contributor can open. Sharing again under the same name
  writes your own share over; a name somebody else shared under is refused,
  with their name; the published one is refused. Whoever shared a version, a
  publisher and the administrator can rename or delete it; nobody saves over
  it.
- **Take a copy** brings a shared version into your sandbox to work on, under
  the same name where your sandbox has it free. Save on a shared version does
  the same, after asking.
- **Publish** goes live from the shared versions only, so what everyone lands
  on was in the open first.
- **Links**: `?version=` names a shared version, as it did; `?draft=` names one
  in your sandbox, which only you can follow.
- **Roles.** Everyone who signs in is a **contributor**: they edit, save,
  rename and delete versions, and talk to the Assistant. A **publisher** also
  chooses which version is the map everyone sees. The one **administrator**
  also decides who is what. A **viewer** sees the published map and nothing
  else, as before — but nobody is one until the administrator says so.
- **Users & access**, in the profile popup: everyone on the list, their role
  and when they were last here. Everyone who works on the map can read it. The
  administrator changes a role on its row, adds someone by email ahead of their
  first sign-in, and hands their own role to someone else with *Make
  administrator*.
- **The Owner box offers the people on the list.** Start typing and the names
  come up; pick one and the map keeps who was meant, so a rename in the
  directory follows them onto the map. A team, or someone outside, is typed as
  before. Under the box, the person's address — or that they are no longer on
  the list.
- **The development bypass asks who to be**: a name and a role on the sign-in
  screen, so every role can be tried locally. The first name in is the
  administrator.
- **`npm run make-administrator -- someone@example.com`**, for the day the
  administrator has left without handing over.

### Changed

- **`OWNER_EMAILS` is read once**, into an empty people table at first start:
  the first address is the administrator and the rest are contributors. After
  that Users & access rules, and the variable is not looked at again. Left
  empty, the first person to sign in is the administrator, and the server says
  so at startup.
- **Map files are version 4**: an element's `owner` may carry an `ownerId`
  beside it. Files from 2.3 and before open as they did; a 2.3 deployment
  refuses a file written here.
- **The site role is called Administrator**, not Owner. *Owner* stays the word
  for who owns a domain or a capability on the map.
- **Everyone signs in once more** after the upgrade: a session from before
  cannot say who its person is on the list, and Entra signs them straight back
  in.
- **Every version already in the database is shared** after the upgrade, as
  everything site-wide was; sandboxes start empty and fill as people take
  copies. A version from before has no sharer, so renaming or deleting it is a
  publisher's.
- For a repo with an `auth` of its own: `user(request)` should now answer
  `source` and `subject` as well; without them the address stands in. See
  [docs/BRANDING.md](docs/BRANDING.md).

## 2.3.1 — 2026-09-22

The layers are Presentation, Domains and Areas, and an area's title can break
into rows. Nothing breaks and there is nothing to run. Full notes:
[docs/releases/2.3.1.md](docs/releases/2.3.1.md).

### Added

- **Line breaks in an area's title.** Shift+Enter or Ctrl+Enter while renaming
  an area on the map breaks its title into rows, as it does a domain's; Enter
  still saves. The rows stand outside the band and rest on the border — above
  the line when the title rides the top, below it at the bottom, astride it at
  either side, and shading between as the title is slid round. Nothing wraps on
  its own: a row is as long as its words, and the break in the border follows
  the longest. A team name too long for its stretch of border no longer has to
  be a smaller one. In the details panel the title reads as one line, and what
  is typed there keeps the rows.

### Changed

- **The layers are Presentation, Domains and Areas** — in the layer control,
  the menu and the heading of an area's details, where they were the
  Presentation Layer, Business Domains and Product Areas. The plain word is the
  more general one: a team, a tribe, a product line or a business unit is an
  area. The Add button, the Area field and the map file are as they were, so
  nothing needs saving again and a 2.3.0 deployment opens a map written here.
- **The example map breaks a title**: Customer & Merchant rides the top of its
  band as two rows. Only a fresh store is seeded from it.

## 2.3.0 — 2026-09-21

The map gains a third layer, **Product Areas**: who owns what. **Breaking:** map
files are version 3 now, and a 2.2 deployment refuses one — versions 1 and 2
still open here, as a map with no areas. Full notes:
[docs/releases/2.3.0.md](docs/releases/2.3.0.md).

### Added

- **Product Areas**, a layer under the other two. An area is a band drawn round
  the domains, touchpoints and loose capabilities one team holds, so the map
  that says what the business does can also say how the organisation that
  builds it is cut. It has no size of its own: it follows what it holds, the
  tightest rounded line that takes everything in, however far apart a team's
  domains sit. A shape is in one area or in none; a capability inside a domain
  belongs through its domain, and an actor, standing outside the business,
  belongs to nobody. The layer can be hidden and dimmed like the Presentation
  Layer. Business Domains is still the base — the one layer that cannot be
  hidden, and where Edit mode opens.
- **Add an area**, among the Add buttons once Product Areas is the layer
  picked. It arrives empty, a small band with its title on it, in a colour no
  other area wears. **Drag a shape in** from outside the line to put it in the
  area — the one about to take it lights up — and drop it inside another area's
  line to hand it over. Dragging a shape clear of its team only stretches the
  band after it: leaving is said in the shape's details, so that tidying the map
  never reorganises the company.
- **An Area field** in the details of a domain, a touchpoint and a loose
  capability: one of the map's areas, or none. A capability inside a domain
  shows the area it has through its domain. An area's own details are a
  domain's — title, description, owner, a Type from a list of its own — with
  **what it holds** listed as names to press, each showing its shape on the map.
- **The border is the handle.** Drag it and the whole team's territory moves,
  every member by the same amount, as one Ctrl+Z. Drag the title and it slides
  round the border; double-click it to rename it where it sits. The inside of
  an area is open ground — it pans the map, and belongs to the shapes on it.
- **How an area looks**: a solid border in its swatch, a wash of the same colour
  inside it, and its title riding the border like a legend, with the line broken
  behind it. The title wears the border's colour, deepened until it reads on the
  paper — a blue line keeps a blue title, a yellow one gets an olive. Opacity
  runs down to 0 for an area, which is a border and no wash; **Title size** sizes
  the words themselves. Export SVG draws the areas that are showing.
- **Product Areas in the menu**, a flat section after Actors, and in the footer's
  count. Every shape keeps the one row it had.
- **The Assistant sees the teams.** The brief lists the areas and says which one
  each domain, touchpoint and loose capability is in, so a review of the
  boundaries can hold how the business is cut against how the organisation is.
  *Describe*, *Fill the blanks* and *Tighten the wording* work on an area, and a
  reply may describe, rename and type one. It may not add an area or hand a
  shape to one: who owns what is yours to say, as position is.
- **The example map draws three areas** — Checkout & Risk, Money Movement and
  Customer & Merchant — holding between them a domain, a touchpoint and a loose
  capability. It was opened out to give them room, and opens differently: the
  Presentation Layer shown, where 2.1 hid it, and Product Areas dimmed, so the
  teams sit behind the business rather than over it. Only a fresh store is
  seeded from it.

### Changed

- **The menu and the details panel are wider**, 300px where they were 250, so a
  capability's title and a field's label are read rather than cut short. On a
  small screen they give way — never more than 24% of the window each — and the
  width is a token, `--panel-w`, for a brand that wants another.
- `defaults.js` gains `AREA_SHAPE`. A brand's own copy from before this release
  has none and still loads: a new area falls back on the package's.

### Fixed

- **Ctrl+Z after dragging a domain, a touchpoint or an actor puts it back.** It
  said *Undid: moving* and left the shape where it had been dropped: the drag had
  already moved the record by the time the step was written down, so what undo
  put back was where it already was.

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
