// What a valid map looks like. These were CHECK constraints in the schema and
// validation in the API; with neither of those left, this file is the only
// place that knows, so both the editor and the importer read it from here.

import { DOMAIN_SHAPE, CAPABILITY_SHAPE, TOUCHPOINT_SHAPE, ACTOR_SHAPE } from './defaults.js';

export const MAX_TITLE_LENGTH = 200;
export const MAX_TEXT_LENGTH = 2000;

/**
 * The kinds of element a map is drawn from, and the order they are listed in.
 * Anything that walks every kind — the document, the menu, the layer stacks —
 * reads this rather than naming the four itself.
 */
export const ELEMENT_KINDS = ['domain', 'capability', 'touchpoint', 'actor'];

/** The kinds a connector may be drawn between: the ones that carry snap points. */
export const ENDPOINT_KINDS = ['capability', 'touchpoint', 'actor'];

/** How many layers one map may hold, and how long a layer key may be. */
export const MAX_LAYERS = 12;
export const MAX_KEY_LENGTH = 64;

/** A Type is a word or two picked from a list, not running copy. */
export const MAX_TYPE_LENGTH = 60;
/** How many choices one kind's Type list may hold. */
export const MAX_TYPE_CHOICES = 100;

/** The sizes a domain title may be set at. Mirrors geometry.js. */
export const FONT_SIZES = [32, 36, 48, 64, 72, 80, 100];

/** Capability type is its own scale. Mirrors geometry.js. */
export const CAPABILITY_FONT_SIZES = [24, 32, 36, 48, 52, 56, 64, 72, 80];

/** How a capability's oval leans, tall through round to wide. Mirrors geometry.js. */
export const STRETCHES = [-2, -1, 0, 1, 2];

export const PALETTE_SIZES = [12, 18, 24];
export const MAX_COLOR_INDEX = 24;
export const MAX_SIZE_SCALE = 4;
export const MAX_TITLE_SCALE = 3;
export const MIN_SCALE = 0.4;
export const FONT_WEIGHTS = ['regular', 'bold'];
export const LINE_STYLES = ['straight', 'curved'];

/** How many bends one line may be shaped with. */
export const MAX_BEND_POINTS = 12;

/** Snap points per capability. */
export const MAX_POINT = 23;

export const MIN_TITLE_WIDTH = 40;
export const MAX_TITLE_WIDTH = 2000;

export const ICON_EXTENSIONS = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];
export const MAX_ICON_BYTES = 512 * 1024;

// --- defaults ----------------------------------------------------------------

// What a record is when the caller or the file leaves a field out. These were
// the column defaults, applied by the insert; now they are applied here.
//
// How a shape looks comes from defaults.js. Colour is the exception: there it
// is a hex, here it has to be a palette swatch, and there is no palette to hand
// to find one in — so a file that names no colour gets the first swatch.

/**
 * A layer of the map. `hidden` and `dimmed` are what the document opens at —
 * the layer control changes them for the tab only, unless an owner is editing.
 * The base layer is the first in the list: it is never hidden, and it is the
 * one an element that names no layer is on.
 */
export const LAYER_DEFAULTS = {
  key: '',
  title: '',
  hidden: false,
  dimmed: false,
};

export const DOMAIN_DEFAULTS = {
  layer: null,
  title: DOMAIN_SHAPE.title,
  description: '',
  owner: '',
  type: '',
  colorIndex: 1,
  x: 0,
  y: 0,
  titleX: null,
  titleY: null,
  fontWeight: DOMAIN_SHAPE.fontWeight,
  fontSize: DOMAIN_SHAPE.fontSize,
  titleScale: DOMAIN_SHAPE.titleScale,
  titleWidth: null,
  opacity: DOMAIN_SHAPE.opacity,
};

export const CAPABILITY_DEFAULTS = {
  layer: null,
  domainId: null,
  title: CAPABILITY_SHAPE.title,
  description: '',
  owner: '',
  type: '',
  colorIndex: 1,
  fontSize: CAPABILITY_SHAPE.fontSize,
  fontWeight: CAPABILITY_SHAPE.fontWeight,
  sizeScale: CAPABILITY_SHAPE.sizeScale,
  stretch: CAPABILITY_SHAPE.stretch,
  x: 0,
  y: 0,
  lobeX: 0,
  lobeY: 0,
  sortIndex: 0,
  icon: null,
};

