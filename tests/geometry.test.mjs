// Headless sanity check for the shape maths: stub just enough DOM, then assert
// the invariants that are painful to eyeball in a browser.
//   node tests/geometry.test.mjs

// Every swatch of the stylesheet's is the same green here. One of them has a
// dark counterpart named for it, as a brand's stylesheet might name one; the
// rest name none, as the package's own does not.
const STYLED = { '--font-heading': 'Georgia, serif', '--c3-dark': '#203040' };
globalThis.getComputedStyle = () => ({
  getPropertyValue: (name) => STYLED[name] ?? (name.endsWith('-dark') ? '' : '#527a42'),
});
globalThis.document = {
  documentElement: {},
  createElement: () => ({
    getContext: () => {
      let size = 16;
      let bold = false;
      return {
        set font(value) {
          bold = value.startsWith('bold ');
          size = parseFloat(bold ? value.slice(5) : value);
        },
        get font() { return `${bold ? 'bold ' : ''}${size}px`; },
        // Bold sets wider, like a real face — the sizing maths has to allow for it.
        measureText: (text) => ({ width: text.length * size * 0.5 * (bold ? 1.07 : 1) }),
      };
    },
  }),
};

const geo = await import('../app/js/geometry.js');

/** Points around a shape's rim, for "is this really inside that" questions. */
const rimOf = (shape, steps = 24) => Array.from({ length: steps }, (_, i) => {
  const angle = (i * 2 * Math.PI) / steps;
  return { x: shape.x + shape.rx * Math.cos(angle), y: shape.y + shape.ry * Math.sin(angle) };
});

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

// --- wrapping ---
const short = geo.wrapLines('Payment method selection', 16, 128);
check('short title wraps within 3 rows', short.length <= 3, JSON.stringify(short));

const long = geo.wrapLines('Cross border settlement reconciliation and dispute resolution management', 16, 128);
check('long title is cut to 3 rows', long.length === 3, JSON.stringify(long));
check('long title ends with an ellipsis', long[2].endsWith('…'), JSON.stringify(long));

check('empty title survives', geo.wrapLines('', 16, 128).length === 1);

// --- capability sizing ---
const small = geo.capabilitySize({ title: 'Payment authorization', fontSize: 16 });
const large = geo.capabilitySize({ title: 'Payment authorization', fontSize: 48 });
// The oval is the scale's business and the type's is the words: setting one
// must not move the other, or laying a map out becomes a fight between them.
check('the font size leaves the oval alone', large.rx === small.rx && large.ry === small.ry,
  `${small.rx}x${small.ry} vs ${large.rx}x${large.ry}`);
check('bigger type takes more of the room', large.lines.join(' ').length <= small.lines.join(' ').length,
  `${JSON.stringify(small.lines)} vs ${JSON.stringify(large.lines)}`);
check('the shape scale is what sizes it', (() => {
  const twice = geo.capabilitySize({ title: 'Payment authorization', sizeScale: 2 });
  const once = geo.capabilitySize({ title: 'Payment authorization' });
  return Math.abs(twice.rx - once.rx * 2) < 1e-9 && Math.abs(twice.ry - once.ry * 2) < 1e-9;
})());
check('an oval at 1x is the base size',
  small.rx === geo.BASE_RX && small.ry === geo.BASE_RY, `${small.rx}x${small.ry}`);
check('an unset size falls back to Large',
  geo.capabilitySize({ title: 'Payment authorization' }).fontSize === geo.DEFAULT_FONT_SIZE);
// Plain, not bold: a capability's label sits inside its own coloured shape,
// where the domain title's weight would only shout over it.
check('an unset weight falls back to regular',
  geo.capabilitySize({ title: 'Payment authorization' }).fontWeight === 'regular');
check('text fits inside the oval', (() => {
  const halfWidth = Math.max(...small.lines.map((l) => geo.measure(l, 16, small.fontWeight))) / 2;
  return (halfWidth / small.rx) ** 2 + (small.height / 2 / small.ry) ** 2 <= 1;
})());

// Ovals should read as round, not as flattened lozenges.
check('ovals stay round rather than flat', small.ry / small.rx >= 0.6, (small.ry / small.rx).toFixed(2));

// Weight is the words' business, not the oval's: bold measures wider, and the
// shape must not grow to meet it.
const boldSize = geo.capabilitySize({ title: 'Bank reconciliation', fontSize: 22, fontWeight: 'bold' });
const regularSize = geo.capabilitySize({ title: 'Bank reconciliation', fontSize: 22, fontWeight: 'regular' });
check('bold leaves the oval alone too', boldSize.rx === regularSize.rx, `${regularSize.rx}/${boldSize.rx}`);

// The shape scales on its own; the text does not follow it.
const half = geo.capabilitySize({ title: 'Bank reconciliation', fontSize: 22, sizeScale: 0.6 });
check('shape size scales the oval', Math.abs(half.rx - regularSize.rx * 0.6) < 1e-6 || half.rx < regularSize.rx,
  `${regularSize.rx}/${half.rx}`);
check('scaling the oval leaves the type alone',
  half.fontSize === 22 && half.lineHeight === regularSize.lineHeight);
check('a shrunken oval lets its text overflow', (() => {
  const halfWidth = Math.max(...half.lines.map((l) => geo.measure(l, 22, half.fontWeight))) / 2;
  return halfWidth > half.rx * 0.7; // the text is no longer safely tucked inside
})());

// --- how an oval leans ---
const leaning = (stretch, fields = {}) => geo.capabilitySize({ title: 'Bank reconciliation', ...fields, stretch });
check('five steps from tall to wide', geo.OVAL_STRETCHES.join() === '-2,-1,0,1,2');
check('wide is the oval capabilities always had',
  leaning(2).rx === geo.BASE_RX && leaning(2).ry === geo.BASE_RY, `${leaning(2).rx}x${leaning(2).ry}`);
check('tall is the same oval stood on end',
  leaning(-2).rx === geo.BASE_RY && leaning(-2).ry === geo.BASE_RX, `${leaning(-2).rx}x${leaning(-2).ry}`);
// Zero is round, not "unset": a falsy check would hand it the default instead.
check('round is a circle, halfway between the two', (() => {
  const round = leaning(0);
  return round.rx === round.ry && round.rx === (geo.BASE_RX + geo.BASE_RY) / 2;
})(), `${leaning(0).rx}x${leaning(0).ry}`);
check('every step leans the same amount further', (() => {
  const widths = geo.OVAL_STRETCHES.map((stretch) => leaning(stretch).rx);
  const steps = widths.slice(1).map((width, i) => width - widths[i]);
  return steps.every((step) => step > 0 && Math.abs(step - steps[0]) < 1e-9);
})());
check('the stretch and the shape size work together', (() => {
  const big = leaning(-1, { sizeScale: 2 });
  return Math.abs(big.rx - leaning(-1).rx * 2) < 1e-9 && Math.abs(big.ry - leaning(-1).ry * 2) < 1e-9;
})());
check('a stretch off the scale is held to its end',
  leaning(9).rx === geo.BASE_RX && leaning(-9).rx === geo.BASE_RY);
check('a tall oval wraps its words narrower', (() => {
  const words = { title: 'Pay by bank and card in store', fontSize: 16 };
  return leaning(-2, words).lines.length > leaning(2, words).lines.length;
})());

check('white ink on the darkest fills', geo.inkOn('#527a42') === '#fff' && geo.inkOn('#014bb3') === '#fff');
check('black ink on the palest fills', geo.inkOn('#e5ebe3') === '#000' && geo.inkOn('#d6e6ff') === '#000');
check('a see-through fill is judged after blending', geo.inkOn('#527a42', 0.2, '#ffffff') === '#000');

