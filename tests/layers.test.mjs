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

check('there are three layers, bottom first',
  rules.LAYERS.map((one) => one.key).join(',') === 'areas,core,presentation');
// Who owns the business can be put away; what it does cannot. So the base is
// named, and is not simply whichever layer is at the bottom.
check('the base layer is Domains, though areas are painted under it',
  rules.BASE_LAYER === 'core' && rules.LAYERS[0].key === 'areas');
check('an area is on a layer of its own', rules.LAYER_OF.area === 'areas'
  && rules.KINDS_ON.areas.join(',') === 'area');
check('nothing connects to an area',
  (rules.connectorRule('capability', 'area') ?? '').includes('cannot end on an area'));
check('a domain and a capability are on the base layer',
  rules.LAYER_OF.domain === 'core' && rules.LAYER_OF.capability === 'core');
check('a touchpoint and an actor are on the presentation layer',
  rules.LAYER_OF.touchpoint === 'presentation' && rules.LAYER_OF.actor === 'presentation');
check('each layer takes only its own kinds',
  rules.KINDS_ON.core.join(',') === 'domain,capability,feature'
  && rules.KINDS_ON.presentation.join(',') === 'touchpoint,actor');
check('a feature is wherever its capability is', rules.LAYER_OF.feature === 'core');
// The terrain joins itself freely: any two of a domain, a capability and a feature.
check('a domain, a capability and a feature connect to one another in every combination',
  rules.TERRAIN_KINDS.every((from) => rules.TERRAIN_KINDS.every((to) => rules.connectorRule(from, to) === null)));
check('such a line stays the way round it was drawn, having no upper end',
  rules.orderEnds({ kind: 'feature', id: 'f' }, { kind: 'domain', id: 'd' }).upper.kind === 'feature'
  && rules.orderEnds({ kind: 'domain', id: 'd' }, { kind: 'feature', id: 'f' }).upper.kind === 'domain');
check('a touchpoint still reaches a capability and nothing else of the terrain',
  rules.connectorRule('touchpoint', 'capability') === null
  && (rules.connectorRule('touchpoint', 'feature') ?? '').includes('A touchpoint connects to a capability, not to a feature')
  && (rules.connectorRule('domain', 'touchpoint') ?? '').includes('A touchpoint connects to a capability, not to a domain'));
check('and an actor nothing of it at all',
  (rules.connectorRule('feature', 'actor') ?? '').includes('An actor connects to a touchpoint, not to a feature'));

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
check('nothing connects to an area, which is no shape of the terrain',
  (rules.connectorRule('domain', 'area') ?? '').includes('cannot end on an area'));

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
check('it gets the model’s own stack', read.layers.length === 3);
check('with the layer it never knew shown, and nothing on it',
  read.layers[0].key === 'areas' && read.layers[0].hidden === false && read.areas.length === 0);
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
// The file names the layers it was written with. They are the model's to name,
// so a rename in rules.js cannot be undone by an older file saying otherwise.
check('the titles it carried are not taken up',
  lifted.layers.every((one) => one.title === undefined));

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
check('a dimmed layer opens dimmed', full.layers.find((one) => one.key === 'presentation').dimmed === true);
check('opacity is read off every shape',
  full.actors[0].opacity === 50 && full.capabilities[0].opacity === 100);

const roundTrip = stringify(toDocument({ ...full, palette: [] }));
check('the new shape survives the round trip unchanged',
  roundTrip === stringify(toDocument({ ...fromDocument(JSON.parse(roundTrip)), palette: [] })));

// --- where an icon sits, and how heavy it is drawn ---------------------------

// Both are fields a file may leave out, and does whenever they say nothing new:
// a map that never chose writes the file it always wrote, and one that did
// still opens in an app from before the choice, which reads past them.
check('a file that says nothing puts the icon over the title, as its file drew it',
  full.capabilities[0].iconPlacement === 'top' && full.capabilities[0].iconWeight === 1
  && full.touchpoints[0].iconPlacement === 'top' && full.actors[0].iconPlacement === 'top');
check('and nothing is written for it',
  !roundTrip.includes('iconPlacement') && !roundTrip.includes('iconWeight'));

