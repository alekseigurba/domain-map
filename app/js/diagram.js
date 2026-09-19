// The stage: renders the terrain from the store and turns pointer gestures into
// intents. It never talks to the API itself — it calls back into `actions`.

import {
  store, select, childrenOf, stackingOrder, stackedList, patchLocal, find, connectorScope,
  connectorEnds, oneLine, layerStack, layerOf, connectorLayer, isHidden,
} from './store.js';
import * as geo from './geometry.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const SNAP_RADIUS = 3.6;
const SNAP_HIT_RADIUS = 11;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 4;
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
let view = { k: 1, x: 0, y: 0 };
/** View mode by default: shapes can be picked and inspected, not moved. */
let editMode = false;
let drag = null;
let draft = null;
let dropTarget = null;      // {domainId, lobe, index} while a capability hovers a domain
let hoveredDomainId = null; // purely visual: the domain under the cursor
let hoveredConnectorId = null; // the line under the cursor, which names itself while it is
/** The kebab's state machine: idle → editing → (save | cancel) → idle. */
let editing = null;         // {domainId, activeLobe} while a domain is being edited
let renaming = null;        // {domainId, original, node, input} while a title is edited
let lastPress = null;       // {type, id, time, x, y} — the other half of a double-click
let positions = new Map();
let domainViews = [];
const pointers = new Map();
let pinch = null;

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
/** The one ink a capability's title and icon are ever drawn in. */
const CAPABILITY_INK = '#000';
const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#fffdfa';
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
    if (hoveredDomainId === null && hoveredConnectorId === null) return;
    hoveredDomainId = null;
    hoveredConnectorId = null;
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
  }
  render();
}

