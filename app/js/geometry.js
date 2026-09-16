// Shape maths: text measurement, capability ovals, snap points, lobed domain
// blobs and the flower layout inside each lobe. Pure functions — no DOM writes.

import { DOMAIN_SHAPE, CAPABILITY_SHAPE } from './defaults.js';

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* The sizes a domain title may be set at. A domain name is read from further
   out than anything else on the map, so the scale runs coarser and higher than
   the capability one below. */
export const FONT_SIZES = [32, 36, 48, 64, 72, 80, 100];
export const FONT_WEIGHTS = ['regular', 'bold'];

/**
 * Capability type is a scale of its own, deliberately not the domain scale
 * above: a capability's title is a label on a shape, not running copy, and the
 * two are free to move apart.
 */
export const CAPABILITY_FONT_SIZES = [24, 32, 36, 48, 52, 56, 64, 72, 80];

/** Every size the palette may be extended to. */
export const PALETTE_SIZES = [12, 18, 24];
/* The stock palette: the stylesheet's 24 fills, --c1 … --c24. */
export const DEFAULT_PALETTE = Array.from({ length: 24 }, (_, i) => cssVar(`--c${i + 1}`) || '#86a27b');

/**
 * The colours in play. The map carries its own palette once one has been
 * edited; until then these are the ones from the stylesheet.
 */
export let COLORS = [...DEFAULT_PALETTE];

/** Point the shapes at a palette — the map's own, or back to the stylesheet's. */
export function setPalette(colors) {
  COLORS = colors?.length ? [...colors] : [...DEFAULT_PALETTE];
}

/**
 * The swatch a colour is worn as, counted from 1 the way colorIndex is: the
 * one holding exactly that colour, or failing that the nearest. A shape stores
 * a swatch rather than a colour, so a default written as hex has to land on
 * one — and a map whose palette has been edited may no longer hold it.
 */
export function swatchFor(hex) {
  const wanted = channels(hex);
  let best = 0;
  let distance = Infinity;
  COLORS.forEach((color, i) => {
    const d = channels(color).reduce((sum, value, c) => sum + (value - wanted[c]) ** 2, 0);
    if (d < distance) {
      best = i;
      distance = d;
    }
  });
  return best + 1;
}

export const SNAP_COUNT = 24;
export const MAX_LINES = 3;
/** A capability's oval is fixed, so its type wraps into however many rows fit. */
export const MAX_CAPABILITY_LINES = 8;
/* The defaults themselves are in defaults.js; these are the names the drawing
   code falls back on when a record carries no value of its own. */
export const DEFAULT_FONT_SIZE = CAPABILITY_SHAPE.fontSize;
export const DEFAULT_DOMAIN_FONT_SIZE = DOMAIN_SHAPE.fontSize;
export const DEFAULT_FONT_WEIGHT = DOMAIN_SHAPE.fontWeight;
export const DEFAULT_CAPABILITY_FONT_WEIGHT = CAPABILITY_SHAPE.fontWeight;
export const DEFAULT_OPACITY = DOMAIN_SHAPE.opacity; // percent
export const DEFAULT_STRETCH = CAPABILITY_SHAPE.stretch;

/**
 * A capability's oval is sized by its scale and nothing else. Type size used to
 * push the shape about, which made laying a map out a fight between the two;
 * now the shape is chosen and the words wrap into it.
 */
export const SIZE_SCALES = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3];
/** A domain's title box is scaled on its own, and on the older, finer scale. */
export const TITLE_SCALES = [0.6, 0.8, 1, 1.25, 1.5, 2];
export const BASE_RX = 130;
export const BASE_RY = 84;

/**
 * How a capability's oval leans, from standing tall (-2) through round (0) to
 * lying wide (2). The two radii trade places in even steps, so the middle step
 * is a circle and the two ends are the same oval a quarter turn apart. Wide is
 * the shape capabilities have always had.
 */
export const OVAL_STRETCHES = [-2, -1, 0, 1, 2];

export const LINE_STYLES = ['straight', 'curved'];

/** How far the title lobe may hang off the body, as a share of its diameter. */
export const TITLE_OVERHANG = 0.6;

