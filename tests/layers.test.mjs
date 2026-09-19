// The layer model, the two new kinds and the Type choices — checked against the
// same code the app reads and writes files with, the way the seed test is.
//   node tests/layers.test.mjs

import { randomUUID } from 'node:crypto';

// document.js makes fresh ids for everything it reads, and store.js does the
// same for everything it creates. Neither wants a browser for anything else.
globalThis.crypto ??= { randomUUID };

const {
  validate, fromDocument, toDocument, stringify, CURRENT_VERSION,
} = await import('../app/js/document.js');
const store_ = await import('../app/js/store.js');
const rules = await import('../app/js/rules.js');

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const keyed = (list, key) => list.find((one) => one.key === key);
const titled = (list, title) => list.find((one) => one.title === title);

// --- a version 1 file still reads --------------------------------------------

// This is exactly what 1.x and 2.0.x wrote: no layers, no kinds but two, and a
// connector whose ends are bare capability keys.
const v1 = {
  version: 1,
  title: 'A version 1 map',
  domains: [
    { key: 'billing', title: 'Billing', shape: { position: '0,0', color: 1 } },
  ],
  capabilities: [
    { key: 'invoicing', domain: 'billing', title: 'Invoicing', shape: { position: '10,10', color: 1 } },
    { key: 'dunning', title: 'Dunning', shape: { position: '400,0', color: 2 } },
  ],
  connectors: [
    { from: 'invoicing', to: 'dunning', fromPoint: 0, toPoint: 12, lineStyle: 'curved' },
  ],
};

check('a version 1 file is still valid', validate(v1) === null, validate(v1) ?? '');

const read = fromDocument(v1);
const base = read.layers[0].key;

check('it gets the starting stack', read.layers.length === 2,
  read.layers.map((one) => one.key).join('+'));
check('whose base layer is the first of them', base === 'core', base);
check('everything in it lands on the base layer',
  [...read.domains, ...read.capabilities].every((one) => one.layer === base));
check('it has no touchpoints', read.touchpoints.length === 0);
check('and no actors', read.actors.length === 0);
check('and no Type choices', rules.ELEMENT_KINDS.every((kind) => read.types[kind].length === 0));

check('its connector ends read as capabilities',
  read.connectors[0].fromKind === 'capability' && read.connectors[0].toKind === 'capability');
check('and point at the records they named',
  read.connectors[0].fromId === titled(read.capabilities, 'Invoicing').id
  && read.connectors[0].toId === titled(read.capabilities, 'Dunning').id);

// --- and comes back out as version 2 -----------------------------------------

const written = toDocument({ ...read, palette: [] });
check(`writing always writes version ${CURRENT_VERSION}`, written.version === CURRENT_VERSION,
  String(written.version));
check('the stack is written down', written.layers.length === 2);
check('the base layer is not named on every element',
  keyed(written.domains, 'billing').layer === undefined);
check('a line between two capabilities still writes no kinds',
  written.connectors[0].fromKind === undefined && written.connectors[0].toKind === undefined);
check('what it wrote is valid', validate(written) === null, validate(written) ?? '');

// --- a version 2 file, with everything in it ---------------------------------

const v2 = {
  version: 2,
  title: 'A version 2 map',
  layers: [
    { key: 'core', title: 'Core Business Domains' },
    { key: 'presentation', title: 'Presentation', dimmed: true },
  ],
  types: {
    capability: ['Engine', 'Process'],
    touchpoint: ['Customer channel'],
  },
  domains: [{ key: 'billing', title: 'Billing', shape: { position: '0,0', color: 1 } }],
  capabilities: [
    {
      key: 'invoicing',
      domain: 'billing',
      title: 'Invoicing',
      type: 'Engine',
      shape: { position: '10,10', color: 1 },
    },
  ],
  touchpoints: [
    {
      key: 'portal',
      layer: 'presentation',
      title: 'Customer portal',
      type: 'Customer channel',
      shape: { position: '0,-500', color: 2 },
    },
  ],
  actors: [
    { key: 'payer', layer: 'presentation', title: 'Payer', shape: { position: '0,-900', color: 3 } },
  ],
  connectors: [
    // The cross-layer line the release is really about.
    { from: 'portal', fromKind: 'touchpoint', to: 'invoicing', fromPoint: 6, toPoint: 18 },
    { from: 'payer', fromKind: 'actor', to: 'portal', toKind: 'touchpoint', fromPoint: 6, toPoint: 18 },
  ],
};

