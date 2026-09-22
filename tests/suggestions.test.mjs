// The Assistant's two halves: the brief that goes out to a chat, and the reply
// that is let back in. Checked against the seed map and the skill files the app
// ships, so a skill that names an operation there is not fails here rather than
// in front of an owner.
//   node tests/suggestions.test.mjs

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// document.js makes fresh ids for everything it reads. Nothing else here wants a browser.
globalThis.crypto ??= { randomUUID };

const { fromDocument, toDocument, validate } = await import('../app/js/document.js');
const rules = await import('../app/js/rules.js');
const {
  OPERATIONS, REPLY_FORMAT, MAX_SUGGESTIONS,
  keysOf, toBrief, briefText, readSkill, validateSkill, subjectFor, subjectName, buildPrompt, buildTurn,
  parseReply, checkReply, stillApplies, isNote, describeOperation,
} = await import('../app/js/suggestions.js');

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const file = (path) => readFile(new URL(path, import.meta.url), 'utf8');
// The seed map draws no actors, and the checks want every kind of shape and of
// line, so one is stood on its first touchpoint before it is read.
const seed = JSON.parse(await file('../seed/data/versions/v1.json'));
seed.actors = [{ title: 'Consumer', interactions: [{ to: seed.touchpoints[0].key }] }];

const state = fromDocument(seed);
const titled = (kind, title) => state[kind].find((one) => one.title.replace(/\s*\n\s*/g, ' ') === title);

// --- references --------------------------------------------------------------

const { refOf, idOf } = keysOf(state);
const fraud = titled('capabilities', 'Fraud Detection');
const risk = titled('domains', 'Credit & Risk Assessment');

check('a shape is named by its kind and its title as a permalink spells it',
  refOf.get(fraud.id) === 'capability:fraud-detection', refOf.get(fraud.id));
check('a title broken over two lines makes one key',
  refOf.get(risk.id) === 'domain:credit-risk-assessment', refOf.get(risk.id));
check('and a ref finds its shape again', idOf.get('capability:fraud-detection')?.id === fraud.id);

const twins = fromDocument({ title: 'Twins', capabilities: [{ title: 'Billing' }, { title: 'Billing' }] });
check('two shapes with one title get a suffix, as a map file gives them',
  [...keysOf(twins).refOf.values()].join(',') === 'capability:billing,capability:billing-2');

// --- the brief ---------------------------------------------------------------

state.description = 'A BNPL provider.';
const brief = toBrief(state, { subject: { kind: 'capability', id: fraud.id } });
const text = briefText(brief);

check('the brief carries no geometry', !/"(shape|position|x|y|lobeX|colorIndex|color)"/.test(text));
check('nor the palette', !text.includes('#86a27b'));
check('every capability is under its domain',
  brief.domains.reduce((sum, domain) => sum + domain.capabilities.length, 0) + brief.looseCapabilities.length
    === state.capabilities.length);
check('the subject is marked by its ref', brief.subject === 'capability:fraud-detection');
check('what the business is heads the brief, from the map\'s own description', brief.about === 'A BNPL provider.');
check('and is left out of a brief for a map that does not say',
  !('about' in JSON.parse(briefText(toBrief({ ...state, description: '  ' })))));

// It is part of the map, so it has to survive the file.
const written = toDocument(state);
check('the map\'s description is written to the file', written.description === 'A BNPL provider.');
check('and read back from it', fromDocument(written).description === 'A BNPL provider.');
check('a map that says nothing writes no field, so an older file is unchanged',
  !('description' in toDocument({ ...state, description: '' })));
check('a description alone would not have moved the file on: it is a field a reader may skip',
  !('description' in toDocument({ ...state, description: '' })) && written.version === 3);
check('a description that is not text is refused', (validate({ description: 7 }) ?? '').includes('must be text'));
check('and one past the limit, in the words every description is held to',
  (validate({ description: 'x'.repeat(rules.MAX_TEXT_LENGTH + 1) }) ?? '').includes(String(rules.MAX_TEXT_LENGTH)));
