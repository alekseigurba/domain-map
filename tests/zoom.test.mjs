// Headless check for the decisions behind the levels of detail and the deep
// zoom: where each end of a line is drawn at a level, which lines fold into
// one, which of those the domain level keeps, and when a capability opens onto
// its features. Nothing to stub: zoom.js touches no DOM.
//   node tests/zoom.test.mjs

import * as zoom from '../app/js/zoom.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};
const show = (value) => JSON.stringify(value);

// --- the levels ---
check('there are three levels, coarsest first: the kinds of the terrain',
  zoom.LEVELS.join(',') === 'domain,capability,feature');
check('a map opens with every line where it really ends', zoom.DEFAULT_LEVEL === 'feature');

// Three domains. Checkout holds three capabilities, and one of them, Pay, two
// features; Risk holds two, and Score one feature; Ledger holds one. One
// capability is loose, and a touchpoint reaches into Checkout.
const HOLDERS = {
  'capability:cart': 'domain:checkout', 'capability:pay': 'domain:checkout', 'capability:order': 'domain:checkout',
  'capability:score': 'domain:risk', 'capability:fraud': 'domain:risk',
  'capability:book': 'domain:ledger',
  'feature:card': 'capability:pay', 'feature:wallet': 'capability:pay',
  'feature:bureau': 'capability:score',
};
const holderOf = (kind, id) => {
  const held = HOLDERS[`${kind}:${id}`];
  return held ? { kind: held.split(':')[0], id: held.split(':')[1] } : null;
};
const line = (id, from, to) => {
  const [fromKind, fromId] = from.split(':');
  const [toKind, toId] = to.split(':');
  return { id, fromKind, fromId, toKind, toId };
};
const connectors = [
  line('a', 'capability:cart', 'capability:score'),
  line('b', 'capability:fraud', 'capability:pay'),     // drawn the other way round: the same pair of domains
  line('c', 'capability:order', 'capability:book'),
  line('d', 'capability:score', 'capability:book'),
  line('e', 'capability:cart', 'capability:pay'),      // inside Checkout
  line('f', 'capability:loose', 'capability:cart'),    // a loose capability to one in a domain
  line('g', 'touchpoint:web', 'capability:cart'),      // on the presentation layer
  line('h', 'feature:card', 'feature:bureau'),         // feature to feature, across two domains
  line('i', 'feature:wallet', 'feature:card'),         // inside Pay
  line('j', 'feature:wallet', 'capability:book'),      // feature to capability
  line('k', 'domain:risk', 'domain:ledger'),           // drawn between the two domains themselves
  line('l', 'domain:ledger', 'capability:fraud'),      // a domain to a capability
];
const ids = (lines) => lines.map((one) => one.id).sort().join(',');
const keys = (lines) => lines.map((one) => one.key).sort();
const open = (...capabilities) => (kind, id) => kind !== 'feature' || capabilities.includes(HOLDERS[`feature:${id}`]?.split(':')[1]);
const at = (level, options = {}) => zoom.foldLines(connectors, { level, holderOf, drawn: open('pay', 'score'), keep: 9, ...options });
const foldOf = (result, key) => result.all.find((one) => one.key === key);

// --- the feature level ---
const finest = at('feature');
check('at the feature level, with every capability open, every line is drawn where it really ends',
  ids(finest.drawn) === 'a,b,c,d,e,f,g,h,i,j,k,l' && finest.folded.length === 0, show(keys(finest.folded)));

const shut = at('feature', { drawn: open('score') });
check('a feature whose capability is shut is not there to end a line on: its line leaves from the capability',
  keys(shut.folded).includes('capability:pay|feature:bureau') && !shut.drawn.some((one) => one.id === 'h'),
  show(keys(shut.folded)));
check('and a line between two features of that capability is inside it, and not drawn',
  !shut.drawn.some((one) => one.id === 'i') && !shut.all.some((one) => one.parts.some((part) => part.id === 'i')));
check('nothing else moves: the lines that end on capabilities and domains are as they were',
  ids(shut.drawn) === 'a,b,c,d,e,f,g,k,l', ids(shut.drawn));
check('a line from a shut capability\'s feature to another capability is drawn between the two capabilities',
  foldOf(shut, 'capability:book|capability:pay')?.parts.map((part) => part.id).join() === 'j');

// --- the capability level ---
const middle = at('capability');
check('at the capability level a line that ends on a feature leaves from the capability that holds it, open or not',
  keys(middle.all).join() === 'capability:book|capability:pay,capability:pay|capability:score', show(keys(middle.all)));
check('lines that end on capabilities and domains are drawn as they are',
  ids(middle.drawn) === 'a,b,c,d,e,f,g,k,l', ids(middle.drawn));
check('a line between two features of one capability is inside it', !middle.drawn.some((one) => one.id === 'i'));
check('a fold that stands for one line still names it',
  foldOf(middle, 'capability:pay|capability:score').parts[0].id === 'h' && foldOf(middle, 'capability:pay|capability:score').weight === 1);

