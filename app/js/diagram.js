// The stage: renders the terrain from the store and turns pointer gestures into
// intents. It never talks to the API itself — it calls back into `actions`.

import {
  store, select, childrenOf, stackingOrder, stackedList, patchLocal, find, connectorScope,
  connectorEnds, oneLine, layerStack, layerOf, layerForKind, connectorLayer, isHidden,
  membersOf, areaOf, mayJoinArea, holderOf, chainOf, teamReach, rolesOn, roleCardPlace,
} from './store.js';
import { ROLE_KINDS } from './rules.js';
import * as geo from './geometry.js';
import { iconArt } from './icon-art.js';
import * as vp from './viewport.js';
import * as zoom from './zoom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SNAP_RADIUS = 3.6;
const SNAP_HIT_RADIUS = 11;
const CLICK_SLOP = 4;  // screen px that still counts as a click, not a drag
/**
 * A press pair close enough in time and place to be one double-click. Counted
 * here rather than listened for: pressing a shape re-renders it, and a browser
 * fires no click at all when the node pressed is gone by the time it is let go.
 */
const DOUBLE_MS = 450;
const DOUBLE_SLOP = 6;
const DROP_REACH = 1.3; // how far past a blob a drop still counts as inside it
/* The chip that names the line under the pointer, in screen pixels: it is read,
   not drawn on the map, so it keeps its size however far the map is zoomed. */
const LABEL_SIZE = 13;
const LABEL_PAD = 9;
const LABEL_PAD_Y = 4;
const LABEL_ROW = 17;    // one end's title: the chip holds two, from over to
const LABEL_RADIUS = 8;  // --radius-m: two rows are too tall to read as a pill
const LABEL_LIFT = 16;   // clear of the line it names
const LABEL_MAX = 260;

/** How much of a dimmed layer still shows. One step, not a slider. */
const DIM_OPACITY = 0.35;

const svg = document.getElementById('diagram');
const viewport = document.getElementById('viewport');

/**
 * The paint order of the stage, which is not the map's layers: the map's are
 * built inside `stacks`, one group of its own per layer, bottom first. What is
 * below is the chrome that rides above every one of them — the edit handles,
 * the line being drawn, what the pointer is naming, and the rename editor.
 */
const zOrder = {
  stacks: document.getElementById('layer-stacks'),
  edit: document.getElementById('layer-edit'),
  draft: document.getElementById('layer-draft'),
  hover: document.getElementById('layer-hover'),
  overlay: document.getElementById('layer-overlay'),
};

let actions = {};
let view = { ...vp.IDENTITY };
/** View mode by default: shapes can be picked and inspected, not moved. */
let editMode = false;
let drag = null;
let draft = null;
let dropTarget = null;      // {domainId, lobe, index} while a capability hovers a domain
let hoveredDomainId = null; // purely visual: the domain under the cursor
let hoveredConnectorId = null; // the line under the cursor, which names itself while it is
let hoveredAreaId = null;   // the area whose border or title is under the cursor
let receivingAreaId = null; // the area a shape in hand would join if it were let go here
/** The kebab's state machine: idle → editing → (save | cancel) → idle. */
let editing = null;         // {domainId, activeLobe} while a domain is being edited
let renaming = null;        // {kind, id, original, node, input} while a domain's or an area's title is edited
let lastPress = null;       // {type, id, time, x, y} — the other half of a double-click
let positions = new Map();
let domainViews = [];
let areaViews = [];
const pointers = new Map();
let pinch = null;

// What this zoom shows of the map. Worked out afresh in every render from where
// the view is — zoom.js makes the decisions — and none of it is the map's: it
// is what the map looks like from here.

/**
 * The level the lines are drawn at: domains, capabilities or features. Chosen
 * by whoever is looking, with the control over the zoom buttons, and the same
 * browsing or editing — what was on the stage a moment ago is what is on it
 * after Save. It is this tab's, like a layer hidden while browsing: no part of
 * the map, and back at the finest level the next time the page is opened.
 */
let lineLevel = zoom.DEFAULT_LEVEL;
/** The lines as this level draws them: the ids of those drawn as they are, and the folded ones. */
let shownLines = { drawn: new Set(), folded: [] };
/** What a line is kept off where it can be: every domain's outline, and every loose capability's, by id. */
let outlines = new Map();
/** How far clear of a shape a line is bent round it, in map units: about half the ground between two domains. */
const ROUTE_CLEARANCE = 36;
/** How each capability that holds features lays them out, kept until its oval, their names, their places or their leans change. */
const featureLayouts = new Map();
/** The capabilities open onto their features at this zoom. */
let openCapabilities = new Set();
/** How far this map zooms: past the usual limit, where its features are set small. */
let zoomLimits = { ...vp.ZOOM_LIMITS };
let hoveredFoldKey = null; // the folded line under the cursor, which names itself as a real one does
/**
 * The teams that are lit, by id: the shapes they are on are drawn as they are
 * and ringed, what they reach through them is drawn as it is, and everything
 * else stands back. One team, picked from the legend — or every team of one
 * Type, which is the map seen by what sort of team works on it. It is this
 * tab's, like the level the lines are drawn at: no part of the map, and gone
 * the next time the page is opened.
 */
let litTeams = [];
/** Where each discipline's cards are, as the last render laid them out: a list of `{ role, roleKind, on, shapeAt, pill }` a kind. */
let badges = new Map();
/** What the lit team is on and what it reaches through that, as two sets of ids, worked out each render — or null with no team lit. */
let lighting = null;
let gliding = 0;           // the frame a glide is waiting on, while one is under way
/** How long a glide takes, however far it goes. */
const GLIDE_MS = 450;

// --- element helpers -------------------------------------------------------

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  for (const child of children) node.appendChild(child);
  return node;
}

const colorOf = (index) => geo.COLORS[(index || 1) - 1] ?? geo.COLORS[0];
/** The one ink a capability's title is ever drawn in. Its icon keeps its own colours. */
const CAPABILITY_INK = '#000';
/**
 * That ink, for a shape of this fill and this solid. On the light map it is
 * black whatever they are. On the dark one it is black too wherever black
 * reads, which is every swatch drawn solid — and white on a shape see-through
 * enough for the dark paper to show, where black would be type nobody can read.
 */
const labelInk = (fill, opacity) => (geo.isDarkMap() ? geo.darkMapInk(fill, opacity, paper) : CAPABILITY_INK);
/**
 * The silhouette an actor wears is drawn on a 24-unit grid and fills only the
 * middle of it. This is the square its ink covers, stroke included: the figure
 * is drawn cropped to it, so the size the geometry hands over is the size of
 * what is seen, and the air round the figure is air the layout chose.
 */
const FIGURE_INK = { x: 3.5, y: 4.75, size: 17 };
const paperNow = () => getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#fffdfa';
/** What the stage is the colour of. A title on a see-through shape is inked for it, so a change of theme re-reads it. */
let paper = paperNow();

/** The theme has changed: the paper is another colour, and so is every ink that was chosen against it. */
export function retheme() {
  paper = paperNow();
  render();
}
/** How solid a shape is drawn, as a share. Every kind carries one now. */
const opacityOf = (record, fallback = geo.DEFAULT_OPACITY) =>
  (record.opacity ?? fallback) / 100;

export function initDiagram(handlers) {
  actions = handlers;
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('pointerleave', () => {
    if (hoveredDomainId === null && hoveredConnectorId === null && hoveredAreaId === null
      && hoveredFoldKey === null) return;
    hoveredDomainId = null;
    hoveredConnectorId = null;
    hoveredAreaId = null;
    hoveredFoldKey = null;
    render();
  });
  svg.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', () => render());
}

// --- layout ----------------------------------------------------------------

/**
 * Edit chrome belongs to the domain being edited and to no other — hovering one
 * must not add it. It stays up during a drag: the grips and the text-area
 * outline are what you are aiming with, so blanking them resizes blind.
 */
const editingState = (domainId) => (editing?.domainId === domainId
  ? { editing: true, activeLobe: editing.activeLobe }
  : {});

export function isEditing(domainId) {
  return editing?.domainId === domainId;
}

/** Enter, leave or step the kebab's state machine. */
export function setEditing(next) {
  editing = next;
  render();
}

/**
 * Toggle Edit mode. Turning it off drops anything only Edit mode can hold
 * open — a rename in progress, a lobe-arranging session, a connector being
 * drawn — the way leaving the domain being edited already does.
 */
export function setEditMode(next) {
  editMode = next;
  if (!editMode) {
    cancelRename();
    cancelDraft();
    editing = null;
    drag = null;
    dropTarget = null;
    receivingAreaId = null;
  }
  render();
}

/** Where every capability sits right now, including the one under the cursor. */
function computeLayout() {
  const map = new Map();
  const views = [];

  // A capability in hand is laid out wherever the pointer has it. The domain it
  // is over reaches out to receive it, its own or not, and the one it came
  // from closes up behind it — so what is drawn is what the drop would give.
  const held = drag?.kind === 'capability' ? find('capability', drag.id) : null;

  for (const domain of store.domains) {
    const children = held
      ? geo.childrenInHand(domain.id, childrenOf(domain.id), held, dropTarget)
      : childrenOf(domain.id);
    const moving = drag?.kind === 'title' && drag.id === domain.id
      ? { id: 'title', titleX: drag.titleX, titleY: drag.titleY }
      : null;

    const layout = geo.layoutDomain(domain, children, moving, editingState(domain.id));
    views.push({ domain, layout });

    for (const slot of layout.slots) {
      if (slot.kind !== 'capability') continue;
      map.set(slot.item.id, {
        x: domain.x + slot.x,
        y: domain.y + slot.y,
        rx: slot.rx,
        ry: slot.ry,
      });
    }
  }

  for (const capability of store.capabilities) {
    if (map.has(capability.id)) continue;
    const size = geo.capabilitySize(capability);
    map.set(capability.id, { x: capability.x, y: capability.y, rx: size.rx, ry: size.ry });
  }

  // Touchpoints and actors have no domain to be laid out inside, so each one
  // sits where it says it does. `shape` is what tells a snap point whether it
  // is going round an oval or along four flat faces.
  for (const kind of ['touchpoint', 'actor']) {
    for (const record of store[kind === 'actor' ? 'actors' : 'touchpoints']) {
      const size = geo.sizeOf(kind, record);
      map.set(record.id, {
        x: record.x, y: record.y, rx: size.rx, ry: size.ry, shape: size.shape,
      });
    }
  }

  return { views, map, areas: layoutAreas(views, map) };
}

/** Points round an oval, enough of them for a band to be stretched round it. */
const ovalRim = ({ x, y, rx, ry }, steps = 16) => Array.from({ length: steps }, (_, i) => {
  const angle = (i * 2 * Math.PI) / steps;
  return { x: x + rx * Math.cos(angle), y: y + ry * Math.sin(angle) };
});

/**
 * Every area, laid out round what it holds as that stands right now — a shape
 * in hand included, so the band stretches after a member being dragged rather
 * than letting go of it. What it is drawn round is each member's real outline:
 * a domain's blob and not its middle, the corners of a touchpoint, the rim of a
 * loose capability.
 */
function layoutAreas(views, map) {
  const blobs = new Map(views.map((view) => [view.domain.id, view]));
  const outlineOf = ({ kind, record }) => {
    if (kind === 'domain') {
      const view = blobs.get(record.id);
      return (view?.layout.outline ?? []).map((p) => ({ x: record.x + p.x, y: record.y + p.y }));
    }
    const at = map.get(record.id);
    if (!at) return [];
    return kind === 'touchpoint'
      ? [-1, 1].flatMap((sx) => [-1, 1].map((sy) => ({ x: at.x + sx * at.rx, y: at.y + sy * at.ry })))
      : ovalRim(at);
  };

  return store.areas.map((area) => {
    const members = membersOf(area.id);
    const sliding = drag?.kind === 'area-title' && drag.id === area.id
      ? { titleAngle: drag.titleAngle }
      : null;

    // The band goes round what can be seen. A member on a hidden layer is
    // still a member, but a line reaching out to a touchpoint nobody can see
    // points at nothing. With every member hidden the area is drawn as an
    // empty one, in the middle of where they are rather than wherever it was
    // last empty.
    const seen = members.filter(({ kind }) => !isHidden(layerForKind(kind)));
    if (seen.length === 0 && members.length > 0) {
      const { centre } = geo.layoutArea(area, members.map(outlineOf));
      return { area, members, layout: geo.layoutArea({ ...area, ...centre }, [], sliding) };
    }
    return { area, members, layout: geo.layoutArea(area, seen.map(outlineOf), sliding) };
  });
}

/** The middle of a place a line may end on: every shape a line reaches is in `positions`. */
const middleOf = (place) => positions.get(place.id) ?? null;

/**
 * The outlines a line between two shapes is kept off: every one but the two
 * themselves and whatever holds them, which it has to cross to get out.
 */
function inTheWayOf(...ends) {
  const own = new Set(ends.flatMap((end) => chainOf(end.kind, end.id).map((one) => one.id)));
  return [...outlines].filter(([id]) => !own.has(id)).map(([, outline]) => outline);
}

/** Where a feature in hand is drawn: wherever the pointer has it, measured from its capability's middle. */
const heldFeature = (id) => (drag?.kind === 'feature' && drag.id === id && drag.moved ? drag : null);

/**
 * What the stage shows of the map as it has just been laid out: which
 * capabilities are open onto their features, where a line may end besides a
 * capability, how the lines are drawn at the level chosen, and how far in the
 * view may go. Read off the layout, so it is right for the shapes as they
 * stand this frame.
 */
