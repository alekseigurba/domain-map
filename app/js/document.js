// The map as a portable document, and back again. Records reference each other
// by `key` — a slug of the title — rather than by id, so the file stays
// readable and can be hand-edited. This is what lands on disk and what Export
// writes; ids live only in memory, made fresh each time a document is read.
//
// Version 2 added the layer stack, touchpoints, actors and Type choices. A
// version 1 file still reads: everything in it lands on the base layer, which
// is what it always meant.
//
// Version 3 added Areas (Product Areas, as 2.3.0 called them): a third layer,
// the areas on it, and the area a domain, a touchpoint or a loose capability
// names. The number moved because an app from before it would read past all
// of that and write the map back without it — better that it refuses the
// file. Versions 1 and 2 still read, as a map with no areas. Writing is
// always version 3.

import { slugify } from './store.js';
import * as rules from './rules.js';

export const CURRENT_VERSION = 3;

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

/**
 * Bend points back to front. A line read the other way round has its ends
 * swapped, and the bends between them run the other way too.
 */
function reversedBends(flat) {
  if (!Array.isArray(flat) || flat.length < 4) return flat;
  const points = [];
  for (let i = 0; i + 1 < flat.length; i += 2) points.unshift([flat[i], flat[i + 1]]);
  return points.flat();
}

/** Keys have to be unique within their kind, so repeats get a suffix. */
function unique(seen, wanted) {
  const count = (seen.get(wanted) ?? 0) + 1;
  seen.set(wanted, count);
  return count === 1 ? wanted : `${wanted}-${count}`;
}

const blank = (value) => (value == null || value === '' ? null : value);

/**
 * Which side of the title the icon sits on, written only when it is not over
 * it. Over it is where an icon was before there was a choice, so a map that
 * never chose writes the file it always wrote — and one that did still opens in
 * an app from before the choice, which reads past the field and draws it on top.
 */
const placementOf = (record) =>
  (record.iconPlacement && record.iconPlacement !== rules.DEFAULT_ICON_PLACEMENT
    ? record.iconPlacement
    : null);

/** How heavy the icon's lines are drawn, written only when it is not as the file has them. */
const weightOf = (record) =>
  (record.iconWeight && record.iconWeight !== rules.DEFAULT_ICON_WEIGHT ? record.iconWeight : null);

/** Drop the fields that were never set, so the file carries only what it means. */
const compact = (record) =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value != null));

// --- layers ------------------------------------------------------------------

/**
 * What a document says about the stack. The stack itself is fixed, so this only
 * reads how each layer opens: a file that says nothing gets the model's own
 * layers, shown and undimmed.
 *
 * A layer a file carries a title for is read without it. The titles belong to
 * the model, so a file cannot rename a layer into meaning something else.
 */
export function readLayers(list) {
  const said = new Map((Array.isArray(list) ? list : [])
    .filter((layer) => layer && typeof layer === 'object')
    .map((layer) => [layer.key, layer]));

  return rules.LAYERS.map((layer) => {
    const from = said.get(layer.key) ?? {};
    return rules.withDefaults(rules.LAYER_DEFAULTS, {
      key: layer.key,
      // Nothing sits under the base layer, so hiding it is not a state it can
      // be in, whatever a hand-edited file says.
      hidden: layer.key === rules.BASE_LAYER ? false : from.hidden === true,
      dimmed: from.dimmed === true,
    });
  });
}

// --- reading -----------------------------------------------------------------

/**
 * Shape fields every element but a domain shares, read the same way for each.
 * A `layer` a file carries is not among them: the kind decides that now, so an
 * older file naming one is read without it rather than refused.
 */
const commonFields = (node) => ({
  title: node.title?.trim(),
  description: node.description,
  owner: node.owner,
  type: node.type,
  colorIndex: node.shape?.color,
  fontSize: node.shape?.size,
  fontWeight: node.shape?.weight,
  sizeScale: node.shape?.scale,
  opacity: node.shape?.opacity,
  sortIndex: node.shape?.order,
  iconPlacement: node.shape?.iconPlacement,
  iconWeight: node.shape?.iconWeight,
});

/**
 * A document as the editor holds it: flat records with fresh ids, keys resolved
 * to those ids, and everything the file left out filled in with its default.
 */
