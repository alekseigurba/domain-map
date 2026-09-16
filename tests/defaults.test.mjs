// The shape defaults are edited by hand, and a value the rules refuse fails
// late: nothing complains when a shape is added, only when the map it was saved
// into is opened again. So check them against the rules the importer uses.
//   node tests/defaults.test.mjs

import { DOMAIN_SHAPE, CAPABILITY_SHAPE } from '../app/js/defaults.js';
import { validateDomain, validateCapability } from '../app/js/rules.js';

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

console.log(failures === 0 ? '\nAll defaults checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
