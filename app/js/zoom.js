// How much of the map's lines is spelt out: the decisions behind the level of
// detail and the deep zoom. The map is one continuous terrain — nothing on it
// moves — and a line may end on a domain, on a capability or on a feature. What
// changes is the level its lines are drawn at. At the feature level every line
// is drawn where it really ends. At the capability level a line that ends on a
// feature leaves from the capability that holds it, and at the domain level
// every line leaves from a domain, lines to the same pair of places folding
// into one. The level is chosen by whoever is looking, and is the same whether
// they are browsing or editing; the zoom only decides what there is to end a
// line on, since a feature is drawn only once its capability has opened. Pure,
// like geometry.js and viewport.js — no DOM, no store — so it runs headless
// under test.

/** The levels a map's lines may be drawn at, coarsest first: the kinds of the terrain. */
export const LEVELS = Object.freeze(['domain', 'capability', 'feature']);

/**
 * The level a map opens at: every line where it really ends. It is the level
 * there is nothing to explain about — what is drawn is what was drawn — and so
 * the one that does not change under anyone when they stop editing.
 */
export const DEFAULT_LEVEL = 'feature';

/**
 * How many of its folded lines to other domains a domain keeps, at the domain
 * level, while nothing is picked. Two, because one says only who a domain
 * talks to most and three is most of them on a map of ten domains: the level
 * is for the main roads, and picking a domain is what asks for the rest.
 */
export const AT_REST = 2;

/**
 * How large on screen, in pixels, a feature's name has to be before its
 * capability opens onto its features. Smaller than this the names are a
 * texture inside the oval, and the capability's own title, which they would
 * take the room of, says more.
 */
export const READ_PX = 10;

/** How far in a map may ever zoom, however small its smallest feature is set. */
export const DEEPEST = 24;

const sameAs = (selection, kind, id) => selection?.type === kind && selection.id === id;
const samePlace = (a, b) => a.kind === b.kind && a.id === b.id;
const nameOf = (place) => `${place.kind}:${place.id}`;

/**
 * The strongest `keep` lines of every domain, as one set: a line is drawn when
 * either of its ends counts it among its strongest, so no domain that has a
 * line is left without one. Heavier first; between two as heavy, the shorter,
 * since a line to a neighbour crosses less of the map than one to the far side
 * of it; and the key last, so the choice never wobbles from one render to the
 * next.
 */
export function strongest(lines, { keep = AT_REST, lengthOf = () => 0 } = {}) {
  const byEnd = new Map();
  for (const line of lines) {
    for (const end of [line.from, line.to]) {
      const name = nameOf(end);
      if (!byEnd.has(name)) byEnd.set(name, []);
      byEnd.get(name).push(line);
    }
  }
  const length = new Map(lines.map((line) => [line.key, lengthOf(line)]));
  const order = (a, b) => b.weight - a.weight
    || length.get(a.key) - length.get(b.key)
    || a.key.localeCompare(b.key);

  const kept = new Set();
  for (const own of byEnd.values()) {
    for (const line of own.sort(order).slice(0, keep)) kept.add(line.key);
  }
  return lines.filter((line) => kept.has(line.key));
}

/**
 * The map's lines as a level draws them.
 *
 * Each end of a line is **lifted** to the first shape, going up from where it
 * really ends, that this level draws lines to and that is on the stage: a
 * feature to its capability at the capability level, or at any level while its
 * capability is shut; a capability to its domain at the domain level. A line
 * whose ends are both where they really are is drawn as the line it is. One
 * with an end lifted is drawn between the places it was lifted to, and every
 * line lifted to the same pair of places is one **folded line**, as heavy as
 * what it carries, keeping the real lines inside it. A line whose two ends
 * lift to the same place is inside that place, and at this level is not drawn.
 *
 * At the domain level the folded lines between two domains are thinned: while
 * nothing is picked each domain keeps its strongest. Picking is how the rest
 * are asked for. A domain picked shows every line it has and no other
 * domain's; a shape picked that this level would have lifted is left where it
 * is, so its lines leave from the shape itself; a line picked shows the fold
 * it is in, and no other.
 *
 * A fold is not drawn where a line that really joins the same two places is:
 * the pair is already shown as joined, by the line someone drew to say so.
 *
 * Lines on the presentation layer are drawn as they are at every level.
 *
 * @param connectors `[{ id, fromKind, fromId, toKind, toId }]`
 * @param options.level     one of LEVELS
 * @param options.holderOf  `(kind, id)` → the `{ kind, id }` that holds a shape, or null
 * @param options.drawn     `(kind, id)` → whether the shape is on the stage to end a line on
 * @param options.selection `{ type, id }`, what is picked
 * @param options.keep      how many folded lines a domain keeps at rest
 * @param options.lengthOf  how long a folded line would be drawn, to choose between two as heavy
 * @returns `{ drawn, folded, all }`: the lines drawn as they are; the folded
 *   lines to draw, each `{ key, from, to, parts, weight, picked }` with `from`
 *   and `to` a `{ kind, id }`; and every folded line there is, drawn or not.
 */