const dressed = structuredClone(v2);
dressed.capabilities[0].icon = 'gear.svg';
dressed.capabilities[0].shape.iconPlacement = 'left';
dressed.capabilities[0].shape.iconWeight = 2.5;
dressed.touchpoints[0].icon = 'gear.svg';
dressed.touchpoints[0].shape.iconPlacement = 'bottom';
dressed.actors[0].shape.iconPlacement = 'right';
check('a file that places its icons is valid', validate(dressed) === null, validate(dressed) ?? '');

const dressedMap = fromDocument(dressed);
check('the placement is read off every kind that has one',
  dressedMap.capabilities[0].iconPlacement === 'left'
  && dressedMap.touchpoints[0].iconPlacement === 'bottom'
  && dressedMap.actors[0].iconPlacement === 'right');
check('and the weight off a shape that wears an icon', dressedMap.capabilities[0].iconWeight === 2.5);
check('an actor has a figure to place but no file to weigh', !('iconWeight' in dressedMap.actors[0]));

const dressedOut = toDocument({ ...dressedMap, palette: [] });
check('both are written back where they were read',
  dressedOut.capabilities[0].shape.iconPlacement === 'left'
  && dressedOut.capabilities[0].shape.iconWeight === 2.5
  && dressedOut.touchpoints[0].shape.iconPlacement === 'bottom'
  && dressedOut.actors[0].shape.iconPlacement === 'right');
check('and only what was chosen: the touchpoint wrote no weight',
  !('iconWeight' in dressedOut.touchpoints[0].shape));
// Placement and weight were fields an older app could read past. Areas are
// not: read past, they would be lost on the next save, so the number moved --
// and again for the owner's id, which is dropped the same way, and again for
// the features a capability holds.
check('every save writes version 5', dressedOut.version === 5 && CURRENT_VERSION === 5);
check('a map with no areas writes no list of them', !('areas' in dressedOut));

// --- what a file may not say -------------------------------------------------

const refuses = (label, document_, wanted) => {
  const said = validate(document_);
  check(label, said !== null && said.includes(wanted), said ?? 'it was accepted');
};

refuses('an icon placed nowhere we know is refused', (() => {
  const bad = structuredClone(dressed);
  bad.capabilities[0].shape.iconPlacement = 'middle';
  return bad;
})(), 'iconPlacement must be one of');
refuses('and so is a placement on an actor that is not one', (() => {
  const bad = structuredClone(dressed);
  bad.actors[0].shape.iconPlacement = 'over';
  return bad;
})(), 'iconPlacement must be one of');
refuses('an icon weight off the scale is refused', (() => {
  const bad = structuredClone(dressed);
  bad.touchpoints[0].shape.iconWeight = 40;
  return bad;
})(), 'iconWeight must be between');

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
refuses('a line from a capability to the domain that holds it is refused',
  { ...v2, connectors: [{ from: 'invoicing', to: 'billing', toKind: 'domain' }] },
  'cannot join a shape to the one that holds it');
refuses('a line ending on an area is refused',
  { ...v2, connectors: [{ from: 'invoicing', to: 'billing', toKind: 'area' }] },
  'cannot end on an area');
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
  store_.layerTitle('presentation') === 'Presentation', store_.layerTitle('presentation'));

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
  store_.kindsAddableTo('core').join(',') === 'domain,capability,feature');

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
check('a touchpoint may not reach a domain',
  (threw(() => store_.createConnector({
    fromId: made.id, fromKind: 'touchpoint', toId: billing.id, toKind: 'domain',
  })) ?? '').includes('connects to a capability, not to a domain'));
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
check('and each is named for what it joins',
  store_.CONNECTOR_NAMES.interaction === 'User interaction'
  && store_.CONNECTOR_NAMES.touchpoint === 'Touchpoint connector'
  && store_.CONNECTOR_NAMES.internal === 'Internal domain connector'
  && store_.CONNECTOR_NAMES.public === 'Cross-domain connector');
// Every line hangs under the element it starts from, capability lines among
// them — which is what lets the menu file all four kinds by one rule.
check('a capability owns the lines it starts',
  store_.ownedBy('capability', invoicing.id)
    .every((one) => one.fromKind === 'capability' && one.fromId === invoicing.id));
check('and a line is owned by exactly one element',
  store_.store.connectors.every((one) =>
    store_.ownedBy(one.fromKind, one.fromId).includes(one)
    && !store_.ownedBy(one.toKind, one.toId).includes(one)));

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

