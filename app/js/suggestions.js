// What goes out to an AI chat and what is let back in. Out goes a brief: the
// map with its geometry left out, since a model asked about boundaries has no
// use for where a blob sits and no business moving it. Back comes a reply: a
// list of suggestions, each a handful of operations from a short closed list.
//
// Nothing here touches the page or the store. A reply is pasted in from a chat
// nobody vouches for, so every line of it is checked against rules.js before a
// card is offered, and the checks have to run headless to be tested — the way
// geometry.js does.

import * as rules from './rules.js';
import { slugify, oneLine } from './store.js';

export const BRIEF_FORMAT = 'domain-map-brief';
export const REPLY_FORMAT = 'domain-map-suggestions';
export const FORMAT_VERSION = 1;

/**
 * Everything a reply may do to a map. There is no remove and no disconnect: a
 * model that thinks something should go says so in a note, and the owner
 * deletes it by hand. Nothing about position, colour, size, layers or the
 * palette is here either — where a shape sits is the owner's meaning, not the
 * model's.
 */
export const OPERATIONS = [
  'describe', 'rename', 'set-type',
  'add-domain', 'add-capability', 'add-touchpoint', 'add-actor',
  'move-capability', 'connect',
];

/** What a model reaches for when it wants something gone, so the refusal can say why. */
const TAKES_AWAY = ['remove', 'delete', 'disconnect', 'merge'];

/** What a skill may be pointed at: a kind of selection, or the map as a whole. */
export const SUBJECTS = ['domain', 'capability', 'touchpoint', 'actor', 'area', 'line', 'map'];

/** More than this is not a review anyone reads; the rest is cut, and said to be. */
export const MAX_SUGGESTIONS = 200;

const LISTS = {
  area: 'areas',
  domain: 'domains',
  capability: 'capabilities',
  touchpoint: 'touchpoints',
  actor: 'actors',
  connector: 'connectors',
};

const listOf = (state, kind) => state[LISTS[kind]] ?? [];
const findIn = (state, kind, id) => listOf(state, kind).find((one) => one.id === id) ?? null;

// --- references --------------------------------------------------------------

/**
 * A shape is named to a model as `<kind>:<key>`, the key being its title the
 * way a permalink or a map file spells it. Two shapes of a kind can share a
 * title, so repeats get the same numeric suffix those do.
 *
 * Keys follow titles, so they are only good for as long as the titles hold:
 * a reply is resolved to ids the moment it is imported, and a rename applied
 * from one card cannot break the cards after it.
 */
export function keysOf(state) {
  const refOf = new Map();
  const idOf = new Map();
  for (const kind of rules.ELEMENT_KINDS) {
    const seen = new Map();
    for (const record of listOf(state, kind)) {
      const base = slugify(oneLine(record.title));
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const ref = `${kind}:${count === 1 ? base : `${base}-${count}`}`;
      refOf.set(record.id, ref);
      idOf.set(ref, { kind, id: record.id });
    }
  }
  return { refOf, idOf };
}

/** The line between two shapes, whichever way round it is asked for. */
function lineBetween(state, a, b) {
  return listOf(state, 'connector').find((line) =>
    (line.fromId === a.id && line.toId === b.id) || (line.fromId === b.id && line.toId === a.id))
    ?? null;
}

/** What a line is, in the words the brief uses. */
function scopeOf(state, line) {
  if (line.fromKind === 'actor') return 'interaction';
  if (line.fromKind === 'touchpoint') return 'touchpoint';
  const from = findIn(state, 'capability', line.fromId);
  const to = findIn(state, 'capability', line.toId);
  return from?.domainId && from.domainId === to?.domainId ? 'internal' : 'cross-domain';
}

// --- the brief ---------------------------------------------------------------

const filled = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);

/**
 * The map as a model is shown it. `subject` is the selection the task is about
 * — `{ kind, id }`, with a line's kind being 'connector' — or null for the
 * whole map. Owners are people's and teams' names, the one personal thing on a
 * map, so they stay behind unless they are asked for.
 *
 * `about` is the map's own description: what the business is. It heads the
 * brief because it is what makes a review specific — without it a model reviews
 * a map of nothing in particular.
 */
