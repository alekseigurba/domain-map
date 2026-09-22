// What a valid map looks like. These were CHECK constraints in the schema and
// validation in the API; with neither of those left, this file is the only
// place that knows, so both the editor and the importer read it from here.

import { DOMAIN_SHAPE, CAPABILITY_SHAPE, TOUCHPOINT_SHAPE, ACTOR_SHAPE } from './defaults.js';
import * as shapes from './defaults.js';

/**
 * How a new area looks. A brand may shadow defaults.js, and one written before
 * there were areas has none in it: asked for by name, that missing export would
 * stop the page loading at all. Read off the module instead, it is merely
 * absent, and the area falls back on what the package itself would have said.
 */
export const AREA_SHAPE = shapes.AREA_SHAPE ?? Object.freeze({
  title: 'New area',
  color: '#5985ab',
  opacity: 10,
  fontSize: 64,
  fontWeight: 'bold',
  titleScale: 1,
});

export const MAX_TITLE_LENGTH = 200;
export const MAX_TEXT_LENGTH = 2000;

/**
 * The kinds of element a map is drawn from, and the order they are listed in.
 * Anything that walks every kind — the document, the menu, the layer stacks —
 * reads this rather than naming them itself.
 */
export const ELEMENT_KINDS = ['domain', 'capability', 'touchpoint', 'actor', 'area'];

/**
 * The kinds an area may hold. A capability is here for the loose ones only: one
 * inside a domain belongs through its domain, so a domain is never split
 * between two areas. An actor stands outside the business, and no team owns one.
 */
export const MEMBER_KINDS = ['domain', 'touchpoint', 'capability'];

/** The kinds a connector may be drawn between: the ones that carry snap points. */
export const ENDPOINT_KINDS = ['capability', 'touchpoint', 'actor'];

// --- the layers --------------------------------------------------------------

// The stack is a fixed conceptual model, not a list a map may edit. It lives
// here rather than in defaults.js because a brand may shadow that file, and
// what the layers *mean* is not a thing a deployment gets to redefine — only
// how its shapes look. A map file carries each layer's key and whether it is
// hidden or dimmed; the titles come from here.
//
// Bottom first, and the order is the paint order. Areas is under the
// other two because an area is the ground the domains stand on: its wash tints
// the paper, where painted over them it would tint every shape and title.

export const LAYERS = Object.freeze([
  Object.freeze({ key: 'areas', title: 'Areas' }),
  Object.freeze({ key: 'core', title: 'Domains' }),
  Object.freeze({ key: 'presentation', title: 'Presentation' }),
]);

/**
 * The base layer: the one that is never hidden, and where Edit mode opens. It
 * is named rather than read off the bottom of the stack — who owns the business
 * can be put away, and what the business does cannot.
 */
export const BASE_LAYER = 'core';

/**
 * Which layer each kind of element lives on. A domain is always core and an
 * actor is always presentation, so an element carries no layer of its own —
 * there is nothing for a file to say that could contradict this.
 */
export const LAYER_OF = Object.freeze({
  area: 'areas',
  domain: 'core',
  capability: 'core',
  touchpoint: 'presentation',
  actor: 'presentation',
});

/** The kinds that may be added to a layer, in the order their buttons sit in. */
export const KINDS_ON = Object.freeze({
  areas: ['area'],
  core: ['domain', 'capability'],
  presentation: ['touchpoint', 'actor'],
});

/**
 * What each kind may be connected to: strictly down the stack. A person reaches
 * the business through a channel, and a channel reaches a capability — so an
 * actor joins a touchpoint, a touchpoint joins a capability, and capabilities
 * join each other. Nothing else is a line this model can draw.
 */
export const CONNECTS_TO = Object.freeze({
  actor: 'touchpoint',
  touchpoint: 'capability',
  capability: 'capability',
});

/**
 * A line is stored under its upper end, which is the one that owns it. Between
 * two capabilities there is no upper end, and the map owns the line instead.
 */
export const OWNER_KIND = Object.freeze({
  actor: 'actor',
  touchpoint: 'touchpoint',
  capability: null,
});

