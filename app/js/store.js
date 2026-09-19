// Single source of truth. Menu, details and diagram all read from here, so a
// selection made in one place is the selection everywhere.
//
// It is also where the map is changed. There is no database and no API behind
// this: a change is a change to the arrays below, and the file on disk is
// written from them afterwards.

import * as rules from './rules.js';

const listeners = new Set();

export const store = {
  title: '',
  /** The map's own colours, or empty for the ones in the stylesheet. */
  palette: [],
  /** The stack, bottom first. The first is the base layer; see rules.LAYER_DEFAULTS. */
  layers: [],
  /** The Type choices on offer, one list per kind of element. */
  types: {},
  domains: [],
  capabilities: [],
  touchpoints: [],
  actors: [],
  connectors: [],
  /** @type {{type: 'domain'|'capability'|'touchpoint'|'actor'|'connector'|null, id: string|null}} */
  selection: { type: null, id: null },
};

/** Where each kind of element is kept. The one place that knows. */
const LISTS = {
  domain: 'domains',
  capability: 'capabilities',
  touchpoint: 'touchpoints',
  actor: 'actors',
  connector: 'connectors',
};

/** Every record of one kind, in the order the map holds them. */
export const listOf = (type) => store[LISTS[type]] ?? [];

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emit(reason = 'change') {
  for (const listener of listeners) listener(reason);
}

/** Everything at once, as read from a document. */
export function setMap(state) {
  store.title = state.title;
  store.palette = state.palette ?? [];
  store.layers = state.layers?.length
    ? state.layers
    : rules.LAYERS.map((layer) => ({ key: layer.key, hidden: false, dimmed: false }));
  store.types = state.types ?? {};
  store.domains = state.domains;
  store.capabilities = state.capabilities;
  store.touchpoints = state.touchpoints ?? [];
  store.actors = state.actors ?? [];
  store.connectors = state.connectors;

  // A layer the tab was told to hide is the tab's business, and a map that has
  // just been opened is a different map — what it opens at is what it says.
  session.clear();
  dropLostSelection();
  emit('map');
}

export function select(type, id, reason = 'selection') {
  if (store.selection.type === type && store.selection.id === id) return;
  store.selection = { type: type ?? null, id: id ?? null };
  emit(reason);
}

export function find(type, id) {
  if (!id || !LISTS[type]) return null;
  return listOf(type).find((record) => record.id === id) ?? null;
}

export function selected() {
  return find(store.selection.type, store.selection.id);
}

/** Back to front within a stack, with the id breaking ties so it never wobbles. */
const byStack = (a, b) => a.sortIndex - b.sortIndex || a.id.localeCompare(b.id);

/** Capabilities inside a domain, in slot order. */
export function childrenOf(domainId) {
  return store.capabilities.filter((c) => c.domainId === domainId).sort(byStack);
}

/** Capabilities that live on the map on their own. */
export function orphans() {
  return store.capabilities.filter((c) => !c.domainId).sort(byStack);
}

/**
 * Every capability in the order the map is painted: domain by domain, and back
 * to front inside each one. The diagram used to draw them in whatever order the
 * array happened to hold, so restacking a shape moved it in the menu and
 * nowhere else. A capability whose domain has gone is painted last, along with
 * the loose ones, rather than being dropped.
 */
export function stackingOrder() {
  const rank = new Map(store.domains.map((domain, index) => [domain.id, index]));
  const of = (capability) => rank.get(capability.domainId) ?? rank.size;
  return [...store.capabilities].sort((a, b) => of(a) - of(b) || byStack(a, b));
}

export function capabilityById(id) {
  return store.capabilities.find((c) => c.id === id) ?? null;
}

/** Touchpoints and actors have no domain to be stacked inside, only each other. */
export const stackedList = (type) => [...listOf(type)].sort(byStack);

// --- layers ------------------------------------------------------------------

/**
 * What this tab has been told to hide or dim, over what the map says. The layer
 * control writes here while browsing, so reading a map never changes it; in
 * Edit mode it writes the document instead, and this stays empty.
 *
 * @type {Map<string, {hidden?: boolean, dimmed?: boolean}>}
 */
const session = new Map();

/** The layer everything on the base of the stack is on. */
export const baseLayer = () => store.layers[0] ?? null;

export const isBaseLayer = (key) => key === rules.BASE_LAYER;

