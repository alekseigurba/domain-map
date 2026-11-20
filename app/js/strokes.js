// The maths of a drawing: what someone draws over the map with a marker,
// thinned to the points a line needs, drawn smooth, found again by an eraser,
// and taken back in the order it was made. Pure, like geometry.js and
// viewport.js — no DOM, no store — so it runs headless under test.
//
// A stroke is `{ id, marker, width, points }`: which marker drew it, how wide
// it is, and the points it runs through as flat x,y pairs, the way a line's
// bends are written. All of it is in the world's own units, the ones the shapes
// are drawn in, so a stroke stays on the terrain through every pan and zoom.
//
// A drawing is `{ strokes, undo, next }`: the strokes in the order they were
// made, which is the order they are painted in; what would take each step
// back; and the id the next stroke gets. Every function that changes a drawing
// answers with a new one rather than changing the one it was given, so a
// caller decides when a change is applied — and can show one it has not yet
// made, as an eraser does while it is still being dragged.

/**
 * The markers there are, in the order the tray holds them. A name, not a
 * colour: the stylesheet says what each one looks like, so a theme can restate
 * the colours and a drawing already made follows it.
 */
export const MARKERS = Object.freeze(['red', 'orange', 'green', 'blue', 'ink']);

/** The marker in hand when Draw is first pressed: the one that reads against the most fills. */
export const DEFAULT_MARKER = 'red';

/**
 * How many steps back a drawing remembers. An undo that takes back a clear
 * holds every stroke the clear took, so the history is what a long session's
 * drawing weighs — and it is kept in the tab's storage, which is not large.
 */
export const UNDO_DEPTH = 100;

export const EMPTY = Object.freeze({ strokes: Object.freeze([]), undo: Object.freeze([]), next: 1 });

/** Two places is finer than a marker's edge at any zoom the map reaches, and a third of the text of writing them all out. */
const rounded = (n) => Math.round(n * 100) / 100;

/** Flat x,y pairs as points. */
export function pairs(flat) {
  const points = [];
  for (let i = 0; i + 1 < (flat?.length ?? 0); i += 2) points.push({ x: flat[i], y: flat[i + 1] });
  return points;
}

/** Points as flat x,y pairs, rounded to what a stroke is kept at. */
export const flat = (points) => points.flatMap((p) => [rounded(p.x), rounded(p.y)]);

/**
 * How wide a marker's stroke is in the world, for a marker `px` wide on screen
 * at zoom `k`. Taken once, when the stroke is begun: the marker is as wide in
 * the hand at every zoom, and the line it leaves belongs to the map from then
 * on, thinning as the map is zoomed out like everything else on it.
 */
export const widthAt = (px, k) => px / k;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** How far a point is from the stretch of line between two others. */
function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return distance(p, a);
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return distance(p, { x: a.x + dx * t, y: a.y + dy * t });
}

/**
 * Whether a point the pointer has reported is worth keeping while a stroke is
 * being drawn: far enough from the last one kept. A pointer reports a point
 * for every pixel and more, and a hand held still reports the same one over
 * and over.
 */
export const worthKeeping = (points, point, least) =>
  points.length === 0 || distance(points.at(-1), point) >= least;

/**
 * The points of a finished stroke, fewer: every point the line can lose
 * without moving more than `tolerance` from where it ran. The ends always
 * stay — a stroke begins and ends where the hand did — and so does every
 * corner sharper than the tolerance, so a zigzag keeps its teeth while a long
 * straight run comes down to its two ends. This is what keeps a drawing small
 * enough to be kept in the tab's storage and written into an exported picture.
 */
