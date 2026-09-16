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
  domains: [],
  capabilities: [],
  connectors: [],
  /** @type {{type: 'domain'|'capability'|'connector'|null, id: string|null}} */
  selection: { type: null, id: null },
};

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
  store.domains = state.domains;
  store.capabilities = state.capabilities;
  store.connectors = state.connectors;

  dropLostSelection();
  emit('map');
}

export function select(type, id, reason = 'selection') {
  if (store.selection.type === type && store.selection.id === id) return;
  store.selection = { type: type ?? null, id: id ?? null };
  emit(reason);
}

export function find(type, id) {
  if (!id) return null;
  if (type === 'domain') return store.domains.find((d) => d.id === id) ?? null;
  if (type === 'capability') return store.capabilities.find((c) => c.id === id) ?? null;
  if (type === 'connector') return store.connectors.find((c) => c.id === id) ?? null;
  return null;
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
  const from = find('capability', connector.fromCapabilityId);
  const to = find('capability', connector.toCapabilityId);
  if (!from || !to) return 'public';
  return from.domainId && from.domainId === to.domainId ? 'internal' : 'public';
}

/** The titles of the two capabilities a line joins, from end first. */
export function connectorEnds(connector) {
  const from = find('capability', connector.fromCapabilityId);
  const to = find('capability', connector.toCapabilityId);
  return [from?.title ?? '?', to?.title ?? '?'];
}

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

/** The internal lines of one domain — they hang under it in the menu. */
export function internalConnectors(domainId) {
  return store.connectors.filter((connector) => {
    const from = find('capability', connector.fromCapabilityId);
    return scopeOf(connector) === 'internal' && from?.domainId === domainId;
  });
}

/** Everything that crosses a boundary, listed once at the top level. */
export function publicConnectors() {
  return store.connectors.filter((connector) => scopeOf(connector) === 'public');
}

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

const listOf = (type) =>
  (type === 'domain' ? store.domains : type === 'capability' ? store.capabilities : store.connectors);

function labelOf(type, record) {
  if (type !== 'connector') return record.title;
  const from = find('capability', record.fromCapabilityId);
  const to = find('capability', record.toCapabilityId);
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
  const lost = store.connectors.filter(
    (c) => childIds.has(c.fromCapabilityId) || childIds.has(c.toCapabilityId));

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

/** Deleting a capability takes the lines attached to it. */
export function deleteCapability(id) {
  const index = store.capabilities.findIndex((c) => c.id === id);
  if (index < 0) return null;

  const lost = store.connectors.filter(
    (c) => c.fromCapabilityId === id || c.toCapabilityId === id);

  const removed = {
    domains: [],
    capabilities: store.capabilities.splice(index, 1),
    connectors: lost,
  };
  store.connectors = store.connectors.filter((c) => !lost.includes(c));

  dropLostSelection();
  emit('data');
  return removed;
}

export function createConnector(fields) {
  const { fromCapabilityId, toCapabilityId } = fields;
  if (fromCapabilityId === toCapabilityId)
    throw new Error('A connector needs two different capabilities.');
  if (!capabilityById(fromCapabilityId) || !capabilityById(toCapabilityId))
    throw new Error('Both capabilities must be on this map.');

  const connector = {
    id: crypto.randomUUID(),
    fromCapabilityId,
    toCapabilityId,
    ...rules.withDefaults(rules.CONNECTOR_DEFAULTS, fields),
  };

  store.connectors.push(connector);
  emit('data');
  return connector;
}

export function updateConnector(id, changes = {}) {
  const connector = find('connector', id);
  if (!connector) return null;

  // An end may be moved to another capability, but never onto the one at the
  // other end.
  const from = changes.fromCapabilityId ?? connector.fromCapabilityId;
  const to = changes.toCapabilityId ?? connector.toCapabilityId;
  if (from === to) throw new Error('A connector needs two different capabilities.');
  if (!capabilityById(from) || !capabilityById(to))
    throw new Error('Both capabilities must be on this map.');

  connector.fromCapabilityId = from;
  connector.toCapabilityId = to;
  assign(connector, changes, rules.CONNECTOR_DEFAULTS);

  emit('data');
  return connector;
}

export function deleteConnector(id) {
  const index = store.connectors.findIndex((c) => c.id === id);
  if (index < 0) return null;

  const removed = { domains: [], capabilities: [], connectors: store.connectors.splice(index, 1) };
  dropLostSelection();
  emit('data');
  return removed;
}

/** Put back exactly what a delete took, ids and all, so undo is a real undo. */
export function restore(removed) {
  if (!removed) return;
  store.domains.push(...(removed.domains ?? []));
  store.capabilities.push(...(removed.capabilities ?? []));
  store.connectors.push(...(removed.connectors ?? []));
  emit('data');
}

/** The map's own settings: what it is called and the colours it wears. */
export function updateMap(changes = {}) {
  if (changes.title !== undefined) store.title = titled(changes.title, store.title);
  if (changes.palette !== undefined) store.palette = changes.palette ?? [];
  emit('data');
  return store;
}