export const layerByKey = (key) => store.layers.find((layer) => layer.key === key) ?? null;

/** What a layer is called. The titles are the model's, not the file's. */
export const layerTitle = (key) =>
  rules.LAYERS.find((layer) => layer.key === key)?.title ?? key;

/**
 * A layer as it is being shown right now: what the document saved, with this
 * tab's own override on top. The base layer is never hidden, whatever either
 * of them says.
 */
export function layerState(key) {
  const layer = layerByKey(key);
  if (!layer) return { hidden: false, dimmed: false };
  const mine = session.get(key) ?? {};
  return {
    hidden: !isBaseLayer(key) && (mine.hidden ?? layer.hidden === true),
    dimmed: mine.dimmed ?? layer.dimmed === true,
  };
}

/** The stack as the diagram paints it, bottom first, with each one's state. */
export const layerStack = () =>
  rules.LAYERS.map((layer) => ({
    key: layer.key,
    title: layer.title,
    base: isBaseLayer(layer.key),
    kinds: rules.KINDS_ON[layer.key] ?? [],
    ...layerState(layer.key),
  }));

export const isHidden = (key) => layerState(key).hidden;

/**
 * Hide, show or dim a layer for this tab alone. `saved` writes the document
 * instead, which is what an owner in Edit mode is doing: the map then opens
 * that way for everyone it is published to.
 */
export function setLayerState(key, changes, { saved = false } = {}) {
  const layer = layerByKey(key);
  if (!layer) return null;

  // Nothing is under the base layer, so hiding it would leave an empty map.
  const wanted = { ...changes };
  if (isBaseLayer(key)) delete wanted.hidden;

  if (saved) {
    session.delete(key);
    Object.assign(layer, wanted);
  } else {
    session.set(key, { ...session.get(key), ...wanted });
  }
  emit(saved ? 'data' : 'layers');
  return layer;
}

/** Forget every override, so the map shows what it was saved showing. */
export function resetLayerState() {
  if (session.size === 0) return;
  session.clear();
  emit('layers');
}

export const layersOverridden = () => session.size > 0;

// --- the selected layer ------------------------------------------------------

/**
 * The layer new shapes are added to. An Edit-mode idea only: browsing, there is
 * nothing to add, so nothing is selected. Never saved — it says what you are
 * working on, not anything about the map.
 */
let selectedLayer = null;

export const selectedLayerKey = () => selectedLayer;

export const kindsAddableTo = (key) => rules.KINDS_ON[key] ?? [];

/** The layer a kind of element lives on. Its kind decides; nothing else can. */
export const layerForKind = (kind) => rules.LAYER_OF[kind] ?? rules.BASE_LAYER;

/**
 * Work on a layer. Selecting a hidden one shows it: adding a shape to a layer
 * you cannot see would drop it into nowhere. Null selects nothing, which is
 * what leaving Edit mode does.
 */
export function selectLayer(key, { saved = false } = {}) {
  if (key !== null && !layerByKey(key)) return null;
  selectedLayer = key;
  if (key !== null && isHidden(key)) setLayerState(key, { hidden: false }, { saved });
  emit('layers');
  return selectedLayer;
}

/** Where a record sits: its kind says so, and for a line, its upper end does. */
export function layerOf(type, record) {
  if (type === 'connector') return record ? connectorLayer(record) : rules.BASE_LAYER;
  return layerForKind(type);
}

/** How high up the stack a layer sits. An unknown one is treated as the base. */
export const layerDepth = (key) => {
  const at = rules.LAYERS.findIndex((layer) => layer.key === key);
  return at < 0 ? 0 : at;
};

/**
 * A line belongs to the layer of its upper end, so hiding that layer takes the
 * line with it — no line is ever left running to something that is gone.
 */
export const connectorLayer = (connector) => layerForKind(connector.fromKind);

/** Everything on a layer, kind by kind, in the order each kind is held. */
export function onLayer(key) {
  const mine = (type) => (layerForKind(type) === key ? listOf(type) : []);
  return {
    domains: mine('domain'),
    capabilities: mine('capability'),
    touchpoints: mine('touchpoint'),
    actors: mine('actor'),
    connectors: store.connectors.filter((connector) => connectorLayer(connector) === key),
  };
}

/** Whether what is selected is on a layer that is being shown at all. */
export const isVisible = (type, record) =>
  !!record && !isHidden(layerOf(type, record));

