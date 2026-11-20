// Headless check for the maths of a drawing. Nothing to stub: strokes.js
// touches no DOM and no store, which is the point of it.
//   node tests/strokes.test.mjs

import * as strokes from '../app/js/strokes.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const show = (value) => JSON.stringify(value);
const p = (x, y) => ({ x, y });

// --- the marker's width ---
check('a marker six pixels wide leaves a six-unit line at a zoom of one', strokes.widthAt(6, 1) === 6);
check('zoomed in to four it leaves a finer line, still six pixels on screen', strokes.widthAt(6, 4) * 4 === 6);
check('and zoomed out to a quarter a broader one', strokes.widthAt(6, 0.25) === 24);

// --- keeping what the pointer reports ---
check('the first point a pointer reports is always kept', strokes.worthKeeping([], p(5, 5), 2));
check('a point on top of the last one kept is not', !strokes.worthKeeping([p(5, 5)], p(5.5, 5), 2));
check('and one far enough from it is', strokes.worthKeeping([p(5, 5)], p(7, 5), 2));

// --- thinning ---
const run = Array.from({ length: 50 }, (_, i) => p(i, 0));
check('a straight run comes down to its two ends', show(strokes.thinned(run, 0.5)) === show([p(0, 0), p(49, 0)]));

const wobble = run.map((point, i) => p(point.x, i % 2 === 0 ? 0.1 : -0.1));
check('a wobble finer than the tolerance goes with it', strokes.thinned(wobble, 0.5).length === 2);

const corner = [p(0, 0), p(5, 0.1), p(10, 0), p(10, 5), p(10, 10)];
check('a corner is kept, and the points along its two sides are not',
  show(strokes.thinned(corner, 0.5)) === show([p(0, 0), p(10, 0), p(10, 10)]), show(strokes.thinned(corner, 0.5)));

const zigzag = [p(0, 0), p(5, 8), p(10, 0), p(15, 8), p(20, 0)];
check('a zigzag keeps every tooth', strokes.thinned(zigzag, 0.5).length === zigzag.length);

const loop = [p(0, 0), p(10, 0), p(10, 10), p(0, 10), p(0, 0.2)];
check('a loop that ends where it began keeps its far side', strokes.thinned(loop, 0.5).length === loop.length);

check('one point and two are left as they are',
  strokes.thinned([p(1, 2)], 0.5).length === 1 && strokes.thinned([p(1, 2), p(3, 4)], 0.5).length === 2);

const long = Array.from({ length: 20000 }, (_, i) => p(i, Math.sin(i / 50) * 40));
const short = strokes.thinned(long, 1);
check('twenty thousand points are thinned without the stack running out', short.length > 2 && short.length < long.length / 4,
  `${short.length} kept`);
check('and the thinned line still begins and ends where the hand did',
  show(short[0]) === show(long[0]) && show(short.at(-1)) === show(long.at(-1)));

const input = [p(0, 0), p(5, 0), p(10, 0)];
const output = strokes.thinned(input, 0.5);
check('thinning answers with new points rather than changing the ones given', input.length === 3 && output !== input);

// --- the path ---
check('nothing drawn is no path at all', strokes.strokePath([]) === '');
check('a press that went nowhere is a dot', strokes.strokePath([p(3, 4)]) === 'M 3 4 l 0.01 0');
check('two points are the straight line between them', strokes.strokePath([p(0, 0), p(10, 5)]) === 'M 0 0 L 10 5');

const turns = [p(0, 0), p(10, 0), p(10, 10), p(20, 10)];
const bent = strokes.strokePath(turns);
check('where the points are close the line curves past each, from halfway before it to halfway after',
  bent === 'M 0 0 L 5 0 Q 10 0 10 5 Q 10 10 15 10 L 20 10', bent);
check('and begins and ends exactly where the hand did', bent.startsWith('M 0 0 ') && bent.endsWith(' L 20 10'));

const cornered = strokes.strokePath(turns, 2);
check('where they are far apart only the corner is rounded, by the width given and no more',
  cornered === 'M 0 0 L 8 0 Q 10 0 10 2 L 10 8 Q 10 10 12 10 L 20 10', cornered);
const hairpin = strokes.strokePath([p(0, 0), p(100, 0), p(0, 1)], 6);
check('so a long run out and back keeps its point: the turn begins a marker\'s width short of it',
  hairpin.startsWith('M 0 0 L 94 0 Q 100 0 94 0.06 L'), hairpin);
check('a rounding wider than the points are apart is the same as none being asked for',
  strokes.strokePath(turns, 50) === bent);
check('a path is written to two places and no further', strokes.strokePath([p(1 / 3, 2 / 3), p(1, 1)]) === 'M 0.33 0.67 L 1 1');

// --- the eraser ---
const line = { id: 1, marker: 'red', width: 6, points: [0, 0, 100, 0] };
const dot = { id: 2, marker: 'blue', width: 6, points: [50, 40] };
const far = { id: 3, marker: 'ink', width: 6, points: [500, 500, 600, 600] };
const all = [line, dot, far];

check('an eraser on a stroke touches it', show(strokes.strokesUnder(all, p(50, 0), 5)) === show([1]));
check('an eraser beside a stroke, within reach of its edge, touches it', show(strokes.strokesUnder(all, p(50, 7), 5)) === show([1]));
check('one just out of reach of the edge does not', strokes.strokesUnder(all, p(50, 9), 5).length === 0);
check('past the end of a stroke counts from the end, not from the line carried on',
  strokes.strokesUnder(all, p(120, 0), 5).length === 0 && show(strokes.strokesUnder(all, p(107, 0), 5)) === show([1]));
