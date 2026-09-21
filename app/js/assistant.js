// The Assistant: the column that takes the details panel's place while its chip
// is pressed. It asks an AI about the map and brings the answer back as cards
// to apply or dismiss.
//
// There are two ways out to a model and one way back. Where the server has one
// connected, an owner sends the task there: a skill, the map, an answer. Where
// it has none — or the owner would rather use another — the prompt is copied
// out by hand and the reply pasted in. Either way what comes back is the same
// reply, checked by the same code, shown as the same cards.
//
// Only the exchange in hand is shown, and nothing of a conversation is written
// down. The model is still sent the last few turns, from this page's memory and
// no further, so a follow-up question means something; a line under the answer
// says how many, and forgets them.
//
// Like details.js it renders and turns presses into intents: applying a card is
// main.js's, because that is where a change to the map is placed, recorded for
// undo and marked unsaved. What may be in a reply at all is suggestions.js's.

import { store, find, oneLine, connectorLabel } from './store.js';
import { signInAgain } from './identity.js';
import {
  readSkill, validateSkill, subjectFor, subjectName, toBrief, buildPrompt, buildTurn,
  parseReply, checkReply, stillApplies, isNote, describeOperation,
} from './suggestions.js';

const SKILLS_DIR = 'skills';

/** The review belongs to the tab, like the edit session it is part of. */
const SESSION = 'domain-map:assistant';

/** How many earlier turns go back to the model. Each is a question and a whole reply. */
const TURNS_REMEMBERED = 6;

const GROUPS = [
  { key: 'write', title: 'Write' },
  { key: 'grill', title: 'Grill' },
  { key: 'ask', title: 'Ask' },
];

const el = (id) => document.getElementById(id);

let handlers = {};
let editMode = false;
let owner = false;
let showing = false;

/** The model the server is connected to, as `{ host, model }`, or null. Only an owner is told. */
let connected = null;
/** An owner with a model connected who would rather copy the prompt out to another one. */
let byHand = false;

/** The skills as read from the folder, or why they could not be. Null until first wanted. */
let library = null;
let chosen = null;

/** What came back, as cards: `{ summary, cards, cutShort }`, or null. */
let review = null;

/**
 * What the model is reminded of: `{ said, reply }` a turn, oldest first. Kept
 * in the page and nowhere else — never shown, never written down — so a reload
 * is a clean start.
 */
let remembered = [];
/** The exchange in hand: `{ said, shown, failed }`, or null before the first Send. */
let exchange = null;
/** When the turn in flight was sent, while there is one. */
let waitingSince = null;

/** Whether the owner is talking to the connected model, rather than copying prompts out. */
const chatting = () => owner && connected !== null && !byHand;

// --- keeping --------------------------------------------------------------------

function keep() {
  try {
    sessionStorage.setItem(SESSION, JSON.stringify({
      showing, chosen, byHand, input: el('assistant-input').value, review,
    }));
  } catch {
    /* full, or switched off: the review lasts as long as the page does */
  }
}

function kept() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION)) ?? {};
  } catch {
    return {};
  }
}

// --- the skills -------------------------------------------------------------------

const text = async (path) => {
  const response = await fetch(`${SKILLS_DIR}/${path}`);
  if (!response.ok) throw new Error(`${path} is not there (${response.status}).`);
  return response.text();
};

/** Read the folder once, the first time the column is opened. */
async function loadLibrary() {
  if (library) return library;
  try {
    const { skills: names } = JSON.parse(await text('index.json'));
    const [briefFormat, replyFormat, ...sources] = await Promise.all([
      text('brief-format.md'), text('reply-format.md'),
      ...names.map((name) => text(`${name}/SKILL.md`)),
    ]);
    const skills = [];
    sources.forEach((source, at) => {
      const skill = readSkill(source);
      const wrong = validateSkill(skill, names[at]);
      // One bad file loses one chip, not the column.
      if (wrong) console.warn(`Skill "${names[at]}" is left out: ${wrong}`);
      else skills.push(skill);
    });
    library = { skills, briefFormat, replyFormat, problem: null };
  } catch (error) {
    library = { skills: [], briefFormat: '', replyFormat: '', problem: error.message };
  }
  return library;
}