/** Where a kind's own lines are written, under the element that owns them. */
export const NESTED_UNDER = Object.freeze({
  actor: 'interactions',
  touchpoint: 'connectors',
});

/**
 * The two ends of a line, put in stack order: the upper one first. A line has
 * two ends and no direction, so which end was drawn first means nothing — this
 * is what decides which of them the line is filed under.
 *
 * Null when the pair is not one this model allows.
 */
export function orderEnds(a, b) {
  if (CONNECTS_TO[a.kind] === b.kind) return { upper: a, lower: b };
  if (CONNECTS_TO[b.kind] === a.kind) return { upper: b, lower: a };
  return null;
}

/** "an actor", "a touchpoint" — only one of the kinds starts with a vowel. */
const a = (kind) => `${/^[aeiou]/.test(kind) ? 'an' : 'a'} ${kind}`;

/** Why these two cannot be joined, or null if they can. */
export function connectorRule(fromKind, toKind) {
  if (!ENDPOINT_KINDS.includes(fromKind) || !ENDPOINT_KINDS.includes(toKind)) {
    const wrong = ENDPOINT_KINDS.includes(fromKind) ? toKind : fromKind;
    return `A connector cannot end on ${a(wrong)}.`;
  }
  if (orderEnds({ kind: fromKind }, { kind: toKind })) return null;
  // Naming what *is* allowed is more use than naming what is not.
  const opening = a(fromKind);
  return `${opening[0].toUpperCase()}${opening.slice(1)} connects to `
    + `${a(CONNECTS_TO[fromKind])}, not to ${a(toKind)}.`;
}

export const MAX_KEY_LENGTH = 64;

/**
 * How long a version's name may be. A version is named, not described: the name
 * is also its address, since `?version=` names it, so it stays short enough to
 * paste into one.
 */
export const MAX_VERSION_NAME_LENGTH = 64;

/**
 * What a version may be called. Anything but a slash, which would make the name
 * look like a path and never reach the version it means.
 */
export function validateVersionName(name) {
  if (typeof name !== 'string' || name.trim().length === 0) return 'A version needs a name.';
  const bare = name.trim();
  if (bare.length > MAX_VERSION_NAME_LENGTH)
    return `A version's name must be at most ${MAX_VERSION_NAME_LENGTH} characters.`;
  return bare.includes('/') ? "A version's name cannot hold a slash." : null;
}

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
/** Which side of its title a shape's icon sits on. Over it is where it has always been. */
export const ICON_PLACEMENTS = ['top', 'left', 'bottom', 'right'];
export const DEFAULT_ICON_PLACEMENT = 'top';
/**
 * How heavy an SVG icon's lines are drawn, as a multiple of what its file says.
 * A multiple rather than a width, because a width means nothing without the
 * grid it is on: 2 is a bold line on a 24-unit icon and a hairline on a 64.
 */
export const MIN_ICON_WEIGHT = 0.5;
export const MAX_ICON_WEIGHT = 4;
export const DEFAULT_ICON_WEIGHT = 1;
export const MAX_ICON_BYTES = 512 * 1024;

// --- defaults ----------------------------------------------------------------

// What a record is when the caller or the file leaves a field out. These were
// the column defaults, applied by the insert; now they are applied here.
//
// How a shape looks comes from defaults.js. Colour is the exception: there it
// is a hex, here it has to be a palette swatch, and there is no palette to hand
// to find one in — so a file that names no colour gets the first swatch.

/**
 * What a map says about a layer: which one, and how it opens. `hidden` and
 * `dimmed` are what the document opens at — the layer control changes them for
 * the tab only, unless an owner is editing. The title is not here: it belongs
 * to the model, not to the file.
 */
export const LAYER_DEFAULTS = {
  key: '',
  hidden: false,
  dimmed: false,
};

/**
 * An area has no size of its own: it is a band drawn round whatever names it.
 * Its position is where it sits while it holds nothing, and its title rides
 * the border at an angle round it — null is the top, where a legend belongs.
 */
