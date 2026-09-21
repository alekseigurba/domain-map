// The details sidebar: properties of whatever is selected, wherever it was
// selected. Two sections — what the thing *is* (metadata), then how it *looks*.

import {
  store, selected, find, patchLocal, connectorLabel, slugFor, oneLine, withBreaks,
  typesFor, layerOf, layerTitle, connectorScope, CONNECTOR_NAMES,
  areaOf, membersOf, mayJoinArea,
} from './store.js';
import { AREA_SHAPE } from './rules.js';
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

/** Which accordion panels are open. Sticky across selections, like a preference.
 *  Shape starts shut: what a thing is called matters before how it is drawn. */
const opened = new Set(['Metadata', 'Holds']);

/**
 * `key` names the panel in `opened` wherever its heading changes with the
 * selection. Shape has nothing to offer while browsing — nothing on it can be
 * touched — so it drops out of the panel entirely rather than sit there shut.
 * The other section stays, but loses the fold: with only one section left,
 * a control to collapse it would just be one more click to see the map.
 */
function section(title, fields, key = title) {
  if (!editMode && key === 'Shape') return null;

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
    debounce = setTimeout(() => handlers.onPatch?.(type, record.id, { [key]: value() }), 400);
  });
  input.addEventListener('focus', () => {
    editingId = record.id;
    before = record[key] ?? '';
  });
  input.addEventListener('blur', () => {
    editingId = null;
    clearTimeout(debounce);
    handlers.onPatch?.(type, record.id, { [key]: value() });
  });
  return input;
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
function iconField(type, record) {
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
  const fill = (names) => {
    chooser.replaceChildren();
    for (const option of [{ value: '', label: 'None' },
      ...names.map((name) => ({ value: name, label: name }))]) {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      node.selected = option.value === (record.icon ?? '');
      chooser.appendChild(node);
    }
  };
  fill(iconNames ?? (record.icon ? [record.icon] : []));
  if (!iconNames) loadIcons().then(fill);

  chooser.addEventListener('change', () => {
    // Empty is how "no icon" reaches the server, which reads it as a clear.
    patch(type, record, { icon: chooser.value });
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
      patch(type, record, { icon: name });
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
  input.setAttribute('aria-label', name);
  input.addEventListener('change', () => onChange(input.checked));
  return input;
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
function typeField(kind, record) {
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
  adding.placeholder = 'Add a type…';
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
  remove.title = 'Remove the selected type from the list';
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
  area: 'Product area',
  domain: 'Domain',
  capability: 'Capability',
  touchpoint: 'Touchpoint',
  actor: 'Actor',
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
    field('Owner', liveText(type, record, 'owner')),
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

  if (type === 'capability') {
    const domain = record.domainId ? find('domain', record.domainId) : null;
    // Where it belongs comes straight after what it is called: it frames everything below.
    nodes.push(metadataSection(type, record, {
      lead: [field('Domain', staticText(domain ? domain.title : '—')), areaField(type, record)],
    }));
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
      ? find('domain', find('capability', record.fromId)?.domainId)
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
    nodes.push(section('Shape', [
      field('Line', select(
        LINE_STYLES.map((value) => ({ value, label: value })),
        record.lineStyle ?? 'curved',
        (value) => patch(type, record, { lineStyle: value }),
      ), { inline: true }),
      // Anchored lines keep the points they were drawn on, come what may.
      field('Anchor', checkbox(
        'Anchor',
        'Keep these snap points',
        record.anchored === true,
        (value) => patch(type, record, { anchored: value }),
      ), { inline: true }),
    ]));
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