// --- the dark map ---
// A dark map draws each swatch's dark counterpart, worked out from the swatch.
// What follows is what makes it a counterpart rather than merely a darker colour.
const lightOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrastOf = (a, b) => {
  const [light, dark] = [lightOf(a), lightOf(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};
const DARK_PAPER = '#141613';
// The stock palette as tokens.css has it, written out: the stub above hands back one green for all of it.
const STOCK = ['#86a27b', '#7fc6d8', '#e8bbd5', '#fede49', '#b06a46', '#f57a8c', '#51a45c', '#3c94a3',
  '#a1a4ec', '#fee986', '#d36e3b', '#e08aac', '#77bc80', '#5985ab', '#a86cd1', '#d3b23b', '#f2c3aa', '#f66598',
  '#0d9c08', '#aedbe6', '#a85bad', '#f1982b', '#9f4e4e', '#d86161'];

check('no swatch is drawn lighter on dark paper than on light',
  STOCK.every((color) => lightOf(geo.darkCounterpart(color)) <= lightOf(color)),
  STOCK.filter((color) => lightOf(geo.darkCounterpart(color)) > lightOf(color)).join());
check('the pale end of the palette comes down by half', (() => {
  const kept = lightOf(geo.darkCounterpart('#fee986')) / lightOf('#fee986');
  return kept > 0.45 && kept < 0.55;
})(), geo.darkCounterpart('#fee986'));
check('a swatch already deep enough for dark paper is left as it is',
  geo.darkCounterpart('#9f4e4e') === '#9f4e4e' && geo.darkCounterpart('#a85bad') === '#a85bad',
  `${geo.darkCounterpart('#9f4e4e')}, ${geo.darkCounterpart('#a85bad')}`);
check('the pale end stays the pale end: the palette keeps its order of lightness', (() => {
  const byLight = (colors) => colors.map((color, i) => [lightOf(color), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const before = byLight(STOCK).map(([, i]) => i);
  const after = STOCK.map((color) => lightOf(geo.darkCounterpart(color)));
  // Rounded to whole channels, two swatches a hair apart may tie; none may swap.
  return before.every((i, at) => at === 0 || after[i] >= after[before[at - 1]] - 0.004);
})());
check('black type reads at 4.5 on every counterpart of a swatch it read on at 4.5',
  STOCK.filter((color) => contrastOf(color, '#000000') >= 4.5)
    .every((color) => contrastOf(geo.darkCounterpart(color), '#000000') >= 4.5),
  STOCK.map((color) => `${geo.darkCounterpart(color)} ${contrastOf(geo.darkCounterpart(color), '#000000').toFixed(2)}`).join(', '));
check('the hue is kept: as light, a dimmed swatch has its channels in the proportions they were', (() => {
  const asLight = (hex) => [1, 3, 5].map((at) => {
    const v = parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return ['#fede49', '#7fc6d8', '#e8bbd5', '#f2c3aa'].every((color) => {
    const [r, g, b] = asLight(color);
    const [dr, dg, db] = asLight(geo.darkCounterpart(color));
    // Within what rounding to a whole channel moves a dim one.
    return Math.abs(dr / dg - r / g) < 0.03 && Math.abs(db / dg - b / g) < 0.03;
  });
})());
check('white comes down to a grey and black stays black', (() => {
  const grey = geo.darkCounterpart('#ffffff');
  return grey[1] === grey[3] && grey[3] === grey[5] && grey !== '#ffffff' && geo.darkCounterpart('#000000') === '#000000';
})(), geo.darkCounterpart('#ffffff'));
check('the short hex form has the long one\'s counterpart', geo.darkCounterpart('#fd4') === geo.darkCounterpart('#ffdd44'));

// Which of the two a map is drawn in. The palette is the map's and does not
// change with the theme; COLORS is what the shapes are painted with.
geo.setPalette(['#fede49', '#9f4e4e', '#e8bbd5', '#7fc6d8']);
check('a light map is drawn in its palette as it stands', geo.COLORS.join() === geo.PALETTE.join());
geo.setDarkMap(true);
check('a dark map is drawn in each swatch\'s counterpart',
  geo.COLORS.join() === geo.PALETTE.map(geo.darkCounterpart).join(), geo.COLORS.join());
check('and the palette itself is what it was', geo.PALETTE.join() === '#fede49,#9f4e4e,#e8bbd5,#7fc6d8');
check('a default colour is matched against the palette, not against what is drawn',
  geo.swatchFor('#fede49') === 1 && geo.swatchFor('#7fc6d8') === 4);
geo.setPalette(['#fede49', '#9f4e4e', '#527a42', '#7fc6d8']);
check('a counterpart the stylesheet names is used for the stylesheet\'s swatch', geo.COLORS[2] === '#203040', geo.COLORS[2]);
check('and for no other: a swatch nobody named one for is worked out',
  geo.COLORS[0] === geo.darkCounterpart('#fede49'));
geo.setPalette(['#fede49', '#9f4e4e', '#e8bbd5', '#7fc6d8']);
check('nor for that swatch once the map has made it another colour',
  geo.COLORS[2] === geo.darkCounterpart('#e8bbd5'), geo.COLORS[2]);
geo.setPalette([]);
check('a map with no palette of its own is drawn in the stylesheet\'s, counterparts and all',
  geo.COLORS.length === 24 && geo.COLORS[2] === '#203040' && geo.COLORS[0] === geo.darkCounterpart('#527a42'));
geo.setDarkMap(false);
check('back on light paper it is drawn in the palette again', geo.COLORS.join() === geo.PALETTE.join());

check('a solid swatch keeps its black title on the dark map',
  STOCK.every((color) => geo.darkMapInk(geo.darkCounterpart(color), 1, DARK_PAPER) === '#000'));
check('a see-through one, where the dark paper comes up through the fill, turns white',
  geo.darkMapInk(geo.darkCounterpart('#a1a4ec'), 0.5, DARK_PAPER) === '#fff'
  && geo.darkMapInk(geo.darkCounterpart('#fede49'), 0.2, DARK_PAPER) === '#fff');
check('and whichever it is can be read there', [1, 0.8, 0.6, 0.5, 0.3, 0.1].every((opacity) => STOCK.every((color) => {
  const fill = geo.darkCounterpart(color);
  const blended = `#${[1, 3, 5].map((at) => Math.round(parseInt(fill.slice(at, at + 2), 16) * opacity
    + parseInt(DARK_PAPER.slice(at, at + 2), 16) * (1 - opacity)).toString(16).padStart(2, '0')).join('')}`;
  return contrastOf(blended, geo.darkMapInk(fill, opacity, DARK_PAPER) === '#000' ? '#000000' : '#ffffff') >= 3;
})));

// An area's title wears its border's colour, made readable against the paper.
// On dark paper it is the dim colours that are not, and they are lifted.
for (const dim of ['#9f4e4e', '#5985ab', '#a85bad', '#b06a46']) {
  const title = geo.deepened(geo.darkCounterpart(dim), DARK_PAPER);
  check(`${dim} is lifted until it reads as type on dark paper`, contrastOf(title, DARK_PAPER) >= geo.READABLE,
    `${title} at ${contrastOf(title, DARK_PAPER).toFixed(2)}`);
}
check('and by no more than it takes: a dark red line gets a lighter red title, not a white one', (() => {
  const title = geo.deepened('#9f4e4e', DARK_PAPER);
  return contrastOf(title, DARK_PAPER) < geo.READABLE + 0.4 && title !== '#e7eae4';
})(), geo.deepened('#9f4e4e', DARK_PAPER));
check('a colour that already reads on dark paper is left as it is',
  geo.deepened('#fede49', DARK_PAPER) === '#fede49');

// --- snap points ---
const points = geo.snapPoints(80, 48);
check('24 snap points', points.length === 24 && geo.SNAP_COUNT === 24);
check('snap points sit on the ellipse', points.every((p) => Math.abs((p.x / 80) ** 2 + (p.y / 48) ** 2 - 1) < 1e-9));
check('point 0 is at 3 o\'clock', Math.abs(points[0].x - 80) < 1e-9 && Math.abs(points[0].y) < 1e-9);

// --- connector ends ---
const size = { rx: 80, ry: 48 };
const east = geo.closestSnapPair({ x: 0, y: 0 }, size, { x: 600, y: 0 }, size);
check('a line to the east leaves at 3 and arrives at 9',
  east.fromPoint === 0 && east.toPoint === geo.SNAP_COUNT / 2, JSON.stringify(east));
const north = geo.closestSnapPair({ x: 0, y: 0 }, size, { x: 0, y: -600 }, size);
check('a line to the north leaves at 12 and arrives at 6',
  north.fromPoint === (geo.SNAP_COUNT * 3) / 4 && north.toPoint === geo.SNAP_COUNT / 4, JSON.stringify(north));
check('the ends swap when the shapes do', (() => {
  const back = geo.closestSnapPair({ x: 600, y: 0 }, size, { x: 0, y: 0 }, size);
  return back.fromPoint === geo.SNAP_COUNT / 2 && back.toPoint === 0;
})());

const straight = geo.connectorPath({ x: 0, y: 0 }, { x: 100, y: 0 });
const curved = geo.connectorPath({ x: 0, y: 0 }, { x: 100, y: 0 }, 'curved');
check('a straight line is a straight line', straight === 'M 0 0 L 100 0');
check('a curved line is a chain of cubics', curved.startsWith('M') && curved.includes('C')
  && !curved.includes('NaN'), curved);

// --- curved lines leave square to the shape they start on ---
const UP = { x: 0, y: -1 };
const DOWN = { x: 0, y: 1 };
/** The first control point of the first cubic — the direction the line sets off in. */
const firstHandle = (d) => {
  const [, x, y] = /C\s+(-?[\d.]+)\s+(-?[\d.]+)/.exec(d);
  return { x: Number(x), y: Number(y) };
};
check('a curve sets off along the normal it was given', (() => {
  const d = geo.connectorPath({ x: 0, y: 0 }, { x: 200, y: 0 }, 'curved',
    { fromNormal: UP, toNormal: UP, bendPoints: [{ x: 100, y: -80 }] });
  const handle = firstHandle(d);
  // Straight up out of (0,0): all of the offset in y, none of it in x.
  return Math.abs(handle.x) < 1e-6 && handle.y < 0;
})());
check('a snap point on a circle points straight out', (() => {
  const n = geo.snapNormal({ rx: 50, ry: 50 }, 0);
  return Math.abs(n.x - 1) < 1e-9 && Math.abs(n.y) < 1e-9;
})());
check('a snap point on a stretched oval does not', (() => {
  // Square to the edge is not the same as away from the middle once rx != ry.
  const index = 3;   // 45 degrees round
  const size = { rx: 200, ry: 40 };
  const angle = (index * 2 * Math.PI) / geo.SNAP_COUNT;
  const radial = Math.atan2(size.ry * Math.sin(angle), size.rx * Math.cos(angle));
  const n = geo.snapNormal(size, index);
  return Math.abs(Math.atan2(n.y, n.x) - radial) > 0.2;
})());

// --- where a curve bends when nobody has shaped it ---
check('a line gets one bend by default', (() => {
  const bends = geo.autoBendPoints({ x: 0, y: 0 }, { x: 300, y: 0 }, UP, DOWN);
  return bends.length === 1;
})());
check('ends facing each other run almost straight', (() => {
  // Facing ends cancel, so the bend sits on the midpoint and the line is direct.
  const [bend] = geo.autoBendPoints({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 });
  return Math.abs(bend.x - 150) < 1e-6 && Math.abs(bend.y) < 1e-6;
})());
check('ends facing the same way bow out of the way', (() => {
  const [bend] = geo.autoBendPoints({ x: 0, y: 0 }, { x: 300, y: 0 }, UP, UP);
  return Math.abs(bend.x - 150) < 1e-6 && bend.y < -50;
})());
check('the bow is capped however long the run', (() => {
  const [near] = geo.autoBendPoints({ x: 0, y: 0 }, { x: 400, y: 0 }, UP, UP);
  const [far] = geo.autoBendPoints({ x: 0, y: 0 }, { x: 40000, y: 0 }, UP, UP);
  return Math.abs(far.y) <= Math.abs(near.y) + 1e-6 || Math.abs(far.y) < 400;
})());

// --- a shaped line goes through every point it was given ---
check('a curve passes through each of its bends', (() => {
  const bends = [{ x: 60, y: -40 }, { x: 140, y: 40 }];
  const d = geo.connectorPath({ x: 0, y: 0 }, { x: 200, y: 0 }, 'curved',
    { fromNormal: UP, toNormal: UP, bendPoints: bends });
  // One cubic per gap between the four points on the run.
  return (d.match(/C/g) ?? []).length === 3
    && d.includes('60 -40') && d.includes('140 40');
})());
check('shift-click lands a bend in the right stretch of the line', (() => {
  const along = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
  return geo.nearestSegment(along, 20, 5).index === 0
    && geo.nearestSegment(along, 160, 5).index === 1;
})());

// --- one blob, one lobe per capability ---
check('a lobe is a capability plus padding', (() => {
  const cap = { title: 'Payment authorization', fontSize: 22, fontWeight: 'bold' };
  const oval = geo.capabilitySize(cap);
  const lobe = geo.lobeSizeFor(cap);
  return lobe.rx > oval.rx && lobe.ry > oval.ry
    && lobe.rx - oval.rx === lobe.ry - oval.ry; // the same ring all the way round
})());
check('the default lobe is the default capability plus that padding', (() => {
  const seed = geo.defaultLobeSize();
  const oval = geo.capabilitySize({ title: 'New capability' });
  return Math.abs((seed.rx - oval.rx) - (seed.ry - oval.ry)) < 1e-9 && seed.rx > oval.rx;
})());
check('the gaps are the ones the design system asks for',
  geo.CAPABILITY_GAP === 50 && geo.DOMAIN_GAP === 75);

const placed = (n, fontSize = 22) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const cap = { id: `cap-${i}`, title: `Capability number ${i}`, fontSize, fontWeight: 'bold' };
    const spot = geo.freeLobeSpot(out.map((c) => ({ x: c.lobeX, y: c.lobeY, ...geo.lobeSizeFor(c) })));
    out.push({ ...cap, lobeX: spot.x, lobeY: spot.y });
  }
  return out;
};

// --- new lobes land clear of the ones already there ---
for (const count of [1, 2, 5, 9]) {
  const children = placed(count);
  const lobes = children.map((c) => ({ x: c.lobeX, y: c.lobeY, ...geo.lobeSizeFor(c) }));
  const clashes = lobes.some((a, i) => lobes.some((b, j) => j > i
    && Math.hypot((a.x - b.x) / (a.rx + b.rx), (a.y - b.y) / (a.ry + b.ry)) < 0.999));
  check(`${count} lobes: each new one lands clear of the rest`, !clashes);

  const layout = geo.layoutDomain({ id: 'd', title: 'Invoicing' }, children);
  check(`${count} lobes: one lobe per capability`, layout.lobes.length === count);
  check(`${count} lobes: every capability is inside the blob`,
    layout.slots.every((slot) => rimOf(slot).every((p) => layout.contains(p.x, p.y))));
  check(`${count} lobes: the path is closed and finite`,
    layout.path.startsWith('M ') && layout.path.endsWith('Z') && !layout.path.includes('NaN'));
}

// --- the body reads as one ovoid ---
const wide = geo.layoutDomain({ id: 'd', title: 'Invoicing' }, placed(6));
check('there is one body, and it reaches past the middle of every lobe', wide.lobes.every((lobe) =>
  Math.abs(lobe.x - wide.body.x) < wide.body.rx && Math.abs(lobe.y - wide.body.y) < wide.body.ry));

// --- a capability pushed to the edge moves that edge and no other ---
{
  const domain = { id: 'd', title: 'Invoicing' };
  const children = placed(6);
  const before = geo.layoutDomain(domain, children).bounds;
  const pushed = (pick, dx, dy) => {
    const child = children.reduce(pick);
    return geo.layoutDomain(domain, children, { id: child.id, lobeX: child.lobeX + dx, lobeY: child.lobeY + dy }).bounds;
  };
  // Not to the pixel: the field eases off over a share of the body's radius, so
  // a bigger body softens every edge by a few pixels. The body used to be held
  // round the domain's point, and a push like this moved every edge by hundreds.
  const still = (a, b, sides) => sides.every((side) => Math.abs(a[side] - b[side]) < 10);
  const report = (a) => ['minX', 'maxX', 'minY', 'maxY'].map((s) => `${s} ${(a[s] - before[s]).toFixed(1)}`).join(', ');

  const right = pushed((a, b) => (b.lobeX > a.lobeX ? b : a), 300, 0);
  check('pushing a capability out to the right moves the right edge', right.maxX - before.maxX > 250, report(right));
  check('  ...and leaves the left, top and bottom where they were',
    still(before, right, ['minX', 'minY', 'maxY']), report(right));

  const down = pushed((a, b) => (b.lobeY > a.lobeY ? b : a), 0, 300);
  check('pushing a capability down moves the bottom edge', down.maxY - before.maxY > 250, report(down));
  check('  ...and leaves the top and the sides where they were',
    still(before, down, ['minX', 'maxX', 'minY']), report(down));
}
check('the outline stays smooth as lobes meet', (() => {
  // Sample the outline and look for a step between neighbouring angles.
  const radii = [];
  for (let i = 0; i < 96; i++) {
    const a = (i * 2 * Math.PI) / 96;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let lo = 0;
    let hi = 6000;
    for (let s = 80; s >= 1; s--) {
      const r = (6000 * s) / 80;
      if (wide.contains(r * dx, r * dy)) { lo = r; hi = (6000 * (s + 1)) / 80; break; }
    }
    for (let k = 0; k < 16; k++) {
      const m = (lo + hi) / 2;
      if (wide.contains(m * dx, m * dy)) lo = m; else hi = m;
    }
    radii.push(lo);
  }
  const worst = Math.max(...radii.map((r, i) =>
    Math.abs(r - radii[(i + 1) % 96]) / Math.max(r, radii[(i + 1) % 96])));
  return worst < 0.15;
})());

// --- a lobe goes where it is put ---
check('a lobe sits exactly where it was placed', (() => {
  const children = [{ id: 'c', title: 'Somewhere', fontSize: 22, fontWeight: 'bold', lobeX: -300, lobeY: 220 }];
  const layout = geo.layoutDomain({ id: 'd', title: 'Invoicing' }, children);
  return layout.slots[0].x === -300 && layout.slots[0].y === 220;
})());
check('a lobe being dragged follows the cursor', (() => {
  const children = [{ id: 'c', title: 'Somewhere', fontSize: 22, fontWeight: 'bold', lobeX: 0, lobeY: 0 }];
  const layout = geo.layoutDomain({ id: 'd', title: 'Invoicing' }, children,
    { id: 'c', lobeX: 410, lobeY: -120 });
  return layout.slots[0].x === 410 && layout.slots[0].y === -120;
})());

// --- a domain reaches out for a capability held over it ---
{
  const domain = { id: 'd', title: 'Invoicing' };
  const children = placed(3);
  const own = children[1];
  const stranger = { id: 'x', title: 'From elsewhere', fontSize: 22, fontWeight: 'bold', domainId: 'other', lobeX: 0, lobeY: 0 };
  const ids = (list) => list.map((c) => c.id).join(',');
  // Well clear of the blob as it stands, the way a capability arrives from next door.
  const far = { domainId: 'd', lobeX: 900, lobeY: 40 };
  const before = geo.layoutDomain(domain, children);
  check('the far spot starts outside the blob', !before.contains(far.lobeX, far.lobeY));

  const receiving = geo.childrenInHand('d', children, stranger, far);
  const reached = geo.layoutDomain(domain, receiving);
  const slot = reached.slots.find((s) => s.item.id === 'x');
  check('a stranger held over the domain is laid out as one of its own',
    ids(receiving) === `${ids(children)},x`, ids(receiving));
  check('  ...at the spot the pointer has it', slot && slot.x === 900 && slot.y === 40);
  check('  ...at its own size', reached.lobes.at(-1).rx === geo.lobeSizeFor(stranger).rx);
  check('  ...and the blob reaches out to cover it',
    slot && rimOf(slot).every((p) => reached.contains(p.x, p.y)));

  check('its own capability held over it keeps its place in the list', (() => {
    const kept = geo.childrenInHand('d', children, own, far);
    return ids(kept) === ids(children) && kept[1].lobeX === 900 && kept[1].lobeY === 40;
  })());
  const without = `${children[0].id},${children[2].id}`;
  check('its own capability held over another domain leaves',
    ids(geo.childrenInHand('d', children, own, { domainId: 'other', lobeX: 0, lobeY: 0 })) === without);
  check('its own capability held over open ground leaves too',
    ids(geo.childrenInHand('d', children, own, null)) === without);
  check('a stranger held elsewhere changes nothing',
    ids(geo.childrenInHand('d', children, stranger, null)) === ids(children));
}

// --- the title has a lobe of its own, and can be moved ---
const titled = geo.layoutDomain({ id: 'd', title: 'Invoicing' }, placed(4));
check('the title gets a lobe', titled.titleLobe.rx > 0 && titled.titleLobe.ry > 0);
check('by default the title sits above the body', titled.title.y < 0);
check('the title can be moved', (() => {
  const moved = geo.layoutDomain({ id: 'd', title: 'Invoicing', titleX: 260, titleY: 40 }, placed(4));
  return Math.abs(moved.title.x - 260) < 1 && Math.abs(moved.title.y - 40) < 1;
})());
check('the kebab rides at the end of the title', titled.kebab.x > titled.title.x && titled.kebab.r > 0);

// --- the first capability in an empty domain goes under the title ---
const { DOMAIN_SHAPE, CAPABILITY_SHAPE } = await import('../app/js/defaults.js');
for (const [label, domain] of [
  ['a new domain', { id: 'd', ...DOMAIN_SHAPE }],
  ['a moved title', { id: 'd', title: 'Invoicing', titleX: 120, titleY: -60 }],
  ['a one-line title', { id: 'd', title: 'Invoicing', fontSize: 36 }],
]) {
  const spot = geo.lobeUnderTitle(domain);
  const laid = geo.layoutDomain(domain, [{ id: 'c', ...CAPABILITY_SHAPE, lobeX: spot.x, lobeY: spot.y }]);
  const clearance = (spot.y - laid.slots[0].ry) - (laid.title.y + laid.title.height / 2);
  check(`${label}: the first capability sits just under the title text`,
    clearance >= geo.CAPABILITY_GAP && clearance < geo.CAPABILITY_GAP + 2 && spot.x === Math.round(laid.title.x),
    `clearance ${clearance.toFixed(1)}, x ${spot.x} vs title ${laid.title.x}`);

  // The ones after it go wherever is clear, and the title is not clear.
  const children = [];
  const covered = [];
  for (let i = 0; i < 6; i++) {
    const at = geo.newLobeSpot(domain, children);
    children.push({ id: `c${i}`, ...CAPABILITY_SHAPE, lobeX: at.x, lobeY: at.y });
    const { title, slots } = geo.layoutDomain(domain, children);
    const box = { left: title.x - title.areaWidth / 2, right: title.x + title.areaWidth / 2,
      top: title.y - title.height / 2, bottom: title.y + title.height / 2 };
    const inBox = (p) => p.x > box.left && p.x < box.right && p.y > box.top && p.y < box.bottom;
    const edge = [0, 0.25, 0.5, 0.75, 1].flatMap((t) => [
      { x: box.left + (box.right - box.left) * t, y: box.top },
      { x: box.left + (box.right - box.left) * t, y: box.bottom },
      { x: box.left, y: box.top + (box.bottom - box.top) * t },
      { x: box.right, y: box.top + (box.bottom - box.top) * t },
    ]);
    if (slots.some((s) => rimOf(s, 48).some(inBox)
      || edge.some((p) => ((p.x - s.x) / s.rx) ** 2 + ((p.y - s.y) / s.ry) ** 2 < 1))) covered.push(i + 1);
  }
  check(`${label}: six capabilities in a row keep off the title`, covered.length === 0,
    `title covered after capability ${covered.join(', ')}`);
}

// The title may hang off the edge, but only by so much.
check('a title dragged far away is pulled back to the blob', (() => {
  const far = geo.layoutDomain({ id: 'd', title: 'Invoicing', titleX: 0, titleY: -9000 }, placed(4));
  return Math.abs(far.title.y) < 9000 && far.contains(far.title.x, far.title.y);
})());
check('it may overhang by no more than TITLE_OVERHANG of its diameter', (() => {
  const far = geo.layoutDomain({ id: 'd', title: 'Invoicing', titleX: 0, titleY: -9000 }, placed(4));
  // Where the blob's surface is straight up, with the title left where it is.
  let surface = 0;
  for (let r = 6000; r > 0; r -= 2) { if (far.contains(0, -r)) { surface = r; break; } }
  const beyond = (Math.abs(far.title.y) + far.titleLobe.ry - surface) / (2 * far.titleLobe.ry);
  return beyond <= geo.TITLE_OVERHANG + 1e-6;
})());

// --- picking things up ---
const pickable = geo.layoutDomain({ id: 'd', title: 'Invoicing' }, placed(4));
check('a point on a lobe finds that lobe', (() => {
  const lobe = pickable.lobes[2];
  return pickable.lobeAt(lobe.x, lobe.y)?.item.id === lobe.item.id;
})());
check('a point in open ground finds no lobe',
  pickable.lobeAt(pickable.extentWidth * 5, 0) === null);
check('a point on the title is on the title',
  pickable.onTitle(pickable.title.x, pickable.title.y) && !pickable.onTitle(0, 0));

// --- edit mode ---
check('edit mode is off unless asked for', !pickable.editing);
check('edit mode says so', geo.layoutDomain({ id: 'd', title: 'X' }, placed(2), null, { editing: true }).editing);

// --- outline ---
check('a leftover wobble setting changes nothing', (() => {
  const plain = geo.layoutDomain({ id: 'd', title: 'X' }, placed(1));
  const old = geo.layoutDomain({ id: 'd', title: 'X', wobble: 0.3 }, placed(1));
  return plain.path === old.path;
})());
check('two domains with the same contents have the same body', (() => {
  const a = geo.layoutDomain({ id: 'seed-a', title: 'X' }, placed(1));
  const b = geo.layoutDomain({ id: 'seed-b', title: 'X' }, placed(1));
  return a.path === b.path;
})());
check('the same domain is stable across renders', (() => {
  const a = geo.layoutDomain({ id: 'seed-a', title: 'X' }, placed(1));
  const b = geo.layoutDomain({ id: 'seed-a', title: 'X' }, placed(1));
  return a.path === b.path;
})());

// --- domain titles wrap like capability titles ---
const wordy = geo.layoutDomain(
  { id: 'd', title: 'Merchant and partner enablement across every region we serve' }, placed(2));
check('a long domain title is cut to 3 rows', wordy.title.lines.length === 3, JSON.stringify(wordy.title.lines));
check('a long domain title ends with an ellipsis', wordy.title.lines[2].endsWith('…'));
check('the title box scales on its own', (() => {
  const big = geo.layoutDomain({ id: 'd', title: 'Invoicing', titleScale: 2 }, placed(2));
  const plain = geo.layoutDomain({ id: 'd', title: 'Invoicing' }, placed(2));
  return big.title.boxWidth > plain.title.boxWidth && big.title.fontSize === plain.title.fontSize;
})());

// --- line breaks the author asked for ---
check('a newline starts a new row', (() => {
  const lines = geo.wrapLines('Risk\nand\ncontrol', 16, 400);
  return lines.length === 3 && lines[0] === 'Risk' && lines[2] === 'control';
})());
check('breaks survive past the three-row budget', (() => {
  const lines = geo.wrapLines('one\ntwo\nthree\nfour\nfive', 16, 400);
  return lines.length === 5 && lines[4] === 'five';
})());
check('a blank line between breaks is kept', (() => {
  const lines = geo.wrapLines('top\n\nbottom', 16, 400);
  return lines.length === 3 && lines[1] === '';
})());
check('rows still wrap within a broken paragraph', (() => {
  const lines = geo.wrapLines('a b c d e f g h i j k l\nlast', 16, 60);
  return lines.length > 2 && lines[lines.length - 1] === 'last';
})());
check('text with no breaks wraps exactly as before', (() => {
  const lines = geo.wrapLines('Merchant and partner enablement across every region', 16, 90);
  return lines.length === 3 && lines[2].endsWith('…');
})());
check('a domain title renders its breaks', (() => {
  const laid = geo.layoutDomain({ id: 'd', title: 'Customer\nRisk' }, placed(2));
  return laid.title.lines.length === 2 && laid.title.lines[1] === 'Risk';
})());

// --- the title's text area has a width you can drag ---
check('the title wraps at the width it was given', (() => {
  const narrow = geo.layoutDomain({ id: 'd', title: 'Merchant partner enablement', titleWidth: 60 }, placed(2));
  const wide = geo.layoutDomain({ id: 'd', title: 'Merchant partner enablement', titleWidth: 2000 }, placed(2));
  return narrow.title.lines.length > wide.title.lines.length && wide.title.lines.length === 1;
})());
check('the default width follows the font size', (() => {
  const laid = geo.layoutDomain({ id: 'd', title: 'X', fontSize: 36 }, placed(1));
  return laid.title.wrapWidth === 36 * geo.TITLE_WIDTH_PER_EM;
})());
check('a width outside the limits is pulled back', (() => geo.titleWidthOf({ titleWidth: 5 }) === geo.MIN_TITLE_WIDTH
  && geo.titleWidthOf({ titleWidth: 99999 }) === geo.MAX_TITLE_WIDTH)());

// --- which snap point a dragged line end lands on ---
check('a point due right of an oval is snap 0', geo.nearestSnapIndex({ rx: 100, ry: 50 }, 120, 0) === 0);
check('a point below an oval is a quarter of the way round',
  geo.nearestSnapIndex({ rx: 100, ry: 50 }, 0, 80) === geo.SNAP_COUNT / 4);
check('a point above an oval is three quarters round',
  geo.nearestSnapIndex({ rx: 100, ry: 50 }, 0, -80) === (geo.SNAP_COUNT * 3) / 4);
check('every snap point maps back to its own index', (() => {
  const size = { rx: 90, ry: 40 };
  return geo.snapPoints(size.rx, size.ry)
    .every((point) => geo.nearestSnapIndex(size, point.x, point.y) === point.index);
})());

// --- an icon rides above the title ---
check('an icon leaves the oval alone as well', (() => {
  const cap = { title: 'Consumer lending platform', fontSize: 22 };
  const plain = geo.capabilitySize(cap);
  const withIcon = geo.capabilitySize({ ...cap, icon: 'gear.svg' });
  return withIcon.rx === plain.rx && withIcon.ry === plain.ry;
})());
// The icon is narrow, so it rides up into the crown of the oval, where a row of
// words would never fit. Adding one used to cost the title a row outright.
check('  ...and leaves the words the rows they had', (() => {
  const cap = { title: 'Consumer lending platform' };
  const plain = geo.capabilitySize(cap);
  const withIcon = geo.capabilitySize({ ...cap, icon: 'gear.svg' });
  return plain.lines.length === 2 && withIcon.lines.join(' ') === plain.lines.join(' ');
})());
check('the icon is drawn larger than the type under it', (() => {
  const size = geo.capabilitySize({ title: 'Invoicing', fontSize: 32, icon: 'gear.svg' });
  return size.iconSize > size.fontSize;
})());
check('the icon gives way before the words lose a row', (() => {
  const shape = { fontSize: 72, sizeScale: 2, icon: 'gear.svg' };
  const roomy = geo.capabilitySize({ ...shape, title: 'Pay' });
  const crowded = geo.capabilitySize({ ...shape, title: 'Transfers Transfers' });
  return crowded.lines.length === 2
    && crowded.iconSize < roomy.iconSize && crowded.iconSize >= crowded.fontSize;
})());
check('a stack too tall for the middle climbs into the crown', (() => {
  const size = geo.capabilitySize({ title: 'Consumer lending platform', icon: 'gear.svg' });
  const top = size.iconY - size.iconSize / 2;
  const bottom = size.textY + size.height / 2;
  return -top > bottom;
})());
check('  ...and the corners of the icon stay inside the oval', (() => {
  const size = geo.capabilitySize({ title: 'Consumer lending platform', icon: 'gear.svg' });
  const x = size.iconSize / 2;
  const y = size.iconY - size.iconSize / 2;
  return (x / size.rx) ** 2 + (y / size.ry) ** 2 < 1;
})());
// A short last row may sink past the foot of the box the words wrap into, and
// what it gives up goes to the icon. No row's corners may leave the oval for it.
const rowsInside = (size) => size.lines.every((line, row) => {
  const x = geo.measure(line, size.fontSize, size.fontWeight) / 2;
  const top = size.textY - size.height / 2 + row * size.lineHeight;
  return [top, top + size.lineHeight].every((y) => (x / size.rx) ** 2 + (y / size.ry) ** 2 < 1);
});
check('a short last row hands the room under it to the icon', (() => {
  const shape = { fontSize: 72, sizeScale: 2, icon: 'gear.svg' };
  const even = geo.capabilitySize({ ...shape, title: 'Transfers Transfers' });
  const short = geo.capabilitySize({ ...shape, title: 'Transfers Pay' });
  return even.lines.length === 2 && short.lines.length === 2 && short.iconSize > even.iconSize;
})());
check('  ...and every row stays inside the oval all the same', (() => {
  const shape = { fontSize: 72, sizeScale: 2, icon: 'gear.svg' };
  return rowsInside(geo.capabilitySize({ ...shape, title: 'Transfers Pay' }))
    && rowsInside(geo.capabilitySize({ ...shape, title: 'Transfers Transfers' }))
    && rowsInside(geo.capabilitySize({ title: 'Consumer lending platform', icon: 'gear.svg' }));
})());
check('the icon sits above the words', (() => {
  const size = geo.capabilitySize({ title: 'Invoicing', fontSize: 22, icon: 'gear.svg' });
  return size.iconY < 0 && size.textY > 0 && size.iconY < size.textY;
})());
check('the two are centred together', (() => {
  const size = geo.capabilitySize({ title: 'Invoicing', fontSize: 22, icon: 'gear.svg' });
  const top = size.iconY - size.iconSize / 2;
  const bottom = size.textY + size.height / 2;
  return Math.abs(top + bottom) < 1e-9;   // the stack straddles the middle
})());
check('no icon means no room taken for one', (() => {
  const size = geo.capabilitySize({ title: 'Invoicing', fontSize: 22 });
  return size.iconSize === 0 && size.iconY === 0 && size.textY === 0 && size.textX === 0;
})());

// --- which side of the title the icon sits on ---
const iconAt = (iconPlacement, fields = {}) =>
  geo.capabilitySize({ title: 'Consumer lending', icon: 'gear.svg', ...fields, iconPlacement });
check('an icon sits over the title until it is told otherwise', (() => {
  const unset = geo.capabilitySize({ title: 'Consumer lending', icon: 'gear.svg' });
  return unset.iconY === iconAt('top').iconY && unset.iconY < unset.textY && unset.iconX === 0;
})());
check('a placement nobody has heard of is over the title too',
  iconAt('middle').iconY === iconAt('top').iconY);
check('under the title is over it, seen in a mirror', (() => {
  const under = iconAt('bottom', { title: 'Invoicing' });
  const over = iconAt('top', { title: 'Invoicing' });
  return under.iconY > under.textY && under.iconX === 0
    && Math.abs(under.iconY + over.iconY) < 4 && under.iconSize === over.iconSize;
})());
check('left of the title puts the two side by side, level with each other', (() => {
  const size = iconAt('left');
  return size.iconX < size.textX && size.iconY === 0 && size.textY === 0;
})());
check('right of the title is left of it, seen in a mirror', (() => {
  const left = iconAt('left');
  const right = iconAt('right');
  return right.iconX === -left.iconX && right.textX === -left.textX
    && right.lines.join('|') === left.lines.join('|');
})());
check('beside the title, the icon and the words do not overlap', (() => {
  const size = iconAt('left');
  return size.iconX + size.iconWidth / 2 < size.textX - size.width / 2;
})());
check('  ...and the pair is centred on the shape', (() => {
  const size = iconAt('left', { title: 'Pay' });
  const left = size.iconX - size.iconWidth / 2;
  const right = size.textX + size.width / 2;
  return Math.abs(left + right) < 1e-9;
})());
check('an icon beside the title costs it width, not rows of height', (() => {
  const over = iconAt('top', { title: 'Consumer lending platform for everyone', sizeScale: 2 });
  const beside = iconAt('left', { title: 'Consumer lending platform for everyone', sizeScale: 2 });
  return beside.lines.length >= over.lines.length && beside.width <= over.width + 1e-9;
})());
check('the corners of an icon beside the title stay inside the oval', (() => {
  const size = iconAt('left', { title: 'Consumer lending platform' });
  const x = size.iconX - size.iconWidth / 2;
  const y = size.iconHeight / 2;
  return (x / size.rx) ** 2 + (y / size.ry) ** 2 < 1;
})());
check('a touchpoint places its icon the same four ways', (() => {
  const at = (iconPlacement) => geo.touchpointSize({ title: 'Checkout widget', icon: 'gear.svg', iconPlacement });
  return at('top').iconY < 0 && at('bottom').iconY > 0 && at('left').iconX < 0 && at('right').iconX > 0
    && at('left').iconX - at('left').iconWidth / 2 > -at('left').rx;
})());
check('and an actor its figure', (() => {
  const at = (iconPlacement) => geo.actorSize({ title: 'Shopper', sizeScale: 1.4, iconPlacement });
  return at('top').figureY < 0 && at('bottom').figureY > 0
    && at('left').figureX < 0 && at('right').figureX > 0 && at('top').figureX === 0;
})());

// --- an icon is laid out by what is drawn in it, not by its file ---
// A wide drawing in a square file has a great deal of nothing over and under it.
// Laid out by the file, that turns up on the map as a gap between icon and title.
const wideInk = { x: 0.1, y: 0.35, width: 0.8, height: 0.3, aspect: 1 };
geo.setIconInk('wide.svg', wideInk);
check('an icon nobody has measured is taken for its whole file, square', (() => {
  const size = geo.capabilitySize({ title: 'Invoicing', icon: 'gear.svg' });
  return size.iconWidth === size.iconSize && size.iconHeight === size.iconSize;
})());
check('a wide drawing gets a wide box, and a short one', (() => {
  const size = geo.capabilitySize({ title: 'Invoicing', icon: 'wide.svg' });
  return size.iconWidth > size.iconSize && size.iconHeight < size.iconSize
    && Math.abs(size.iconWidth / size.iconHeight - 0.8 / 0.3) < 1e-9;
})());
check('  ...so the air over and under it is not counted as icon', (() => {
  const square = geo.capabilitySize({ title: 'Invoicing', icon: 'gear.svg' });
  const wide = geo.capabilitySize({ title: 'Invoicing', icon: 'wide.svg' });
  const gapOf = (size) => (size.textY - size.height / 2) - (size.iconY + size.iconHeight / 2);
  return Math.abs(gapOf(square) - gapOf(wide)) < 1e-9;
})());
check('the gap is between ink and letters, so it is smaller than a row\'s own leading', (() => {
  const size = geo.capabilitySize({ title: 'Invoicing', icon: 'gear.svg' });
  const gap = (size.textY - size.height / 2) - (size.iconY + size.iconHeight / 2);
  return Math.abs(gap) < size.fontSize * 0.1;
})());
check('the picture is placed so that its ink lands on the box it was given', (() => {
  const size = geo.capabilitySize({ title: 'Invoicing', icon: 'wide.svg' });
  const box = geo.iconImageBox(size, wideInk);
  const inkLeft = box.x + wideInk.x * box.width;
  const inkTop = box.y + wideInk.y * box.height;
  return Math.abs(inkLeft - (size.iconX - size.iconWidth / 2)) < 1e-9
    && Math.abs(inkTop - (size.iconY - size.iconHeight / 2)) < 1e-9
    && Math.abs(wideInk.width * box.width - size.iconWidth) < 1e-9
    && Math.abs(wideInk.height * box.height - size.iconHeight) < 1e-9;
})());
check('a heavier drawing of the same file is measured as its own', (() => {
  const plain = { icon: 'wide.svg' };
  const heavy = { icon: 'wide.svg', iconWeight: 2 };
  return geo.iconKeyOf(plain) === 'wide.svg' && geo.iconKeyOf(heavy) !== geo.iconKeyOf(plain)
    && geo.iconInkOf(geo.iconKeyOf(heavy)) === geo.WHOLE_ICON;
})());
check('only an SVG has lines to weigh',
  geo.iconWeightOf({ icon: 'photo.png', iconWeight: 3 }) === 1
  && geo.iconWeightOf({ icon: 'gear.svg', iconWeight: 3 }) === 3
  && geo.iconWeightOf({ icon: 'gear.svg' }) === 1);
check('the icon grows with the font', (() => {
  const small = geo.capabilitySize({ title: 'X', fontSize: 16, icon: 'gear.svg' });
  const large = geo.capabilitySize({ title: 'X', fontSize: 46, icon: 'gear.svg' });
  return large.iconSize > small.iconSize;
})());
check('a lobe follows the shape scale', (() => {
  const cap = { title: 'Consumer lending platform' };
  return geo.lobeSizeFor({ ...cap, sizeScale: 2 }).ry > geo.lobeSizeFor(cap).ry;
})());

// --- default colours ---
// A default is written as hex, but a shape wears a swatch: the hex is matched
// against whatever palette the map has.
geo.setPalette(['#527a42', '#86a27b', '#cbd7c6', '#e5ebe3', '#014bb3', '#d6e6ff',
  '#4925cb', '#e6d4ff', '#ef706b', '#ff7429', '#3e5c73', '#d4d1cf']);
// --- touchpoints and actors ---------------------------------------------------

// A touchpoint is a rounded rectangle and an actor a circle, but both carry the
// same twenty-four snap points a capability does, so a line moved from one to
// another lands on the point facing the same way.

const touchpoint = geo.touchpointSize({ title: 'Checkout widget', fontSize: 32, sizeScale: 1, stretch: 2 });
const actor = geo.actorSize({ title: 'Shopper', fontSize: 32, sizeScale: 1 });

check('a touchpoint is a rectangle', touchpoint.shape === 'rect');
check('an actor is a circle', actor.shape === 'circle');
check('an actor has one radius', actor.rx === actor.ry, `${actor.rx} vs ${actor.ry}`);
check('the corners of a touchpoint never exceed its shorter half-side',
  touchpoint.corner <= Math.min(touchpoint.rx, touchpoint.ry));

const tpPoints = geo.snapPoints(touchpoint);
const acPoints = geo.snapPoints(actor);
check('a touchpoint has the same number of snap points as anything else',
  tpPoints.length === geo.SNAP_COUNT && acPoints.length === geo.SNAP_COUNT);

// Every point of a rectangle sits *on* an edge: one coordinate is at the full
// half-width or half-height, and neither is past it.
const onEdge = (point, size) => {
  const atX = Math.abs(Math.abs(point.x) - size.rx) < 1e-6;
  const atY = Math.abs(Math.abs(point.y) - size.ry) < 1e-6;
  const inside = Math.abs(point.x) <= size.rx + 1e-6 && Math.abs(point.y) <= size.ry + 1e-6;
  return (atX || atY) && inside;
};
check('every snap point of a touchpoint sits on its edge',
  tpPoints.every((point) => onEdge(point, touchpoint)));

check('snap 0 is due right of a touchpoint',
  Math.abs(tpPoints[0].x - touchpoint.rx) < 1e-6 && Math.abs(tpPoints[0].y) < 1e-6);
check('and a quarter of the way round is squarely below it',
  Math.abs(tpPoints[geo.SNAP_COUNT / 4].y - touchpoint.ry) < 1e-6);

// The way out of a flat face is the axis of that face, not the angle the point
// was placed at — which is what keeps a line leaving a wide box square to it.
const rightNormal = geo.snapNormal(touchpoint, 0);
const bottomNormal = geo.snapNormal(touchpoint, geo.SNAP_COUNT / 4);
check('a point on the right face faces right',
  rightNormal.x === 1 && rightNormal.y === 0);
check('a point on the bottom face faces down',
  bottomNormal.x === 0 && bottomNormal.y === 1);

check('the normals of an actor still radiate, as those of a circle do',
  Math.abs(geo.snapNormal(actor, 0).x - 1) < 1e-6
  && Math.abs(geo.snapNormal(actor, geo.SNAP_COUNT / 4).y - 1) < 1e-6);

check('sizeOf measures each kind the way that kind is measured',
  geo.sizeOf('touchpoint', { title: 'A', fontSize: 32 }).shape === 'rect'
  && geo.sizeOf('actor', { title: 'A', fontSize: 32 }).shape === 'circle'
  && geo.sizeOf('capability', { title: 'A', fontSize: 32 }).shape === undefined);

// The label has to fit the shape it is in, which is the whole reason each kind
// measures its own text box.
check('the words of a touchpoint stay inside its box',
  touchpoint.width <= touchpoint.rx * 2 + 1e-6);
check('the words of an actor stay inside its circle',
  actor.width <= actor.rx * 2 + 1e-6);
check('an actor keeps room for its figure above the words',
  actor.figureSize > 0 && actor.figureY < actor.textY);
check('the figure gives way before the name loses a row', (() => {
  const roomy = geo.actorSize({ title: 'Shopper', fontSize: 64, sizeScale: 2.2 });
  const named = geo.actorSize({ title: 'Shopper Shopper Shopper', fontSize: 64, sizeScale: 2.2 });
  return named.lines.length > roomy.lines.length
    && named.figureSize < roomy.figureSize && named.figureSize > 0;
})());
check('the figure stays inside the circle', (() => {
  const named = geo.actorSize({ title: 'Shopper Shopper Shopper', fontSize: 64, sizeScale: 2.2 });
  return Math.hypot(named.figureSize / 2, named.figureY - named.figureSize / 2) < named.rx;
})());
check('an icon in a touchpoint sits over the words, and inside the box', (() => {
  const size = geo.touchpointSize({ title: 'Checkout widget', fontSize: 32, icon: 'gear.svg' });
  return size.iconSize > size.fontSize
    && size.iconY < size.textY
    && size.iconY - size.iconSize / 2 > -size.ry
    && size.textY + size.height / 2 < size.ry;
})());

check('a colour in the palette is found as its own swatch',
  geo.swatchFor('#d4d1cf') === 12 && geo.swatchFor('#86a27b') === 2,
  `${geo.swatchFor('#d4d1cf')}, ${geo.swatchFor('#86a27b')}`);
check('a colour the palette lacks gets the nearest swatch',
  geo.swatchFor('#d0d0d0') === 12, String(geo.swatchFor('#d0d0d0')));
check('the short hex form reads as the long one', geo.swatchFor('#e6f') === geo.swatchFor('#ee66ff'));
geo.setPalette([]);

// --- areas: the band round what a team holds ---
// Three shapes well apart, as a team's domains are: two level, one far below.
const spread = [
  rimOf({ x: 0, y: 0, rx: 300, ry: 200 }),
  rimOf({ x: 1400, y: 0, rx: 300, ry: 200 }),
  rimOf({ x: 700, y: 1800, rx: 250, ry: 160 }),
];
const heldPoints = spread.flat();
const band = geo.bandRound(heldPoints, geo.AREA_PAD);
const distanceTo = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

check('the band takes in every point it is drawn round',
  heldPoints.every((p) => geo.insideOutline(band, p.x, p.y)));
check('and stands off from all of them by its margin',
  band.every((b) => heldPoints.every((p) => distanceTo(b, p) >= geo.AREA_PAD - 0.01)),
  String(Math.min(...band.flatMap((b) => heldPoints.map((p) => distanceTo(b, p))))));
check('it is convex: it never turns back on itself, however far apart its members are', (() => {
  const turn = (a, b, c) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  return band.every((b, i) => turn(band.at(i - 1), b, band[(i + 1) % band.length]) > -1e-6);
})());
check('its corners are rounded: no two neighbouring stretches meet at a sharp angle', (() => {
  const heading = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  return band.every((b, i) => {
    const bend = Math.abs(heading(band.at(i - 1), b) - heading(b, band[(i + 1) % band.length]));
    return Math.min(bend, 2 * Math.PI - bend) < 0.2;
  });
})());
check('open ground well outside it is outside', !geo.insideOutline(band, -900, 1800));
check('a stranger parked between two members is inside the line, as the release page owns up to',
  geo.insideOutline(band, 700, 0));

const lone = geo.bandRound([{ x: 50, y: 50 }], 40);
check('one point gives a circle', lone.every((p) => Math.abs(distanceTo(p, { x: 50, y: 50 }) - 40) < 1e-6));
const pill = geo.bandRound([{ x: 0, y: 0 }, { x: 200, y: 0 }], 40);
check('and two a pill, by the same rule',
  Math.min(...pill.map((p) => p.x)) === -40 && Math.max(...pill.map((p) => p.x)) === 240
  && Math.abs(Math.max(...pill.map((p) => p.y)) - 40) < 1e-6);
check('points piled on one spot are one point', geo.bandRound([{ x: 1, y: 1 }, { x: 1, y: 1 }], 10).length > 8);

// The title rides the border, at an angle seen from the middle of the band.
const team = geo.layoutArea({ title: 'Payments', fontSize: 64, fontWeight: 'bold' }, spread);
/** How far a point is from the line itself — its straight stretches run long between corners. */
const onTheBand = (point) => Math.min(...team.band.map((a, i) => {
  const b = team.band[(i + 1) % team.band.length];
  const run = { x: b.x - a.x, y: b.y - a.y };
  const t = Math.max(0, Math.min(1,
    ((point.x - a.x) * run.x + (point.y - a.y) * run.y) / (run.x ** 2 + run.y ** 2 || 1)));
  return distanceTo(point, { x: a.x + run.x * t, y: a.y + run.y * t });
}));
check('a title nobody has moved rides the top of the band',
  team.title.angle === geo.DEFAULT_TITLE_ANGLE && onTheBand(team.title) < 0.01
  && Math.abs(team.title.y - Math.min(...team.band.map((p) => p.y))) < 0.01,
  `${team.title.x},${team.title.y}`);
// Rows are the breaks typed into the title and nothing more, and they stand
// outside the band with the nearest one astride the line.
const legend = { title: 'Money\nMovement', fontSize: 64, fontWeight: 'bold' };
const stacked = geo.layoutArea(legend, spread);
check('an area’s title keeps the rows typed into it, and nothing wraps',
  stacked.title.lines.join('|') === 'Money|Movement'
  && stacked.title.height === 2 * stacked.title.lineHeight
  && geo.layoutArea({ ...legend, title: 'Money Movement Across Every Border There Is' }, spread).title.lines.length === 1);
check('and the break in the border is as wide as the longest row',
  stacked.title.width === geo.layoutArea({ ...legend, title: 'Movement' }, spread).title.width);
check('at the top the rows stand above the line, the lowest astride it',
  onTheBand({ x: stacked.title.x, y: stacked.title.y + stacked.title.lineHeight / 2 }) < 0.01
  && stacked.title.y - stacked.title.height / 2 < Math.min(...stacked.band.map((p) => p.y)));
const hung = geo.layoutArea({ ...legend, titleAngle: 90 }, spread);
check('at the bottom they hang below it, the highest astride',
  onTheBand({ x: hung.title.x, y: hung.title.y - hung.title.lineHeight / 2 }) < 0.01
  && hung.title.y + hung.title.height / 2 > Math.max(...hung.band.map((p) => p.y)));
const beside = geo.layoutArea({ ...legend, titleAngle: 0 }, spread);
check('at a side the block sits astride the line, there being no outside to stand in',
  onTheBand(beside.title) < 0.01);
const slanting = geo.layoutArea({ ...legend, titleAngle: 315 }, spread);
const slantingAt = geo.rimPoint(slanting.band, slanting.centre, 315);
check('and between the two it shades with the angle rather than jumping a row',
  slanting.title.y < slantingAt.y
  && slanting.title.y > slantingAt.y - (slanting.title.height - slanting.title.lineHeight) / 2);
check('Title size sizes the words themselves, there being no lobe round them',
  geo.layoutArea({ title: 'Payments', fontSize: 64, titleScale: 0.5 }, spread).title.fontSize === 32);

for (const angle of [0, 45, 90, 180, 212.5, 300]) {
  const slid = geo.layoutArea({ title: 'Payments', titleAngle: angle }, spread);
  check(`slid to ${angle}°, the title is still on the border`, onTheBand(slid.title) < 0.01,
    String(onTheBand(slid.title)));
  check(`and sits where that angle looks from the middle`,
    Math.abs(geo.angleFrom(slid.centre, slid.title.x, slid.title.y) - angle) < 0.11);
}
check('an angle is kept to a tenth of a degree, and a full turn is none',
  geo.angleFrom({ x: 0, y: 0 }, 100, -0.01) === 0 && geo.angleFrom({ x: 0, y: 0 }, 0, -10) === 270);

// The border is broken behind the title, and nowhere else.
const runs = geo.outlineOutside(team.band, team.gap);
const inTheGap = (p) => p.x > team.gap.minX + 0.01 && p.x < team.gap.maxX - 0.01
  && p.y > team.gap.minY + 0.01 && p.y < team.gap.maxY - 0.01;
check('the border is one open run with the title’s room taken out of it', runs.length === 1
  && team.rim.startsWith('M') && !team.rim.endsWith('Z'));
check('none of it passes behind the title', runs.flat().every((p) => !inTheGap(p)));
check('and it is cut at the edge of that room, not at the nearest corner of the band',
  Math.abs(runs[0][0].x - team.gap.maxX) < 0.01 && Math.abs(runs[0].at(-1).x - team.gap.minX) < 0.01,
  `${runs[0][0].x} ${runs[0].at(-1).x} against ${team.gap.minX}..${team.gap.maxX}`);
check('the wash is the whole band, closed', team.path.endsWith('Z'));
check('a box nowhere near leaves the outline whole',
  geo.outlineOutside(team.band, { minX: 9000, maxX: 9100, minY: 0, maxY: 10 })[0].length === team.band.length + 1);
check('what is drawn reaches past the band by the title hanging over it',
  team.bounds.minY < Math.min(...team.band.map((p) => p.y)));
check('the inside of the line is what a drop asks about',
  team.contains(700, 600) && !team.contains(-900, 1800));

// An area with nothing in it is a pill at its own position, long enough for its title.
const bare = geo.layoutArea({ title: 'New area', x: 500, y: -200 }, []);
const titledAtLength = geo.layoutArea({ title: 'Customer and Merchant Experience Platform', x: 500, y: -200 }, []);
check('an empty area sits where it says it does', bare.empty
  && Math.abs(bare.centre.x - 500) < 1e-6 && Math.abs(bare.centre.y + 200) < 1e-6);
check('and is long enough to carry its title, however long',
  titledAtLength.gap.minX > Math.min(...titledAtLength.band.map((p) => p.x)) && titledAtLength.gap.maxX < Math.max(...titledAtLength.band.map((p) => p.x))
  && titledAtLength.bounds.maxX - titledAtLength.bounds.minX > bare.bounds.maxX - bare.bounds.minX);
check('with its border still in one piece round the title', bare.rim.split('M').length - 1 === 1);

// A domain hands over its real outline, which is what the band goes round.
const blob = geo.layoutDomain({ title: 'Billing', x: 0, y: 0 }, [
  { id: 'a', title: 'Invoicing', lobeX: -200, lobeY: 0 },
  { id: 'b', title: 'Dunning', lobeX: 260, lobeY: 120 },
]);
check('a domain’s outline is the points its blob was drawn through',
  blob.outline.length > 60 && blob.outline.every((p) =>
    p.x >= blob.bounds.minX - 1e-6 && p.x <= blob.bounds.maxX + 1e-6));

// --- the ink a title wears on the paper ---
const ratio = (hex, back = '#fffdfa') => {
  const lum = (h) => {
    const n = parseInt(h.slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [light, dark] = [lum(hex), lum(back)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
};
check('a colour that already reads is left as it is', geo.deepened('#9f4e4e') === '#9f4e4e');
for (const pale of ['#fede49', '#aedbe6', '#fee986', '#e8bbd5', '#5985ab']) {
  check(`${pale} is deepened until it reads as type`, ratio(geo.deepened(pale)) >= geo.READABLE,
    `${geo.deepened(pale)} at ${ratio(geo.deepened(pale)).toFixed(2)}`);
}
check('and by no more than it takes: a yellow line gets an olive title, not a black one',
  ratio(geo.deepened('#fede49')) < geo.READABLE + 0.4 && geo.deepened('#fede49') !== '#282828',
  geo.deepened('#fede49'));
check('the short hex form deepens as the long one does', geo.deepened('#fd4') === geo.deepened('#ffdd44'));

// --- features inside a capability ---
const NAMES = ['Refunds', 'Chargebacks', 'Partial capture', 'Payment authorisation', 'Three-D Secure',
  'Tokenisation', 'Card vaulting', 'Dispute evidence', 'Settlement files', 'Currency conversion',
  'Scheme fees', 'Retries', 'Account updater', 'Risk scoring hand-off', 'Payouts', 'Split payments',
  'Recurring mandates', 'Network tokens', 'Receipts', 'Idempotency', 'Webhooks', 'Void',
  'Incremental auth', 'Pre-auth', 'MOTO', 'Pay by link', 'Wallets', 'BIN lookup', 'Surcharging', 'Tips'];
const featuresOf = (count) => NAMES.slice(0, count).map((title, at) => ({ id: `f${at}`, title }));
const OVALS = [{}, { sizeScale: 1.6 }, { stretch: 0 }, { stretch: -2, sizeScale: 2 }, { sizeScale: 3 }];
/** Every point round a bubble's rim is inside the oval that holds it. */
const within = (oval, bubble) => rimOf(bubble).every((p) =>
  (p.x / oval.rx) ** 2 + (p.y / oval.ry) ** 2 <= 1.0001);
const apart = (a, b) => rimOf(a).every((p) => ((p.x - b.x) / b.rx) ** 2 + ((p.y - b.y) / b.ry) ** 2 >= 0.999);

check('a capability that holds nothing has nothing to lay out',
  geo.layoutFeatures(geo.capabilitySize({ title: 'Payments' }), []) === null
  && geo.layoutFeatures(geo.capabilitySize({ title: 'Payments' }), undefined) === null);
for (const look of OVALS) {
  const oval = geo.capabilitySize({ title: 'Payment processing', ...look });
  const named = JSON.stringify(look);
  for (const count of [1, 2, 3, 5, 8, 12, 20, 30]) {
    const laid = geo.layoutFeatures(oval, featuresOf(count), 'Payment processing');
    check(`${count} feature(s) in ${named}: one bubble each, in the order they were given`,
      laid.bubbles.length === count && laid.bubbles.every((bubble, at) => bubble.item.id === `f${at}`));
    check(`${count} in ${named}: every bubble is inside the oval`,
      laid.bubbles.every((bubble) => within(oval, bubble)));
    check(`${count} in ${named}: no two bubbles touch`,
      laid.bubbles.every((a, i) => laid.bubbles.every((b, j) => i === j || apart(a, b))));
    check(`${count} in ${named}: every name is set at the one size`,
      laid.bubbles.every((bubble) => bubble.fontSize === laid.fontSize) && laid.fontSize > 0);
    check(`${count} in ${named}: no name is set larger than the capability's own over them`,
      laid.fontSize <= laid.heading.fontSize, `${laid.fontSize} against ${laid.heading.fontSize}`);
    check(`${count} in ${named}: the capability's name sits above every bubble`,
      laid.bubbles.every((bubble) => laid.heading.y + laid.heading.height / 2 <= bubble.y - bubble.ry + 0.001),
      `${laid.heading.y + laid.heading.height / 2} against ${Math.min(...laid.bubbles.map((b) => b.y - b.ry))}`);
  }
}
const plainOval = geo.capabilitySize({ title: 'Payment processing' });
const few = geo.layoutFeatures(plainOval, featuresOf(3), 'Payment processing');
const many = geo.layoutFeatures(plainOval, featuresOf(30), 'Payment processing');
check('more features are set smaller: the oval does not grow to hold them', many.fontSize < few.fontSize,
  `${many.fontSize} against ${few.fontSize}`);
check('a row through the middle of the oval holds more than the row at its foot', (() => {
  const rows = new Map();
  for (const bubble of many.bubbles) rows.set(Math.round(bubble.y), (rows.get(Math.round(bubble.y)) ?? 0) + 1);
  const counts = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, count]) => count);
  return Math.max(...counts) > counts.at(-1);
})());
check('an oval twice the size sets the same features twice as large',
  Math.abs(geo.layoutFeatures(geo.capabilitySize({ title: 'P', sizeScale: 2 }), featuresOf(8), 'P').fontSize
    - geo.layoutFeatures(geo.capabilitySize({ title: 'P' }), featuresOf(8), 'P').fontSize * 2) < 0.01);
const oneLong = geo.layoutFeatures(plainOval, [
  ...featuresOf(5),
  { id: 'long', title: 'Reconciliation of acquirer statements against the ledger and the scheme reports' },
], 'Payment processing');
const fiveShort = geo.layoutFeatures(plainOval, featuresOf(6), 'Payment processing');
check('one very long name is cut sooner than it shrinks all the others',
  oneLong.fontSize >= fiveShort.fontSize * 0.7 - 0.001
  && oneLong.bubbles.at(-1).lines.at(-1).endsWith('…'),
  `${oneLong.fontSize} against ${fiveShort.fontSize}: ${JSON.stringify(oneLong.bubbles.at(-1).lines)}`);
check('the breaks typed into a capability\'s title are not carried up into its heading',
  !geo.layoutFeatures(plainOval, featuresOf(2), 'Payment\nprocessing').heading.lines.join('|').includes('\n')
  && geo.layoutFeatures(plainOval, featuresOf(2), 'Payment\nprocessing').heading.lines[0] === 'Payment processing');

const closed = geo.capabilitySize({ title: 'Payments' });
check('a closed capability wears one pip a feature', geo.featurePips(closed, 3).length === 3);
check('up to a handful, however many it holds', geo.featurePips(closed, 40).length === geo.featurePips(closed, 400).length
  && geo.featurePips(closed, 40).length < 10);
check('and none when it holds nothing', geo.featurePips(closed, 0).length === 0);
check('the pips sit inside the oval, along its foot',
  geo.featurePips(closed, 40).every((pip) => pip.y > 0 && within(closed, { x: pip.x, y: pip.y, rx: pip.r, ry: pip.r })));
check('a pip is large enough to be counted: about a twentieth of the oval’s height',
  geo.featurePips(closed, 3)[0].r >= closed.ry * 0.04);
check('however the oval leans, a full row stays inside it — drawn smaller where it stands tall',
  geo.OVAL_STRETCHES.every((stretch) => {
    const leant = geo.capabilitySize({ title: 'Pay', stretch });
    const row = geo.featurePips(leant, 40);
    return row.length > 0 && row.every((pip) => within(leant, { x: pip.x, y: pip.y, rx: pip.r, ry: pip.r }));
  }));
check('and the pips of a row never touch', (() => {
  const row = geo.featurePips(geo.capabilitySize({ title: 'Pay', stretch: -2 }), 40);
  return row.every((pip, at) => at === 0 || pip.x - row[at - 1].x > pip.r * 2);
})());
check('they stand down where the title reaches the foot of the oval', (() => {
  const full = geo.capabilitySize({
    title: 'One\ntwo\nthree\nfour\nfive\nsix\nseven\neight', fontSize: 24,
  });
  return geo.featurePips(full, 5).length === 0;
})());

// The checks below share short names with the ones above — a blob, a pair — so they keep to a scope of their own.
{
// --- a feature put somewhere by hand ---
const handOval = geo.capabilitySize({ title: 'Payment processing' });
const inRows = geo.layoutFeatures(handOval, featuresOf(6), 'Payment processing');
const moved = featuresOf(6);
moved[2] = { ...moved[2], x: -50, y: 40 };
const byHand = geo.layoutFeatures(handOval, moved, 'Payment processing');
check('a feature put somewhere by hand sits at that share of its capability\'s radii',
  Math.abs(byHand.bubbles[2].x - -0.5 * handOval.rx) < 0.01 && Math.abs(byHand.bubbles[2].y - 0.4 * handOval.ry) < 0.01,
  `${byHand.bubbles[2].x},${byHand.bubbles[2].y}`);
check('and the rest keep the rows their order gives them',
  [0, 1, 3, 4, 5].every((at) => byHand.bubbles[at].x === inRows.bubbles[at].x && byHand.bubbles[at].y === inRows.bubbles[at].y));
check('it is the size its seat would have made it, and set in the same type',
  byHand.bubbles[2].rx === inRows.bubbles[2].rx && byHand.fontSize === inRows.fontSize);
const atTheRim = featuresOf(6);
atTheRim[0] = { ...atTheRim[0], x: 100, y: 0 };
const rimmed = geo.layoutFeatures(handOval, atTheRim, 'Payment processing');
check('a place at the very rim is the bubble touching the rim, not its middle on it',
  within(handOval, rimmed.bubbles[0]) && rimmed.bubbles[0].x > handOval.rx * 0.5, `${rimmed.bubbles[0].x}`);
const twice = geo.capabilitySize({ title: 'Payment processing', sizeScale: 2 });
check('it keeps its place through a resize of the capability, being kept as a share of it',
  Math.abs(geo.layoutFeatures(twice, moved, 'P').bubbles[2].x - -0.5 * twice.rx) < 0.01);
const dropped = geo.featurePlace(handOval, inRows.bubbles[0], { x: 30, y: -20 });
check('a feature let go is kept as whole hundredths of the radii',
  Number.isInteger(dropped.x) && Number.isInteger(dropped.y)
  && Math.abs((dropped.x / 100) * handOval.rx - 30) < handOval.rx / 100
  && Math.abs((dropped.y / 100) * handOval.ry - -20) < handOval.ry / 100, JSON.stringify(dropped));
const farOut = geo.featurePlace(handOval, inRows.bubbles[0], { x: 900, y: 0 });
check('one let go outside the oval is kept where the bubble comes to rest, inside it',
  farOut.x <= 100 && farOut.x > 50 && farOut.y === 0, JSON.stringify(farOut));

// --- a feature that leans ---
const leanOval = geo.capabilitySize({ title: 'Payment processing', sizeScale: 2 });
/** Three features side by side, with the middle one leaning as told. */
const leanTo = (stretch, count = 3, at = 1) => geo.layoutFeatures(leanOval,
  featuresOf(count).map((one, i) => (i === at ? { ...one, stretch } : one)), 'Payment processing');
const lying = geo.layoutFeatures(leanOval, featuresOf(3), 'Payment processing');
const seat = lying.bubbles[1];
const near = (a, b) => Math.abs(a - b) < 1e-9;
check('a feature left alone lies wide, as its row makes it, and so does one told to',
  seat.rx > seat.ry && leanTo(2).bubbles[1].rx === seat.rx && leanTo(2).bubbles[1].ry === seat.ry
  && leanTo(2).bubbles[1].x === seat.x && leanTo(2).bubbles[1].y === seat.y);
check('stood up it is the bubble it was, a quarter turn round',
  near(leanTo(-2).bubbles[1].rx, seat.ry) && near(leanTo(-2).bubbles[1].ry, seat.rx));
check('half way there it is round, the mean of its two radii',
  near(leanTo(0).bubbles[1].rx, (seat.rx + seat.ry) / 2) && near(leanTo(0).bubbles[1].ry, (seat.rx + seat.ry) / 2));
check('and the steps between are even, as a capability\'s are',
  near(leanTo(1).bubbles[1].rx - leanTo(0).bubbles[1].rx, leanTo(0).bubbles[1].rx - leanTo(-1).bubbles[1].rx)
  && near(leanTo(-1).bubbles[1].ry - leanTo(0).bubbles[1].ry, leanTo(0).bubbles[1].ry - leanTo(1).bubbles[1].ry));
check('a lean off the scale is held to its nearer end',
  near(leanTo(-9).bubbles[1].ry, seat.rx) && leanTo(9).bubbles[1].rx === seat.rx);
check('its neighbours keep their seats and the shape their row gave them',
  [0, 2].every((at) => ['x', 'y', 'rx', 'ry'].every((field) => leanTo(-2).bubbles[at][field] === lying.bubbles[at][field])));
for (const count of [1, 3, 8, 20]) {
  for (const stretch of [1, 0, -1, -2]) {
    const stood = leanTo(stretch, count, 0).bubbles[0];
    check(`one of ${count} leaning to ${stretch} is still inside its capability, under the name`,
      within(leanOval, stood) && stood.y - stood.ry >= -0.45 * leanOval.ry - 1e-6,
      `${stood.x},${stood.y} ${stood.rx}x${stood.ry}`);
  }
}
check('standing one up leaves the size the rest are set in alone',
  [1, 0, -1, -2].every((stretch) => leanTo(stretch).fontSize === lying.fontSize
    && [0, 2].every((at) => leanTo(stretch).bubbles[at].fontSize === lying.fontSize)));
check('its own name is set no larger than theirs, and smaller where the shape it was given is too narrow for it',
  [1, 0, -1, -2].every((stretch) => leanTo(stretch).bubbles[1].fontSize <= lying.fontSize)
  && leanTo(-2).bubbles[1].fontSize < lying.fontSize
  && leanTo(-2).bubbles[1].lines.every((line) =>
    geo.measure(line, leanTo(-2).bubbles[1].fontSize, 'regular') <= leanTo(-2).bubbles[1].rx * 2),
  `${leanTo(-2).bubbles[1].fontSize} against ${lying.fontSize}: ${JSON.stringify(leanTo(-2).bubbles[1].lines)}`);
const stoodByHand = geo.layoutFeatures(leanOval,
  featuresOf(3).map((one, i) => (i === 1 ? { ...one, stretch: -2, x: 0, y: 100 } : one)), 'P').bubbles[1];
check('one stood up and put at the rim is held inside by the height it now has',
  within(leanOval, stoodByHand) && near(stoodByHand.ry, seat.rx), `${stoodByHand.y}`);
check('a bubble squeezed no wider than it is tall has no length to stand up on, and is left as it is', (() => {
  const crowd = geo.capabilitySize({ title: 'Payment processing', stretch: -2 });
  const plain = geo.layoutFeatures(crowd, featuresOf(30), 'P');
  const at = plain.bubbles.findIndex((one) => one.rx <= one.ry);
  if (at < 0) return true; // no row here is that crowded: nothing to hold
  const stood = geo.layoutFeatures(crowd, featuresOf(30).map((one, i) => (i === at ? { ...one, stretch: -2 } : one)), 'P');
  return stood.bubbles[at].rx === plain.bubbles[at].rx && stood.bubbles[at].ry === plain.bubbles[at].ry;
})());

// --- the points round a domain's blob ---
const snapDomain = { title: 'Billing', x: 0, y: 0 };
const snapChildren = [
  { id: 'a', title: 'Invoicing', lobeX: -220, lobeY: 60 },
  { id: 'b', title: 'Collections', lobeX: 200, lobeY: 90 },
  { id: 'c', title: 'Dunning', lobeX: 0, lobeY: 260 },
];
const blob = geo.layoutDomain(snapDomain, snapChildren);
const blobAt = {
  x: blob.body.x, y: blob.body.y, shape: 'blob',
  rx: (blob.bounds.maxX - blob.bounds.minX) / 2, ry: (blob.bounds.maxY - blob.bounds.minY) / 2,
  outline: blob.outline.map((p) => ({ x: p.x - blob.body.x, y: p.y - blob.body.y })),
};
const blobSnaps = geo.snapPoints(blobAt);
check('a domain carries the same twenty-four points every shape does', blobSnaps.length === geo.SNAP_COUNT);
check('each is on its blob\'s outline: just inside it is in, just outside it is out',
  blobSnaps.every((p) => geo.insideOutline(blobAt.outline, p.x * 0.98, p.y * 0.98)
    && !geo.insideOutline(blobAt.outline, p.x * 1.02, p.y * 1.02)));
check('and lies the way its number says, seen from the middle of the body',
  blobSnaps.every((p) => {
    const angle = (p.index * 2 * Math.PI) / geo.SNAP_COUNT;
    return Math.abs(Math.atan2(p.y, p.x) - Math.atan2(Math.sin(angle), Math.cos(angle))) < 1e-6
      || Math.abs(Math.abs(Math.atan2(p.y, p.x)) - Math.PI) < 1e-6;
  }));
check('a line leaves a blob the way it was reached, straight out from the middle',
  Math.abs(geo.snapNormal(blobAt, 6).x) < 1e-9 && Math.abs(geo.snapNormal(blobAt, 6).y - 1) < 1e-9);
check('the nearest point of a blob is the one facing the way asked, whatever shape the blob is',
  geo.nearestSnapIndex(blobAt, 0, 500) === 6 && geo.nearestSnapIndex(blobAt, -500, 0) === 12
  && geo.nearestSnapIndex(blobAt, 300, -300) === 21);
const ovalAt = { x: 900, y: 0, rx: 130, ry: 84 };
const pair = geo.closestSnapPair(blobAt, blobAt, ovalAt, ovalAt);
check('a line between a blob and an oval hangs off the points that face each other',
  blobSnaps[pair.fromPoint].x > 0 && pair.toPoint >= 10 && pair.toPoint <= 14, JSON.stringify(pair));

// A domain's points lie on the very rays its outline was sampled along, so each
// ray leaves through a corner of the outline — and one that was read as leaving
// through none put its point on the middle of the body. Which did depended on
// the last digits of the outline, so a lobe is resized through a run of sizes.
check('however its lobes are sized, none of a domain\'s points falls back onto the middle of it', (() => {
  for (let scale = 0.25; scale < 6; scale += 0.05) {
    const sized = geo.layoutDomain({ title: 'Billing', x: 0, y: 0, titleX: -40, titleY: 300 }, [
      { id: 'a', title: 'Invoicing', lobeX: 20, lobeY: -150, lobeScale: scale },
      { id: 'b', title: 'Collections and dunning', lobeX: -120, lobeY: 20, sizeScale: 1.4 },
      { id: 'c', title: 'Credit notes', lobeX: 150, lobeY: 90, lobeScale: 1 + scale / 3 },
    ]);
    const outline = sized.outline.map((p) => ({ x: p.x - sized.body.x, y: p.y - sized.body.y }));
    if (geo.snapPoints({ shape: 'blob', outline }).some((p) => Math.hypot(p.x, p.y) < 1)) return false;
  }
  return true;
})());
check('a ray through a corner of an outline finds the corner',
  [0, 90, 180, 270].every((degrees) => {
    const diamond = [{ x: 100, y: 0 }, { x: 0, y: 100 }, { x: -100, y: 0 }, { x: 0, y: -100 }];
    const at = geo.rimPoint(diamond, { x: 0, y: 0 }, degrees);
    return Math.abs(Math.hypot(at.x, at.y) - 100) < 1e-6;
  }));

// The point of a shape nearest a place is found by how far off it is. Round a
// long shape that is not the point that faces the place: undoing the stretch
// to find the facing one puts it well along from where the eye would.
const longOval = { x: 0, y: 0, rx: 300, ry: 50 };
check('the point of a shape nearest a place on the map is the nearest, which need not be the one facing it',
  geo.closestSnapTo(longOval, longOval, { x: 150, y: 80 }) === 4
  && geo.nearestSnapIndex(longOval, 150, 80) === 5);
check('each of a blob\'s points is the nearest to a place just outside it',
  blobSnaps.every((p) => geo.closestSnapTo(blobAt, blobAt, { x: blobAt.x + p.x * 1.03, y: blobAt.y + p.y * 1.03 }) === p.index));
// Two domains side by side, the second the first again a gap to its right: the
// line between them crosses the gap, and is no longer than any other pair of
// their points would make it.
const beside = { ...blobAt, x: blobAt.x + (blob.bounds.maxX - blob.bounds.minX) + 80 };
const bridge = geo.closestSnapPair(blobAt, blobAt, beside, beside);
const facing = {
  from: blobSnaps[geo.nearestSnapIndex(blobAt, beside.x - blobAt.x, beside.y - blobAt.y)],
  to: blobSnaps[geo.nearestSnapIndex(beside, blobAt.x - beside.x, blobAt.y - beside.y)],
};
const span = (from, to) => Math.hypot(beside.x + to.x - blobAt.x - from.x, beside.y + to.y - blobAt.y - from.y);
check('two blobs side by side are joined across the gap between them, by a pair no further apart than the two that face each other\'s middles',
  span(blobSnaps[bridge.fromPoint], blobSnaps[bridge.toPoint]) <= span(facing.from, facing.to) + 1e-9
  && blobSnaps[bridge.fromPoint].x > 0 && blobSnaps[bridge.toPoint].x < 0,
  `${span(blobSnaps[bridge.fromPoint], blobSnaps[bridge.toPoint])} against ${span(facing.from, facing.to)}`);

// --- a title dragged off its blob ---
const hungChildren = [
  { id: 'a', title: 'Picking', lobeX: -260, lobeY: 60 },
  { id: 'b', title: 'Packing', lobeX: -60, lobeY: 40 },
  { id: 'c', title: 'Carrier booking and tracking', lobeX: 240, lobeY: 80, sizeScale: 1.8 },
  { id: 'd', title: 'Returns', lobeX: -360, lobeY: 230, sizeScale: 1.5 },
  { id: 'e', title: 'Stock control', lobeX: -70, lobeY: 250, sizeScale: 1.8 },
  { id: 'f', title: 'Dispatch', lobeX: 240, lobeY: 290, sizeScale: 1.3 },
];
const hung = (place = {}) => geo.layoutDomain(
  { title: 'Order fulfilment\nand delivery', x: 0, y: 0, fontSize: 64, ...place }, hungChildren);
/**
 * How an outline keeps to the surface: the stretches of it that do not lie on
 * it — both sides of the middle of one inside the blob, or both outside — and
 * how its longest stretch compares with the usual one. An outline that leaps
 * from the far side of a title to the body has one stretch that is neither.
 */
const keeping = (layout) => {
  const run = layout.outline;
  const lengths = run.map((p, i) => Math.hypot(run[(i + 1) % run.length].x - p.x, run[(i + 1) % run.length].y - p.y));
  const astray = run.filter((p, i) => {
    const q = run[(i + 1) % run.length];
    const [nx, ny] = [-(q.y - p.y) / lengths[i], (q.x - p.x) / lengths[i]];
    const [mx, my] = [(p.x + q.x) / 2, (p.y + q.y) / 2];
    return layout.contains(mx + nx * 5, my + ny * 5) === layout.contains(mx - nx * 5, my - ny * 5);
  }).length;
  return { astray, longest: Math.max(...lengths), usual: lengths.reduce((a, b) => a + b, 0) / lengths.length };
};
for (const [titleX, titleY] of [[100, -420], [-500, -300], [700, -100], [-700, 200], [500, 600]]) {
  const kept = keeping(hung({ titleX, titleY }));
  check(`with the title dragged to ${titleX},${titleY} the outline keeps to the surface all the way round, in even steps`,
    kept.astray === 0 && kept.longest < kept.usual * 1.2, JSON.stringify(kept));
}
check('a title whose middle is on the blob trails nothing, and is drawn as it always was',
  hung().titleLobe.trail === null && keeping(hung()).astray === 0);
const offTheEdge = hung({ titleX: 700, titleY: -100 });
check('one dragged off the edge trails back to the blob',
  offTheEdge.titleLobe.trail !== null && offTheEdge.contains(offTheEdge.titleLobe.trail.x, offTheEdge.titleLobe.trail.y));
check('so the whole of the way from the title back to the body is on the blob, as wide as the title',
  Array.from({ length: 21 }, (_, i) => i / 20).every((t) => {
    const { titleLobe, body } = offTheEdge;
    const x = titleLobe.x + (body.x - titleLobe.x) * t;
    const y = titleLobe.y + (body.y - titleLobe.y) * t;
    // Half the title's lobe to either side of the way, across it.
    const along = Math.hypot(body.x - titleLobe.x, body.y - titleLobe.y);
    const [ax, ay] = [-(body.y - titleLobe.y) / along, (body.x - titleLobe.x) / along];
    const reach = 0.5 / Math.hypot(ax / titleLobe.rx, ay / titleLobe.ry);
    return offTheEdge.contains(x, y) && offTheEdge.contains(x + ax * reach, y + ay * reach)
      && offTheEdge.contains(x - ax * reach, y - ay * reach);
  }));
check('and the title\'s own lobe is inside the outline that was drawn',
  rimOf({ ...offTheEdge.titleLobe, rx: offTheEdge.titleLobe.rx * 0.9, ry: offTheEdge.titleLobe.ry * 0.9 })
    .every((p) => geo.insideOutline(offTheEdge.outline, p.x, p.y)));
check('an outline is drawn through more points the longer it runs, and never through fewer than it was',
  hung().outline.length >= 96 && offTheEdge.outline.length > geo.layoutDomain({ title: 'Billing', x: 0, y: 0 }, []).outline.length
  && geo.layoutDomain({ title: 'Billing', x: 0, y: 0 }, []).outline.length === 96);

// --- a lobe resized ---
const plainLobe = geo.lobeSizeFor({ title: 'Invoicing' });
const wideLobe = geo.lobeSizeFor({ title: 'Invoicing', lobeScale: 3 });
const thinLobe = geo.lobeSizeFor({ title: 'Invoicing', lobeScale: 0.25 });
const bareOval = geo.capabilitySize({ title: 'Invoicing' });
check('a lobe is its capability and a ring round it', plainLobe.rx > bareOval.rx && plainLobe.ry > bareOval.ry);
check('a larger lobe scale is a wider ring, the capability the size it was',
  wideLobe.rx - bareOval.rx === 3 * (plainLobe.rx - bareOval.rx)
  && geo.capabilitySize({ title: 'Invoicing', lobeScale: 3 }).rx === bareOval.rx);
check('the ring never goes to nothing: the capability is always inside its lobe',
  thinLobe.rx > bareOval.rx && geo.lobeSizeFor({ title: 'Invoicing', lobeScale: 0 }).rx === plainLobe.rx
  && geo.lobeSizeFor({ title: 'Invoicing', lobeScale: 0.001 }).rx === thinLobe.rx);
check('nor past what a lobe may be',
  geo.lobeSizeFor({ title: 'Invoicing', lobeScale: 500 }).rx === geo.lobeSizeFor({ title: 'Invoicing', lobeScale: geo.MAX_LOBE_SCALE }).rx);
for (const [dx, dy] of [[260, 0], [0, 180], [-170, 120], [140, -150]]) {
  const scale = geo.lobeScaleThrough({ title: 'Invoicing' }, dx, dy);
  const lobe = geo.lobeSizeFor({ title: 'Invoicing', lobeScale: scale });
  check(`dragging the boundary to ${dx},${dy} gives the ring whose edge passes through there`,
    Math.abs(Math.hypot(dx / lobe.rx, dy / lobe.ry) - 1) < 0.02, `scale ${scale}`);
}
check('dragged in past the capability, the ring is as thin as a ring gets',
  geo.lobeScaleThrough({ title: 'Invoicing' }, 20, 10) === geo.MIN_LOBE_SCALE);
check('and dragged out past all reason, as wide',
  geo.lobeScaleThrough({ title: 'Invoicing' }, 9000, 0) === geo.MAX_LOBE_SCALE);
const roomy = geo.layoutDomain(snapDomain, snapChildren.map((one) => ({ ...one, lobeScale: 3 })));
check('a domain whose lobes are widened is a larger blob round the same capabilities',
  roomy.bounds.maxX - roomy.bounds.minX > blob.bounds.maxX - blob.bounds.minX + 100
  && roomy.slots.every((slot, at) => slot.x === blob.slots[at].x && slot.rx === blob.slots[at].rx));

// --- going round what is in the way ---
const square = (cx, cy, half) => [
  { x: cx - half, y: cy - half }, { x: cx + half, y: cy - half },
  { x: cx + half, y: cy + half }, { x: cx - half, y: cy + half },
];
/** Whether the run of straight pieces through these points stays out of an outline. */
const clearOf = (points, outline) => points.slice(0, -1).every((p, i) => {
  const q = points[i + 1];
  return Array.from({ length: 41 }, (_, step) => step / 40)
    .every((t) => !geo.insideOutline(outline, p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t));
});
const here = { x: 0, y: 0 };
const there = { x: 1000, y: 0 };
check('a line with nothing in its way is left straight',
  geo.routeAround(here, there, [square(500, 400, 100)]).length === 0
  && geo.routeAround(here, there, []).length === 0);
const inTheWay = square(500, 20, 100);
const round = geo.routeAround(here, there, [inTheWay], { clearance: 40 });
check('a line with a shape in its way is bent round it', round.length >= 1, JSON.stringify(round));
check('and then runs clear of the shape', clearOf([here, ...round, there], inTheWay), JSON.stringify(round));
check('it goes round the nearer side: the shape sits a little below the line, so the line goes above',
  round.every((bend) => bend.y < -80), JSON.stringify(round));
check('by the clearance asked for, and no more than it takes',
  Math.min(...round.map((bend) => bend.y)) > -80 - 40 - 1, JSON.stringify(round));
const twoInTheWay = [square(300, 10, 80), square(700, -10, 80)];
const threaded = geo.routeAround(here, there, twoInTheWay, { clearance: 30 });
check('two shapes in a row are both gone round',
  threaded.length >= 2 && twoInTheWay.every((outline) => clearOf([here, ...threaded, there], outline)),
  JSON.stringify(threaded));
check('the bends come in the order the line meets them',
  threaded.every((bend, i) => i === 0 || bend.x > threaded[i - 1].x), JSON.stringify(threaded));
check('a shape too large to go round is not gone round: the line is left straight',
  geo.routeAround(here, there, [square(500, 0, 900)]).length === 0);
check('nor does a line ever become a maze: a few bends at most, however crowded the ground',
  geo.routeAround(here, there, Array.from({ length: 12 }, (_, i) => square(80 + i * 75, (i % 2 ? 30 : -30), 30)), { clearance: 10 }).length <= 7);
check('the same line is routed the same way every time',
  JSON.stringify(geo.routeAround(here, there, [inTheWay], { clearance: 40 })) === JSON.stringify(round));
}

// --- role cards: where a person's card hangs, how several stack, and one put somewhere ---
{
const anchor = { x: 100, y: 50, grows: 1 };
const ada = { name: 'Ada Example', role: 'Product lead' };
const ben = { name: 'Ben Sample', role: 'Tech lead' };
const [alone] = geo.badgeStack(anchor, [ada]);
check('a card is centred on where it hangs', Math.abs(alone.x + alone.width / 2 - 100) < 1e-9);
check('and clear of the shape it hangs off', alone.y > anchor.y);
check('the icon is on the left, and the name and the role beside it, inside the card',
  alone.icon.x >= alone.x && alone.icon.x + alone.icon.size < alone.text.x && alone.text.x === alone.roleText.x
  && alone.text.x < alone.x + alone.width && alone.icon.y >= alone.y && alone.icon.y + alone.icon.size <= alone.y + alone.height);
check('the role is under the name, and set smaller',
  alone.role === 'Product lead' && alone.roleText.y > alone.text.y && alone.roleFontSize < alone.fontSize);
check('the icon is as tall as the name, the role and the air between them',
  Math.abs(alone.icon.size - alone.fontSize * geo.BADGE_ICON_SHARE) < 1e-9
  && alone.icon.size > alone.fontSize + alone.roleFontSize);
check('the band of the layer’s colour is down the leading edge, and the icon stands clear of it',
  alone.mark > 0 && alone.icon.x >= alone.x + alone.mark + alone.fontSize * 0.2);
const markNumbers = geo.badgeMarkPath(alone).match(/-?\d+(\.\d+)?/g).map(Number);
check('and is drawn inside the card: from its left side, no wider than itself, top to foot',
  geo.badgeMarkPath(alone).startsWith(`M ${alone.x + alone.mark} `) && geo.badgeMarkPath(alone).endsWith('Z')
  && markNumbers.every((n) => Number.isFinite(n)) && geo.badgeMarkPath(alone).includes(`V ${alone.y + alone.height - alone.radius} `));
check('a band wider than the corner is round runs square along the top and the foot',
  geo.badgeMarkPath({ ...alone, mark: alone.radius * 2 }).includes(` H ${alone.x + alone.radius} `));
check('with one top and one foot: the name starts where the icon does, and the role ends where it ends',
  Math.abs((alone.text.y - alone.fontSize / 2) - alone.icon.y) < 1e-9
  && Math.abs((alone.roleText.y + alone.roleFontSize / 2) - (alone.icon.y + alone.icon.size)) < 1e-9);
check('a name is set larger than a capability’s title and smaller than a domain’s', geo.BADGE_FONT > 32 && geo.BADGE_FONT < 72);

const [first, second] = geo.badgeStack(anchor, [ada, { name: 'Bartholomew Longer-Sample', role: 'Tech lead' }]);
check('a second person’s card is further from the shape, and clear of the first', second.y >= first.y + first.height);
check('the cards of one shape are one width, so the icons stand in a column',
  first.width === second.width && first.icon.x === second.icon.x && first.width > alone.width);

const [unsaid, said] = geo.badgeStack(anchor, [{ name: 'Cy Nobody', role: '' }, ada]);
check('someone with no role has no line for one, and their name is level with the middle of the icon',
  unsaid.roleText === null && Math.abs(unsaid.text.y - (unsaid.icon.y + unsaid.icon.size / 2)) < 1e-9);
check('but their icon and their card are the size of anyone’s', unsaid.icon.size === said.icon.size && unsaid.height === said.height);

const [up] = geo.badgeStack({ ...anchor, grows: -1 }, [ada]);
check('hung over a shape, a card stands wholly above where it hangs', up.y + up.height < anchor.y);
const [long] = geo.badgeStack(anchor, [{ name: 'A name that goes on a good deal longer than any card has the room for', role: 'A role worded at such length that it would be wider than the domain' }]);
check('a long name is cut, and says so', long.label.length === geo.MAX_BADGE_NAME && long.label.endsWith('…'), long.label);
check('and so is a long role', long.role.length === geo.MAX_BADGE_NAME && long.role.endsWith('…'), long.role);

const put = geo.badgeAt({ x: 900, y: -400 }, ada);
check('a card that was put somewhere has its middle where it was put',
  Math.abs(geo.badgeCentre(put).x - 900) < 1e-9 && Math.abs(geo.badgeCentre(put).y + 400) < 1e-9);
check('and is the card it was when the map hung it', put.width === alone.width && put.height === alone.height && put.label === alone.label);
const carried = geo.badgeMovedBy(alone, 30, -70);
check('a card moved takes its icon, its name and its role with it',
  ['icon', 'text', 'roleText'].every((part) => Math.abs((carried[part].x - carried.x) - (alone[part].x - alone.x)) < 1e-9
    && Math.abs((carried[part].y - carried.y) - (alone[part].y - alone.y)) < 1e-9)
  && carried.x === alone.x + 30 && carried.y === alone.y - 70);

const beside = { x: 100 + alone.width / 2, y: 50, grows: 1 };
const [near, far] = geo.badgesClear([
  { grows: 1, badges: geo.badgeStack(anchor, [ada]) },
  { grows: 1, badges: geo.badgeStack(beside, [ben]) },
]);
check('the first shape’s card stays where it hangs', near[0].y === alone.y);
check('a neighbour’s card that would land on it moves further from its own shape, until the two are clear',
  far[0].y >= near[0].y + near[0].height && far[0].x === geo.badgeStack(beside, [ben])[0].x);
const [[lifted]] = geo.badgesClear([{ grows: -1, badges: geo.badgeStack({ ...anchor, grows: -1 }, [ada]) }],
  [{ x: 0, y: -40, width: 200, height: 60 }]);
check('a card hung over a shape is lifted over an area’s name that is in its way', lifted.y + lifted.height < -40);
const [[apartAlready]] = geo.badgesClear([{ grows: 1, badges: geo.badgeStack(anchor, [ada]) }],
  [{ x: 5000, y: 50, width: 200, height: 60 }]);
check('and what is in nobody’s way is left alone', apartAlready.y === alone.y);

const square = { x: 10, y: 20, size: 200 };
const whole = geo.badgeIconBox(square);
check('an icon with no margin is drawn the size of the square kept for it',
  whole.x === 10 && whole.y === 20 && whole.width === 200 && whole.height === 200);
const margined = geo.badgeIconBox(square, { x: 0.25, y: 0.25, width: 0.5, height: 0.5, aspect: 1 });
check('one drawn with a margin is scaled until its ink fills the square, the margin left to hang outside',
  margined.width === 400 && margined.x === -90 && margined.y === -80);
const tall = geo.badgeIconBox(square, { x: 0.25, y: 0, width: 0.5, height: 1, aspect: 1 });
check('a tall drawing fills the height and is centred across', tall.height === 200 && tall.y === 20 && tall.x + tall.width / 2 === 110);

const children = [{ id: 'c1', title: 'One', lobeX: -140, lobeY: 60 }, { id: 'c2', title: 'Two', lobeX: 140, lobeY: 60 }];
const blob = geo.layoutDomain({ id: 'd', title: 'Invoicing' }, children);
const onBlob = geo.badgeAnchorOnBlob(blob, [ada]);
const [overDomain] = geo.badgeStack(onBlob, [ada]);
const meets = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const words = { x: blob.title.x - blob.title.boxWidth, y: blob.title.y - blob.title.boxHeight,
  width: blob.title.boxWidth * 2, height: blob.title.boxHeight * 2 };
check('and clear of the title’s words', !meets(overDomain, words), JSON.stringify([overDomain, words]));
const capabilityBoxes = blob.slots.map((slot) => ({ x: slot.x - slot.rx, y: slot.y - slot.ry, width: slot.rx * 2, height: slot.ry * 2 }));
check('and of its capabilities, where there is room', !capabilityBoxes.some((box) => meets(overDomain, box)));
const [usual] = geo.badgeStack(onBlob, [ada]);
const nameInTheWay = { x: usual.x, y: usual.y, width: usual.width, height: usual.height };
const [elsewhere] = geo.badgeStack(geo.badgeAnchorOnBlob(blob, [ada], geo.BADGE_FONT, [nameInTheWay]), [ada]);
const shared = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
check('an area’s name where the card would go sends it to another side of the title',
  shared(elsewhere, nameInTheWay) < shared(usual, nameInTheWay) * 0.1 && !meets(elsewhere, words), JSON.stringify(elsewhere));
const roomyBlob = geo.layoutDomain({ id: 'd', title: 'Invoicing' }, [{ id: 'c1', title: 'One', lobeX: 0, lobeY: 260 }]);
const [roomy] = geo.badgeStack(geo.badgeAnchorOnBlob(roomyBlob, [ada]), [ada]);
const roomyMiddle = geo.badgeCentre(roomy);
check('where the domain has room by its title, the card lies over the domain', roomyBlob.contains(roomyMiddle.x, roomyMiddle.y),
  JSON.stringify(roomyMiddle));
check('the same domain hangs its cards in the same place every time',
  JSON.stringify(geo.badgeAnchorOnBlob(blob, [ada])) === JSON.stringify(onBlob));

const oval = { x: 500, y: 300, rx: 130, ry: 84 };
const capSize = geo.capabilitySize({ title: 'Invoicing and dunning' });
const underWords = geo.badgeAnchorUnderWords(oval, capSize);
const [overCap] = geo.badgeStack(underWords, [ada], geo.CAPABILITY_BADGE_FONT);
check('a capability’s cards start over its oval, under its title, and grow down',
  underWords.grows === 1 && overCap.y < oval.y + oval.ry && overCap.y >= oval.y + capSize.textY + capSize.height / 2,
  JSON.stringify([overCap.y, capSize.textY, capSize.height]));
const withIcon = geo.capabilitySize({ title: 'Invoicing', icon: 'bill.svg' });
const [overIcon] = geo.badgeStack(geo.badgeAnchorUnderWords(oval, withIcon), [ada], geo.CAPABILITY_BADGE_FONT);
check('and under its icon as well, when it has one',
  overIcon.y >= oval.y + Math.max(withIcon.textY + withIcon.height / 2, withIcon.iconY + withIcon.iconHeight / 2));
check('a card over a capability is set smaller than its title, so it is no wider than the oval',
  geo.CAPABILITY_BADGE_FONT < 32 && overCap.width <= oval.rx * 2, String(overCap.width));

const band = geo.layoutArea({ id: 'a', title: 'Payments' }, [[{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }]]);
const over = geo.badgeAnchorOnBand(band);
check('an area’s cards hang beyond its title: over one that rides the top of the border',
  over.grows === -1 && over.x === band.title.x && over.y === band.gap.minY);
const under = geo.badgeAnchorOnBand(geo.layoutArea({ id: 'a', title: 'Payments', titleAngle: 90 },
  [[{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }]]));
check('and under one that rides the foot of it', under.grows === 1);
}

console.log(failures === 0 ? '\nAll geometry checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
