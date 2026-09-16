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
