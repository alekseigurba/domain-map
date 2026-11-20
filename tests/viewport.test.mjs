// Headless check for the pan and zoom maths. Nothing to stub: viewport.js
// touches no DOM, which is the point of it.
//   node tests/viewport.test.mjs

import * as vp from '../app/js/viewport.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const near = (a, b) => Math.abs(a - b) < 1e-9;
const same = (p, q) => near(p.x, q.x) && near(p.y, q.y);
const show = (value) => JSON.stringify(value);

const stage = { width: 1200, height: 800 };

// --- clamping ---
check('a zoom inside the limits is left as it is', vp.clampZoom(1.5) === 1.5);
check('the map zooms out no further than its limit', vp.clampZoom(0.001) === vp.ZOOM_LIMITS.min);
check('and in no further than its limit', vp.clampZoom(40) === vp.ZOOM_LIMITS.max);
check('a page of its own can set limits of its own', vp.clampZoom(40, { min: 0.5, max: 8 }) === 8
  && vp.clampZoom(0.1, { min: 0.5, max: 8 }) === 0.5);
check('a limit left out falls back on the map\'s', vp.clampZoom(40, { min: 0.5 }) === vp.ZOOM_LIMITS.max);

// --- screen and world ---
const view = { k: 2, x: 100, y: -50 };
const world = { x: 30, y: 70 };
check('a world point is drawn where the transform puts it',
  same(vp.worldToScreen(view, world), { x: 160, y: 90 }), show(vp.worldToScreen(view, world)));
check('and screen to world is the way back', same(vp.screenToWorld(view, vp.worldToScreen(view, world)), world));
check('the identity view draws the world as it is', same(vp.worldToScreen(vp.IDENTITY, world), world));

// --- panning ---
const panned = vp.panBy(view, 15, -5);
check('a pan moves the view by the distance on screen', panned.x === 115 && panned.y === -55, show(panned));
check('and leaves the zoom alone', panned.k === view.k);
check('and answers with a new view rather than changing the one given', view.x === 100 && panned !== view);

// --- zooming about a point ---
const pointer = { x: 420, y: 310 };
const under = vp.screenToWorld(view, pointer);
const closer = vp.zoomAt(view, pointer, 1.5);
check('zooming multiplies the zoom by the factor', near(closer.k, 3), show(closer));
check('the world point under the pointer stays under it',
  same(vp.worldToScreen(closer, under), pointer), show(vp.worldToScreen(closer, under)));
const stopped = vp.zoomAt({ k: 3.5, x: 0, y: 0 }, pointer, 10);
check('a zoom stopped by the limit goes only as far as the limit', stopped.k === vp.ZOOM_LIMITS.max);
check('and the point under the pointer still stays under it at the limit',
  same(vp.worldToScreen(stopped, vp.screenToWorld({ k: 3.5, x: 0, y: 0 }, pointer)), pointer));
check('zooming in and back out by the same factor returns to the same view', (() => {
  const back = vp.zoomAt(vp.zoomAt(view, pointer, 1.7), pointer, 1 / 1.7);
  return near(back.k, view.k) && near(back.x, view.x) && near(back.y, view.y);
})());

// --- the wheel ---
check('scrolling down zooms out and scrolling up zooms in', vp.wheelFactor(100) < 1 && vp.wheelFactor(-100) > 1);
check('one long scroll zooms as far as two half-length ones',
  near(vp.wheelFactor(200), vp.wheelFactor(100) * vp.wheelFactor(100)));

// --- centring ---
const centred = vp.centerOn(view, world, stage);
check('centring puts the world point in the middle of the stage',
  same(vp.worldToScreen(centred, world), { x: 600, y: 400 }), show(centred));
check('centring keeps the zoom', centred.k === view.k);
check('the middle of the stage is the point just centred on', same(vp.viewportCenter(centred, stage), world));

