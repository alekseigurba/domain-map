// Draw mode: a marker in hand over a locked map. The map is the terrain and a
// flow is a route across it — which teams a payment passes through, where an
// order waits — traced for the conversation in front of it and gone with the
// tab. So a drawing is not part of the map: it is in no version and no export
// of the map, the store never hears of it, and anyone may make one, a viewer
// included, since nothing of it goes to the server.
//
// What is drawn is held in the world's own units and painted in a layer of its
// own inside the viewport, above every layer of the map, so it rides the
// terrain through pan and zoom with nothing here having to follow the view.
// The maths — thinning, the path, what an eraser touches, taking a step back —
// is strokes.js, which is pure; this file is the hand: the tray, the pointer,
// and what the tab remembers.

import * as strokes from './strokes.js';
import * as vp from './viewport.js';
import { currentView, holdStage } from './diagram.js';
import { subscribe } from './store.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Where the tab keeps the drawing. Session storage, like the unsaved edits
 * beside it and for the same reason: a refresh in the middle of a conversation,
 * or the trip out to sign in again, should not wipe the board, while a second
 * tab on the same map is somebody else's conversation and starts clean.
 */
const KEPT = 'domain-map:drawing';

/** How far from the last point kept the pointer has to travel before the next is worth keeping, in screen pixels. */
const LEAST_PX = 1.5;
/** How far thinning may move a finished stroke, in screen pixels at the zoom it was drawn at: less than can be seen. */
const THIN_PX = 0.6;
/**
 * How far round the pointer the eraser reaches, in screen pixels. Further
 * round a finger, which covers what it is aiming at and is three times the
 * width of a stroke to begin with.
 */
const ERASER_PX = 10;
const ERASER_TOUCH_PX = 18;

const svg = document.getElementById('diagram');
const layer = document.getElementById('layer-drawing');
const tray = document.getElementById('marker-tray');
const toggle = document.getElementById('draw-toggle');
const ring = document.getElementById('eraser-ring');
const eraserButton = document.getElementById('draw-eraser');
const undoButton = document.getElementById('draw-undo');
const clearButton = document.getElementById('draw-clear');
const markerButtons = [...tray.querySelectorAll('[data-marker]')];

let say = () => {};
let on = false;
let drawing = strokes.EMPTY;
let marker = strokes.DEFAULT_MARKER;
let erasing = false;
/**
 * What the pointer is in the middle of: a stroke being drawn, or the eraser
 * being dragged. Neither has happened to the drawing until the pointer is let
 * go, so either can be dropped — by Esc, or by a second finger turning the
 * gesture into a pinch — and leave no trace.
 */
let hand = null;
/** Space is down: the next drag pans the map instead of drawing on it. */
let panning = false;
/** Whether the map this page loaded has arrived. The one after it is a different map. */
let mapSeen = false;
let frame = 0;

// --- what the tab remembers ----------------------------------------------------

/**
 * Which map a drawing was made on, as far as the tab can say: the address names
 * the version open, and the published one keeps the clean address. A drawing
 * is only put back over the address it was kept at — the same tab pointed at
 * another version by a pasted link is another terrain, and strokes laid over it
 * would mean nothing.
 */
const address = () => location.pathname + location.search;

function keep() {
  try {
    if (drawing.strokes.length === 0 && drawing.undo.length === 0) sessionStorage.removeItem(KEPT);
    else sessionStorage.setItem(KEPT, JSON.stringify({ at: address(), drawing }));
  } catch {
    /* full, or switched off: the drawing carries on, and a refresh starts with a clean map */
  }
}

function kept() {
  try {
    const record = JSON.parse(sessionStorage.getItem(KEPT));
    return record?.at === address() ? strokes.readDrawing(record.drawing) : strokes.EMPTY;
  } catch {
    return strokes.EMPTY;
  }
}

// --- drawing it ------------------------------------------------------------------

function strokeNode(stroke, points) {
  const node = document.createElementNS(SVG_NS, 'path');
  node.setAttribute('class', 'stroke');
  // Which marker, not which colour: the stylesheet says what a marker looks
  // like, so a drawing follows a change of theme like everything else.
  node.setAttribute('data-marker', stroke.marker);
  node.setAttribute('stroke-width', stroke.width);
  node.setAttribute('d', strokes.strokePath(points, stroke.width));
  return node;
}

/** Paint a drawing — the one there is, or one an eraser still in hand would leave. */
function show(what = drawing) {
  layer.replaceChildren(...what.strokes.map((stroke) => strokeNode(stroke, strokes.pairs(stroke.points))));
  if (hand?.kind === 'stroke') layer.appendChild(hand.node);
  showTray();
}