export function toBrief(state, { owners = false, subject = null } = {}) {
  const { refOf } = keysOf(state);

  // Who owns it, for the three kinds an area may hold. A capability inside a
  // domain belongs through the domain, which says so for all of them at once.
  const held = new Set(listOf(state, 'area').map((area) => area.id));
  const shape = (record) => ({
    ref: refOf.get(record.id),
    title: oneLine(record.title),
    description: filled(record.description),
    type: filled(record.type),
    owner: owners ? filled(record.owner) : undefined,
    area: held.has(record.areaId) && !record.domainId ? refOf.get(record.areaId) : undefined,
  });

  // A capability whose domain has gone is loose, as the diagram draws it.
  const homes = new Set(listOf(state, 'domain').map((domain) => domain.id));
  const homeOf = (capability) => (homes.has(capability.domainId) ? capability.domainId : null);
  const inside = (domainId) => listOf(state, 'capability')
    .filter((capability) => homeOf(capability) === domainId)
    .map(shape);

  const lineRefs = (line) => ({ from: refOf.get(line.fromId), to: refOf.get(line.toId) });

  let about_ = 'map';
  if (subject?.kind === 'connector') {
    const line = findIn(state, 'connector', subject.id);
    if (line) about_ = { line: lineRefs(line) };
  } else if (subject && refOf.has(subject.id)) {
    about_ = refOf.get(subject.id);
  }

  // Only the kinds that have choices: an empty list says nothing a missing one does not.
  const types = Object.fromEntries(rules.ELEMENT_KINDS
    .map((kind) => [kind, state.types?.[kind] ?? []])
    .filter(([, choices]) => choices.length > 0));

  return {
    format: BRIEF_FORMAT,
    version: FORMAT_VERSION,
    title: oneLine(state.title ?? ''),
    about: filled(state.description),
    subject: about_,
    types: Object.keys(types).length > 0 ? types : undefined,
    // Only a map that draws its organisation has any, and one that does not
    // says nothing about it rather than saying it has none.
    areas: held.size > 0 ? listOf(state, 'area').map(shape) : undefined,
    domains: listOf(state, 'domain').map((domain) => ({
      ...shape(domain),
      capabilities: inside(domain.id),
    })),
    looseCapabilities: inside(null),
    touchpoints: listOf(state, 'touchpoint').map(shape),
    actors: listOf(state, 'actor').map(shape),
    lines: listOf(state, 'connector')
      .filter((line) => refOf.has(line.fromId) && refOf.has(line.toId))
      .map((line) => ({
        ...lineRefs(line),
        scope: scopeOf(state, line),
        description: filled(line.description),
      })),
  };
}

/** The brief as it is pasted: indented, since a person reads it on the way past. */
export const briefText = (brief) => JSON.stringify(brief, null, 1);

// --- skills ------------------------------------------------------------------

const listed = (value) => (value ?? '').split(',').map((one) => one.trim()).filter(Boolean);

