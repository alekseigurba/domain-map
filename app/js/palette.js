// The palette editor: a modal over the whole page, because the palette belongs
// to the map rather than to whatever happens to be selected. How many colours
// there are, which one is being changed, and a picker that stays open on it.

import { store } from './store.js';
import { COLORS, PALETTE_SIZES, DEFAULT_PALETTE } from './geometry.js';

const dialog = document.getElementById('palette-dialog');

let handlers = {};

/** The swatch the picker is pointed at. */
let active = 0;

/**
 * Where the picker sits, as hue, saturation and brightness rather than as hex.
 * A grey has no hue and black no saturation, so holding them here is what keeps
 * the picker from losing its place when a colour passes through either.
 */
let hsv = { h: 0, s: 0, v: 0 };

/** A drag over the colour area is under way: shown as it goes, written when it lands. */
let dragging = false;

/** Whether the press behind a click began on the backdrop. */
let pressedBackdrop = false;

// Built once by initPalette, and repainted in place from then on.
let sizeButtons = [];
let grid;
let caption;
let area;
let thumb;
let hue;
let chip;
let hex;

export function initPalette(callbacks) {
  handlers = callbacks;
  build();
}

/** Open on one swatch, or on whichever was edited last. */
export function openPalette(index = null) {
  if (dialog.open) return;
  active = clamp(index ?? active, 0, COLORS.length - 1);
  loadSaved({ keep: false });
  refresh();
  dialog.showModal();
  grid.children[active]?.focus();
}

/** Keep an open editor in step with the map: after a save, an undo, a resize or a reset. */
export function renderPalette() {
  if (dialog.open) refresh();
}

export const paletteOpen = () => dialog.open;

// --- colour arithmetic -------------------------------------------------------

const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/**
 * A colour as the palette keeps it — #rrggbb in lower case — or null when the
 * text is not one. The short form and a missing # are read as well, since both
 * are how a hex gets typed.
 */
function readHex(text) {
  let value = String(text ?? '').trim().toLowerCase();
  if (!value.startsWith('#')) value = `#${value}`;
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return /^#[0-9a-f]{6}$/.test(value) ? value : null;
}

function toHsv(color) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = (g - b) / delta;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max > 0 ? delta / max : 0, v: max };
}

function toHex({ h, s, v }) {
  const channel = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * clamp(Math.min(k, 4 - k))) * 255);
  };
  return `#${[5, 3, 1].map((n) => channel(n).toString(16).padStart(2, '0')).join('')}`;
}

// --- the palette -------------------------------------------------------------

/** The palette as it stands, always a real list even before the map has one. */
const currentPalette = () => (store.palette?.length ? [...store.palette] : [...DEFAULT_PALETTE]);

/** What the swatch being edited holds in the map. */
const savedHex = () => readHex(COLORS[active]) ?? '#000000';

/** Write one swatch. Only a colour that differs is a change, and an undo step. */
function save(color) {
  const colors = currentPalette();
  if (readHex(colors[active]) === color) return;
  colors[active] = color;
  handlers.onPalette?.(colors);
}

/**
 * Extending repeats the palette rather than inventing colours: the extra
 * swatches start as copies to be edited, which is a better place to begin than
 * twelve arbitrary new hues.
 */
function resize(size) {
  const colors = currentPalette();
  if (colors.length === size) return;
  handlers.onPalette?.(Array.from({ length: size }, (_, i) => colors[i] ?? colors[i % colors.length]));
}

function reset() {
  if (store.palette?.length) handlers.onPalette?.([]);
}

// --- the picker --------------------------------------------------------------

/**
 * Point the picker at a colour. A grey has no hue of its own and black no
 * saturation, so the picker keeps the ones it had rather than jumping into a
 * corner — except when it moves to another swatch, where they mean nothing.
 */
function aim(color, { keep = true } = {}) {
  const next = toHsv(color);
  if (keep && next.s === 0) next.h = hsv.h;
  if (keep && next.v === 0) next.s = hsv.s;
  hsv = next;
}

const loadSaved = (options) => aim(savedHex(), options);

function pick(index) {
  active = index;
  loadSaved({ keep: false });
  refresh();
}

/** A drag is shown the whole way but written once, where it lands, or every twitch would be a save and an undo step. */
function land() {
  if (!dragging) return;
  dragging = false;
  save(toHex(hsv));
}

