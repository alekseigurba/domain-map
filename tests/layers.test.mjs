// The fixed layer model: which layer each kind is on, which lines the model
// draws, how they are filed, and the Type choices. Checked against the same
// code the app reads and writes files with, the way the seed test is.
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

// --- the model ---------------------------------------------------------------

check('there are two layers, bottom first',
  rules.LAYERS.map((one) => one.key).join(',') === 'core,presentation');
check('the base layer is the bottom one', rules.BASE_LAYER === 'core');
check('a domain and a capability are on the base layer',
  rules.LAYER_OF.domain === 'core' && rules.LAYER_OF.capability === 'core');
check('a touchpoint and an actor are on the presentation layer',
  rules.LAYER_OF.touchpoint === 'presentation' && rules.LAYER_OF.actor === 'presentation');
check('each layer takes only its own kinds',
  rules.KINDS_ON.core.join(',') === 'domain,capability'
  && rules.KINDS_ON.presentation.join(',') === 'touchpoint,actor');

// Strictly down the stack: a person reaches the business through a channel.
check('an actor connects to a touchpoint', rules.connectorRule('actor', 'touchpoint') === null);
check('a touchpoint connects to a capability',
  rules.connectorRule('touchpoint', 'capability') === null);
check('two capabilities connect', rules.connectorRule('capability', 'capability') === null);
check('and the same pairs the other way round, since a line has no direction',
  rules.connectorRule('touchpoint', 'actor') === null
  && rules.connectorRule('capability', 'touchpoint') === null);

check('an actor does not reach a capability directly',
  (rules.connectorRule('actor', 'capability') ?? '').includes('not to a capability'));
check('two actors do not connect', rules.connectorRule('actor', 'actor') !== null);
check('two touchpoints do not connect', rules.connectorRule('touchpoint', 'touchpoint') !== null);
check('nothing connects to a domain',
  (rules.connectorRule('capability', 'domain') ?? '').includes('cannot end on a domain'));

// A line is filed under its upper end, whichever way round it was drawn.
const ordered = rules.orderEnds({ kind: 'capability', id: 'c' }, { kind: 'touchpoint', id: 't' });
check('the upper end owns the line', ordered.upper.kind === 'touchpoint', ordered.upper.kind);

// --- a version 1 file still reads --------------------------------------------

const v1 = {
  version: 1,
  title: 'A version 1 map',
  domains: [{ key: 'billing', title: 'Billing', shape: { position: '0,0', color: 1 } }],
  capabilities: [
    { key: 'invoicing', domain: 'billing', title: 'Invoicing', shape: { position: '10,10', color: 1 } },
    { key: 'dunning', title: 'Dunning', shape: { position: '400,0', color: 2 } },
  ],
  connectors: [{ from: 'invoicing', to: 'dunning', fromPoint: 0, toPoint: 12 }],
};

check('a version 1 file is still valid', validate(v1) === null, validate(v1) ?? '');

const read = fromDocument(v1);
check('it gets the model’s own stack', read.layers.length === 2);
check('no element carries a layer of its own',
  [...read.domains, ...read.capabilities].every((one) => one.layer === undefined));
check('its connector ends read as capabilities',
  read.connectors[0].fromKind === 'capability' && read.connectors[0].toKind === 'capability');

// --- the interim shape reads quietly -----------------------------------------

// What 2.1.0 wrote before the model was fixed: per-element layers, layer
// titles, and every line flat with typed ends. None of it is refused.
const interim = {
  version: 2,
  title: 'An interim map',
  layers: [
    { key: 'core', title: 'Core Business Domains' },
    { key: 'presentation', title: 'Presentation', hidden: true },
  ],
  domains: [{ key: 'billing', layer: 'core', title: 'Billing', shape: { position: '0,0' } }],
  capabilities: [
    { key: 'invoicing', layer: 'core', domain: 'billing', title: 'Invoicing', shape: { position: '10,10' } },
  ],
  touchpoints: [
    { key: 'portal', layer: 'presentation', title: 'Portal', shape: { position: '0,-500' } },
  ],
  actors: [{ key: 'payer', layer: 'presentation', title: 'Payer', shape: { position: '0,-900' } }],
  connectors: [
    { from: 'portal', fromKind: 'touchpoint', to: 'invoicing', fromPoint: 6, toPoint: 18 },
    { from: 'payer', fromKind: 'actor', to: 'portal', toKind: 'touchpoint' },
  ],
};

check('the interim shape is still valid', validate(interim) === null, validate(interim) ?? '');

const lifted = fromDocument(interim);
check('its per-element layers are read without them',
  [...lifted.domains, ...lifted.touchpoints].every((one) => one.layer === undefined));
check('a hidden layer it saved still opens hidden',
  lifted.layers.find((one) => one.key === 'presentation').hidden === true);
check('and its flat lines are taken up', lifted.connectors.length === 2);