/**
 * A touchpoint is a capability in everything but its geometry: it wears the
 * palette, takes a size and a stretch, and carries the same snap points. What
 * it does not have is a domain — nothing lobes a touchpoint into a blob.
 */
export const TOUCHPOINT_DEFAULTS = {
  layer: null,
  title: TOUCHPOINT_SHAPE.title,
  description: '',
  owner: '',
  type: '',
  colorIndex: 1,
  fontSize: TOUCHPOINT_SHAPE.fontSize,
  fontWeight: TOUCHPOINT_SHAPE.fontWeight,
  sizeScale: TOUCHPOINT_SHAPE.sizeScale,
  stretch: TOUCHPOINT_SHAPE.stretch,
  x: 0,
  y: 0,
  sortIndex: 0,
  icon: null,
};

/** An actor is a circle, so it takes no stretch, and it wears no icon but its own. */
export const ACTOR_DEFAULTS = {
  layer: null,
  title: ACTOR_SHAPE.title,
  description: '',
  owner: '',
  type: '',
  colorIndex: 1,
  fontSize: ACTOR_SHAPE.fontSize,
  fontWeight: ACTOR_SHAPE.fontWeight,
  sizeScale: ACTOR_SHAPE.sizeScale,
  x: 0,
  y: 0,
  sortIndex: 0,
};

// fromPoint/toPoint start on opposite sides of the oval, which is what a line
// drawn by a file rather than by a gesture wants.
export const CONNECTOR_DEFAULTS = {
  description: '',
  fromPoint: 0,
  toPoint: 12,
  lineStyle: 'curved',
  anchored: false,
  bendPoints: [],
};

/** Fill in what was left out, and keep only the fields a record may carry. */
export function withDefaults(defaults, fields) {
  const record = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const given = fields?.[key] !== undefined && fields[key] !== null ? fields[key] : fallback;
    // A default array would otherwise be the same array on every record.
    record[key] = Array.isArray(given) ? [...given] : given;
  }
  return record;
}

/** Positions are whole numbers on the way in, as they were on the way to SQL. */
export const round = (value) => Math.round(value);

// --- validation --------------------------------------------------------------

// Each returns the first thing wrong, or null. First-error-wins, like the API's
// was: a file is refused with one sentence about it, not a list.

const given = (value) => value !== undefined && value !== null;

/** Every kind of record may be described, lines among them. */
const describes = (description) =>
  given(description) && description.length > MAX_TEXT_LENGTH
    ? `Description must be at most ${MAX_TEXT_LENGTH} characters.`
    : null;

function text(title, description, owner) {
  if (given(title) && (title.trim().length === 0 || title.length > MAX_TITLE_LENGTH))
    return `Title must be 1..${MAX_TITLE_LENGTH} characters.`;
  const described = describes(description);
  if (described) return described;
  if (given(owner) && owner.length > MAX_TITLE_LENGTH)
    return `Owner must be at most ${MAX_TITLE_LENGTH} characters.`;
  return null;
}

const color = (colorIndex) =>
  given(colorIndex) && (colorIndex < 1 || colorIndex > MAX_COLOR_INDEX)
    ? `colorIndex must be between 1 and ${MAX_COLOR_INDEX}.`
    : null;

function font(fontSize, fontWeight, sizes) {
  if (given(fontSize) && !sizes.includes(fontSize))
    return `fontSize must be one of ${sizes.join(', ')}.`;
  if (given(fontWeight) && !FONT_WEIGHTS.includes(fontWeight))
    return `fontWeight must be one of ${FONT_WEIGHTS.join(', ')}.`;
  return null;
}

const scale = (value, name, most = MAX_TITLE_SCALE) =>
  given(value) && (Number.isNaN(value) || value < MIN_SCALE || value > most)
    ? `${name} must be between ${MIN_SCALE} and ${most}.`
    : null;