export function thinned(points, tolerance) {
  if (points.length <= 2) return [...points];
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  // Runs still to be looked at, each between two points already kept. A stack
  // and not a function calling itself: a stroke can hold thousands of points.
  const runs = [[0, points.length - 1]];
  while (runs.length > 0) {
    const [from, to] = runs.pop();
    let farthest = -1;
    let reach = tolerance;
    for (let i = from + 1; i < to; i++) {
      const off = distanceToSegment(points[i], points[from], points[to]);
      if (off > reach) { reach = off; farthest = i; }
    }
    if (farthest < 0) continue;
    keep[farthest] = true;
    runs.push([from, farthest], [farthest, to]);
  }
  return points.filter((_, i) => keep[i]);
}

const written = (n) => String(rounded(n));
const at = (p) => `${written(p.x)} ${written(p.y)}`;

/** The point halfway from one point to another, or only `most` of the way there if that is nearer. */
function toward(from, to, most) {
  const length = distance(from, to);
  const t = length === 0 ? 0 : Math.min(0.5, most / length);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/**
 * A stroke's points as the path that is drawn. The line bends at each point
 * rather than turning there: it leaves the straight a little before the point
 * and rejoins it a little after, curving past the point between, so what was
 * drawn by hand looks drawn by hand and not plotted — and holds up when the
 * map is zoomed in further than it was drawn at, where a run of short straight
 * lines would show its joints.
 *
 * "A little" is half the way to the next point and never more than `round`,
 * which is given as the stroke's own width. Along a curve the points are close
 * and the whole line is bends, each meeting the next halfway. Where thinning
 * has left two long straight runs meeting at a corner, only the corner is
 * rounded, and by no more than the marker is wide — so the line never leaves
 * the ink of the one the hand drew, an arrowhead keeps its point, and letting
 * go of a stroke does not change its shape under the pointer.
 *
 * It begins and ends exactly where the hand did. A press that went nowhere is
 * a dot: a line too short to have a direction, which the marker's round end
 * makes a spot of.
 */
export function strokePath(points, round = Infinity) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${at(points[0])} l 0.01 0`;

  let d = `M ${at(points[0])}`;
  let pen = at(points[0]);
  for (let i = 1; i < points.length - 1; i++) {
    const before = at(toward(points[i], points[i - 1], round));
    const after = at(toward(points[i], points[i + 1], round));
    if (before !== pen) d += ` L ${before}`;
    d += ` Q ${at(points[i])} ${after}`;
    pen = after;
  }
  return `${d} L ${at(points.at(-1))}`;
}

/** The box a stroke's points lie in, before its width. */
function boxOf(points) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of points) {
    box.minX = Math.min(box.minX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxX = Math.max(box.maxX, p.x);
    box.maxY = Math.max(box.maxY, p.y);
  }
  return box;
}

/**
 * The strokes an eraser at `point` touches, as their ids: every one whose ink
 * comes within `reach` of it. The ink is the line and half its width either
 * side, so a fat stroke is caught by its edge and not only down its middle —
 * and it is measured along the straight runs between the points, which the
 * drawn line never leaves by more than that half width. An eraser takes the
 * whole stroke — a flow is redrawn, not trimmed.
 */
export function strokesUnder(strokes, point, reach) {
  const touched = [];
  for (const stroke of strokes) {
    const within = reach + stroke.width / 2;
    const points = pairs(stroke.points);
    const box = boxOf(points);
    if (point.x < box.minX - within || point.x > box.maxX + within
      || point.y < box.minY - within || point.y > box.maxY + within) continue;

    const hit = points.length === 1
      ? distance(point, points[0]) <= within
      : points.some((p, i) => i > 0 && distanceToSegment(point, points[i - 1], p) <= within);
    if (hit) touched.push(stroke.id);
  }
  return touched;
}

// --- a drawing, and taking it back ---------------------------------------------

const remembering = (undo, step) => [...undo, step].slice(-UNDO_DEPTH);

/** The drawing with one more stroke on it, given as `{ marker, width, points }` with the points as points. */
export function drawn(drawing, { marker, width, points }) {
  const stroke = { id: drawing.next, marker, width: rounded(width), points: flat(points) };
  return {
    strokes: [...drawing.strokes, stroke],
    undo: remembering(drawing.undo, { what: 'stroke', drew: stroke.id }),
    next: drawing.next + 1,
  };
}

/**
 * The drawing without the strokes named, as one step to take back — however
 * many an eraser's drag crossed. Each stroke taken is remembered with where it
 * stood in the order, so that undoing puts it back under the strokes drawn
 * over it. Naming none that are there changes nothing, and is not a step.
 */
export function erased(drawing, ids, what = 'erasing') {
  const going = new Set(ids);
  const taken = drawing.strokes
    .map((stroke, index) => ({ stroke, index }))
    .filter(({ stroke }) => going.has(stroke.id));
  if (taken.length === 0) return drawing;
  return {
    strokes: drawing.strokes.filter((stroke) => !going.has(stroke.id)),
    undo: remembering(drawing.undo, { what, took: taken }),
    next: drawing.next,
  };
}

/** The drawing with nothing on it — which Undo puts back, so it need not ask first. */
export const cleared = (drawing) =>
  erased(drawing, drawing.strokes.map((stroke) => stroke.id), 'clearing');

/**
 * One step back: `{ drawing, undid }`, where `undid` says what was taken back
 * — 'stroke', 'erasing' or 'clearing' — and is null when there was nothing to.
 */
export function undone(drawing) {
  const step = drawing.undo.at(-1);
  if (!step) return { drawing, undid: null };

  const undo = drawing.undo.slice(0, -1);
  if (step.drew !== undefined) {
    return {
      drawing: { ...drawing, strokes: drawing.strokes.filter((stroke) => stroke.id !== step.drew), undo },
      undid: step.what,
    };
  }
  // Back in, lowest first, each at the place it was taken from.
  const strokes = [...drawing.strokes];
  for (const { stroke, index } of step.took) strokes.splice(Math.min(index, strokes.length), 0, stroke);
  return { drawing: { ...drawing, strokes, undo }, undid: step.what };
}

// --- kept between reloads --------------------------------------------------------

const isStroke = (stroke) =>
  stroke !== null && typeof stroke === 'object'
  && Number.isInteger(stroke.id) && stroke.id > 0
  && MARKERS.includes(stroke.marker)
  && Number.isFinite(stroke.width) && stroke.width > 0
  && Array.isArray(stroke.points) && stroke.points.length >= 2 && stroke.points.length % 2 === 0
  && stroke.points.every(Number.isFinite);

const isStep = (step) =>
  step !== null && typeof step === 'object' && typeof step.what === 'string'
  && (Number.isInteger(step.drew)
    || (Array.isArray(step.took) && step.took.length > 0
      && step.took.every((one) => one !== null && typeof one === 'object'
        && Number.isInteger(one.index) && one.index >= 0 && isStroke(one.stroke))));

/**
 * A drawing read back from wherever it was kept, or an empty one. What a tab
 * wrote down may be from before the code moved on, or cut short by a full
 * store, and a drawing that cannot be read is no reason for the page not to
 * open: any part of it that is not what this file writes and the whole of it
 * is let go.
 */
export function readDrawing(kept) {
  if (kept === null || typeof kept !== 'object') return EMPTY;
  const { strokes, undo, next } = kept;
  if (!Array.isArray(strokes) || !strokes.every(isStroke)) return EMPTY;
  if (!Array.isArray(undo) || !undo.every(isStep)) return EMPTY;

  // The next id is past every one in use, whatever the kept one says: two
  // strokes with one id would be erased and undone as one.
  const used = [
    ...strokes.map((stroke) => stroke.id),
    ...undo.flatMap((step) => (step.took ?? []).map((one) => one.stroke.id)),
  ];
  const past = Math.max(0, ...used) + 1;
  return { strokes, undo, next: Number.isInteger(next) && next >= past ? next : past };
}
