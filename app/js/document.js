// The map as a portable document, and back again. Records reference each other
// by `key` — a slug of the title — rather than by id, so the file stays
// readable and can be hand-edited. This is what lands on disk and what Export
// writes; ids live only in memory, made fresh each time a document is read.
//
// Version 2 added the layer stack, touchpoints, actors and Type choices. A
// version 1 file still reads: everything in it lands on the base layer, which
// is what it always meant. Writing is always version 2.

import { slugify } from './store.js';
import * as rules from './rules.js';
import { LAYERS } from './defaults.js';

export const CURRENT_VERSION = 2;

/** A position as the file writes it: two whole numbers, "x,y". */
export const position = (x, y) => `${Math.round(x)},${Math.round(y)}`;

const positionOrNull = (x, y) =>
  x == null && y == null ? null : position(x ?? 0, y ?? 0);

/** "103,-175" back into numbers. Anything unreadable is no position at all. */
export function readPosition(text) {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  const parts = text.split(',');
  if (parts.length !== 2) return null;
  const x = Number(parts[0].trim());
  const y = Number(parts[1].trim());
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

/** Keys have to be unique within their kind, so repeats get a suffix. */
function unique(seen, wanted) {
  const count = (seen.get(wanted) ?? 0) + 1;
  seen.set(wanted, count);
  return count === 1 ? wanted : `${wanted}-${count}`;
}

const blank = (value) => (value == null || value === '' ? null : value);

/** Drop the fields that were never set, so the file carries only what it means. */
const compact = (record) =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value != null));

// --- layers ------------------------------------------------------------------

/**
 * The stack a document is drawn on. A file that names none — every version 1
 * file, and a version 2 one that never left the base layer — gets the starting
 * two, so the layer control always has something to show.
 */
export function readLayers(list) {
  const layers = Array.isArray(list) && list.length > 0 ? list : LAYERS;
  return layers.map((layer, index) => ({
    ...rules.withDefaults(rules.LAYER_DEFAULTS, {
      key: layer.key,
      title: layer.title?.trim() || layer.key,
      // The base layer is the bottom of the stack: there is nothing under it to
      // show, so hiding it is not a state it can be in.
      hidden: index === 0 ? false : layer.hidden === true,
      dimmed: layer.dimmed === true,
    }),
  }));
}

/** The key of the base layer: the bottom of the stack, and every file has one. */
export const baseLayerOf = (layers) => layers[0]?.key ?? LAYERS[0].key;

// --- reading -----------------------------------------------------------------

/** Shape fields every element but a domain shares, read the same way for each. */
const commonFields = (node, layers, base) => ({
  layer: layerOf(node.layer, layers, base),
  title: node.title?.trim(),
  description: node.description,
  owner: node.owner,
  type: node.type,
  colorIndex: node.shape?.color,
  fontSize: node.shape?.size,
  fontWeight: node.shape?.weight,
  sizeScale: node.shape?.scale,
  sortIndex: node.shape?.order,
});

/** A layer a file names, or the base layer — which is what naming none means. */
const layerOf = (named, layers, base) =>
  (named != null && layers.some((layer) => layer.key === named) ? named : base);

/**
 * A document as the editor holds it: flat records with fresh ids, keys resolved
 * to those ids, and everything the file left out filled in with its default.
 */