const point = (value) =>
  given(value) && (value < 0 || value > MAX_POINT)
    ? `Connector points must be between 0 and ${MAX_POINT}.`
    : null;

function bends(bendPoints) {
  if (!given(bendPoints)) return null;
  if (!Array.isArray(bendPoints)) return 'bendPoints must be x,y pairs.';
  if (bendPoints.length % 2 !== 0) return 'bendPoints must be x,y pairs.';
  if (bendPoints.length > MAX_BEND_POINTS * 2)
    return `A line may have at most ${MAX_BEND_POINTS} bend points.`;
  return bendPoints.some((value) => !Number.isFinite(value))
    ? 'bendPoints must all be numbers.'
    : null;
}

const isHexColor = (value) =>
  typeof value === 'string'
  && (value.length === 4 || value.length === 7)
  && /^#[0-9a-f]+$/i.test(value);

/** The colours a map may wear: none of its own, or a full scale of them. */
export function validatePalette(palette) {
  if (!palette || palette.length === 0) return null;
  if (!PALETTE_SIZES.includes(palette.length))
    return `A palette must hold ${PALETTE_SIZES.join(', ')} colours.`;
  return palette.some((entry) => !isHexColor(entry))
    ? 'Every colour must be a hex value like #4a7c2f.'
    : null;
}

export function validateDomain(fields) {
  return text(fields.title, fields.description, fields.owner)
    ?? typed(fields.type)
    ?? color(fields.colorIndex)
    ?? font(fields.fontSize, fields.fontWeight, FONT_SIZES)
    ?? scale(fields.titleScale, 'titleScale')
    ?? (given(fields.titleWidth)
      && (Number.isNaN(fields.titleWidth)
        || fields.titleWidth < MIN_TITLE_WIDTH
        || fields.titleWidth > MAX_TITLE_WIDTH)
      ? `titleWidth must be between ${MIN_TITLE_WIDTH} and ${MAX_TITLE_WIDTH}.`
      : null)
    ?? (given(fields.opacity) && (fields.opacity < 10 || fields.opacity > 100)
      ? 'opacity must be between 10 and 100.'
      : null);
}

export function validateCapability(fields) {
  return text(fields.title, fields.description, fields.owner)
    ?? typed(fields.type)
    ?? color(fields.colorIndex)
    ?? font(fields.fontSize, fields.fontWeight, CAPABILITY_FONT_SIZES)
    ?? scale(fields.sizeScale, 'sizeScale', MAX_SIZE_SCALE)
    ?? (given(fields.stretch) && !STRETCHES.includes(fields.stretch)
      ? `stretch must be one of ${STRETCHES.join(', ')}.`
      : null)
    ?? validateIcon(fields.icon);
}

/** A touchpoint is checked as a capability is — the two differ only in geometry. */
export function validateTouchpoint(fields) {
  return validateCapability(fields);
}

export function validateActor(fields) {
  return text(fields.title, fields.description, fields.owner)
    ?? typed(fields.type)
    ?? color(fields.colorIndex)
    ?? font(fields.fontSize, fields.fontWeight, CAPABILITY_FONT_SIZES)
    ?? scale(fields.sizeScale, 'sizeScale', MAX_SIZE_SCALE);
}

export const validatorFor = {
  domain: validateDomain,
  capability: validateCapability,
  touchpoint: validateTouchpoint,
  actor: validateActor,
};

export function validateConnector(fields) {
  return describes(fields.description)
    ?? point(fields.fromPoint)
    ?? point(fields.toPoint)
    ?? (given(fields.lineStyle) && !LINE_STYLES.includes(fields.lineStyle)
      ? `lineStyle must be one of ${LINE_STYLES.join(', ')}.`
      : null)
    ?? bends(fields.bendPoints);
}

// --- layers ------------------------------------------------------------------

const isKey = (value) =>
  typeof value === 'string'
  && value.length > 0
  && value.length <= MAX_KEY_LENGTH
  && /^[a-z0-9][a-z0-9-]*$/.test(value);