function readZoom(views) {
  const held = new Map();
  for (const feature of store.features) {
    if (!held.has(feature.capabilityId)) held.set(feature.capabilityId, []);
    held.get(feature.capabilityId).push(feature);
  }
  const sizes = [];
  const open = new Set();
  for (const capability of store.capabilities) {
    const features = held.get(capability.id);
    if (!features) continue;
    features.sort((a, b) => a.sortIndex - b.sortIndex || a.id.localeCompare(b.id));

    // Laid out again only when the oval or a name has changed: the layout
    // tries a type size for every name, and a zoom renders every frame.
    const size = geo.capabilitySize(capability);
    const key = [size.rx, size.ry, capability.title,
      ...features.map((one) => `${one.id}:${one.title}:${one.x},${one.y}:${one.stretch}`)].join('\u0001');
    if (featureLayouts.get(capability.id)?.key !== key) {
      featureLayouts.set(capability.id, { key, laid: geo.layoutFeatures(size, features, capability.title) });
    }
    const { laid } = featureLayouts.get(capability.id);
    if (!laid) continue;
    sizes.push(laid.fontSize);
    if (zoom.opensAt(laid.fontSize, view.k)) open.add(capability.id);
  }
  for (const id of [...featureLayouts.keys()]) if (!held.has(id)) featureLayouts.delete(id);
  openCapabilities = open;
  zoomLimits = zoom.limitsFor(sizes, vp.ZOOM_LIMITS);

  // Where a line may end besides a capability. A domain is its blob, set out
  // from the middle of its body: the points a line hangs off are found round
  // the outline, which is no oval. A feature is its bubble, and is there to
  // end a line on only while its capability is open.
  outlines = new Map();
  for (const { domain, layout } of views) {
    const { body, bounds } = layout;
    positions.set(domain.id, {
      x: domain.x + body.x,
      y: domain.y + body.y,
      rx: (bounds.maxX - bounds.minX) / 2,
      ry: (bounds.maxY - bounds.minY) / 2,
      shape: 'blob',
      outline: layout.outline.map((p) => ({ x: p.x - body.x, y: p.y - body.y })),
    });
    outlines.set(domain.id, layout.outline.map((p) => ({ x: domain.x + p.x, y: domain.y + p.y })));
  }
  for (const capability of store.capabilities) {
    const at = positions.get(capability.id);
    if (!at) continue;
    if (!find('domain', capability.domainId)) outlines.set(capability.id, ovalRim(at, 24));
    if (!open.has(capability.id)) continue;
    for (const bubble of featureLayouts.get(capability.id).laid.bubbles) {
      const inHand = heldFeature(bubble.item.id);
      positions.set(bubble.item.id, {
        x: at.x + (inHand?.x ?? bubble.x),
        y: at.y + (inHand?.y ?? bubble.y),
        rx: bubble.rx,
        ry: bubble.ry,
      });
    }
  }

  const lines = zoom.foldLines(store.connectors, {
    level: lineLevel,
    holderOf,
    // Everything is on the stage to end a line on but a feature of a shut capability.
    drawn: (kind, id) => kind !== 'feature' || positions.has(id),
    selection: store.selection,
    lengthOf: (line) => {
      const a = middleOf(line.from);
      const b = middleOf(line.to);
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    },
  });
  shownLines = { drawn: new Set(lines.drawn.map((one) => one.id)), folded: lines.folded };
}

/** The level the lines are drawn at. */
export const currentLineLevel = () => lineLevel;

/** Draw the lines at another level: one of zoom.LEVELS. */
export function setLineLevel(level) {
  if (!zoom.LEVELS.includes(level) || level === lineLevel) return;
  lineLevel = level;
  render();
}

/** Where an element sits and how big it is — the layout, resolved. */
export function capabilityPosition(id) {
  return positions.get(id) ?? null;
}

/**
 * The pair of snap points a connector should use right now: whichever ends sit
 * closest together, so a line follows its capabilities as they move.
 */
export function resolvedPoints(connector) {
  if (connector.anchored) return { fromPoint: connector.fromPoint, toPoint: connector.toPoint };
  const from = positions.get(connector.fromId);
  const to = positions.get(connector.toId);
  if (!from || !to) return null;
  const { fromPoint, toPoint } = geo.closestSnapPair(from, from, to, to);
  return { fromPoint, toPoint };
}

// --- rendering -------------------------------------------------------------

/**
 * Panning moves the whole picture without changing anything in it, so the
 * viewport transform is the only thing that has to be written. The shapes
 * themselves are drawn in world coordinates and do not care where the view is.
 */
function renderView() {
  viewport.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  // The stylesheet holds a line to a width on screen, and needs the zoom to do it.
  svg.style.setProperty('--k', view.k);
}

let pendingFrame = 0;

/**
 * At most one render per frame. A pointer reports faster than the screen draws
 * and every render rebuilds the whole picture, so rendering once per event is
 * work thrown away — and with DevTools open, where each node the rebuild
 * touches is reported to the inspector, it is what makes a drag stutter.
 * Anything that reads the layout back afterwards calls render() itself.
 */
function scheduleRender() {
  pendingFrame ||= requestAnimationFrame(() => { pendingFrame = 0; render(); });
}

export function render() {
  // A render asked for now answers any frame already waiting.
  if (pendingFrame) { cancelAnimationFrame(pendingFrame); pendingFrame = 0; }

  const { views, map, areas } = computeLayout();
  positions = map;
  domainViews = views;
  areaViews = areas;
  readZoom(views);
  // A team that has been deleted since it was lit lights nothing; several lit
  // together light whatever any of them is on.
  const reaches = litTeams.map((id) => find('team', id)).filter(Boolean).map(teamReach);
  lighting = reaches.length === 0 ? null : {
    on: new Set(reaches.flatMap((reach) => [...reach.on])),
    through: new Set(reaches.flatMap((reach) => [...reach.through])),
  };

  badges = badgePlaces();

  renderView();

  zOrder.stacks.replaceChildren(...layerStack().map((layer) => renderLayer(layer, views)));
  zOrder.edit.replaceChildren(
    ...views.flatMap(renderLobeHandles),
    ...views.flatMap(renderTitleWidth),
    ...renderConnectorEnds(),
    ...renderLineInfo(),
    ...views.flatMap(renderKebab));   // last, so it stays on top of the grips
  zOrder.draft.replaceChildren(...(draft ? [renderDraft()] : []));
  zOrder.hover.replaceChildren(...renderConnectorLabel());
  positionRenameEditor();

  svg.dataset.connecting = draft ? 'true' : 'false';
}

/**
 * One layer of the map, as its own stack of groups. Painting them in layer
 * order is what makes "on top" true of everything on an upper layer rather
 * than most of it — the layer above owns its connectors as well as its shapes.
 *
 * A hidden layer is not drawn at all. That takes it out of the picture and out
 * of the way of the pointer in one go, and it is what Export SVG copies.
 */
function renderLayer(layer, views) {
  const group = el('g', { class: 'map-layer', 'data-layer': layer.key });
  if (layer.hidden) return group;
  // Dimming multiplies whatever opacity each shape already carries, so a
  // domain drawn at 20% goes quieter still rather than jumping to one value.
  if (layer.dimmed) group.setAttribute('opacity', DIM_OPACITY);

  // A kind belongs to one layer entirely, so a stack is either all of that
  // kind or none of it — there is nothing to filter shape by shape.
  const has = (kind) => layer.kinds.includes(kind);

  group.append(
    el('g', { class: 'stack stack--areas' },
      has('area') ? areaViews.map((one) => teamLit(renderArea(one), one.area.id)) : []),
    el('g', { class: 'stack stack--domains' },
      has('domain') ? views.map((one) => teamLit(renderDomain(one), one.domain.id)) : []),
    // Paint order is the stack, so a shape sent to the back lands at the back.
    el('g', { class: 'stack stack--capabilities' },
      has('capability') ? paintOrder().map((one) => teamLit(renderCapability(one), one.id)) : []),
    el('g', { class: 'stack stack--touchpoints' },
      has('touchpoint') ? stackedList('touchpoint').map((one) => teamLit(renderTouchpoint(one), one.id)) : []),
    el('g', { class: 'stack stack--actors' },
      has('actor') ? stackedList('actor').map((one) => teamLit(renderActor(one), one.id)) : []),
    el('g', { class: 'stack stack--connectors' }, [
      // A folded line stands for lines between capabilities, so it is drawn
      // where theirs are, and under them: a line picked out of a fold is drawn
      // for real, and has to show over the fold it came from.
      ...(has('capability')
        ? shownLines.folded.map((line) => litLine(renderFold(line), line.from, line.to)).filter(Boolean)
        : []),
      ...store.connectors
        .filter((connector) => connectorLayer(connector) === layer.key
          && shownLines.drawn.has(connector.id))
        .map((connector) => litLine(renderConnector(connector),
          { kind: connector.fromKind, id: connector.fromId }, { kind: connector.toKind, id: connector.toId }))
        .filter(Boolean),
    ]),
    el('g', { class: 'stack stack--features' }, has('capability') ? renderFeatures() : []),
    el('g', { class: 'stack stack--roles' }, ROLE_KINDS.filter(has).flatMap(renderRoleBadges)),
  );
  return group;
}

// --- a team lit ----------------------------------------------------------------

// Picking a team changes nothing on the map and moves nothing on it: the shapes
// the team is on are ringed, what it reaches through them — the domains of its
// area, the capabilities of its domain — is left as it is, and the rest stands
// back, still there and still to be pressed. The map keeps its own colours,
// since what a shape is does not change with who works on it.

/** Whether a shape is the lit team's: one it is on, or one it reaches through one. */
const inLight = (id) => lighting.on.has(id) || lighting.through.has(id);

/** Mark a shape as drawn for how it stands to the lit team. With none lit, it is as it was. */
function teamLit(node, id) {
  if (!lighting || !node) return node;
  if (lighting.on.has(id)) node.classList.add('team-on');
  else if (!lighting.through.has(id)) node.classList.add('team-off');
  return node;
}

/** The shape a line's end counts as for a team: a feature is its capability's, since a team is never on a feature. */
const lightEnd = (end) => (end.kind === 'feature' ? find('feature', end.id)?.capabilityId ?? end.id : end.id);

/** A line stands back unless both the shapes it joins are the lit team's: it is then a line inside what the team works on. */
function litLine(node, from, to) {
  if (!lighting || !node) return node;
  if (!(inLight(lightEnd(from)) && inLight(lightEnd(to)))) node.classList.add('team-off');
  return node;
}

/** The teams that are lit, by id. None, when the map is drawn for nobody. */
export const litTeamIds = () => litTeams;

// --- role cards ---------------------------------------------------------------

/** Is this the card being moved just now? Then it is wherever the pointer has it. */
const cardInHand = ({ roleKind, role, on }) =>
  (drag?.kind === 'role-card' && drag.moved && drag.roleKind === roleKind && drag.id === role.id
    && drag.on.kind === on.kind && drag.on.id === on.id ? drag : null);

/**
 * Where a card has been put, as the point its middle is on, or null while the
 * map hangs it. What is kept is measured from the shape the card is on — a
 * domain's own point, the name of an area — so a card that was put somewhere
 * goes with its shape when the shape is moved.
 */
function cardPutAt(holder) {
  const held = cardInHand(holder);
  if (held) return { x: held.x, y: held.y };
  const at = roleCardPlace(holder.role, holder.on.kind, holder.on.id);
  return at ? { x: holder.shapeAt.x + at.x, y: holder.shapeAt.y + at.y } : null;
}

/**
 * Where every card on the map is, worked out once a render for both
 * disciplines together: a shape's product people and its engineering people
 * share the one place a card hangs off it, so they are stacked as one column
 * — product nearest the shape — and each layer then draws its own. A layer
 * that is hidden gives up its places, so the other closes up to the shape.
 *
 * The cards lie over the shapes, clear of their words: a domain's beside its
 * title, wherever round it they cover least, a capability's under its title
 * and icon. The map is mostly read
 * with its lower layers let through, so a card over the edge of a shape hides
 * nothing that matters, and a card beside the shape would be further from
 * what it names. The domains are placed first, then the capabilities, and the
 * areas last: a domain's people stay hard by its title, a capability's step
 * down past a domain's when the two would meet, and an area — the larger
 * thing, drawn round the domains — is the one whose people step further out
 * still. A capability's cards are smaller than the rest, since the oval they
 * lie over is: at a domain's size one would be wider than the capability.
 * An area's name is kept clear as well, since it rides the border just where
 * a domain inside it hangs its own.
 *
 * A card someone has put somewhere is in none of that: it is where it was put,
 * it leaves the column — which closes up behind it — and nothing the map hangs
 * steps out of its way, since whoever put it there can see what it is over.
 */
function badgePlaces(domainsLaid = domainViews, areasLaid = areaViews, placesLaid = positions) {
  const shown = [...ROLE_KINDS].filter((roleKind) => !isHidden(layerForKind(roleKind)));
  const person = (role) => ({ name: oneLine(role.title), role: oneLine(role.type) });
  const stacks = [];
  const put = [];
  // The anchor may be worked out from the people who are to hang there, as a
  // domain's is: where they go depends on how much room their cards take.
  const hang = (kind, id, anchorFor, shapeAt, fontSize = geo.BADGE_FONT) => {
    const on = { kind, id };
    const hung = [];
    for (const roleKind of shown) {
      for (const role of rolesOn(roleKind, kind, id)) {
        const holder = { roleKind, role, on, shapeAt };
        const centre = cardPutAt(holder);
        if (centre) put.push({ ...holder, pill: geo.badgeAt(centre, person(role), fontSize) });
        else hung.push(holder);
      }
    }
    if (hung.length === 0) return;
    const people = hung.map(({ role }) => person(role));
    const anchor = typeof anchorFor === 'function' ? anchorFor(people) : anchorFor;
    stacks.push({ holders: hung, grows: anchor.grows, badges: geo.badgeStack(anchor, people, fontSize) });
  };

  // An area whose layer is hidden has nothing drawn to hang a card on, and no name to keep clear.
  const areasShown = isHidden(layerForKind('area')) ? [] : areasLaid;
  const names = areasShown.map(({ layout: { gap } }) =>
    ({ x: gap.minX, y: gap.minY, width: gap.maxX - gap.minX, height: gap.maxY - gap.minY }));

  for (const { domain, layout } of domainsLaid) {
    hang('domain', domain.id, (people) => {
      const near = names.map((name) => ({ ...name, x: name.x - domain.x, y: name.y - domain.y }));
      const at = geo.badgeAnchorOnBlob(layout, people, geo.BADGE_FONT, near);
      return { ...at, x: at.x + domain.x, y: at.y + domain.y };
    }, { x: domain.x, y: domain.y });
  }
  // A capability whose layer is hidden is not drawn, and has nothing to hang a card on.
  if (!isHidden(layerForKind('capability'))) {
    for (const capability of store.capabilities) {
      const at = placesLaid.get(capability.id);
      if (!at) continue;
      hang('capability', capability.id, geo.badgeAnchorUnderWords(at, geo.capabilitySize(capability)),
        { x: at.x, y: at.y }, geo.CAPABILITY_BADGE_FONT);
    }
  }
  for (const { area, layout } of areasShown) {
    hang('area', area.id, geo.badgeAnchorOnBand(layout), { x: layout.title.x, y: layout.title.y });
  }

  const places = new Map();
  const place = (card) => places.set(card.roleKind, [...(places.get(card.roleKind) ?? []), card]);
  geo.badgesClear(stacks, names).forEach((laid, at) => {
    stacks[at].holders.forEach((holder, index) => place({ ...holder, pill: laid[index] }));
  });
  // Last, so that a card put somewhere — and the one in hand — is drawn over the ones the map hung.
  put.forEach(place);
  return places;
}