export function fromDocument(document_) {
  const layers = readLayers(document_.layers);
  const base = baseLayerOf(layers);

  const domainIds = new Map();
  const domains = (document_.domains ?? []).map((node) => {
    const at = readPosition(node.shape?.position);
    const titleAt = readPosition(node.shape?.titlePosition);
    const id = crypto.randomUUID();
    domainIds.set(node.key, id);

    return {
      id,
      ...rules.withDefaults(rules.DOMAIN_DEFAULTS, {
        layer: layerOf(node.layer, layers, base),
        title: node.title?.trim(),
        description: node.description,
        owner: node.owner,
        type: node.type,
        colorIndex: node.shape?.color,
        x: at && Math.round(at.x),
        y: at && Math.round(at.y),
        titleX: titleAt && Math.round(titleAt.x),
        titleY: titleAt && Math.round(titleAt.y),
        fontWeight: node.shape?.weight,
        fontSize: node.shape?.size,
        titleScale: node.shape?.titleScale,
        titleWidth: node.shape?.titleWidth,
        opacity: node.shape?.opacity,
      }),
    };
  });

  const capabilityIds = new Map();
  const capabilities = (document_.capabilities ?? []).map((node) => {
    const home = node.domain == null ? null : domainIds.get(node.domain) ?? null;
    const at = readPosition(node.shape?.position);
    const id = crypto.randomUUID();
    capabilityIds.set(node.key, id);

    // A capability sits on the layer its domain does: the lobe and the blob it
    // is cut into cannot come apart. Loose on the map, it carries its own.
    const owner = home === null
      ? null : domains.find((domain) => domain.id === home) ?? null;

    // One position, read as the lobe when it has a domain and as its own spot
    // on the map when it has none — the same way it was written.
    return {
      id,
      ...rules.withDefaults(rules.CAPABILITY_DEFAULTS, {
        ...commonFields(node, layers, base),
        layer: owner ? owner.layer : layerOf(node.layer, layers, base),
        domainId: home,
        stretch: node.shape?.stretch,
        x: home === null && at ? Math.round(at.x) : undefined,
        y: home === null && at ? Math.round(at.y) : undefined,
        lobeX: home !== null && at ? Math.round(at.x) : undefined,
        lobeY: home !== null && at ? Math.round(at.y) : undefined,
        icon: node.icon,
      }),
    };
  });

  const touchpointIds = new Map();
  const touchpoints = (document_.touchpoints ?? []).map((node) => {
    const at = readPosition(node.shape?.position);
    const id = crypto.randomUUID();
    touchpointIds.set(node.key, id);

    return {
      id,
      ...rules.withDefaults(rules.TOUCHPOINT_DEFAULTS, {
        ...commonFields(node, layers, base),
        stretch: node.shape?.stretch,
        x: at && Math.round(at.x),
        y: at && Math.round(at.y),
        icon: node.icon,
      }),
    };
  });

  const actorIds = new Map();
  const actors = (document_.actors ?? []).map((node) => {
    const at = readPosition(node.shape?.position);
    const id = crypto.randomUUID();
    actorIds.set(node.key, id);

    return {
      id,
      ...rules.withDefaults(rules.ACTOR_DEFAULTS, {
        ...commonFields(node, layers, base),
        x: at && Math.round(at.x),
        y: at && Math.round(at.y),
      }),
    };
  });

  // An endpoint is a kind and a key. A version 1 file wrote the key alone,
  // because a line could only ever join two capabilities.
  const idsByKind = {
    capability: capabilityIds,
    touchpoint: touchpointIds,
    actor: actorIds,
  };
  const endpoint = (key, kind) => {
    const named = rules.ENDPOINT_KINDS.includes(kind) ? kind : 'capability';
    const id = idsByKind[named].get(key);
    return id ? { id, kind: named } : null;
  };

  const connectors = [];
  for (const node of document_.connectors ?? []) {
    const from = endpoint(node.from, node.fromKind);
    const to = endpoint(node.to, node.toKind);
    if (!from || !to) continue;

    connectors.push({
      id: crypto.randomUUID(),
      fromId: from.id,
      fromKind: from.kind,
      toId: to.id,
      toKind: to.kind,
      ...rules.withDefaults(rules.CONNECTOR_DEFAULTS, {
        description: node.description,
        fromPoint: node.fromPoint,
        toPoint: node.toPoint,
        lineStyle: node.lineStyle,
        anchored: node.anchored,
        bendPoints: node.bendPoints,
      }),
    });
  }

  return {
    title: document_.title?.trim() || 'Domain map',
    palette: document_.palette ?? [],
    layers,
    types: readTypes(document_.types),
    domains,
    capabilities,
    touchpoints,
    actors,
    connectors,
  };
}

/** One list of Type choices per kind, with the kinds a file left out empty. */
export function readTypes(types) {
  const read = {};
  for (const kind of rules.ELEMENT_KINDS) {
    const choices = types?.[kind];
    read[kind] = Array.isArray(choices)
      ? [...new Set(choices.filter((choice) => typeof choice === 'string' && choice.trim()))]
      : [];
  }
  return read;
}

