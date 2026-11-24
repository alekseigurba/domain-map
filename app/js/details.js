// The details sidebar: properties of whatever is selected, wherever it was
// selected. Two sections — what the thing *is* (metadata), then how it *looks*.

import { fillNames, offerAsTyped } from './name-lookup.js';
import {
  store, selected, find, patchLocal, connectorLabel, slugFor, oneLine, withBreaks,
  typesFor, layerOf, layerTitle, connectorScope, CONNECTOR_NAMES,
  areaOf, membersOf, mayJoinArea, featuresOf, domainOfEnd, teamsOn, teamsThrough, teamMembers,
  rolesOn, roleMembers, listOf,
} from './store.js';
import {
  AREA_SHAPE, TEAM_MEMBER_KINDS, ROLE_KINDS, ROLE_ON_KINDS, cardPlaced, FIGURES, figureLabel,
} from './rules.js';
import {
  COLORS, FONT_SIZES, CAPABILITY_FONT_SIZES, FONT_WEIGHTS, SIZE_SCALES, TITLE_SCALES,
  LINE_STYLES, DEFAULT_FONT_WEIGHT,
  DEFAULT_CAPABILITY_FONT_WEIGHT, DEFAULT_OPACITY, DEFAULT_FONT_SIZE,
  ICON_PLACEMENTS, DEFAULT_ICON_PLACEMENT,
  MIN_ICON_WEIGHT, MAX_ICON_WEIGHT, DEFAULT_ICON_WEIGHT,
} from './geometry.js';

const container = document.getElementById('details');

let handlers = {};
let debounce = null;
let editingId = null; // don't rebuild the panel under the cursor while typing
let editMode = false; // View mode: fields still show values, but cannot change them

export function initDetails(callbacks) {
  handlers = callbacks;
}

/** Switch between browsing (nothing typed is kept) and editing (fields save). */
export function setEditMode(next) {
  editMode = next;
  // Each mode builds its fields differently, so the panel is rebuilt whole —
  // caret in a box or not, which is otherwise reason enough to leave it alone.
  // Without this, a field left focused while browsing would still be sitting
  // there in Edit mode, taking words that go nowhere.
  editingId = null;
  renderDetails();
}

/**
 * The key a line's Shape section is kept open under. It is headed Shape like
 * any other, and is a section of its own to `opened`: a line has no name to
 * come first, and how it is drawn — curved or straight, pinned or not — is most
 * of what there is to set on one, so it starts open where a shape's starts shut.
 */
const LINE_SHAPE = 'Line shape';
/** The sections that only say how a thing is drawn, and so have nothing to offer while browsing. */
const SHAPE_KEYS = new Set(['Shape', LINE_SHAPE]);

/** Which accordion panels are open. Sticky across selections, like a preference.
 *  Shape starts shut: what a thing is called matters before how it is drawn. */
const opened = new Set(['Metadata', 'Holds', LINE_SHAPE]);

/**
 * `key` names the panel in `opened` wherever its heading changes with the
 * selection. Shape has nothing to offer while browsing — nothing on it can be
 * touched — so it drops out of the panel entirely rather than sit there shut.
 * The other section stays, but loses the fold: with only one section left,
 * a control to collapse it would just be one more click to see the map.
 */
function section(title, fields, key = title) {
  if (!editMode && SHAPE_KEYS.has(key)) return null;

  const wrapper = document.createElement('section');
  wrapper.className = 'section';
  const isOpen = !editMode || opened.has(key);

  const heading = document.createElement(editMode ? 'button' : 'span');
  heading.className = `section__title${editMode ? '' : ' section__title--static'}`;
  heading.textContent = title;
  if (editMode) {
    heading.type = 'button';
    heading.setAttribute('aria-expanded', String(isOpen));
    heading.addEventListener('click', () => {
      if (opened.has(key)) opened.delete(key);
      else opened.add(key);
      renderDetails();
    });
  }

  wrapper.appendChild(heading);
  if (isOpen) {
    const body = document.createElement('div');
    body.className = 'section__body';
    body.append(...fields);
    wrapper.appendChild(body);
  }
  return wrapper;
}

/**
 * The control a caption can name. The helpers below return either the control
 * itself or a wrapper holding it — the icon picker and the slider each keep
 * theirs one level in — and some fields hold no control at all: a swatch grid
 * is buttons, a read-only value is text.
 */
const LABELABLE = 'input:not([hidden]), select, textarea';
const controlIn = (node) =>
  (node.matches?.(LABELABLE) ? node : node.querySelector?.(LABELABLE)) ?? null;

/** The controls are built without ids; a caption needs one to point `for` at. */
let fieldSeq = 0;

/** `inline` puts a short control beside its label instead of under it. */
function field(label, control, { inline = false } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = `field${inline ? ' field--inline' : ''}`;

  // A <label> has to name a form control. Over a swatch grid or a value that is
  // only read, there is none to name, so the caption is plain text instead.
  const named = controlIn(control);
  const caption = document.createElement(named ? 'label' : 'span');
  caption.className = 'field__label';
  caption.textContent = label;
  if (named) {
    named.id ||= `field-${++fieldSeq}`;
    named.name ||= named.id;
    caption.htmlFor = named.id;
  }

  wrapper.append(caption, control);
  return wrapper;
}

/** How far a text area may grow before it scrolls instead — lines, not pixels. */
const MAX_AREA_ROWS = 8;

/**
 * A text area as tall as what it holds: never shorter than the rows it was
 * built with, never taller than MAX_AREA_ROWS, and scrolling past that. It
 * measures the element, so it can only work on one that is in the page and
 * showing — which is why the fitting is done after the panel is put in, and
 * again when a folded panel is opened.
 */
function fitArea(area) {
  // Folded away the panel is display:none, where there is nothing to measure.
  if (area.scrollHeight === 0) return;

  const style = getComputedStyle(area);
  const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.35;
  // scrollHeight counts the padding but not the border; a border-box height wants both.
  const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  const tall = (rows) => rows * line
    + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + border;

  area.style.height = 'auto'; // let it shrink back as the text is cut down
  const wanted = area.scrollHeight + border;
  const most = tall(MAX_AREA_ROWS);
  area.style.height = `${Math.min(Math.max(wanted, tall(area.rows)), most)}px`;
  area.style.overflowY = wanted > most ? 'auto' : 'hidden';
}

/** Every text area in the panel, sized to what it holds. */
export function fitAreas() {
  container.querySelectorAll('textarea').forEach(fitArea);
}

// A narrower panel wraps the same words into more lines, so the boxes follow it.
window.addEventListener('resize', fitAreas);