/** How narrow and how wide a domain title's text area may be dragged. */
export const MIN_TITLE_WIDTH = 40;
export const MAX_TITLE_WIDTH = 2000;
/** The width a title wraps at until one is set, as a multiple of the font size. */
export const TITLE_WIDTH_PER_EM = 7;

/** Clear air between two capabilities in a domain, and between two domains. */
export const CAPABILITY_GAP = 50;
export const DOMAIN_GAP = 75;

/* Breathing room around a capability's text, as a share of the font size. */
const PAD_X = 0.25;
const PAD_Y = 0.14;
/* A domain title sits in a box of its own, and wants far less air at the sides:
   the box is drawn around the text, so any slack there reads as a gap. */
const TITLE_PAD_X = 0.1;

/* A capability's icon, as shares of its font size: how big, and the air under it. */
const ICON_SHARE = 1.15;
const ICON_GAP = 0.28;

const LOBE_PAD = 34;      // ring of blob around each capability
const BODY_REACH = 0.6;   // how far past its outermost lobes' middles the body reaches, as a share of their radii
const BODY_ASPECT = 1.2;  // an empty domain's body is a little wider than it is tall

const heading = cssVar('--font-heading') || 'ui-serif, serif';
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

export const cssWeight = (weight) => (weight === 'regular' ? 'normal' : 'bold');

export function measure(text, fontSize, weight = 'regular') {
  context.font = `${weight === 'bold' ? 'bold ' : ''}${fontSize}px ${heading}`;
  return context.measureText(text).width;
}

/**
 * Greedy word wrap, tail cut with an ellipsis. A newline in `text` is a break
 * the author asked for: it always starts a row, and the row budget grows to
 * hold it. Text with no newlines wraps into `maxLines` rows, as it always has.
 */
export function wrapLines(text, fontSize, maxWidth, maxLines = MAX_LINES, weight = 'regular') {
  const paragraphs = String(text ?? '')
    .split('\n')
    .map((paragraph) => paragraph.trim().split(/\s+/).filter(Boolean));
  if (paragraphs.every((words) => words.length === 0)) return [''];

  const budget = Math.max(maxLines, paragraphs.length);
  // Every break the author typed keeps a row of its own; the rows left over are
  // what wrapping gets to spend, first paragraph first.
  let spare = budget - paragraphs.length;

  const rows = [];
  for (const words of paragraphs) {
    if (words.length === 0) {
      rows.push('');   // a deliberate blank row
      continue;
    }

    const wrapped = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, fontSize, weight) > maxWidth) {
        wrapped.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    wrapped.push(line);

    const allowed = 1 + Math.min(spare, wrapped.length - 1);
    spare -= allowed - 1;
    rows.push(...wrapped.slice(0, allowed));
    if (allowed < wrapped.length) {
      // This paragraph outran its rows: fold the rest into the last and cut it.
      rows[rows.length - 1] = ellipsize(
        wrapped.slice(allowed - 1).join(' '), fontSize, maxWidth, weight);
    }
  }

  return rows;
}