export const AREA_DEFAULTS = {
  title: AREA_SHAPE.title,
  description: '',
  owner: '',
  ownerId: null,
  type: '',
  colorIndex: 1,
  x: 0,
  y: 0,
  titleAngle: null,
  fontWeight: AREA_SHAPE.fontWeight,
  fontSize: AREA_SHAPE.fontSize,
  titleScale: AREA_SHAPE.titleScale,
  opacity: AREA_SHAPE.opacity,
};

export const DOMAIN_DEFAULTS = {
  areaId: null,
  title: DOMAIN_SHAPE.title,
  description: '',
  owner: '',
  ownerId: null,
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
  domainId: null,
  /** A loose capability's own. One inside a domain belongs through the domain. */
  areaId: null,
  title: CAPABILITY_SHAPE.title,
  description: '',
  owner: '',
  ownerId: null,
  type: '',
  colorIndex: 1,
  fontSize: CAPABILITY_SHAPE.fontSize,
  fontWeight: CAPABILITY_SHAPE.fontWeight,
  sizeScale: CAPABILITY_SHAPE.sizeScale,
  stretch: CAPABILITY_SHAPE.stretch,
  opacity: CAPABILITY_SHAPE.opacity,
  x: 0,
  y: 0,
  lobeX: 0,
  lobeY: 0,
  sortIndex: 0,
  icon: null,
  iconPlacement: DEFAULT_ICON_PLACEMENT,
  iconWeight: DEFAULT_ICON_WEIGHT,
};

/**
 * A touchpoint is a capability in everything but its geometry: it wears the
 * palette, takes a size and a stretch, and carries the same snap points. What
 * it does not have is a domain — nothing lobes a touchpoint into a blob.
 */
export const TOUCHPOINT_DEFAULTS = {
  areaId: null,
  title: TOUCHPOINT_SHAPE.title,
  description: '',
  owner: '',
  ownerId: null,
  type: '',
  colorIndex: 1,
  fontSize: TOUCHPOINT_SHAPE.fontSize,
  fontWeight: TOUCHPOINT_SHAPE.fontWeight,
  sizeScale: TOUCHPOINT_SHAPE.sizeScale,
  stretch: TOUCHPOINT_SHAPE.stretch,
  opacity: TOUCHPOINT_SHAPE.opacity,
  x: 0,
  y: 0,
  sortIndex: 0,
  icon: null,
  iconPlacement: DEFAULT_ICON_PLACEMENT,
  iconWeight: DEFAULT_ICON_WEIGHT,
};

/**
 * An actor is a circle, so it takes no stretch, and it wears no icon but its
 * own — though which side of the name the figure stands on is its to choose.
 */