/**
 * Text that writes as you type: locally at once, to the server on a delay.
 * `shown` turns the stored value into what the field holds, and `stored` turns
 * what is typed back, given the value as it stood when the field took focus.
 *
 * In View mode the box is still a box — the caret goes in it, text is selected,
 * copied and scrolled, and typing works — but nothing typed leaves it: the map
 * is not touched, nothing is saved, and the stored words come back the moment
 * the field is left. Browsing cannot change the map, and now it does not have
 * to be inert to say so.
 */
function liveText(type, record, key, {
  multiline = false, rows = 3, onInput, shown = (value) => value, stored = (typed) => typed,
} = {}) {
  const input = document.createElement(multiline ? 'textarea' : 'input');
  input.className = `field__input${multiline ? ' field__input--area' : ''}`;
  input.value = shown(record[key] ?? '');
  if (multiline) input.rows = rows;
  // Titles are capped whichever element holds them; descriptions run long.
  if (!multiline || key === 'title') input.maxLength = 200;

  let before = record[key] ?? '';
  const value = () => stored(input.value, before);
  // What the map held before the words now being sent. The field writes to the
  // map as it is typed into, so by the time a change is handed over to be
  // recorded the record already says the new thing: asked then what it used to
  // say, it answers with what was just typed, and undo put back the very words
  // it was meant to take away. So the field keeps what it last handed over.
  let kept = before;
  const send = () => {
    const now = value();
    // Leaving a field that has nothing new in it — one already handed over on
    // a pause, or never typed into — is no change: handed over all the same,
    // it was a step of undo that undid nothing, in front of the one that did.
    if (now === kept) return;
    handlers.onPatch?.(type, record.id, { [key]: now }, { [key]: kept });
    kept = now;
  };

  if (!editMode) {
    input.classList.add('field__input--quiet');
    input.title = 'Browsing: what you type here is not saved. Press Edit to change the map.';
    // The box grows as it is typed into like any other, so what is being read
    // is never cut off — it just has nowhere to go from there.
    input.addEventListener('input', () => { if (multiline) fitArea(input); });
    // Held while the caret is in the field, so a save landing elsewhere does
    // not rebuild the panel under it. Leaving puts the record's own words back.
    input.addEventListener('focus', () => { editingId = record.id; });
    input.addEventListener('blur', () => {
      editingId = null;
      input.value = shown(record[key] ?? '');
      if (multiline) fitArea(input);
    });
    return input;
  }

  input.addEventListener('input', () => {
    if (multiline) fitArea(input);
    patchLocal(type, record.id, { [key]: value() });
    onInput?.();
    handlers.onLive?.();
    clearTimeout(debounce);
    debounce = setTimeout(send, 400);
  });
  input.addEventListener('focus', () => {
    editingId = record.id;
    before = record[key] ?? '';
    kept = before;
  });
  input.addEventListener('blur', () => {
    editingId = null;
    clearTimeout(debounce);
    send();
  });
  return input;
}

// --- who owns it -------------------------------------------------------------

/**
 * The people an Owner box offers: everyone on the list, whatever they may do —
 * a domain's owner is as often a viewer of the map as an editor of it. Read
 * once and kept, since the panel is rebuilt on every selection; Users & access
 * asks for it again when it changes someone. A viewer is not shown the list,
 * and gets a plain box. As a name is typed, the organisation's directory is
 * asked as well (name-lookup.js), for people who have not signed in yet.
 *
 * Only someone on the list has an id for an owner to carry; a name from the
 * directory is offered, and picked it is a name like any typed one, until its
 * person signs in and is on the list.
 */
let people = null;
let loadingPeople = null;

function loadPeople() {
  loadingPeople ??= (async () => {
    try {
      people = await handlers.onPeople?.() ?? [];
    } catch {
      people = [];
    }
    fillPeopleOptions();
    renderDetails();
  })();
  return loadingPeople;
}

/** The list has changed under the page: read it again, and redraw whatever names someone. */
export async function reloadPeople() {
  loadingPeople = null;
  await loadPeople();
}

/** The people list as a name box offers it, before anything is typed. */
const offered = () => people ?? [];

/**
 * The people list, for a view outside the panel that names people — the
 * Roles grid. It is what the Owner box offers, read once for both.
 */
export async function peopleList() {
  await loadPeople();
  return offered();
}

/** The names behind every Owner box and Name box: one datalist in the page, filled here. */
function fillPeopleOptions() {
  fillNames('people-options', offered());
}

const personById = (id) => (id ? (people ?? []).find((person) => person.id === id) ?? null : null);

/** The one person called this, if exactly one is: two of a name, and neither is picked by typing it. */
function personNamed(name) {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const called = (people ?? []).filter((person) => person.name.trim().toLowerCase() === wanted);
  return called.length === 1 ? called[0] : null;
}

/** Every element that can name an owner, with the list it is kept in. */
const OWNED = () => [
  ['area', store.areas], ['domain', store.domains], ['capability', store.capabilities],
  ['feature', store.features], ['touchpoint', store.touchpoints], ['actor', store.actors],
];

/**
 * Every owner picked from the list, given the name the list has now. Called
 * before a save, so the file catches up with a person renamed in the
 * directory. Silent: the file following the directory is nobody's change,
 * and nothing to undo.
 */
export function freshenOwners() {
  if (!people) return;
  for (const [kind, list] of OWNED()) {
    for (const record of list ?? []) {
      const person = personById(record.ownerId);
      if (person && person.name !== record.owner) patchLocal(kind, record.id, { owner: person.name });
    }
  }
}

/**
 * Who owns the thing: a name, picked from the list or typed. The box is a text
 * field with the list behind it, so a team or someone outside the directory
 * can still be typed. A name that is one person's on the list carries their
 * id with it, so the map still knows who it meant after they are renamed; a
 * name nobody on the list has carries no id. Under the box, who the id names
 * — their address, or that they are no longer on the list.
 */