check('with no subject it is the whole map', toBrief(state).subject === 'map');
check('every line names two shapes that are in the brief',
  brief.lines.length === state.connectors.length
    && brief.lines.every((line) => idOf.has(line.from) && idOf.has(line.to)));
check('a line inside one domain is internal and one across a boundary is not',
  brief.lines.some((line) => line.scope === 'internal') && brief.lines.some((line) => line.scope === 'cross-domain'));
check('a touchpoint\'s line and an actor\'s are told apart',
  brief.lines.some((line) => line.scope === 'touchpoint') && brief.lines.some((line) => line.scope === 'interaction'));

const owned = structuredClone(state);
owned.capabilities[0].owner = 'Dana Whitfield';
check('owners stay behind unless asked for', !briefText(toBrief(owned)).includes('Dana Whitfield'));
check('and go along when they are', briefText(toBrief(owned, { owners: true })).includes('Dana Whitfield'));

const aLine = state.connectors[0];
const lineBrief = toBrief(state, { subject: { kind: 'connector', id: aLine.id } });
check('a line as the subject is named by its two ends',
  lineBrief.subject.line.from === refOf.get(aLine.fromId) && lineBrief.subject.line.to === refOf.get(aLine.toId));

// --- the skills the app ships ------------------------------------------------

const { skills: names } = JSON.parse(await file('../app/skills/index.json'));
const skills = [];
for (const name of names) {
  const source = await file(`../app/skills/${name}/SKILL.md`);
  const skill = readSkill(source);
  skills.push(skill);
  check(`${name} reads as a skill`, validateSkill(skill, name) === null, validateSkill(skill, name) ?? '');
  // A plain YAML scalar cannot hold ": ", and an agent's loader is stricter than ours.
  const front = source.split('---')[1];
  check(`${name} keeps its front matter plain enough for any YAML reader`,
    front.split('\n').every((line) => (line.match(/: /g) ?? []).length <= 1));
  check(`${name} closes by pointing an agent at the two formats`,
    skill.body.includes('../brief-format.md') && skill.body.includes('../reply-format.md')
      && !skill.task.includes('brief-format.md'));
}

const bySkill = (name) => skills.find((one) => one.name === name);
check('there are the thirteen standard skills and the free-form one', skills.length === 14);
check('the one that says what the business is comes first', names[0] === 'describe-the-business');
check('Describe may describe and nothing else', bySkill('describe').mayUse.join() === 'describe');
check('the free-form skill may use every operation',
  OPERATIONS.every((op) => bySkill('ask-your-own').mayUse.includes(op)));
check('no skill may take anything away',
  skills.every((skill) => skill.mayUse.every((op) => OPERATIONS.includes(op)))
    && !OPERATIONS.some((op) => ['remove', 'delete', 'disconnect'].includes(op)));

const replyFormat = await file('../app/skills/reply-format.md');
const briefFormat = await file('../app/skills/brief-format.md');
check('the reply format documents every operation there is',
  OPERATIONS.every((op) => replyFormat.includes(`\`${op}\``)));
check('and names the format a reply is checked for', replyFormat.includes(REPLY_FORMAT));

check('a skill file with no front matter is refused', !!readSkill('# Just a heading').problem);
check('a skill that names an operation there is not is refused',
  (validateSkill(readSkill('---\nname: x\ndescription: d\nmetadata:\n  works-on: map\n  may-use: remove\n---\nbody'), 'x') ?? '')
    .includes('not an operation'));
check('a skill that asks for something has to use it',
  (validateSkill(readSkill('---\nname: x\ndescription: d\nmetadata:\n  works-on: map\n  asks: flow\n---\nbody'), 'x') ?? '')
    .includes('{{flow}}'));

// --- what a skill is about ---------------------------------------------------