const unquoted = (value) => value.replace(/^(["'])(.*)\1$/, '$2');

/** The heading a skill file closes on, for an agent reading the folder; a pasted prompt inlines what it points at instead. */
const GIVEN_AND_RETURNED = /^## Given and returned\s*$/m;

/**
 * A skill file, read. The front matter is the agent-skills convention — `name`
 * and `description`, with everything of this app's own under `metadata` — and
 * is little enough YAML that reading it needs no parser: a key and a value to
 * a line, and one level of nesting.
 */
export function readSkill(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text ?? '');
  if (!match) return { problem: 'A skill file opens with front matter between two --- lines.' };

  const top = {};
  let nested = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;
    const pair = /^(\s*)([^:\s][^:]*):\s*(.*)$/.exec(line);
    if (!pair) return { problem: `This line of the front matter is not a key and a value: "${line}"` };
    const [, indent, key, value] = pair;
    if (indent === '') {
      // A key with nothing after it opens a map, and the indented lines under it fill it.
      nested = value === '' ? {} : null;
      top[key] = nested ?? unquoted(value.trim());
    } else if (nested) {
      nested[key.trim()] = unquoted(value.trim());
    } else {
      return { problem: `"${key.trim()}" is indented under nothing.` };
    }
  }

  const meta = typeof top.metadata === 'object' ? top.metadata : {};
  const body = match[2].trim();
  const pointers = GIVEN_AND_RETURNED.exec(body);

  return {
    name: top.name ?? '',
    description: top.description ?? '',
    title: meta.title ?? top.name ?? '',
    group: meta.group ?? '',
    worksOn: listed(meta['works-on']),
    mayUse: listed(meta['may-use']),
    asks: meta.asks ?? null,
    asksLabel: meta['asks-label'] ?? null,
    asksHint: meta['asks-hint'] ?? null,
    body,
    // What the task is, without the pointers to the two format files.
    task: (pointers ? body.slice(0, pointers.index) : body).trim(),
  };
}

/** The first thing wrong with a skill as read, or null. */
export function validateSkill(skill, folder = skill.name) {
  if (skill.problem) return skill.problem;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill.name)) return 'A skill is named in lower case, with hyphens.';
  if (skill.name !== folder) return `The skill in "${folder}" calls itself "${skill.name}".`;
  if (skill.description === '') return 'A skill needs a description: it is what an agent picks it by.';
  if (skill.task === '') return 'A skill needs a body: it is the prompt.';
  if (skill.worksOn.length === 0) return 'A skill says what it works on.';
  const stray = skill.worksOn.find((one) => !SUBJECTS.includes(one));
  if (stray) return `"${stray}" is not something a skill can work on. It is one of ${SUBJECTS.join(', ')}.`;
  const unknown = skill.mayUse.find((one) => !OPERATIONS.includes(one));
  if (unknown) return `"${unknown}" is not an operation. They are ${OPERATIONS.join(', ')}.`;
  if (skill.asks && !skill.task.includes(`{{${skill.asks}}}`))
    return `It asks for "${skill.asks}" and never uses {{${skill.asks}}}.`;
  return null;
}

/**
 * What a skill would be about, given what is selected: `{ kind, id }`, 'map',
 * or null when it has nothing to work on. A capability stands in for its domain
 * where a skill wants a domain — it is the domain being looked at — and the
 * whole map is what is left when the selection is no use to it.
 */
export function subjectFor(skill, selection, state) {
  const kind = selection?.type === 'connector' ? 'line' : selection?.type ?? null;
  const record = kind ? findIn(state, selection.type, selection.id) : null;

  if (record && skill.worksOn.includes(kind)) return { kind: selection.type, id: record.id };
  if (record && kind === 'capability' && record.domainId && skill.worksOn.includes('domain'))
    return { kind: 'domain', id: record.domainId };
  return skill.worksOn.includes('map') ? 'map' : null;
}

/** What a subject is called, for the panel and for the head of a prompt. */
export function subjectName(state, subject) {
  if (!subject || subject === 'map') return 'the whole map';
  const record = findIn(state, subject.kind, subject.id);
  if (!record) return 'the whole map';
  if (subject.kind !== 'connector') return `${oneLine(record.title)} (${subject.kind})`;
  const ends = [findIn(state, record.fromKind, record.fromId), findIn(state, record.toKind, record.toId)];
  return `${ends.map((end) => oneLine(end?.title ?? '?')).join(' – ')} (line)`;
}