// --- writing -----------------------------------------------------------------

/** The map as it goes to disk: keys instead of ids, and nothing left implied. */
export function toDocument(state) {
  const layers = state.layers?.length ? state.layers : readLayers(null);
  const base = baseLayerOf(layers);
  /** The base layer is what naming no layer means, so it is not written down. */
  const layerName = (record) => (record.layer && record.layer !== base ? record.layer : null);

  const domainSeen = new Map();
  const domainKeys = new Map();
  const domains = state.domains.map((domain) => {
    const key = unique(domainSeen, slugify(domain.title));
    domainKeys.set(domain.id, key);
    return compact({
      key,
      layer: layerName(domain),
      title: domain.title,
      description: blank(domain.description),
      owner: blank(domain.owner),
      type: blank(domain.type),
      shape: compact({
        position: position(domain.x, domain.y),
        titlePosition: positionOrNull(domain.titleX, domain.titleY),
        color: domain.colorIndex,
        size: domain.fontSize,
        weight: domain.fontWeight,
        titleScale: domain.titleScale,
        titleWidth: domain.titleWidth,
        opacity: domain.opacity,
      }),
    });
  });

  const capabilitySeen = new Map();
  const capabilityKeys = new Map();
  const capabilities = state.capabilities.map((capability) => {
    const key = unique(capabilitySeen, slugify(capability.title));
    capabilityKeys.set(capability.id, key);
    const home = capability.domainId == null ? null : domainKeys.get(capability.domainId) ?? null;

    return compact({
      key,
      // A capability in a domain is on that domain's layer, and the domain is
      // what says so — writing it here as well would be a second answer.
      layer: home === null ? layerName(capability) : null,
      domain: home,
      title: capability.title,
      description: blank(capability.description),
      owner: blank(capability.owner),
      type: blank(capability.type),
      // The name only. An exported map points at its icons; it does not carry
      // them, so the files travel separately.
      icon: capability.icon,
      shape: compact({
        position: home === null
          ? position(capability.x, capability.y)
          : position(capability.lobeX, capability.lobeY),
        color: capability.colorIndex,
        size: capability.fontSize,
        weight: capability.fontWeight,
        scale: capability.sizeScale,
        stretch: capability.stretch,
        order: capability.sortIndex,
      }),
    });
  });

  const touchpointSeen = new Map();
  const touchpointKeys = new Map();
  const touchpoints = (state.touchpoints ?? []).map((touchpoint) => {
    const key = unique(touchpointSeen, slugify(touchpoint.title));
    touchpointKeys.set(touchpoint.id, key);

    return compact({
      key,
      layer: layerName(touchpoint),
      title: touchpoint.title,
      description: blank(touchpoint.description),
      owner: blank(touchpoint.owner),
      type: blank(touchpoint.type),
      icon: touchpoint.icon,
      shape: compact({
        position: position(touchpoint.x, touchpoint.y),
        color: touchpoint.colorIndex,
        size: touchpoint.fontSize,
        weight: touchpoint.fontWeight,
        scale: touchpoint.sizeScale,
        stretch: touchpoint.stretch,
        order: touchpoint.sortIndex,
      }),
    });
  });

  const actorSeen = new Map();
  const actorKeys = new Map();
  const actors = (state.actors ?? []).map((actor) => {
    const key = unique(actorSeen, slugify(actor.title));
    actorKeys.set(actor.id, key);

    return compact({
      key,
      layer: layerName(actor),
      title: actor.title,
      description: blank(actor.description),
      owner: blank(actor.owner),
      type: blank(actor.type),
      shape: compact({
        position: position(actor.x, actor.y),
        color: actor.colorIndex,
        size: actor.fontSize,
        weight: actor.fontWeight,
        scale: actor.sizeScale,
        order: actor.sortIndex,
      }),
    });
  });

  const keysByKind = {
    capability: capabilityKeys,
    touchpoint: touchpointKeys,
    actor: actorKeys,
  };
  const known = (kind, id) => keysByKind[kind]?.has(id) === true;

  const connectors = (state.connectors ?? [])
    .filter((connector) =>
      known(connector.fromKind, connector.fromId) && known(connector.toKind, connector.toId))
    .map((connector) => compact({
      from: keysByKind[connector.fromKind].get(connector.fromId),
      // A line between two capabilities is what every line used to be, so the
      // kind is written only where it says something the key does not.
      fromKind: connector.fromKind === 'capability' ? null : connector.fromKind,
      to: keysByKind[connector.toKind].get(connector.toId),
      toKind: connector.toKind === 'capability' ? null : connector.toKind,
      description: blank(connector.description),
      fromPoint: connector.fromPoint,
      toPoint: connector.toPoint,
      lineStyle: connector.lineStyle,
      anchored: connector.anchored,
      bendPoints: connector.bendPoints?.length ? connector.bendPoints : null,
    }));

  const types = Object.fromEntries(
    rules.ELEMENT_KINDS
      .map((kind) => [kind, state.types?.[kind] ?? []])
      .filter(([, choices]) => choices.length > 0));

  return compact({
    version: CURRENT_VERSION,
    title: state.title,
    palette: state.palette.length === 0 ? null : state.palette,
    layers: layers.map((layer) => compact({
      key: layer.key,
      title: layer.title,
      hidden: layer.hidden === true ? true : null,
      dimmed: layer.dimmed === true ? true : null,
    })),
    types: Object.keys(types).length === 0 ? null : types,
    domains,
    capabilities,
    touchpoints: touchpoints.length === 0 ? null : touchpoints,
    actors: actors.length === 0 ? null : actors,
    connectors,
  });
}