// --- areas -------------------------------------------------------------------

const v3 = {
  version: 3,
  title: 'A map with teams on it',
  layers: [{ key: 'areas', dimmed: true }, { key: 'core' }, { key: 'presentation' }],
  types: { area: ['Stream-aligned'] },
  areas: [
    {
      key: 'payments',
      title: 'Payments',
      type: 'Stream-aligned',
      shape: { position: '40,60', titleAngle: 212.5, color: 14, size: 64, weight: 'bold', titleScale: 1, opacity: 0 },
    },
    { key: 'growth', title: 'Growth' },
  ],
  domains: [
    { key: 'billing', area: 'payments', title: 'Billing', shape: { position: '0,0' } },
    { key: 'ledger', title: 'Ledger', shape: { position: '900,0' } },
  ],
  capabilities: [
    // Inside a domain it belongs through the domain, whatever the file says.
    { key: 'invoicing', domain: 'billing', area: 'growth', title: 'Invoicing' },
    { key: 'refunds', area: 'payments', title: 'Refunds', shape: { position: '300,400' } },
  ],
  touchpoints: [{ key: 'portal', area: 'growth', title: 'Portal', shape: { position: '0,-500' } }],
  actors: [{ key: 'payer', title: 'Payer', shape: { position: '0,-900' } }],
  connectors: [],
};

check('a map with areas is valid', validate(v3) === null, validate(v3) ?? '');

const teams = fromDocument(v3);
const teamOf = (list, title) => teams.areas.find((one) => one.id === titled(list, title).areaId)?.title ?? null;
check('its areas are read', teams.areas.length === 2 && teams.areas[0].titleAngle === 212.5);
check('an area may have no fill at all', teams.areas[0].opacity === 0);
check('one the file says little about gets the defaults',
  teams.areas[1].opacity === rules.AREA_DEFAULTS.opacity && teams.areas[1].titleAngle === null);
check('a domain, a touchpoint and a loose capability each name their area',
  teamOf(teams.domains, 'Billing') === 'Payments'
  && teamOf(teams.touchpoints, 'Portal') === 'Growth'
  && teamOf(teams.capabilities, 'Refunds') === 'Payments');
check('a shape that names none is in none', titled(teams.domains, 'Ledger').areaId === null);
check('an area written on a capability inside a domain is not read',
  titled(teams.capabilities, 'Invoicing').areaId === null);

const teamsOut = toDocument({ ...teams, palette: [] });
check('areas are written before the domains they hold',
  Object.keys(teamsOut).indexOf('areas') < Object.keys(teamsOut).indexOf('domains'));
check('membership is written as the area’s key',
  keyed(teamsOut.domains, 'billing').area === 'payments'
  && keyed(teamsOut.touchpoints, 'portal').area === 'growth'
  && keyed(teamsOut.capabilities, 'refunds').area === 'payments');
check('and not at all on a shape in none, or inside a domain',
  !('area' in keyed(teamsOut.domains, 'ledger')) && !('area' in keyed(teamsOut.capabilities, 'invoicing')));
check('no fill is written as 0, not left out', keyed(teamsOut.areas, 'payments').shape.opacity === 0);
check('the title’s place round the border is written only once it has one',
  keyed(teamsOut.areas, 'payments').shape.titleAngle === 212.5
  && !('titleAngle' in keyed(teamsOut.areas, 'growth').shape));
check('the layer’s own state is written', keyed(teamsOut.layers, 'areas').dimmed === true);
check('an area may carry a Type from a list of its own', teamsOut.types.area[0] === 'Stream-aligned');
check('what it wrote is valid, and reads back the same',
  validate(teamsOut) === null
  && stringify(toDocument({ ...fromDocument(teamsOut), palette: [] })) === stringify(teamsOut),
  validate(teamsOut) ?? '');

refuses('an area that is not in the file is refused',
  { ...v3, domains: [{ ...v3.domains[0], area: 'platform' }] }, "names area 'platform'");
refuses('two areas with one key are refused',
  { ...v3, areas: [v3.areas[0], v3.areas[0]] }, 'Two areas share the key');
refuses('a title angle past a full turn is refused',
  { ...v3, areas: [{ ...v3.areas[0], shape: { titleAngle: 360 } }] }, 'titleAngle must be');