/** The three things every prompt is made of, whichever way it travels. */
function promptParts({ skill, state, subject, brief, input = '' }) {
  const task = skill.asks ? skill.task.replaceAll(`{{${skill.asks}}}`, input.trim()) : skill.task;
  const allowed = skill.mayUse.map((op) => `\`${op}\``).join(', ');

  return {
    task: [
      `# ${skill.title}`,
      `**The subject of this task:** ${subjectName(state, subject === 'map' ? null : subject)}.`,
      task,
    ].join('\n\n'),
    map: `\`\`\`json\n${briefText(brief)}\n\`\`\``,
    answer: [
      '## For this task',
      `- Set \`"skill"\` to \`"${skill.name}"\`.\n`
        + `- The only operations this task may use are ${allowed || 'none'}. Any other is refused when `
        + 'the reply is imported.\n'
        + '- A suggestion with no operations is a note, and is always allowed.\n'
        + '- Write titles and descriptions in the language the map is written in.',
    ].join('\n\n'),
  };
}

/**
 * The whole prompt, ready to paste: the task, the map, and how to answer. It
 * stands on its own — a chat that has never heard of this app has to be able
 * to follow it — which is why the two format files are written in rather than
 * linked to.
 */
export function buildPrompt({ briefFormat, replyFormat, ...rest }) {
  const { task, map, answer } = promptParts(rest);
  return [task, '---', briefFormat.trim(), map, '---', replyFormat.trim(), answer].join('\n\n');
}

/**
 * The same prompt, cut where a conversation cuts it. What never changes — who
 * the model is being, how to read a brief, how to answer — is the system
 * prompt, so a model that caches a prefix pays for it once. What does change is
 * the turn: the task, and the map as it stands now, since applying a card from
 * the last answer has changed it.
 */
export function buildTurn({ briefFormat, replyFormat, ...rest }) {
  const { task, map, answer } = promptParts(rest);
  return {
    system: [
      'You are reviewing a domain map with its owner. Each turn gives you a task and the map as it '
        + 'stands now. Where there are earlier turns, they show what was asked and what you answered, but '
        + 'not the map as it was then: the owner applies your suggestions one card at a time, so the map '
        + 'may have moved on since your last answer — work from the one in front of you.',
      briefFormat.trim(),
      replyFormat.trim(),
    ].join('\n\n---\n\n'),
    user: [task, '## The map now', map, answer].join('\n\n'),
  };
}

// --- reading a reply ---------------------------------------------------------

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The reply out of whatever was pasted. A chat wraps its answer in prose and
 * a code fence as often as not, so the JSON is looked for: the whole text, then
 * each fenced block, then the outermost pair of braces.
 */
export function parseReply(text) {
  const pasted = (text ?? '').trim();
  if (pasted === '') return { problem: 'There is nothing to review yet: paste the reply first.' };

  const candidates = [pasted];
  for (const fence of pasted.matchAll(/```[\w-]*[ \t]*\r?\n([\s\S]*?)```/g)) candidates.push(fence[1]);
  const open = pasted.indexOf('{');
  const shut = pasted.lastIndexOf('}');
  if (open >= 0 && shut > open) candidates.push(pasted.slice(open, shut + 1));

  let reply = null;
  let jsonProblem = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isRecord(parsed) && Array.isArray(parsed.suggestions)) { reply = parsed; break; }
    } catch (error) {
      jsonProblem ??= error.message;
    }
  }

  if (!reply) {
    return {
      problem: 'No suggestions were found in that. A reply is one JSON object with a '
        + `"suggestions" list${jsonProblem ? ` — and the JSON in it does not parse (${jsonProblem})` : ''}.`,
    };
  }
  if (reply.format !== undefined && reply.format !== REPLY_FORMAT)
    return { problem: `That is a "${reply.format}", not a "${REPLY_FORMAT}".` };
  if (Number(reply.version ?? FORMAT_VERSION) > FORMAT_VERSION)
    return { problem: `That reply is in format version ${reply.version}, which is newer than this app reads.` };
  return { reply };
}

// --- checking a reply --------------------------------------------------------

const cleanTitle = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');
const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');
const cut = (value, most) => (value.length > most ? `${value.slice(0, most - 1)}…` : value);

/** "an actor", "a domain". */
const a = (kind) => `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}`;

/**
 * One card's operations, resolved from keys to ids. Throws the first problem as
 * a sentence: a card is applied whole or not at all, since half of a split is
 * worse than none of it.
 */