const pickedFeature = at('capability', { selection: { type: 'feature', id: 'card' } });
check('a feature picked is left where it is: its lines leave from the feature itself',
  keys(pickedFeature.folded).includes('capability:score|feature:card'), show(keys(pickedFeature.folded)));
check('and a line from it to another feature of the same capability is drawn as it is',
  pickedFeature.drawn.some((one) => one.id === 'i'));

// --- the domain level ---
const overview = at('domain');
check('at the domain level the lines between two domains are one line for the pair',
  foldOf(overview, 'domain:checkout|domain:risk')?.weight === 3, show(keys(overview.all)));
check('whichever way round each was drawn, and whatever it really ends on',
  ids(foldOf(overview, 'domain:checkout|domain:risk').parts) === 'a,b,h');
check('a folded line keeps the real lines inside it',
  overview.all.every((one) => one.parts.length === one.weight));
check('a line that stays inside one domain is inside it, and not drawn at this level',
  !overview.drawn.some((one) => ['e', 'i'].includes(one.id))
  && !overview.all.some((one) => one.parts.some((part) => ['e', 'i'].includes(part.id))));
check('a line on the presentation layer is drawn as it is at every level',
  overview.drawn.some((one) => one.id === 'g') && middle.drawn.some((one) => one.id === 'g'));
check('a loose capability has no domain to be lifted to, and keeps its own end',
  keys(overview.all).includes('capability:loose|domain:checkout'), show(keys(overview.all)));
check('a line drawn between two domains is drawn as the line it is',
  overview.drawn.some((one) => one.id === 'k'));
check('and no fold is drawn beside it for the same pair: the pair is already shown as joined',
  keys(overview.all).includes('domain:ledger|domain:risk')
  && !keys(overview.folded).includes('domain:ledger|domain:risk'), show(keys(overview.folded)));
check('no line is drawn twice: each is drawn, inside a fold, or inside one place',
  overview.drawn.length + overview.all.reduce((sum, one) => sum + one.parts.length, 0) === connectors.length - 2,
  `${overview.drawn.length} drawn, ${overview.all.reduce((sum, one) => sum + one.parts.length, 0)} folded`);

// --- what the overview keeps ---

const fold = (key, from, to, weight) => ({
  key, from: { kind: 'domain', id: from }, to: { kind: 'domain', id: to }, weight, parts: [],
});
// A hub joined to five others, one of them twice as heavily, and two of the
// others joined to each other.
const web = [
  fold('hub|a', 'hub', 'a', 1), fold('hub|b', 'hub', 'b', 4), fold('hub|c', 'hub', 'c', 1),
  fold('hub|d', 'hub', 'd', 2), fold('hub|e', 'hub', 'e', 1), fold('a|b', 'a', 'b', 1),
];
const lengths = { 'hub|a': 300, 'hub|c': 100, 'hub|e': 200 };
const lengthOf = (one) => lengths[one.key] ?? 500;
const kept = zoom.strongest(web, { keep: 2, lengthOf });
check('a domain keeps its heaviest lines',
  keys(kept).includes('hub|b') && keys(kept).includes('hub|d'), show(keys(kept)));
check('a line is drawn when either end counts it among its strongest, so no domain with a line is left bare',
  ['a', 'b', 'c', 'd', 'e'].every((id) => kept.some((one) => one.from.id === id || one.to.id === id)),
  show(keys(kept)));
// Five domains each joined to every other, no two lines as heavy.
const clique = [1, 2, 3, 4, 5].flatMap((a) => [1, 2, 3, 4, 5].filter((b) => b > a)
  .map((b) => fold(`${a}|${b}`, String(a), String(b), a * 10 + b)));
const thinned = zoom.strongest(clique, { keep: 2 });
check('where every domain talks to every other, the overview is the thinner for it',
  thinned.length < clique.length && thinned.length >= 4, `${thinned.length} of ${clique.length}`);
const tie = zoom.strongest(
  [fold('x|far', 'x', 'far', 1), fold('x|near', 'x', 'near', 1), fold('x|mid', 'x', 'mid', 1),
    fold('far|z', 'far', 'z', 3), fold('mid|z', 'mid', 'z', 3), fold('near|z', 'near', 'z', 3)],
  { keep: 1, lengthOf: (one) => ({ 'x|far': 900, 'x|near': 100, 'x|mid': 500 }[one.key] ?? 50) });
check('between two as heavy a domain keeps the shorter: the line to its neighbour',
  keys(tie).includes('x|near') && !keys(tie).includes('x|far') && !keys(tie).includes('x|mid'),
  show(keys(tie)));
check('the choice is the same whatever order the lines come in',
  show(keys(zoom.strongest([...web].reverse(), { keep: 2, lengthOf }))) === show(keys(kept)));

// Without the line drawn between Risk and Ledger themselves, so that all three pairs are folds.
const atRest = zoom.foldLines(connectors.filter((one) => one.id !== 'k'),
  { level: 'domain', holderOf, drawn: open('pay', 'score'), keep: 1 });