const skillNamed = (name) => library?.skills.find((skill) => skill.name === name) ?? null;

// --- asking -----------------------------------------------------------------------

function chip(skill) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--chip skill';
  button.textContent = skill.title;
  button.dataset.skill = skill.name;

  const subject = subjectFor(skill, store.selection, store);
  button.disabled = subject === null;
  button.title = subject === null
    ? `Pick ${skill.worksOn.map((kind) => (kind === 'actor' ? 'an actor' : `a ${kind}`)).join(' or ')} first`
    : skill.description;
  button.setAttribute('aria-pressed', String(chosen === skill.name));
  button.addEventListener('click', () => {
    chosen = skill.name;
    keep();
    renderAsk();
  });
  return button;
}

function hint(message, isError = false) {
  const line = document.createElement('p');
  line.className = 'assistant__hint';
  line.dataset.error = String(isError);
  line.textContent = message;
  return line;
}

/**
 * Said only while the map does not say what the business is. The field itself
 * is in the details panel, with nothing selected — it is the map's, not the
 * Assistant's — so all that is wanted here is the reason to go and fill it in.
 */
function renderAboutNote() {
  const missing = (store.description ?? '').trim() === '';
  el('assistant-about-note').textContent = missing
    ? 'The map does not say what the business is, so a review of it will be generic. '
      + 'Describe the business drafts it; it is kept in Details, with nothing selected.'
    : '';
}

/** Where a prompt is about to go, said under the button that sends it there. */
function renderCallout() {
  let title = 'No model connected yet';
  let says = 'The assistant writes the prompt; you take it to the AI chat you use and paste the reply back '
    + 'here to review. It carries the whole map, without its drawing, so paste it only where your organisation allows.';

  if (owner && connected) {
    title = 'Using another chat';
    says = 'Copy the prompt into a chat of your own and paste its reply below. It carries the whole map, without its drawing.';
  } else if (!owner) {
    title = 'Take it to a chat of your own';
    says = 'The assistant writes the prompt for the AI chat you use. It carries the whole published map, without its drawing.';
  }
  el('assistant-callout-title').textContent = title;
  el('assistant-callout-text').textContent = says;
  // Talking to the connected model, where a message goes is Send's tooltip and
  // nothing more: there for whoever wonders, out of the way for everyone else.
  el('assistant-callout').hidden = chatting();
  el('assistant-send').title = connected
    ? `Send the task and the map to ${connected.model ? `${connected.model} at ` : ''}${connected.host}`
    : '';

  const other = el('assistant-other');
  other.hidden = !(owner && connected);
  other.textContent = byHand ? `Back to ${connected?.host ?? 'the connected model'}` : 'Use another chat';
}

/** The chips, what the chosen one is about, and whatever it asks for first. */
function renderAsk() {
  renderAboutNote();
  renderCallout();
  el('assistant-chat').hidden = !chatting();
  el('assistant-manual').hidden = chatting();

  const host = el('assistant-skills');
  if (!library) return;
  if (library.problem) {
    host.replaceChildren(hint(`The skills could not be read: ${library.problem}`, true));
    return;
  }

  host.replaceChildren(...GROUPS.map((group) => {
    const row = document.createElement('div');
    row.className = 'skills';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', group.title);
    const caption = document.createElement('span');
    caption.className = 'skills__group';
    caption.textContent = group.title;
    row.append(caption, ...library.skills.filter((skill) => skill.group === group.key).map(chip));
    return row;
  }));

  const skill = skillNamed(chosen);
  const subject = skill ? subjectFor(skill, store.selection, store) : null;
  const usable = !!skill && subject !== null;

  // The description is written for an agent choosing a skill: what it does, then
  // when to use it. The first half is what a person wants under the chips.
  el('assistant-skill-says').textContent = skillNamed(chosen)?.description.split(/ Use when /)[0] ?? '';

  el('assistant-subject').textContent = usable
    ? subjectName(store, subject === 'map' ? null : subject)
    : (skill ? 'Nothing this skill works on is selected' : 'Pick a skill');

  // The one box for typing: whatever the skill asks for first. Ask your own asks
  // for the question itself, so that is the only skill a question is typed under.
  const asks = !!skill?.asks;
  el('assistant-input-field').hidden = !asks;
  if (asks) {
    el('assistant-input-label').textContent = skill.asksLabel ?? skill.asks;
    el('assistant-input').placeholder = skill.asksHint ?? '';
  }

  el('assistant-copy').disabled = !usable;
  el('assistant-send').disabled = !usable || waitingSince !== null;
  renderExchange();
}