/** Where every capability sits right now, including the one under the cursor. */
function computeLayout() {
  const map = new Map();
  const views = [];

  for (const domain of store.domains) {
    let children = childrenOf(domain.id);
    let moving = null;

    // A capability being dragged out of this domain leaves it; one being moved
    // inside it keeps its place in the list and just follows the cursor.
    if (drag?.kind === 'capability' && children.some((c) => c.id === drag.id)) {
      if (dropTarget?.domainId === domain.id) {
        moving = { id: drag.id, lobeX: dropTarget.lobeX, lobeY: dropTarget.lobeY };
      } else {
        children = children.filter((c) => c.id !== drag.id);
      }
    }
    if (drag?.kind === 'title' && drag.id === domain.id) {
      moving = { id: 'title', titleX: drag.titleX, titleY: drag.titleY };
    }

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

  return { views, map };
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

  const { views, map } = computeLayout();
  positions = map;
  domainViews = views;

  renderView();

  zOrder.stacks.replaceChildren(...layerStack().map((layer) => renderLayer(layer, views)));
  zOrder.edit.replaceChildren(
    ...views.flatMap(renderLobeHandles),
    ...views.flatMap(renderTitleWidth),
    ...renderConnectorEnds(),
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
    el('g', { class: 'stack stack--domains' }, has('domain') ? views.map(renderDomain) : []),
    // Paint order is the stack, so a shape sent to the back lands at the back.
    el('g', { class: 'stack stack--capabilities' },
      has('capability') ? stackingOrder().map(renderCapability) : []),
    el('g', { class: 'stack stack--touchpoints' },
      has('touchpoint') ? stackedList('touchpoint').map(renderTouchpoint) : []),
    el('g', { class: 'stack stack--actors' },
      has('actor') ? stackedList('actor').map(renderActor) : []),
    el('g', { class: 'stack stack--connectors' },
      store.connectors
        .filter((connector) => connectorLayer(connector) === layer.key)
        .map(renderConnector)
        .filter(Boolean)),
  );
  return group;
}

function renderDomain({ domain, layout }) {
  const selected = store.selection.type === 'domain' && store.selection.id === domain.id;
  const hovered = hoveredDomainId === domain.id;
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
  if (!connector) return [];
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

// --- renaming, on the shape itself -------------------------------------------

export function isRenaming(domainId) {
  return renaming?.domainId === domainId;
}

/**
 * Edit a domain's title where it sits. The editor lives in a layer render()
 * never replaces, so the reflow it causes cannot pull it out from under the
 * caret; every render just moves it back over the title.
 */
export function startRename(domainId) {
  const domain = find('domain', domainId);
  if (!domain) return;
  cancelRename();

  const holder = el('foreignObject', { class: 'title-editor' });
  const input = document.createElement('textarea');
  input.className = 'title-editor__input';
  input.value = domain.title;
  input.spellcheck = false;
  input.id = 'domain-title-editor';
  input.name = 'domain-title-editor';
  input.setAttribute('aria-label', 'Domain title');
  holder.appendChild(input);
  zOrder.overlay.appendChild(holder);
  renaming = { domainId, original: domain.title, node: holder, input };

  input.addEventListener('input', () => {
    patchLocal('domain', domainId, { title: input.value });
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
  patchLocal('domain', closed.domainId, { title: closed.original });
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
  const { domainId, original } = closeRename();

  // Trailing blanks are an accident of pressing Ctrl-Enter one time too many.
  const title = typed.replace(/[ \t]+$/gm, '').replace(/\n+$/, '').trim();
  if (!title || title === original) {
    render();
    return;
  }
  actions.renameDomain?.(domainId, title);
}

/** Keep the editor over the title it is editing, as the shape reflows. */
function positionRenameEditor() {
  if (!renaming) return;
  const view = domainViews.find(({ domain }) => domain.id === renaming.domainId);
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

function renderCapability(capability) {
  const position = positions.get(capability.id);
  const size = geo.capabilitySize(capability);
  const selected = store.selection.type === 'capability' && store.selection.id === capability.id;
  const dragging = drag?.kind === 'capability' && drag.id === capability.id;

  const swapping = dropTarget?.swapWith === capability.id;
  const group = el('g', {
    class: `cap${selected ? ' cap--selected' : ''}${dragging ? ' cap--dragging' : ''}`
      + `${swapping ? ' cap--swap' : ''}`,
    'data-type': 'capability',
    'data-id': capability.id,
    transform: `translate(${position.x} ${position.y})`,
  });

  const fill = colorOf(capability.colorIndex);
  // Capability titles are always black here. The palette is a light one, and a
  // label that flips to white on the darker swatches reads as a different kind
  // of thing rather than the same label on another colour.
  const ink = CAPABILITY_INK;
  group.appendChild(el('ellipse', {
    class: 'cap__oval',
    rx: size.rx,
    ry: size.ry,
    fill,
    'fill-opacity': opacityOf(capability, 100),
  }));

  if (capability.icon && size.iconSize > 0) {
    // An <image> is its own little document, so the icon cannot inherit the ink
    // the way the text does. It is flattened to that ink instead, which here is
    // the same black the title is drawn in.
    group.appendChild(el('image', {
      class: 'cap__icon',
      href: actions.iconUrl(capability.icon),
      x: -size.iconSize / 2,
      y: size.iconY - size.iconSize / 2,
      width: size.iconSize,
      height: size.iconSize,
      preserveAspectRatio: 'xMidYMid meet',
    }));
  }

  group.appendChild(textNode('cap__text', size, 0, size.textY, ink));
  const snaps = renderSnaps(capability.id, 'capability', size);
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

  for (const point of geo.snapPoints(size)) {
    const isActive = draft && draft.fromId === id && draft.fromPoint === point.index;
    const snap = el('g', {
      class: 'snap-point',
      'data-type': 'snap',
      'data-id': id,
      'data-kind': kind,
      'data-index': point.index,
    });
    snap.appendChild(el('circle', { class: 'snap-hit', cx: point.x, cy: point.y, r: SNAP_HIT_RADIUS }));
    snap.appendChild(el('circle', {
      class: `snap${isActive ? ' snap--active' : ''}`,
      cx: point.x,
      cy: point.y,
      r: SNAP_RADIUS,
    }));
    snaps.appendChild(snap);
  }
  return snaps;
}

/** A touchpoint: a rounded rectangle with its label inside, and an icon above it. */
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

  if (touchpoint.icon && size.iconSize > 0) {
    group.appendChild(el('image', {
      class: 'cap__icon',
      href: actions.iconUrl(touchpoint.icon),
      x: -size.iconSize / 2,
      y: size.iconY - size.iconSize / 2,
      width: size.iconSize,
      height: size.iconSize,
      preserveAspectRatio: 'xMidYMid meet',
    }));
  }

  group.appendChild(textNode('cap__text', size, 0, size.textY, CAPABILITY_INK));
  const snaps = renderSnaps(touchpoint.id, 'touchpoint', size);
  if (snaps) group.appendChild(snaps);

  return group;
}

/**
 * An actor: a figure in a see-through circle with a rim, its name under the
 * figure. The circle is the shape a line attaches to, which is why the rim is
 * drawn rather than implied — it is the edge the snap points sit on.
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
  const scale = size.figureSize / 24;
  const figure = el('g', {
    class: 'actor__figure',
    transform: `translate(${-size.figureSize / 2} ${size.figureY - size.figureSize / 2})`
      + ` scale(${scale})`,
  });
  figure.appendChild(el('circle', { cx: 12, cy: 9, r: 4 }));
  figure.appendChild(el('path', { d: 'M4.5 20.5c1.4-3.6 4.2-5.5 7.5-5.5s6.1 1.9 7.5 5.5' }));
  group.appendChild(figure);

  group.appendChild(textNode('cap__text', size, 0, size.textY, CAPABILITY_INK));
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
  const bendPoints = connector.lineStyle === 'curved'
    ? (stored.length ? stored : geo.autoBendPoints(from, to, fromNormal, toNormal))
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
 * The line under the pointer says what it joins: a chip at its middle, lifted
 * clear of the line itself. It is read off the path that was just drawn, so a
 * curve with bends in it is named at its true midpoint rather than halfway
 * between its ends. Counter-scaled by the zoom, because a name is chrome and
 * chrome stays the size it was written at.
 */
function renderConnectorLabel() {
  if (!hoveredConnectorId) return [];
  const connector = find('connector', hoveredConnectorId);
  const path = connector
    && zOrder.stacks.querySelector(`.connector-group[data-id="${connector.id}"] .connector`);
  if (!path) return [];

  const at = path.getPointAtLength(path.getTotalLength() / 2);
  // A row for each end, from over to, each cut to fit on its own.
  const rows = connectorEnds(connector)
    .map((title) => geo.wrapLines(oneLine(title), LABEL_SIZE, LABEL_MAX, 1, 'bold')[0]);
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
    class: 'connector-label__text',
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
function elementAt(x, y) {
  for (const kind of ['actor', 'touchpoint', 'capability']) {
    const list = kind === 'capability' ? store.capabilities : stackedList(kind);
    for (let i = list.length - 1; i >= 0; i--) {
      const record = list[i];
      const at = positions.get(record.id);
      if (!at || isHidden(layerOf(kind, record))) continue;
      if (Math.hypot((x - at.x) / at.rx, (y - at.y) / at.ry) <= 1.25) {
        return { id: record.id, kind };
      }
    }
  }
  return null;
}

const text = (value) => document.createTextNode(value ?? '');

// --- pointer handling ------------------------------------------------------

function toWorld(event) {
  const rect = svg.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left - view.x) / view.k,
    y: (event.clientY - rect.top - view.y) / view.k,
  };
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

function onPointerDown(event) {
  // The in-place editor is HTML sitting inside the SVG: its clicks are its own.
  if (renaming?.node.contains(event.target)) return;

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
    if (!editMode) { render(); return; }
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

  if (target?.type === 'kebab') {
    select('domain', target.id);
    if (!editMode) { render(); return; }
    actions.openKebab?.(target.id);
    return;
  }

  if (target?.type === 'add-capability') {
    // The seat pressed is the seat the capability lands in.
    actions.addCapabilityToDomain?.(target.id, Number(target.lobe ?? 0));
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
    if (!editMode) { render(); return; }
    drag = {
      kind: 'capability',
      id: target.id,
      pointerId: event.pointerId,
      world,
      origin: { ...positions.get(target.id) },
      originDomainId: capability.domainId,
      size: geo.capabilitySize(capability),
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'touchpoint' || target?.type === 'actor') {
    const record = find(target.type, target.id);
    select(target.type, target.id);
    if (!editMode) { render(); return; }
    // Neither kind belongs to a domain, so there is no drop target to look for:
    // it simply goes where it is put.
    drag = {
      kind: 'element',
      elementKind: target.type,
      id: target.id,
      pointerId: event.pointerId,
      world,
      origin: { x: record.x, y: record.y },
      moved: false,
    };
    render();
    return;
  }

  if (target?.type === 'domain') {
    const domain = find('domain', target.id);
    select('domain', target.id);
    if (!editMode) { render(); return; }
    drag = {
      kind: 'domain',
      id: target.id,
      pointerId: event.pointerId,
      world,
      origin: { x: domain.x, y: domain.y },
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
  if ((drag || draft) && hoveredConnectorId !== null) {
    hoveredConnectorId = null;
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
    // Nothing in hand: track which domain is in focus, so its "+" can appear,
    // and which line is under the pointer, so it can say what it joins.
    const id = domainAt(toWorld(event));
    const target = targetOf(event);
    const lineId = target?.type === 'connector' ? target.id : null;
    if (id !== hoveredDomainId || lineId !== hoveredConnectorId) {
      hoveredDomainId = id;
      hoveredConnectorId = lineId;
      scheduleRender();
    }
    return;
  }

  if (drag.pointerId !== event.pointerId) return;

  if (drag.kind === 'pan') {
    view.x = drag.origin.x + (event.clientX - drag.screen.x);
    view.y = drag.origin.y + (event.clientY - drag.screen.y);
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
    scheduleRender();
    return;
  }

  if (drag.kind === 'element') {
    patchLocal(drag.elementKind, drag.id, { x: drag.origin.x + dx, y: drag.origin.y + dy });
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

  // capability: follow the cursor, and look for a domain underneath
  const x = drag.origin.x + dx;
  const y = drag.origin.y + dy;
  patchLocal('capability', drag.id, { x, y });
  dropTarget = findDropTarget(x, y);
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
  drag = null;
  dropTarget = null;

  if (!finished.moved) {
    render();
    return;
  }

  if (finished.kind === 'domain') {
    const domain = find('domain', finished.id);
    actions.moveDomain?.(finished.id, domain.x, domain.y);
  } else if (finished.kind === 'element') {
    const record = find(finished.elementKind, finished.id);
    actions.moveElement?.(finished.elementKind, finished.id, record.x, record.y);
  } else if (finished.kind === 'title') {
    actions.moveTitle?.(finished.id, Math.round(finished.titleX), Math.round(finished.titleY));
  } else if (finished.kind === 'connector-end') {
    // Placed by hand, so the line stops re-attaching itself from now on.
    if (finished.pointIndex !== null) {
      actions.moveConnectorEnd?.(
        finished.id, finished.end, finished.pointIndex, finished.targetId, finished.targetKind);
    }
  } else if (finished.kind === 'bend') {
    actions.shapeConnector?.(finished.id, bendFlat(finished.points));
  } else if (finished.kind === 'title-width') {
    actions.setTitleWidth?.(finished.id, finished.width);
  } else if (finished.kind === 'capability') {
    const capability = find('capability', finished.id);
    actions.dropCapability?.(finished.id, {
      domainId: target?.domainId ?? null,
      lobeX: target?.lobeX ?? 0,
      lobeY: target?.lobeY ?? 0,
      swapWith: target?.swapWith ?? null,
      x: capability.x,
      y: capability.y,
      cameFromDomainId: finished.originDomainId ?? null,
    });
  }

  render();
}

function finishDraft(target) {
  const finished = draft;
  draft = null;
  actions.createConnector?.(
    { id: finished.fromId, kind: finished.fromKind, point: finished.fromPoint },
    { id: target.id, kind: target.kind ?? 'capability', point: Number(target.index) });
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
  zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0016));
}

function zoomAt(screenX, screenY, factor) {
  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.k * factor));
  const applied = k / view.k;
  view.x = screenX - (screenX - view.x) * applied;
  view.y = screenY - (screenY - view.y) * applied;
  view.k = k;
  scheduleRender();
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

  view.x += center.x - pinch.center.x;
  view.y += center.y - pinch.center.y;
  pinch.center = center;

  if (pinch.distance > 0) {
    zoomAt(center.x - rect.left, center.y - rect.top, distance / pinch.distance);
  }
  pinch.distance = distance;
  scheduleRender();
}

/** World-space bounds of everything on the map. */
export function contentBounds() {
  const { views, map } = computeLayout();
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
  if (boxes.length === 0) return { minX: -400, minY: -300, maxX: 400, maxY: 300 };

  return boxes.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

export function fitToScreen() {
  const rect = svg.getBoundingClientRect();
  const bounds = contentBounds();
  const padding = 32;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);

  const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
    Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height)));

  view.k = k;
  view.x = rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * k;
  view.y = rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * k;
  render();
}

/** Bring a shape into view without changing the zoom level. */
export function centerOn(type, id) {
  const rect = svg.getBoundingClientRect();
  let point = null;

  if (type === 'capability' || type === 'touchpoint' || type === 'actor') {
    point = positions.get(id) ?? null;
  } else if (type === 'domain') {
    const domain = find('domain', id);
    if (domain) point = { x: domain.x, y: domain.y };
  } else if (type === 'connector') {
    const connector = find('connector', id);
    const points = connector && (resolvedPoints(connector) ?? connector);
    const from = points && endpointOf(connector.fromId, points.fromPoint);
    const to = points && endpointOf(connector.toId, points.toPoint);
    if (from && to) point = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  }
  if (!point) return;

  view.x = rect.width / 2 - point.x * view.k;
  view.y = rect.height / 2 - point.y * view.k;
  render();
}

/** Where the kebab sits on screen, so a menu can be hung off it. */
export function kebabAnchor(domainId) {
  const view_ = domainViews.find(({ domain }) => domain.id === domainId);
  if (!view_) return null;
  const rect = svg.getBoundingClientRect();
  const { domain, layout } = view_;
  return {
    x: rect.left + view.x + (domain.x + layout.kebab.x) * view.k,
    y: rect.top + view.y + (domain.y + layout.kebab.y + layout.kebab.r * 1.8) * view.k,
  };
}

/** Where a new shape should land: the middle of what the user is looking at. */
export function viewportCenter() {
  const rect = svg.getBoundingClientRect();
  return {
    x: (rect.width / 2 - view.x) / view.k,
    y: (rect.height / 2 - view.y) / view.k,
  };
}