/** Enter, or leaving the field: a readable hex is written, anything else put back. */
function commitHex() {
  const color = readHex(hex.value);
  if (color) {
    aim(color);
    save(color);
  } else {
    loadSaved();
  }
  paintPicker();
}

// --- painting ----------------------------------------------------------------

function refresh() {
  active = clamp(active, 0, COLORS.length - 1);

  for (const button of sizeButtons) {
    const on = Number(button.dataset.size) === COLORS.length;
    button.classList.toggle('palette-size--on', on);
    button.setAttribute('aria-pressed', String(on));
  }

  paintGrid();
  caption.textContent = `Color ${active + 1}`;
  hex.setAttribute('aria-label', `Hex value for color ${active + 1}`);

  // Only a colour the picker is not already showing moves it. One it has just
  // written comes back rounded to whole channels, and would nudge the thumb off
  // the spot it was let go on.
  if (!dragging && toHex(hsv) !== savedHex()) loadSaved();
  paintPicker();
}

/**
 * The swatches, pressed to choose which one the picker edits. Repainted in place
 * while the count holds: a button rebuilt between pointerdown and pointerup
 * never gets its click, and the blur that writes a typed hex lands exactly there.
 */
function paintGrid() {
  if (grid.children.length !== COLORS.length) {
    grid.replaceChildren(...COLORS.map((_, i) => {
      const button = element('button', 'swatch');
      button.type = 'button';
      button.title = `Edit color ${i + 1}`;
      button.addEventListener('click', () => pick(i));
      return button;
    }));
  }
  [...grid.children].forEach((button, i) => {
    button.style.background = COLORS[i];
    button.setAttribute('aria-pressed', String(i === active));
  });
}

/**
 * Show the picker's colour everywhere it appears — the area and its thumb, the
 * hue strip, the chip, the swatch being edited and, unless it is being typed
 * into, the hex field — so that none of them is ever a step behind the rest.
 */
function paintPicker({ field = true } = {}) {
  const color = toHex(hsv);
  const pure = `hsl(${Math.round(hsv.h)}, 100%, 50%)`;

  area.style.setProperty('--hue', pure);
  area.setAttribute('aria-valuenow', String(Math.round(hsv.s * 100)));
  area.setAttribute('aria-valuetext',
    `Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`);
  thumb.style.left = `${hsv.s * 100}%`;
  thumb.style.top = `${(1 - hsv.v) * 100}%`;
  thumb.style.background = color;

  hue.style.setProperty('--hue', pure);
  hue.value = String(Math.round(hsv.h));

  chip.style.background = color;
  const swatch = grid.children[active];
  if (swatch) swatch.style.background = color;

  if (field) {
    hex.value = color;
    hex.classList.remove('field__input--bad');
  }
}