// --- Type choices ------------------------------------------------------------

/** The choices one kind of element may be typed with, in the order they were added. */
export const typesFor = (kind) => store.types[kind] ?? [];

/** How many elements of a kind carry a Type — what refuses to delete it. */
export const typeUsage = (kind, choice) =>
  listOf(kind).filter((record) => record.type === choice).length;

/** Add a choice to a kind's list. A repeat is not an error; it is already there. */
export function addTypeChoice(kind, choice) {
  const wanted = choice?.trim();
  if (!wanted || !rules.ELEMENT_KINDS.includes(kind)) return null;
  const choices = typesFor(kind);
  if (choices.includes(wanted)) return wanted;

  store.types = { ...store.types, [kind]: [...choices, wanted] };
  emit('data');
  return wanted;
}

/**
 * Take a choice off a kind's list. A choice something is typed with stays:
 * the caller is told how many hold it, and nothing is cleared behind an
 * author's back.
 */
export function removeTypeChoice(kind, choice) {
  const used = typeUsage(kind, choice);
  if (used > 0) return { removed: false, used };

  store.types = { ...store.types, [kind]: typesFor(kind).filter((one) => one !== choice) };
  emit('data');
  return { removed: true, used: 0 };
}

/** Put a kind's whole list back, ids and all — what undo does to a Type change. */
export function setTypeChoices(kind, choices) {
  store.types = { ...store.types, [kind]: [...(choices ?? [])] };
  emit('data');
  return store.types[kind];
}

/** A selection that was cascade-deleted is no selection at all. */
function dropLostSelection() {
  if (store.selection.id && !find(store.selection.type, store.selection.id)) {
    store.selection = { type: null, id: null };
  }
}

// --- connector scope ---------------------------------------------------------

/**
 * A line that stays inside one domain is internal plumbing; one that crosses a
 * domain boundary is a public event. Derived from the endpoints, so it is right
 * the moment a capability is dragged across a border.
 */
export function scopeOf(connector) {
  const [from, to] = endpointsOf(connector);
  if (!from || !to) return 'public';
  // Only a capability has a domain to stay inside; a line touching a touchpoint
  // or an actor has left one by definition.
  if (connector.fromKind !== 'capability' || connector.toKind !== 'capability') return 'public';
  return from.domainId && from.domainId === to.domainId ? 'internal' : 'public';
}

/** The two records a line joins, from end first — whatever kinds they are. */
export const endpointsOf = (connector) => [
  find(connector.fromKind, connector.fromId),
  find(connector.toKind, connector.toId),
];

/** The titles of the two elements a line joins, from end first. */
export function connectorEnds(connector) {
  const [from, to] = endpointsOf(connector);
  return [from?.title ?? '?', to?.title ?? '?'];
}

/**
 * Where a line lands, as the element itself. The menu shows a line under the
 * end it starts from, so this far end is the only half of the label worth
 * printing — and its colour is what says which shape it is.
 */
export const connectorTarget = (connector) => find(connector.toKind, connector.toId);

/** What a line is called, in the menu and the details alike. */
export function connectorLabel(connector) {
  // A connection has two ends, not a direction — so a dash, not an arrow.
  return connectorEnds(connector).join(' – ');
}

/**
 * A title on one line, for anywhere but the shape: each break typed into it
 * becomes a single space, whether or not a space already sat beside it.
 */
export function oneLine(text) {
  return (text ?? '').replace(/\s*\n\s*/g, ' ');
}

/**
 * `text` with the line breaks `from` has, after the same words: a break after
 * the second word of `from` goes after the second word of `text`. A one-line
 * edit of a title keeps the rows it was laid out in.
 */
export function withBreaks(text, from) {
  const after = new Set();
  let words = 0;
  for (const row of (from ?? '').split('\n').slice(0, -1)) {
    words += row.split(/\s+/).filter(Boolean).length;
    after.add(words);
  }
  let gap = 0;
  return text.replace(/(?<=\S)\s+(?=\S)/g, (space) => (after.has(++gap) ? '\n' : space));
}

/**
 * The lines one element starts. A line is owned by its upper end, so an actor's
 * line to a touchpoint is the actor's — it is a User interaction, and never
 * also a Touchpoint connector. Between two capabilities there is no upper end
 * and the line falls to the one it was drawn from, which is the same rule seen
 * from the only angle left.
 *
 * This is what the menu files a line by: every line hangs under the element
 * this returns it for, and under no other.
 */