check('a version 2 file is valid', validate(v2) === null, validate(v2) ?? '');

const full = fromDocument(v2);
check('its touchpoint is read', full.touchpoints.length === 1);
check('its actor is read', full.actors.length === 1);
check('both are on the layer they named',
  full.touchpoints[0].layer === 'presentation' && full.actors[0].layer === 'presentation');
check('a dimmed layer opens dimmed', full.layers[1].dimmed === true);
check('the Type choices are read', full.types.capability.join(',') === 'Engine,Process');
check('and a Type on a shape with it', full.capabilities[0].type === 'Engine');

const cross = full.connectors[0];
check('a touchpoint-to-capability line keeps both kinds',
  cross.fromKind === 'touchpoint' && cross.toKind === 'capability',
  `${cross.fromKind}/${cross.toKind}`);
check('and resolves both ends',
  cross.fromId === full.touchpoints[0].id && cross.toId === full.capabilities[0].id);

const roundTrip = stringify(toDocument({ ...full, palette: [] }));
check('a version 2 file survives the round trip unchanged',
  roundTrip === stringify(toDocument({ ...fromDocument(JSON.parse(roundTrip)), palette: [] })));

// --- what a file may not say -------------------------------------------------

const refuses = (label, document_, wanted) => {
  const said = validate(document_);
  check(label, said !== null && said.includes(wanted), said ?? 'it was accepted');
};

refuses('a later version is refused',
  { ...v1, version: CURRENT_VERSION + 1 }, `reads up to ${CURRENT_VERSION}`);
refuses('two layers with one key are refused',
  { ...v2, layers: [{ key: 'core', title: 'A' }, { key: 'core', title: 'B' }] }, 'share the key');
refuses('a hidden base layer is refused',
  { ...v2, layers: [{ key: 'core', title: 'A', hidden: true }, { key: 'up', title: 'B' }] },
  'base layer cannot be hidden');
refuses('an element on a layer that is not there is refused',
  { ...v2, touchpoints: [{ ...v2.touchpoints[0], layer: 'nowhere' }] }, 'not in the file');
refuses('a line ending on a domain is refused',
  { ...v2, connectors: [{ from: 'portal', fromKind: 'domain', to: 'invoicing' }] },
  'cannot be on a domain');
refuses('a line to something that is not there is refused',
  { ...v2, connectors: [{ from: 'portal', fromKind: 'touchpoint', to: 'nothing' }] },
  'not in the file');
refuses('a Type choice listed twice is refused',
  { ...v2, types: { capability: ['Engine', 'Engine'] } }, 'listed twice');
refuses('a Type list for something that is not a kind is refused',
  { ...v2, types: { sausage: ['Engine'] } }, 'not a kind of element');

// --- the store: layers, and what is on them ----------------------------------

store_.setMap(fromDocument(v2));
const { store } = store_;

const portal = store.touchpoints[0];
const invoicing = store.capabilities[0];
const billing = store.domains[0];

check('the base layer is the bottom of the stack', store_.baseLayer().key === 'core');
check('a capability is on its domain\'s layer',
  store_.layerOf('capability', invoicing) === billing.layer);

// A line belongs to the topmost layer it touches, so hiding that layer takes
// the line with it rather than leaving it running to nothing.
check('a cross-layer line belongs to the upper layer',
  store_.connectorLayer(store.connectors[0]) === 'presentation',
  store_.connectorLayer(store.connectors[0]));

check('the presentation layer holds the touchpoint and the actor',
  store_.onLayer('presentation').touchpoints.length === 1
  && store_.onLayer('presentation').actors.length === 1);
check('and both cross-layer lines',
  store_.onLayer('presentation').connectors.length === 2,
  String(store_.onLayer('presentation').connectors.length));