/** One discipline's layer of cards: everyone in it, on everything they own. */
const renderRoleBadges = (roleKind) => (badges.get(roleKind) ?? []).map(renderBadge);

/**
 * One card: a person's icon, and beside it their name with their role under
 * it. It is picked as a shape is — its fields are the person's — and in Edit
 * mode it is moved as one is, which is why it says which shape it is on: a
 * person who owns three things has three cards, and each is put where it reads
 * best. While a team is lit the cards stand back with the rest of the map,
 * since who leads a thing is not the subject.
 */
function renderBadge({ role, roleKind, on, pill }) {
  const picked = store.selection.type === roleKind && store.selection.id === role.id;
  const name = oneLine(role.title);
  const group = el('g', {
    class: `role-badge${picked ? ' role-badge--selected' : ''}${lighting ? ' team-off' : ''}`
      + `${cardInHand({ roleKind, role, on }) ? ' role-badge--dragging' : ''}`,
    'data-type': 'role-badge',
    'data-kind': roleKind,
    'data-id': role.id,
    'data-on-kind': on.kind,
    'data-on-id': on.id,
  });
  group.append(
    el('title', {}, [text(role.type ? `${name} — ${role.type}` : name)]),
    el('rect', {
      class: 'role-badge__pill', x: pill.x, y: pill.y, width: pill.width, height: pill.height, rx: pill.radius,
    }),
    // Which layer they are on, as a colour: the stylesheet reads the kind off
    // the card and paints the band.
    el('path', { class: 'role-badge__mark', d: geo.badgeMarkPath(pill) }),
    badgeIcon(role, pill.icon),
    el('text', {
      class: 'role-badge__name', x: pill.text.x, y: pill.text.y, 'font-size': pill.fontSize,
      'dominant-baseline': 'central',
    }, [text(pill.label)]),
  );
  if (pill.roleText) {
    group.append(el('text', {
      class: 'role-badge__role', x: pill.roleText.x, y: pill.roleText.y, 'font-size': pill.roleFontSize,
      'dominant-baseline': 'central',
    }, [text(pill.role)]));
  }
  return group;
}

/**
 * What a card wears: the icon picked for the person, drawn as its file has
 * it — its lines as heavy as whoever drew it made them, since at this size
 * they need no help — or, until one is picked, a plain figure, head and
 * shoulders, in the stylesheet's own ink.
 */
function badgeIcon(role, box) {
  const art = role.icon ? iconArt({ icon: role.icon }, actions.iconUrl, () => render()) : null;
  if (art) {
    return el('image', {
      class: 'role-badge__icon',
      href: art.href,
      ...geo.badgeIconBox(box, art.ink),
      preserveAspectRatio: 'xMidYMid meet',
    });
  }
  const middle = box.x + box.size / 2;
  const reach = box.size * 0.32;
  return el('g', { class: 'role-badge__figure', 'stroke-width': box.size * 0.06 }, [
    el('circle', { cx: middle, cy: box.y + box.size * 0.33, r: box.size * 0.17 }),
    el('path', { d: `M ${middle - reach} ${box.y + box.size * 0.88} a ${reach} ${reach * 0.95} 0 0 1 ${reach * 2} 0` }),
  ]);
}

/** Light these teams up, or with none put the map back as it is drawn for nobody. */
export function setLitTeams(ids) {
  const next = [...new Set(ids ?? [])];
  if (next.length === litTeams.length && next.every((id) => litTeams.includes(id))) return;
  litTeams = next;
  render();
}

/**
 * The capabilities in the order they are painted: the stack, with one
 * exception. A capability that is open and picked — itself, or a feature in it
 * — is painted last. Capabilities overlap, a platform in the middle of a domain
 * most of all, and one that has been opened to be read is no use with its
 * neighbours lying across what it holds. Nothing is restacked: let go of it
 * and it is back where the map has it.
 */
function paintOrder() {
  const order = stackingOrder();
  const { type, id } = store.selection;
  const picked = type === 'feature' ? find('feature', id)?.capabilityId : type === 'capability' ? id : null;
  if (!picked || !openCapabilities.has(picked)) return order;
  return [...order.filter((one) => one.id !== picked), ...order.filter((one) => one.id === picked)];
}

/**
 * An area: a wash, a border with a break in it, and the title riding the break.
 * Only the line and the title take the pointer. The inside is open ground — it
 * pans the map and belongs to the shapes standing on it — so the wash lets every
 * press through, and the border is given a wider, unseen line to be caught by.
 */
function renderArea({ area, layout }) {
  const selected = store.selection.type === 'area' && store.selection.id === area.id;
  const lit = hoveredAreaId === area.id || receivingAreaId === area.id;
  const group = el('g', {
    class: `area${selected ? ' area--selected' : ''}${lit ? ' area--hover' : ''}`,
    'data-type': 'area',
    'data-id': area.id,
  });

  const colour = colorOf(area.colorIndex);
  const { title } = layout;
  group.append(
    el('path', { class: 'area__wash', d: layout.path, fill: colour, 'fill-opacity': opacityOf(area, 0) }),
    // The rim hover and selection light up: under the border, so the area keeps
    // its own colour inside the halo.
    el('path', { class: 'area__rim', d: layout.rim }),
    el('path', { class: 'area__border', d: layout.rim, stroke: colour }),
    el('path', { class: 'area__hit', d: layout.rim }),
    el('rect', {
      class: 'area__title-hit',
      'data-type': 'area-title',
      'data-id': area.id,
      x: layout.gap.minX,
      y: layout.gap.minY,
      width: layout.gap.maxX - layout.gap.minX,
      height: layout.gap.maxY - layout.gap.minY,
    }),
  );
  // While renaming, the editor shows the text — drawing it too would double it.
  if (!isRenaming(area.id)) {
    group.appendChild(textNode('area__title', title, title.x, title.y, geo.deepened(colour, paper)));
  }
  return group;
}

/**
 * The domain wearing the hover rim. With a capability in hand it is the one
 * about to receive it, wherever the drag set off from; otherwise it is the one
 * under the pointer.
 */
function rimmedDomainId() {
  if (drag?.kind === 'capability' && drag.moved) return dropTarget?.domainId ?? null;
  return hoveredDomainId;
}

function renderDomain({ domain, layout }) {
  const selected = store.selection.type === 'domain' && store.selection.id === domain.id;
  const hovered = rimmedDomainId() === domain.id;
  const group = el('g', {
    class: `domain${selected ? ' domain--selected' : ''}${hovered ? ' domain--hover' : ''}`,
    'data-type': 'domain',
    'data-id': domain.id,
    transform: `translate(${domain.x} ${domain.y})`,
  });

  const fill = colorOf(domain.colorIndex);
  const opacity = opacityOf(domain);
  group.appendChild(el('path', {
    class: 'domain__blob',
    d: layout.path,
    fill,
    'fill-opacity': opacity,
  }));

  for (const slot of layout.slots) {
    if (slot.kind !== 'ghost') continue;
    group.appendChild(el('ellipse', { class: 'slot', cx: slot.x, cy: slot.y, rx: slot.rx, ry: slot.ry }));
  }

  const ink = geo.inkOn(fill, opacity, paper);

  // The title's lobe is what you grab to move it, so it needs a body to hit.
  group.appendChild(el('ellipse', {
    class: 'title-hit',
    'data-type': 'title',
    'data-id': domain.id,
    cx: layout.titleLobe.x,
    cy: layout.titleLobe.y,
    rx: layout.titleLobe.rx,
    ry: layout.titleLobe.ry,
  }));
  // While renaming, the editor shows the text — drawing it too would double it.
  if (!isRenaming(domain.id)) {
    group.appendChild(textNode('domain__title', layout.title, layout.title.x, layout.title.y, ink));
  }

  if (editMode) {
    // The boundary of a picked domain is a handle: drag it out or in and the
    // lobe behind that stretch of it grows or shrinks. Only once picked, so a
    // domain is not resized by a press that was meant to move it.
    if (selected && layout.lobes.length > 0) {
      group.appendChild(el('path', {
        class: 'domain__edge',
        'data-type': 'domain-edge',
        'data-id': domain.id,
        d: layout.path,
      }));
    }
    // The points a line may be hung off, round the blob. They are set out
    // from the middle of the body, which is not the domain's own point.
    const at = positions.get(domain.id);
    const snaps = at ? renderSnaps(domain.id, 'domain', at) : null;
    if (snaps) {
      snaps.setAttribute('transform', `translate(${layout.body.x} ${layout.body.y})`);
      group.appendChild(snaps);
    }
  }

  return group;
}

/**
 * The kebab rides at the end of the title, and only once the domain is picked.
 * It is drawn last of all the chrome: it sits right where the grip that resizes
 * the text area sits, and of the two it is the one that must stay clickable.
 * It stands down entirely while the title itself is being edited.
 */
function renderKebab({ domain, layout }) {
  const selected = store.selection.type === 'domain' && store.selection.id === domain.id;
  if (!editMode || !selected || isRenaming(domain.id)) return [];

  const ink = geo.inkOn(colorOf(domain.colorIndex), opacityOf(domain), paper);
  const kebab = el('g', {
    class: `kebab${isEditing(domain.id) ? ' kebab--open' : ''}`,
    'data-type': 'kebab',
    'data-id': domain.id,
    transform: `translate(${domain.x} ${domain.y})`,
    style: `--slot-ink: ${ink}`,
  });
  kebab.appendChild(el('circle', { class: 'kebab__hit', cx: layout.kebab.x, cy: layout.kebab.y, r: layout.kebab.r * 1.6 }));
  for (const offset of [-1, 0, 1]) {
    kebab.appendChild(el('circle', {
      class: 'kebab__dot',
      cx: layout.kebab.x,
      cy: layout.kebab.y + offset * layout.kebab.r * 0.72,
      r: layout.kebab.r * 0.19,
    }));
  }
  return [kebab];
}

/**
 * In edit mode, the lobes a domain lets you move. They live in their own layer
 * above the shapes so a handle is never buried under the capability it holds.
 */
function renderLobeHandles({ domain, layout }) {
  if (!editMode || !layout.editing) return [];

  return layout.lobes.map((lobe) => el('g', {
    class: 'lobe-handle',
    'data-type': 'lobe',
    'data-id': lobe.item.id,
    transform: `translate(${domain.x} ${domain.y})`,
  }, [
    el('ellipse', { class: 'lobe-handle__ring', cx: lobe.x, cy: lobe.y, rx: lobe.rx, ry: lobe.ry }),
  ]));
}

/**
 * The text area's own outline and the grips that set how wide the title wraps.
 * Shown whenever the title is being worked on — while arranging lobes, and
 * while the title itself is open for editing.
 *
 * Sizes are given in screen pixels and divided back out through the zoom: a
 * grip fixed in world units shrinks to a hairline on a map zoomed out, which is
 * a control you can see and cannot hit.
 */
function renderTitleWidth({ domain, layout }) {
  if (!editMode || (!layout.editing && !isRenaming(domain.id))) return [];

  const px = (n) => n / view.k;
  const half = layout.title.areaWidth / 2;
  const height = Math.max(layout.title.height, px(20));
  const top = layout.title.y - height / 2;
  const group = el('g', { class: 'title-width', transform: `translate(${domain.x} ${domain.y})` });

  group.appendChild(el('rect', {
    class: 'title-width__area',
    x: layout.title.x - half,
    y: top,
    width: half * 2,
    height,
    'stroke-width': px(1.5),
    'stroke-dasharray': `${px(6)} ${px(5)}`,
  }));

  for (const side of ['left', 'right']) {
    const x = layout.title.x + (side === 'left' ? -half : half);
    const grip = el('g', {
      class: 'title-width__grip',
      'data-type': 'title-width',
      'data-id': domain.id,
      'data-side': side,
    });
    grip.appendChild(el('rect', {
      class: 'title-width__hit',
      x: x - px(14), y: top - px(8), width: px(28), height: height + px(16),
    }));
    grip.appendChild(el('rect', {
      class: 'title-width__bar',
      x: x - px(3.5), y: top, width: px(7), height, rx: px(3.5),
    }));
    group.appendChild(grip);
  }
  return [group];
}

/**
 * Grab handles on the selected line's two ends. They ride in the edit layer, so
 * a handle is never buried under the capability its line runs to.
 */
function renderConnectorEnds() {
  if (!editMode || store.selection.type !== 'connector') return [];
  const connector = find('connector', store.selection.id);
  // A line drawn short of its own ends, at a coarser level or beside a shut
  // capability, has no ends on the stage to take hold of.
  if (!connector || !shownLines.drawn.has(connector.id)) return [];
  const line = lineGeometry(connector);
  if (!line) return [];

  const px = (n) => n / view.k;
  const handles = ['from', 'to'].map((end) => {
    const at = end === 'from' ? line.from : line.to;
    const held = drag?.kind === 'connector-end' && drag.id === connector.id && drag.end === end;
    const handle = el('g', {
      class: `line-end${held ? ' line-end--held' : ''}`,
      'data-type': 'connector-end',
      'data-id': connector.id,
      'data-end': end,
    });
    handle.appendChild(el('circle', { class: 'line-end__hit', cx: at.x, cy: at.y, r: px(13) }));
    handle.appendChild(el('circle', { class: 'line-end__dot', cx: at.x, cy: at.y, r: px(5.5) }));
    return handle;
  });

  // A curved line is shaped by its bends, so those get handles of their own.
  const bends = connector.lineStyle === 'curved'
    ? line.bendPoints.map((point, index) => {
      const held = drag?.kind === 'bend' && drag.id === connector.id && drag.index === index;
      const handle = el('g', {
        class: `bend${held ? ' bend--held' : ''}`,
        'data-type': 'bend',
        'data-id': connector.id,
        'data-index': index,
      });
      handle.appendChild(el('circle', { class: 'bend__hit', cx: point.x, cy: point.y, r: px(12) }));
      handle.appendChild(el('circle', { class: 'bend__dot', cx: point.x, cy: point.y, r: px(5) }));
      return handle;
    })
    : [];

  return [...bends, ...handles];
}

/** How far off the middle of a picked line its handle stands, and how large it is drawn, in screen pixels. */
const LINE_INFO_OFFSET = 24;
const LINE_INFO_RADIUS = 9;

/**
 * Where the handle on a picked line stands, in map units: beside the middle of
 * the line as it is drawn. Beside it and not on it, since a curved line carries
 * a bend there to be taken hold of; and on whichever side is lower on the
 * screen, since the line's name is lifted over the middle when it is pointed
 * at. Read off the path that was just drawn, as the name is, so a line with
 * bends in it is measured along its true run. Null where the line has no path
 * on the stage.
 */