const onFraud = { type: 'capability', id: fraud.id };
check('a skill works on the selection when it can',
  subjectFor(bySkill('describe'), onFraud, state).id === fraud.id);
check('a capability stands in for its domain where a domain is wanted',
  subjectFor(bySkill('propose-capabilities'), onFraud, state).id === fraud.domainId);
check('the whole map is what is left when the selection is no use',
  subjectFor(bySkill('trace-a-flow'), onFraud, state) === 'map');
check('and nothing at all when the skill wants a selection it has not got',
  subjectFor(bySkill('describe'), { type: null, id: null }, state) === null);
check('a subject is named as the panel names it',
  subjectName(state, { kind: 'capability', id: fraud.id }) === 'Fraud Detection (capability)');

// --- the prompt --------------------------------------------------------------

const flow = bySkill('trace-a-flow');
const prompt = buildPrompt({
  skill: flow, state, subject: 'map', brief: toBrief(state), briefFormat, replyFormat, input: ' a refund ',
});
check('a prompt writes in what the skill asked for', prompt.includes('**a refund**') && !prompt.includes('{{flow}}'));
check('it carries the map', prompt.includes('"capability:fraud-detection"'));
check('and both formats, written in rather than linked to',
  prompt.includes('# The map you are given') && prompt.includes('# The reply you give back')
    && !prompt.includes('../reply-format.md'));
check('it says which operations the task may use', prompt.includes('`connect`, `add-capability`'));
check('and which skill to sign the reply with', prompt.includes('"trace-a-flow"'));

// The same prompt, cut where a conversation cuts it.
const parts = { skill: flow, state, subject: 'map', brief: toBrief(state), briefFormat, replyFormat, input: 'a refund' };
const spoken = buildTurn(parts);
check('in a conversation, what never changes is the system prompt: both formats, and no map',
  spoken.system.includes('# The map you are given') && spoken.system.includes('# The reply you give back')
    && !spoken.system.includes('"format": "domain-map-brief"'));
check('so two turns about different things share it, for a model that caches a prefix',
  spoken.system === buildTurn({ ...parts, skill: bySkill('describe'), subject: { kind: 'capability', id: fraud.id } }).system);
check('and the turn is the task and the map as it stands now',
  spoken.user.startsWith('# Trace a flow') && spoken.user.includes('## The map now')
    && spoken.user.includes('"format": "domain-map-brief"') && !spoken.user.includes('# The reply you give back'));
check('a copied prompt and a sent turn say the same things between them',
  [spoken.system, spoken.user].join('').length > prompt.length - 200);

// --- reading a reply ---------------------------------------------------------

const envelope = (suggestions, extra = {}) =>
  ({ format: REPLY_FORMAT, version: 1, skill: 'ask-your-own', summary: 'A look.', suggestions, ...extra });
const fenced = (reply) => `Here is my review.\n\n\`\`\`json\n${JSON.stringify(reply, null, 2)}\n\`\`\`\nHope it helps!`;

check('a reply is found inside the prose and the fence a chat wraps it in',
  parseReply(fenced(envelope([]))).reply?.summary === 'A look.');
check('and bare, as an agent writes it to a file', !!parseReply(JSON.stringify(envelope([]))).reply);
check('and with no fence at all, between the outermost braces',
  !!parseReply(`Sure! ${JSON.stringify(envelope([]))} Anything else?`).reply);
check('nothing pasted is said to be nothing', parseReply('  ').problem.includes('paste'));
check('prose with no JSON in it is refused', !!parseReply('I think the boundaries look fine.').problem);
check('another format is refused by name',
  parseReply(JSON.stringify({ format: 'domain-map-brief', suggestions: [] })).problem.includes('domain-map-brief'));
check('a newer format is refused rather than half read',
  parseReply(JSON.stringify(envelope([], { version: 2 }))).problem.includes('newer'));

// --- checking a reply --------------------------------------------------------

