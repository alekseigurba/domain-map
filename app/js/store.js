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
  /** What the business is, in the owner's words: the map's own description. */
  description: '',
  /** The map's own colours, or empty for the ones in the stylesheet. */
  palette: [],
  /** The stack, bottom first. The first is the base layer; see rules.LAYER_DEFAULTS. */
  layers: [],
  /** The Type choices on offer, one list per kind of element. */
  types: {},
  areas: [],
  domains: [],
  capabilities: [],
  /** What the capabilities hold, every capability's in one list: each names the one it is in. */
  features: [],
  touchpoints: [],
  actors: [],
  connectors: [],
  /** Who works on what: each team names the areas, domains and capabilities it is on. Nothing is drawn for one. */
  teams: [],
  /** Who leads what, for product: each a person in a role, on the areas and domains they own. */
  productRoles: [],
  /** The same for engineering: the leads, the tech leads, the architects. */
  engineeringRoles: [],
  /** @type {{type: 'area'|'domain'|'capability'|'feature'|'touchpoint'|'actor'|'connector'|'team'|null, id: string|null}} */
  selection: { type: null, id: null },
};

/** Where each kind of element is kept. The one place that knows. */
const LISTS = {
  area: 'areas',
  domain: 'domains',
  capability: 'capabilities',
  feature: 'features',
  touchpoint: 'touchpoints',
  actor: 'actors',
  connector: 'connectors',
  team: 'teams',
  productRole: 'productRoles',
  engineeringRole: 'engineeringRoles',
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
  store.description = state.description ?? '';
  store.palette = state.palette ?? [];
  // Every layer the model has, whatever was handed over: a session kept by a
  // tab from before a layer existed names the layers there were then, and a
  // layer the store does not hold is one the control cannot hide.
  store.layers = rules.LAYERS.map((layer) =>
    state.layers?.find((one) => one?.key === layer.key) ?? { key: layer.key, hidden: false, dimmed: false });
  store.types = state.types ?? {};
  store.areas = state.areas ?? [];
  store.domains = state.domains;
  store.capabilities = state.capabilities;
  store.features = state.features ?? [];
  store.touchpoints = state.touchpoints ?? [];
  store.actors = state.actors ?? [];
  store.connectors = state.connectors;
  store.teams = state.teams ?? [];
  store.productRoles = state.productRoles ?? [];
  store.engineeringRoles = state.engineeringRoles ?? [];

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

/** The features a capability holds, in the order it holds them. */
export function featuresOf(capabilityId) {
  return store.features.filter((feature) => feature.capabilityId === capabilityId).sort(byStack);
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

/** The layer that is never hidden. Named by the model, not read off the bottom. */
export const baseLayer = () => layerByKey(rules.BASE_LAYER);

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
    areas: mine('area'),
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

// --- areas -------------------------------------------------------------------

// Who owns what. An area has no size of its own: a domain, a touchpoint or a
// loose capability names the one area it is in, and the band is drawn round
// whatever does. One area at most, and areas are flat, so the map answers "who
// owns this" with one name or with nobody.

/** Whether a shape may name an area of its own. An actor never; a capability only while it is loose. */
export const mayJoinArea = (kind, record) =>
  rules.MEMBER_KINDS.includes(kind) && !!record && !(kind === 'capability' && record.domainId);

/**
 * The area a shape belongs to. A capability inside a domain belongs through its
 * domain, whatever it carried before it went in.
 */
export function areaOf(kind, record) {
  if (!record || !rules.MEMBER_KINDS.includes(kind)) return null;
  const holder = kind === 'capability' && record.domainId ? find('domain', record.domainId) : record;
  return find('area', holder?.areaId) ?? null;
}

/** What an area holds, kind by kind in the order the map holds each: `{kind, record}`. */
export const membersOf = (areaId) =>
  (areaId ? rules.MEMBER_KINDS.flatMap((kind) => listOf(kind)
    .filter((record) => record.areaId === areaId && mayJoinArea(kind, record))
    .map((record) => ({ kind, record }))) : []);

// --- Type choices ------------------------------------------------------------

/** The choices one kind of element may be typed with, in the order they were added. */
export const typesFor = (kind) => store.types[kind] ?? [];

/** How many elements of a kind carry a Type — what refuses to delete it. */
export const typeUsage = (kind, choice) =>
  listOf(kind).filter((record) => record.type === choice).length;

/** Add a choice to a kind's list. A repeat is not an error; it is already there. */
export function addTypeChoice(kind, choice) {
  const wanted = choice?.trim();
  if (!wanted || !rules.TYPED_KINDS.includes(kind)) return null;
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
  // Only the terrain has a domain to stay inside; a line touching a touchpoint
  // or an actor has left one by definition.
  if (![connector.fromKind, connector.toKind].every((kind) => rules.TERRAIN_KINDS.includes(kind)))
    return 'public';
  const home = domainOfEnd(connector.fromKind, connector.fromId);
  return home && home === domainOfEnd(connector.toKind, connector.toId) ? 'internal' : 'public';
}

/**
 * What holds a shape of the terrain, one step up: a feature's capability, a
 * capability's domain. Null at the top — a domain, a loose capability — and
 * for the kinds nothing holds.
 */
export function holderOf(kind, id) {
  if (kind === 'feature') {
    const holder = find('capability', find('feature', id)?.capabilityId);
    return holder ? { kind: 'capability', id: holder.id } : null;
  }
  if (kind === 'capability') {
    const holder = find('domain', find('capability', id)?.domainId);
    return holder ? { kind: 'domain', id: holder.id } : null;
  }
  return null;
}

/** A shape and everything that holds it, innermost first. */
export function chainOf(kind, id) {
  const chain = [{ kind, id }];
  for (let up = holderOf(kind, id); up; up = holderOf(up.kind, up.id)) chain.push(up);
  return chain;
}

/** Whether one shape is the other or holds it. */
const holds = (holder, held) =>
  chainOf(held.kind, held.id).some((one) => one.kind === holder.kind && one.id === holder.id);

/** The domain a line's end is in: the domain itself, a capability's, or a feature's capability's. */
export const domainOfEnd = (kind, id) =>
  chainOf(kind, id).find((one) => one.kind === 'domain')?.id ?? null;

/**
 * A line cannot run between a shape and one that holds it: a capability and
 * its own domain, a feature and its own capability. Such a line says nothing —
 * the one is already part of the other — and seen from any level above the
 * smaller end it has no length at all.
 */
const NESTED = 'A connector cannot join a shape to the one that holds it.';

/**
 * Whether any line runs between one of `shapes` and one of `holders`, which
 * are about to hold them: the move that would leave such a line is refused,
 * with the line named as the thing to remove first.
 */
function refuseNesting(shapes, holders) {
  const among = (list, kind, id) => list.some((one) => one.kind === kind && one.id === id);
  const joined = store.connectors.some((line) =>
    (among(shapes, line.fromKind, line.fromId) && among(holders, line.toKind, line.toId))
    || (among(shapes, line.toKind, line.toId) && among(holders, line.fromKind, line.fromId)));
  if (joined) {
    throw new Error('It is connected to the shape it would go into, and a line cannot run '
      + 'between a shape and what holds it. Remove the connector first.');
  }
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
const AREA_POSITIONS = ['x', 'y'];
const CAPABILITY_POSITIONS = ['x', 'y', 'lobeX', 'lobeY'];

/**
 * An area emptied out stays where it was drawn. It has no outline of its own to
 * remember, so it takes the place of the last shape to leave it — rather than
 * jumping back to wherever it was first added, which may be a screen away.
 */
function rememberPlace(record, wasIn) {
  if (!wasIn || record.areaId === wasIn) return;
  const left = find('area', wasIn);
  if (!left || membersOf(wasIn).length > 0) return;
  if (typeof record.x === 'number') left.x = Math.round(record.x);
  if (typeof record.y === 'number') left.y = Math.round(record.y);
}

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
  const wasIn = domain.areaId;

  assign(domain, changes, rules.DOMAIN_DEFAULTS);
  if (changes.title !== undefined) domain.title = titled(changes.title, domain.title);
  if (changes.clearArea) domain.areaId = null;
  if (changes.picture === '') domain.picture = null;
  roundPositions(domain, DOMAIN_POSITIONS);
  // An owner picked from the list can be un-picked, so here null is a value
  // rather than an absence: a name typed over the pick carries no id.
  if ('ownerId' in changes && !changes.ownerId) domain.ownerId = null;
  rememberPlace(domain, wasIn);

  emit('data');
  return domain;
}

/** Deleting a domain takes its capabilities, and they take their connectors. */
export function deleteDomain(id) {
  const index = store.domains.findIndex((d) => d.id === id);
  if (index < 0) return null;

  const children = store.capabilities.filter((c) => c.domainId === id);
  const childIds = new Set(children.map((c) => c.id));
  const held = store.features.filter((feature) => childIds.has(feature.capabilityId));
  // A line may end on the domain itself, on a capability in it, or on a
  // feature in one of those: all of them go with it.
  const lost = store.connectors.filter((c) => touches(c, 'domain', new Set([id]))
    || touches(c, 'capability', childIds)
    || touches(c, 'feature', new Set(held.map((feature) => feature.id))));

  const removed = {
    domains: store.domains.splice(index, 1),
    capabilities: children,
    features: held,
    connectors: lost,
  };
  store.capabilities = store.capabilities.filter((c) => !childIds.has(c.id));
  store.features = store.features.filter((feature) => !held.includes(feature));
  store.connectors = store.connectors.filter((c) => !lost.includes(c));
  for (const domain of removed.domains) rememberPlace({ ...domain, areaId: null }, domain.areaId);

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
 *
 * A capability belongs to an area through its domain, so going into one gives
 * up an area of its own. Coming out, it keeps the domain's: leaving a domain is
 * not leaving the team. Either is only where it starts — an `areaId` or a
 * `clearArea` in the same change has the last word, which is what undo relies on.
 */
export function updateCapability(id, changes = {}) {
  const capability = find('capability', id);
  if (!capability) return null;
  const wasIn = capability.areaId;

  if (changes.domainId && changes.domainId !== capability.domainId) {
    refuseNesting(
      [{ kind: 'capability', id }, ...featuresOf(id).map((one) => ({ kind: 'feature', id: one.id }))],
      [{ kind: 'domain', id: changes.domainId }]);
  }
  if (changes.domainId) capability.areaId = null;
  else if (changes.clearDomain && capability.domainId)
    capability.areaId = find('domain', capability.domainId)?.areaId ?? null;

  assign(capability, changes, rules.CAPABILITY_DEFAULTS);
  if (changes.title !== undefined) capability.title = titled(changes.title, capability.title);
  if (changes.clearDomain) capability.domainId = null;
  if (changes.clearArea) capability.areaId = null;
  // A file a record names is let go with an empty string: null is "not given".
  if (changes.icon === '') capability.icon = null;
  if (changes.picture === '') capability.picture = null;
  // An owner picked from the list can be un-picked, so here null is a value
  // rather than an absence: a name typed over the pick carries no id.
  if ('ownerId' in changes && !changes.ownerId) capability.ownerId = null;
  roundPositions(capability, CAPABILITY_POSITIONS);
  rememberPlace(capability, wasIn);

  emit('data');
  return capability;
}

/** Whether a line has an end on any of these records of one kind. */
const touches = (connector, kind, ids) =>
  (connector.fromKind === kind && ids.has(connector.fromId))
  || (connector.toKind === kind && ids.has(connector.toId));

/** Deleting a capability takes the lines attached to it, and the features inside it. */
export function deleteCapability(id) {
  return removeElement('capability', id);
}

// --- features ----------------------------------------------------------------

// What a capability does, named one by one. A feature is made in a capability
// and stays a part of it: it has no position to round and no line to lose, so
// it is changed here by its words and by where it stands among the others.

/** The capability a feature is to go into, which has to be on the map and have the room. */
function roomIn(capabilityId, joining = true) {
  if (!find('capability', capabilityId)) throw new Error('A feature belongs to a capability on this map.');
  if (joining && featuresOf(capabilityId).length >= rules.MAX_FEATURES)
    throw new Error(`A capability holds at most ${rules.MAX_FEATURES} features.`);
}

export function createFeature(fields = {}) {
  roomIn(fields.capabilityId);
  const feature = {
    id: crypto.randomUUID(),
    ...rules.withDefaults(rules.FEATURE_DEFAULTS, fields),
  };
  feature.title = titled(fields.title, rules.FEATURE_DEFAULTS.title);

  // A new one goes after the last the capability holds.
  if (fields.sortIndex == null) {
    const peers = featuresOf(feature.capabilityId);
    feature.sortIndex = peers.length ? Math.max(...peers.map((one) => one.sortIndex)) + 1 : 0;
  }

  store.features.push(feature);
  emit('data');
  return feature;
}

/**
 * A `capabilityId` in the change hands the feature to another capability. `x`
 * and `y` put it somewhere in the oval by hand, and `clearPosition` sends it
 * back to the row its order gives it — null leaves a field alone, so it takes
 * a flag to say. A place in one oval means nothing in another, so a feature
 * handed over arrives in its row unless it is told where to go.
 */
export function updateFeature(id, changes = {}) {
  const feature = find('feature', id);
  if (!feature) return null;
  const moving = changes.capabilityId && changes.capabilityId !== feature.capabilityId;
  if (moving) {
    roomIn(changes.capabilityId);
    refuseNesting([{ kind: 'feature', id }],
      chainOf('capability', changes.capabilityId));
  }

  // Taken before the change lands, so that a title of nothing but spaces
  // leaves the name it had rather than becoming the name.
  const was = feature.title;
  assign(feature, changes, rules.FEATURE_DEFAULTS);
  if (changes.title !== undefined) feature.title = titled(changes.title, was);
  // An owner picked from the list can be un-picked, so here null is a value
  // rather than an absence: a name typed over the pick carries no id.
  if ('ownerId' in changes && !changes.ownerId) feature.ownerId = null;
  if (changes.clearPosition || (moving && changes.x == null && changes.y == null)) {
    feature.x = null;
    feature.y = null;
  }
  // Handed over, it goes after the last the new capability holds, unless it
  // is told where it stands — which is what undo does, to put it back.
  if (moving && changes.sortIndex == null) {
    const peers = featuresOf(feature.capabilityId).filter((one) => one.id !== id);
    feature.sortIndex = peers.length ? Math.max(...peers.map((one) => one.sortIndex)) + 1 : 0;
  }
  for (const axis of ['x', 'y']) {
    if (typeof feature[axis] !== 'number') continue;
    feature[axis] = Math.round(Math.max(-rules.MAX_FEATURE_REACH,
      Math.min(rules.MAX_FEATURE_REACH, feature[axis])));
  }

  emit('data');
  return feature;
}

/** Deleting a feature takes the lines attached to it. */
export function deleteFeature(id) {
  const index = store.features.findIndex((feature) => feature.id === id);
  if (index < 0) return null;

  const lost = store.connectors.filter((c) => touches(c, 'feature', new Set([id])));
  const removed = { features: store.features.splice(index, 1), connectors: lost };
  store.connectors = store.connectors.filter((c) => !lost.includes(c));
  dropLostSelection();
  emit('data');
  return removed;
}

// --- touchpoints and actors --------------------------------------------------

// Two kinds of their own rather than capabilities in other clothes: their own
// keys, their own defaults and their own validation. What they share with a
// capability is a position, a palette colour and the snap points a line hangs
// off — which is why everything below is written once and told which kind.

const DEFAULTS_FOR = {
  area: rules.AREA_DEFAULTS,
  domain: rules.DOMAIN_DEFAULTS,
  capability: rules.CAPABILITY_DEFAULTS,
  touchpoint: rules.TOUCHPOINT_DEFAULTS,
  actor: rules.ACTOR_DEFAULTS,
};

const POSITIONS_FOR = {
  area: AREA_POSITIONS,
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
  const wasIn = record.areaId;

  assign(record, changes, DEFAULTS_FOR[kind]);
  if (changes.title !== undefined) record.title = titled(changes.title, record.title);
  if (changes.icon === '') record.icon = null;
  if (changes.picture === '') record.picture = null;
  if (changes.clearArea) record.areaId = null;
  if (changes.clearTitleAngle) record.titleAngle = null;
  // An owner picked from the list can be un-picked, so here null is a value
  // rather than an absence: a name typed over the pick carries no id.
  if ('ownerId' in changes && !changes.ownerId) record.ownerId = null;
  roundPositions(record, POSITIONS_FOR[kind]);
  // To a tenth of a degree: round a long band a whole one is a hand's width of
  // border. Rounded up to a full turn, an angle is back where it started.
  if (typeof record.titleAngle === 'number')
    record.titleAngle = (Math.round((((record.titleAngle % 360) + 360) % 360) * 10) / 10) % 360;
  rememberPlace(record, wasIn);

  emit('data');
  return record;
}

/** Deleting an element takes the lines attached to it, whatever kind it is. */
function removeElement(kind, id) {
  const list = listOf(kind);
  const index = list.findIndex((record) => record.id === id);
  if (index < 0) return null;

  // Only a capability holds any; for the other kinds this is nothing.
  const held = kind === 'capability'
    ? store.features.filter((feature) => feature.capabilityId === id)
    : [];
  // Its own lines, and those of the features that go with it.
  const lost = store.connectors.filter((c) => touches(c, kind, new Set([id]))
    || touches(c, 'feature', new Set(held.map((feature) => feature.id))));
  const removed = {
    areas: [],
    domains: [],
    capabilities: [],
    features: held,
    touchpoints: [],
    actors: [],
    connectors: lost,
    [LISTS[kind]]: list.splice(index, 1),
  };
  store.features = store.features.filter((feature) => !held.includes(feature));
  store.connectors = store.connectors.filter((c) => !lost.includes(c));
  for (const gone of removed[LISTS[kind]]) rememberPlace({ ...gone, areaId: null }, gone.areaId);

  dropLostSelection();
  emit('data');
  return removed;
}

export const createTouchpoint = (fields) => createElement('touchpoint', fields);
export const updateTouchpoint = (id, changes) => updateElement('touchpoint', id, changes);
export const deleteTouchpoint = (id) => removeElement('touchpoint', id);

// An area is made and changed as the others are. Deleting one is its own: it
// frees what it held and deletes none of it, and says who they were so that
// undo can put every one of them back where it belonged.

export const createArea = (fields) => createElement('area', fields);
export const updateArea = (id, changes) => updateElement('area', id, changes);

export function deleteArea(id) {
  const index = store.areas.findIndex((area) => area.id === id);
  if (index < 0) return null;

  const held = rules.MEMBER_KINDS.flatMap((kind) => listOf(kind)
    .filter((record) => record.areaId === id)
    .map((record) => ({ kind, id: record.id })));
  for (const member of held) find(member.kind, member.id).areaId = null;

  const removed = {
    areas: store.areas.splice(index, 1),
    domains: [], capabilities: [], touchpoints: [], actors: [], connectors: [],
    memberships: held.map((member) => ({ ...member, areaId: id })),
  };
  dropLostSelection();
  emit('data');
  return removed;
}

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
  if (holds(from, to) || holds(to, from)) throw new Error(NESTED);

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
    areas: [], domains: [], capabilities: [], touchpoints: [], actors: [],
    connectors: store.connectors.splice(index, 1),
  };
  dropLostSelection();
  emit('data');
  return removed;
}

// --- teams -------------------------------------------------------------------

// Who works on what. A team is not a shape: it has no place on the map and no
// layer, and what it is on — areas, domains, capabilities, any mix — it names
// by kind and id. Nothing here draws it; picking one lights up what it is on.
//
// A team goes on naming a shape that has been deleted. Nothing reads the name
// while the shape is gone — what a team is on is always asked through
// `teamMembers`, which answers with what is there — and an undo that brings the
// shape back brings it back onto its teams, with no delete having had to
// remember them. A name that never comes back is dropped the next time the map
// is written to a file.

const sameMember = (a, b) => a.kind === b.kind && a.id === b.id;

/** What a team is on, as the shapes themselves: `[{ kind, record }]`, areas first, in the order it was put on them. */
export function teamMembers(team) {
  const found = (team?.members ?? [])
    .map((member) => ({ kind: member.kind, record: find(member.kind, member.id) }))
    .filter((member) => member.record);
  return rules.TEAM_MEMBER_KINDS.flatMap((kind) => found.filter((member) => member.kind === kind));
}

/** The teams that are on a shape itself, in the order the map holds them. */
export const teamsOn = (kind, id) =>
  store.teams.filter((team) => team.members.some((member) => sameMember(member, { kind, id })));

/**
 * The teams that come to a shape through what holds it, each with the holder
 * it comes through: a capability's through its domain, and anything's through
 * the area it is in. They are the shape's teams as much as the ones put on it
 * are — and not the shape's to take off.
 */
export function teamsThrough(kind, record) {
  const holders = [];
  if (kind === 'capability' && record?.domainId) holders.push({ kind: 'domain', record: find('domain', record.domainId) });
  if (kind !== 'area') {
    const area = areaOf(kind, record);
    if (area) holders.push({ kind: 'area', record: area });
  }
  const direct = teamsOn(kind, record?.id);
  return holders.filter((holder) => holder.record)
    .flatMap((holder) => teamsOn(holder.kind, holder.record.id).map((team) => ({ team, via: holder.record })))
    .filter(({ team }) => !direct.includes(team));
}

/**
 * Everything a team reaches, as two sets of ids: what it is on, and what it
 * comes to through that. A team on an area is the team of every domain in it,
 * and a team on a domain of every capability in that; so `through` holds what
 * is inside what `on` holds, all the way down.
 */
export function teamReach(team) {
  const on = new Set();
  const through = new Set();
  const within = (domain) => {
    for (const capability of childrenOf(domain.id)) through.add(capability.id);
  };
  for (const { kind, record } of teamMembers(team)) {
    on.add(record.id);
    if (kind === 'domain') within(record);
    if (kind !== 'area') continue;
    for (const held of membersOf(record.id)) {
      through.add(held.record.id);
      if (held.kind === 'domain') within(held.record);
    }
  }
  return { on, through };
}

export function createTeam(fields = {}) {
  if (store.teams.length >= rules.MAX_TEAMS) throw new Error(`A map holds at most ${rules.MAX_TEAMS} teams.`);
  const team = {
    id: crypto.randomUUID(),
    ...rules.withDefaults(rules.TEAM_DEFAULTS, fields),
  };
  team.title = titled(fields.title, rules.TEAM_DEFAULTS.title);
  team.members = checkedMembers(fields.members ?? []);
  store.teams.push(team);
  emit('data');
  return team;
}

/** A list of what a team is on, as kinds and ids a team may name, each once. */
function checkedMembers(members) {
  const kept = [];
  for (const member of Array.isArray(members) ? members : []) {
    if (!rules.TEAM_MEMBER_KINDS.includes(member?.kind) || typeof member.id !== 'string') continue;
    if (!kept.some((one) => sameMember(one, member))) kept.push({ kind: member.kind, id: member.id });
  }
  return kept;
}

/** Change a team's words, or the whole of what it is on — which is how undo puts a list back. */
export function updateTeam(id, changes = {}) {
  const team = find('team', id);
  if (!team) return null;
  const was = team.title;
  const { members, ...words } = changes;
  assign(team, words, { ...rules.TEAM_DEFAULTS, members: undefined });
  if (changes.title !== undefined) team.title = titled(changes.title, was);
  // An owner picked from the list can be un-picked, so here null is a value
  // rather than an absence: a name typed over the pick carries no id.
  if ('ownerId' in changes && !changes.ownerId) team.ownerId = null;
  if (members !== undefined && members !== null) team.members = checkedMembers(members);
  emit('data');
  return team;
}

/** Put a team on a shape, or take it off: an area, a domain or a capability. Asked twice, it is on it once. */
export function setTeamMember(teamId, kind, id, on = true) {
  const team = find('team', teamId);
  if (!team || !rules.TEAM_MEMBER_KINDS.includes(kind) || !find(kind, id)) return null;
  const rest = team.members.filter((member) => !sameMember(member, { kind, id }));
  team.members = on ? [...rest, { kind, id }] : rest;
  emit('data');
  return team;
}

/** Delete a team. What it was on is none the worse: a team is no part of a shape. */
export function deleteTeam(id) {
  const index = store.teams.findIndex((team) => team.id === id);
  if (index < 0) return null;
  const removed = { teams: store.teams.splice(index, 1), teamAt: index };
  dropLostSelection();
  emit('data');
  return removed;
}

/** Put back exactly what a delete took, ids and all, so undo is a real undo. */
export function restore(removed) {
  if (!removed) return;
  // A team goes back where it stood in the list, since the list is the order teams are read in.
  if (removed.teams?.length) store.teams.splice(Math.min(removed.teamAt ?? store.teams.length, store.teams.length), 0, ...removed.teams);
  // And a person where they stood among the others of their discipline.
  for (const { kind, record, at } of removed.roles ?? []) {
    const list = listOf(kind);
    list.splice(Math.min(at ?? list.length, list.length), 0, record);
  }
  store.areas.push(...(removed.areas ?? []));
  store.domains.push(...(removed.domains ?? []));
  store.capabilities.push(...(removed.capabilities ?? []));
  store.features.push(...(removed.features ?? []));
  store.touchpoints.push(...(removed.touchpoints ?? []));
  store.actors.push(...(removed.actors ?? []));
  store.connectors.push(...(removed.connectors ?? []));
  // An area that comes back takes back what it held — those that are still
  // there, and still free to be taken.
  for (const member of removed.memberships ?? []) {
    const record = find(member.kind, member.id);
    if (record && !record.areaId && mayJoinArea(member.kind, record)) record.areaId = member.areaId;
  }
  emit('data');
}

/** The map's own settings: what it is called and says it is, the colours it wears, its stack. */
export function updateMap(changes = {}) {
  if (changes.title !== undefined) store.title = titled(changes.title, store.title);
  if (changes.description !== undefined) store.description = changes.description ?? '';
  if (changes.palette !== undefined) store.palette = changes.palette ?? [];
  if (changes.layers !== undefined) store.layers = changes.layers ?? [];
  if (changes.types !== undefined) store.types = changes.types ?? {};
  emit('data');
  return store;
}

// --- people in roles -----------------------------------------------------------

// Who leads what. A person in a role — a product lead, an architect — is on the
// areas and the domains they own, named by kind and id as a team's shapes are,
// and is drawn there: a badge on each, on the layer of their discipline. There
// are two disciplines and so two kinds, `productRole` and `engineeringRole`,
// each with a list of its own; everything below takes the kind and is the same
// for both.
//
// As with a team, a person goes on naming a shape that has been deleted, so
// that an undo which brings the shape back brings them back onto it. One left
// owning nothing that is there is drawn nowhere, and is let go when the map is
// written to a file.

const isRoleKind = (kind) => rules.ROLE_KINDS.includes(kind);

/** A list of what a person owns, as kinds and ids a role may name, each once. */
function checkedOwned(members) {
  const kept = [];
  for (const member of Array.isArray(members) ? members : []) {
    if (!rules.ROLE_ON_KINDS.includes(member?.kind) || typeof member.id !== 'string') continue;
    if (kept.some((one) => sameMember(one, member))) continue;
    // Where their card on this shape was put, if it was put anywhere: kept
    // with what they own, since it is gone when the shape is no longer theirs.
    kept.push(rules.cardPlaced(member)
      ? { kind: member.kind, id: member.id, x: Math.round(member.x), y: Math.round(member.y) }
      : { kind: member.kind, id: member.id });
  }
  return kept;
}

/** What a person owns, as the shapes themselves: `[{ kind, record }]`, areas first. */
export function roleMembers(role) {
  const found = (role?.members ?? [])
    .map((member) => ({ kind: member.kind, record: find(member.kind, member.id) }))
    .filter((member) => member.record);
  return rules.ROLE_ON_KINDS.flatMap((kind) => found.filter((member) => member.kind === kind));
}

/** The people of one discipline who own a shape, in the order the map holds them. */
export const rolesOn = (roleKind, kind, id) =>
  listOf(roleKind).filter((role) => role.members.some((member) => sameMember(member, { kind, id })));

/**
 * The icon a new holder of a role starts with: the one the last person in that
 * role was given. Everyone in a role then looks alike until someone is told
 * apart on purpose, which is what an owner picking from a handful of variants
 * mostly wants.
 */
export const iconForRole = (roleKind, type) =>
  (type ? listOf(roleKind).findLast((role) => role.type === type && role.icon)?.icon ?? null : null);

export function createRole(roleKind, fields = {}) {
  if (!isRoleKind(roleKind)) return null;
  const list = listOf(roleKind);
  if (list.length >= rules.MAX_ROLES) throw new Error(`A map names at most ${rules.MAX_ROLES} people in each discipline.`);
  const role = {
    id: crypto.randomUUID(),
    ...rules.withDefaults(rules.ROLE_DEFAULTS, fields),
  };
  role.title = titled(fields.title, rules.ROLE_DEFAULTS.title);
  role.members = checkedOwned(fields.members ?? []);
  list.push(role);
  emit('data');
  return role;
}

/** Change a person's name, role or icon, or the whole of what they own — which is how undo puts a list back. */
export function updateRole(roleKind, id, changes = {}) {
  const role = isRoleKind(roleKind) ? find(roleKind, id) : null;
  if (!role) return null;
  const was = role.title;
  const { members, ...words } = changes;
  assign(role, words, { ...rules.ROLE_DEFAULTS, members: undefined });
  if (changes.title !== undefined) role.title = titled(changes.title, was);
  if (changes.icon === '') role.icon = null;
  if (members !== undefined && members !== null) role.members = checkedOwned(members);
  emit('data');
  return role;
}

/** Give a person an area or a domain to own, or take it from them. Asked twice, they own it once. */
export function setRoleMember(roleKind, roleId, kind, id, on = true) {
  const role = isRoleKind(roleKind) ? find(roleKind, roleId) : null;
  if (!role || !rules.ROLE_ON_KINDS.includes(kind) || !find(kind, id)) return null;
  const has = role.members.some((member) => sameMember(member, { kind, id }));
  // Given what they already have, nothing changes — least of all where the card for it was put.
  if (on && has) return role;
  role.members = on ? [...role.members, { kind, id }] : role.members.filter((member) => !sameMember(member, { kind, id }));
  emit('data');
  return role;
}

/**
 * Where a person's card on one of their shapes has been put, as `{ x, y }`
 * measured from that shape, or null while the map hangs it by itself.
 */
export function roleCardPlace(role, kind, id) {
  const member = (role?.members ?? []).find((one) => sameMember(one, { kind, id }));
  return member && rules.cardPlaced(member) ? { x: member.x, y: member.y } : null;
}

/**
 * What a person owns, with their card on one shape put at `at` — or, with no
 * `at`, handed back to the map to hang. The list is what `updateRole` takes,
 * so that moving a card is a change like any other and undo puts it back.
 */
export function membersWithCard(role, kind, id, at = null) {
  return (role?.members ?? []).map((member) => {
    if (!sameMember(member, { kind, id })) return { ...member };
    return at ? { kind, id, x: Math.round(at.x), y: Math.round(at.y) } : { kind, id };
  });
}

/** Take a person off the map. What they owned is none the worse: a person is no part of a shape. */
export function deleteRole(roleKind, id) {
  const list = isRoleKind(roleKind) ? listOf(roleKind) : [];
  const index = list.findIndex((role) => role.id === id);
  if (index < 0) return null;
  const removed = { roles: [{ kind: roleKind, record: list.splice(index, 1)[0], at: index }] };
  dropLostSelection();
  emit('data');
  return removed;
}

// --- the slideshow's deck ------------------------------------------------------

// The deck is made of the map, in the order the map is read: an area, then the
// domains in it, each followed by its capabilities, then the area's loose
// capabilities; and after the areas, whatever is in none, the same way. So a
// slide's path — /area/domain/capability — is also where it stands in the deck.

/** Every slide there is, as `{ kind, id }`: areas, domains and capabilities, each once. */
export function slideDeck() {
  const slide = (kind) => (record) => ({ kind, id: record.id });
  const under = (domains, loose) => [
    ...domains.flatMap((domain) => [slide('domain')(domain), ...childrenOf(domain.id).map(slide('capability'))]),
    ...loose.map(slide('capability')),
  ];
  const inArea = (areaId) => (record) => (find('area', record.areaId)?.id ?? null) === areaId;
  return [
    ...store.areas.flatMap((area) => [
      slide('area')(area),
      ...under(store.domains.filter(inArea(area.id)), orphans().filter(inArea(area.id))),
    ]),
    ...under(store.domains.filter(inArea(null)), orphans().filter(inArea(null))),
  ];
}

/**
 * Where a shape sits, outermost first and ending in itself: its area, its
 * domain, and it — `[{ kind, record }]`. Whatever it is not in is left out, so
 * a domain in no area is a path of one.
 */
export function pathOf(kind, record) {
  if (!record) return [];
  const domain = kind === 'capability' && record.domainId ? find('domain', record.domainId) : null;
  const area = kind === 'area' ? null : areaOf(kind, record);
  return [
    ...(area ? [{ kind: 'area', record: area }] : []),
    ...(domain ? [{ kind: 'domain', record: domain }] : []),
    { kind, record },
  ];
}