refuses('an area more than solid is refused',
  { ...v3, areas: [{ ...v3.areas[0], shape: { opacity: 110 } }] }, 'opacity must be between 0 and 100');

// --- who owns what, in the store ---------------------------------------------

store_.setMap(teams);
const payments = titled(store.areas, 'Payments');
const growth = titled(store.areas, 'Growth');
const billingDomain = titled(store.domains, 'Billing');
const invoice = titled(store.capabilities, 'Invoicing');
const refunds = titled(store.capabilities, 'Refunds');

check('an area is on the areas layer', store_.layerOf('area', payments) === 'areas'
  && store_.onLayer('areas').areas.length === 2);
check('the base layer is still the one that cannot be hidden',
  store_.baseLayer().key === 'core' && !store_.layerStack()[0].base && store_.layerStack()[1].base);
store_.setLayerState('areas', { hidden: true });
check('the areas layer can be put away, though it is the bottom one', store_.isHidden('areas'));
store_.resetLayerState();

check('an area holds what names it, kind by kind',
  store_.membersOf(payments.id).map((one) => one.record.title).join(',') === 'Billing,Refunds');
check('a capability inside a domain belongs through its domain',
  store_.areaOf('capability', invoice)?.id === payments.id && !store_.mayJoinArea('capability', invoice));
check('an actor belongs to nobody', !store_.mayJoinArea('actor', store.actors[0])
  && store_.areaOf('actor', store.actors[0]) === null);

// Leaving a domain is not leaving the team; joining one is giving up your own.
store_.updateCapability(invoice.id, { clearDomain: true, x: 50, y: 50 });
check('a capability pulled out of a domain keeps the domain’s area', invoice.areaId === payments.id);
store_.updateCapability(refunds.id, { domainId: billingDomain.id });
check('one dropped into a domain gives up an area of its own', refunds.areaId === null
  && store_.areaOf('capability', refunds)?.id === payments.id);
store_.updateCapability(refunds.id, { clearDomain: true, areaId: growth.id });
check('and what a change says outright has the last word, which undo relies on',
  refunds.areaId === growth.id);

store_.updateDomain(billingDomain.id, { clearArea: true });
check('leaving takes a flag, since a null changes nothing', billingDomain.areaId === null);
store_.updateDomain(billingDomain.id, { areaId: payments.id });

// An area emptied out stays where it was drawn.
store_.updateCapability(invoice.id, { clearArea: true });
store_.updateDomain(billingDomain.id, { x: 640, y: -220 });
store_.updateDomain(billingDomain.id, { clearArea: true });
check('an area takes the place of the last shape to leave it',
  payments.x === 640 && payments.y === -220, `${payments.x},${payments.y}`);
store_.updateDomain(billingDomain.id, { areaId: payments.id });

store_.updateArea(payments.id, { titleAngle: 359.97 });
check('an angle rounded up to a full turn is back at the start', payments.titleAngle === 0);
store_.updateArea(payments.id, { clearTitleAngle: true });
check('and a title can be sent back to where it rides unasked', payments.titleAngle === null);

store_.select('area', growth.id);
const freed = store_.deleteArea(growth.id);
check('deleting an area deletes nothing it held',
  store.touchpoints.length === 1 && store.capabilities.length === 2 && store.areas.length === 1);
check('it frees them', store.touchpoints[0].areaId === null && refunds.areaId === null);
check('and drops the selection it was', store.selection.id === null);
store_.restore(freed);
check('undoing it puts every one of them back',
  store.areas.length === 2 && store.touchpoints[0].areaId === growth.id && refunds.areaId === growth.id);

// --- who owns it: a name, and the id of the person it was picked from ---------

const owned = fromDocument({
  version: 4,
  domains: [
    { key: 'billing', title: 'Billing', owner: 'Jane Doe', ownerId: '6b4f2a0e-9d1c-4e0a-8c3b-2f1d9e7a5c41' },
    { key: 'lending', title: 'Lending', owner: 'Platform team' },
  ],
  capabilities: [{ key: 'invoicing', title: 'Invoicing', domain: 'billing', ownerId: '6b4f2a0e-9d1c-4e0a-8c3b-2f1d9e7a5c41' }],
});
check('an owner picked from the list reads with the person\'s id beside the name',
  titled(owned.domains, 'Billing').ownerId === '6b4f2a0e-9d1c-4e0a-8c3b-2f1d9e7a5c41'
  && titled(owned.domains, 'Billing').owner === 'Jane Doe');