check('the core layer holds the domain and its capability',
  store_.onLayer('core').domains.length === 1 && store_.onLayer('core').capabilities.length === 1);
check('and no lines at all', store_.onLayer('core').connectors.length === 0);

// Hiding for this tab alone: the document is not touched.
store_.setLayerState('presentation', { hidden: true });
check('hiding a layer hides it', store_.isHidden('presentation'));
check('and takes the line on it out of sight',
  !store_.isVisible('connector', store.connectors[0]));
check('but leaves the document saying what it said',
  store_.layerByKey('presentation').hidden !== true);
check('and the map still holds everything it did', store.touchpoints.length === 1);

store_.resetLayerState();
check('resetting puts the map back to what it opens at', !store_.isHidden('presentation'));

// The base layer has nothing under it, so hiding it is not a state it can be in.
store_.setLayerState('core', { hidden: true });
check('the base layer refuses to hide', !store_.isHidden('core'));
store_.setLayerState('core', { dimmed: true });
check('but it does dim', store_.layerState('core').dimmed === true);
store_.resetLayerState();

// An owner in Edit mode writes the document instead.
store_.setLayerState('presentation', { hidden: true }, { saved: true });
check('saving the state writes the document', store_.layerByKey('presentation').hidden === true);
check('and leaves no override behind', !store_.layersOverridden());

// --- the store: the two new kinds --------------------------------------------

const made = store_.createTouchpoint({ title: 'Kiosk', layer: 'presentation', x: 5, y: 5 });
check('a touchpoint can be made', store.touchpoints.length === 2);
check('and goes on top of the stack it joins', made.sortIndex > portal.sortIndex);

const joined = store_.createConnector({
  fromId: made.id, fromKind: 'touchpoint', toId: invoicing.id, toKind: 'capability',
});
check('a line can join a touchpoint to a capability', !!joined);

const threw = (work) => {
  try {
    work();
    return null;
  } catch (error) {
    return error.message;
  }
};

check('a line cannot end on a domain',
  (threw(() => store_.createConnector({
    fromId: made.id, fromKind: 'touchpoint', toId: billing.id, toKind: 'domain',
  })) ?? '').includes('cannot end on a domain'));

check('a line cannot join something to itself',
  (threw(() => store_.createConnector({
    fromId: made.id, fromKind: 'touchpoint', toId: made.id, toKind: 'touchpoint',
  })) ?? '').includes('two different elements'));

// Deleting an element takes the lines hanging off it, whatever kind it is.
const removed = store_.deleteTouchpoint(made.id);
check('deleting a touchpoint takes it', store.touchpoints.length === 1);
check('and the line that hung off it', !store.connectors.some((one) => one.id === joined.id));
check('and hands back what it took, so undo can put it all back',
  removed.touchpoints.length === 1 && removed.connectors.length === 1);

store_.restore(removed);
check('putting it back puts it back', store.touchpoints.length === 2
  && store.connectors.some((one) => one.id === joined.id));
store_.deleteTouchpoint(made.id);

// --- the store: Type choices -------------------------------------------------

check('a kind offers the choices the file gave it',
  store_.typesFor('capability').join(',') === 'Engine,Process');
check('and a kind the file left out offers none', store_.typesFor('actor').length === 0);

store_.addTypeChoice('capability', 'System of record');
check('a choice can be added', store_.typesFor('capability').includes('System of record'));
store_.addTypeChoice('capability', 'System of record');
check('and adding it twice does not list it twice',
  store_.typesFor('capability').filter((one) => one === 'System of record').length === 1);

check('a choice nothing uses can be removed',
  store_.removeTypeChoice('capability', 'System of record').removed === true);

// The one thing the release promises about Types: nothing is cleared behind
// the author's back.
check('a choice in use is counted', store_.typeUsage('capability', 'Engine') === 1);
const refused = store_.removeTypeChoice('capability', 'Engine');
check('and refused', refused.removed === false && refused.used === 1);
check('so the shape keeps its Type', invoicing.type === 'Engine');
check('and the list keeps the choice', store_.typesFor('capability').includes('Engine'));

console.log(failures === 0 ? '\nAll layer checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
