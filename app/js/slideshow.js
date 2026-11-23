// The slideshow: the map as a deck, a postcard a shape. Every area has one,
// then every domain in it, and after each domain every capability in that, in
// the order the map holds them (`slideDeck` in store.js) — so the deck is made
// of the map and there is nothing to keep in step with it. A postcard is a
// picture of the shape beside its words: what it is called, what it is, who
// owns it, who works on it, what it holds and what it is joined to; and over
// both, where it sits — /area/domain/capability — so that a slide met in the
// middle of a presentation says what it is a part of.
//
// It has two views, as a slide program has. The deck is where it is worked on:
// the slides in a column at the left, and the one in hand beside them, with its
// words as fields while the page is in Edit mode. They are the details panel's
// own fields, so a word changed on a slide is a word changed on the map, undone
// and saved as any other. Presenting is the one in hand and nothing else, full
// screen, stepped through with the arrow keys.
//
// The picture is the diagram's to draw (see `picture` in diagram.js), so a
// shape is on its slide exactly as it is on the map — unless the slide has
// been given a picture of its own, uploaded for it: a screenshot of the thing
// the shape stands for, a photograph, a sketch. That one is a file in
// data/pictures/, named by the shape as an icon is.

import {
  store, find, childrenOf, featuresOf, oneLine, membersOf, teamsOn, teamsThrough,
  endpointsOf, domainOfEnd, slideDeck, pathOf, rolesOn,
} from './store.js';
import { wordFields } from './details.js';
import { picture } from './diagram.js';
import { DEFAULT_POSTCARD, ROLE_ON_KINDS } from './rules.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const el = (id) => document.getElementById(id);
const dialog = el('slideshow');

let handlers = {};
/** Whether the page is in Edit mode: a slide's words are fields then, and words otherwise. */
let editMode = false;
/** Which view is up: the deck, or presenting. */
let view = 'deck';
/** The slide in hand, by what it is a slide of. Kept by id, so the deck can change under it. */
let current = null;
/** Whether presenting put the page into full screen, and so should take it out again. */
let wentFull = false;

export const slideshowOpen = () => dialog.open;

/** The deck, as the store reads it off the map: areas, their domains, their capabilities. */
const slides = slideDeck;

const sameSlide = (a, b) => a && b && a.kind === b.kind && a.id === b.id;

/** Where the slide in hand stands in the deck, or the first if it has gone. */
function place(deck) {
  const at = deck.findIndex((slide) => sameSlide(slide, current));
  return at < 0 ? 0 : at;
}

// --- what a postcard says ---------------------------------------------------------

const titles = (records) => records.map((record) => oneLine(record.title));
const unique = (list) => [...new Set(list)];

/** The other ends of the lines that reach a capability or a feature in it, by name. */
function joinedTo(capability) {
  const mine = new Set([capability.id, ...featuresOf(capability.id).map((feature) => feature.id)]);
  return unique(store.connectors.flatMap((connector) => {
    const [from, to] = endpointsOf(connector);
    if (!from || !to || mine.has(from.id) === mine.has(to.id)) return [];
    return [oneLine((mine.has(from.id) ? to : from).title)];
  }));
}

/** The other domains a domain's lines cross to, by name. */
function worksWith(domain) {
  return unique(store.connectors.flatMap((connector) => {
    const ends = [domainOfEnd(connector.fromKind, connector.fromId), domainOfEnd(connector.toKind, connector.toId)];
    if (!ends.includes(domain.id) || ends[0] === ends[1]) return [];
    const other = find('domain', ends.find((id) => id !== domain.id));
    return other ? [oneLine(other.title)] : [];
  }));
}

/** The teams of a shape: the ones on it, and after them the ones it has through its domain or its area. */
const teamNames = (kind, record) => unique([
  ...titles(teamsOn(kind, record.id)),
  ...teamsThrough(kind, record).map(({ team }) => oneLine(team.title)),
]);