check('a name typed for a team carries no id', titled(owned.domains, 'Lending').ownerId === null);
check('a capability may carry one as a domain does',
  titled(owned.capabilities, 'Invoicing').ownerId === '6b4f2a0e-9d1c-4e0a-8c3b-2f1d9e7a5c41');
const ownedOut = toDocument(owned);
check('the id is written back beside the name, and left out where there is none',
  keyed(ownedOut.domains, 'billing').ownerId === '6b4f2a0e-9d1c-4e0a-8c3b-2f1d9e7a5c41'
  && !('ownerId' in keyed(ownedOut.domains, 'lending')));
check('a version 3 file reads with every owner a plain name',
  fromDocument({ version: 3, domains: [{ key: 'a', title: 'A', owner: 'Someone' }] }).domains[0].ownerId === null);
refuses('an id that is not text is refused', { version: 4, domains: [{ key: 'a', title: 'A', ownerId: 7 }] }, 'ownerId');
refuses('and one too long to be one', { version: 4, actors: [{ key: 'a', title: 'A', ownerId: 'x'.repeat(201) }] }, 'ownerId');

// --- features: what a capability does, held inside it -------------------------

const featured = {
  version: 5,
  title: 'Features',
  types: { feature: ['Customer-facing', 'Back office'] },
  domains: [{ key: 'billing', title: 'Billing' }],
  capabilities: [
    {
      key: 'invoicing',
      domain: 'billing',
      title: 'Invoicing',
      features: [
        { key: 'issue-an-invoice', title: 'Issue an invoice', description: 'From an order, once it ships.', type: 'Back office' },
        { key: 'credit-note', title: 'Credit note', owner: 'Jane Doe', ownerId: '6b4f2a0e-9d1c-4e0a-8c3b-2f1d9e7a5c41' },
        { key: 'reminders', title: 'Reminders' },
      ],
    },
    { key: 'collections', domain: 'billing', title: 'Collections', features: [{ key: 'dunning', title: 'Dunning' }] },
    { key: 'pricing', title: 'Pricing' },
  ],
  connectors: [{ from: 'invoicing', to: 'collections' }],
};
check('a file whose capabilities hold features is valid', validate(featured) === null, validate(featured) ?? '');

const featuredMap = fromDocument(featured);
const capabilityOf = (feature) => featuredMap.capabilities.find((one) => one.id === feature.capabilityId);
check('every feature is read, each naming the capability it was written under',
  featuredMap.features.length === 4
  && capabilityOf(titled(featuredMap.features, 'Credit note')).title === 'Invoicing'
  && capabilityOf(titled(featuredMap.features, 'Dunning')).title === 'Collections');
check('in the order the file had them',
  featuredMap.features.filter((one) => capabilityOf(one).title === 'Invoicing')
    .sort((a, b) => a.sortIndex - b.sortIndex).map((one) => one.title).join(',')
  === 'Issue an invoice,Credit note,Reminders');
check('a feature carries what it is called, what it is, its type and its owner',
  titled(featuredMap.features, 'Issue an invoice').description === 'From an order, once it ships.'
  && titled(featuredMap.features, 'Issue an invoice').type === 'Back office'
  && titled(featuredMap.features, 'Credit note').ownerId === '6b4f2a0e-9d1c-4e0a-8c3b-2f1d9e7a5c41');
check('and nothing of a look: no colour, no size',
  !['colorIndex', 'fontSize', 'sizeScale'].some((field) => field in titled(featuredMap.features, 'Dunning')));
check('it has no place of its own until it is put somewhere by hand',
  titled(featuredMap.features, 'Dunning').x === null && titled(featuredMap.features, 'Dunning').y === null);
check('a feature keeps a Type list of its own, as every kind does',
  featuredMap.types.feature.join(',') === 'Customer-facing,Back office');

const featuredOut = toDocument({ ...featuredMap, palette: [] });
check('features are written back under their capability, in order',
  keyed(featuredOut.capabilities, 'invoicing').features.map((one) => one.key).join(',')
  === 'issue-an-invoice,credit-note,reminders');
check('a capability that holds none writes no list of them',
  !('features' in keyed(featuredOut.capabilities, 'pricing')));