export const ACTOR_DEFAULTS = {
  title: ACTOR_SHAPE.title,
  description: '',
  owner: '',
  ownerId: null,
  type: '',
  colorIndex: 1,
  fontSize: ACTOR_SHAPE.fontSize,
  fontWeight: ACTOR_SHAPE.fontWeight,
  sizeScale: ACTOR_SHAPE.sizeScale,
  opacity: ACTOR_SHAPE.opacity,
  x: 0,
  y: 0,
  sortIndex: 0,
  iconPlacement: DEFAULT_ICON_PLACEMENT,
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

/**
 * What a map says about itself: what the business is, in the owner's words. It
 * is what makes a review of the map specific rather than generic, and it is held
 * to the length of any other description.
 */
export const validateMapDescription = (description) =>
  (given(description) && typeof description !== 'string'
    ? "The map's description must be text."
    : describes(description));

function text(title, description, owner, ownerId) {
  if (given(title) && (title.trim().length === 0 || title.length > MAX_TITLE_LENGTH))
    return `Title must be 1..${MAX_TITLE_LENGTH} characters.`;
  const described = describes(description);
  if (described) return described;
  if (given(owner) && owner.length > MAX_TITLE_LENGTH)
    return `Owner must be at most ${MAX_TITLE_LENGTH} characters.`;
  // The id of the person the owner's name was picked from, when it was. It is
  // the people table's, so a file only carries it and never makes one up.
  if (given(ownerId) && (typeof ownerId !== 'string' || ownerId.length === 0 || ownerId.length > MAX_TITLE_LENGTH))
    return 'ownerId must be a short string.';
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
  return text(fields.title, fields.description, fields.owner, fields.ownerId)
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
    ?? faded(fields.opacity);
}

/**
 * How solid a shape is drawn, on one scale for every kind that has one. It
 * stops at 10 because a shape at nothing is a shape nobody can find again; an
 * area is the exception, since its border is still there at 0.
 */
const faded = (opacity, least = 10) =>
  (given(opacity) && (opacity < least || opacity > 100)
    ? `opacity must be between ${least} and 100.`
    : null);

/** Where round the border an area's title rides: degrees, clockwise from the right. */
export const MAX_TITLE_ANGLE = 360;

export function validateArea(fields) {
  return text(fields.title, fields.description, fields.owner, fields.ownerId)
    ?? typed(fields.type)
    ?? color(fields.colorIndex)
    ?? font(fields.fontSize, fields.fontWeight, FONT_SIZES)
    ?? scale(fields.titleScale, 'titleScale')
    ?? (given(fields.titleAngle)
      && !(fields.titleAngle >= 0 && fields.titleAngle < MAX_TITLE_ANGLE)
      ? `titleAngle must be from 0 up to ${MAX_TITLE_ANGLE}.`
      : null)
    ?? faded(fields.opacity, 0);
}

/** Which side of the title an icon sits on. */
const placed = (placement) =>
  (given(placement) && !ICON_PLACEMENTS.includes(placement)
    ? `iconPlacement must be one of ${ICON_PLACEMENTS.join(', ')}.`
    : null);

export function validateCapability(fields) {
  return text(fields.title, fields.description, fields.owner, fields.ownerId)
    ?? typed(fields.type)
    ?? color(fields.colorIndex)
    ?? font(fields.fontSize, fields.fontWeight, CAPABILITY_FONT_SIZES)
    ?? scale(fields.sizeScale, 'sizeScale', MAX_SIZE_SCALE)
    ?? (given(fields.stretch) && !STRETCHES.includes(fields.stretch)
      ? `stretch must be one of ${STRETCHES.join(', ')}.`
      : null)
    ?? faded(fields.opacity)
    ?? validateIcon(fields.icon)
    ?? placed(fields.iconPlacement)
    ?? (given(fields.iconWeight)
      && !(fields.iconWeight >= MIN_ICON_WEIGHT && fields.iconWeight <= MAX_ICON_WEIGHT)
      ? `iconWeight must be between ${MIN_ICON_WEIGHT} and ${MAX_ICON_WEIGHT}.`
      : null);
}

/** A touchpoint is checked as a capability is — the two differ only in geometry. */
export function validateTouchpoint(fields) {
  return validateCapability(fields);
}

export function validateActor(fields) {
  return text(fields.title, fields.description, fields.owner, fields.ownerId)
    ?? typed(fields.type)
    ?? color(fields.colorIndex)
    ?? font(fields.fontSize, fields.fontWeight, CAPABILITY_FONT_SIZES)
    ?? scale(fields.sizeScale, 'sizeScale', MAX_SIZE_SCALE)
    ?? faded(fields.opacity)
    ?? placed(fields.iconPlacement);
}

export const validatorFor = {
  area: validateArea,
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

/**
 * What a file may say about the stack. The stack itself is fixed, so a file
 * does not describe it — it only names layers that exist and says how each one
 * opens. The base layer may not be hidden: there would be nothing left under
 * the rest.
 */
export function validateLayers(layers) {
  if (layers == null) return null;
  if (!Array.isArray(layers)) return 'Layers must be a list.';

  const keys = new Set();
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') return 'Every layer must be a record.';
    if (!LAYERS.some((one) => one.key === layer.key)) {
      const known = LAYERS.map((one) => one.key);
      return `'${layer.key}' is not a layer of this map. `
        + `The layers are ${known.slice(0, -1).join(', ')} and ${known.at(-1)}.`;
    }
    if (keys.has(layer.key)) return `Two layers share the key '${layer.key}'.`;
    keys.add(layer.key);

    if (layer.key === BASE_LAYER && layer.hidden === true)
      return 'The base layer cannot be hidden.';
  }
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
