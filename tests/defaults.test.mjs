// The shape defaults are edited by hand, and a value the rules refuse fails
// late: nothing complains when a shape is added, only when the map it was saved
// into is opened again. So check them against the rules the importer uses.
//   node tests/defaults.test.mjs
//
// A consumer whose brand directory carries its own copy of defaults.js can
// check it with the same rules by naming it, which is what keeps an overlay
// honest across an upgrade:
//   node node_modules/domain-map/tests/defaults.test.mjs brand/js/defaults.js

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  validateDomain, validateCapability, validateTouchpoint, validateActor, validateLayers,
  LAYERS, LAYER_OF,
} from '../app/js/rules.js';

const target = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2])).href
  : new URL('../app/js/defaults.js', import.meta.url).href;
const {
  DOMAIN_SHAPE, CAPABILITY_SHAPE, TOUCHPOINT_SHAPE, ACTOR_SHAPE,
} = await import(target);

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

/** A default colour is written as hex, and matched to a swatch when it is used. */
const isHex = (value) => typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

/** A field left out would not fall back on anything: these are the fallbacks. */
const missing = (shape, keys) => keys.filter((key) => shape[key] === undefined || shape[key] === null);

// --- domains ---
const domainGaps = missing(DOMAIN_SHAPE, ['title', 'color', 'opacity', 'fontSize', 'fontWeight', 'titleScale']);
check('every domain default is set', domainGaps.length === 0, domainGaps.join(', '));

const domainError = validateDomain(DOMAIN_SHAPE);
check('the domain defaults make a valid domain', domainError === null, domainError ?? '');
check('the domain has a title', String(DOMAIN_SHAPE.title ?? '').trim().length > 0);
check('the domain color is hex', isHex(DOMAIN_SHAPE.color), String(DOMAIN_SHAPE.color));
check('the domain opacity is a step of the slider', DOMAIN_SHAPE.opacity % 10 === 0, String(DOMAIN_SHAPE.opacity));

// --- capabilities ---
const capabilityGaps = missing(CAPABILITY_SHAPE,
  ['title', 'color', 'fontSize', 'fontWeight', 'sizeScale', 'stretch', 'opacity']);
check('every capability default is set', capabilityGaps.length === 0, capabilityGaps.join(', '));

const capabilityError = validateCapability(CAPABILITY_SHAPE);
check('the capability defaults make a valid capability', capabilityError === null, capabilityError ?? '');
check('the capability has a title', String(CAPABILITY_SHAPE.title ?? '').trim().length > 0);
check('the capability color is hex', isHex(CAPABILITY_SHAPE.color), String(CAPABILITY_SHAPE.color));

// --- touchpoints ---
const touchpointGaps = missing(TOUCHPOINT_SHAPE,
  ['title', 'color', 'fontSize', 'fontWeight', 'sizeScale', 'stretch', 'opacity']);
check('every touchpoint default is set', touchpointGaps.length === 0, touchpointGaps.join(', '));

const touchpointError = validateTouchpoint(TOUCHPOINT_SHAPE);
check('the touchpoint defaults make a valid touchpoint',
  touchpointError === null, touchpointError ?? '');
check('the touchpoint has a title', String(TOUCHPOINT_SHAPE.title ?? '').trim().length > 0);
check('the touchpoint color is hex', isHex(TOUCHPOINT_SHAPE.color), String(TOUCHPOINT_SHAPE.color));

// --- actors ---
// An actor is a circle, so it is the one shape with no lean to set.
const actorGaps = missing(ACTOR_SHAPE,
  ['title', 'color', 'fontSize', 'fontWeight', 'sizeScale', 'opacity']);
check('every actor default is set', actorGaps.length === 0, actorGaps.join(', '));

const actorError = validateActor(ACTOR_SHAPE);
check('the actor defaults make a valid actor', actorError === null, actorError ?? '');
check('the actor has a title', String(ACTOR_SHAPE.title ?? '').trim().length > 0);
check('the actor color is hex', isHex(ACTOR_SHAPE.color), String(ACTOR_SHAPE.color));
check('an actor has no lean to set', ACTOR_SHAPE.stretch === undefined);
check('and starts half see-through, so the terrain under it reads',
  ACTOR_SHAPE.opacity === 50, String(ACTOR_SHAPE.opacity));
// A person standing outside the business should not arrive the size of a part
// of it, so an actor starts two steps up the scale everything else starts at.
check('an actor starts larger than a capability',
  ACTOR_SHAPE.sizeScale > CAPABILITY_SHAPE.sizeScale, String(ACTOR_SHAPE.sizeScale));
check('a capability and a touchpoint start solid',
  CAPABILITY_SHAPE.opacity === 100 && TOUCHPOINT_SHAPE.opacity === 100);
check('every opacity is a step of the slider',
  [DOMAIN_SHAPE, CAPABILITY_SHAPE, TOUCHPOINT_SHAPE, ACTOR_SHAPE]
    .every((shape) => shape.opacity % 10 === 0));

// --- the stack ---
// The layers are the model's, not a brand's: they live in rules.js, so a
// consumer's own defaults.js cannot redefine what the two layers mean.
const layerError = validateLayers(LAYERS.map((layer) => ({ key: layer.key })));
check('the layers make a valid stack', layerError === null, layerError ?? '');
check('there are two of them', LAYERS.length === 2, String(LAYERS.length));
check('every one of them is named', LAYERS.every((layer) => layer.title?.length > 0));
check('and every kind of element is on one that exists',
  Object.values(LAYER_OF).every((key) => LAYERS.some((layer) => layer.key === key)),
  JSON.stringify(LAYER_OF));
check('the shape defaults carry no layer of their own',
  [DOMAIN_SHAPE, CAPABILITY_SHAPE, TOUCHPOINT_SHAPE, ACTOR_SHAPE]
    .every((shape) => shape.layer === undefined));

console.log(failures === 0 ? '\nAll defaults checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