function ellipsize(text, fontSize, maxWidth, weight = 'regular') {
  if (measure(text, fontSize, weight) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, fontSize, weight) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

// --- ink -------------------------------------------------------------------

function channels(hex) {
  const value = String(hex).trim().replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const number = Number.parseInt(full, 16);
  return Number.isNaN(number)
    ? [255, 255, 255]
    : [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

const luminance = ([r, g, b]) => {
  const linear = [r, g, b].map((v) => {
    const channel = v / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

/**
 * Black or white, whichever reads better on `fill` — the palette runs from pale
 * pink to mid green, so one fixed ink colour cannot serve all twelve.
 * `opacity` blends the fill onto `backdrop` first (domain blobs are see-through).
 */
export function inkOn(fill, opacity = 1, backdrop = '#fffdfa') {
  const front = channels(fill);
  const back = channels(backdrop);
  const blended = front.map((value, i) => value * opacity + back[i] * (1 - opacity));
  const l = luminance(blended);
  // Contrast ratio against black vs white, using the WCAG formula.
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000' : '#fff';
}

// --- capabilities ----------------------------------------------------------

/**
 * The text block of a shape: wrapped lines and the box they need. Shared by
 * capability ovals and domain titles, so both wrap the same way.
 */
function textBlock(title, fontSize, weight, maxWidth = fontSize * 8, maxLines = MAX_LINES) {
  const lineHeight = fontSize * 1.18;
  const lines = wrapLines(title, fontSize, maxWidth, maxLines, weight);
  return {
    lines,
    lineHeight,
    fontSize,
    fontWeight: weight,
    width: Math.max(...lines.map((l) => measure(l, fontSize, weight)), fontSize),
    height: lines.length * lineHeight,
  };
}

/**
 * The radii of an oval at 1x. The long radius and the short one move towards
 * each other a step at a time, so round is the mean of the two. `??` and not
 * `||`, since round is 0; a value off the scale is held to its nearer end.
 */
function ovalRadii(stretch) {
  const tallest = OVAL_STRETCHES[0];
  const widest = OVAL_STRETCHES[OVAL_STRETCHES.length - 1];
  const held = Math.min(widest, Math.max(tallest, stretch ?? DEFAULT_STRETCH));
  const wide = (held - tallest) / (widest - tallest); // 0 standing tall, 1 lying wide
  return {
    rx: BASE_RY + (BASE_RX - BASE_RY) * wide,
    ry: BASE_RX + (BASE_RY - BASE_RX) * wide,
  };
}

/**
 * Oval for a capability. `sizeScale` sets how big it is and `stretch` which
 * way it leans; the text wraps into it, and is free to spill outside.
 */
export function capabilitySize(capability) {
  const fontSize = capability.fontSize || DEFAULT_FONT_SIZE;
  const fontWeight = capability.fontWeight || DEFAULT_CAPABILITY_FONT_WEIGHT;
  const scale = capability.sizeScale || 1;

  // The oval comes from the scale and the stretch alone. Nothing the type does moves it.
  const radii = ovalRadii(capability.stretch);
  const rx = radii.rx * scale;
  const ry = radii.ry * scale;

  // The largest rectangle that fits inside an ellipse has sides the radii over
  // sqrt(2). That box, less its padding, is what the words have to live in.
  const roomX = Math.max(fontSize, (rx / Math.SQRT2) * 2 - fontSize * PAD_X * 2);
  const roomY = (ry / Math.SQRT2) * 2 - fontSize * PAD_Y * 2;

  const iconSize = capability.icon ? fontSize * ICON_SHARE : 0;
  const gap = iconSize ? fontSize * ICON_GAP : 0;

  // However many rows are left under the icon, up to a sane ceiling. Text that
  // still will not fit is cut with an ellipsis, as it always was.
  const lineHeight = fontSize * 1.18;
  const rows = Math.max(1, Math.min(
    MAX_CAPABILITY_LINES,
    Math.floor((roomY - iconSize - gap) / lineHeight),
  ));
  const block = textBlock(capability.title, fontSize, fontWeight, roomX, rows);

  const stack = block.height + iconSize + gap;
  return {
    rx,
    ry,
    ...block,
    iconSize,
    // Both measured from the middle of the oval: the icon takes the top of the
    // stack, the words what is left under it.
    iconY: iconSize ? -(stack - iconSize) / 2 : 0,
    textY: iconSize ? (iconSize + gap) / 2 : 0,
  };
}

/** The connection points, evenly spaced around the perimeter (0 = 3 o'clock). */
export function snapPoints(rx, ry) {
  return Array.from({ length: SNAP_COUNT }, (_, i) => {
    const angle = (i * 2 * Math.PI) / SNAP_COUNT;
    return { index: i, x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
  });
}

/**
 * The way out of a snap point: square to the shape's edge where the line meets
 * it. The oval is stretched, so this is the gradient of its equation and not
 * simply the angle the snap point was placed at — on a wide, flat oval those
 * two part company badly.
 */
export function snapNormal(size, index) {
  const angle = (index * 2 * Math.PI) / SNAP_COUNT;
  const [x, y] = unit(Math.cos(angle) / (size.rx || 1), Math.sin(angle) / (size.ry || 1));
  return { x, y };
}

/**
 * The pair of snap points that puts a connector's ends closest together — what
 * a line re-attaches to once either capability has moved.
 */
export function closestSnapPair(fromPosition, fromSize, toPosition, toSize) {
  const from = snapPoints(fromSize.rx, fromSize.ry);
  const to = snapPoints(toSize.rx, toSize.ry);
  let best = { fromPoint: 0, toPoint: 0, distance: Infinity };

  for (const a of from) {
    for (const b of to) {
      const dx = (fromPosition.x + a.x) - (toPosition.x + b.x);
      const dy = (fromPosition.y + a.y) - (toPosition.y + b.y);
      const distance = dx * dx + dy * dy;
      if (distance < best.distance) best = { fromPoint: a.index, toPoint: b.index, distance };
    }
  }
  return best;
}

/** A connector path: a straight chord, or one bowed sideways by a fixed share. */
/**
 * Where a curved line bends when nobody has shaped it: one point, offset from
 * the midpoint in the direction the two ends face between them.
 *
 * How far it goes is set by how much the two normals agree. Ends facing each
 * other cancel out and the line runs almost straight between them; ends facing
 * the same way push the bend out, so the line swings clear instead of doubling
 * back over the shape it just left.
 */
export function autoBendPoints(from, to, fromNormal, toNormal) {
  const sumX = fromNormal.x + toNormal.x;
  const sumY = fromNormal.y + toNormal.y;
  const agreement = Math.hypot(sumX, sumY) / 2;   // 0 facing each other, 1 facing alike
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const reach = Math.min(span * BEND_SHARE, MAX_BEND_REACH) * agreement;
  const [outX, outY] = unit(sumX, sumY);
  return [{
    x: (from.x + to.x) / 2 + outX * reach,
    y: (from.y + to.y) / 2 + outY * reach,
  }];
}

/** How far a default bend swings out: a share of the run, and a hard ceiling. */
const BEND_SHARE = 0.45;
const MAX_BEND_REACH = 260;

/**
 * The direction the line travels at each point it passes through. The ends are
 * pinned to the shapes' normals so the line stands square to each edge where it
 * meets it; every point in between takes the run of its neighbours, which is
 * what carries the curve through a bend without a corner in it.
 */
function splineTangents(points, fromNormal, toNormal) {
  const last = points.length - 1;
  return points.map((point, i) => {
    if (i === 0) return fromNormal;
    // Arriving: the line travels *into* the far shape, against its normal.
    if (i === last) return { x: -toNormal.x, y: -toNormal.y };
    const [x, y] = unit(points[i + 1].x - points[i - 1].x, points[i + 1].y - points[i - 1].y);
    return { x, y };
  });
}

const round = (n) => Math.round(n * 100) / 100;

/**
 * A line from one snap point to another. Straight is a straight run. Curved is
 * a chain of cubics through every bend point, smooth across each one, leaving
 * and arriving square to the two shapes.
 *
 * `options` carries the bend points and the two normals; without normals it
 * falls back to the straight run between the ends, which is what a caller that
 * knows nothing of the shapes should get.
 */
export function connectorPath(from, to, style = 'straight', options = {}) {
  if (style !== 'curved') return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

  const [chordX, chordY] = unit(to.x - from.x, to.y - from.y);
  const fromNormal = options.fromNormal ?? { x: chordX, y: chordY };
  const toNormal = options.toNormal ?? { x: -chordX, y: -chordY };
  const bends = options.bendPoints?.length
    ? options.bendPoints
    : autoBendPoints(from, to, fromNormal, toNormal);

  const points = [from, ...bends, to];
  const tangents = splineTangents(points, fromNormal, toNormal);

  let d = `M ${round(from.x)} ${round(from.y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    // A third of the way along is the usual Catmull-Rom handle length; it keeps
    // the bulge in proportion to the segment however long or short it is.
    const pull = Math.hypot(b.x - a.x, b.y - a.y) / 3;
    const c1x = a.x + tangents[i].x * pull;
    const c1y = a.y + tangents[i].y * pull;
    const c2x = b.x - tangents[i + 1].x * pull;
    const c2y = b.y - tangents[i + 1].y * pull;
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(b.x)} ${round(b.y)}`;
  }
  return d;
}

/**
 * Which segment of a line a point falls on, and how far along it — what a
 * shift-click needs to know to drop a new bend in the right place.
 */
export function nearestSegment(points, x, y) {
  let best = { index: 0, distance: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const runX = b.x - a.x;
    const runY = b.y - a.y;
    const length = runX * runX + runY * runY;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * runX + (y - a.y) * runY) / length));
    const distance = Math.hypot(a.x + runX * t - x, a.y + runY * t - y);
    if (distance < best.distance) best = { index: i, distance };
  }
  return best;
}

// --- blobs -----------------------------------------------------------------

const BLOB_STEPS = 96;
const SCAN_STEPS = 30;   // coarse pass looking for the outermost surface crossing
const REFINE_STEPS = 14; // bisections after it
const BLEND = 1.7;       // low, so neighbouring lobes read as one mass

/**
 * A metaball field over the lobes: 1 exactly on a lone lobe's rim, more where
 * lobes overlap. Taking the surface at 1 fuses them into a single organic body —
 * a plain union would leave a crease, or a spike out to a distant lobe.
 */
function fieldAt(x, y, lobes) {
  let sum = 0;
  for (const lobe of lobes) {
    const q = ((x - lobe.x) / lobe.rx) ** 2 + ((y - lobe.y) / lobe.ry) ** 2;
    sum += Math.exp(-BLEND * (q - 1));
  }
  return sum;
}

/** How far the field reaches from the domain centre. */
function fieldReach(lobes) {
  return Math.max(...lobes.map((lobe) =>
    Math.hypot(lobe.x, lobe.y) + Math.max(lobe.rx, lobe.ry))) * 1.6;
}

/**
 * Where the surface sits along one ray: scan inward for the outermost crossing,
 * then bisect. The field is smooth, so the outline is too.
 */
function surfaceRadius(lobes, angle, reach) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const at = (r) => fieldAt(r * dx, r * dy, lobes);

  let inside = 0;
  let outside = reach;
  for (let i = SCAN_STEPS; i >= 1; i--) {
    const r = (reach * i) / SCAN_STEPS;
    if (at(r) >= 1) { inside = r; break; }
    outside = r;
  }
  if (inside === 0) return 0;

  for (let i = 0; i < REFINE_STEPS; i++) {
    const middle = (inside + outside) / 2;
    if (at(middle) >= 1) inside = middle;
    else outside = middle;
  }
  return inside;
}

/**
 * The outline, sampled along rays out of `centre`. That is the middle of the
 * body rather than the domain's own point: the lobes pull the body off it, and
 * the body's middle is the one place every ray is sure to start inside.
 */
function outlinePoints(shapes, centre) {
  const local = shapes.map((shape) => ({ ...shape, x: shape.x - centre.x, y: shape.y - centre.y }));
  const reach = fieldReach(local);
  return Array.from({ length: BLOB_STEPS }, (_, i) => {
    const angle = (i * 2 * Math.PI) / BLOB_STEPS;
    const radius = surfaceRadius(local, angle, reach);
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });
}

/** Catmull-Rom through the samples, emitted as cubic beziers. */
function closedSpline(points) {
  const n = points.length;
  const at = (i) => points[(i + n) % n];
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return `${path} Z`;
}

// --- domain layout ---------------------------------------------------------

/** One capability, one lobe: the oval it holds plus a ring of padding. */
export function lobeSizeFor(capability) {
  const { rx, ry } = capabilitySize(capability);
  return { rx: rx + LOBE_PAD, ry: ry + LOBE_PAD };
}

/** What a lobe measures before anything is put in it. */
export function defaultLobeSize() {
  return lobeSizeFor(CAPABILITY_SHAPE);
}

/** Points around an ellipse's rim — enough of them to test one shape against another. */
function rim(shape, steps = 16) {
  return Array.from({ length: steps }, (_, i) => {
    const angle = (i * 2 * Math.PI) / steps;
    return { x: shape.x + shape.rx * Math.cos(angle), y: shape.y + shape.ry * Math.sin(angle) };
  });
}

/** How far an ellipse reaches along a unit direction. */
const reachAlong = (shape, ux, uy) => Math.hypot(shape.rx * ux, shape.ry * uy);

const unit = (x, y) => {
  const length = Math.hypot(x, y);
  return length === 0 ? [0, -1] : [x / length, y / length];
};

/**
 * The body: one ovoid holding the lobes. Each of its four sides is set by the
 * lobes out on that side and nothing else, so moving a capability to the edge
 * pushes out that edge and leaves the other three where they were. It reaches
 * only part of the way across the outermost lobes, so each still swells the
 * outline instead of disappearing into a plain ellipse — and never pulls in
 * past the body an empty domain has, which keeps the domain's own middle, and
 * a title that has not been moved, inside it.
 */
function bodyFor(lobes) {
  const seed = defaultLobeSize();
  const home = { x: 0, y: 0, rx: seed.rx * BODY_ASPECT, ry: seed.ry };
  if (lobes.length === 0) return home;

  const left = Math.min(-home.rx, ...lobes.map((l) => l.x - l.rx * BODY_REACH));
  const right = Math.max(home.rx, ...lobes.map((l) => l.x + l.rx * BODY_REACH));
  const top = Math.min(-home.ry, ...lobes.map((l) => l.y - l.ry * BODY_REACH));
  const bottom = Math.max(home.ry, ...lobes.map((l) => l.y + l.ry * BODY_REACH));
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    rx: (right - left) / 2,
    ry: (bottom - top) / 2,
  };
}

/**
 * Where a new lobe goes: the first ring position that is clear of the ones
 * already there, walking outward until something fits.
 */
export function freeLobeSpot(taken, size = defaultLobeSize()) {
  if (taken.length === 0) return { x: 0, y: 0 };

  const clear = (x, y) => taken.every((lobe) =>
    Math.hypot((x - lobe.x) / (size.rx + lobe.rx), (y - lobe.y) / (size.ry + lobe.ry)) >= 1);

  // Walk outward and take the clear spot nearest the middle, so lobes pack
  // around the centre instead of trailing off in whichever direction was tried
  // first.
  const inner = Math.min(...taken.map((l) => Math.max(l.rx, l.ry)));
  let best = null;

  for (let ring = 0; ring < 14; ring++) {
    const radius = inner + size.rx * 0.5 + ring * size.rx * 0.35;
    for (let step = 0; step < 24; step++) {
      const angle = (step * 2 * Math.PI) / 24;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle) * 0.75;
      if (!clear(x, y)) continue;
      const distance = Math.hypot(x, y);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
    if (best) return { x: Math.round(best.x), y: Math.round(best.y) };
  }

  const far = Math.max(...taken.map((l) => Math.hypot(l.x, l.y) + Math.max(l.rx, l.ry)));
  return { x: Math.round(far + size.rx), y: 0 };
}

/**
 * Where the first capability in an empty domain goes: centred under the title
 * text, CAPABILITY_GAP clear of it. A title nobody has moved rides at the top
 * of the blob, and the lobe going in moves that top — so the spot is searched
 * for against the domain as it will be laid out with the capability in it.
 */
export function lobeUnderTitle(domain, capability = CAPABILITY_SHAPE) {
  const { ry } = capabilitySize(capability);
  const { title } = layoutDomain(domain, []);
  const x = title.x;

  // How far below its spot a lobe at `y` sits: under zero it is still in the
  // title's way, over zero it has room to come up.
  const excess = (y) => {
    const laid = layoutDomain(domain, [{ ...capability, lobeX: x, lobeY: y }]).title;
    return y - ry - (laid.y + laid.height / 2 + CAPABILITY_GAP);
  };

  const start = title.y + title.height / 2 + CAPABILITY_GAP + ry;
  let above = start;
  let below = start;
  for (let step = ry, i = 0; excess(above) > 0 && i < 12; step *= 2, i++) above -= step;
  for (let step = ry, i = 0; excess(below) < 0 && i < 12; step *= 2, i++) below += step;
  for (let i = 0; i < 20; i++) {
    const middle = (above + below) / 2;
    if (excess(middle) < 0) above = middle;
    else below = middle;
  }
  // Rounded down the page, so rounding never puts it back over the title.
  return { x: Math.round(x), y: Math.ceil(below) };
}

/**
 * Where a new capability goes in a domain: under the title if it is the first,
 * otherwise the first clear spot — with the title's own lobe counted as taken,
 * so a new capability never lands on the title.
 */
export function newLobeSpot(domain, children) {
  if (children.length === 0) return lobeUnderTitle(domain);
  const taken = children.map((c) => ({ x: c.lobeX ?? 0, y: c.lobeY ?? 0, ...lobeSizeFor(c) }));
  return freeLobeSpot([...taken, layoutDomain(domain, children).titleLobe]);
}

/**
 * Lays a domain out. One ovoid body, one lobe per capability wherever it has
 * been put, and a lobe of its own for the title — which may hang off the edge.
 *
 * @param domain   the domain record
 * @param children capabilities inside it
 * @param moving   optional {id, x, y} for a lobe being dragged right now
 * @param ui       {editing} — edit mode draws the lobes it lets you move
 */
export function layoutDomain(domain, children, moving = null, ui = {}) {
  const editing = ui.editing === true;

  const lobes = children.map((child) => {
    const size = lobeSizeFor(child);
    const at = moving && moving.id === child.id ? moving : child;
    return {
      item: child,
      kind: 'capability',
      x: at.lobeX ?? at.x ?? 0,
      y: at.lobeY ?? at.y ?? 0,
      rx: size.rx,
      ry: size.ry,
    };
  });

  const body = bodyFor(lobes);

  // --- the title, and the kebab that hangs off it ----------------------------
  const titleSize = domain.fontSize || DEFAULT_DOMAIN_FONT_SIZE;
  const titleWeight = domain.fontWeight || DEFAULT_FONT_WEIGHT;
  const titleScale = domain.titleScale || 1;
  const wrapWidth = titleWidthOf(domain);
  const block = textBlock(domain.title, titleSize, titleWeight, wrapWidth);
  const kebabRadius = titleSize * 0.34;

  // The text area is drawn around the text itself, not around the width it is
  // allowed to wrap at, so a short title carries no empty box either side. It
  // follows the text: retype the title and the box re-fits on the next render.
  const areaWidth = block.width + titleSize * TITLE_PAD_X * 2;

  const title = {
    ...block,
    size: titleSize,
    weight: titleWeight,
    wrapWidth,
    areaWidth,
    boxWidth: (areaWidth / 2) * titleScale,
    boxHeight: (block.height / 2 + titleSize * PAD_Y) * titleScale,
  };

  const titleLobe = {
    kind: 'title',
    rx: (title.boxWidth + LOBE_PAD * 0.6) * Math.SQRT2 * 0.85,
    ry: (title.boxHeight + LOBE_PAD * 0.6) * Math.SQRT2,
  };

  const wanted = moving && moving.id === 'title' ? moving : domain;
  const placed = clampTitle(
    wanted.titleX ?? domain.titleX ?? 0,
    wanted.titleY ?? domain.titleY ?? defaultTitleY(body, titleLobe, lobes),
    titleLobe, body, lobes);
  titleLobe.x = placed.x;
  titleLobe.y = placed.y;
  title.x = placed.x;
  title.y = placed.y;

  const kebab = {
    x: title.x + measure(block.lines[block.lines.length - 1], titleSize, titleWeight) / 2 + kebabRadius * 1.4,
    y: title.y + ((block.lines.length - 1) * block.lineHeight) / 2,
    r: kebabRadius,
  };

  // --- outline ---------------------------------------------------------------
  const outline = [body, ...lobes, titleLobe];
  const points = outlinePoints(outline, body);
  const extentWidth = Math.max(...points.map((p) => Math.abs(p.x)));
  const extentHeight = Math.max(...points.map((p) => Math.abs(p.y)));
  // The blob no longer sits evenly about the domain's point, so the extents
  // above only bound it; these are the edges themselves.
  const bounds = {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };

  const slots = lobes.map((lobe) => {
    const size = capabilitySize(lobe.item);
    return { kind: 'capability', item: lobe.item, x: lobe.x, y: lobe.y, rx: size.rx, ry: size.ry };
  });

  return {
    body,
    lobes,
    slots,
    title,
    titleLobe,
    kebab,
    editing,
    path: closedSpline(points),
    extentWidth,
    extentHeight,
    bounds,
    /** Is this point inside the blob? The field says so directly. */
    contains(x, y) {
      if (x === 0 && y === 0) return true;
      return fieldAt(x, y, outline) >= 1;
    },
    /** The lobe under a point, if any — what a drag picks up. */
    lobeAt(x, y) {
      return lobes.find((lobe) =>
        Math.hypot((x - lobe.x) / lobe.rx, (y - lobe.y) / lobe.ry) <= 1) ?? null;
    },
    /** Is a point on the title's own lobe? */
    onTitle(x, y) {
      return Math.hypot((x - titleLobe.x) / titleLobe.rx, (y - titleLobe.y) / titleLobe.ry) <= 1;
    },
  };
}

/**
 * Where the title sits before anyone moves it: clear of the top of the blob,
 * lobes included — the body alone stops short of them.
 */
/** The width a domain's title wraps at: what was dragged, or the default. */
export function titleWidthOf(domain) {
  const size = domain.fontSize || DEFAULT_DOMAIN_FONT_SIZE;
  const wanted = domain.titleWidth ?? size * TITLE_WIDTH_PER_EM;
  return Math.min(MAX_TITLE_WIDTH, Math.max(MIN_TITLE_WIDTH, wanted));
}

/**
 * Which snap point of an oval sits nearest (dx, dy), measured from its centre.
 * Undoing the ellipse's stretch first makes the nearest point the nearest
 * *angle*, which is what the eye reads when a line end is dragged around.
 */
export function nearestSnapIndex(size, dx, dy) {
  const angle = Math.atan2(dy / (size.ry || 1), dx / (size.rx || 1));
  const step = (2 * Math.PI) / SNAP_COUNT;
  return ((Math.round(angle / step) % SNAP_COUNT) + SNAP_COUNT) % SNAP_COUNT;
}

function defaultTitleY(body, titleLobe, lobes) {
  const top = Math.min(body.y - body.ry, ...lobes.map((lobe) => lobe.y - lobe.ry));
  return top + titleLobe.ry * 0.45;
}

/**
 * Keep the title attached. It may hang off the edge, but by no more than
 * TITLE_OVERHANG of its own diameter — beyond that it stops reading as part of
 * the same shape.
 */
function clampTitle(x, y, titleLobe, body, lobes) {
  const [ux, uy] = unit(x, y);
  const distance = Math.hypot(x, y);
  if (distance === 0) return { x, y };

  // How far the body reaches this way, lobes included. The lobes pull the body
  // off the domain's own point, so where its middle sits counts as well — and
  // counts against it too, or pushing out the bottom would let the title stray
  // further off the top.
  let surface = body.x * ux + body.y * uy + reachAlong(body, ux, uy);
  for (const lobe of lobes) {
    surface = Math.max(surface, Math.hypot(lobe.x, lobe.y) * dot(lobe, ux, uy) + reachAlong(lobe, ux, uy));
  }

  const reach = reachAlong(titleLobe, ux, uy);
  // The far edge may pass the surface by TITLE_OVERHANG of the diameter.
  const furthest = surface + TITLE_OVERHANG * 2 * reach - reach;
  const limited = Math.min(distance, Math.max(furthest, 0));
  return { x: ux * limited, y: uy * limited };
}

/** How much of a lobe's offset points the same way as a direction. */
function dot(lobe, ux, uy) {
  const length = Math.hypot(lobe.x, lobe.y);
  return length === 0 ? 0 : Math.max(0, (lobe.x * ux + lobe.y * uy) / length);
}