// --- writing it out ----------------------------------------------------------

const INDENT = '  ';

/** Keys whose value is a handful of numbers that belong together on one line. */
const COMPACT = new Set(['shape']);

const oneLine = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(oneLine).join(', ')}]`;

  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  return entries.length === 0
    ? '{}'
    : `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${oneLine(item)}`).join(', ')} }`;
};

function serialize(value, depth) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);

  const pad = INDENT.repeat(depth + 1);
  const close = INDENT.repeat(depth);

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((item) => pad + serialize(item, depth + 1)).join(',\n')}\n${close}]`;
  }

  const entries = Object.entries(value).filter(([, item]) => item !== undefined);
  if (entries.length === 0) return '{}';

  const lines = entries.map(([key, item]) =>
    `${pad}${JSON.stringify(key)}: ${COMPACT.has(key) ? oneLine(item) : serialize(item, depth + 1)}`);
  return `{\n${lines.join(',\n')}\n${close}}`;
}

/**
 * Indented, except for a shape: spread over ten lines it buries the thing it
 * describes, so it stays on one and the file reads as a list of things.
 */
export const stringify = (document_) => serialize(document_, 0);

// --- validation --------------------------------------------------------------

/** Written, but not as a position. An absent one is fine. */
const unreadable = (text) => text != null && readPosition(text) === null;

/**
 * What is wrong with a document, or null if it can be read. First error wins:
 * a file is refused with one sentence about it, which is the thing to go and
 * fix. Nothing is applied until this has passed, so a bad file leaves the map
 * exactly as it was.
 */
export function validate(document_) {
  if (!document_ || typeof document_ !== 'object' || Array.isArray(document_))
    return 'That file does not hold a map.';

  const version = document_.version ?? 0;
  if (version > CURRENT_VERSION)
    return `This file is version ${version}; this app reads up to ${CURRENT_VERSION}.`;

  const paletteError = rules.validatePalette(document_.palette);
  if (paletteError) return paletteError;

  const layerError = rules.validateLayers(document_.layers);
  if (layerError) return layerError;

  const typeError = rules.validateTypes(document_.types);
  if (typeError) return typeError;

  // A layer an element names has to be one the file declares. A file with no
  // layers of its own gets the starting stack, so those two are what it may name.
  const layerKeys = new Set(readLayers(document_.layers).map((layer) => layer.key));
  const onALayer = (record, kind) =>
    (record.layer != null && !layerKeys.has(record.layer)
      ? `${kind} '${record.key}' is on layer '${record.layer}', which is not in the file.`
      : null);

  const domainKeys = new Set();
  for (const domain of document_.domains ?? []) {
    if (!domain.key || domain.key.trim().length === 0) return 'Every domain needs a key.';
    if (domainKeys.has(domain.key)) return `Two domains share the key '${domain.key}'.`;
    domainKeys.add(domain.key);

    const stray = onALayer(domain, 'Domain');
    if (stray) return stray;

    const shape = domain.shape;
    if (unreadable(shape?.position) || unreadable(shape?.titlePosition))
      return `Domain '${domain.key}': a position must read as "x,y".`;

    const error = rules.validateDomain({
      title: domain.title,
      description: domain.description,
      owner: domain.owner,
      type: domain.type,
      colorIndex: shape?.color,
      fontSize: shape?.size,
      fontWeight: shape?.weight,
      titleScale: shape?.titleScale,
      titleWidth: shape?.titleWidth,
      opacity: shape?.opacity,
    });
    if (error) return `Domain '${domain.key}': ${error}`;
  }

  const capabilityKeys = new Set();
  for (const capability of document_.capabilities ?? []) {
    if (!capability.key || capability.key.trim().length === 0)
      return 'Every capability needs a key.';
    if (capabilityKeys.has(capability.key))
      return `Two capabilities share the key '${capability.key}'.`;
    capabilityKeys.add(capability.key);

    if (capability.domain != null && !domainKeys.has(capability.domain)) {
      return `Capability '${capability.key}' names domain '${capability.domain}', `
        + 'which is not in the file.';
    }

    const stray = onALayer(capability, 'Capability');
    if (stray) return stray;

    const shape = capability.shape;
    if (unreadable(shape?.position))
      return `Capability '${capability.key}': a position must read as "x,y".`;

    const error = rules.validateCapability({
      title: capability.title,
      description: capability.description,
      owner: capability.owner,
      type: capability.type,
      colorIndex: shape?.color,
      fontSize: shape?.size,
      fontWeight: shape?.weight,
      sizeScale: shape?.scale,
      stretch: shape?.stretch,
      icon: capability.icon,
    });
    if (error) return `Capability '${capability.key}': ${error}`;
  }

  // Touchpoints and actors are read the same way as each other: a position of
  // their own, no domain, and the validator their kind carries.
  const keysByKind = { capability: capabilityKeys };
  for (const [kind, list, label] of [
    ['touchpoint', document_.touchpoints ?? [], 'Touchpoint'],
    ['actor', document_.actors ?? [], 'Actor'],
  ]) {
    const keys = new Set();
    for (const node of list) {
      if (!node.key || node.key.trim().length === 0) return `Every ${kind} needs a key.`;
      if (keys.has(node.key)) return `Two ${kind}s share the key '${node.key}'.`;
      keys.add(node.key);

      const stray = onALayer(node, label);
      if (stray) return stray;

      if (unreadable(node.shape?.position))
        return `${label} '${node.key}': a position must read as "x,y".`;

      const error = rules.validatorFor[kind]({
        title: node.title,
        description: node.description,
        owner: node.owner,
        type: node.type,
        colorIndex: node.shape?.color,
        fontSize: node.shape?.size,
        fontWeight: node.shape?.weight,
        sizeScale: node.shape?.scale,
        stretch: node.shape?.stretch,
        icon: node.icon,
      });
      if (error) return `${label} '${node.key}': ${error}`;
    }
    keysByKind[kind] = keys;
  }

  for (const connector of document_.connectors ?? []) {
    for (const [end, kind] of [['from', connector.fromKind], ['to', connector.toKind]]) {
      if (kind != null && !rules.ENDPOINT_KINDS.includes(kind)) {
        return `Connector '${connector.from}' – '${connector.to}': `
          + `an end cannot be on a ${kind}.`;
      }
      if (!keysByKind[kind ?? 'capability'].has(connector[end])) {
        return `Connector '${connector.from}' – '${connector.to}' `
          + 'names an element that is not in the file.';
      }
    }
    if (connector.from === connector.to
      && (connector.fromKind ?? 'capability') === (connector.toKind ?? 'capability')) {
      return 'A connector needs two different elements.';
    }

    const error = rules.validateConnector(connector);
    if (error) return `Connector '${connector.from}' – '${connector.to}': ${error}`;
  }

  return null;
}