// --- building ----------------------------------------------------------------

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function build() {
  const title = element('h2', 'dialog__title', 'Edit palette');
  title.id = 'palette-title';

  // --- how many colours, and which of them is being changed ------------------
  const sizesCaption = element('span', 'palette-editor__label', 'Palette size');
  sizesCaption.id = 'palette-size-label';

  const sizes = element('div', 'palette-editor__sizes');
  sizes.setAttribute('role', 'group');
  sizes.setAttribute('aria-labelledby', 'palette-size-label');
  sizeButtons = PALETTE_SIZES.map((size) => {
    const button = element('button', 'btn btn--chip palette-size', String(size));
    button.type = 'button';
    button.dataset.size = String(size);
    button.addEventListener('click', () => resize(size));
    return button;
  });
  sizes.append(...sizeButtons);

  grid = element('div', 'swatches');

  const list = element('div', 'palette-editor__column');
  list.append(sizesCaption, sizes, element('span', 'palette-editor__label', 'Colors'), grid);

  // --- the picker, always open on that colour --------------------------------
  caption = element('label', 'palette-editor__label');
  caption.htmlFor = 'palette-hex';

  // Saturation runs across the area and brightness up it, over the pure hue
  // the strip underneath is set to.
  area = element('div', 'picker__area');
  area.tabIndex = 0;
  area.setAttribute('role', 'slider');
  area.setAttribute('aria-label', 'Saturation and brightness');
  area.setAttribute('aria-valuemin', '0');
  area.setAttribute('aria-valuemax', '100');
  thumb = element('span', 'picker__thumb');
  area.appendChild(thumb);

  hue = element('input', 'picker__hue');
  hue.type = 'range';
  hue.min = '0';
  hue.max = '360';
  hue.step = '1';
  hue.id = 'palette-hue';
  hue.name = 'palette-hue';
  hue.setAttribute('aria-label', 'Hue');

  chip = element('span', 'picker__chip');

  // One hex field rather than three channels: a palette is written down as hex
  // everywhere else it is discussed, so it is what there is to type.
  hex = element('input', 'field__input');
  hex.id = 'palette-hex';
  hex.name = 'palette-hex';
  hex.spellcheck = false;
  hex.autocomplete = 'off';
  hex.maxLength = 7;

  const hexRow = element('div', 'picker__hex');
  hexRow.append(chip, hex);

  const picker = element('div', 'palette-editor__column');
  picker.append(caption, area, hue, hexRow);

  const columns = element('div', 'palette-editor');
  columns.append(list, picker);

  // --- the way out -----------------------------------------------------------
  const resetButton = element('button', 'btn btn--chip', 'Reset to defaults');
  resetButton.type = 'button';
  resetButton.addEventListener('click', reset);

  const done = element('button', 'btn btn--chip', 'Done');
  done.type = 'button';
  done.addEventListener('click', () => dialog.close());

  const foot = element('div', 'dialog__foot');
  foot.append(resetButton, done);

  const body = element('div', 'dialog__body');
  body.append(title, columns, foot);
  dialog.replaceChildren(body);

  wireArea();
  wireHue();
  wireHex();
  wireDialog();
}

/** Dragging, or the arrow keys with Shift for bigger steps. Either is written once, when it stops. */
function wireArea() {
  const dragTo = (event) => {
    const box = area.getBoundingClientRect();
    hsv = {
      h: hsv.h,
      s: clamp((event.clientX - box.left) / box.width),
      v: 1 - clamp((event.clientY - box.top) / box.height),
    };
    paintPicker();
  };

  area.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // Focused before the drag starts, so a hex still being typed is written
    // first rather than landing on top of it afterwards.
    area.focus();
    area.setPointerCapture(event.pointerId);
    dragging = true;
    dragTo(event);
  });
  area.addEventListener('pointermove', (event) => { if (dragging) dragTo(event); });
  area.addEventListener('pointerup', land);
  area.addEventListener('lostpointercapture', land);

  const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  area.addEventListener('keydown', (event) => {
    const direction = steps[event.key];
    if (!direction) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.01;
    hsv = { h: hsv.h, s: clamp(hsv.s + direction[0] * step), v: clamp(hsv.v + direction[1] * step) };
    paintPicker();
  });
  area.addEventListener('keyup', (event) => {
    if (steps[event.key]) save(toHex(hsv));
  });
}

function wireHue() {
  hue.addEventListener('input', () => {
    hsv = { ...hsv, h: Number(hue.value) };
    paintPicker();
  });
  hue.addEventListener('change', () => save(toHex(hsv)));
}

/**
 * The field and the picker follow each other both ways: a readable hex moves the
 * picker as it is typed, and is written on Enter or on leaving the field. Esc
 * puts back what the swatch holds; a second Esc closes the editor.
 */
function wireHex() {
  hex.addEventListener('input', () => {
    const color = readHex(hex.value);
    hex.classList.toggle('field__input--bad', hex.value.trim().length > 0 && !color);
    if (!color) return;
    aim(color);
    paintPicker({ field: false });
  });
  hex.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitHex();
    } else if (event.key === 'Escape' && readHex(hex.value) !== savedHex()) {
      event.preventDefault();
      loadSaved();
      paintPicker();
    }
  });
  hex.addEventListener('blur', commitHex);
}

/**
 * Clicking the backdrop shuts the editor, as Esc does. The dialog has no padding
 * of its own, so a click aimed at the dialog itself came from outside it — but
 * only if the press began there too, or a drag let go past the edge would count.
 */
function wireDialog() {
  dialog.addEventListener('pointerdown', (event) => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if (pressedBackdrop && event.target === dialog) dialog.close();
  });
  // Shut mid-drag, the colour the drag had reached is still written.
  dialog.addEventListener('close', land);
}
