// The maths of looking at the map: where the stage's pan and zoom put a point,
// and what they become when someone scrolls, pinches, fits or centres. Pure,
// like geometry.js — no DOM, no store — so it runs headless under test, and a
// page built on the package can pan and zoom a drawing of its own the way the
// map does without borrowing the diagram along with it.
//
// A view is `{ k, x, y }`: the zoom, and where the world's origin lands on the
// stage in screen pixels. A point in the world is drawn at `world * k + (x, y)`,
// which is the `translate(x y) scale(k)` the diagram puts on its viewport.
// Every function answers with a new view rather than changing the one it was
// given, so a caller decides when the change is applied — and renders once.

/**
 * How far the map zooms. Out far enough that a map of a whole organization
 * fits a laptop; in far enough to read a capability's smallest type, and no
 * further, since past that a scroll only loses someone in one shape.
 */
export const ZOOM_LIMITS = Object.freeze({ min: 0.05, max: 4 });

/** Where every stage starts: no zoom, and the world's origin in the top-left corner. */
export const IDENTITY = Object.freeze({ k: 1, x: 0, y: 0 });

/** `k` held within the limits given, the map's own when none are. */
export function clampZoom(k, { min = ZOOM_LIMITS.min, max = ZOOM_LIMITS.max } = {}) {
  return Math.min(max, Math.max(min, k));
}

/**
 * How much one wheel event zooms by. Exponential in the scroll, so a trackpad's
 * many small deltas and a mouse's few large ones come to the same zoom for the
 * same distance scrolled, and scrolling back returns to exactly where it was.
 */
export const wheelFactor = (deltaY) => Math.exp(-deltaY * 0.0016);

/** Where a point on the stage, in screen pixels, is in the world. */
export function screenToWorld(view, point) {
  return { x: (point.x - view.x) / view.k, y: (point.y - view.y) / view.k };
}

/** Where a point in the world is drawn on the stage, in screen pixels. */
export function worldToScreen(view, point) {
  return { x: view.x + point.x * view.k, y: view.y + point.y * view.k };
}

/** The view moved by a distance on screen: a drag, or the drift of a pinch's centre. */
export function panBy(view, dx, dy) {
  return { k: view.k, x: view.x + dx, y: view.y + dy };
}

/**
 * The view zoomed by `factor` about a point on the stage, which stays under
 * the pointer — so scrolling over a shape closes in on that shape, not on the
 * corner of the stage. A zoom stopped by a limit moves the view only as far as
 * the zoom it actually got, or the point would slide away at the limit.
 */
export function zoomAt(view, point, factor, limits) {
  const k = clampZoom(view.k * factor, limits);
  const applied = k / view.k;
  return {
    k,
    x: point.x - (point.x - view.x) * applied,
    y: point.y - (point.y - view.y) * applied,
  };
}

/** The view at the same zoom, moved so that a point in the world is in the middle of the stage. */
export function centerOn(view, point, size) {
  return { k: view.k, x: size.width / 2 - point.x * view.k, y: size.height / 2 - point.y * view.k };
}

/** The world point in the middle of the stage: what someone is looking at, and where a new shape lands. */
export function viewportCenter(view, size) {
  return screenToWorld(view, { x: size.width / 2, y: size.height / 2 });
}

/**
 * The view part of the way from one view to another — `t` is 0 at the first
 * and 1 at the second — which is what a glide draws frame by frame. The zoom
 * moves by a constant factor a step, so a long dive feels as even as a short
 * one, and the place the glide is heading for crosses the stage in a straight
 * line to its middle: steered by the middle of the world instead, a deep zoom
 * in swings its target out towards the edge before bringing it back.
 */
export function between(from, to, t, size) {
  const k = from.k * (to.k / from.k) ** t;
  const heading = viewportCenter(to, size);
  const start = worldToScreen(from, heading);
  const at = {
    x: start.x + (size.width / 2 - start.x) * t,
    y: start.y + (size.height / 2 - start.y) * t,
  };
  return { k, x: at.x - heading.x * k, y: at.y - heading.y * k };
}

/** Slow away, slow to a stop: how a glide spends its time, 0 to 1 in and out. */
export const eased = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

/**
 * The box that holds every box given, or null for none — the caller knows
 * better than this does what an empty stage should be fitted to.
 */
export function unionBox(boxes) {
  if (boxes.length === 0) return null;
  return boxes.reduce((a, b) => ({
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }));
}

/**
 * The view that shows a box of the world whole, centred on a stage of `size`,
 * with `padding` screen pixels kept clear round it — Fit to screen with the
 * map's bounds, or a zoom to one part of a drawing with its own. The zoom is
 * the tighter of the two axes, so the box's longer side is what touches the
 * padding, and it is held within the limits: a box the size of a pin does not
 * zoom the stage to a blur, and one wider than the stage allows is centred at
 * the furthest zoom out rather than fitted. A box with no width or height is
 * treated as one unit across, so a single point is centred rather than lost.
 */
export function fitBox(box, size, { padding = 0, min, max } = {}) {
  const width = Math.max(1, box.maxX - box.minX);
  const height = Math.max(1, box.maxY - box.minY);
  const k = clampZoom(
    Math.min((size.width - padding * 2) / width, (size.height - padding * 2) / height),
    { min, max },
  );
  return centerOn({ k }, { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, size);
}
