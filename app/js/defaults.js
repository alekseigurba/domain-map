// How a new domain or capability looks, and what Reset shapes puts back. This
// is the one place to change that — the README's "Shape defaults" chapter says
// what each value may be, and `node tests/defaults.test.mjs` checks them.
//
// Plain data with no DOM behind it, so the importer and the tests read it too.

export const DOMAIN_SHAPE = Object.freeze({
  /** A newline breaks the title, the way Ctrl-Enter does on the map. */
  title: 'New\ndomain',
  /** A hex colour, matched to the nearest swatch in the map's palette. */
  color: '#d4d1cf',
  /** Percent, 10 to 100 in steps of 10. */
  opacity: 20,
  fontSize: 72,
  fontWeight: 'regular',
  /** The Title size multiple. */
  titleScale: 1,
});

export const CAPABILITY_SHAPE = Object.freeze({
  title: 'New capability',
  /** A hex colour, matched to the nearest swatch in the map's palette. */
  color: '#86a27b',
  fontSize: 32,
  fontWeight: 'regular',
  /** The Shape size multiple. */
  sizeScale: 1,
  /** How the oval leans: -2 tall, 0 round, 2 wide. Ctrl-< and Ctrl-> step it. */
  stretch: 2,
});

export const TOUCHPOINT_SHAPE = Object.freeze({
  title: 'New touchpoint',
  /** A hex colour, matched to the nearest swatch in the map's palette. */
  color: '#7fc6d8',
  fontSize: 32,
  fontWeight: 'regular',
  /** The Shape size multiple, as a capability's is. */
  sizeScale: 1,
  /** How the rectangle leans: -2 tall, 0 square, 2 wide. */
  stretch: 2,
});

export const ACTOR_SHAPE = Object.freeze({
  title: 'New actor',
  /** A hex colour, matched to the nearest swatch in the map's palette. */
  color: '#a1a4ec',
  fontSize: 32,
  fontWeight: 'regular',
  /** The Shape size multiple. An actor is a circle, so it has no stretch. */
  sizeScale: 1,
});

/**
 * The layers a new map is drawn on, bottom first. The base layer is the one at
 * the bottom: it can be dimmed but never hidden, and an element that names no
 * layer is on it. A map carries its own list, so these are only the starting
 * two — see docs/releases/2.1.0.md.
 */
export const LAYERS = Object.freeze([
  Object.freeze({ key: 'core', title: 'Core Business Domains' }),
  Object.freeze({ key: 'presentation', title: 'Presentation' }),
]);

/** Where each kind of element is added unless the layer picker says otherwise. */
export const HOME_LAYER = Object.freeze({
  domain: 'core',
  capability: 'core',
  touchpoint: 'presentation',
  actor: 'presentation',
});