function showTray() {
  for (const button of markerButtons) {
    button.setAttribute('aria-pressed', String(!erasing && button.dataset.marker === marker));
  }
  eraserButton.setAttribute('aria-pressed', String(erasing));
  undoButton.disabled = drawing.undo.length === 0;
  clearButton.disabled = drawing.strokes.length === 0;
}

function showMode() {
  toggle.setAttribute('aria-pressed', String(on));
  toggle.title = on
    ? 'Put the marker down. What is drawn stays on the map.'
    : 'Draw on the map with a marker';
  tray.hidden = !on;
  // The cursor says what a press would do: draw, erase, or pan while Space is held.
  if (on) svg.dataset.drawing = panning ? 'pan' : erasing ? 'eraser' : 'marker';
  else delete svg.dataset.drawing;
  if (!on || !erasing || panning) ring.hidden = true;
}

// --- the pointer -----------------------------------------------------------------

function worldOf(event, view, rect = svg.getBoundingClientRect()) {
  return vp.screenToWorld(view, { x: event.clientX - rect.left, y: event.clientY - rect.top });
}

const markerPx = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--marker-width')) || 6;

/**
 * The stage's question, asked of every press while Draw is on: is this one
 * yours? Not while Space is held — that drag pans, and the diagram sees to it.
 */
function press(event) {
  if (panning) return false;
  const view = currentView();
  const world = worldOf(event, view);

  if (erasing) {
    hand = {
      kind: 'eraser',
      pointerId: event.pointerId,
      taken: new Set(),
      reach: event.pointerType === 'touch' ? ERASER_TOUCH_PX : ERASER_PX,
    };
    rub(world, view);
    return true;
  }

  const stroke = { marker, width: strokes.widthAt(markerPx(), view.k) };
  hand = {
    kind: 'stroke',
    pointerId: event.pointerId,
    ...stroke,
    k: view.k,
    points: [world],
    node: strokeNode(stroke, [world]),
  };
  layer.appendChild(hand.node);
  return true;
}

/** Take whatever the eraser is over now, and show the drawing as it would be left. */
function rub(world, view) {
  const before = hand.taken.size;
  const left = drawing.strokes.filter((stroke) => !hand.taken.has(stroke.id));
  for (const id of strokes.strokesUnder(left, world, hand.reach / view.k)) hand.taken.add(id);
  if (hand.taken.size !== before) show(strokes.erased(drawing, [...hand.taken]));
}

function onPointerMove(event) {
  if (on && erasing && !panning) placeRing(event);
  if (!hand || event.pointerId !== hand.pointerId) return;

  // A pointer reports more often than the page is told about: the reports in
  // between are what keep a fast stroke round rather than faceted.
  const view = currentView();
  const rect = svg.getBoundingClientRect();
  const reports = event.getCoalescedEvents?.() ?? [];
  for (const report of reports.length > 0 ? reports : [event]) {
    const world = worldOf(report, view, rect);
    if (hand.kind === 'eraser') rub(world, view);
    else if (strokes.worthKeeping(hand.points, world, LEAST_PX / view.k)) hand.points.push(world);
  }

  if (hand.kind === 'stroke') {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (hand?.kind === 'stroke') hand.node.setAttribute('d', strokes.strokePath(hand.points, hand.width));
    });
  }
}

function onPointerUp(event) {
  if (!hand || event.pointerId !== hand.pointerId) return;
  const done = hand;
  hand = null;

  drawing = done.kind === 'eraser'
    ? strokes.erased(drawing, [...done.taken])
    : strokes.drawn(drawing, {
      marker: done.marker,
      width: done.width,
      points: strokes.thinned(done.points, THIN_PX / done.k),
    });
  show();
  keep();
}

/** Drop what the pointer was in the middle of: a stroke half drawn is no stroke, and an eraser half dragged took nothing. */
function letGo() {
  if (!hand) return false;
  hand = null;
  show();
  return true;
}

/**
 * The eraser's reach, drawn round the pointer: a ring the size of what a press
 * would take. Not for a finger, which has no pointer to draw it round until it
 * is already pressing.
 */
function placeRing(event) {
  if (event.pointerType === 'touch') {
    ring.hidden = true;
    return;
  }
  const rect = svg.getBoundingClientRect();
  ring.style.left = `${event.clientX - rect.left}px`;
  ring.style.top = `${event.clientY - rect.top}px`;
  ring.hidden = false;
}

// --- the tray, and the keys ------------------------------------------------------

/**
 * A press with a pointer leaves the keyboard on the page rather than on the
 * button pressed: Space pans from there, where on the button it would press it
 * again. A press made with the keyboard stays where it is, since that focus is
 * how the next control is reached.
 */
function rest(event) {
  if (event.detail > 0) event.currentTarget.blur();
}