function ownerField(type, record) {
  if (people === null) loadPeople();

  const picked = personById(record.ownerId);
  const shown = () => picked?.name ?? record.owner ?? '';

  const input = document.createElement('input');
  input.className = 'field__input';
  input.maxLength = 200;
  input.setAttribute('list', 'people-options');
  offerAsTyped(input, 'people-options', offered);
  input.value = shown();

  const hint = document.createElement('p');
  hint.className = 'field__hint';
  const sayWho = () => {
    const person = personById(record.ownerId);
    hint.textContent = person
      ? (person.email && person.email !== person.name ? person.email : '')
      : (record.ownerId && people ? 'Not on the people list any more.' : '');
    hint.hidden = !hint.textContent;
  };
  sayWho();

  const wrapper = document.createElement('div');
  wrapper.className = 'field__stack';
  wrapper.append(input, hint);

  if (!editMode) {
    input.classList.add('field__input--quiet');
    input.title = 'Browsing: what you type here is not saved. Press Edit to change the map.';
    input.addEventListener('focus', () => { editingId = record.id; });
    input.addEventListener('blur', () => {
      editingId = null;
      input.value = shown();
    });
    return wrapper;
  }

  const change = () => ({ owner: input.value, ownerId: personNamed(input.value)?.id ?? null });
  // Who the map said owned it before the name now being sent, as a typed field
  // keeps what it last handed over: the record already holds the new name.
  let kept = { owner: record.owner ?? '', ownerId: record.ownerId ?? null };
  const send = () => {
    const now = change();
    // Nothing new since it was last handed over: no change, and no step of undo for one.
    if (now.owner === kept.owner && now.ownerId === kept.ownerId) return;
    handlers.onPatch?.(type, record.id, now, kept);
    kept = now;
  };
  input.addEventListener('input', () => {
    patchLocal(type, record.id, change());
    sayWho();
    handlers.onLive?.();
    clearTimeout(debounce);
    debounce = setTimeout(send, 400);
  });
  input.addEventListener('focus', () => {
    editingId = record.id;
    kept = { owner: record.owner ?? '', ownerId: record.ownerId ?? null };
  });
  input.addEventListener('blur', () => {
    editingId = null;
    clearTimeout(debounce);
    send();
  });
  return wrapper;
}

/** What holds the caret while the map's own description is being typed: no record has this id. */
const THE_MAP = 'the-map';

/**
 * What the business is: the map's own description, which belongs to no shape.
 * It is written on a pause and on leaving the field, and each write is the
 * whole change since the last one, so Ctrl-Z steps back through the pauses.
 */
function mapDescription() {
  const area = document.createElement('textarea');
  area.className = 'field__input field__input--area';
  area.rows = 4;
  area.maxLength = 2000;
  area.value = store.description ?? '';
  area.placeholder = 'The industry, who the customers are, what is in scope and what is not, '
    + 'the standards the map is weighed against';

  const hold = () => { editingId = THE_MAP; };
  if (!editMode) {
    area.classList.add('field__input--quiet');
    area.title = 'Browsing: what you type here is not saved. Press Edit to change the map.';
    area.addEventListener('input', () => fitArea(area));
    area.addEventListener('focus', hold);
    area.addEventListener('blur', () => {
      editingId = null;
      area.value = store.description ?? '';
      fitArea(area);
    });
    return area;
  }

  const write = () => {
    clearTimeout(debounce);
    if (area.value !== (store.description ?? '')) handlers.onMapPatch?.({ description: area.value });
  };
  area.addEventListener('input', () => {
    fitArea(area);
    clearTimeout(debounce);
    debounce = setTimeout(write, 400);
  });
  area.addEventListener('focus', hold);
  area.addEventListener('blur', () => {
    editingId = null;
    write();
  });
  return area;
}

/**
 * The colours a shape may wear. This grid only ever paints the shape; editing
 * the palette happens in its own modal (palette.js), so that "choose a colour
 * for this capability" and "change what that colour is" are never the same
 * click.
 */
function swatches(type, record) {
  const grid = document.createElement('div');
  grid.className = 'swatches';

  COLORS.forEach((color, i) => {
    const button = document.createElement('button');
    button.className = 'swatch';
    button.type = 'button';
    button.style.background = color;
    button.title = `Color ${i + 1}`;
    button.setAttribute('aria-pressed', String(record.colorIndex === i + 1));
    button.addEventListener('click', () => handlers.onPatch?.(type, record.id, { colorIndex: i + 1 }));
    grid.appendChild(button);
  });
  return grid;
}

function select(options, value, onChange) {
  const element = document.createElement('select');
  element.className = 'field__select';
  for (const option of options) {
    const node = document.createElement('option');
    node.value = String(option.value);
    node.textContent = option.label;
    node.selected = option.value === value;
    element.appendChild(node);
  }
  element.addEventListener('change', () => onChange(element.value));
  return element;
}

/**
 * The icons on offer: the files in data/icons/. Read once and kept, since the
 * panel is rebuilt on every selection and the folder rarely changes; an upload
 * refreshes it.
 */
let iconNames = null;

async function loadIcons({ refresh = false } = {}) {
  if (iconNames && !refresh) return iconNames;
  try {
    iconNames = await handlers.onIcons?.() ?? [];
  } catch {
    iconNames = [];
  }
  return iconNames;
}

/**
 * Pick an icon for a capability, or add one to the folder to pick from. The map
 * keeps the file name only — the file itself lives in data/icons/, which is why
 * an exported map names its icons rather than carrying them.
 */
const iconField = (type, record) =>
  iconPicker(record.icon, (name) => patch(type, record, { icon: name }), { figures: ROLE_KINDS.includes(type) });

/**
 * The picker itself: a preview, the library as a list, and a button that adds a
 * file to the library and picks it. `current` is the name held now, or none,
 * and `onPick` is told the name chosen — empty for none.
 */
function iconPicker(current, onPick, { figures = false } = {}) {
  const record = { icon: current ?? null };
  const wrapper = document.createElement('div');
  wrapper.className = 'icon-picker';

  const preview = document.createElement('span');
  preview.className = 'icon-picker__preview';
  const paint = (name) => {
    preview.replaceChildren();
    if (!name) return;
    const image = document.createElement('img');
    image.src = handlers.iconUrl(name);
    image.alt = '';
    preview.appendChild(image);
  };
  paint(record.icon);

  const chooser = document.createElement('select');
  chooser.className = 'field__select';
  const choice = (value, label) => {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    node.selected = value === (record.icon ?? '');
    return node;
  };
  const fill = (names) => {
    chooser.replaceChildren(choice('', 'None'));
    if (!figures) {
      chooser.append(...names.map((name) => choice(name, name)));
      return;
    }
    // For a person the app's own figures come first, under a heading of their
    // own: they are who most cards wear, and they are there before anything
    // has been added to the library.
    const shelf = (label, options) => {
      if (options.length === 0) return;
      const group = document.createElement('optgroup');
      group.label = label;
      group.append(...options);
      chooser.append(group);
    };
    shelf('Figures', FIGURES.map((name) => choice(name, figureLabel(name))));
    shelf('Library', names.filter((name) => !FIGURES.includes(name)).map((name) => choice(name, name)));
  };
  fill(iconNames ?? (record.icon ? [record.icon] : []));
  if (!iconNames) loadIcons().then(fill);

  chooser.addEventListener('change', () => {
    // Empty is how "no icon" reaches the store, which reads it as a clear.
    onPick(chooser.value);
    paint(chooser.value);
  });

  const upload = document.createElement('button');
  upload.className = 'btn btn--chip';
  upload.type = 'button';
  upload.textContent = 'Add…';
  upload.title = 'Add an icon file to the library';

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = '.svg,.png,.jpg,.jpeg,.webp,image/*';
  // Hidden, so the caption above skips it: it has to carry its own name.
  file.id = 'icon-upload';
  file.name = 'icon-upload';
  file.hidden = true;
  upload.addEventListener('click', () => file.click());

  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;

    upload.disabled = true;
    upload.textContent = 'Adding…';
    try {
      const name = await handlers.onIconUpload?.(chosen);
      if (!name) throw new Error('The icon could not be added.');

      await loadIcons({ refresh: true });
      fill(iconNames);
      chooser.value = name;
      onPick(name);
      paint(name);
    } catch (error) {
      handlers.onStatus?.(error.message ?? String(error), true);
    } finally {
      upload.disabled = false;
      upload.textContent = 'Add…';
    }
  });

  wrapper.append(preview, chooser, upload, file);
  return wrapper;
}