function lineInfoSpot(id) {
  const path = zOrder.stacks.querySelector(`.connector-group[data-id="${id}"] .connector`)
    ?? zOrder.stacks.querySelector('.connector--folded.connector--selected .connector');
  const length = path?.getTotalLength() ?? 0;
  if (!(length > 0)) return null;
  const at = path.getPointAtLength(length / 2);
  const before = path.getPointAtLength(Math.max(0, length / 2 - 1));
  const after = path.getPointAtLength(Math.min(length, length / 2 + 1));
  const run = Math.hypot(after.x - before.x, after.y - before.y) || 1;
  // Square to the line, turned to point down the screen — or to the right of
  // a line that runs straight down it.
  let outX = -(after.y - before.y) / run;
  let outY = (after.x - before.x) / run;
  if (outY < 0 || (outY === 0 && outX < 0)) { outX = -outX; outY = -outY; }
  const off = LINE_INFO_OFFSET / view.k;
  return { x: at.x + outX * off, y: at.y + outY * off };
}

/**
 * The handle on the selected line: a small "i" beside its middle that opens
 * what the line's shape is set with, there on the map. How a line is drawn is
 * most of what there is to change about one, and its fields are otherwise a
 * panel away from the line being looked at. Counter-scaled by the zoom, as the
 * line's name is: it is chrome, and stays the size it was drawn at. It stands
 * down while an end or a bend is in hand, so as not to be in the way of where
 * that is going.
 */
function renderLineInfo() {
  if (!editMode || store.selection.type !== 'connector') return [];
  if (drag?.kind === 'connector-end' || drag?.kind === 'bend') return [];
  const at = lineInfoSpot(store.selection.id);
  if (!at) return [];

  const handle = el('g', {
    class: 'line-info',
    'data-type': 'line-info',
    'data-id': store.selection.id,
    transform: `translate(${at.x} ${at.y}) scale(${1 / view.k})`,
  });
  const says = el('title');
  says.textContent = 'Line shape: curved or straight, anchored or not (I)';
  const mark = el('text', { class: 'line-info__mark', x: 0, y: 0 });
  mark.textContent = 'i';
  handle.append(
    says,
    el('circle', { class: 'line-info__hit', r: LINE_INFO_RADIUS + 5 }),
    el('circle', { class: 'line-info__dot', r: LINE_INFO_RADIUS }),
    mark,
  );
  return [handle];
}

/** Where on the page the pop-up a line's handle opens is hung: the handle itself. */
export function lineMenuAnchor(id) {
  const at = lineInfoSpot(id);
  if (!at) return null;
  const rect = svg.getBoundingClientRect();
  const on = vp.worldToScreen(view, at);
  return { x: rect.left + on.x, y: rect.top + on.y };
}

// --- renaming, on the shape itself -------------------------------------------

export function isRenaming(id) {
  return renaming?.id === id;
}

/**
 * Edit a title where it sits — a domain's, or an area's. The editor lives in a
 * layer render() never replaces, so the reflow it causes cannot pull it out
 * from under the caret; every render just moves it back over the title.
 */
export function startRename(id, kind = 'domain') {
  const record = find(kind, id);
  if (!record) return;
  cancelRename();

  const holder = el('foreignObject', { class: 'title-editor' });
  const input = document.createElement('textarea');
  input.className = 'title-editor__input';
  input.value = record.title;
  input.spellcheck = false;
  input.id = 'domain-title-editor';
  input.name = 'domain-title-editor';
  input.setAttribute('aria-label', kind === 'area' ? 'Area title' : 'Domain title');
  holder.appendChild(input);
  zOrder.overlay.appendChild(holder);
  renaming = { kind, id, original: record.title, node: holder, input };

  input.addEventListener('input', () => {
    patchLocal(kind, id, { title: input.value });
    render();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename();
      return;
    }
    if (event.key !== 'Enter') return;
    // Enter is "done"; Shift-Enter and Ctrl/Cmd-Enter break the line instead.
    event.preventDefault();
    if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
      commitRename();
      return;
    }
    const { selectionStart: start, selectionEnd: end, value } = input;
    input.value = `${value.slice(0, start)}\n${value.slice(end)}`;
    input.selectionStart = start + 1;
    input.selectionEnd = start + 1;
    input.dispatchEvent(new Event('input'));
  });

  input.addEventListener('blur', () => commitRename());

  render();
  input.focus();
  input.select();
}

/** Take the editor away, leaving the store as it was before it opened. */
function closeRename() {
  if (!renaming) return null;
  const closed = renaming;
  renaming = null;              // the blur this triggers must find nothing to do
  closed.node.remove();
  patchLocal(closed.kind, closed.id, { title: closed.original });
  return closed;
}

export function cancelRename() {
  if (!renaming) return false;
  closeRename();
  render();
  return true;
}

function commitRename() {
  if (!renaming) return;
  const typed = renaming.input.value;
  const { kind, id, original } = closeRename();

  // Trailing blanks are an accident of pressing Ctrl-Enter one time too many.
  const title = typed.replace(/[ \t]+$/gm, '').replace(/\n+$/, '').trim();
  if (!title || title === original) {
    render();
    return;
  }
  if (kind === 'area') actions.renameArea?.(id, title);
  else actions.renameDomain?.(id, title);
}

/** Keep the editor over the title it is editing, as the shape reflows. */
function positionRenameEditor() {
  if (!renaming) return;
  if (renaming.kind === 'area') {
    positionAreaEditor();
    return;
  }
  const view = domainViews.find(({ domain }) => domain.id === renaming.id);
  if (!view) {
    cancelRename();
    return;
  }
  const { domain, layout } = view;
  // As wide as the text, plus room for the caret past the last letter; and
  // exactly as tall as the lines, so the text sits centred in its own box
  // rather than riding at the top of a taller one.
  const width = layout.title.areaWidth + layout.title.size * 0.3;
  const height = layout.title.height;

  renaming.node.setAttribute('x', domain.x + layout.title.x - width / 2);
  renaming.node.setAttribute('y', domain.y + layout.title.y - height / 2);
  renaming.node.setAttribute('width', width);
  renaming.node.setAttribute('height', height);

  const { style } = renaming.input;
  style.fontSize = `${layout.title.size}px`;
  style.lineHeight = `${layout.title.lineHeight}px`;
  style.fontWeight = geo.cssWeight(layout.title.weight);
}

/** The same for an area's title: one line, centred on the point of the border it rides. */
function positionAreaEditor() {
  const view = areaViews.find(({ area }) => area.id === renaming.id);
  if (!view) {
    cancelRename();
    return;
  }
  const { title } = view.layout;
  const width = title.width + title.fontSize * 0.6;

  renaming.node.setAttribute('x', title.x - width / 2);
  renaming.node.setAttribute('y', title.y - title.height / 2);
  renaming.node.setAttribute('width', width);
  renaming.node.setAttribute('height', title.height);

  const { style } = renaming.input;
  style.fontSize = `${title.fontSize}px`;
  style.lineHeight = `${title.lineHeight}px`;
  style.fontWeight = geo.cssWeight(title.fontWeight);
}

/** A centred, wrapped label — the same treatment for domain titles and ovals. */
function textNode(className, block, x, y, ink) {
  const label = el('text', {
    class: className,
    'font-size': block.fontSize,
    'font-weight': geo.cssWeight(block.fontWeight),
    fill: ink,
  });
  const top = y - ((block.lines.length - 1) * block.lineHeight) / 2;
  block.lines.forEach((line, i) => {
    label.appendChild(el('tspan', {
      x,
      y: top + i * block.lineHeight,
      'dominant-baseline': 'central',
    }, [text(line)]));
  });
  return label;
}

/**
 * A shape's icon, or nothing: none chosen, or one still being got ready, which
 * draws the map again once it is. An <image> is its own little document, so the
 * icon is drawn as its file has it — the colours are the ones whoever drew it
 * chose — and is placed by its ink rather than by its file, whose margin hangs
 * outside the box the layout gave it and shows as nothing.
 */
function iconNode(record, size) {
  if (!record.icon || !(size.iconSize > 0)) return null;
  const art = iconArt(record, actions.iconUrl, () => render());
  if (!art) return null;
  return el('image', {
    class: 'cap__icon',
    href: art.href,
    ...geo.iconImageBox(size, art.ink),
    preserveAspectRatio: 'xMidYMid meet',
  });
}

function renderCapability(capability) {
  const position = positions.get(capability.id);
  const size = geo.capabilitySize(capability);
  const selected = store.selection.type === 'capability' && store.selection.id === capability.id;
  const dragging = drag?.kind === 'capability' && drag.id === capability.id;

  const swapping = dropTarget?.swapWith === capability.id;
  const held = featureLayouts.get(capability.id)?.laid ?? null;
  const open = held && openCapabilities.has(capability.id) ? held : null;
  const group = el('g', {
    class: `cap${selected ? ' cap--selected' : ''}${dragging ? ' cap--dragging' : ''}`
      + `${swapping ? ' cap--swap' : ''}${open ? ' cap--open' : ''}`,
    'data-type': 'capability',
    'data-id': capability.id,
    transform: `translate(${position.x} ${position.y})`,
  });

  const fill = colorOf(capability.colorIndex);
  // Capability titles are always black here. The palette is a light one, and a
  // label that flips to white on the darker swatches reads as a different kind
  // of thing rather than the same label on another colour.
  const ink = labelInk(fill, opacityOf(capability, 100));
  group.appendChild(el('ellipse', {
    class: 'cap__oval',
    rx: size.rx,
    ry: size.ry,
    fill,
    'fill-opacity': opacityOf(capability, 100),
  }));

  if (open) {
    // Open, the oval is a frame for what it holds: its name moves up into the
    // crown, set small, and its icon stands down — the features have the room.
    // Its features are drawn in a stack of their own, over the lines: see renderFeatures.
    group.appendChild(textNode('cap__text cap__heading', open.heading, open.heading.x, open.heading.y, ink));
  } else {
    const icon = iconNode(capability, size);
    if (icon) group.appendChild(icon);

    group.appendChild(textNode('cap__text', size, size.textX, size.textY, ink));
    // Shut, it says only that there is more inside, and roughly how much.
    for (const pip of geo.featurePips(size, held?.bubbles.length ?? 0)) {
      group.appendChild(el('circle', { class: 'cap__pip', cx: pip.x, cy: pip.y, r: pip.r, fill: ink }));
    }
  }
  const snaps = renderSnaps(capability.id, 'capability', size);
  if (snaps) group.appendChild(snaps);

  return group;
}

/**
 * The features of every open capability, as a stack of their own over the
 * lines. A line to a feature in the middle of its capability has to cross the
 * ones beside it to get out, and drawn over them it struck through their
 * names; drawn under them it passes behind, and a press on a bubble lands on
 * the bubble. One in hand is drawn where the pointer has it, and last.
 */
function renderFeatures() {
  const nodes = [];
  const inHand = [];
  for (const capability of paintOrder()) {
    const laid = openCapabilities.has(capability.id) ? featureLayouts.get(capability.id)?.laid : null;
    const at = positions.get(capability.id);
    if (!laid || !at) continue;
    const ink = labelInk(colorOf(capability.colorIndex), opacityOf(capability, 100));
    for (const bubble of laid.bubbles) {
      const held = heldFeature(bubble.item.id);
      const node = renderFeature({
        ...bubble,
        x: at.x + (held?.x ?? bubble.x),
        y: at.y + (held?.y ?? bubble.y),
      }, ink, Boolean(held));
      // A feature is in its capability's light or out of it: a team is never on a feature itself.
      if (lighting && !inLight(capability.id)) node.classList.add('team-off');
      (held ? inHand : nodes).push(node);
    }
  }
  return [...nodes, ...inHand];
}

/**
 * One feature of an open capability: a bubble with its name in it, placed by
 * the capability's layout — in its row, or where it has been put by hand — so
 * it goes wherever the capability goes. It is picked like any shape, carries
 * points a line may be hung off, and in Edit mode is dragged about its
 * capability or into another.
 */
function renderFeature(bubble, ink, dragging = false) {
  const selected = store.selection.type === 'feature' && store.selection.id === bubble.item.id;
  const swapping = drag?.kind === 'feature' && drag.swapWith === bubble.item.id;
  // The bubble is laid over the capability to lift its name off the fill, so
  // it is the opposite of the ink the name is in: white under black, and under
  // the white a see-through shape turns to on the dark map, the dark paper.
  const inverted = ink !== CAPABILITY_INK;
  const group = el('g', {
    class: `feature${selected ? ' feature--selected' : ''}${inverted ? ' feature--inverted' : ''}`
      + `${dragging ? ' feature--dragging' : ''}${swapping ? ' feature--swap' : ''}`,
    'data-type': 'feature',
    'data-id': bubble.item.id,
    transform: `translate(${bubble.x} ${bubble.y})`,
  });
  group.appendChild(el('ellipse', { class: 'feature__bubble', rx: bubble.rx, ry: bubble.ry }));
  group.appendChild(textNode('cap__text feature__text', bubble, 0, 0, ink));
  const snaps = dragging ? null : renderSnaps(bubble.item.id, 'feature', bubble);
  if (snaps) group.appendChild(snaps);
  return group;
}

/**
 * The points a line may be hung off, round whatever shape this is. Every kind
 * that can be connected carries the same twenty-four, so a line moved from an
 * oval to a touchpoint lands on the point facing the same way.
 */
function renderSnaps(id, kind, size) {
  if (!editMode) return null;
  const snaps = el('g', { class: 'snaps' });
  // A feature's bubble is too small for twenty-four: it shows every other
  // point, and smaller, so that they do not run into one another. The
  // numbering is the same, and a line still lands on the point facing its way.
  const small = kind === 'feature';
  const dot = small ? Math.min(SNAP_RADIUS, size.ry * 0.14) : SNAP_RADIUS;
  const reach = small ? dot * 2.4 : SNAP_HIT_RADIUS;

  for (const point of geo.snapPoints(size)) {
    if (small && point.index % 2 === 1) continue;
    const isActive = draft && draft.fromId === id && draft.fromPoint === point.index;
    const snap = el('g', {
      class: 'snap-point',
      'data-type': 'snap',
      'data-id': id,
      'data-kind': kind,
      'data-index': point.index,
    });
    snap.appendChild(el('circle', { class: 'snap-hit', cx: point.x, cy: point.y, r: reach }));
    snap.appendChild(el('circle', {
      class: `snap${isActive ? ' snap--active' : ''}`,
      cx: point.x,
      cy: point.y,
      r: dot,
    }));
    snaps.appendChild(snap);
  }
  return snaps;
}