check('a dot is touched like any other stroke', show(strokes.strokesUnder(all, p(52, 42), 5)) === show([2]));
check('an eraser between two strokes takes both', show(strokes.strokesUnder(all, p(50, 20), 20)) === show([1, 2]));
check('a fat stroke is caught by its edge',
  show(strokes.strokesUnder([{ ...line, width: 40 }], p(50, 22), 5)) === show([1]));
check('an eraser over open ground touches nothing', strokes.strokesUnder(all, p(300, 300), 5).length === 0);

// --- a drawing, and taking it back ---
const first = strokes.drawn(strokes.EMPTY, { marker: 'red', width: 6, points: [p(0, 0), p(10, 0)] });
const second = strokes.drawn(first, { marker: 'blue', width: 3.14159, points: [p(0, 5), p(10.004, 5.006)] });
const third = strokes.drawn(second, { marker: 'green', width: 6, points: [p(0, 9), p(10, 9)] });

check('a stroke drawn is on the drawing, with an id of its own',
  first.strokes.length === 1 && first.strokes[0].id === 1 && second.strokes[1].id === 2);
check('its points are kept flat and its numbers to two places',
  show(second.strokes[1].points) === show([0, 5, 10, 5.01]) && second.strokes[1].width === 3.14);
check('drawing answers with a new drawing rather than changing the one given',
  strokes.EMPTY.strokes.length === 0 && first.strokes.length === 1 && second.strokes.length === 2);

const backOne = strokes.undone(third);
check('undo takes back the last stroke', backOne.undid === 'stroke'
  && show(backOne.drawing.strokes.map((s) => s.id)) === show([1, 2]));
check('and the one before it after that', show(strokes.undone(backOne.drawing).drawing.strokes.map((s) => s.id)) === show([1]));
check('a stroke drawn after an undo does not take the id of the one taken back',
  strokes.drawn(backOne.drawing, { marker: 'ink', width: 6, points: [p(1, 1)] }).strokes.at(-1).id === 4);

const rubbed = strokes.erased(third, [1, 3]);
check('an eraser takes the strokes it crossed and leaves the rest',
  show(rubbed.strokes.map((s) => s.id)) === show([2]));
const unrubbed = strokes.undone(rubbed);
check('undo puts back everything one drag of the eraser took, as one step', unrubbed.undid === 'erasing'
  && show(unrubbed.drawing.strokes.map((s) => s.id)) === show([1, 2, 3]));
check('and puts each back where it stood, under the strokes drawn over it',
  show(unrubbed.drawing.strokes) === show(third.strokes));
check('an eraser that crossed nothing is not a step to take back', strokes.erased(third, [99]) === third);

const wiped = strokes.cleared(third);
check('clear leaves nothing on the drawing', wiped.strokes.length === 0);
const unwiped = strokes.undone(wiped);
check('and undo puts the whole of it back', unwiped.undid === 'clearing'
  && show(unwiped.drawing.strokes) === show(third.strokes));
check('clearing a drawing with nothing on it is not a step', strokes.cleared(strokes.EMPTY) === strokes.EMPTY);

const nothing = strokes.undone(strokes.EMPTY);
check('with nothing to take back, undo says so and changes nothing',
  nothing.undid === null && nothing.drawing === strokes.EMPTY);

let many = strokes.EMPTY;
for (let i = 0; i < strokes.UNDO_DEPTH + 20; i++) many = strokes.drawn(many, { marker: 'red', width: 6, points: [p(i, 0)] });
check('a drawing remembers only so many steps back', many.undo.length === strokes.UNDO_DEPTH);
check('and keeps every stroke all the same', many.strokes.length === strokes.UNDO_DEPTH + 20);

// --- kept between reloads ---
const kept = JSON.parse(JSON.stringify(rubbed));
check('a drawing written down and read back is the drawing it was', show(strokes.readDrawing(kept)) === show(rubbed));
check('and its undo still works', show(strokes.undone(strokes.readDrawing(kept)).drawing.strokes) === show(third.strokes));

check('nothing kept reads as an empty drawing', strokes.readDrawing(null) === strokes.EMPTY
  && strokes.readDrawing('scribble') === strokes.EMPTY && strokes.readDrawing({}) === strokes.EMPTY);
check('a stroke in a marker there is no longer lets the whole drawing go',
  strokes.readDrawing({ ...kept, strokes: [{ ...line, marker: 'mauve' }] }) === strokes.EMPTY);
check('so does a stroke whose points are not pairs of numbers',
  strokes.readDrawing({ ...kept, strokes: [{ ...line, points: [0, 0, 5] }] }) === strokes.EMPTY
  && strokes.readDrawing({ ...kept, strokes: [{ ...line, points: [0, 'x'] }] }) === strokes.EMPTY);
check('and a step back that does not say what it took',
  strokes.readDrawing({ ...kept, undo: [{ what: 'erasing' }] }) === strokes.EMPTY);
check('the next id is past every id in use, whatever was written down',
  strokes.readDrawing({ ...kept, next: 1 }).next === 4, String(strokes.readDrawing({ ...kept, next: 1 }).next));

check('every marker has a name, and the one first in hand is among them',
  strokes.MARKERS.length === new Set(strokes.MARKERS).size && strokes.MARKERS.includes(strokes.DEFAULT_MARKER));

console.log(failures === 0 ? '\nAll stroke checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