check('reading a file with features and writing it leaves it unchanged',
  stringify(featuredOut) === stringify(toDocument({ ...fromDocument(featuredOut), palette: [] })));
check('a feature writes only what it says',
  JSON.stringify(Object.keys(keyed(featuredOut.capabilities, 'collections').features[0])) === '["key","title"]');
check('two features of one name get keys of their own across the whole file', (() => {
  const twice = structuredClone(featured);
  twice.capabilities[1].features.push({ key: 'reminders-x', title: 'Reminders' });
  const written = toDocument({ ...fromDocument(twice), palette: [] });
  return keyed(written.capabilities, 'collections').features.at(-1).key === 'reminders-2';
})());
check('a version 4 file reads as a map whose capabilities hold nothing',
  fromDocument({ version: 4, capabilities: [{ key: 'a', title: 'A' }] }).features.length === 0);

refuses('features that are not a list are refused', (() => {
  const bad = structuredClone(featured);
  bad.capabilities[0].features = { key: 'a' };
  return bad;
})(), 'features must be a list');
refuses('a feature with no key is refused', (() => {
  const bad = structuredClone(featured);
  delete bad.capabilities[0].features[0].key;
  return bad;
})(), 'every feature needs a key');
refuses('two features sharing a key are refused, though they sit in two capabilities', (() => {
  const bad = structuredClone(featured);
  bad.capabilities[1].features[0].key = 'reminders';
  return bad;
})(), "Two features share the key 'reminders'");
refuses('a feature with a blank title is refused', (() => {
  const bad = structuredClone(featured);
  bad.capabilities[0].features[0].title = '  ';
  return bad;
})(), "Feature 'issue-an-invoice': Title must be");
refuses('more features than a capability holds are refused', (() => {
  const bad = structuredClone(featured);
  bad.capabilities[2].features = Array.from({ length: rules.MAX_FEATURES + 1 },
    (_, at) => ({ key: `f-${at}`, title: `F ${at}` }));
  return bad;
})(), `holds at most ${rules.MAX_FEATURES}`);

// --- lines among domains, capabilities and features ---------------------------

const wired = structuredClone(featured);
wired.domains.push({ key: 'lending', title: 'Lending' });
wired.capabilities.push({ key: 'scoring', domain: 'lending', title: 'Scoring', features: [{ key: 'bureau-check', title: 'Bureau check' }] });
wired.capabilities[0].features[1].shape = { position: '-40,25' };
wired.connectors = [
  { from: 'invoicing', to: 'collections' },
  { from: 'billing', fromKind: 'domain', to: 'lending', toKind: 'domain', description: 'Billing asks Lending.' },
  { from: 'dunning', fromKind: 'feature', to: 'bureau-check', toKind: 'feature' },
  { from: 'invoicing', to: 'lending', toKind: 'domain' },
  { from: 'credit-note', fromKind: 'feature', to: 'scoring' },
  { from: 'lending', fromKind: 'domain', to: 'reminders', toKind: 'feature' },
];
check('a file may join domains, capabilities and features in any combination', validate(wired) === null, validate(wired) ?? '');
const wiredMap = fromDocument(wired);
const pairOf = (line) => `${line.fromKind}-${line.toKind}`;
check('every such line is read with the kinds it was written with',
  wiredMap.connectors.map(pairOf).join(',')
  === 'capability-capability,domain-domain,feature-feature,capability-domain,feature-capability,domain-feature',
  wiredMap.connectors.map(pairOf).join(','));
check('and its ends are the records the keys name',
  wiredMap.domains.some((one) => one.id === wiredMap.connectors[1].fromId && one.title === 'Billing')
  && wiredMap.features.some((one) => one.id === wiredMap.connectors[2].toId && one.title === 'Bureau check'));
const wiredOut = toDocument({ ...wiredMap, palette: [] });
check('they are written at the top of the file, a kind said only where it is not a capability',
  JSON.stringify(wiredOut.connectors.map((line) => [line.from, line.fromKind ?? null, line.to, line.toKind ?? null]))
  === JSON.stringify([
    ['invoicing', null, 'collections', null],
    ['billing', 'domain', 'lending', 'domain'],
    ['dunning', 'feature', 'bureau-check', 'feature'],
    ['invoicing', null, 'lending', 'domain'],
    ['credit-note', 'feature', 'scoring', null],
    ['lending', 'domain', 'reminders', 'feature'],
  ]), JSON.stringify(wiredOut.connectors));
