// The map as a portable document, and back again. Records reference each other
// by `key` — a slug of the title — rather than by id, so the file stays
// readable and can be hand-edited. This is what lands on disk and what Export
// writes; ids live only in memory, made fresh each time a document is read.

import { slugify } from './store.js';
import * as rules from './rules.js';

export const CURRENT_VERSION = 1;

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

// --- reading -----------------------------------------------------------------

/**
 * A document as the editor holds it: flat records with fresh ids, keys resolved
 * to those ids, and everything the file left out filled in with its default.
 */
export function fromDocument(document_) {
  const domainIds = new Map();
  const domains = (document_.domains ?? []).map((node) => {
    const at = readPosition(node.shape?.position);
    const titleAt = readPosition(node.shape?.titlePosition);
    const id = crypto.randomUUID();
    domainIds.set(node.key, id);

    return {
      id,
      ...rules.withDefaults(rules.DOMAIN_DEFAULTS, {
        title: node.title?.trim(),
        description: node.description,
        owner: node.owner,
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
        domainId: home,
        title: node.title?.trim(),
        description: node.description,
        owner: node.owner,
        colorIndex: node.shape?.color,
        fontSize: node.shape?.size,
        fontWeight: node.shape?.weight,
        sizeScale: node.shape?.scale,
        stretch: node.shape?.stretch,
        x: home === null && at ? Math.round(at.x) : undefined,
        y: home === null && at ? Math.round(at.y) : undefined,
        lobeX: home !== null && at ? Math.round(at.x) : undefined,
        lobeY: home !== null && at ? Math.round(at.y) : undefined,
        sortIndex: node.shape?.order,
        icon: node.icon,
      }),
    };
  });

  const connectors = [];
  for (const node of document_.connectors ?? []) {
    const from = capabilityIds.get(node.from);
    const to = capabilityIds.get(node.to);
    if (!from || !to) continue;

    connectors.push({
      id: crypto.randomUUID(),
      fromCapabilityId: from,
      toCapabilityId: to,
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
    domains,
    capabilities,
    connectors,
  };
}

// --- writing -----------------------------------------------------------------

/** The map as it goes to disk: keys instead of ids, and nothing left implied. */
export function toDocument(state) {
  const domainSeen = new Map();
  const domainKeys = new Map();
  const domains = state.domains.map((domain) => {
    const key = unique(domainSeen, slugify(domain.title));
    domainKeys.set(domain.id, key);
    return compact({
      key,
      title: domain.title,
      description: blank(domain.description),
      owner: blank(domain.owner),
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
      title: capability.title,
      description: blank(capability.description),
      owner: blank(capability.owner),
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

  const connectors = state.connectors
    .filter((connector) =>
      capabilityKeys.has(connector.fromCapabilityId) && capabilityKeys.has(connector.toCapabilityId))
    .map((connector) => compact({
      from: capabilityKeys.get(connector.fromCapabilityId),
      to: capabilityKeys.get(connector.toCapabilityId),
      description: blank(connector.description),
      fromPoint: connector.fromPoint,
      toPoint: connector.toPoint,
      lineStyle: connector.lineStyle,
      anchored: connector.anchored,
      bendPoints: connector.bendPoints?.length ? connector.bendPoints : null,
    }));

  return compact({
    version: CURRENT_VERSION,
    title: state.title,
    palette: state.palette.length === 0 ? null : state.palette,
    domains,
    capabilities,
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

  const domainKeys = new Set();
  for (const domain of document_.domains ?? []) {
    if (!domain.key || domain.key.trim().length === 0) return 'Every domain needs a key.';
    if (domainKeys.has(domain.key)) return `Two domains share the key '${domain.key}'.`;
    domainKeys.add(domain.key);

    const shape = domain.shape;
    if (unreadable(shape?.position) || unreadable(shape?.titlePosition))
      return `Domain '${domain.key}': a position must read as "x,y".`;

    const error = rules.validateDomain({
      title: domain.title,
      description: domain.description,
      owner: domain.owner,
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

    const shape = capability.shape;
    if (unreadable(shape?.position))
      return `Capability '${capability.key}': a position must read as "x,y".`;

    const error = rules.validateCapability({
      title: capability.title,
      description: capability.description,
      owner: capability.owner,
      colorIndex: shape?.color,
      fontSize: shape?.size,
      fontWeight: shape?.weight,
      sizeScale: shape?.scale,
      stretch: shape?.stretch,
      icon: capability.icon,
    });
    if (error) return `Capability '${capability.key}': ${error}`;
  }

  for (const connector of document_.connectors ?? []) {
    if (!capabilityKeys.has(connector.from) || !capabilityKeys.has(connector.to)) {
      return `Connector '${connector.from}' – '${connector.to}' `
        + 'names a capability that is not in the file.';
    }
    if (connector.from === connector.to) return 'A connector needs two different capabilities.';

    const error = rules.validateConnector(connector);
    if (error) return `Connector '${connector.from}' – '${connector.to}': ${error}`;
  }

  return null;
}