const between = (lines) => lines.filter((one) => one.from.kind === 'domain' && one.to.kind === 'domain');
check('at rest the domain level draws each domain\'s strongest and holds the rest back',
  between(atRest.all).length === 3 && between(atRest.folded).length === 2, show(keys(atRest.folded)));
check('but never a line to a loose capability, which is no part of the thinning',
  keys(atRest.folded).includes('capability:loose|domain:checkout'));
check('nor at any other level: further in, a fold is a line that could not reach its own end',
  at('capability', { keep: 0 }).folded.length === at('capability').all.length);

// --- picking asks for the rest ---

const picked = at('domain', { keep: 1, selection: { type: 'domain', id: 'checkout' } });
check('a domain picked shows every line it has',
  show(keys(between(picked.folded))) === show(['domain:checkout|domain:ledger', 'domain:checkout|domain:risk']),
  show(keys(picked.folded)));

const capability = at('domain', { selection: { type: 'capability', id: 'cart' } });
check('a capability picked is not lifted: its line leaves from the capability itself',
  keys(capability.folded).includes('capability:cart|domain:risk'), show(keys(capability.folded)));
check('the line it has inside its own domain is drawn as it is, not to the domain that holds it',
  capability.drawn.some((one) => one.id === 'e'), ids(capability.drawn));
check('and the folded lines between other domains stand down while it is',
  between(capability.folded).length === 0, show(keys(capability.folded)));
check('the rest of its domain\'s lines still fold onto the domain, drawn or not',
  foldOf(capability, 'domain:checkout|domain:risk')?.weight === 2);

const oneLine = at('domain', { keep: 0, selection: { type: 'connector', id: 'c' } });
check('a line picked shows the fold it is in, marked as picked',
  between(oneLine.folded).length === 1 && between(oneLine.folded)[0].picked === true
  && between(oneLine.folded)[0].parts.some((part) => part.id === 'c'), show(keys(oneLine.folded)));

const elsewhere = at('domain', { selection: { type: 'area', id: 'team' } });
check('picking something that has no lines leaves the level as it was',
  show(keys(elsewhere.folded)) === show(keys(overview.folded)));

// --- widths ---
check('a folded line is never a hairline', zoom.foldedWidth(1) >= 2);
check('it is heavier with what it carries',
  zoom.foldedWidth(2) > zoom.foldedWidth(1) && zoom.foldedWidth(8) > zoom.foldedWidth(2));
check('and never so wide that it reads as a shape', zoom.foldedWidth(1000) <= 7);

// --- opening onto features ---
check('a capability opens once its features\' names are large enough to read',
  zoom.opensAt(8, 1.25) && !zoom.opensAt(8, 1.2));
check('one that holds nothing never opens', !zoom.opensAt(0, 100));
check('reading comfortably is open with room to spare',
  zoom.opensAt(8, zoom.zoomToRead(8)) && zoom.opensAt(8, zoom.zoomToRead(8) / 1.3));

// Where a glide into a capability stops.
check('a capability that holds nothing is taken in as one thing, and no closer',
  zoom.zoomInto(0, { taken: 1.2, whole: 3 }) === 1.2);
check('one whose features already read from there is left there',
  zoom.zoomInto(20, { taken: 1.2, whole: 3 }) === 1.2);
check('one whose features are set small is brought as close as reading them takes',
  zoom.zoomInto(8, { taken: 1.2, whole: 3 }) === zoom.zoomToRead(8));
check('but not so close that its oval runs off the stage',
  zoom.zoomInto(5, { taken: 1.2, whole: 2.5 }) === 2.5 && zoom.opensAt(5, 2.5));
check('unless the whole oval is too small to open, which a glide has to get past',
  zoom.zoomInto(3, { taken: 1.2, whole: 2.5 }) === zoom.zoomToOpen(3)
  && zoom.opensAt(3, zoom.zoomInto(3, { taken: 1.2, whole: 2.5 })));
check('a nudge of the wheel back out does not shut what a glide opened',
  zoom.opensAt(3, zoom.zoomToOpen(3) / 1.05));

const map = { min: 0.05, max: 4 };
check('a map with no features zooms as far as it always did',
  show(zoom.limitsFor([], map)) === show(map) && show(zoom.limitsFor([0, 0], map)) === show(map));
check('and so does one whose features all read within that', show(zoom.limitsFor([9, 12], map)) === show(map));
check('one whose smallest features need more is given it',
  zoom.limitsFor([9, 2], map).max > 4 && zoom.opensAt(2, zoom.limitsFor([9, 2], map).max),
  show(zoom.limitsFor([9, 2], map)));
check('though never past the deepest any map may go',
  zoom.limitsFor([0.01], map).max === zoom.DEEPEST);
check('how far out it zooms is not the features\' business', zoom.limitsFor([2], map).min === map.min);

console.log(failures === 0 ? '\nAll zoom checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