/**
 * How heavy an SVG icon's lines are drawn, as a multiple of what the file says.
 * Here, under the picker, rather than among the shape's controls: for now it is
 * a way to make a fine-lined icon read on the map without redrawing the file,
 * and it belongs beside the file it is making up for.
 */
function iconWeightField(type, record) {
  return field('Icon weight', slider(
    {
      min: MIN_ICON_WEIGHT,
      max: MAX_ICON_WEIGHT,
      step: 0.25,
      value: record.iconWeight ?? DEFAULT_ICON_WEIGHT,
      format: (v) => `${v}×`,
    },
    (value) => patch(type, record, { iconWeight: value }),
  ));
}

const PLACEMENT_LABELS = { top: 'Top', left: 'Left', bottom: 'Bottom', right: 'Right' };

/** Which side of the title the icon sits on — or, for an actor, the figure. */
function iconPlacementField(type, record) {
  return field('Icon placement', select(
    ICON_PLACEMENTS.map((value) => ({ value, label: PLACEMENT_LABELS[value] })),
    record.iconPlacement ?? DEFAULT_ICON_PLACEMENT,
    (value) => patch(type, record, { iconPlacement: value }),
  ));
}

/** A slider that shows its current value and writes on release. */
function slider({ min, max, step, value, format }, onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'slider';

  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'slider__input';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const readout = document.createElement('span');
  readout.className = 'slider__value';
  readout.textContent = format(value);

  input.addEventListener('input', () => { readout.textContent = format(Number(input.value)); });
  input.addEventListener('change', () => onChange(Number(input.value)));

  wrapper.append(input, readout);
  return wrapper;
}

const patch = (type, record, changes) => handlers.onPatch?.(type, record.id, changes);

/** A bare checkbox for the one-bit settings: the field label names it, the hint explains it. */
function checkbox(name, hint, checked, onChange) {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.className = 'field__check';
  input.checked = checked;
  input.title = hint;
  input.dataset.control = name;
  input.setAttribute('aria-label', name);
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

/**
 * A choice between two or three words, as a row of chips with the one in force
 * filled in: both are in sight and either is one press, where a list has to be
 * opened to see what else there is. For a choice of a handful — a font size, a
 * shape size — a list is still the control.
 */
function toggle(name, options, value, onChange) {
  const group = document.createElement('span');
  group.className = 'toggle';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', name);
  for (const option of options) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'btn btn--chip toggle__chip';
    chip.textContent = option.label;
    chip.dataset.control = `${name}:${option.value}`;
    chip.setAttribute('aria-pressed', String(option.value === value));
    chip.addEventListener('click', () => { if (option.value !== value) onChange(option.value); });
    group.appendChild(chip);
  }
  return group;
}

/** A word with its first letter raised, for a chip: the values are kept in lower case. */
const capitalised = (word) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * How a line is drawn: curved or straight, and whether it keeps the points it
 * was drawn on. The same two fields wherever a line's shape is set — in the
 * panel's Shape section and in the pop-up beside the line on the map — so the
 * two can never offer different things.
 */
export function lineShapeFields(record) {
  // Curved first: it is what a line is until it is told otherwise.
  const styles = [...LINE_STYLES].sort((a, b) => Number(b === 'curved') - Number(a === 'curved'));
  return [
    field('Line', toggle(
      'Line',
      styles.map((value) => ({ value, label: capitalised(value) })),
      record.lineStyle ?? 'curved',
      (value) => patch('connector', record, { lineStyle: value }),
    ), { inline: true }),
    // Anchored lines keep the points they were drawn on, come what may.
    field('Anchor', checkbox(
      'Anchor',
      'Keep these snap points',
      record.anchored === true,
      (value) => patch('connector', record, { anchored: value }),
    ), { inline: true }),
  ];
}

/**
 * The Type of an element: one of the choices its kind offers, with a box to
 * add a new one. Each kind keeps its own list — a domain's types and a
 * capability's are different vocabularies — and the lists live in the document
 * beside the palette, so they travel with an export.
 *
 * Browsing shows the value and nothing to change it with, like every other
 * field here.
 */
function typeField(kind, record, noun = 'type') {
  if (!editMode) return staticText(record.type || '—');

  const wrapper = document.createElement('div');
  wrapper.className = 'type-pick';

  const choices = typesFor(kind);
  // A value whose choice has gone (a hand-edited file, say) still shows: the
  // panel says what the record holds, never quietly a different thing.
  const options = [{ value: '', label: '—' }, ...choices.map((one) => ({ value: one, label: one }))];
  if (record.type && !choices.includes(record.type)) {
    options.push({ value: record.type, label: `${record.type} (not in the list)` });
  }

  const picker = select(options, record.type ?? '', (value) => patch(kind, record, { type: value }));
  picker.classList.add('type-pick__choice');

  // Adding a choice and picking it are one gesture: what you have just named is
  // what you meant this element to be.
  const adding = document.createElement('input');
  adding.className = 'field__input type-pick__new';
  adding.placeholder = `Add a ${noun}…`;
  adding.maxLength = 60;
  adding.title = 'Type a new choice and press Enter';

  const add = () => {
    const wanted = adding.value.trim();
    if (!wanted) return;
    adding.value = '';
    handlers.onAddType?.(kind, wanted, record.id);
  };
  adding.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
  });
  adding.addEventListener('blur', add);

  // Taking a choice off the list. It is refused while anything is typed with
  // it, and says how many — nothing is cleared behind the author's back.
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'btn btn--icon type-pick__remove';
  remove.textContent = '−';
  remove.title = `Remove the selected ${noun} from the list`;
  remove.disabled = !record.type || !choices.includes(record.type);
  remove.addEventListener('click', () => handlers.onRemoveType?.(kind, record.type));

  wrapper.append(picker, remove, adding);
  return wrapper;
}

/** A value to read rather than edit. */
function staticText(value) {
  const element = document.createElement('div');
  element.className = 'field__value';
  element.textContent = value;
  return element;
}

/**
 * Which area a shape is in: one of the map's, or none. This is where leaving is
 * said — dragging a shape clear of its team only stretches the band after it,
 * so that tidying the map never reorganises the company. A capability inside a
 * domain belongs through the domain, and says so rather than offering a choice
 * it does not have.
 */