const review = (suggestions, extra) => checkReply(envelope(suggestions, extra), state, skills);
const only = (operations, extra) => review([{ title: 'T', why: 'W', operations }], extra).cards[0];

const described = only([{ op: 'describe', target: 'capability:fraud-detection', description: ' Scores orders. ' }]);
check('a describe resolves its ref to the shape, and trims what it writes',
  described.problem === null && described.operations[0].id === fraud.id
    && described.operations[0].description === 'Scores orders.');

check('a ref that is not on the map refuses the card, and says which',
  only([{ op: 'describe', target: 'capability:no-such-thing', description: 'x' }]).problem
    .includes('capability:no-such-thing'));
check('a description past the limit is refused in the words the editor uses',
  only([{ op: 'describe', target: 'capability:fraud-detection', description: 'x'.repeat(rules.MAX_TEXT_LENGTH + 1) }])
    .problem.includes(String(rules.MAX_TEXT_LENGTH)));

const aboutMap = only([{ op: 'describe', target: 'map', description: ' Pays merchants up front. ' }], { skill: 'describe-the-business' });
check('a describe may be aimed at the map itself: what the business is',
  aboutMap.problem === null && aboutMap.operations[0].kind === 'map'
    && aboutMap.operations[0].description === 'Pays merchants up front.');
check('and reads as that on its card',
  describeOperation(aboutMap.operations[0], state).says === 'Say what the business is');
check('there is always a map to describe, so that card never goes stale', stillApplies(aboutMap, { ...state, capabilities: [] }) === null);

const lineRef = { from: refOf.get(aLine.fromId), to: refOf.get(aLine.toId) };
const lineCard = only([{ op: 'describe', target: { from: lineRef.to, to: lineRef.from }, description: 'Orders.' }]);
check('a line is found by its two ends, whichever way round they are given',
  lineCard.problem === null && lineCard.operations[0].kind === 'connector' && lineCard.operations[0].id === aLine.id);

check('a rename to the same title is refused',
  only([{ op: 'rename', target: 'capability:fraud-detection', title: 'Fraud  Detection' }]).problem.includes('already'));
check('a reply may not remove anything, and is told what to do instead',
  only([{ op: 'remove', target: 'capability:fraud-detection' }]).problem.includes('note'));
check('nor disconnect', only([{ op: 'disconnect', from: lineRef.from, to: lineRef.to }]).problem.includes('may not'));
check('an operation nobody has heard of is refused',
  only([{ op: 'recolour', target: 'capability:fraud-detection' }]).problem.includes('not an operation'));

check('a skill is held to the operations it may use',
  only([{ op: 'rename', target: 'capability:fraud-detection', title: 'Fraud Screening' }], { skill: 'describe' })
    .problem.includes('may not use'));
check('a reply that names no skill is read as the free-form one',
  only([{ op: 'rename', target: 'capability:fraud-detection', title: 'Fraud Screening' }], { skill: undefined })
    .problem === null);

const loose = state.capabilities.find((one) => one.domainId !== fraud.domainId);
const elsewhere = refOf.get(state.domains.find((one) => one.id !== fraud.domainId).id);
check('a capability moves to another domain',
  only([{ op: 'move-capability', capability: 'capability:fraud-detection', domain: elsewhere }]).problem === null);
check('but not to the one it is in',
  only([{ op: 'move-capability', capability: 'capability:fraud-detection', domain: refOf.get(fraud.domainId) }])
    .problem.includes('already'));
check('and only a capability moves',
  only([{ op: 'move-capability', capability: elsewhere, domain: refOf.get(fraud.domainId) }]).problem.includes('Only a capability'));

const actor = refOf.get(state.actors[0].id);
check('a line the model cannot draw is refused in the model\'s own words',
  only([{ op: 'connect', from: actor, to: 'capability:fraud-detection' }]).problem
    === rules.connectorRule('actor', 'capability'));
check('two shapes already joined are not joined again',
  only([{ op: 'connect', from: lineRef.to, to: lineRef.from }]).problem.includes('joined already'));