const liftedOut = toDocument({ ...lifted, palette: [] });
check('writing it puts the lines under their owners',
  keyed(liftedOut.actors, 'payer').interactions.length === 1
  && keyed(liftedOut.touchpoints, 'portal').connectors.length === 1,
  JSON.stringify(liftedOut.actors));
check('and leaves nothing flat', liftedOut.connectors.length === 0);
check('no layer is written with a title',
  liftedOut.layers.every((one) => one.title === undefined));
check('what it wrote is valid', validate(liftedOut) === null, validate(liftedOut) ?? '');

// --- the new shape -----------------------------------------------------------

const v2 = {
  version: 2,
  title: 'A version 2 map',
  layers: [{ key: 'core' }, { key: 'presentation', dimmed: true }],
  types: { capability: ['Engine', 'Process'], touchpoint: ['Customer channel'] },
  domains: [{ key: 'billing', title: 'Billing', shape: { position: '0,0', color: 1 } }],
  capabilities: [
    {
      key: 'invoicing',
      domain: 'billing',
      title: 'Invoicing',
      type: 'Engine',
      shape: { position: '10,10', color: 1, opacity: 100 },
    },
  ],
  touchpoints: [
    {
      key: 'portal',
      title: 'Customer portal',
      type: 'Customer channel',
      shape: { position: '0,-500', color: 2, opacity: 100 },
      // A touchpoint reaches into the business: its far end can only be a
      // capability, so the line does not say so.
      connectors: [{ to: 'invoicing', fromPoint: 6, toPoint: 18, anchored: true }],
    },
  ],
  actors: [
    {
      key: 'payer',
      title: 'Payer',
      shape: { position: '0,-900', color: 3, opacity: 50 },
      interactions: [{ to: 'portal', fromPoint: 6, toPoint: 18 }],
    },
  ],
  connectors: [],
};

check('the new shape is valid', validate(v2) === null, validate(v2) ?? '');

const full = fromDocument(v2);
check('a nested line under an actor is read', full.connectors.length === 2);

const interaction = full.connectors.find((one) => one.fromKind === 'actor');
const reach = full.connectors.find((one) => one.fromKind === 'touchpoint');
check('the actor’s line knows both its ends',
  interaction.fromId === full.actors[0].id && interaction.toId === full.touchpoints[0].id);
check('and the kind of each, from where it was written',
  interaction.toKind === 'touchpoint' && reach.toKind === 'capability');
check('a dimmed layer opens dimmed', full.layers[1].dimmed === true);
check('opacity is read off every shape',
  full.actors[0].opacity === 50 && full.capabilities[0].opacity === 100);

const roundTrip = stringify(toDocument({ ...full, palette: [] }));
check('the new shape survives the round trip unchanged',
  roundTrip === stringify(toDocument({ ...fromDocument(JSON.parse(roundTrip)), palette: [] })));

// --- what a file may not say -------------------------------------------------

const refuses = (label, document_, wanted) => {
  const said = validate(document_);
  check(label, said !== null && said.includes(wanted), said ?? 'it was accepted');
};

refuses('a later version is refused',
  { ...v1, version: CURRENT_VERSION + 1 }, `reads up to ${CURRENT_VERSION}`);
refuses('a layer that is not one of ours is refused',
  { ...v2, layers: [{ key: 'infrastructure' }] }, 'not a layer of this map');
refuses('a hidden base layer is refused',
  { ...v2, layers: [{ key: 'core', hidden: true }] }, 'base layer cannot be hidden');
refuses('an actor reaching a capability is refused',
  { ...v2, actors: [{ ...v2.actors[0], interactions: [{ to: 'invoicing' }] }] },
  'not in the file');
refuses('a flat line from an actor to a capability is refused',
  { ...v2, connectors: [{ from: 'payer', fromKind: 'actor', to: 'invoicing' }] },
  'not to a capability');
refuses('a line ending on a domain is refused',
  { ...v2, connectors: [{ from: 'invoicing', to: 'billing', toKind: 'domain' }] },
  'cannot end on a domain');
refuses('an opacity off the scale is refused',
  { ...v2, domains: [{ ...v2.domains[0], shape: { position: '0,0', opacity: 5 } }] },
  'opacity must be between 10 and 100');
refuses('a Type choice listed twice is refused',
  { ...v2, types: { capability: ['Engine', 'Engine'] } }, 'listed twice');

// --- the store ---------------------------------------------------------------

store_.setMap(fromDocument(v2));
const { store } = store_;

const portal = store.touchpoints[0];
const payer = store.actors[0];
const invoicing = store.capabilities[0];
const billing = store.domains[0];

check('a kind says which layer it is on',
  store_.layerForKind('actor') === 'presentation' && store_.layerForKind('domain') === 'core');
check('a capability is on the base layer whatever its domain',
  store_.layerOf('capability', invoicing) === 'core');
check('a line belongs to the layer of its upper end',
  store_.connectorLayer(reach) === 'presentation');
check('the layer titles come from the model',
  store_.layerTitle('presentation') === 'Presentation Layer', store_.layerTitle('presentation'));