check('so a line between two capabilities is written as it always was',
  JSON.stringify(Object.keys(wiredOut.connectors[0]).slice(0, 2)) === '["from","to"]');
check('reading such a file and writing it leaves it unchanged',
  stringify(wiredOut) === stringify(toDocument({ ...fromDocument(wiredOut), palette: [] })));
check('a feature put somewhere by hand reads with its place, in hundredths of its capability\'s radii',
  titled(wiredMap.features, 'Credit note').x === -40 && titled(wiredMap.features, 'Credit note').y === 25);
check('and writes it back as a shape, where one left in its row writes none',
  keyed(wiredOut.capabilities, 'invoicing').features[1].shape.position === '-40,25'
  && !('shape' in keyed(wiredOut.capabilities, 'invoicing').features[0]));
refuses('a feature put outside its capability is refused', (() => {
  const bad = structuredClone(wired);
  bad.capabilities[0].features[1].shape = { position: '140,0' };
  return bad;
})(), 'position must be within');
refuses('a line from a feature to the capability that holds it is refused',
  { ...wired, connectors: [{ from: 'dunning', fromKind: 'feature', to: 'collections' }] },
  'cannot join a shape to the one that holds it');
refuses('and so is one to the domain its capability is in',
  { ...wired, connectors: [{ from: 'billing', fromKind: 'domain', to: 'dunning', toKind: 'feature' }] },
  'cannot join a shape to the one that holds it');
refuses('a line to a feature that is not in the file is refused',
  { ...wired, connectors: [{ from: 'invoicing', to: 'nowhere', toKind: 'feature' }] },
  'not in the file');

store_.setMap(wiredMap);
const kindsOf = (kind) => store.connectors.filter((line) => line.fromKind === kind || line.toKind === kind).length;
const billingNow = titled(store.domains, 'Billing');
const lendingNow = titled(store.domains, 'Lending');
const dunningNow = titled(store.features, 'Dunning');
const scoringNow = titled(store.capabilities, 'Scoring');
check('a line between two domains crosses a boundary, by definition',
  store_.connectorScope(store.connectors[1]) === 'public');
const inside = store_.createConnector({
  fromId: titled(store.features, 'Reminders').id, fromKind: 'feature', toId: dunningNow.id, toKind: 'feature',
});
check('a line between features of two capabilities in one domain stays inside it',
  store_.connectorScope(inside) === 'internal');
check('a line from a feature to a capability in another domain does not',
  store_.connectorScope(store.connectors[4]) === 'public');
check('the store refuses a line from a shape to the one that holds it',
  (threw(() => store_.createConnector({
    fromId: dunningNow.id, fromKind: 'feature', toId: billingNow.id, toKind: 'domain',
  })) ?? '').includes('cannot join a shape to the one that holds it'));
check('a feature is not handed to a capability it is connected to',
  (threw(() => store_.updateFeature(titled(store.features, 'Credit note').id, { capabilityId: scoringNow.id })) ?? '')
    .includes('Remove the connector first'));
check('nor a capability put into a domain it is connected to',
  (threw(() => store_.updateCapability(titled(store.capabilities, 'Invoicing').id, { domainId: lendingNow.id })) ?? '')
    .includes('Remove the connector first'));
const linesBefore = store.connectors.length;
const goneWithFeature = store_.deleteFeature(dunningNow.id);
check('deleting a feature takes the lines that ended on it',
  goneWithFeature.connectors.length === 2 && store.connectors.length === linesBefore - 2);
store_.restore(goneWithFeature);
check('and undoing it brings them back', store.connectors.length === linesBefore);
const goneWithCapability = store_.deleteCapability(scoringNow.id);
check('deleting a capability takes its own lines and its features\'',
  goneWithCapability.connectors.length === 2 && kindsOf('feature') === 2, `${goneWithCapability.connectors.length} lines, ${kindsOf('feature')} left on features`);
store_.restore(goneWithCapability);
const goneWithDomain = store_.deleteDomain(lendingNow.id);
check('deleting a domain takes every line that ended on it or on anything in it',
  goneWithDomain.connectors.length === 5 && store.connectors.length === linesBefore - 5,
  `${goneWithDomain.connectors.length} lines gone, ${store.connectors.length} left`);