check('nor twice in one suggestion',
  only([
    { op: 'add-capability', as: 'new:a', title: 'A' },
    { op: 'connect', from: 'new:a', to: 'capability:fraud-detection' },
    { op: 'connect', from: 'capability:fraud-detection', to: 'new:a' },
  ]).problem.includes('joined already'));

const split = only([
  { op: 'add-domain', as: 'new:collections', title: 'Collections', description: 'Getting paid back.' },
  { op: 'add-capability', as: 'new:dunning', domain: 'new:collections', title: 'Dunning' },
  { op: 'connect', from: 'new:dunning', to: 'capability:fraud-detection', description: 'Risk flags.' },
]);
check('a suggestion may use the shapes it has just made',
  split.problem === null && split.operations[1].domain.as === 'new:collections'
    && split.operations[2].from.kind === 'capability');
check('but not before it makes them',
  only([{ op: 'add-capability', domain: 'new:later', title: 'Early' }, { op: 'add-domain', as: 'new:later', title: 'Later' }])
    .problem.includes('before'));
check('and not one another suggestion made',
  review([
    { title: 'One', operations: [{ op: 'add-domain', as: 'new:shared', title: 'Shared' }] },
    { title: 'Two', operations: [{ op: 'add-capability', domain: 'new:shared', title: 'Borrowed' }] },
  ]).cards[1].problem.includes('new:shared'));
check('a capability goes into a domain and nothing else',
  only([{ op: 'add-capability', domain: 'capability:fraud-detection', title: 'Nested' }]).problem.includes('into a domain'));
check('a new shape needs a title', only([{ op: 'add-actor', title: '  ' }]).problem.includes('needs a title'));

check('a type has to be one the map offers',
  only([{ op: 'set-type', target: 'capability:fraud-detection', type: 'Engine' }]).problem.includes('no types'));
const typed = { ...state, types: { capability: ['Engine'] } };
check('and is taken when it is',
  checkReply(envelope([{ title: 'T', operations: [{ op: 'set-type', target: 'capability:fraud-detection', type: 'Engine' }] }]), typed, skills)
    .cards[0].problem === null);

const mixed = only([
  { op: 'describe', target: 'capability:fraud-detection', description: 'Fine.' },
  { op: 'describe', target: 'capability:no-such-thing', description: 'Not fine.' },
]);
check('one bad operation refuses the whole card, so nothing is half applied',
  mixed.problem !== null && mixed.operations.length === 0);

const noted = review([{ title: 'Merge these two?', why: 'They overlap.', about: ['capability:fraud-detection', lineRef, 'capability:gone'] }]).cards[0];
check('a suggestion with no operations is a note', isNote(noted));
check('what it is about resolves to shapes and lines, and what is not on the map drops out',
  noted.about.length === 2 && noted.about[0].id === fraud.id && noted.about[1].kind === 'connector');

const cited = review([{ title: 'T', source: { framework: 'BIAN', item: 'Fraud Detection' }, operations: [] }]).cards[0];
check('a citation is kept, to be shown as worth checking', cited.source.framework === 'BIAN');
check('prose is taken leniently: a missing title gets one',
  review([{ operations: [] }]).cards[0].title === 'Untitled suggestion');
check('a review too long to read is cut, and says by how much',
  review(Array.from({ length: MAX_SUGGESTIONS + 3 }, () => ({ title: 'T' }))).cutShort === 3);

// --- a review outlives changes to the map ------------------------------------

check('a card that passed still applies to the map it was checked against', stillApplies(described, state) === null);

const without = { ...state, capabilities: state.capabilities.filter((one) => one.id !== fraud.id) };
check('and says so when its shape has been deleted since', stillApplies(described, without).includes('no longer'));

const renamed = structuredClone(state);
renamed.capabilities.find((one) => one.id === fraud.id).title = 'Fraud Screening';
check('a rename does not lose it: cards hold the shape, not its key', stillApplies(described, renamed) === null);