function areaField(kind, record) {
  const area = areaOf(kind, record);
  if (!mayJoinArea(kind, record)) {
    return field('Area', staticText(area ? `${oneLine(area.title)}, through its domain` : '—'));
  }
  if (!editMode) return field('Area', staticText(area ? oneLine(area.title) : '—'));

  return field('Area', select(
    [{ value: '', label: '—' }, ...store.areas.map((one) => ({ value: one.id, label: oneLine(one.title) }))],
    record.areaId ?? '',
    (value) => handlers.onArea?.(kind, record.id, value || null),
  ));
}

/** What an area holds, as names to press: each one shows its shape on the map. */
function memberChips(members) {
  const row = document.createElement('div');
  row.className = 'details__members';
  for (const { kind, record } of members) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--chip details__member';
    button.textContent = oneLine(record.title);
    button.title = `Show this ${kind} on the map`;
    button.addEventListener('click', () => handlers.onShow?.(kind, record.id));
    row.appendChild(button);
  }
  return row;
}

// --- teams -------------------------------------------------------------------

/** A chip with a way off it at its end: a name to press, and in Edit mode a × that takes it away. */
function chipWithOut(label, title, onPress, out) {
  const holder = document.createElement('span');
  holder.className = 'details__pick';
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'btn btn--chip details__member';
  chip.textContent = label;
  chip.title = title;
  chip.addEventListener('click', onPress);
  holder.append(chip);
  if (editMode && out) {
    const off = document.createElement('button');
    off.type = 'button';
    off.className = 'details__out';
    off.textContent = '×';
    off.title = out.title;
    off.setAttribute('aria-label', out.title);
    off.addEventListener('click', out.press);
    holder.append(off);
  }
  return holder;
}

/** What each kind a team may be on is called, one and many. */
const TEAM_ON = { area: ['area', 'Areas'], domain: ['domain', 'Domains'], capability: ['capability', 'Capabilities'] };

/**
 * The teams of an area, a domain or a capability: the ones on it, each a chip
 * that picks the team and lights up what it is on, and after them the ones it
 * has through its domain or its area. In Edit mode a list puts another team on
 * it, or makes a new one that starts on it. Browsing, a shape with no team says
 * nothing about teams.
 */
function teamsSection(kind, record) {
  const direct = teamsOn(kind, record.id);
  // With where each comes from, since those are not this shape's to take off.
  const through = teamsThrough(kind, record);
  if (!editMode && direct.length + through.length === 0) return null;

  const row = document.createElement('div');
  row.className = 'details__members';
  for (const team of direct) {
    row.append(chipWithOut(oneLine(team.title), `Show what ${oneLine(team.title)} is on`,
      () => handlers.onPickTeam?.(team.id),
      { title: `Take ${oneLine(team.title)} off this ${kind}`, press: () => handlers.onTeamMember?.(team.id, kind, record.id, false) }));
  }
  for (const { team, via } of through) {
    const chip = chipWithOut(oneLine(team.title), `On ${oneLine(via.title)}, which holds this. Show what ${oneLine(team.title)} is on`,
      () => handlers.onPickTeam?.(team.id));
    chip.classList.add('details__pick--through');
    row.append(chip);
  }
  const fields = direct.length + through.length ? [row] : [];

  if (editMode) {
    const others = store.teams.filter((team) => !direct.includes(team));
    const NEW = ' new';
    const picker = select(
      [{ value: '', label: 'Put a team on it…' },
        ...others.map((team) => ({ value: team.id, label: oneLine(team.title) })),
        { value: NEW, label: 'A new team…' }],
      '',
      (value) => {
        if (value === NEW) handlers.onNewTeam?.(kind, record.id);
        else if (value) handlers.onTeamMember?.(value, kind, record.id, true);
      },
    );
    picker.setAttribute('aria-label', 'Put a team on it');
    fields.push(picker);
  }
  return section('Teams', fields, 'Holds');
}

/**
 * What a team is on, as names to press — each shows its shape on the map — and
 * in Edit mode a × on each, and a list of everything a team may be put on that
 * this one is not on yet: the areas, the domains, the capabilities.
 */
function teamOnField(team) {
  const members = teamMembers(team);
  const row = document.createElement('div');
  row.className = 'details__members';
  for (const { kind, record } of members) {
    row.append(chipWithOut(oneLine(record.title), `Show this ${kind} on the map`,
      () => handlers.onShow?.(kind, record.id),
      { title: `Take the team off ${oneLine(record.title)}`, press: () => handlers.onTeamMember?.(team.id, kind, record.id, false) }));
  }
  const fields = members.length ? [row] : [staticText('Nothing yet.')];
  if (!editMode) return fields;

  const picker = document.createElement('select');
  picker.className = 'field__select';
  picker.setAttribute('aria-label', 'Put the team on something');
  const first = document.createElement('option');
  first.value = '';
  first.textContent = 'Put it on…';
  picker.append(first);
  const isOn = (kind, id) => members.some((member) => member.kind === kind && member.record.id === id);
  for (const kind of TEAM_MEMBER_KINDS) {
    const free = (kind === 'area' ? store.areas : kind === 'domain' ? store.domains : store.capabilities)
      .filter((record) => !isOn(kind, record.id));
    if (free.length === 0) continue;
    const group = document.createElement('optgroup');
    group.label = TEAM_ON[kind][1];
    for (const record of free) {
      const option = document.createElement('option');
      option.value = `${kind}:${record.id}`;
      // Two capabilities may share a name, in two domains: the domain tells them apart.
      const home = kind === 'capability' ? find('domain', record.domainId) : null;
      option.textContent = home ? `${oneLine(record.title)} — ${oneLine(home.title)}` : oneLine(record.title);
      group.append(option);
    }
    picker.append(group);
  }
  picker.addEventListener('change', () => {
    const [kind, id] = picker.value.split(':');
    if (id) handlers.onTeamMember?.(team.id, kind, id, true);
  });
  return [...fields, picker];
}

// --- people in roles ---------------------------------------------------------

/** What each discipline is called: over its section on a shape, over a person's own fields, and in a sentence. */
const ROLE_NAMES = {
  productRole: { many: 'Product roles', one: 'Product role', says: 'product' },
  engineeringRole: { many: 'Engineering roles', one: 'Engineering role', says: 'engineering' },
};

/** A person as a chip names them: their name, and the role they hold when they have been given one. */
const roleSays = (role) => (role.type ? `${oneLine(role.title)} — ${role.type}` : oneLine(role.title));

/** A shape as a list names it. Two capabilities may share a name, in two domains: the domain tells them apart. */
const shapeNamed = (kind, record) => {
  const home = kind === 'capability' ? find('domain', record.domainId) : null;
  return home ? `${oneLine(record.title)} — ${oneLine(home.title)}` : oneLine(record.title);
};

