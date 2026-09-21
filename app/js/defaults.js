// How a new shape looks, and what Reset shapes puts back. This is the one
// place to change that — the "Shape defaults" chapter of design-system.md says
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

export const AREA_SHAPE = Object.freeze({
  /** One line: an area's title rides its border, and a legend does not wrap. */
  title: 'New area',
  /**
   * A hex colour, matched to the nearest swatch in the map's palette. It is the
   * border's colour and the wash's, so it wants to be one that reads as a line.
   */
  color: '#5985ab',
  /**
   * Percent, 0 to 100 in steps of 10 — the one shape that may go to 0, which is
   * a border and no fill at all. A tenth, so the area still reads when the map
   * is zoomed out and the line has gone thin.
   */
  opacity: 10,
  fontSize: 64,
  fontWeight: 'bold',
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
  /** Percent, 10 to 100 in steps of 10. Solid, unlike a domain. */
  opacity: 100,
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
  /** Percent, 10 to 100 in steps of 10. */
  opacity: 100,
});

export const ACTOR_SHAPE = Object.freeze({
  title: 'New actor',
  /** A hex colour, matched to the nearest swatch in the map's palette. */
  color: '#a1a4ec',
  fontSize: 32,
  fontWeight: 'regular',
  /**
   * The Shape size multiple. An actor is a circle, so it has no stretch. Two
   * steps up the scale rather than one: at 1 an actor reads as a capability
   * that happens to be round, and a person standing outside the business
   * should not look like a part of it.
   */
  sizeScale: 1.4,
  /**
   * Percent, 10 to 100 in steps of 10. Half, so the terrain under an actor
   * still reads: it stands on the map rather than covering it.
   */
  opacity: 50,
});