export const ownedBy = (kind, id) =>
  store.connectors.filter((connector) =>
    connector.fromKind === kind && connector.fromId === id);

/** What a line is: which section of the menu files it, and what to call it. */
export function connectorScope(connector) {
  if (connector.fromKind === 'actor') return 'interaction';
  if (connector.fromKind === 'touchpoint') return 'touchpoint';
  return scopeOf(connector);
}

/**
 * What a line is called in the details panel. The two capability lines are the
 * same line differing only in where the far end lands, so they are named as a
 * pair and the distinction carries itself.
 */
export const CONNECTOR_NAMES = {
  interaction: 'User interaction',
  touchpoint: 'Touchpoint connector',
  internal: 'Internal domain connector',
  public: 'Cross-domain connector',
};

// --- human-readable links ----------------------------------------------------

/** "Payment authorization" -> "payment-authorization". Never empty. */
export function slugify(text) {
  const slug = (text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip the accents NFKD just split off
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return slug || 'untitled';
}

function labelOf(type, record) {
  if (type !== 'connector') return record.title;
  const [from, to] = endpointsOf(record);
  return `${from?.title ?? 'unknown'} ${to?.title ?? 'unknown'}`;
}

/**
 * Slugs for one kind of record, in the order the map holds them. Two shapes
 * can share a title, so repeats get a numeric suffix — stable as long as the
 * earlier one keeps its name.
 */
function slugIndex(type) {
  const seen = new Map();
  const byId = new Map();
  const bySlug = new Map();

  for (const record of listOf(type)) {
    const base = slugify(labelOf(type, record));
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    const slug = count === 1 ? base : `${base}-${count}`;
    byId.set(record.id, slug);
    bySlug.set(slug, record.id);
  }
  return { byId, bySlug };
}

/** The slug that stands in for an id in the URL. */
export function slugFor(type, id) {
  if (!type || !id) return null;
  return slugIndex(type).byId.get(id) ?? null;
}

/** The record a permalink points at, or null if the title has moved on. */
export function findBySlug(type, slug) {
  if (!type || !slug) return null;
  return find(type, slugIndex(type).bySlug.get(slug) ?? null);
}

/** Local, silent patch so dragging feels immediate; the change is saved after. */
export function patchLocal(type, id, changes) {
  const item = find(type, id);
  if (item) Object.assign(item, changes);
}

// --- changing the map --------------------------------------------------------

// Everything below used to be a row in Postgres, an endpoint in front of it and
// a round trip in between. It is all in memory now: the mutation happens here,
// and whoever is listening writes the file.

const titled = (value, fallback) => {
  const title = value?.trim();
  return title && title.length > 0 ? title : fallback;
};

/** Positions are whole numbers, as they were on their way into SQL. */
function roundPositions(record, fields) {
  for (const field of fields) {
    if (typeof record[field] === 'number') record[field] = Math.round(record[field]);
  }
}

const DOMAIN_POSITIONS = ['x', 'y', 'titleX', 'titleY'];
const CAPABILITY_POSITIONS = ['x', 'y', 'lobeX', 'lobeY'];

/** Copy over the fields a record may carry, leaving out what was not given. */
function assign(record, changes, shape) {
  for (const key of Object.keys(shape)) {
    if (changes[key] !== undefined && changes[key] !== null) record[key] = changes[key];
  }
}

export function createDomain(fields = {}) {
  const domain = {
    id: crypto.randomUUID(),
    ...rules.withDefaults(rules.DOMAIN_DEFAULTS, fields),
  };
  domain.title = titled(fields.title, rules.DOMAIN_DEFAULTS.title);
  roundPositions(domain, DOMAIN_POSITIONS);

  store.domains.push(domain);
  emit('data');
  return domain;
}

export function updateDomain(id, changes = {}) {
  const domain = find('domain', id);
  if (!domain) return null;

  assign(domain, changes, rules.DOMAIN_DEFAULTS);
  if (changes.title !== undefined) domain.title = titled(changes.title, domain.title);
  roundPositions(domain, DOMAIN_POSITIONS);

  emit('data');
  return domain;
}

/** Deleting a domain takes its capabilities, and they take their connectors. */
export function deleteDomain(id) {
  const index = store.domains.findIndex((d) => d.id === id);
  if (index < 0) return null;

  const children = store.capabilities.filter((c) => c.domainId === id);
  const childIds = new Set(children.map((c) => c.id));
  const lost = store.connectors.filter((c) => touches(c, 'capability', childIds));

  const removed = {
    domains: store.domains.splice(index, 1),
    capabilities: children,
    connectors: lost,
  };
  store.capabilities = store.capabilities.filter((c) => !childIds.has(c.id));
  store.connectors = store.connectors.filter((c) => !lost.includes(c));

  dropLostSelection();
  emit('data');
  return removed;
}

export function createCapability(fields = {}) {
  const capability = {
    id: crypto.randomUUID(),
    ...rules.withDefaults(rules.CAPABILITY_DEFAULTS, fields),
  };
  capability.title = titled(fields.title, rules.CAPABILITY_DEFAULTS.title);
  roundPositions(capability, CAPABILITY_POSITIONS);

  // A new capability goes on top of the stack it joins.
  if (fields.sortIndex == null) {
    const peers = store.capabilities.filter((c) => c.domainId === capability.domainId);
    capability.sortIndex = peers.length ? Math.max(...peers.map((c) => c.sortIndex)) + 1 : 0;
  }

  store.capabilities.push(capability);
  emit('data');
  return capability;
}

/**
 * Null leaves a field alone, which is why orphaning takes a flag of its own and
 * clearing an icon is an empty string: neither can be said with a null.
 */
export function updateCapability(id, changes = {}) {
  const capability = find('capability', id);
  if (!capability) return null;

  assign(capability, changes, rules.CAPABILITY_DEFAULTS);
  if (changes.title !== undefined) capability.title = titled(changes.title, capability.title);
  if (changes.clearDomain) capability.domainId = null;
  if (changes.icon === '') capability.icon = null;
  roundPositions(capability, CAPABILITY_POSITIONS);

  emit('data');
  return capability;
}

/** Whether a line has an end on any of these records of one kind. */
const touches = (connector, kind, ids) =>
  (connector.fromKind === kind && ids.has(connector.fromId))
  || (connector.toKind === kind && ids.has(connector.toId));

/** Deleting a capability takes the lines attached to it. */
export function deleteCapability(id) {
  return removeElement('capability', id);
}

// --- touchpoints and actors --------------------------------------------------

// Two kinds of their own rather than capabilities in other clothes: their own
// keys, their own defaults and their own validation. What they share with a
// capability is a position, a palette colour and the snap points a line hangs
// off — which is why everything below is written once and told which kind.

const DEFAULTS_FOR = {
  domain: rules.DOMAIN_DEFAULTS,
  capability: rules.CAPABILITY_DEFAULTS,
  touchpoint: rules.TOUCHPOINT_DEFAULTS,
  actor: rules.ACTOR_DEFAULTS,
};

const POSITIONS_FOR = {
  domain: DOMAIN_POSITIONS,
  capability: CAPABILITY_POSITIONS,
  touchpoint: ['x', 'y'],
  actor: ['x', 'y'],
};

/** Make one element of a kind that carries its own position. */
function createElement(kind, fields = {}) {
  const defaults = DEFAULTS_FOR[kind];
  const record = { id: crypto.randomUUID(), ...rules.withDefaults(defaults, fields) };
  record.title = titled(fields.title, defaults.title);
  roundPositions(record, POSITIONS_FOR[kind]);

  // A new one goes on top of the stack it joins, as a capability does.
  if (fields.sortIndex == null && 'sortIndex' in defaults) {
    const peers = listOf(kind);
    record.sortIndex = peers.length ? Math.max(...peers.map((one) => one.sortIndex)) + 1 : 0;
  }

  listOf(kind).push(record);
  emit('data');
  return record;
}

function updateElement(kind, id, changes = {}) {
  const record = find(kind, id);
  if (!record) return null;

  assign(record, changes, DEFAULTS_FOR[kind]);
  if (changes.title !== undefined) record.title = titled(changes.title, record.title);
  if (changes.icon === '') record.icon = null;
  roundPositions(record, POSITIONS_FOR[kind]);

  emit('data');
  return record;
}

/** Deleting an element takes the lines attached to it, whatever kind it is. */
function removeElement(kind, id) {
  const list = listOf(kind);
  const index = list.findIndex((record) => record.id === id);
  if (index < 0) return null;

  const lost = store.connectors.filter((c) => touches(c, kind, new Set([id])));
  const removed = {
    domains: [],
    capabilities: [],
    touchpoints: [],
    actors: [],
    connectors: lost,
    [LISTS[kind]]: list.splice(index, 1),
  };
  store.connectors = store.connectors.filter((c) => !lost.includes(c));

  dropLostSelection();
  emit('data');
  return removed;
}

export const createTouchpoint = (fields) => createElement('touchpoint', fields);
export const updateTouchpoint = (id, changes) => updateElement('touchpoint', id, changes);
export const deleteTouchpoint = (id) => removeElement('touchpoint', id);

export const createActor = (fields) => createElement('actor', fields);
export const updateActor = (id, changes) => updateElement('actor', id, changes);
export const deleteActor = (id) => removeElement('actor', id);

// --- connectors --------------------------------------------------------------

/** An end names a kind and a record of it, and that record has to be on the map. */
function endpoint(kind, id) {
  if (!find(kind, id)) throw new Error('Both ends must be on this map.');
  return { kind, id };
}

/**
 * The two ends in stack order, with the points that go with them. A line has no
 * direction, so a line drawn upwards is the same line drawn downwards — it is
 * stored under its upper end either way, and the points follow the ends.
 */
function ordered(from, to, points) {
  const wrong = rules.connectorRule(from.kind, to.kind);
  if (wrong) throw new Error(wrong);
  if (from.id === to.id) throw new Error('A connector needs two different elements.');

  const ends = rules.orderEnds(from, to);
  const flipped = ends.upper !== from;
  return {
    fromId: ends.upper.id,
    fromKind: ends.upper.kind,
    toId: ends.lower.id,
    toKind: ends.lower.kind,
    ...(points === undefined ? {} : {
      fromPoint: flipped ? points.toPoint : points.fromPoint,
      toPoint: flipped ? points.fromPoint : points.toPoint,
    }),
  };
}

export function createConnector(fields) {
  const from = endpoint(fields.fromKind ?? 'capability', fields.fromId);
  const to = endpoint(fields.toKind ?? 'capability', fields.toId);
  const ends = ordered(from, to, { fromPoint: fields.fromPoint, toPoint: fields.toPoint });

  const connector = {
    id: crypto.randomUUID(),
    ...rules.withDefaults(rules.CONNECTOR_DEFAULTS, fields),
    ...ends,
  };

  store.connectors.push(connector);
  emit('data');
  return connector;
}

export function updateConnector(id, changes = {}) {
  const connector = find('connector', id);
  if (!connector) return null;

  // An end may be moved to another element, but never onto the one at the
  // other end, and never to one this model does not join.
  const from = endpoint(
    changes.fromKind ?? connector.fromKind, changes.fromId ?? connector.fromId);
  const to = endpoint(changes.toKind ?? connector.toKind, changes.toId ?? connector.toId);
  const ends = ordered(from, to, {
    fromPoint: changes.fromPoint ?? connector.fromPoint,
    toPoint: changes.toPoint ?? connector.toPoint,
  });

  assign(connector, changes, rules.CONNECTOR_DEFAULTS);
  Object.assign(connector, ends);

  emit('data');
  return connector;
}

export function deleteConnector(id) {
  const index = store.connectors.findIndex((c) => c.id === id);
  if (index < 0) return null;

  const removed = {
    domains: [], capabilities: [], touchpoints: [], actors: [],
    connectors: store.connectors.splice(index, 1),
  };
  dropLostSelection();
  emit('data');
  return removed;
}

/** Put back exactly what a delete took, ids and all, so undo is a real undo. */
export function restore(removed) {
  if (!removed) return;
  store.domains.push(...(removed.domains ?? []));
  store.capabilities.push(...(removed.capabilities ?? []));
  store.touchpoints.push(...(removed.touchpoints ?? []));
  store.actors.push(...(removed.actors ?? []));
  store.connectors.push(...(removed.connectors ?? []));
  emit('data');
}

/** The map's own settings: what it is called, the colours it wears, its stack. */
export function updateMap(changes = {}) {
  if (changes.title !== undefined) store.title = titled(changes.title, store.title);
  if (changes.palette !== undefined) store.palette = changes.palette ?? [];
  if (changes.layers !== undefined) store.layers = changes.layers ?? [];
  if (changes.types !== undefined) store.types = changes.types ?? {};
  emit('data');
  return store;
}