/**
 * The people of one discipline who own an area, a domain or a capability:
 * each a chip that picks them, and in Edit mode a × that takes the shape from
 * them and a list that gives it to someone already on the map, or names
 * someone new on it.
 * Browsing, a shape nobody leads says nothing about who leads it.
 */
function rolesSection(roleKind, kind, record) {
  const here = rolesOn(roleKind, kind, record.id);
  if (!editMode && here.length === 0) return null;
  const { many, says } = ROLE_NAMES[roleKind];

  const row = document.createElement('div');
  row.className = 'details__members';
  for (const role of here) {
    row.append(chipWithOut(roleSays(role), `Show ${oneLine(role.title)}'s details`,
      () => handlers.onPick?.(roleKind, role.id),
      {
        title: `Take this ${kind} from ${oneLine(role.title)}`,
        press: () => handlers.onRoleMember?.(roleKind, role.id, kind, record.id, false),
      }));
  }
  const fields = here.length ? [row] : [];

  if (editMode) {
    const others = listOf(roleKind).filter((role) => !here.includes(role));
    const NEW = ' new';
    const picker = select(
      [{ value: '', label: `Name who leads it for ${says}…` },
        ...others.map((role) => ({ value: role.id, label: roleSays(role) })),
        { value: NEW, label: 'Someone new…' }],
      '',
      (value) => {
        if (value === NEW) handlers.onNewRole?.(roleKind, kind, record.id);
        else if (value) handlers.onRoleMember?.(roleKind, value, kind, record.id, true);
      },
    );
    picker.setAttribute('aria-label', `Name who leads it for ${says}`);
    fields.push(picker);
  }
  return section(many, fields, 'Holds');
}

/**
 * What a person owns, as names to press — each shows its shape on the map —
 * and in Edit mode a × on each and a list of the areas, domains and
 * capabilities they do not own yet. The last thing they own has no ×: a person who owns nothing is
 * nowhere on the map, and is taken off it with Remove instead.
 */
function roleOwnsField(roleKind, role) {
  const owned = roleMembers(role);
  const row = document.createElement('div');
  row.className = 'details__members';
  for (const { kind, record } of owned) {
    row.append(chipWithOut(shapeNamed(kind, record), `Show this ${kind} on the map`,
      () => handlers.onShow?.(kind, record.id),
      owned.length > 1
        ? {
          title: `Take ${oneLine(record.title)} from them`,
          press: () => handlers.onRoleMember?.(roleKind, role.id, kind, record.id, false),
        }
        : null));
  }
  if (!editMode) return [row];

  const picker = document.createElement('select');
  picker.className = 'field__select';
  picker.setAttribute('aria-label', 'Give them something else to own');
  const first = document.createElement('option');
  first.value = '';
  first.textContent = 'Give them another…';
  picker.append(first);
  const owns = (kind, id) => owned.some((member) => member.kind === kind && member.record.id === id);
  for (const kind of ROLE_ON_KINDS) {
    const free = listOf(kind).filter((record) => !owns(kind, record.id));
    if (free.length === 0) continue;
    const group = document.createElement('optgroup');
    group.label = TEAM_ON[kind][1];
    for (const record of free) {
      const option = document.createElement('option');
      option.value = `${kind}:${record.id}`;
      option.textContent = shapeNamed(kind, record);
      group.append(option);
    }
    picker.append(group);
  }
  picker.addEventListener('change', () => {
    const [kind, id] = picker.value.split(':');
    if (id) handlers.onRoleMember?.(roleKind, role.id, kind, id, true);
  });
  // A card that has been dragged somewhere stays there, so the way back to
  // where the map would hang it is offered here — and only once there is a
  // card to put back.
  if (!role.members.some(cardPlaced)) return [row, picker];
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'btn btn--chip';
  back.textContent = 'Put cards back';
  back.title = 'Hang their cards by the names of what they own again';
  back.addEventListener('click', () => handlers.onRoleCardsBack?.(roleKind, role.id));
  return [row, picker, back];
}

/**
 * A person's own fields: their name, the role they hold — picked from the
 * roles the map's owner has typed in, with a box to type another — the icon
 * their badge wears, and anything worth saying about them. The name box has
 * the people list behind it, so someone who signs in to the map need not be
 * spelt out; it is still only a name, and takes anyone.
 */
function roleSection(roleKind, role) {
  const label = staticText(slugOf(roleKind, role));
  const name = liveText(roleKind, role, 'title', {
    onInput: () => { label.textContent = slugOf(roleKind, role); }, shown: oneLine,
  });
  // Asked for here as the Owner box asks for it. A person is often the first
  // thing picked in a session, before any Owner box has been drawn, and a name
  // box that waited for one to load the list never offered anybody.
  if (people === null) loadPeople();
  name.setAttribute('list', 'people-options');
  offerAsTyped(name, 'people-options', offered);
  return section(ROLE_NAMES[roleKind].one, [
    field('Label', label),
    field('Name', name),
    field('Role', typeField(roleKind, role, 'role')),
    ...(editMode ? [field('Icon', iconField(roleKind, role))] : []),
    field('Description', liveText(roleKind, role, 'description', { multiline: true })),
    meta([`Layer: ${layerNameOf(roleKind, role)}`]),
  ], 'Metadata');
}