/**
 * What a postcard says beside the shape's own words: `[label, value]`, a value
 * a string or a list of names. Only what there is something to say about — a
 * shape nobody owns has no Owner row, on a slide meant to be read at a glance.
 */
function facts(kind, record) {
  // Where it sits is not among them: the path over the slide says that.
  const holds = {
    area: () => {
      const held = (wanted) => titles(membersOf(record.id).filter((member) => member.kind === wanted).map((member) => member.record));
      return [['Domains', held('domain')], ['Capabilities', held('capability')], ['Touchpoints', held('touchpoint')]];
    },
    domain: () => [['Capabilities', titles(childrenOf(record.id))], ['Works with', worksWith(record)]],
    capability: () => [['Features', titles(featuresOf(record.id))], ['Connected to', joinedTo(record)]],
  };
  // Who leads it, a discipline a row, each with the role they hold.
  const led = (roleKind) => rolesOn(roleKind, kind, record.id)
    .map((role) => (role.type ? `${oneLine(role.title)} — ${role.type}` : oneLine(role.title)));
  const rows = [
    ['Owner', record.owner || null],
    ...(ROLE_ON_KINDS.includes(kind) ? [['Product', led('productRole')], ['Engineering', led('engineeringRole')]] : []),
    ['Teams', teamNames(kind, record)],
    ...holds[kind](),
  ];
  return rows
    .map(([label, value]) => [label, typeof value === 'string' ? oneLine(value) : value])
    .filter(([, value]) => (Array.isArray(value) ? value.length > 0 : Boolean(value)));
}

const KIND_SAYS = { area: 'Area', domain: 'Domain', capability: 'Capability' };

/**
 * Where the slide's shape sits, over the slide: /area/domain/capability, each
 * a name, ending in the shape itself. A slide is met out of order as often as
 * in it, and this is what says what it is a part of.
 */
function showPath(kind, record) {
  el('slide-path').replaceChildren(...pathOf(kind, record).flatMap((step, index, steps) => {
    const slash = document.createElement('span');
    slash.className = 'slide__slash';
    slash.textContent = '/';
    const name = document.createElement('span');
    name.className = `slide__step${index === steps.length - 1 ? ' slide__step--here' : ''}`;
    name.textContent = oneLine(step.record.title);
    return [slash, name];
  }));
}

function factsNode(kind, record) {
  const list = document.createElement('dl');
  list.className = 'slide__facts';
  for (const [label, value] of facts(kind, record)) {
    const term = document.createElement('dt');
    term.textContent = label;
    const says = document.createElement('dd');
    if (Array.isArray(value)) {
      says.className = 'slide__names';
      says.append(...value.map((name) => {
        const chip = document.createElement('span');
        chip.className = 'slide__name';
        chip.textContent = name;
        return chip;
      }));
    } else {
      says.textContent = value;
    }
    list.append(term, says);
  }
  return list;
}

/** The words of a slide as it is read: what kind of thing, its name, what it is, and the facts. */
function readWords(kind, record) {
  const kicker = document.createElement('p');
  kicker.className = 'slide__kind';
  kicker.textContent = record.type ? `${KIND_SAYS[kind]} · ${record.type}` : KIND_SAYS[kind];
  const title = document.createElement('h3');
  title.className = 'slide__title';
  title.textContent = oneLine(record.title);
  const nodes = [kicker, title];
  if (record.description) {
    const says = document.createElement('p');
    says.className = 'slide__says';
    says.textContent = record.description;
    nodes.push(says);
  }
  return [...nodes, factsNode(kind, record)];
}

/** The three things a slide may show of its shape, as the toggle names them. */
const PICTURES = [['shape', 'The shape'], ['context', 'With its neighbours'], ['picture', 'Uploaded']];

/**
 * Take a file as the slide's picture: stored, named on the shape, and shown,
 * as one change — so one Ctrl+Z is back at what the slide showed before, and
 * the file that was there before it, if any, is the shape's again.
 */