store_.restore(goneWithDomain);
check('and undoing it brings every one back', store.connectors.length === linesBefore);

const creditNote = titled(store.features, 'Credit note');
store_.updateFeature(creditNote.id, { x: 61.4, y: -250 });
check('a feature is put where it is dragged, in whole hundredths and no further than the rim',
  creditNote.x === 61 && creditNote.y === -100, `${creditNote.x},${creditNote.y}`);
store_.updateFeature(creditNote.id, { clearPosition: true });
check('and sent back to its row', creditNote.x === null && creditNote.y === null);
store_.updateFeature(creditNote.id, { x: 10, y: 10 });
store_.deleteConnector(store.connectors.find((line) => line.fromId === creditNote.id).id);
store_.updateFeature(creditNote.id, { capabilityId: scoringNow.id });
check('handed to another capability, a feature arrives in its row: a place in one oval means nothing in another',
  creditNote.capabilityId === scoringNow.id && creditNote.x === null);

store_.setMap(featuredMap);
const invoicingNow = titled(store.capabilities, 'Invoicing');
const collectionsNow = titled(store.capabilities, 'Collections');
check('the store hands a capability its features in order',
  store_.featuresOf(invoicingNow.id).map((one) => one.title).join(',') === 'Issue an invoice,Credit note,Reminders');
const added = store_.createFeature({ capabilityId: invoicingNow.id });
check('a new feature goes after the last its capability holds',
  store_.featuresOf(invoicingNow.id).at(-1).id === added.id && added.title === rules.FEATURE_DEFAULTS.title);
check('a feature is not made outside a capability', (() => {
  try { store_.createFeature({ title: 'Nowhere' }); return false; } catch (error) {
    return error.message.includes('belongs to a capability');
  }
})());
store_.updateFeature(added.id, { title: 'Pro forma', capabilityId: collectionsNow.id });
check('a feature is renamed, and handed to another capability',
  added.title === 'Pro forma' && store_.featuresOf(collectionsNow.id).some((one) => one.id === added.id)
  && !store_.featuresOf(invoicingNow.id).some((one) => one.id === added.id));
check('a blank title leaves the one it had',
  store_.updateFeature(added.id, { title: '   ' }).title === 'Pro forma');
store_.select('feature', added.id);
const goneFeature = store_.deleteFeature(added.id);
check('deleting a feature takes it and nothing else',
  store.features.length === 4 && store.capabilities.length === 3 && store.selection.id === null);
store_.restore(goneFeature);
check('and undoing that puts it back as it was',
  store_.find('feature', added.id)?.title === 'Pro forma' && store.features.length === 5);

const goneCapability = store_.deleteCapability(invoicingNow.id);
check('deleting a capability takes the features inside it',
  store.features.every((one) => one.capabilityId !== invoicingNow.id) && store.features.length === 2
  && goneCapability.features.length === 3);
store_.restore(goneCapability);
check('and undoing it brings them back with it, and its line',
  store_.featuresOf(invoicingNow.id).length === 3 && store.connectors.length === 1);
const goneDomain = store_.deleteDomain(store.domains[0].id);
check('deleting a domain takes its capabilities\' features too',
  store.features.length === 0 && goneDomain.features.length === 5);
store_.restore(goneDomain);
check('and undoing it brings every one back', store.features.length === 5 && store.capabilities.length === 3);

const crowded = titled(store.capabilities, 'Pricing');
for (let at = 0; at < rules.MAX_FEATURES; at++) store_.createFeature({ capabilityId: crowded.id, title: `F ${at}` });
check('a capability that is full takes no more', (() => {
  try { store_.createFeature({ capabilityId: crowded.id }); return false; } catch (error) {
    return error.message.includes(`at most ${rules.MAX_FEATURES}`);
  }
})());
check('nor one handed over from another', (() => {
  try { store_.updateFeature(store_.featuresOf(collectionsNow.id)[0].id, { capabilityId: crowded.id }); return false; } catch (error) {
    return error.message.includes('at most');
  }
})());
check('a Type choice in use by a feature is counted, as for any kind',
  store_.typeUsage('feature', 'Back office') === 1);

console.log(failures === 0 ? '\nAll layer checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