/** "2 domains", "1 capability": how much of each kind a team is on, for the facts under its fields. */
function teamCounts(team) {
  const members = teamMembers(team);
  const counts = TEAM_MEMBER_KINDS
    .map((kind) => [kind, members.filter((member) => member.kind === kind).length])
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${TEAM_ON[kind][1]}: ${count}`);
  return counts.length ? counts : ['On nothing yet'];
}

/**
 * The words of a domain or a capability as fields — its title, what it is, who
 * owns it, its Type — for wherever they are edited but the panel: a slide is
 * one. They are the panel's own fields, so what is typed into either is typed
 * into the map, the same way, with the same undo.
 */
export function wordFields(type, record) {
  return [
    field('Title', liveText(type, record, 'title', { shown: oneLine, stored: withBreaks })),
    field('Description', liveText(type, record, 'description', { multiline: true, rows: 4 })),
    field('Owner', ownerField(type, record)),
    field('Type', typeField(type, record)),
  ];
}

/** A domain title is bold by default; every label on a shape is not. */
const onAShape = (type) => type === 'capability' || type === 'touchpoint' || type === 'actor';

const weightDefault = (type) => {
  if (type === 'area') return AREA_SHAPE.fontWeight;
  return onAShape(type) ? DEFAULT_CAPABILITY_FONT_WEIGHT : DEFAULT_FONT_WEIGHT;
};

function weightField(type, record) {
  return field('Weight', select(
    FONT_WEIGHTS.map((value) => ({ value, label: value })),
    record.fontWeight ?? weightDefault(type),
    (value) => patch(type, record, { fontWeight: value }),
  ), { inline: true });
}

function fontSizeField(type, record) {
  const sizes = onAShape(type) ? CAPABILITY_FONT_SIZES : FONT_SIZES;

  return field('Font size', select(
    sizes.map((size) => ({ value: size, label: `${size} px` })),
    record.fontSize ?? (onAShape(type) ? DEFAULT_FONT_SIZE : type === 'area' ? AREA_SHAPE.fontSize : undefined),
    (value) => patch(type, record, { fontSize: Number(value) }),
  ), { inline: true });
}

/** "1x", "1.5x" — a multiple reads better than a percentage on a shape. */
const timesLabel = (value) => `${Number(value.toFixed(2))}x`;

/** What the permalink for this record looks like — the slug, not the raw id. */
const slugOf = (type, record) => slugFor(type, record.id) ?? '—';

/** The layer the selection sits on, named as the layer control names it. */
const layerNameOf = (type, record) => layerTitle(layerOf(type, record));

/** How solid a shape is drawn. Every kind carries one; a domain always did. */
function opacityField(type, record, fallback, least = 10) {
  return field('Opacity', slider(
    {
      min: least,
      max: 100,
      step: 10,
      value: record.opacity ?? fallback,
      format: (v) => `${v}%`,
    },
    (value) => patch(type, record, { opacity: value }),
  ));
}

/** Read-only facts about the selection, set apart below its fields. */
function meta(lines) {
  const element = document.createElement('div');
  element.className = 'details__meta';
  for (const line of lines) {
    const paragraph = document.createElement('div');
    paragraph.textContent = line;
    element.appendChild(paragraph);
  }
  return element;
}

/**
 * Title, description and owner — the same three for a domain or a capability —
 * with where the record sits in the map around them: `lead` fields under the
 * label, `trail` facts at the foot.
 * Headed by what the selection is, but opened and shut as one panel for both.
 */
const HEADINGS = {
  area: 'Area',
  domain: 'Domain',
  capability: 'Capability',
  feature: 'Feature',
  touchpoint: 'Touchpoint',
  actor: 'Actor',
  team: 'Team',
};

function metadataSection(type, record, { lead = [], trail = [] }) {
  // The slug is made from the title, so it follows the title as it is typed —
  // the panel itself is not rebuilt mid-edit.
  const label = staticText(slugOf(type, record));
  const refreshLabel = () => { label.textContent = slugOf(type, record); };

  return section(HEADINGS[type] ?? 'Element', [
    field('Label', label),
    ...lead,
    // A domain title can carry the breaks Ctrl-Enter puts in it on the shape.
    // Here it reads as one line, and what is typed gets the breaks back after
    // the same words, so renaming in the panel keeps the rows on the shape.
    field('Title', liveText(type, record, 'title', {
      onInput: refreshLabel, shown: oneLine, stored: withBreaks,
    })),
    field('Description', liveText(type, record, 'description', { multiline: true })),
    field('Owner', ownerField(type, record)),
    // What kind of thing this is, from the list its kind keeps.
    field('Type', typeField(type, record)),
    // An icon says what a capability *is*, so it belongs with its name rather
    // than among the controls for how it is drawn. Browsing has nothing to
    // choose with, so the picker is not shown at all.
    ...(editMode && (type === 'capability' || type === 'touchpoint')
      ? [
        field('Icon', iconField(type, record)),
        // Only an SVG has lines to weigh; a photograph is what it is.
        ...(/\.svg$/i.test(record.icon ?? '') ? [iconWeightField(type, record)] : []),
      ]
      : []),
    ...(trail.length ? [meta(trail)] : []),
  ], 'Metadata');
}

export function renderDetails() {
  const record = selected();
  const { type } = store.selection;

  // A save landing mid-sentence must not steal the caret.
  if (editingId && editingId === (store.selection.id ?? THE_MAP) && container.contains(document.activeElement)) return;

  // With nothing selected the panel is about the map itself: what business it
  // is a map of. Browsing an undescribed map there is nothing to say, so the
  // section is left out rather than shown holding an empty box.
  if (!record) {
    const empty = document.createElement('p');
    empty.className = 'details__empty';
    empty.textContent = 'Nothing selected. Pick a domain, capability or connector.';
    const about = editMode || store.description
      ? section('Map', [field('What the business is', mapDescription())], 'Metadata')
      : null;
    container.replaceChildren(...(about ? [about] : []), empty);
    fitAreas();
    return;
  }

  const nodes = [];

  if (type === 'team') {
    // A team is its words and what it is on. It has no shape: nothing is drawn
    // for it, and picking it is what lights up the shapes it is on.
    nodes.push(metadataSection(type, record, { trail: teamCounts(record) }));
    nodes.push(section('Works on', teamOnField(record), 'Holds'));
  } else if (ROLE_KINDS.includes(type)) {
    // A person is their name, their role, their icon and what they own. The
    // badge has no Shape section: it is drawn where its shape puts it.
    nodes.push(roleSection(type, record));
    nodes.push(section('Owns', roleOwnsField(type, record), 'Holds'));
  } else if (type === 'feature') {
    // A feature is its words and where it belongs. It has no Shape section:
    // it is drawn in the room its capability has for it, in the order the
    // capability holds it — which the bracket keys change — and the one thing
    // about its bubble that is its own, which way it leans, is stepped from the
    // keyboard as a capability's lean is.
    const capability = find('capability', record.capabilityId);
    nodes.push(metadataSection(type, record, {
      lead: [field('Capability', staticText(capability ? oneLine(capability.title) : '—'))],
    }));
    // Dragged somewhere in its capability, it stays there. This is the way
    // back to the row its order gives it, and is only there once it has left.
    if (editMode && (record.x != null || record.y != null)) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'btn btn--chip';
      back.textContent = 'Put back in its row';
      back.title = 'Let the capability place this feature again, in the order it holds it';
      back.addEventListener('click', () => handlers.onUnplaceFeature?.(record.id));
      // Open with the panel, as what a capability holds is: it is one button, and
      // folded away nobody would know the way back was there.
      nodes.push(section('Place', [field('Placed by hand', back, { inline: true })], 'Holds'));
    }
  } else if (type === 'capability') {
    const domain = record.domainId ? find('domain', record.domainId) : null;
    const held = featuresOf(record.id);
    // Where it belongs comes straight after what it is called: it frames everything below.
    nodes.push(metadataSection(type, record, {
      lead: [field('Domain', staticText(domain ? domain.title : '—')), areaField(type, record)],
      trail: held.length ? [`Features: ${held.length}`] : [],
    }));
    // What it does, one by one. From any further out than reading distance the
    // map does not draw them, so this is where they can always be read — and
    // pressing one closes the map in on it.
    if (held.length) {
      nodes.push(section('Features', [
        memberChips(held.map((feature) => ({ kind: 'feature', record: feature }))),
      ], 'Holds'));
    }
    for (const roleKind of ROLE_KINDS) nodes.push(rolesSection(roleKind, type, record));
    nodes.push(teamsSection(type, record));
    nodes.push(section('Shape', [
      fontSizeField(type, record),
      weightField(type, record),
      // The oval is sized by this alone; the words wrap to fit whatever it is.
      field('Shape size', select(
        SIZE_SCALES.map((value) => ({ value, label: timesLabel(value) })),
        record.sizeScale ?? 1,
        (value) => patch(type, record, { sizeScale: Number(value) }),
      ), { inline: true }),
      field('Color', swatches(type, record)),
      opacityField(type, record, 100),
      // Nothing to place until there is an icon.
      ...(record.icon ? [iconPlacementField(type, record)] : []),
    ]));
  } else if (type === 'touchpoint' || type === 'actor') {
    // Neither belongs to a domain, so what frames it is the layer it is on.
    nodes.push(metadataSection(type, record, {
      lead: [
        field('Layer', staticText(layerNameOf(type, record))),
        // An actor stands outside the business, so no team owns one.
        ...(type === 'touchpoint' ? [areaField(type, record)] : []),
      ],
    }));
    nodes.push(section('Shape', [
      fontSizeField(type, record),
      weightField(type, record),
      field('Shape size', select(
        SIZE_SCALES.map((value) => ({ value, label: timesLabel(value) })),
        record.sizeScale ?? 1,
        (value) => patch(type, record, { sizeScale: Number(value) }),
      ), { inline: true }),
      field('Color', swatches(type, record)),
      // An actor starts half see-through, so the terrain under it still reads.
      opacityField(type, record, type === 'actor' ? 50 : 100),
      // An actor always has its figure to place; a touchpoint needs an icon first.
      ...(type === 'actor' || record.icon ? [iconPlacementField(type, record)] : []),
    ]));
  } else if (type === 'domain') {
    const count = store.capabilities.filter((c) => c.domainId === record.id).length;
    nodes.push(metadataSection(type, record, {
      lead: [field('Layer', staticText(layerNameOf(type, record))), areaField(type, record)],
      trail: [`Capabilities: ${count}`],
    }));
    for (const roleKind of ROLE_KINDS) nodes.push(rolesSection(roleKind, type, record));
    nodes.push(teamsSection(type, record));
    nodes.push(section('Shape', [
      fontSizeField(type, record),
      weightField(type, record),
      // Where the title sits is set by dragging it, not from a list.
      field('Title size', select(
        TITLE_SCALES.map((value) => ({ value, label: `${Math.round(value * 100)}%` })),
        record.titleScale ?? 1,
        (value) => patch(type, record, { titleScale: Number(value) }),
      ), { inline: true }),
      field('Color', swatches(type, record)),
      // How much of the color shows, so it follows the color.
      opacityField(type, record, DEFAULT_OPACITY),
    ]));
  } else if (type === 'area') {
    const members = membersOf(record.id);
    const counts = [['domain', 'Domains'], ['touchpoint', 'Touchpoints'], ['capability', 'Loose capabilities']]
      .map(([kind, label]) => [label, members.filter((one) => one.kind === kind).length])
      .filter(([, count]) => count > 0)
      .map(([label, count]) => `${label}: ${count}`);

    nodes.push(metadataSection(type, record, {
      lead: [field('Layer', staticText(layerNameOf(type, record)))],
      trail: counts.length ? counts : ['Holds nothing yet'],
    }));
    // What it holds is what it is, so it comes before how it is drawn. Every
    // shape keeps its one row in the menu; this is where a team is read off.
    if (members.length) nodes.push(section('Holds', [memberChips(members)]));
    for (const roleKind of ROLE_KINDS) nodes.push(rolesSection(roleKind, type, record));
    nodes.push(teamsSection(type, record));
    nodes.push(section('Shape', [
      fontSizeField(type, record),
      weightField(type, record),
      // On an area this sizes the words themselves: there is no lobe round a
      // title that rides a border.
      field('Title size', select(
        TITLE_SCALES.map((value) => ({ value, label: `${Math.round(value * 100)}%` })),
        record.titleScale ?? 1,
        (value) => patch(type, record, { titleScale: Number(value) }),
      ), { inline: true }),
      field('Color', swatches(type, record)),
      // Down to nothing: at 0 an area is a border and no wash.
      opacityField(type, record, AREA_SHAPE.opacity, 0),
    ]));
  } else if (type === 'connector') {
    // Named for the kind of line it is, the way the menu files it — the panel
    // and the menu never disagree about what you have selected.
    const scope = connectorScope(record);
    // Both ends of an internal line sit in the same domain — that is what makes
    // it internal — so either end names the one it belongs to. A public line
    // belongs to no one domain, and says so rather than leaving the row out:
    // the field is then in the same place whichever line is selected.
    const home = scope === 'internal'
      ? find('domain', domainOfEnd(record.fromKind, record.fromId))
      : null;
    // A presentation line hangs off the element that owns it, so that is what
    // it says it belongs to, where a terrain line names a domain.
    const owner = scope === 'interaction' || scope === 'touchpoint'
      ? find(record.fromKind, record.fromId)
      : null;

    nodes.push(section(CONNECTOR_NAMES[scope] ?? 'Connector', [
      field('Label', staticText(connectorLabel(record))),
      owner
        ? field(scope === 'interaction' ? 'Actor' : 'Touchpoint', staticText(owner.title))
        : field('Domain', staticText(scope === 'internal' ? home?.title ?? '—' : 'Across domains')),
      // A line belongs to the layer of its upper end, which is the layer that
      // takes it away when it is hidden.
      field('Layer', staticText(layerNameOf(type, record))),
      field('Description', liveText(type, record, 'description', { multiline: true })),
    ], 'Metadata'));
    nodes.push(section('Shape', lineShapeFields(record), LINE_SHAPE));
  }

  // Whatever section is left (Shape has already dropped out) shows its
  // fields, just not open to changing them. The text fields are the exception:
  // they stay live so their words can be selected, copied and scrolled, and
  // liveText is what keeps whatever is typed into them from going anywhere.
  if (!editMode) {
    for (const node of nodes) {
      node?.querySelectorAll('.section__body input, .section__body select, '
        + '.section__body textarea, .section__body button')
        .forEach((control) => {
          // A member's name is a way to look, not a way to change anything.
          const reads = control.classList.contains('field__input')
            || control.classList.contains('details__member');
          if (!reads) control.disabled = true;
        });
    }
  }

  container.replaceChildren(...nodes.filter(Boolean));
  // Only now are the boxes in the page, where a height can be measured.
  fitAreas();
}