/**
 * The stack a map is drawn on: at least one layer, bottom first, each with a
 * key of its own. The first is the base layer, which is why it may not be
 * hidden — there would be nothing left under the rest.
 */
export function validateLayers(layers) {
  if (layers == null) return null;
  if (!Array.isArray(layers) || layers.length === 0)
    return 'A map must have at least one layer.';
  if (layers.length > MAX_LAYERS) return `A map may have at most ${MAX_LAYERS} layers.`;

  const keys = new Set();
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') return 'Every layer must be a record.';
    if (!isKey(layer.key))
      return `Layer key '${layer.key}' must be lowercase letters, digits and dashes.`;
    if (keys.has(layer.key)) return `Two layers share the key '${layer.key}'.`;
    keys.add(layer.key);

    const titled = layer.title;
    if (given(titled) && (typeof titled !== 'string' || titled.length > MAX_TITLE_LENGTH))
      return `Layer '${layer.key}': title must be at most ${MAX_TITLE_LENGTH} characters.`;
  }
  if (layers[0].hidden === true) return 'The base layer cannot be hidden.';
  return null;
}

// --- types -------------------------------------------------------------------

const typed = (value) =>
  given(value) && (typeof value !== 'string' || value.length > MAX_TYPE_LENGTH)
    ? `Type must be at most ${MAX_TYPE_LENGTH} characters.`
    : null;

/**
 * The Type choices a map offers, one list per kind of element. A value on a
 * shape is always one of these, which is why a choice in use cannot be removed
 * — see typeUsage() in store.js, which is what refuses it.
 */
export function validateTypes(types) {
  if (types == null) return null;
  if (typeof types !== 'object' || Array.isArray(types)) return 'Types must be a record of lists.';

  for (const [kind, choices] of Object.entries(types)) {
    if (!ELEMENT_KINDS.includes(kind))
      return `'${kind}' is not a kind of element that carries a Type.`;
    if (!Array.isArray(choices)) return `Types for ${kind} must be a list.`;
    if (choices.length > MAX_TYPE_CHOICES)
      return `${kind} may have at most ${MAX_TYPE_CHOICES} Type choices.`;

    const seen = new Set();
    for (const choice of choices) {
      const wrong = typed(choice);
      if (wrong) return `Types for ${kind}: ${wrong}`;
      if (typeof choice !== 'string' || choice.trim().length === 0)
        return `Types for ${kind}: a choice cannot be blank.`;
      if (seen.has(choice)) return `Types for ${kind}: '${choice}' is listed twice.`;
      seen.add(choice);
    }
  }
  return null;
}

// --- icons -------------------------------------------------------------------

export const extensionOf = (name) => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
};

export function validateIcon(icon) {
  if (!given(icon) || icon.length === 0) return null;
  if (icon.length > 120) return 'An icon name must be at most 120 characters.';
  if (icon !== safeIconName(icon))
    return 'An icon must be a plain file name, with no folders in it.';
  return ICON_EXTENSIONS.includes(extensionOf(icon))
    ? null
    : `An icon must be one of ${ICON_EXTENSIONS.join(', ')}.`;
}

/**
 * The name reduced to something that can only ever land in one folder: no
 * separators, no climbing out, nothing but the characters a file needs.
 * Null when there is nothing usable left.
 */
export function safeIconName(name) {
  if (!name || name.trim().length === 0) return null;
  const bare = name.trim().split(/[\\/]/).pop();
  if (!bare || bare === '.' || bare === '..') return null;

  const cleaned = [...bare.toLowerCase()]
    .map((character) => (/[a-z0-9\-_.]/.test(character) ? character : '-'))
    .join('');
  const final = cleaned.replace(/^[-.]+/, '').replace(/[-.]+$/, '');
  return final.length > 0 ? final : null;
}

/** Script, event handlers and anything that reaches off the page. */
export function looksExecutable(markup) {
  const text_ = markup.toLowerCase();
  return text_.includes('<script')
    || text_.includes('javascript:')
    || text_.includes('<foreignobject')
    || text_.includes('<iframe')
    || /\son\w+\s*=/.test(text_);
}