function resolveOperations(operations, state, idOf, mayUse) {
  /** Shapes this card makes, by the `new:` name it gave them, so its later operations can use them. */
  const made = new Map();
  const joined = new Set();

  const existing = (ref, what) => {
    if (typeof ref !== 'string') throw new Error(`${what} has to be a reference like "capability:some-key".`);
    const found = idOf.get(ref);
    if (!found) throw new Error(`There is no ${ref} on this map.`);
    return found;
  };

  /** A shape on the map, or one this card has just made. */
  const either = (ref, what) => {
    if (typeof ref === 'string' && ref.startsWith('new:')) {
      const kind = made.get(ref);
      if (!kind) throw new Error(`${ref} is used before anything in this suggestion makes it.`);
      return { kind, as: ref };
    }
    return existing(ref, what);
  };

  const titled = (kind, title) => {
    const wanted = cleanTitle(title);
    if (wanted === '') throw new Error(`${a(kind)[0].toUpperCase()}${a(kind).slice(1)} needs a title.`);
    const wrong = rules.validatorFor[kind]({ title: wanted });
    if (wrong) throw new Error(wrong);
    return wanted;
  };

  const described = (kind, description, { needed = false } = {}) => {
    const wanted = cleanText(description);
    if (needed && wanted === '') throw new Error('A description cannot be empty.');
    const wrong = kind === 'connector'
      ? rules.validateConnector({ description: wanted })
      : rules.validatorFor[kind]({ description: wanted });
    if (wrong) throw new Error(wrong);
    return wanted;
  };

  const naming = (op) => {
    if (op.as === undefined || op.as === null) return null;
    if (typeof op.as !== 'string' || !/^new:[a-z0-9-]+$/.test(op.as))
      throw new Error('"as" names a new shape like "new:fraud-scoring".');
    if (made.has(op.as)) throw new Error(`${op.as} is made twice in one suggestion.`);
    return op.as;
  };

  return operations.map((op) => {
    if (!isRecord(op) || typeof op.op !== 'string') throw new Error('An operation is a record with an "op".');
    if (TAKES_AWAY.includes(op.op))
      throw new Error(`A reply may not ${op.op} anything. Say it in a note, and the owner does it by hand.`);
    if (!OPERATIONS.includes(op.op)) throw new Error(`"${op.op}" is not an operation.`);
    if (!mayUse.includes(op.op)) throw new Error(`This skill may not use "${op.op}".`);

    if (op.op === 'describe' && op.target === 'map') {
      const wrong = rules.validateMapDescription(cleanText(op.description));
      if (wrong) throw new Error(wrong);
      if (cleanText(op.description) === '') throw new Error('A description cannot be empty.');
      return { op: 'describe', kind: 'map', description: cleanText(op.description) };
    }

    if (op.op === 'describe') {
      // A line is named by its two ends, having no title to make a key of.
      if (isRecord(op.target)) {
        const line = lineBetween(state, existing(op.target.from, 'A line\'s "from"'), existing(op.target.to, 'A line\'s "to"'));
        if (!line) throw new Error(`There is no line between ${op.target.from} and ${op.target.to}.`);
        return { op: 'describe', kind: 'connector', id: line.id, description: described('connector', op.description, { needed: true }) };
      }
      const { kind, id } = existing(op.target, 'A target');
      return { op: 'describe', kind, id, description: described(kind, op.description, { needed: true }) };
    }

    if (op.op === 'rename') {
      const { kind, id } = existing(op.target, 'A target');
      const title = titled(kind, op.title);
      if (title === oneLine(findIn(state, kind, id).title)) throw new Error('That is what it is called already.');
      return { op: 'rename', kind, id, title };
    }

    if (op.op === 'set-type') {
      const { kind, id } = existing(op.target, 'A target');
      const choices = state.types?.[kind] ?? [];
      if (!choices.includes(op.type)) {
        throw new Error(choices.length > 0
          ? `"${op.type}" is not one of this map's types for ${a(kind)}: ${choices.join(', ')}.`
          : `This map has no types for ${a(kind)} to choose from.`);
      }
      return { op: 'set-type', kind, id, type: op.type };
    }

    if (op.op.startsWith('add-')) {
      const kind = op.op.slice('add-'.length);
      const as = naming(op);
      const record = { op: op.op, as, title: titled(kind, op.title), description: described(kind, op.description) };
      if (kind === 'capability' && op.domain != null) {
        const home = either(op.domain, 'A domain');
        if (home.kind !== 'domain') throw new Error(`A capability goes into a domain, not into ${a(home.kind)}.`);
        record.domain = home;
      } else if (kind === 'capability') {
        record.domain = null;
      }
      if (as) made.set(as, kind);
      return record;
    }

    if (op.op === 'move-capability') {
      const capability = existing(op.capability, 'A capability');
      if (capability.kind !== 'capability') throw new Error(`Only a capability moves between domains, not ${a(capability.kind)}.`);
      const home = either(op.domain, 'A domain');
      if (home.kind !== 'domain') throw new Error(`A capability moves into a domain, not into ${a(home.kind)}.`);
      if (home.id && findIn(state, 'capability', capability.id).domainId === home.id)
        throw new Error('It is in that domain already.');
      return { op: 'move-capability', id: capability.id, domain: home };
    }

    // connect
    const from = either(op.from, 'A line\'s "from"');
    const to = either(op.to, 'A line\'s "to"');
    const wrong = rules.connectorRule(from.kind, to.kind);
    if (wrong) throw new Error(wrong);
    const [one, other] = [from.id ?? from.as, to.id ?? to.as];
    if (one === other) throw new Error('A connector needs two different elements.');
    // The store would draw a second line over the first; nothing on a map means two.
    const pair = [one, other].sort().join('|');
    if (joined.has(pair) || (from.id && to.id && lineBetween(state, from, to)))
      throw new Error('Those two are joined already.');
    joined.add(pair);
    return { op: 'connect', from, to, description: described('connector', op.description) };
  });
}