/** Everything a prompt is built from, as things stand, or null with the reason said. */
function asked() {
  const skill = skillNamed(chosen);
  const subject = skill ? subjectFor(skill, store.selection, store) : null;
  if (!skill || subject === null) return null;

  const input = el('assistant-input').value;
  if (skill.asks && input.trim() === '') {
    handlers.onStatus?.(`${skill.asksLabel ?? 'This skill asks for something'} — say, and then ${chatting() ? 'send' : 'copy'}.`, true);
    el('assistant-input').focus();
    return null;
  }

  const brief = toBrief(store, {
    owners: el('assistant-owners').checked,
    subject: subject === 'map' ? null : subject,
  });
  return {
    skill,
    subject,
    input,
    parts: {
      skill, state: store, subject, brief, input,
      briefFormat: library.briefFormat, replyFormat: library.replyFormat,
    },
  };
}

const sized = (length) => (length < 1000 ? `${length} characters` : `${Math.round(length / 1000)} thousand characters`);

/** The clipboard API wants a secure page; a map served over plain http on an intranet is not one. */
async function copy(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* refused: the old way may still work */
    }
  }
  const area = document.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const done = document.execCommand('copy');
  area.remove();
  return done;
}

// --- the exchange in hand ---------------------------------------------------------

let ticking = null;

/** What was just asked and what came back — or that it is still coming, or why it did not. */
function renderExchange() {
  const box = el('assistant-exchange');
  clearInterval(ticking);
  box.hidden = !chatting() || exchange === null;

  if (exchange !== null) {
    el('assistant-asked').textContent = exchange.said;
    const answer = el('assistant-answer');
    box.dataset.state = waitingSince !== null ? 'waiting' : (exchange.failed ? 'failed' : 'answered');
    if (waitingSince !== null) {
      // No words arrive until they all do, so the wait has to say it is one.
      const tick = () => { answer.textContent = `Thinking… ${Math.round((Date.now() - waitingSince) / 1000)}s`; };
      tick();
      ticking = setInterval(tick, 1000);
    } else {
      answer.textContent = exchange.shown;
    }
  }

  // The turns the model is reminded of are never shown, so this line is the only
  // sign that a question is being read in the light of the ones before it.
  const turns = remembered.length;
  el('assistant-memory').hidden = !chatting() || turns === 0 || waitingSince !== null;
  el('assistant-memory-count').textContent = `${turns} earlier turn${turns === 1 ? '' : 's'} remembered`;
}

/** What the model is shown of the turns before this one: the words, and its own replies, but no old maps. */
const history = () => remembered.flatMap((turn) => [
  { role: 'user', content: `${turn.said}\n\n(The map as it stood then is left out. The map as it is now is in the latest message.)` },
  { role: 'assistant', content: turn.reply },
]);

async function relay(system, messages) {
  const response = await fetch('api/assistant/chat', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages }),
  });
  if (response.status === 401) {
    signInAgain();
    throw new Error('Your session has ended. Signing in again…');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? `The server answered ${response.status}.`);
  return payload.text;
}

