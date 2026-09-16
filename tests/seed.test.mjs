// The map is a JSON file, and nothing but the app reads it, so these are the
// app's own checks run against the file itself: the importer's validation, the
// round trip that every save makes, and the things only this example has to get
// right.
//   node tests/seed.test.mjs

import { readFile } from 'node:fs/promises';

const { validate, fromDocument, toDocument, stringify } =
  await import('../app/js/document.js');

const path = new URL('../seed/data/versions/pay-credit-domain.json', import.meta.url);
const text = await readFile(path, 'utf8');
const seed = JSON.parse(text);

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

/** geometry.js CAPABILITY_GAP — clear air between two capabilities in a domain. */
const CAPABILITY_GAP = 50;

const at = (text_) => {
  const [x, y] = String(text_ ?? '0,0').split(',');
  return { x: Number(x), y: Number(y) };
};
const shapeOf = (node) => node.shape ?? {};

// --- what the app itself would refuse ---
// Keys, references, positions and every range live in document.js and rules.js
// now, so the file is checked with the same code the app opens it with.
const error = validate(seed);
check('the app would open this file', error === null, error ?? '');

check('the map has a title', typeof seed.title === 'string' && seed.title.length > 0);
check('it has domains, capabilities and connectors',
  Array.isArray(seed.domains) && Array.isArray(seed.capabilities) && Array.isArray(seed.connectors));

// --- what the file should look like, beyond being readable ---
const keys = [...seed.domains.map((d) => d.key), ...seed.capabilities.map((c) => c.key)];
const notASlug = keys.find((key) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(key));
check('keys are slugs', !notASlug, notASlug);

const shapeless = [...seed.domains, ...seed.capabilities].find((n) => !n.shape);
check('every shape has a shape object', !shapeless, shapeless?.key);

const strayCoordinate = [...seed.domains, ...seed.capabilities].find((n) =>
  ['x', 'y', 'lobeX', 'lobeY', 'titleX', 'titleY', 'colorIndex', 'fontSize', 'sizeScale', 'sortIndex']
    .some((old) => old in n));
check('no shape keeps the old loose fields', !strayCoordinate,
  strayCoordinate && Object.keys(strayCoordinate).join(', '));

// --- the round trip every save makes ---
// Opening the file and saving it again must hand back the same document, or
// the first edit of a session would rewrite parts nobody touched.
const rewritten = stringify(toDocument(fromDocument(seed)));
check('reading and writing the file leaves it unchanged', rewritten === text.trimEnd(),
  rewritten === text.trimEnd() ? '' : 'the file and a fresh save of it differ');

// --- the example's own shape ---
// Lobes are free positions now, not numbered seats, so there is no core in the
// middle for the rest to be wired to. What still has to hold is that no two
// capabilities land on the same spot, and that the example wires its domains
// to each other — that is the story the map is there to tell.
const spotOf = (c) => shapeOf(c).position ?? '0,0';

for (const domain of seed.domains) {
  const inside = seed.capabilities.filter((c) => c.domain === domain.key);
  check(`${domain.key}: holds capabilities`, inside.length > 0);
  if (inside.length === 0) continue;

  const spots = inside.map(spotOf);
  check(`${domain.key}: no two lobes share a spot`, new Set(spots).size === spots.length,
    spots.find((spot, i) => spots.indexOf(spot) !== i));

  // Centres only: the clear air between two lobes depends on how wide their
  // text measures, which this file cannot know. This catches lobes stacked on
  // top of each other, which is what going through the seed by hand costs.
  let closest = Infinity;
  let pair = '';
  for (let i = 0; i < inside.length; i++) {
    for (let j = i + 1; j < inside.length; j++) {
      const a = at(shapeOf(inside[i]).position);
      const b = at(shapeOf(inside[j]).position);
      const gap = Math.hypot(a.x - b.x, a.y - b.y);
      if (gap < closest) {
        closest = gap;
        pair = `${inside[i].key} / ${inside[j].key}`;
      }
    }
  }
  check(`${domain.key}: lobes keep their distance`,
    inside.length < 2 || closest >= CAPABILITY_GAP, `${Math.round(closest)} apart — ${pair}`);

  const positions = inside.map((c) => shapeOf(c).order ?? 0);
  check(`${domain.key}: no two capabilities share a position`,
    new Set(positions).size === positions.length);
}

// --- the wiring between domains ---
const domainOf = new Map(seed.capabilities.map((c) => [c.key, c.domain ?? null]));
const crossing = seed.connectors.filter((k) => domainOf.get(k.from) !== domainOf.get(k.to));
check('the example wires domains to each other', crossing.length > 0,
  `${crossing.length} of ${seed.connectors.length} connectors cross a boundary`);

const pairs = seed.connectors.map((k) => [k.from, k.to].sort().join(' – '));
const repeated = pairs.find((p, i) => pairs.indexOf(p) !== i);
check('no two connectors join the same pair', !repeated, repeated);

console.log(failures === 0 ? '\nAll seed checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