/**
 * A parsed reply turned into cards. Prose is taken leniently — a missing title
 * gets one, a long reason is cut — and operations strictly: one that does not
 * hold refuses its whole card, and the card says why.
 *
 * `skills` is what decides which operations the reply's skill may use. A reply
 * that names none, or one this app does not have, gets the free-form skill's.
 */
export function checkReply(reply, state, skills = []) {
  const { idOf } = keysOf(state);
  const skill = skills.find((one) => one.name === reply.skill) ?? null;
  const mayUse = skill?.mayUse ?? OPERATIONS;

  const cards = reply.suggestions.slice(0, MAX_SUGGESTIONS).map((suggestion) => {
    if (!isRecord(suggestion)) {
      return { title: 'Not a suggestion', why: '', about: [], source: null, operations: [], problem: 'A suggestion is a record.' };
    }

    const about = (Array.isArray(suggestion.about) ? suggestion.about : [])
      .map((ref) => {
        if (isRecord(ref)) {
          const [from, to] = [idOf.get(ref.from), idOf.get(ref.to)];
          const line = from && to ? lineBetween(state, from, to) : null;
          return line ? { kind: 'connector', id: line.id } : null;
        }
        return idOf.get(ref) ?? null;
      })
      .filter(Boolean);

    const source = isRecord(suggestion.source) && cleanTitle(suggestion.source.framework) !== ''
      ? {
        framework: cut(cleanTitle(suggestion.source.framework), 80),
        item: cut(cleanTitle(suggestion.source.item), 160),
      }
      : null;

    const card = {
      title: cut(cleanTitle(suggestion.title) || 'Untitled suggestion', rules.MAX_TITLE_LENGTH),
      why: cut(cleanText(suggestion.why), rules.MAX_TEXT_LENGTH),
      about,
      source,
      operations: [],
      problem: null,
    };

    try {
      const operations = suggestion.operations ?? [];
      if (!Array.isArray(operations)) throw new Error('"operations" is a list.');
      card.operations = resolveOperations(operations, state, idOf, mayUse);
    } catch (error) {
      card.problem = error.message;
    }
    return card;
  });

  return {
    skill: skill?.name ?? null,
    summary: cut(cleanText(reply.summary), rules.MAX_TEXT_LENGTH),
    cards,
    cutShort: Math.max(0, reply.suggestions.length - MAX_SUGGESTIONS),
  };
}

