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
} from '../app/js/rules.js';

const target = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2])).href
  : new URL('../app/js/defaults.js', import.meta.url).href;
const {
  DOMAIN_SHAPE, CAPABILITY_SHAPE, TOUCHPOINT_SHAPE, ACTOR_SHAPE, LAYERS, HOME_LAYER,
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
const capabilityGaps = missing(CAPABILITY_SHAPE, ['title', 'color', 'fontSize', 'fontWeight', 'sizeScale', 'stretch']);
check('every capability default is set', capabilityGaps.length === 0, capabilityGaps.join(', '));

const capabilityError = validateCapability(CAPABILITY_SHAPE);
check('the capability defaults make a valid capability', capabilityError === null, capabilityError ?? '');
check('the capability has a title', String(CAPABILITY_SHAPE.title ?? '').trim().length > 0);
check('the capability color is hex', isHex(CAPABILITY_SHAPE.color), String(CAPABILITY_SHAPE.color));

// --- touchpoints ---
const touchpointGaps = missing(TOUCHPOINT_SHAPE,
  ['title', 'color', 'fontSize', 'fontWeight', 'sizeScale', 'stretch']);
check('every touchpoint default is set', touchpointGaps.length === 0, touchpointGaps.join(', '));

const touchpointError = validateTouchpoint(TOUCHPOINT_SHAPE);
check('the touchpoint defaults make a valid touchpoint',
  touchpointError === null, touchpointError ?? '');
check('the touchpoint has a title', String(TOUCHPOINT_SHAPE.title ?? '').trim().length > 0);
check('the touchpoint color is hex', isHex(TOUCHPOINT_SHAPE.color), String(TOUCHPOINT_SHAPE.color));

// --- actors ---
// An actor is a circle, so it is the one shape with no lean to set.
const actorGaps = missing(ACTOR_SHAPE, ['title', 'color', 'fontSize', 'fontWeight', 'sizeScale']);
check('every actor default is set', actorGaps.length === 0, actorGaps.join(', '));

const actorError = validateActor(ACTOR_SHAPE);
check('the actor defaults make a valid actor', actorError === null, actorError ?? '');
check('the actor has a title', String(ACTOR_SHAPE.title ?? '').trim().length > 0);
check('the actor color is hex', isHex(ACTOR_SHAPE.color), String(ACTOR_SHAPE.color));
check('an actor has no lean to set', ACTOR_SHAPE.stretch === undefined);

// --- the starting stack ---
const layerError = validateLayers(LAYERS);
check('the starting layers make a valid stack', layerError === null, layerError ?? '');
check('there are two of them', LAYERS.length === 2, String(LAYERS.length));
check('and every kind is sent to one of them that exists',
  Object.values(HOME_LAYER).every((key) => LAYERS.some((layer) => layer.key === key)),
  JSON.stringify(HOME_LAYER));

console.log(failures === 0 ? '\nAll defaults checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