async function send() {
  if (waitingSince !== null) return;
  const ask = asked();
  if (!ask) return;

  const { system, user } = buildTurn(ask.parts);
  const about = subjectName(store, ask.subject === 'map' ? null : ask.subject);
  const said = [`${ask.skill.title} — ${about}`, ...(ask.skill.asks ? [ask.input.trim()] : [])].join('\n');
  const messages = [...history(), { role: 'user', content: user }];

  exchange = { said, shown: '', failed: false };
  waitingSince = Date.now();
  // A question has been asked, so the box is clear for the next; a standard or a
  // flow is as likely to be wanted again as not, and stays.
  if (ask.skill.asks === 'question') el('assistant-input').value = '';
  renderAsk();

  let cards = 0;
  try {
    const reply = await relay(system, messages);
    const { reply: parsed } = parseReply(reply);
    if (parsed) {
      const checked = checkReply(parsed, store, library?.skills ?? []);
      review = {
        summary: checked.summary,
        cutShort: (review?.cutShort ?? 0) + checked.cutShort,
        // The cards of earlier answers stay until they are dealt with.
        cards: [...(review?.cards ?? []), ...checked.cards],
      };
      cards = checked.cards.length;
      const count = cards === 0 ? 'No suggestions.' : `${cards} suggestion${cards === 1 ? '' : 's'} below.`;
      exchange.shown = [checked.summary, count].filter(Boolean).join('\n\n');
    } else {
      // A model that answers in prose has still answered.
      exchange.shown = reply.trim();
    }
    remembered = [...remembered, { said, reply }].slice(-TURNS_REMEMBERED);
  } catch (error) {
    exchange.failed = true;
    exchange.shown = error.message;
    // Nothing was heard, so nothing typed is lost.
    if (ask.skill.asks === 'question') el('assistant-input').value = ask.input;
  } finally {
    waitingSince = null;
  }

  keep();
  renderAsk();
  renderReview();
  if (cards > 0) el('assistant-summary').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/** Have the model forget what was asked before. What is on screen goes too: it was the last of it. */
function startOver() {
  remembered = [];
  exchange = null;
  renderAsk();
}

// --- reviewing --------------------------------------------------------------------

function shapeChip(target) {
  const record = find(target.kind, target.id);
  if (!record) return null;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--chip card__shape';
  button.textContent = target.kind === 'connector' ? connectorLabel(record) : oneLine(record.title);
  button.title = `Show this ${target.kind === 'connector' ? 'line' : target.kind} on the map`;
  button.addEventListener('click', () => handlers.onShow?.(target.kind, target.id));
  return button;
}

/** Every shape a card names, once: what it is about, then whatever its operations touch. */
function shapesOf(card) {
  const seen = new Set();
  const all = [...card.about];
  for (const op of card.operations) {
    if (op.id) all.push({ kind: op.kind ?? 'capability', id: op.id });
    for (const end of [op.domain, op.from, op.to]) if (end?.id) all.push({ kind: end.kind ?? 'domain', id: end.id });
  }
  return all.filter((target) => !seen.has(target.id) && seen.add(target.id));
}

function cardButton(label, title, onClick, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--chip';
  button.textContent = label;
  button.title = title;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function cardView(card) {
  const problem = stillApplies(card, store);
  const note = isNote(card);

  const view = document.createElement('article');
  view.className = 'card';
  view.dataset.state = problem ? 'refused' : (note ? 'note' : 'ready');

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = card.title;
  if (note) {
    const tag = document.createElement('span');
    tag.className = 'badge badge--quiet';
    tag.textContent = 'Note';
    title.append(' ', tag);
  }
  view.appendChild(title);

  if (card.why) {
    const why = document.createElement('p');
    why.className = 'card__why';
    why.textContent = card.why;
    view.appendChild(why);
  }

  if (card.operations.length > 0) {
    const list = document.createElement('ul');
    list.className = 'card__ops';
    for (const op of card.operations) {
      const { says, text: written } = describeOperation(op, store, card.operations);
      const item = document.createElement('li');
      const what = document.createElement('span');
      what.className = 'card__says';
      what.textContent = says;
      item.appendChild(what);
      if (written) {
        const quote = document.createElement('span');
        quote.className = 'card__text';
        quote.textContent = written;
        item.appendChild(quote);
      }
      list.appendChild(item);
    }
    view.appendChild(list);
  }

  // A model cites standards that sound right more readily than ones that are.
  if (card.source) {
    const source = document.createElement('p');
    source.className = 'card__source';
    source.textContent = `${[card.source.framework, card.source.item].filter(Boolean).join(' · ')} — worth checking`;
    view.appendChild(source);
  }

  const shapes = shapesOf(card).map(shapeChip).filter(Boolean);
  if (shapes.length > 0) {
    const about = document.createElement('div');
    about.className = 'card__about';
    about.append(...shapes);
    view.appendChild(about);
  }

  if (problem) {
    const refused = document.createElement('p');
    refused.className = 'card__problem';
    refused.textContent = `Not applied: ${problem}`;
    view.appendChild(refused);
  }

  const actions = document.createElement('div');
  actions.className = 'card__actions';
  if (!note && !problem) {
    actions.appendChild(cardButton('Apply', editMode ? 'Make this change, as one step Ctrl+Z undoes' : 'Press Edit to apply',
      () => applyOne(card), !editMode));
  }
  actions.appendChild(cardButton(note ? 'Done' : 'Dismiss', 'Take this card off the list', () => drop(card)));
  view.appendChild(actions);
  return view;
}

const applicable = () => (review?.cards ?? []).filter((card) => !isNote(card) && !stillApplies(card, store));

function renderReview() {
  const section = el('assistant-review');
  // With a model connected and nothing back from it yet, there is nothing to review.
  section.hidden = !owner || (chatting() && !review);
  if (!owner) return;

  // A reply pasted in by hand is the start of changing the map, so it waits for
  // Edit with everything else. Asking the connected model is only asking: the
  // cards it sends back are read either way, and applied in Edit.
  el('assistant-paste').hidden = chatting();
  for (const id of ['assistant-reply', 'assistant-check']) el(id).disabled = !editMode;
  const cards = review?.cards ?? [];
  let note = '';
  if (!editMode && !chatting()) note = 'Press Edit to bring a reply in and apply it.';
  else if (!editMode && cards.length > 0) note = 'Press Edit to apply a card.';
  el('assistant-review-note').textContent = note;
  el('assistant-review-note').hidden = note === '';

  const summary = el('assistant-summary');
  summary.hidden = !review;
  if (review) {
    const ready = applicable().length;
    const notes = cards.filter(isNote).length;
    const refused = cards.length - ready - notes;
    const counts = [
      `${ready} to apply`,
      ...(notes ? [`${notes} note${notes === 1 ? '' : 's'}`] : []),
      ...(refused ? [`${refused} not applicable`] : []),
      ...(review.cutShort ? [`${review.cutShort} more were cut`] : []),
    ].join(' · ');
    summary.replaceChildren(
      // Sent to the connected model, the summary is in the exchange, under the question it answers.
      ...(review.summary && !chatting()
        ? [Object.assign(document.createElement('p'), { className: 'assistant__summary', textContent: review.summary })]
        : []),
      Object.assign(document.createElement('p'), { className: 'assistant__hint', textContent: cards.length ? counts : 'Nothing left to review.' }),
    );
  }

  el('assistant-bulk').hidden = cards.length === 0;
  el('assistant-apply-all').disabled = !editMode || applicable().length === 0;
  el('assistant-cards').replaceChildren(...cards.map(cardView));
}

function drop(card) {
  if (!review) return;
  review.cards = review.cards.filter((one) => one !== card);
  keep();
  renderReview();
}

async function applyOne(card) {
  const problem = stillApplies(card, store);
  if (problem) return renderReview();
  if (await handlers.onApply?.(card, { show: true })) drop(card);
}

/**
 * Everything left that can be applied, in the order it was given, each as its
 * own undo step. Each is asked again whether it still holds just before its
 * turn, since the cards before it have changed the map it was checked against.
 */
async function applyAll() {
  let applied = 0;
  for (const card of [...(review?.cards ?? [])]) {
    if (isNote(card) || stillApplies(card, store)) continue;
    if (!await handlers.onApply?.(card, { show: false })) break;
    review.cards = review.cards.filter((one) => one !== card);
    applied += 1;
  }
  keep();
  renderReview();
  handlers.onStatus?.(applied
    ? `Applied ${applied} suggestion${applied === 1 ? '' : 's'} — Ctrl+Z undoes them one at a time`
    : 'Nothing could be applied');
}

function bringIn(pasted) {
  const { reply, problem } = parseReply(pasted);
  if (problem) return handlers.onStatus?.(problem, true);

  review = checkReply(reply, store, library?.skills ?? []);
  el('assistant-reply').value = '';
  keep();
  renderReview();
  // The cards are under everything it took to ask for them, a screen or more down.
  el('assistant-summary').scrollIntoView({ block: 'start', behavior: 'smooth' });
  const { length } = review.cards;
  handlers.onStatus?.(`${length} suggestion${length === 1 ? '' : 's'} to review`);
}

// --- the column -------------------------------------------------------------------

export function initAssistant(callbacks) {
  handlers = callbacks;

  const session = kept();
  chosen = session.chosen ?? null;
  byHand = session.byHand === true;
  review = session.review ?? null;
  el('assistant-input').value = session.input ?? '';
  el('assistant-input').addEventListener('input', keep);

  el('assistant-copy').addEventListener('click', async () => {
    const ask = asked();
    if (!ask) return;
    const prompt = buildPrompt(ask.parts);
    const done = await copy(prompt);
    handlers.onStatus?.(done
      ? `Copied the prompt, ${sized(prompt.length)} — paste it into the chat you use`
      : 'The browser would not copy it.', !done);
  });

  el('assistant-send').addEventListener('click', send);
  el('assistant-input').addEventListener('keydown', (event) => {
    if (chatting() && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send();
    }
  });
  el('assistant-forget').addEventListener('click', startOver);
  el('assistant-other').addEventListener('click', () => {
    byHand = !byHand;
    keep();
    renderAssistant();
  });

  el('assistant-check').addEventListener('click', () => bringIn(el('assistant-reply').value));
  el('assistant-apply-all').addEventListener('click', applyAll);
  el('assistant-clear').addEventListener('click', () => {
    if (review.cards.length > 3 && !confirm(`Take all ${review.cards.length} cards off the list?`)) return;
    review = null;
    keep();
    renderReview();
  });

  return session.showing === true;
}

/** Whether the column is the Assistant's. The first time it is, the skills are read. */
export async function showAssistant(next) {
  showing = next;
  keep();
  if (!showing) return;
  await loadLibrary();
  // An undescribed map is asked to describe itself first: every other prompt is
  // better for it.
  if (chosen === null) {
    if ((store.description ?? '').trim() === '') chosen = 'describe-the-business';
    else chosen = store.selection.id ? 'describe' : 'grill-the-boundaries';
    if (!skillNamed(chosen)) chosen = null;
  }
  renderAssistant();
}

export const assistantShowing = () => showing;

/** `model` is what the server says it is connected to — `{ host, model }` — and only ever says to an owner. */
export function setAssistantMode(mode) {
  editMode = mode.editMode;
  owner = mode.owner;
  connected = mode.owner ? mode.model ?? null : null;
  renderAssistant();
}

/**
 * Another map has been opened: its shapes are new records under new ids, and
 * the cards name ones that are gone — the same reason the undo history is
 * cleared at the same moment. What the model remembers was about that map, so
 * it goes with them.
 */
export function forgetReview() {
  review = null;
  remembered = [];
  exchange = null;
  keep();
  renderAssistant();
}

/** Follow the map: the subject moves with the selection, and a card can go stale under a change. */
export function renderAssistant(reason) {
  if (!showing || reason === 'live') return;
  renderAsk();
  renderReview();
}