/** A card with nothing to apply: a finding, a question, a thing to go and delete by hand. */
export const isNote = (card) => card.operations.length === 0 && !card.problem;

/**
 * Whether a card that passed when it was imported still holds. The map moves
 * on under a review — a shape deleted by hand, a line drawn, another card
 * applied — so this is asked again just before a card is applied, and whenever
 * the cards are shown.
 */
export function stillApplies(card, state) {
  if (card.problem) return card.problem;

  const gone = (kind, id) => (findIn(state, kind, id) ? null : `The ${kind === 'connector' ? 'line' : kind} it is about is no longer on the map.`);

  for (const op of card.operations) {
    if (op.kind === 'map') continue; // there is always a map to describe
    if (op.op === 'describe' || op.op === 'rename' || op.op === 'set-type') {
      const lost = gone(op.kind, op.id);
      if (lost) return lost;
      if (op.op === 'set-type' && !(state.types?.[op.kind] ?? []).includes(op.type))
        return `"${op.type}" is no longer one of this map's types.`;
    } else if (op.op === 'add-capability' && op.domain?.id) {
      const lost = gone('domain', op.domain.id);
      if (lost) return lost;
    } else if (op.op === 'move-capability') {
      const lost = gone('capability', op.id) ?? (op.domain.id ? gone('domain', op.domain.id) : null);
      if (lost) return lost;
      if (op.domain.id && findIn(state, 'capability', op.id).domainId === op.domain.id)
        return 'It is in that domain already.';
    } else if (op.op === 'connect') {
      for (const end of [op.from, op.to]) {
        const lost = end.id ? gone(end.kind, end.id) : null;
        if (lost) return lost;
      }
      if (op.from.id && op.to.id && lineBetween(state, op.from, op.to)) return 'Those two are joined already.';
    }
  }
  return null;
}

/**
 * An operation in the words of the person reading the card: what it does, and
 * the text it would write, if any. Titles are read from the map as it is now,
 * so a card names a shape by what it is called today.
 */
export function describeOperation(op, state, operations = []) {
  const name = (end) => {
    if (end?.as) {
      const maker = operations.find((one) => one.as === end.as);
      return maker ? maker.title : end.as;
    }
    const record = end ? findIn(state, end.kind, end.id) : null;
    return record ? oneLine(record.title ?? '') : 'something no longer on the map';
  };

  if (op.op === 'describe' && op.kind === 'map') return { says: 'Say what the business is', text: op.description };
  if (op.op === 'describe') {
    if (op.kind !== 'connector') return { says: `Describe ${name(op)}`, text: op.description };
    const line = findIn(state, 'connector', op.id);
    const ends = line
      ? `${name({ kind: line.fromKind, id: line.fromId })} – ${name({ kind: line.toKind, id: line.toId })}`
      : 'a line no longer on the map';
    return { says: `Describe the line ${ends}`, text: op.description };
  }
  if (op.op === 'rename') return { says: `Rename ${name(op)} to ${op.title}`, text: '' };
  if (op.op === 'set-type') return { says: `Type ${name(op)} as ${op.type}`, text: '' };
  if (op.op === 'move-capability')
    return { says: `Move ${name({ kind: 'capability', id: op.id })} into ${name({ kind: 'domain', ...op.domain })}`, text: '' };
  if (op.op === 'connect') return { says: `Connect ${name(op.from)} and ${name(op.to)}`, text: op.description };

  const kind = op.op.slice('add-'.length);
  const where = kind === 'capability'
    ? (op.domain ? ` to ${name({ kind: 'domain', ...op.domain })}` : ', loose on the map')
    : '';
  return { says: `Add the ${kind} ${op.title}${where}`, text: op.description };
}