/** A touchpoint: a rounded rectangle with its label inside, and an icon on whichever side of it was chosen. */
function renderTouchpoint(touchpoint) {
  const position = positions.get(touchpoint.id);
  const size = geo.touchpointSize(touchpoint);
  const selected = store.selection.type === 'touchpoint' && store.selection.id === touchpoint.id;
  const dragging = drag?.kind === 'element' && drag.id === touchpoint.id;

  const group = el('g', {
    class: `touchpoint${selected ? ' touchpoint--selected' : ''}`
      + `${dragging ? ' touchpoint--dragging' : ''}`,
    'data-type': 'touchpoint',
    'data-id': touchpoint.id,
    transform: `translate(${position.x} ${position.y})`,
  });

  group.appendChild(el('rect', {
    class: 'touchpoint__box',
    x: -size.rx,
    y: -size.ry,
    width: size.rx * 2,
    height: size.ry * 2,
    rx: size.corner,
    ry: size.corner,
    fill: colorOf(touchpoint.colorIndex),
    'fill-opacity': opacityOf(touchpoint, 100),
  }));

  const icon = iconNode(touchpoint, size);
  if (icon) group.appendChild(icon);

  group.appendChild(textNode('cap__text', size, size.textX, size.textY,
    labelInk(colorOf(touchpoint.colorIndex), opacityOf(touchpoint, 100))));
  const snaps = renderSnaps(touchpoint.id, 'touchpoint', size);
  if (snaps) group.appendChild(snaps);

  return group;
}

/**
 * An actor: a figure in a see-through circle with a rim, its name beside the
 * figure — under it, until told otherwise. The circle is the shape a line
 * attaches to, which is why the rim is drawn rather than implied — it is the
 * edge the snap points sit on.
 */
function renderActor(actor) {
  const position = positions.get(actor.id);
  const size = geo.actorSize(actor);
  const selected = store.selection.type === 'actor' && store.selection.id === actor.id;
  const dragging = drag?.kind === 'element' && drag.id === actor.id;

  const group = el('g', {
    class: `actor${selected ? ' actor--selected' : ''}${dragging ? ' actor--dragging' : ''}`,
    'data-type': 'actor',
    'data-id': actor.id,
    transform: `translate(${position.x} ${position.y})`,
  });

  group.appendChild(el('circle', {
    class: 'actor__ring',
    r: size.rx,
    fill: colorOf(actor.colorIndex),
    'fill-opacity': opacityOf(actor, 50),
  }));

  // The same silhouette the profile avatar wears, drawn at the size this actor
  // is: a head and the shoulders under it, on a 24-unit grid.
  const scale = size.figureSize / FIGURE_INK.size;
  const figure = el('g', {
    class: 'actor__figure',
    transform: `translate(${size.figureX - size.figureSize / 2} ${size.figureY - size.figureSize / 2})`
      + ` scale(${scale}) translate(${-FIGURE_INK.x} ${-FIGURE_INK.y})`,
  });
  figure.appendChild(el('circle', { cx: 12, cy: 9, r: 4 }));
  figure.appendChild(el('path', { d: 'M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5' }));
  group.appendChild(figure);

  const ink = labelInk(colorOf(actor.colorIndex), opacityOf(actor, 50));
  // On the light map the figure is the page's ink whatever ring it stands in.
  // On the dark one that ink is light and a ring drawn solid is light too, so
  // the figure goes with the name under it instead.
  if (geo.isDarkMap()) figure.style.setProperty('--figure-ink', ink);
  group.appendChild(textNode('cap__text', size, size.textX, size.textY, ink));
  const snaps = renderSnaps(actor.id, 'actor', size);
  if (snaps) group.appendChild(snaps);

  return group;
}

/** The points a line draws on right now, including an end under the cursor. */
/** Bend points travel over the wire as flat x,y pairs. */
const bendPairs = (flat) => {
  const points = [];
  for (let i = 0; i + 1 < (flat?.length ?? 0); i += 2) points.push({ x: flat[i], y: flat[i + 1] });
  return points;
};
const bendFlat = (points) => points.flatMap((p) => [Math.round(p.x), Math.round(p.y)]);

/** A snap point of a shape, in world coordinates. */
function pointOn(at, index) {
  const [point] = geo.snapPoints(at).slice(index % geo.SNAP_COUNT, (index % geo.SNAP_COUNT) + 1);
  return { x: at.x + point.x, y: at.y + point.y };
}

/**
 * Everything a line needs to be drawn or taken hold of: which capability each
 * end is on, where those ends sit, the way out of each, and the bends between
 * them — with whatever is being dragged right now already folded in, so the
 * handles and the line they belong to can never disagree about where they are.
 */
function lineGeometry(connector) {
  const ends = {
    from: { id: connector.fromId, kind: connector.fromKind, point: connector.fromPoint },
    to: { id: connector.toId, kind: connector.toKind, point: connector.toPoint },
  };

  // Not anchored: the line hangs off whichever pair of points is closest now.
  const resolved = resolvedPoints(connector);
  if (resolved) {
    ends.from.point = resolved.fromPoint;
    ends.to.point = resolved.toPoint;
  }

  const held = drag?.kind === 'connector-end' && drag.id === connector.id ? drag : null;
  if (held) {
    if (held.targetId) {
      ends[held.end].id = held.targetId;
      ends[held.end].kind = held.targetKind;
    }
    if (held.pointIndex !== null) ends[held.end].point = held.pointIndex;
  }

  const fromAt = positions.get(ends.from.id);
  const toAt = positions.get(ends.to.id);
  if (!fromAt || !toAt) return null;

  const from = pointOn(fromAt, ends.from.point);
  const to = pointOn(toAt, ends.to.point);
  const fromNormal = geo.snapNormal(fromAt, ends.from.point);
  const toNormal = geo.snapNormal(toAt, ends.to.point);

  const shaping = drag?.kind === 'bend' && drag.id === connector.id ? drag.points : null;
  const stored = shaping ?? bendPairs(connector.bendPoints);
  // A curved line nobody has shaped is bent round the shapes in its way, where
  // there are any, and otherwise takes the one easy bend it always took. A
  // straight line was asked to be straight, and a shaped one keeps its shape.
  const around = connector.lineStyle === 'curved' && stored.length === 0
    ? geo.routeAround(from, to, inTheWayOf(ends.from, ends.to), { clearance: ROUTE_CLEARANCE })
    : [];
  const bendPoints = connector.lineStyle === 'curved'
    ? (stored.length ? stored
      : around.length ? around : geo.autoBendPoints(from, to, fromNormal, toNormal))
    : [];

  return {
    fromId: ends.from.id,
    fromKind: ends.from.kind,
    toId: ends.to.id,
    toKind: ends.to.kind,
    fromPoint: ends.from.point,
    toPoint: ends.to.point,
    from,
    to,
    fromNormal,
    toNormal,
    bendPoints,
  };
}

function renderConnector(connector) {
  const line = lineGeometry(connector);
  if (!line) return null;

  const selected = store.selection.type === 'connector' && store.selection.id === connector.id;
  // Public events cross a domain boundary and read loud; internal ones stay
  // quiet; the two presentation kinds read as a different sort of line again.
  const scope = connectorScope(connector);
  const hovered = hoveredConnectorId === connector.id;
  const group = el('g', {
    class: `connector-group connector--${scope}${selected ? ' connector--selected' : ''}`
      + `${hovered ? ' connector--hover' : ''}`,
    'data-type': 'connector',
    'data-id': connector.id,
  });
  const d = geo.connectorPath(line.from, line.to, connector.lineStyle, line);
  group.appendChild(el('path', { class: 'connector__hit', d }));
  group.appendChild(el('path', { class: 'connector__rim', d }));
  group.appendChild(el('path', { class: 'connector', d }));
  return group;
}

/**
 * Where a folded line runs: its two ends, and the bends between them. It hangs
 * off whichever pair of connection points lies closest, as a line nobody has
 * pinned does, so two domains side by side are joined across the gap between
 * them. Each end used to be the point facing the other shape's middle, chosen
 * with no regard to the other end — and round a blob, where the points are a
 * long way apart, the two could be a lobe out of step, and a line that had a
 * hand's width to cross set off sideways along the boundary instead.
 *
 * Bent round a shape in its way, an end is the point nearest the first bend it
 * makes for, not the one nearest a far end it no longer runs straight to.
 */
function foldRun(line) {
  const a = middleOf(line.from);
  const b = middleOf(line.to);
  if (!a || !b) return null;
  const nearest = geo.closestSnapPair(a, a, b, b);
  const from = pointOn(a, nearest.fromPoint);
  const to = pointOn(b, nearest.toPoint);
  const around = geo.routeAround(from, to, inTheWayOf(line.from, line.to), { clearance: ROUTE_CLEARANCE });
  if (around.length === 0) return { from, to, around };
  return {
    from: pointOn(a, geo.closestSnapTo(a, a, around[0])),
    to: pointOn(b, geo.closestSnapTo(b, b, around.at(-1))),
    around,
  };
}

/**
 * A folded line: every line lifted to the same two places, drawn as one from
 * rim to rim — straight over open ground, and bent round a shape that lies
 * between. It wears the cross-domain colour; its weight is its own, set in
 * screen pixels by how many lines it stands for, since it is read at whatever
 * zoom it is seen from.
 *
 * Standing for one line, it is that line drawn short of an end the stage has
 * nowhere to put, and is picked as the line it is. Standing for several, there
 * is no one line in it to pick: it names itself under the pointer, and how
 * many it carries.
 */
function renderFold(line) {
  const run = foldRun(line);
  if (!run) return null;
  const { from, to, around } = run;

  const only = line.parts.length === 1 ? line.parts[0] : null;
  const selected = line.picked || (only && store.selection.type === 'connector' && store.selection.id === only.id);
  const hovered = only ? hoveredConnectorId === only.id : hoveredFoldKey === line.key;
  const group = el('g', {
    class: `connector-group connector--public connector--folded`
      + `${selected ? ' connector--selected' : ''}${hovered ? ' connector--hover' : ''}`,
    'data-type': only ? 'connector' : 'fold',
    'data-id': only?.id,
    'data-key': line.key,
    style: `--fold-width: ${zoom.foldedWidth(line.weight)}px`,
  });
  const leaving = (point, next) => {
    const length = Math.hypot(next.x - point.x, next.y - point.y) || 1;
    return { x: (next.x - point.x) / length, y: (next.y - point.y) / length };
  };
  const d = around.length === 0
    ? geo.connectorPath(from, to, 'straight')
    : geo.connectorPath(from, to, 'curved', {
      bendPoints: around,
      fromNormal: leaving(from, around[0]),
      toNormal: leaving(to, around.at(-1)),
    });
  group.appendChild(el('path', { class: 'connector__hit', d }));
  group.appendChild(el('path', { class: 'connector__rim', d }));
  group.appendChild(el('path', { class: 'connector', d }));
  return group;
}

/** What a place a line was folded onto is called. */
const placeTitle = (place) => find(place.kind, place.id)?.title ?? '?';

/**
 * The line under the pointer says what it joins: a chip at its middle, lifted
 * clear of the line itself. It is read off the path that was just drawn, so a
 * curve with bends in it is named at its true midpoint rather than halfway
 * between its ends. Counter-scaled by the zoom, because a name is chrome and
 * chrome stays the size it was written at.
 */
function renderConnectorLabel() {
  // A folded line is named the same way, by the two places it was folded onto,
  // with a third row for how many lines it stands for when that is more than one.
  const fold = hoveredFoldKey ? shownLines.folded.find((line) => line.key === hoveredFoldKey) : null;
  const connector = !fold && hoveredConnectorId ? find('connector', hoveredConnectorId) : null;
  if (!fold && !connector) return [];
  const path = fold
    ? [...zOrder.stacks.querySelectorAll('.connector--folded')]
      .find((node) => node.dataset.key === fold.key)?.querySelector('.connector')
    : zOrder.stacks.querySelector(`.connector-group[data-id="${connector.id}"] .connector`);
  if (!path) return [];

  const at = path.getPointAtLength(path.getTotalLength() / 2);
  // A row for each end, from over to, each cut to fit on its own.
  const rows = (fold ? [placeTitle(fold.from), placeTitle(fold.to)] : connectorEnds(connector))
    .map((title) => geo.wrapLines(oneLine(title), LABEL_SIZE, LABEL_MAX, 1, 'bold')[0]);
  const count = fold && fold.weight > 1 ? `${fold.weight} lines` : null;
  if (count) rows.push(count);
  const width = Math.max(...rows.map((row) => geo.measure(row, LABEL_SIZE, 'bold'))) + LABEL_PAD * 2;
  const height = rows.length * LABEL_ROW + LABEL_PAD_Y * 2;
  const centre = -(LABEL_LIFT + height / 2);
  const top = centre - ((rows.length - 1) * LABEL_ROW) / 2;

  const group = el('g', {
    class: 'connector-label',
    transform: `translate(${at.x} ${at.y}) scale(${1 / view.k})`,
  });
  group.appendChild(el('rect', {
    class: 'connector-label__plate',
    x: -width / 2,
    y: centre - height / 2,
    width,
    height,
    rx: LABEL_RADIUS,
  }));
  rows.forEach((row, i) => group.appendChild(el('text', {
    class: `connector-label__text${row === count ? ' connector-label__text--count' : ''}`,
    x: 0,
    y: top + i * LABEL_ROW,
    'font-size': LABEL_SIZE,
  }, [text(row)])));
  return [group];
}

function renderDraft() {
  const from = endpointOf(draft.fromId, draft.fromPoint);
  if (!from) return el('g');
  return el('path', { class: 'connector--draft', d: `M ${from.x} ${from.y} L ${draft.x} ${draft.y}` });
}

function endpointOf(elementId, pointIndex) {
  const position = positions.get(elementId);
  return position ? pointOn(position, pointIndex) : null;
}

/**
 * The element under a world point that a line may end on, topmost first. The
 * catchment reaches a little past the shape so an end can be dropped on it
 * without having to land inside it.
 *
 * Kinds are searched from the top of the stack down, and anything on a hidden
 * layer is not there to be landed on — it is not drawn either.
 */
function elementAt(x, y, except = null) {
  const within = (at, reach) => Math.hypot((x - at.x) / at.rx, (y - at.y) / at.ry) <= reach;
  for (const kind of ['actor', 'touchpoint', 'feature', 'capability']) {
    const list = kind === 'capability' ? paintOrder()
      : kind === 'feature' ? store.features : stackedList(kind);
    for (let i = list.length - 1; i >= 0; i--) {
      const record = list[i];
      // A feature of a shut capability has no place on the stage, and is skipped here.
      const at = positions.get(record.id);
      if (!at || record.id === except || isHidden(layerOf(kind, record))) continue;
      // A feature has no ground round it to spare: its neighbours are right beside it.
      if (within(at, kind === 'feature' ? 1.05 : 1.25)) return { id: record.id, kind };
    }
  }
  // Under everything else, the domain whose blob the point is in.
  const domainId = domainAt({ x, y });
  return domainId ? { id: domainId, kind: 'domain' } : null;
}