async function uploadPicture(kind, record, file, button) {
  const says = button.textContent;
  button.disabled = true;
  button.textContent = 'Uploading…';
  try {
    const name = await handlers.onPictureUpload?.(file);
    if (!name) throw new Error('The picture could not be stored.');
    handlers.onPatch?.(kind, record.id, { picture: name, postcard: 'picture' }, 'Changing the picture');
  } catch (error) {
    handlers.onStatus?.(error.message ?? String(error), true);
    button.disabled = false;
    button.textContent = says;
  }
}

/**
 * What the slide shows of its shape: the toggle, and under it the picture
 * uploaded for the slide — its name, and the button that uploads one or puts
 * another in its place. *Uploaded* pressed with no picture yet asks for one,
 * since there is nothing to show until there is.
 */
function pictureField(kind, record) {
  const picked = record.postcard ?? DEFAULT_POSTCARD;

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.svg,.png,.jpg,.jpeg,.webp,image/*';
  file.hidden = true;
  file.name = 'slide-picture';

  const upload = document.createElement('button');
  upload.type = 'button';
  upload.className = 'btn btn--chip';
  upload.textContent = record.picture ? 'Replace…' : 'Upload…';
  upload.title = record.picture
    ? 'Put another picture in place of this one'
    : 'Upload a picture for this slide: a screenshot, a photograph, a sketch';
  upload.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (chosen) uploadPicture(kind, record, chosen, upload);
  });

  const toggle = document.createElement('span');
  toggle.className = 'toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', 'Picture');
  for (const [value, label] of PICTURES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'btn btn--chip toggle__chip';
    chip.textContent = label;
    chip.setAttribute('aria-pressed', String(value === picked));
    chip.addEventListener('click', () => {
      if (value === picked) return;
      if (value === 'picture' && !record.picture) file.click();
      else handlers.onPatch?.(kind, record.id, { postcard: value }, 'Changing the picture');
    });
    toggle.append(chip);
  }

  const named = document.createElement('span');
  named.className = 'slide__file';
  named.textContent = record.picture ?? 'No picture uploaded yet.';
  const row = document.createElement('div');
  row.className = 'slide__upload';
  row.append(named, upload, file);

  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const caption = document.createElement('span');
  caption.className = 'field__label';
  caption.textContent = 'Picture';
  wrapper.append(caption, toggle, row);
  return wrapper;
}

/**
 * The words of a slide as it is worked on: the shape's own fields, then what
 * the picture shows, then the facts as they will read. The facts are not
 * fields: who a shape's teams are, and what it holds, are said on the map.
 */
function editWords(kind, record) {
  const form = document.createElement('div');
  form.className = 'slide__fields';
  form.append(...wordFields(kind, record), pictureField(kind, record));
  return [form, factsNode(kind, record)];
}

// --- showing ----------------------------------------------------------------------

/**
 * The slide's picture, at whatever size the slide has for it: the one uploaded
 * for it, where the slide is set to show that and there is one, and otherwise
 * the shape as the diagram draws it.
 */
function showPicture(slide, record) {
  const holder = el('slide-picture');
  const wanted = record.postcard ?? DEFAULT_POSTCARD;
  if (wanted === 'picture' && record.picture) {
    // The same picture is left as it is: a slide is shown again on every
    // change to the map, and an <img> made afresh each time would blink.
    if (holder.firstElementChild?.dataset.picture === record.picture) return;
    const image = document.createElement('img');
    image.className = 'slide__img';
    image.alt = '';
    image.dataset.picture = record.picture;
    image.src = handlers.pictureUrl?.(record.picture) ?? '';
    holder.replaceChildren(image);
    return;
  }
  // Set to show a picture nobody has uploaded — a file edited by hand — it shows the shape.
  const made = picture(slide.kind, slide.id, wanted === 'picture' ? DEFAULT_POSTCARD : wanted);
  if (!made) {
    holder.replaceChildren();
    return;
  }
  const { box } = made;
  const [wide, tall] = [box.maxX - box.minX, box.maxY - box.minY];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'slide__svg');
  svg.setAttribute('viewBox', `${box.minX} ${box.minY} ${wide} ${tall}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.append(...made.nodes);
  holder.replaceChildren(svg);
  // The stylesheet holds a line to a width on screen, and needs the scale to do it.
  const room = holder.getBoundingClientRect();
  svg.style.setProperty('--k', String(Math.min(room.width / wide, room.height / tall) || 1));
}

/** The deck at the left: a row a slide, a capability set in under its domain. */
function showList(deck, at) {
  el('slideshow-list').replaceChildren(...deck.map((slide, index) => {
    const record = find(slide.kind, slide.id);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `slideshow__row slideshow__row--${slide.kind}`;
    // Set in by how deep it sits: a capability under its domain under its area.
    row.style.setProperty('--depth', String(pathOf(slide.kind, record).length - 1));
    row.setAttribute('aria-current', String(index === at));
    row.textContent = oneLine(record?.title ?? '');
    row.addEventListener('click', () => go(index));
    return row;
  }));
  el('slideshow-list').querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
}

/** Whether the caret is in one of the slide's fields: they are not rebuilt under it. */
const typing = () => el('slide-words').contains(document.activeElement)
  && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);

/**
 * Show the deck as the map stands. Called whenever the map changes, since a
 * slide is made of the map; a change that came from typing into the slide
 * redraws the picture and the list, and leaves the fields under the caret be.
 */
export function renderSlideshow() {
  if (!dialog.open) return;
  const deck = slides();
  dialog.dataset.view = view;
  dialog.dataset.empty = String(deck.length === 0);

  const mayEdit = handlers.mayEdit?.() === true;
  const editing = view === 'deck' && editMode;
  const [editChip, presentChip] = [el('slideshow-edit'), el('slideshow-present')];
  editChip.hidden = !mayEdit;
  editChip.setAttribute('aria-pressed', String(editing));
  presentChip.setAttribute('aria-pressed', String(view === 'present'));
  presentChip.disabled = deck.length === 0;

  if (deck.length === 0) {
    el('slideshow-list').replaceChildren();
    el('slide-picture').replaceChildren();
    el('slide-path').replaceChildren();
    const none = document.createElement('p');
    none.className = 'slide__says';
    none.textContent = 'There is nothing to show yet: a slide is an area, a domain or a capability, and this map has none.';
    el('slide-words').replaceChildren(none);
    el('slideshow-at').textContent = '';
    return;
  }

  const at = place(deck);
  current = deck[at];
  const record = find(current.kind, current.id);
  el('slideshow-at').textContent = `${at + 1} / ${deck.length}`;
  el('slideshow-prev').disabled = at === 0;
  el('slideshow-next').disabled = at === deck.length - 1;
  showList(deck, at);
  el('slide').dataset.kind = current.kind;
  showPath(current.kind, record);
  if (!typing()) el('slide-words').replaceChildren(...(editing ? editWords(current.kind, record) : readWords(current.kind, record)));
  showPicture(current, record);
}

/** Go to a slide by where it stands in the deck, held to the deck's two ends. */
function go(index) {
  const deck = slides();
  if (deck.length === 0) return;
  // A field left with the caret in it would keep the last slide's words on the next.
  if (typing()) document.activeElement.blur();
  current = deck[Math.min(deck.length - 1, Math.max(0, index))];
  renderSlideshow();
}

const step = (by) => go(place(slides()) + by);

// --- the two views ----------------------------------------------------------------

/**
 * Present: the slide in hand and nothing else, full screen where the browser
 * allows it. A browser that refuses — it may, off a keyboard shortcut — still
 * presents, filling the window instead.
 */
function present() {
  if (slides().length === 0) return;
  view = 'present';
  wentFull = false;
  dialog.requestFullscreen?.().then(() => { wentFull = true; }).catch(() => {});
  renderSlideshow();
  dialog.focus();
}

/** Back to the deck, and out of full screen if presenting went into it. */
function toDeck() {
  view = 'deck';
  if (wentFull && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  wentFull = false;
  renderSlideshow();
}

/** Open the deck, on the slide of the shape that is selected if it has one. */
export function openSlideshow() {
  const { type, id } = store.selection;
  // A feature's slide is its capability's: a feature is on that postcard.
  const picked = type === 'feature' ? { kind: 'capability', id: find('feature', id)?.capabilityId } : { kind: type, id };
  if (slides().some((slide) => sameSlide(slide, picked))) current = picked;
  view = 'deck';
  if (!dialog.open) dialog.showModal();
  renderSlideshow();
}

export function closeSlideshow() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  wentFull = false;
  view = 'deck';
  if (dialog.open) dialog.close();
}

/** The page has gone into Edit mode or out of it: the slide's words are fields, or words. */
export function setSlideshowEditMode(next) {
  editMode = next;
  renderSlideshow();
}

/**
 * Wire the slideshow. `mayEdit` says whether whoever is looking may edit the
 * map at all; `onEdit` asks the page to go into Edit mode; `onPatch` is a
 * change to the map, made as every other is.
 */
export function initSlideshow(callbacks) {
  handlers = callbacks;

  el('slideshow-toggle').addEventListener('click', openSlideshow);
  el('slideshow-close').addEventListener('click', closeSlideshow);
  el('slideshow-prev').addEventListener('click', () => step(-1));
  el('slideshow-next').addEventListener('click', () => step(1));
  el('slideshow-present').addEventListener('click', () => (view === 'present' ? toDeck() : present()));
  // Edit and Present are the two views, and the one pressed is the one up.
  // Edit is the deck with its words as fields: from presenting it is the way
  // back, and with the page still browsing it turns editing on — which is
  // left the way it always is, by Save or Cancel in the header.
  el('slideshow-edit').addEventListener('click', () => {
    if (view === 'present') toDeck();
    if (!editMode) handlers.onEdit?.();
  });

  // Presenting, a press on the slide is the next slide, as it is in any slide program.
  el('slide').addEventListener('click', () => { if (view === 'present') step(1); });

  // Listened for on the page, not on the dialog. A slide's fields are rebuilt
  // as the map changes, and a field rebuilt while it had the focus leaves the
  // focus on nothing in particular: keys pressed then never reach the dialog,
  // and the arrows would stop stepping for no reason anyone could see.
  document.addEventListener('keydown', (event) => {
    if (!dialog.open) return;
    const inField = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    if (event.key === 'Escape') {
      // Esc backs out one step at a time: out of a field, out of presenting, out of the slideshow.
      event.preventDefault();
      if (inField) event.target.blur();
      else if (view === 'present') toDeck();
      else closeSlideshow();
      return;
    }
    if (inField || event.metaKey || event.ctrlKey || event.altKey) return;
    const by = {
      ArrowRight: 1, ArrowDown: 1, PageDown: 1, ArrowLeft: -1, ArrowUp: -1, PageUp: -1,
      // Space steps on only while presenting: in the deck it presses whatever button has the focus.
      ...(view === 'present' ? { ' ': 1 } : {}),
    }[event.key];
    if (by) {
      event.preventDefault();
      step(by);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      go(event.key === 'Home' ? 0 : Infinity);
    }
  });
  // The dialog's own Esc is answered above; this keeps the browser from shutting it over that.
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  // Full screen left by the browser's own way out — Esc, there, belongs to the browser — is presenting left.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && wentFull && view === 'present') {
      wentFull = false;
      view = 'deck';
      renderSlideshow();
    }
  });
  // The picture is drawn for the room it has, which a resize changes.
  window.addEventListener('resize', () => { if (dialog.open) renderSlideshow(); });
}