export function foldLines(connectors, {
  level = DEFAULT_LEVEL, holderOf, drawn: onStage = () => true, selection = null,
  keep = AT_REST, lengthOf = () => 0,
}) {
  const floor = LEVELS.indexOf(level);
  const terrain = (kind) => LEVELS.includes(kind);
  const tooFine = (place) => LEVELS.indexOf(place.kind) > floor;
  /** Whether what is picked is something this level would otherwise have put away. */
  let asked = level === 'domain' && selection?.type === 'domain';

  /** An end and everything that holds it, innermost first. */
  const chainOf = (kind, id) => {
    const chain = [{ kind, id }];
    for (let up = holderOf(kind, id); up; up = holderOf(up.kind, up.id)) chain.push(up);
    return chain;
  };
  /** How far up its chain an end is drawn: the first place that is on the stage and coarse enough, or picked. */
  const lifted = (chain) => {
    for (let at = 0; at < chain.length; at++) {
      const place = chain[at];
      if (!onStage(place.kind, place.id)) continue;
      if (!tooFine(place)) return at;
      if (sameAs(selection, place.kind, place.id)) {
        asked = true;
        return at;
      }
    }
    // Nothing above it to lift to — a capability in no domain, at the domain
    // level — so it stays the highest place it has.
    return chain.length - 1;
  };

  const drawn = [];
  const joined = new Set();
  const folds = new Map();

  for (const connector of connectors) {
    if (!terrain(connector.fromKind) || !terrain(connector.toKind)) {
      drawn.push(connector);
      continue;
    }
    const from = chainOf(connector.fromKind, connector.fromId);
    const to = chainOf(connector.toKind, connector.toId);
    let a = lifted(from);
    let b = lifted(to);
    // Only a pick leaves one end below a place the other was lifted to. That
    // place holds the picked shape, and a line is not drawn from a shape to
    // what holds it: the lifted end steps back down until it is clear of it.
    const within = (chain, at, other) => other.some((place) => samePlace(place, chain[at]));
    while (b > 0 && !samePlace(from[a], to[b]) && within(to, b, from.slice(a))) b -= 1;
    while (a > 0 && !samePlace(from[a], to[b]) && within(from, a, to.slice(b))) a -= 1;
    if (samePlace(from[a], to[b])) continue;
    if (!onStage(from[a].kind, from[a].id) || !onStage(to[b].kind, to[b].id)) continue;

    // A line has two ends and no direction, so the pair is put in one order
    // and a line drawn the other way round is the same pair.
    const ends = [from[a], to[b]].sort((x, y) => nameOf(x).localeCompare(nameOf(y)));
    const key = ends.map(nameOf).join('|');
    if (a === 0 && b === 0) {
      drawn.push(connector);
      joined.add(key);
      continue;
    }
    if (!folds.has(key)) {
      folds.set(key, { key, from: ends[0], to: ends[1], parts: [], weight: 0, picked: false });
    }
    const fold = folds.get(key);
    fold.parts.push(connector);
    fold.weight += 1;
    if (sameAs(selection, 'connector', connector.id)) {
      fold.picked = true;
      if (level === 'domain') asked = true;
    }
  }

  const all = [...folds.values()];
  const betweenDomains = (line) => line.from.kind === 'domain' && line.to.kind === 'domain';
  const touches = (line) => line.picked
    || [line.from, line.to].some((end) => sameAs(selection, end.kind, end.id));

  // The thinning is the domain level's: a level asked for by name, to see the
  // main roads. Further in, a fold is a line that could not be drawn to its
  // own end, and leaving any of those out would be losing a line.
  const overview = level === 'domain' ? all.filter(betweenDomains) : [];
  const kept = new Set((asked
    ? overview.filter(touches)
    : strongest(overview, { keep, lengthOf })).map((line) => line.key));
  const folded = all.filter((line) => !joined.has(line.key)
    && (level !== 'domain' || !betweenDomains(line) || kept.has(line.key)));

  return { drawn, folded, all };
}

/**
 * How wide a folded line is drawn, in screen pixels: heavier with what it
 * carries, by its doublings, so that one line and eight are told apart without
 * eight being a road. Never a hairline, and never so wide that it reads as a
 * shape.
 */
export const foldedWidth = (weight) => Math.min(7, 2.5 + Math.log2(Math.max(1, weight)) * 1.25);

/** Whether a capability whose features' names are set at `fontSize` is open at zoom `k`. */
export const opensAt = (fontSize, k) => fontSize > 0 && fontSize * k >= READ_PX;

/**
 * The zoom at which a capability whose features are set at `fontSize` reads
 * comfortably: half as large again as the size it opens at.
 */
export const zoomToRead = (fontSize) => (READ_PX * 1.5) / fontSize;

/**
 * The zoom just past where such a capability opens: the least a glide into it
 * may stop at, with enough to spare that a nudge of the wheel does not shut it.
 */
export const zoomToOpen = (fontSize) => (READ_PX * 1.1) / fontSize;

/**
 * Where a glide into a capability stops. `taken` is the zoom that takes the
 * capability in as one thing among its neighbours, and `whole` the zoom at
 * which its oval just fits the stage. A capability that holds features is
 * brought closer than `taken` when it has to be to read them comfortably — but
 * not so close that its oval runs off the stage, for a capability of thirty
 * features is read by looking across all of them. Only where even the whole
 * oval is too small to open does the glide go past it, since a capability that
 * stayed shut would leave nothing to show for the double-click.
 */
export function zoomInto(fontSize, { taken, whole }) {
  if (!(fontSize > 0)) return taken;
  return Math.max(taken, Math.min(zoomToRead(fontSize), Math.max(whole, zoomToOpen(fontSize))));
}

/**
 * How far in this map may zoom: as far as the map always could, and further
 * when the smallest type any feature is set in needs it to be read. The limit
 * comes from the map and not from a number, because a capability of thirty
 * features sets them smaller than one of three, and a limit that suits the one
 * leaves the other shut for good.
 *
 * @param fontSizes the type every capability's features are set in
 * @param limits    `{ min, max }`, the map's own
 */
export function limitsFor(fontSizes, limits) {
  const smallest = Math.min(...fontSizes.filter((size) => size > 0));
  if (!Number.isFinite(smallest)) return { min: limits.min, max: limits.max };
  return {
    min: limits.min,
    max: Math.max(limits.max, Math.min(DEEPEST, zoomToRead(smallest) * 1.5)),
  };
}