// --- the box round many ---
check('the union of no boxes is nothing, for the caller to decide about', vp.unionBox([]) === null);
check('the union holds every box given', show(vp.unionBox([
  { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  { minX: -5, minY: 4, maxX: 3, maxY: 20 },
])) === show({ minX: -5, minY: 0, maxX: 10, maxY: 20 }));

// --- fitting a box ---
const wide = { minX: -500, minY: -100, maxX: 1500, maxY: 100 };
const fitted = vp.fitBox(wide, stage, { padding: 32 });
check('a box is centred on the stage', same(vp.worldToScreen(fitted, { x: 500, y: 0 }), { x: 600, y: 400 }), show(fitted));
check('its longer side is what touches the padding',
  near(vp.worldToScreen(fitted, { x: wide.minX, y: 0 }).x, 32)
  && near(vp.worldToScreen(fitted, { x: wide.maxX, y: 0 }).x, stage.width - 32));
check('and the shorter side sits inside it', (() => {
  const top = vp.worldToScreen(fitted, { x: 0, y: wide.minY }).y;
  return top > 32 && near(top + vp.worldToScreen(fitted, { x: 0, y: wide.maxY }).y, stage.height);
})());
check('a pin-sized box zooms only as far as the limit', vp.fitBox({ minX: 0, minY: 0, maxX: 2, maxY: 2 }, stage).k === vp.ZOOM_LIMITS.max);
check('a box too big for the stage is centred at the furthest zoom out',
  vp.fitBox({ minX: 0, minY: 0, maxX: 1e7, maxY: 1e7 }, stage).k === vp.ZOOM_LIMITS.min);
check('a point is centred rather than lost',
  same(vp.worldToScreen(vp.fitBox({ minX: 7, minY: 9, maxX: 7, maxY: 9 }, stage), { x: 7, y: 9 }), { x: 600, y: 400 }));
check('fitting honours limits of its own', vp.fitBox({ minX: 0, minY: 0, maxX: 2, maxY: 2 }, stage, { max: 20 }).k === 20);
check('a size can be a DOMRect, since it carries a width and a height', (() => {
  const rect = { left: 40, top: 60, width: 1200, height: 800, right: 1240, bottom: 860 };
  return show(vp.fitBox(wide, rect, { padding: 32 })) === show(fitted);
})());

// The diagram's Fit to screen before this module existed, kept here verbatim
// so the refactor can be seen to change nothing about where the map lands.
const oldFit = (bounds, rect) => {
  const padding = 32;
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const height = Math.max(1, bounds.maxY - bounds.minY);
  const k = Math.min(4, Math.max(0.05,
    Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height)));
  return { k, x: rect.width / 2 - ((bounds.minX + bounds.maxX) / 2) * k, y: rect.height / 2 - ((bounds.minY + bounds.maxY) / 2) * k };
};
for (const box of [wide, { minX: -400, minY: -300, maxX: 400, maxY: 300 }, { minX: 3, minY: 3, maxX: 3, maxY: 3 }]) {
  check(`Fit to screen lands where it always did on ${show(box)}`,
    show(vp.fitBox(box, stage, { padding: 32 })) === show(oldFit(box, stage)));
}

// --- a glide ---
const far = { k: 0.2, x: 400, y: 300 };
const close = vp.fitBox({ minX: 2000, minY: -900, maxX: 2260, maxY: -730 }, stage, { padding: 40, max: 8 });
const sameView = (a, b) => near(a.k, b.k) && near(a.x, b.x) && near(a.y, b.y);
check('a glide starts at the view it leaves', sameView(vp.between(far, close, 0, stage), far),
  show(vp.between(far, close, 0, stage)));
check('and ends at the view it was sent to', sameView(vp.between(far, close, 1, stage), close),
  show(vp.between(far, close, 1, stage)));
const halfway = vp.between(far, close, 0.5, stage);
check('the zoom moves by a constant factor a step: halfway is the geometric middle',
  near(halfway.k, Math.sqrt(far.k * close.k)), show(halfway));
// Where it is heading only ever comes nearer the middle of the stage.
const heading = vp.viewportCenter(close, stage);
const offCentre = (t) => {
  const at = vp.worldToScreen(vp.between(far, close, t, stage), heading);
  return Math.hypot(at.x - stage.width / 2, at.y - stage.height / 2);
};
const steps = Array.from({ length: 21 }, (_, i) => offCentre(i / 20));
check('where a glide is heading never swings away from the middle on its way in',
  steps.every((distance, i) => i === 0 || distance <= steps[i - 1] + 1e-9), show(steps.map(Math.round)));
check('a glide out behaves as a glide in does',
  sameView(vp.between(close, far, 0, stage), close) && sameView(vp.between(close, far, 1, stage), far));
check('easing starts at nothing, ends at all of it, and is halfway at half',
  vp.eased(0) === 0 && vp.eased(1) === 1 && near(vp.eased(0.5), 0.5));
check('and never runs backwards',
  Array.from({ length: 20 }, (_, i) => vp.eased((i + 1) / 20) - vp.eased(i / 20)).every((step) => step >= 0));

console.log(failures === 0 ? '\nAll viewport checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