check('the presentation layer holds both new kinds and both lines',
  store_.onLayer('presentation').touchpoints.length === 1
  && store_.onLayer('presentation').actors.length === 1
  && store_.onLayer('presentation').connectors.length === 2);
check('the core layer holds the domain and its capability, and no lines',
  store_.onLayer('core').domains.length === 1
  && store_.onLayer('core').capabilities.length === 1
  && store_.onLayer('core').connectors.length === 0);

// Which layer is being worked on: an Edit-mode idea, never saved.
check('nothing is selected to start with', store_.selectedLayerKey() === null);
check('only its own kinds may be added to a layer',
  store_.kindsAddableTo('core').join(',') === 'domain,capability');

store_.setLayerState('presentation', { hidden: true });
check('hiding a layer hides it', store_.isHidden('presentation'));
check('and takes the lines on it out of sight', !store_.isVisible('connector', reach));
check('but leaves the document saying what it said',
  store_.layerByKey('presentation').hidden !== true);

// Selecting a hidden layer shows it: adding to what you cannot see drops the
// shape into nowhere.
store_.selectLayer('presentation');
check('selecting a hidden layer shows it', !store_.isHidden('presentation'));
check('and it is the one being worked on', store_.selectedLayerKey() === 'presentation');

store_.selectLayer(null);
check('leaving Edit mode selects no layer', store_.selectedLayerKey() === null);
store_.resetLayerState();

// The base layer has nothing under it, so hiding it is not a state it can be in.
store_.setLayerState('core', { hidden: true });
check('the base layer refuses to hide', !store_.isHidden('core'));
store_.setLayerState('core', { dimmed: true });
check('but it does dim', store_.layerState('core').dimmed === true);
store_.resetLayerState();

// --- the store: lines it will and will not draw ------------------------------

const threw = (work) => {
  try {
    work();
    return null;
  } catch (error) {
    return error.message;
  }
};

const made = store_.createTouchpoint({ title: 'Kiosk', x: 5, y: 5 });
const joined = store_.createConnector({
  fromId: made.id, fromKind: 'touchpoint', toId: invoicing.id, toKind: 'capability',
});
check('a touchpoint may reach a capability', !!joined);

// Drawn upwards, filed downwards: a line has two ends and no direction.
const upward = store_.createConnector({
  fromId: invoicing.id, fromKind: 'capability', toId: made.id, toKind: 'touchpoint',
  fromPoint: 3, toPoint: 9,
});
check('a line drawn upwards is stored under its upper end',
  upward.fromKind === 'touchpoint' && upward.fromId === made.id);
check('and its points follow its ends round',
  upward.fromPoint === 9 && upward.toPoint === 3,
  `${upward.fromPoint}/${upward.toPoint}`);

check('an actor may not reach a capability',
  (threw(() => store_.createConnector({
    fromId: payer.id, fromKind: 'actor', toId: invoicing.id, toKind: 'capability',
  })) ?? '').includes('not to a capability'));
check('a line may not end on a domain',
  (threw(() => store_.createConnector({
    fromId: made.id, fromKind: 'touchpoint', toId: billing.id, toKind: 'domain',
  })) ?? '').includes('cannot end on a domain'));
check('two touchpoints may not be joined',
  threw(() => store_.createConnector({
    fromId: made.id, fromKind: 'touchpoint', toId: portal.id, toKind: 'touchpoint',
  })) !== null);

// --- the store: how lines are filed ------------------------------------------

check('an actor owns its line to a touchpoint',
  store_.ownedBy('actor', payer.id).length === 1);
check('and the touchpoint does not also claim it',
  !store_.ownedBy('touchpoint', portal.id).some((one) => one.fromKind === 'actor'));
check('an actor’s line is a user interaction',
  store_.connectorScope(interaction) === 'interaction');
check('a touchpoint’s is a touchpoint connector',
  store_.connectorScope(reach) === 'touchpoint');
check('and each is named for the section that files it',
  store_.CONNECTOR_NAMES.interaction === 'User interaction'
  && store_.CONNECTOR_NAMES.touchpoint === 'Touchpoint connector');
check('the top-level list is capability lines only',
  store_.publicConnectors().every((one) => one.fromKind === 'capability'));

const removed = store_.deleteTouchpoint(made.id);
check('deleting a touchpoint takes the lines that hung off it',
  removed.touchpoints.length === 1 && removed.connectors.length === 2);
store_.restore(removed);
store_.deleteTouchpoint(made.id);

// --- Type choices ------------------------------------------------------------

check('a kind offers the choices the file gave it',
  store_.typesFor('capability').join(',') === 'Engine,Process');
check('a choice in use is counted', store_.typeUsage('capability', 'Engine') === 1);

const refused = store_.removeTypeChoice('capability', 'Engine');
check('and refused', refused.removed === false && refused.used === 1);
check('so the shape keeps its Type', invoicing.type === 'Engine');
check('a choice nothing uses can be removed',
  store_.removeTypeChoice('capability', 'Process').removed === true);

console.log(failures === 0 ? '\nAll layer checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