export function fromDocument(document_) {
  const layers = readLayers(document_.layers);

  const areaIds = new Map();
  const areas = (document_.areas ?? []).map((node) => {
    const at = readPosition(node.shape?.position);
    const id = crypto.randomUUID();
    areaIds.set(node.key, id);

    return {
      id,
      ...rules.withDefaults(rules.AREA_DEFAULTS, {
        title: node.title?.trim(),
        description: node.description,
        owner: node.owner,
        type: node.type,
        colorIndex: node.shape?.color,
        x: at && Math.round(at.x),
        y: at && Math.round(at.y),
        titleAngle: node.shape?.titleAngle,
        fontWeight: node.shape?.weight,
        fontSize: node.shape?.size,
        titleScale: node.shape?.titleScale,
        opacity: node.shape?.opacity,
      }),
    };
  });
  /** The area a record names, or none — the validator has refused a name that is not there. */
  const areaNamed = (node) => (node.area == null ? null : areaIds.get(node.area) ?? null);

  const domainIds = new Map();
  const domains = (document_.domains ?? []).map((node) => {
    const at = readPosition(node.shape?.position);
    const titleAt = readPosition(node.shape?.titlePosition);
    const id = crypto.randomUUID();
    domainIds.set(node.key, id);

    return {
      id,
      ...rules.withDefaults(rules.DOMAIN_DEFAULTS, {
        areaId: areaNamed(node),
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

    // One position, read as the lobe when it has a domain and as its own spot
    // on the map when it has none — the same way it was written.
    return {
      id,
      ...rules.withDefaults(rules.CAPABILITY_DEFAULTS, {
        ...commonFields(node),
        domainId: home,
        // Inside a domain it belongs through the domain, so an area written on
        // it there means nothing and is not read.
        areaId: home === null ? areaNamed(node) : null,
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
        ...commonFields(node),
        areaId: areaNamed(node),
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
        ...commonFields(node),
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

  // A line is written under the element that owns it — an actor's under the
  // actor, a touchpoint's under the touchpoint — and between two capabilities
  // it is written at the top of the file, where there is no upper end to own
  // it. In memory they are one list: what the diagram draws is one kind of
  // thing wherever it was read from.
  const connectors = [];

  /**
   * Take up one line. `owner` is the end the file implied by where the record
   * sat; a flat record carries both ends itself. The pair is put in stack
   * order, so a line written the other way round still lands on its owner.
   */
  const take = (node, owner = null) => {
    const from = owner ?? endpoint(node.from, node.fromKind);
    // Nested under an owner, the far end's kind follows from the stack.
    const toKind = owner ? rules.CONNECTS_TO[owner.kind] : node.toKind;
    const to = endpoint(node.to, toKind);
    if (!from || !to) return;

    const ends = rules.orderEnds(from, to);
    if (!ends) return; // not a pair this model draws; the validator says so

    // The points were written for the ends as they were written. Swapping the
    // ends has to swap them too, or the line comes back attached elsewhere.
    const flipped = ends.upper !== from;
    connectors.push({
      id: crypto.randomUUID(),
      fromId: ends.upper.id,
      fromKind: ends.upper.kind,
      toId: ends.lower.id,
      toKind: ends.lower.kind,
      ...rules.withDefaults(rules.CONNECTOR_DEFAULTS, {
        description: node.description,
        fromPoint: flipped ? node.toPoint : node.fromPoint,
        toPoint: flipped ? node.fromPoint : node.toPoint,
        lineStyle: node.lineStyle,
        anchored: node.anchored,
        bendPoints: flipped ? reversedBends(node.bendPoints) : node.bendPoints,
      }),
    });
  };

  for (const [kind, list, ids] of [
    ['actor', document_.actors ?? [], actorIds],
    ['touchpoint', document_.touchpoints ?? [], touchpointIds],
  ]) {
    for (const node of list) {
      const id = ids.get(node.key);
      for (const line of node[rules.NESTED_UNDER[kind]] ?? []) take(line, { id, kind });
    }
  }

  // The flat list is capability-to-capability now. An older file wrote every
  // line here, typed ends and all, so those are taken up the same way and land
  // under their owners.
  for (const node of document_.connectors ?? []) take(node);

  return {
    title: document_.title?.trim() || 'Domain map',
    // What the business is. A field the file may leave out, so a map written
    // here still opens where the field is not known: it is read past.
    description: document_.description ?? '',
    palette: document_.palette ?? [],
    layers,
    types: readTypes(document_.types),
    areas,
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
  const layers = readLayers(state.layers);

  const areaSeen = new Map();
  const areaKeys = new Map();
  const areas = (state.areas ?? []).map((area) => {
    const key = unique(areaSeen, slugify(area.title));
    areaKeys.set(area.id, key);
    return compact({
      key,
      title: area.title,
      description: blank(area.description),
      owner: blank(area.owner),
      type: blank(area.type),
      shape: compact({
        // Where it sits while it holds nothing. Round its members, the band is
        // drawn from them and this is not looked at.
        position: position(area.x, area.y),
        titleAngle: area.titleAngle,
        color: area.colorIndex,
        size: area.fontSize,
        weight: area.fontWeight,
        titleScale: area.titleScale,
        opacity: area.opacity,
      }),
    });
  });
  const areaKeyOf = (record) => (record.areaId == null ? null : areaKeys.get(record.areaId) ?? null);

  const domainSeen = new Map();
  const domainKeys = new Map();
  const domains = state.domains.map((domain) => {
    const key = unique(domainSeen, slugify(domain.title));
    domainKeys.set(domain.id, key);
    return compact({
      key,
      area: areaKeyOf(domain),
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
      domain: home,
      area: home === null ? areaKeyOf(capability) : null,
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
        opacity: capability.opacity,
        order: capability.sortIndex,
        iconPlacement: placementOf(capability),
        iconWeight: weightOf(capability),
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
      area: areaKeyOf(touchpoint),
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
        opacity: touchpoint.opacity,
        order: touchpoint.sortIndex,
        iconPlacement: placementOf(touchpoint),
        iconWeight: weightOf(touchpoint),
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
        opacity: actor.opacity,
        order: actor.sortIndex,
        iconPlacement: placementOf(actor),
      }),
    });
  });

  const keysByKind = {
    capability: capabilityKeys,
    touchpoint: touchpointKeys,
    actor: actorKeys,
  };
  const known = (kind, id) => keysByKind[kind]?.has(id) === true;

  /**
   * A line as it is written under its owner: the far end and its own shape.
   * Neither end's kind is written — the owner is one, and what it reaches
   * follows from the stack — and the near end is the record it sits inside.
   */
  const line = (connector) => compact({
    to: keysByKind[connector.toKind].get(connector.toId),
    description: blank(connector.description),
    fromPoint: connector.fromPoint,
    toPoint: connector.toPoint,
    lineStyle: connector.lineStyle,
    anchored: connector.anchored,
    bendPoints: connector.bendPoints?.length ? connector.bendPoints : null,
  });

  const drawn = (state.connectors ?? []).filter((connector) =>
    known(connector.fromKind, connector.fromId) && known(connector.toKind, connector.toId));

  /** One element's own lines, in the order the map holds them. */
  const linesOf = (kind, id) => drawn
    .filter((connector) => connector.fromKind === kind && connector.fromId === id)
    .map(line);

  for (const [kind, written, records] of [
    ['actor', actors, state.actors ?? []],
    ['touchpoint', touchpoints, state.touchpoints ?? []],
  ]) {
    records.forEach((record, at) => {
      const mine = linesOf(kind, record.id);
      if (mine.length > 0) written[at][rules.NESTED_UNDER[kind]] = mine;
    });
  }

  // What is left at the top of the file is what no element owns: the lines
  // between two capabilities, which have no upper end to sit under.
  const connectors = drawn
    .filter((connector) => connector.fromKind === 'capability')
    .map((connector) => compact({
      from: keysByKind.capability.get(connector.fromId),
      ...line(connector),
    }));

  const types = Object.fromEntries(
    rules.ELEMENT_KINDS
      .map((kind) => [kind, state.types?.[kind] ?? []])
      .filter(([, choices]) => choices.length > 0));

  return compact({
    version: CURRENT_VERSION,
    title: state.title,
    description: blank(state.description),
    palette: state.palette.length === 0 ? null : state.palette,
    // Key and state only. What a layer is called belongs to the model, so a
    // file cannot rename one into meaning something it does not.
    layers: layers.map((layer) => compact({
      key: layer.key,
      hidden: layer.hidden === true ? true : null,
      dimmed: layer.dimmed === true ? true : null,
    })),
    types: Object.keys(types).length === 0 ? null : types,
    // Only when there are any, as touchpoints and actors are: a map that draws
    // no organisation says nothing about one.
    areas: areas.length === 0 ? null : areas,
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

  const descriptionError = rules.validateMapDescription(document_.description);
  if (descriptionError) return descriptionError;

  const paletteError = rules.validatePalette(document_.palette);
  if (paletteError) return paletteError;

  const layerError = rules.validateLayers(document_.layers);
  if (layerError) return layerError;

  const typeError = rules.validateTypes(document_.types);
  if (typeError) return typeError;

  if (document_.areas != null && !Array.isArray(document_.areas)) return 'Areas must be a list.';
  const areaKeys = new Set();
  for (const area of document_.areas ?? []) {
    if (!area?.key || area.key.trim().length === 0) return 'Every area needs a key.';
    if (areaKeys.has(area.key)) return `Two areas share the key '${area.key}'.`;
    areaKeys.add(area.key);

    const shape = area.shape;
    if (unreadable(shape?.position)) return `Area '${area.key}': a position must read as "x,y".`;

    const error = rules.validateArea({
      title: area.title,
      description: area.description,
      owner: area.owner,
      type: area.type,
      colorIndex: shape?.color,
      fontSize: shape?.size,
      fontWeight: shape?.weight,
      titleScale: shape?.titleScale,
      titleAngle: shape?.titleAngle,
      opacity: shape?.opacity,
    });
    if (error) return `Area '${area.key}': ${error}`;
  }
  /** An area a record names has to be in the file, as a capability's domain does. */
  const strayArea = (label, node) =>
    (node.area != null && !areaKeys.has(node.area)
      ? `${label} '${node.key}' names area '${node.area}', which is not in the file.`
      : null);

  const domainKeys = new Set();
  for (const domain of document_.domains ?? []) {
    if (!domain.key || domain.key.trim().length === 0) return 'Every domain needs a key.';
    if (domainKeys.has(domain.key)) return `Two domains share the key '${domain.key}'.`;
    domainKeys.add(domain.key);
    const lostArea = strayArea('Domain', domain);
    if (lostArea) return lostArea;

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
    const lostArea = strayArea('Capability', capability);
    if (lostArea) return lostArea;

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
      opacity: shape?.opacity,
      icon: capability.icon,
      iconPlacement: shape?.iconPlacement,
      iconWeight: shape?.iconWeight,
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

      if (unreadable(node.shape?.position))
        return `${label} '${node.key}': a position must read as "x,y".`;
      // An actor stands outside the business, so an area on one is read past
      // rather than looked up.
      const lostArea = kind === 'touchpoint' ? strayArea(label, node) : null;
      if (lostArea) return lostArea;

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
        opacity: node.shape?.opacity,
        icon: node.icon,
        iconPlacement: node.shape?.iconPlacement,
        iconWeight: node.shape?.iconWeight,
      });
      if (error) return `${label} '${node.key}': ${error}`;
    }
    keysByKind[kind] = keys;
  }

  /**
   * One line, wherever it was written. `owner` is the end the file implied by
   * where the record sat; a flat record names both ends itself.
   */
  const checkLine = (node, owner = null) => {
    const from = owner ?? { key: node.from, kind: node.fromKind ?? 'capability' };
    const to = {
      key: node.to,
      kind: owner ? rules.CONNECTS_TO[owner.kind] : node.toKind ?? 'capability',
    };
    const named = `Connector '${from.key}' – '${to.key}'`;

    // A nested line names no kinds, so only a flat one can name a wrong one.
    const wrongPair = rules.connectorRule(from.kind, to.kind);
    if (wrongPair) return `${named}: ${wrongPair}`;

    for (const end of [from, to]) {
      if (!keysByKind[end.kind]?.has(end.key))
        return `${named} names an element that is not in the file.`;
    }
    if (from.key === to.key && from.kind === to.kind)
      return 'A connector needs two different elements.';

    const error = rules.validateConnector(node);
    return error ? `${named}: ${error}` : null;
  };

  for (const [kind, list] of [
    ['actor', document_.actors ?? []],
    ['touchpoint', document_.touchpoints ?? []],
  ]) {
    for (const node of list) {
      const own = node[rules.NESTED_UNDER[kind]];
      if (own != null && !Array.isArray(own))
        return `${kind} '${node.key}': ${rules.NESTED_UNDER[kind]} must be a list.`;
      for (const nested of own ?? []) {
        const wrong = checkLine(nested, { key: node.key, kind });
        if (wrong) return wrong;
      }
    }
  }

  for (const connector of document_.connectors ?? []) {
    const wrong = checkLine(connector);
    if (wrong) return wrong;
  }

  return null;
}