const text = (value) => document.createTextNode(value ?? '');

// --- pointer handling ------------------------------------------------------

function toWorld(event) {
  const rect = svg.getBoundingClientRect();
  return vp.screenToWorld(view, { x: event.clientX - rect.left, y: event.clientY - rect.top });
}

function targetOf(event) {
  const node = event.target.closest?.('[data-type]');
  return node
    ? {
      type: node.dataset.type,
      id: node.dataset.id,
      kind: node.dataset.kind,
      index: node.dataset.index,
      lobe: node.dataset.lobe,
      end: node.dataset.end,
      side: node.dataset.side,
      key: node.dataset.key,
      onKind: node.dataset.onKind,
      onId: node.dataset.onId,
    }
    : null;
}

/**
 * What sits under a screen point. Needed on pointerup: the pointer is captured
 * by the svg then, so the event's own target is no longer the shape.
 */
function hitAt(clientX, clientY) {
  const node = document.elementFromPoint(clientX, clientY)?.closest?.('[data-type]');
  return node
    ? {
      type: node.dataset.type,
      id: node.dataset.id,
      kind: node.dataset.kind,
      index: node.dataset.index,
    }
    : null;
}

/** The domain whose blob covers this world point, topmost first. */
function domainAt(world) {
  for (let i = domainViews.length - 1; i >= 0; i--) {
    const { domain, layout } = domainViews[i];
    if (layout.contains(world.x - domain.x, world.y - domain.y)) return domain.id;
  }
  return null;
}

/**
 * Take hold of the map itself from a press that landed on a shape. Browsing,
 * nothing on the map can be moved, so a drag that starts on a shape moves the
 * view as one that starts on open ground does — zoomed into a capability there
 * is no open ground left to start one on. It waits for the pointer to travel
 * before it moves anything, so that picking a shape does not nudge the map.
 */
function panFromShape(event) {
  drag = {
    kind: 'pan',
    pointerId: event.pointerId,
    screen: { x: event.clientX, y: event.clientY },
    origin: { ...view },
    waiting: true,
  };
}

/**
 * Who has the stage to themselves, if anyone: the marker, while Draw is on. A
 * press is theirs before it is the map's, so nothing under it is picked, moved
 * or named, and one they turn down pans the map wherever it landed — on a
 * locked map there is nothing else a drag could mean. The middle button, the
 * wheel and a pinch are the stage's own, and carry on as they were.
 */
let holder = null;

/**
 * A press while someone has the stage. What the stage still does for itself is
 * said again here rather than shared with the map's own press — the middle
 * button's pan, a second finger's pinch — so that no way through it ends on a
 * shape, however the map's own handling of a press comes to change.
 */