const joinCard = only([{ op: 'connect', from: refOf.get(loose.id), to: 'capability:fraud-detection' }]);
if (joinCard.problem === null) {
  const joined = structuredClone(state);
  joined.connectors.push({ id: 'drawn-by-hand', fromKind: 'capability', fromId: fraud.id, toKind: 'capability', toId: loose.id });
  check('a line drawn by hand since makes the card that proposed it stale',
    stillApplies(joinCard, joined).includes('joined already'));
} else {
  check('(the seed already joins those two; pick another pair for this check)', false, joinCard.problem);
}

// --- a card in words ---------------------------------------------------------

const says = (card, at = 0) => describeOperation(card.operations[at], state, card.operations).says;
check('a describe reads as one', says(described) === 'Describe Fraud Detection');
check('a new capability names the domain the same card makes', says(split, 1) === 'Add the capability Dunning to Collections');
check('and a line names both ends', says(split, 2) === 'Connect Dunning and Fraud Detection');

// --- who owns what -------------------------------------------------------------

// The example map draws three areas, holding between them a domain, a
// touchpoint and a loose capability — every kind an area may hold.
const money = titled('areas', 'Money Movement');
const ledger = titled('domains', 'Core Ledger & Repayment');
const teamBrief = toBrief(state);

check('an area is named to a model like any other shape',
  refOf.get(money.id) === 'area:money-movement' && idOf.get('area:money-movement')?.id === money.id);
check('the brief lists the areas', teamBrief.areas.length === 3
  && teamBrief.areas.some((one) => one.ref === 'area:money-movement' && one.description));
check('a domain says which area it is in',
  teamBrief.domains.find((one) => one.ref === refOf.get(ledger.id)).area === 'area:money-movement');
check('so do a touchpoint and a loose capability',
  teamBrief.touchpoints.find((one) => one.title === 'Merchant Portal').area === 'area:customer-merchant'
  && teamBrief.looseCapabilities.find((one) => one.title === 'Customer Service Portal').area === 'area:money-movement');
check('a capability inside a domain does not: it belongs through the domain',
  teamBrief.domains.every((domain) => domain.capabilities.every((one) => !('area' in JSON.parse(JSON.stringify(one))))));
check('a shape in no area says nothing about one',
  !('area' in JSON.parse(JSON.stringify(teamBrief.touchpoints.find((one) => one.title === 'Customer App')))));
check('a map that draws no organisation sends no list of areas',
  !('areas' in JSON.parse(briefText(toBrief({ ...state, areas: [] })))));

check('an area can be what a skill is about',
  subjectFor(bySkill('describe'), { type: 'area', id: money.id }, state).id === money.id
  && subjectFor(bySkill('fill-the-blanks'), { type: 'area', id: money.id }, state).kind === 'area'
  && toBrief(state, { subject: { kind: 'area', id: money.id } }).subject === 'area:money-movement');
check('and one a skill has no use for falls back on the whole map',
  subjectFor(bySkill('grill-the-boundaries'), { type: 'area', id: money.id }, state) === 'map');

const areaCard = only([
  { op: 'describe', target: 'area:money-movement', description: 'Owns what is owed and what is paid.' },
  { op: 'rename', target: 'area:money-movement', title: 'Money' },
]);
check('a reply may describe and rename an area',
  areaCard.problem === null && areaCard.operations.every((op) => op.kind === 'area' && op.id === money.id),
  areaCard.problem ?? '');
check('but not make one, or hand a shape to one: who owns what is the owner’s',
  only([{ op: 'add-area', title: 'Platform' }]).problem.includes('not an operation')
  && !OPERATIONS.some((op) => op.includes('area')));

console.log(failures === 0 ? '\nAll suggestion checks passed.' : `\n${failures} check(s) failed.`);
process.exitCode = failures === 0 ? 0 : 1;