function undo() {
  // With a stroke in hand, the stroke in hand is what is taken back.
  if (letGo()) return;
  const { drawing: back, undid } = strokes.undone(drawing);
  if (!undid) {
    say('Nothing drawn to take back');
    return;
  }
  drawing = back;
  show();
  keep();
  say({
    stroke: 'Took back the last stroke',
    erasing: 'Put back what the eraser took',
    clearing: 'Put the drawing back',
  }[undid]);
}

function clear() {
  drawing = strokes.cleared(drawing);
  show();
  keep();
  say('Cleared the drawing — Undo puts it back');
}

function holdPan(next) {
  if (panning === next) return;
  panning = next;
  showMode();
}

/** Turn Draw on or off. Off puts the marker down and leaves the drawing where it is. */
export function setDrawing(next) {
  if (on === next) return;
  on = next;
  letGo();
  panning = false;
  // Draw hands over a marker, the one last used: coming back to find the
  // eraser still in hand, the first stroke of a new thought rubs out the last.
  erasing = false;
  holdStage(on ? { press } : null);
  showMode();
  showTray();
}

/**
 * Whether there is a Draw to press at all. Not while the map is being edited:
 * a marker is for a map that holds still, and Edit is left by saving or
 * cancelling, which is a decision Draw has no business making for anyone. So
 * the chip goes while Edit is on, and going into Edit puts the marker down.
 */
export function allowDrawing(allowed) {
  toggle.hidden = !allowed;
  if (!allowed) setDrawing(false);
}

/**
 * The keys that are the marker's while Draw is on, answered true when one was
 * taken: Ctrl+Z for the drawing's own undo — the map's has nothing to undo
 * outside Edit — Esc to drop the stroke in hand or else put the marker down,
 * and Space, held, to pan. A field being typed in keeps Ctrl+Z and Space, a
 * dialog over the map keeps Esc, and a button with the focus keeps Space, which
 * is how a keyboard presses it.
 */
export function drawingTakesKey(event, typing) {
  if (!on) return false;

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    if (typing) return false;
    event.preventDefault();
    undo();
    return true;
  }
  if (document.querySelector('dialog[open]')) return false;

  if (event.key === 'Escape') {
    if (!letGo()) setDrawing(false);
    return true;
  }
  if (event.code === 'Space' && !typing && !event.target.closest?.('button, a, summary')) {
    event.preventDefault();
    holdPan(true);
    return true;
  }
  return false;
}

export function initDrawing({ onStatus } = {}) {
  say = onStatus ?? say;
  drawing = kept();

  ring.style.width = `${ERASER_PX * 2}px`;
  ring.style.height = `${ERASER_PX * 2}px`;

  toggle.addEventListener('click', (event) => {
    setDrawing(!on);
    rest(event);
  });
  for (const button of markerButtons) {
    button.addEventListener('click', (event) => {
      marker = button.dataset.marker;
      erasing = false;
      showMode();
      showTray();
      rest(event);
    });
  }
  eraserButton.addEventListener('click', (event) => {
    // Pressed again, the eraser goes back in the tray and the last marker comes out.
    erasing = !erasing;
    showMode();
    showTray();
    rest(event);
  });
  undoButton.addEventListener('click', (event) => {
    undo();
    rest(event);
  });
  clearButton.addEventListener('click', (event) => {
    clear();
    rest(event);
  });
  document.getElementById('draw-done').addEventListener('click', () => setDrawing(false));

  // The press itself comes through the stage, which asks press() whose it is.
  // What follows it is listened for here. A second pointer landing is a pinch
  // beginning, so whatever the first one had started is dropped: two fingers
  // on a phone are for moving the map, and must not leave a dot behind.
  svg.addEventListener('pointerdown', (event) => {
    if (hand && event.pointerId !== hand.pointerId) letGo();
  });
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', (event) => {
    if (hand && event.pointerId === hand.pointerId) letGo();
  });
  svg.addEventListener('pointerleave', () => { ring.hidden = true; });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') holdPan(false);
  });
  // A key let go while the window was elsewhere is never heard of again.
  window.addEventListener('blur', () => holdPan(false));
  // The address may have moved on since the last stroke — a version renamed or
  // published — and what is kept has to name the one a reload will come back to.
  window.addEventListener('pagehide', keep);

  // A drawing belongs to the terrain it was drawn on. The first map to arrive
  // is the one this page loaded, which what was kept was drawn on; any after
  // it is another version opened or a file imported, and the board is wiped.
  subscribe((reason) => {
    if (reason !== 'map') return;
    if (!mapSeen) {
      mapSeen = true;
      return;
    }
    hand = null;
    drawing = strokes.EMPTY;
    show();
    keep();
  });

  show();
  showMode();
}