function pressWhileHeld(event) {
  const pan = () => {
    drag = { kind: 'pan', pointerId: event.pointerId, screen: { x: event.clientX, y: event.clientY }, origin: { ...view } };
    svg.dataset.panning = 'true';
  };

  if (event.button === 1) {
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    pan();
    return;
  }
  if (event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  svg.setPointerCapture(event.pointerId);

  if (pointers.size === 2) {
    startPinch();
    drag = null;
    return;
  }
  if (!holder.press(event)) pan();
}

/** Hand the stage over as `{ press(event) }`, which answers whether it took the press; null hands it back. */
export function holdStage(next) {
  holder = next;
  // Whatever the pointer was naming, it is not naming it to someone drawing.
  hoveredDomainId = null;
  hoveredConnectorId = null;
  hoveredAreaId = null;
  hoveredFoldKey = null;
  render();
}

/** Where the stage is looking, as a view of viewport.js: for whoever draws on it in a layer of their own. */
export const currentView = () => ({ ...view });

function onPointerDown(event) {
  // The in-place editor is HTML sitting inside the SVG: its clicks are its own.
  if (renaming?.node.contains(event.target)) return;
  // Whoever takes hold of the map has taken it from the glide.
  stopGlide();

  // Someone has the stage: the press is theirs, and the map never sees it.
  if (holder) {
    pressWhileHeld(event);
    return;
  }

  // The middle button always pans, whatever it lands on.
  if (event.button === 1) {
    event.preventDefault();
    svg.setPointerCapture(event.pointerId);
    drag = {
      kind: 'pan',
      pointerId: event.pointerId,
      screen: { x: event.clientX, y: event.clientY },
      origin: { ...view },
    };
    svg.dataset.panning = 'true';
    return;
  }
  if (event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  svg.setPointerCapture(event.pointerId);

  if (pointers.size === 2) {
    startPinch();
    drag = null;
    return;
  }

  const target = targetOf(event);
  const world = toWorld(event);

  // The index is part of what was pressed: two bends on one line share its id.
  const doubled = !!target && lastPress?.type === target.type && lastPress.id === target.id
    && lastPress.index === target.index
    && event.timeStamp - lastPress.time < DOUBLE_MS
    && Math.hypot(event.clientX - lastPress.x, event.clientY - lastPress.y) <= DOUBLE_SLOP;
  lastPress = target
    ? {
      type: target.type,
      id: target.id,
      index: target.index,
      time: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
    }
    : null;

  // A pending connector swallows the next press on a snap point.
  if (draft) {
    if (target?.type === 'snap' && target.id !== draft.fromId) {
      finishDraft(target);
      return;
    }
    draft = null;
    render();
    if (target?.type !== 'snap') return;
  }

  if (target?.type === 'snap') {
    select(target.kind ?? 'capability', target.id);
    if (!editMode) { render(); return; }
    // Either gesture works from here: drag to the far end and release, or
    // release where you are and click the far end afterwards.
    draft = {
      fromId: target.id,
      fromKind: target.kind ?? 'capability',
      fromPoint: Number(target.index),
      x: world.x,
      y: world.y,
      screen: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
    };
    render();
    return;
  }

  // A card is a person hung on what they own. Pressed, it is the person who
  // is picked, as a shape would be; in Edit mode it is taken hold of as well,
  // to be put somewhere better than where the map hung it. What is in hand is
  // the middle of the card, and where its shape is goes with it, since where
  // the card ends up is kept as a distance from that.
  if (target?.type === 'role-badge') {
    select(target.kind, target.id);
    if (!editMode) { panFromShape(event); render(); return; }
    const card = (badges.get(target.kind) ?? []).find(({ role, on }) =>
      role.id === target.id && on.kind === target.onKind && on.id === target.onId);
    if (card) {
      const centre = geo.badgeCentre(card.pill);
      drag = {
        kind: 'role-card',
        roleKind: target.kind,
        id: target.id,
        on: card.on,
        shapeAt: card.shapeAt,
        pointerId: event.pointerId,
        world,
        origin: centre,
        x: centre.x,
        y: centre.y,
        moved: false,
      };
    }
    render();
    return;
  }

  if (target?.type === 'connector-end') {
    select('connector', target.id);
    if (!editMode) { render(); return; }
    drag = {
      kind: 'connector-end',
      id: target.id,
      end: target.end,
      pointerId: event.pointerId,
      world,
      pointIndex: null,
      targetId: null,
      targetKind: null,
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'bend') {
    const connector = find('connector', target.id);
    select('connector', target.id);
    if (!editMode) { render(); return; }
    const line = lineGeometry(connector);
    const index = Number(target.index);

    // Twice on a bend takes it out again. Take the last one out and the line has
    // none of its own left, which puts it back on the bend it works out itself.
    if (doubled) {
      lastPress = null;
      const left = (line?.bendPoints ?? []).filter((_, i) => i !== index);
      actions.shapeConnector?.(target.id, bendFlat(left));
      return;
    }

    drag = {
      kind: 'bend',
      id: target.id,
      index,
      pointerId: event.pointerId,
      world,
      // The bend a line starts with is worked out, not stored. Take a copy of
      // where they all are now, so dragging one settles the others as they were.
      points: (line?.bendPoints ?? []).map((point) => ({ ...point })),
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'title-width') {
    select('domain', target.id);
    if (!editMode) { render(); return; }
    // Anchored to the edge on screen, not to the stored wrap width: those part
    // company as soon as the title is shorter than the width it may wrap at.
    const laid = domainViews.find(({ domain }) => domain.id === target.id);
    const width = Math.round(laid?.layout.title.areaWidth ?? geo.titleWidthOf(find('domain', target.id)));
    drag = {
      kind: 'title-width',
      id: target.id,
      side: target.side,
      pointerId: event.pointerId,
      world,
      origin: width,
      width,
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'title') {
    // Twice on the title opens it for editing, where it sits. The press must
    // not run its course: the focus the browser then gives the stage would be
    // taken straight back off the editor, whose blur closes it again.
    if (doubled) {
      event.preventDefault();
      lastPress = null;
      select('domain', target.id);
      if (editMode) actions.beginRename?.(target.id);
      return;
    }
    const domain = find('domain', target.id);
    select('domain', target.id);
    if (!editMode) { panFromShape(event); render(); return; }
    drag = {
      kind: 'title',
      id: target.id,
      pointerId: event.pointerId,
      world,
      origin: { x: domain.titleX ?? 0, y: domain.titleY ?? 0 },
      fromDefault: domain.titleY === null || domain.titleY === undefined,
      titleX: domain.titleX ?? 0,
      titleY: domain.titleY ?? 0,
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'area-title') {
    // Twice on the title opens it for editing, as it does on a domain's.
    if (doubled) {
      event.preventDefault();
      lastPress = null;
      select('area', target.id);
      if (editMode) actions.beginRename?.(target.id, 'area');
      return;
    }
    select('area', target.id);
    if (!editMode) { panFromShape(event); render(); return; }
    const laid = areaViews.find(({ area }) => area.id === target.id);
    drag = {
      kind: 'area-title',
      id: target.id,
      pointerId: event.pointerId,
      world,
      titleAngle: laid?.layout.title.angle ?? geo.DEFAULT_TITLE_ANGLE,
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'area') {
    const area = find('area', target.id);
    select('area', target.id);
    if (!editMode) { panFromShape(event); render(); return; }
    // The border is the handle for the whole team's territory: everything the
    // area holds is picked up with it, from where each one stands now.
    drag = {
      kind: 'area',
      id: target.id,
      pointerId: event.pointerId,
      world,
      origin: { x: area.x, y: area.y },
      carried: membersOf(target.id).map(({ kind, record }) => ({
        kind, id: record.id, x: record.x, y: record.y,
      })),
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'kebab') {
    select('domain', target.id);
    if (!editMode) { render(); return; }
    actions.openKebab?.(target.id);
    return;
  }

  // The handle is only drawn on the selected line in Edit mode, so a press on
  // it is always a press to open that line's shape, or to shut it again.
  if (target?.type === 'line-info') {
    actions.toggleLineMenu?.(target.id);
    return;
  }

  if (target?.type === 'add-capability') {
    // The seat pressed is the seat the capability lands in.
    actions.addCapabilityToDomain?.(target.id, Number(target.lobe ?? 0));
    return;
  }

  if (target?.type === 'fold') {
    // Not a thing to pick — there is no one line in it — so a press on it is a
    // press on the map, and what was picked stays picked: with a domain picked
    // these are its lines, and reaching for one must not put them away.
    panFromShape(event);
    return;
  }

  if (target?.type === 'feature') {
    select('feature', target.id);
    // Twice on a feature closes in on the capability it is in.
    if (doubled) {
      lastPress = null;
      glideInto('feature', target.id);
      return;
    }
    // Browsing, nothing on the map moves and a drag from it pans.
    if (!editMode) {
      panFromShape(event);
      render();
      return;
    }
    // In Edit mode it is picked up: about its capability, or into another.
    const feature = find('feature', target.id);
    const home = positions.get(feature.capabilityId);
    const at = positions.get(target.id);
    if (!home || !at) { render(); return; }
    drag = {
      kind: 'feature',
      id: target.id,
      capabilityId: feature.capabilityId,
      pointerId: event.pointerId,
      world,
      // Measured from the middle of its capability, as its place is kept.
      origin: { x: at.x - home.x, y: at.y - home.y },
      x: at.x - home.x,
      y: at.y - home.y,
      swapWith: null,
      over: feature.capabilityId,
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'domain-edge') {
    // The boundary of a picked domain, in Edit mode: the lobe behind the
    // stretch that was pressed is the one resized. Nearest by the lobe's own
    // measure, so a small lobe beside a large one is still found under its
    // own piece of the boundary.
    const laid = domainViews.find(({ domain }) => domain.id === target.id);
    const lobe = laid?.layout.lobes
      .map((one) => ({
        one,
        reach: Math.hypot((world.x - laid.domain.x - one.x) / one.rx, (world.y - laid.domain.y - one.y) / one.ry),
      }))
      .sort((p, q) => p.reach - q.reach)[0]?.one;
    if (!lobe) return;
    drag = {
      kind: 'lobe-size',
      id: lobe.item.id,
      domainId: target.id,
      pointerId: event.pointerId,
      world,
      origin: geo.lobeScaleOf(lobe.item),
      scale: geo.lobeScaleOf(lobe.item),
      moved: false,
    };
    svg.dataset.resizing = 'true';
    render();
    return;
  }

  if (target?.type === 'connector') {
    select('connector', target.id);
    // Shift and a click puts a new bend where you pressed, in the run of the
    // line it belongs to, so the rest of the shape stays where it was.
    const connector = find('connector', target.id);
    if (editMode && event.shiftKey && connector?.lineStyle === 'curved') {
      const line = lineGeometry(connector);
      if (line) {
        const along = [line.from, ...line.bendPoints, line.to];
        const { index } = geo.nearestSegment(along, world.x, world.y);
        const points = line.bendPoints.map((point) => ({ ...point }));
        points.splice(index, 0, { x: world.x, y: world.y });
        actions.shapeConnector?.(target.id, bendFlat(points));
        return;
      }
    }
    render();
    return;
  }

  if (target?.type === 'capability') {
    const capability = find('capability', target.id);
    select('capability', target.id);
    // Twice on a capability closes in on it: the way in to its features.
    if (doubled) {
      lastPress = null;
      glideInto('capability', target.id);
      return;
    }
    if (!editMode) { panFromShape(event); render(); return; }
    drag = {
      kind: 'capability',
      id: target.id,
      pointerId: event.pointerId,
      world,
      origin: { ...positions.get(target.id) },
      originDomainId: capability.domainId,
      size: geo.capabilitySize(capability),
      startedIn: areasAround(world),
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'touchpoint' || target?.type === 'actor') {
    const record = find(target.type, target.id);
    select(target.type, target.id);
    if (!editMode) { panFromShape(event); render(); return; }
    // Neither kind belongs to a domain, so there is no drop target to look for:
    // it simply goes where it is put.
    drag = {
      kind: 'element',
      elementKind: target.type,
      id: target.id,
      pointerId: event.pointerId,
      world,
      origin: { x: record.x, y: record.y },
      startedIn: areasAround(world),
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'domain') {
    const domain = find('domain', target.id);
    select('domain', target.id);
    // Twice on a domain closes in on it, which is where its capabilities'
    // own lines are drawn again. Twice on its title is still how it is renamed.
    if (doubled) {
      lastPress = null;
      glideInto('domain', target.id);
      return;
    }
    if (!editMode) { panFromShape(event); render(); return; }
    drag = {
      kind: 'domain',
      id: target.id,
      pointerId: event.pointerId,
      world,
      origin: { x: domain.x, y: domain.y },
      startedIn: areasAround(world),
      moved: false,
    };
    render();
    return;
  }

  select(null, null);
  drag = { kind: 'pan', pointerId: event.pointerId, screen: { x: event.clientX, y: event.clientY }, origin: { ...view } };
  svg.dataset.panning = 'true';
  render();
}

function onPointerMove(event) {
  if (pointers.has(event.pointerId)) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }

  if (pinch && pointers.size === 2) {
    updatePinch();
    return;
  }

  // Nothing names itself while something is in hand: the map is moving under
  // the pointer, and the name would be pointing at where the line used to be.
  if ((drag || draft) && (hoveredConnectorId !== null || hoveredFoldKey !== null)) {
    hoveredConnectorId = null;
    hoveredFoldKey = null;
    scheduleRender();
  }

  if (draft) {
    const world = toWorld(event);
    draft.x = world.x;
    draft.y = world.y;
    scheduleRender();
    return;
  }

  if (!drag) {
    // The map names nothing to someone drawing on it.
    if (holder) return;
    // Nothing in hand: track which domain is in focus, so its "+" can appear,
    // and which line is under the pointer, so it can say what it joins.
    const id = domainAt(toWorld(event));
    const target = targetOf(event);
    const lineId = target?.type === 'connector' ? target.id : null;
    const foldKey = target?.type === 'fold' ? target.key : null;
    const areaId = target?.type === 'area' || target?.type === 'area-title' ? target.id : null;
    if (id !== hoveredDomainId || lineId !== hoveredConnectorId || areaId !== hoveredAreaId
      || foldKey !== hoveredFoldKey) {
      hoveredDomainId = id;
      hoveredConnectorId = lineId;
      hoveredAreaId = areaId;
      hoveredFoldKey = foldKey;
      scheduleRender();
    }
    return;
  }

  if (drag.pointerId !== event.pointerId) return;

  if (drag.kind === 'pan') {
    const dx = event.clientX - drag.screen.x;
    const dy = event.clientY - drag.screen.y;
    // Started on a shape, it is a pick until the pointer has gone further than
    // a click's worth: only then is it the map that is being moved.
    if (drag.waiting && Math.hypot(dx, dy) <= CLICK_SLOP) return;
    drag.waiting = false;
    svg.dataset.panning = 'true';
    // From where the pan started, at whatever zoom the view has now: a wheel
    // turned mid-drag zooms, and letting go must not undo it.
    view = vp.panBy({ ...drag.origin, k: view.k }, dx, dy);
    drag.moved = true;
    renderView();
    return;
  }

  const world = toWorld(event);
  const dx = world.x - drag.world.x;
  const dy = world.y - drag.world.y;
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true;

  if (drag.kind === 'domain') {
    patchLocal('domain', drag.id, { x: drag.origin.x + dx, y: drag.origin.y + dy });
    receivingAreaId = receivingArea('domain', find('domain', drag.id), world);
    scheduleRender();
    return;
  }

  if (drag.kind === 'element') {
    patchLocal(drag.elementKind, drag.id, { x: drag.origin.x + dx, y: drag.origin.y + dy });
    receivingAreaId = receivingArea(drag.elementKind, find(drag.elementKind, drag.id), world);
    scheduleRender();
    return;
  }

  if (drag.kind === 'area') {
    patchLocal('area', drag.id, { x: drag.origin.x + dx, y: drag.origin.y + dy });
    for (const one of drag.carried) patchLocal(one.kind, one.id, { x: one.x + dx, y: one.y + dy });
    scheduleRender();
    return;
  }

  if (drag.kind === 'area-title') {
    // The title goes wherever on the border faces the pointer, seen from the
    // middle of the band — so it slides round the rim and cannot leave it.
    const laid = areaViews.find(({ area }) => area.id === drag.id);
    if (laid) drag.titleAngle = geo.angleFrom(laid.layout.centre, world.x, world.y);
    scheduleRender();
    return;
  }

  if (drag.kind === 'connector-end') {
    // The end follows the cursor onto whichever capability it is over — its own
    // or another one — and takes the nearest point on that oval. It will not
    // land on the capability at the far end: a line to itself is not a line.
    const connector = find('connector', drag.id);
    const farEnd = drag.end === 'from' ? connector?.toId : connector?.fromId;
    const over = elementAt(world.x, world.y);
    const landed = over && over.id !== farEnd ? over : null;
    drag.targetId = landed?.id ?? null;
    drag.targetKind = landed?.kind ?? null;

    const landing = drag.targetId
      ?? (drag.end === 'from' ? connector?.fromId : connector?.toId);
    const position = positions.get(landing);
    if (position) {
      drag.pointIndex = geo.nearestSnapIndex(position, world.x - position.x, world.y - position.y);
    }
    scheduleRender();
    return;
  }

  if (drag.kind === 'bend') {
    drag.points[drag.index] = { x: world.x, y: world.y };
    scheduleRender();
    return;
  }

  if (drag.kind === 'role-card') {
    drag.x = drag.origin.x + dx;
    drag.y = drag.origin.y + dy;
    scheduleRender();
    return;
  }

  if (drag.kind === 'title-width') {
    const reach = drag.side === 'right' ? dx : -dx;
    drag.width = Math.round(Math.min(geo.MAX_TITLE_WIDTH,
      Math.max(geo.MIN_TITLE_WIDTH, drag.origin + reach * 2)));
    patchLocal('domain', drag.id, { titleWidth: drag.width });
    scheduleRender();
    return;
  }

  if (drag.kind === 'title') {
    // Starting from the layout's own default: take the drawn position as the
    // origin, so the title does not jump when it is first picked up.
    if (drag.fromDefault) {
      const view = domainViews.find(({ domain }) => domain.id === drag.id);
      drag.origin = { x: view?.layout.title.x ?? 0, y: view?.layout.title.y ?? 0 };
      drag.fromDefault = false;
    }
    drag.titleX = drag.origin.x + dx;
    drag.titleY = drag.origin.y + dy;
    scheduleRender();
    return;
  }

  if (drag.kind === 'feature') {
    drag.x = drag.origin.x + dx;
    drag.y = drag.origin.y + dy;
    // What it is over says what letting go would do: another feature of an
    // open capability trades places with it, a capability takes it in.
    // The one in hand is under the pointer wherever the pointer goes, so it is
    // looked past.
    const under = elementAt(world.x, world.y, drag.id);
    const other = under?.kind === 'feature' ? find('feature', under.id) : null;
    drag.swapWith = other?.id ?? null;
    drag.over = other?.capabilityId ?? (under?.kind === 'capability' ? under.id : null);
    scheduleRender();
    return;
  }

  if (drag.kind === 'lobe-size') {
    const laid = domainViews.find(({ domain }) => domain.id === drag.domainId);
    const lobe = laid?.layout.lobes.find((one) => one.item.id === drag.id);
    if (!lobe) return;
    drag.scale = geo.lobeScaleThrough(lobe.item,
      world.x - laid.domain.x - lobe.x, world.y - laid.domain.y - lobe.y);
    patchLocal('capability', drag.id, { lobeScale: drag.scale });
    scheduleRender();
    return;
  }

  // capability: follow the cursor, and look for a domain underneath
  const x = drag.origin.x + dx;
  const y = drag.origin.y + dy;
  patchLocal('capability', drag.id, { x, y });
  dropTarget = findDropTarget(x, y);
  // A domain about to take it in beats an area: it would belong through the domain.
  receivingAreaId = dropTarget ? null : receivingArea('capability', find('capability', drag.id), world);
  scheduleRender();
}

function onPointerUp(event) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch = null;
  try {
    if (svg.hasPointerCapture?.(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  } catch {
    /* the browser released it for us */
  }
  svg.dataset.panning = 'false';
  svg.dataset.resizing = 'false';

  // Releasing on a second snap point completes the connector in one gesture.
  if (draft && draft.pointerId === event.pointerId) {
    const travelled = Math.hypot(event.clientX - draft.screen.x, event.clientY - draft.screen.y);
    const target = hitAt(event.clientX, event.clientY);

    if (target?.type === 'snap' && target.id !== draft.fromId) {
      finishDraft(target);
      return;
    }
    if (travelled > CLICK_SLOP) {
      // Dragged out and released on nothing — treat it as "never mind".
      draft = null;
      render();
      return;
    }
    // A plain click: leave the draft armed for the click-click gesture.
    draft.pointerId = null;
    return;
  }

  if (!drag || drag.pointerId !== event.pointerId) return;
  const finished = drag;
  const target = dropTarget;
  const joining = receivingAreaId;
  drag = null;
  dropTarget = null;
  receivingAreaId = null;

  if (!finished.moved) {
    render();
    return;
  }

  // A drag has already moved the record it was dragging, so that the map could
  // follow the pointer. Where it set off from is handed over with where it
  // ended, or there would be nothing left for undo to put back.
  if (finished.kind === 'domain') {
    const domain = find('domain', finished.id);
    actions.moveDomain?.(finished.id, domain.x, domain.y, { from: finished.origin, areaId: joining });
  } else if (finished.kind === 'element') {
    const record = find(finished.elementKind, finished.id);
    actions.moveElement?.(finished.elementKind, finished.id, record.x, record.y,
      { from: finished.origin, areaId: joining });
  } else if (finished.kind === 'area') {
    const area = find('area', finished.id);
    actions.moveArea?.(finished.id, {
      x: area.x, y: area.y, from: finished.origin, carried: finished.carried,
    });
  } else if (finished.kind === 'area-title') {
    actions.slideAreaTitle?.(finished.id, finished.titleAngle);
  } else if (finished.kind === 'title') {
    actions.moveTitle?.(finished.id, Math.round(finished.titleX), Math.round(finished.titleY));
  } else if (finished.kind === 'connector-end') {
    // Placed by hand, so the line stops re-attaching itself from now on.
    if (finished.pointIndex !== null) {
      actions.moveConnectorEnd?.(
        finished.id, finished.end, finished.pointIndex, finished.targetId, finished.targetKind);
    }
  } else if (finished.kind === 'role-card') {
    // Nothing was written while the card was in hand, so what undo puts back
    // is still in the store: only where the card was let go is handed over.
    actions.moveRoleCard?.(finished.roleKind, finished.id, finished.on.kind, finished.on.id,
      { x: finished.x - finished.shapeAt.x, y: finished.y - finished.shapeAt.y });
  } else if (finished.kind === 'bend') {
    actions.shapeConnector?.(finished.id, bendFlat(finished.points));
  } else if (finished.kind === 'title-width') {
    actions.setTitleWidth?.(finished.id, finished.width);
  } else if (finished.kind === 'lobe-size') {
    actions.resizeLobe?.(finished.id, finished.scale, { from: finished.origin });
  } else if (finished.kind === 'feature') {
    dropFeature(finished);
  } else if (finished.kind === 'capability') {
    // The rim followed the drop target; leave it there. The pointer is still
    // over wherever that was, and the next move re-reads it anyway.
    hoveredDomainId = target?.domainId ?? null;
    const capability = find('capability', finished.id);
    actions.dropCapability?.(finished.id, {
      domainId: target?.domainId ?? null,
      lobeX: target?.lobeX ?? 0,
      lobeY: target?.lobeY ?? 0,
      swapWith: target?.swapWith ?? null,
      x: capability.x,
      y: capability.y,
      cameFromDomainId: finished.originDomainId ?? null,
      areaId: target?.domainId ? null : joining,
    });
  }

  render();
}

/**
 * A feature let go. On another feature the two trade places; in its own
 * capability it stays where it was put; in another capability it is handed
 * over, to where it was dropped if that one is open and to the end of its list
 * if it is shut. Anywhere else there is nowhere for it to be — a feature is
 * always in a capability — and it goes back where it came from.
 */
function dropFeature(finished) {
  if (finished.swapWith) {
    actions.swapFeatures?.(finished.id, finished.swapWith);
    return;
  }
  const into = finished.over;
  const at = into ? positions.get(into) : null;
  if (!at) {
    render();
    return;
  }
  const laid = featureLayouts.get(finished.capabilityId)?.laid;
  const bubble = laid?.bubbles.find((one) => one.item.id === finished.id);
  // Where the pointer left it, measured from the middle of the capability it is going into.
  const home = positions.get(finished.capabilityId);
  const point = { x: home.x + finished.x - at.x, y: home.y + finished.y - at.y };
  const place = bubble && openCapabilities.has(into)
    ? geo.featurePlace(geo.capabilitySize(find('capability', into)), bubble, point)
    : null;
  if (into === finished.capabilityId) actions.placeFeature?.(finished.id, place);
  else actions.handFeature?.(finished.id, into, place);
}

function finishDraft(target) {
  const finished = draft;
  draft = null;
  actions.createConnector?.(
    { id: finished.fromId, kind: finished.fromKind, point: finished.fromPoint },
    { id: target.id, kind: target.kind ?? 'capability', point: Number(target.index) });
}

/** The areas whose line a point is inside, as ids — what a drag remembers of where it began. */
function areasAround(world) {
  return new Set(areaViews
    .filter(({ layout }) => layout.contains(world.x, world.y))
    .map(({ area }) => area.id));
}

/**
 * The area a shape in hand would join if it were let go at `world`, or null.
 *
 * A shape joins by being brought in: the drag has to start outside the line and
 * end inside it. So a shape that already sits inside a line it does not belong
 * to — caught between two members of a team — is not taken by that team for
 * being nudged, and one dropped on open ground stays what it was while its own
 * band stretches after it. The last area drawn is the one on top, as with blobs.
 */
function receivingArea(kind, record, world) {
  if (!record || isHidden(layerForKind('area'))) return null;
  // Still inside a domain as far as the record knows, a capability in hand is
  // on its way out of it, and lands loose.
  const free = kind === 'capability' ? !dropTarget : mayJoinArea(kind, record);
  if (!free) return null;

  const own = areaOf(kind, record)?.id ?? null;
  for (let i = areaViews.length - 1; i >= 0; i--) {
    const { area, layout } = areaViews[i];
    if (area.id === own || drag?.startedIn?.has(area.id)) continue;
    if (layout.contains(world.x, world.y)) return area.id;
  }
  return null;
}

/**
 * The domain under (x,y), and where in it the lobe would land.
 *
 * Two things overlap here: outlines, where blobs sit close enough to touch, and
 * catchments, which reach further still. Being inside an outline beats being
 * merely within reach of one, and among outlines the topmost wins — that is the
 * blob under the cursor, so the drop lands where it looks like it will.
 */
function findDropTarget(x, y) {
  let withinReach = null;

  // Back to front: the last domain drawn is the one on top.
  for (let i = store.domains.length - 1; i >= 0; i--) {
    const domain = store.domains[i];
    const children = childrenOf(domain.id).filter((c) => c.id !== drag?.id);
    const layout = geo.layoutDomain(domain, children, null, {});
    const localX = x - domain.x;
    const localY = y - domain.y;

    // The catchment reaches a little past the outline, so a lobe can be dropped
    // just off the edge. Drag well clear to take a capability out of a domain.
    // It grows out from the middle of the body, which the lobes pull off the
    // domain's own point.
    const { body } = layout;
    const inside = layout.contains(localX, localY);
    if (!inside && !layout.contains(
      body.x + (localX - body.x) / DROP_REACH,
      body.y + (localY - body.y) / DROP_REACH)) continue;

    // Dropped squarely on another capability? Trade places with it.
    const over = layout.slots.find((slot) =>
      Math.hypot((slot.x - localX) / slot.rx, (slot.y - localY) / slot.ry) <= 1);

    const target = {
      domainId: domain.id,
      lobeX: Math.round(localX),
      lobeY: Math.round(localY),
      swapWith: over?.item.id ?? null,
    };

    if (inside) return target;
    withinReach ??= target;
  }

  return withinReach;
}

export function cancelDraft() {
  if (!draft) return false;
  draft = null;
  render();
  return true;
}

// --- zoom & pan ------------------------------------------------------------

function onWheel(event) {
  event.preventDefault();
  const rect = svg.getBoundingClientRect();
  zoomAt(event.clientX - rect.left, event.clientY - rect.top, vp.wheelFactor(event.deltaY));
}

function zoomAt(screenX, screenY, factor) {
  stopGlide();
  view = vp.zoomAt(view, { x: screenX, y: screenY }, factor, zoomLimits);
  scheduleRender();
}

/** Whoever is looking has asked for less motion: a glide then arrives at once. */
const prefersStill = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

function stopGlide() {
  if (!gliding) return;
  cancelAnimationFrame(gliding);
  gliding = 0;
}

/**
 * Move the view to another, in one even motion rather than a jump: a deep zoom
 * that cut straight to its target would leave nobody knowing where on the map
 * they had landed. Every frame is a render, because what a zoom shows changes
 * on the way — lines unfold, capabilities open.
 */
function glideTo(target) {
  stopGlide();
  if (prefersStill()) {
    view = target;
    render();
    return;
  }
  const size = svg.getBoundingClientRect();
  const from = { ...view };
  const started = performance.now();
  const frame = (now) => {
    const t = Math.min(1, (now - started) / GLIDE_MS);
    view = vp.between(from, target, vp.eased(t), size);
    gliding = t < 1 ? requestAnimationFrame(frame) : 0;
    render();
  };
  gliding = requestAnimationFrame(frame);
}

/**
 * Close in on a shape: the double-click, and what showing a feature on the map
 * comes to. A domain is fitted to the stage, which is past where it is seen
 * whole, so its capabilities' own lines are drawn. A capability is brought to
 * where it can be taken in as one thing — and, where it holds features, at
 * least as close as it takes to read them, however small they are set. A
 * feature is shown by closing in on the capability it is in.
 */
export function glideInto(type, id) {
  const size = svg.getBoundingClientRect();

  if (type === 'feature') {
    const feature = find('feature', id);
    if (feature) glideInto('capability', feature.capabilityId);
    return;
  }
  if (type === 'domain') {
    const laid = domainViews.find(({ domain }) => domain.id === id);
    if (!laid) return;
    const { domain, layout } = laid;
    glideTo(vp.fitBox({
      minX: domain.x + layout.bounds.minX,
      minY: domain.y + layout.bounds.minY,
      maxX: domain.x + layout.bounds.maxX,
      maxY: domain.y + layout.bounds.maxY,
    }, size, { padding: 32, max: zoomLimits.max }));
    return;
  }
  if (type !== 'capability') return;

  const at = positions.get(id);
  if (!at) return;
  // Half the stage or so: close enough to read, with enough of what is round
  // it left in view to say where on the map this is.
  const taken = vp.fitBox(
    { minX: at.x - at.rx, minY: at.y - at.ry, maxX: at.x + at.rx, maxY: at.y + at.ry },
    size,
    { padding: Math.min(size.width, size.height) * 0.22, max: zoomLimits.max },
  );
  const box = { minX: at.x - at.rx, minY: at.y - at.ry, maxX: at.x + at.rx, maxY: at.y + at.ry };
  const whole = vp.fitBox(box, size, { padding: 16, max: zoomLimits.max });
  const k = zoom.zoomInto(featureLayouts.get(id)?.laid?.fontSize ?? 0, { taken: taken.k, whole: whole.k });
  glideTo(vp.centerOn({ k: vp.clampZoom(k, zoomLimits) }, at, size));
}

// --- a shape's picture, for a slide ----------------------------------------------

/** What the stage draws for the pointer and for the page's own state, which a picture of the map has no use for. */
const PICTURE_CHROME = '.title-hit, .snaps, .connector__hit, .connector__rim, .slot, '
  + '.area__hit, .area__title-hit, .area__rim, .domain__edge';
/** Picked, hovered, held, lit: how the page stands just now, not how the map is. */
const PICTURE_STATE = /(--(selected|hover|dragging|swap)|^team-(on|off))$/;

/** A drawn node as a picture has it: without the targets, and without the page's state on it. */
function asPictured(node) {
  for (const chrome of node.querySelectorAll(PICTURE_CHROME)) chrome.remove();
  for (const one of [node, ...node.querySelectorAll('[class]')]) {
    for (const name of [...one.classList]) if (PICTURE_STATE.test(name)) one.classList.remove(name);
  }
  return node;
}

/**
 * An area's, a domain's or a capability's picture, as a slide shows it: the
 * nodes to draw and the box of the map they are in.
 *
 * `shape` is the shape by itself, drawn afresh by the code that draws the map
 * and so exactly as the map draws it: an area with everything it holds, a
 * domain with its capabilities on it, a capability opened onto its features
 * whatever the zoom of the stage — a postcard of a capability is the one place
 * its features are always worth showing. `context` is the shape where it
 * sits: the stage as it stands, neighbours, lines and all, in a box that takes
 * in what is round the shape. Null for a shape that is not on the map.
 */
export function picture(kind, id, mode = 'shape') {
  let box;
  if (kind === 'area') {
    const laid = areaViews.find(({ area }) => area.id === id);
    if (!laid) return null;
    box = { ...laid.layout.bounds };
  } else if (kind === 'domain') {
    const laid = domainViews.find(({ domain }) => domain.id === id);
    if (!laid) return null;
    const { domain, layout } = laid;
    box = {
      minX: domain.x + layout.bounds.minX,
      minY: domain.y + layout.bounds.minY,
      maxX: domain.x + layout.bounds.maxX,
      maxY: domain.y + layout.bounds.maxY,
    };
  } else {
    const at = positions.get(id);
    if (kind !== 'capability' || !at) return null;
    box = { minX: at.x - at.rx, minY: at.y - at.ry, maxX: at.x + at.rx, maxY: at.y + at.ry };
  }
  const [wide, tall] = [box.maxX - box.minX, box.maxY - box.minY];
  const grown = (by) => ({ minX: box.minX - by, minY: box.minY - by, maxX: box.maxX + by, maxY: box.maxY + by });

  if (mode === 'context') {
    return {
      nodes: [...zOrder.stacks.children].map((layer) => asPictured(layer.cloneNode(true))),
      // Half the shape's own size again on every side: enough to see what it
      // sits among. An area is most of a map already, and a fifth is enough.
      box: grown(Math.max(wide, tall) * (kind === 'area' ? 0.2 : 0.5)),
    };
  }

  const nodes = [];
  const domainWith = (domainId) => {
    const view = domainViews.find(({ domain }) => domain.id === domainId);
    return view ? [renderDomain(view), ...childrenOf(domainId).map(renderCapability)] : [];
  };
  if (kind === 'area') {
    // The band, and on it what it holds: its domains with their capabilities,
    // then the touchpoints and loose capabilities, which stand over a domain
    // where they overlap one.
    const view = areaViews.find(({ area }) => area.id === id);
    const held = membersOf(id);
    nodes.push(
      renderArea(view),
      ...held.filter((member) => member.kind === 'domain').flatMap((member) => domainWith(member.record.id)),
      ...held.filter((member) => member.kind === 'capability').map((member) => renderCapability(member.record)),
      ...held.filter((member) => member.kind === 'touchpoint').map((member) => renderTouchpoint(member.record)),
    );
  } else if (kind === 'domain') {
    nodes.push(...domainWith(id));
  } else {
    const capability = find('capability', id);
    const laid = featureLayouts.get(id)?.laid ?? null;
    // Opened for the picture and shut again after it, if the stage has it shut.
    const wasOpen = openCapabilities.has(id);
    if (laid) openCapabilities.add(id);
    nodes.push(renderCapability(capability));
    if (laid) {
      const at = positions.get(id);
      const ink = labelInk(colorOf(capability.colorIndex), opacityOf(capability, 100));
      nodes.push(...laid.bubbles.map((bubble) => renderFeature({ ...bubble, x: at.x + bubble.x, y: at.y + bubble.y }, ink)));
    }
    if (!wasOpen) openCapabilities.delete(id);
  }
  return { nodes: nodes.filter(Boolean).map(asPictured), box: grown(Math.max(wide, tall) * 0.06) };
}

export function zoomBy(factor) {
  const rect = svg.getBoundingClientRect();
  zoomAt(rect.width / 2, rect.height / 2, factor);
}

function startPinch() {
  const [a, b] = [...pointers.values()];
  pinch = {
    distance: Math.hypot(a.x - b.x, a.y - b.y),
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  };
}

function updatePinch() {
  const [a, b] = [...pointers.values()];
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const rect = svg.getBoundingClientRect();

  view = vp.panBy(view, center.x - pinch.center.x, center.y - pinch.center.y);
  pinch.center = center;

  if (pinch.distance > 0) {
    zoomAt(center.x - rect.left, center.y - rect.top, distance / pinch.distance);
  }
  pinch.distance = distance;
  scheduleRender();
}

/** World-space bounds of everything on the map. */
export function contentBounds() {
  const { views, map, areas } = computeLayout();
  const boxes = [];

  // What is hidden is not on the map to be fitted to: Fit to screen fills the
  // stage with what can actually be seen.
  const shown = (type, record) => !isHidden(layerOf(type, record));

  for (const { domain, layout } of views) {
    if (!shown('domain', domain)) continue;
    boxes.push({
      minX: domain.x + layout.bounds.minX,
      minY: domain.y + layout.bounds.minY,
      maxX: domain.x + layout.bounds.maxX,
      maxY: domain.y + layout.bounds.maxY,
    });
  }
  // An empty area is on the map too, and a full one reaches past what it holds.
  for (const { area, layout } of areas) {
    if (shown('area', area)) boxes.push(layout.bounds);
  }
  for (const type of ['capability', 'touchpoint', 'actor']) {
    for (const record of (type === 'capability' ? store.capabilities : stackedList(type))) {
      const position = map.get(record.id);
      if (!position || !shown(type, record)) continue;
      boxes.push({
        minX: position.x - position.rx,
        minY: position.y - position.ry,
        maxX: position.x + position.rx,
        maxY: position.y + position.ry,
      });
    }
  }
  // People stand outside the shapes they are hung on, and a card that was put
  // somewhere may stand well away from all of them: Fit to screen has to hold
  // the cards too, or the ones round the edge of the map are cut off by the
  // stage.
  for (const placed of badgePlaces(views, areas, map).values()) {
    for (const { pill } of placed) {
      boxes.push({ minX: pill.x, minY: pill.y, maxX: pill.x + pill.width, maxY: pill.y + pill.height });
    }
  }
  return vp.unionBox(boxes) ?? { minX: -400, minY: -300, maxX: 400, maxY: 300 };
}

export function fitToScreen() {
  stopGlide();
  const rect = svg.getBoundingClientRect();
  view = vp.fitBox(contentBounds(), rect, { padding: 32 });
  render();
}

/** The same view, arrived at in one motion: the way back out to the helicopter view. */
export function glideToFit() {
  glideTo(vp.fitBox(contentBounds(), svg.getBoundingClientRect(), { padding: 32 }));
}

/**
 * Bring a shape into view without changing the zoom level. A feature is the
 * exception: it is only drawn once its capability is open, so showing one
 * means closing in.
 */
export function centerOn(type, id) {
  if (type === 'feature') {
    glideInto('feature', id);
    return;
  }
  stopGlide();
  const rect = svg.getBoundingClientRect();
  let point = null;

  if (type === 'capability' || type === 'touchpoint' || type === 'actor') {
    point = positions.get(id) ?? null;
  } else if (type === 'domain') {
    const domain = find('domain', id);
    if (domain) point = { x: domain.x, y: domain.y };
  } else if (type === 'area') {
    point = areaViews.find(({ area }) => area.id === id)?.layout.centre ?? null;
  } else if (type === 'connector') {
    const connector = find('connector', id);
    const points = connector && (resolvedPoints(connector) ?? connector);
    const from = points && endpointOf(connector.fromId, points.fromPoint);
    const to = points && endpointOf(connector.toId, points.toPoint);
    if (from && to) point = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  }
  if (!point) return;

  view = vp.centerOn(view, point, rect);
  render();
}

/** Where the kebab sits on screen, so a menu can be hung off it. */
export function kebabAnchor(domainId) {
  const view_ = domainViews.find(({ domain }) => domain.id === domainId);
  if (!view_) return null;
  const rect = svg.getBoundingClientRect();
  const { domain, layout } = view_;
  const at = vp.worldToScreen(view, {
    x: domain.x + layout.kebab.x,
    y: domain.y + layout.kebab.y + layout.kebab.r * 1.8,
  });
  return { x: rect.left + at.x, y: rect.top + at.y };
}

/** Where a new shape should land: the middle of what the user is looking at. */
export function viewportCenter() {
  return vp.viewportCenter(view, svg.getBoundingClientRect());
}
