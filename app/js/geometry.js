// Shape maths: text measurement, capability ovals, snap points, lobed domain
// blobs and the flower layout inside each lobe, and the band an area draws
// round what it holds. Pure functions — no DOM writes.

import { DOMAIN_SHAPE, CAPABILITY_SHAPE } from './defaults.js';
import { AREA_SHAPE, DEFAULT_FEATURE_STRETCH } from './rules.js';

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* The sizes a domain title may be set at. A domain name is read from further
   out than anything else on the map, so the scale runs coarser and higher than
   the capability one below. */
export const FONT_SIZES = [32, 36, 48, 64, 72, 80, 100];
export const FONT_WEIGHTS = ['regular', 'bold'];

/**
 * Capability type is a scale of its own, deliberately not the domain scale
 * above: a capability's title is a label on a shape, not running copy, and the
 * two are free to move apart.
 */
export const CAPABILITY_FONT_SIZES = [24, 32, 36, 48, 52, 56, 64, 72, 80];

/** Every size the palette may be extended to. */
export const PALETTE_SIZES = [12, 18, 24];
/* The stock palette: the stylesheet's 24 fills, --c1 … --c24. */
export const DEFAULT_PALETTE = Array.from({ length: 24 }, (_, i) => cssVar(`--c${i + 1}`) || '#86a27b');

/**
 * The palette in play, as the map holds it. The map carries its own once one
 * has been edited; until then it is the stylesheet's. This is what the palette
 * editor edits and what a default colour is matched to a swatch of, and it is
 * the same list whichever theme the page is in.
 */
export let PALETTE = [...DEFAULT_PALETTE];

/**
 * The colours the shapes are drawn in, swatch for swatch: the palette itself on
 * a light map, and each swatch's dark counterpart on a dark one. Everything
 * that paints a shape, or a swatch standing for one, reads this.
 */
export let COLORS = [...PALETTE];

/** Point the shapes at a palette — the map's own, or back to the stylesheet's. */
export function setPalette(colors) {
  PALETTE = colors?.length ? [...colors] : [...DEFAULT_PALETTE];
  COLORS = drawn();
}

/**
 * The swatch a colour is worn as, counted from 1 the way colorIndex is: the
 * one holding exactly that colour, or failing that the nearest. A shape stores
 * a swatch rather than a colour, so a default written as hex has to land on
 * one — and a map whose palette has been edited may no longer hold it.
 */
export function swatchFor(hex) {
  const wanted = channels(hex);
  let best = 0;
  let distance = Infinity;
  // The palette, not what is drawn: a default is a colour of the map's, and on
  // a dark map none of the swatches is drawn in the colour it holds.
  PALETTE.forEach((color, i) => {
    const d = channels(color).reduce((sum, value, c) => sum + (value - wanted[c]) ** 2, 0);
    if (d < distance) {
      best = i;
      distance = d;
    }
  });
  return best + 1;
}

export const SNAP_COUNT = 24;
export const MAX_LINES = 3;
/** A capability's oval is fixed, so its type wraps into however many rows fit. */
export const MAX_CAPABILITY_LINES = 8;
/* The defaults themselves are in defaults.js; these are the names the drawing
   code falls back on when a record carries no value of its own. */
export const DEFAULT_FONT_SIZE = CAPABILITY_SHAPE.fontSize;
export const DEFAULT_DOMAIN_FONT_SIZE = DOMAIN_SHAPE.fontSize;
export const DEFAULT_FONT_WEIGHT = DOMAIN_SHAPE.fontWeight;
export const DEFAULT_CAPABILITY_FONT_WEIGHT = CAPABILITY_SHAPE.fontWeight;
export const DEFAULT_OPACITY = DOMAIN_SHAPE.opacity; // percent
export const DEFAULT_STRETCH = CAPABILITY_SHAPE.stretch;

/**
 * A capability's oval is sized by its scale and nothing else. Type size used to
 * push the shape about, which made laying a map out a fight between the two;
 * now the shape is chosen and the words wrap into it.
 */
export const SIZE_SCALES = [1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3];
/** A domain's title box is scaled on its own, and on the older, finer scale. */
export const TITLE_SCALES = [0.6, 0.8, 1, 1.25, 1.5, 2];
export const BASE_RX = 130;
export const BASE_RY = 84;

/**
 * How a capability's oval leans, from standing tall (-2) through round (0) to
 * lying wide (2). The two radii trade places in even steps, so the middle step
 * is a circle and the two ends are the same oval a quarter turn apart. Wide is
 * the shape capabilities have always had.
 */
export const OVAL_STRETCHES = [-2, -1, 0, 1, 2];

export const LINE_STYLES = ['straight', 'curved'];

/** How far the title lobe may hang off the body, as a share of its diameter. */
export const TITLE_OVERHANG = 0.6;

/** How narrow and how wide a domain title's text area may be dragged. */
export const MIN_TITLE_WIDTH = 40;
export const MAX_TITLE_WIDTH = 2000;
/** The width a title wraps at until one is set, as a multiple of the font size. */
export const TITLE_WIDTH_PER_EM = 7;

/** Clear air between two capabilities in a domain, and between two domains. */
export const CAPABILITY_GAP = 50;
export const DOMAIN_GAP = 75;

/* Breathing room around a capability's text, as a share of the font size. */
const PAD_X = 0.25;
const PAD_Y = 0.14;
/* A domain title sits in a box of its own, and wants far less air at the sides:
   the box is drawn around the text, so any slack there reads as a gap. */
const TITLE_PAD_X = 0.1;

/* A shape's icon, as shares of its font size. It is drawn half as large again as
   the type beside it, which is what lets a drawing hold its own against a word,
   and gives way down to the type's own size before the words lose a row to it.
   ICON_PAD is the air kept between it and the rim. */
const ICON_SHARE = 1.5;
const ICON_MIN_SHARE = 1;
const ICON_PAD = 0.25;
/* The air between an icon and the words, measured from what is drawn to what is
   drawn: the ink of the icon on one side, the letters on the other. A little
   more is wanted beside a title than over one, where the eye is already used to
   the space between two rows. */
const ICON_GAP = 0.2;
const ICON_SIDE_GAP = 0.3;
/* A row of type is a box taller than its letters. This is how far the capitals
   sit under the top of it, and the baseline over the foot of it — air the gap
   above would otherwise be added to, which is how an icon came to float. */
const TYPE_INSET_TOP = 0.22;
const TYPE_INSET_BOTTOM = 0.1;
/* An icon far from square is given its long side: a wide drawing held to a
   square box comes out a sliver. This is how far past the square it may go. */
const ICON_LONG_SIDE = 1.5;

const LOBE_PAD = 34;      // ring of blob around each capability
const BODY_REACH = 0.6;   // how far past its outermost lobes' middles the body reaches, as a share of their radii
const BODY_ASPECT = 1.2;  // an empty domain's body is a little wider than it is tall

const heading = cssVar('--font-heading') || 'ui-serif, serif';
const canvas = document.createElement('canvas');
const context = canvas.getContext('2d');

export const cssWeight = (weight) => (weight === 'regular' ? 'normal' : 'bold');

export function measure(text, fontSize, weight = 'regular') {
  context.font = `${weight === 'bold' ? 'bold ' : ''}${fontSize}px ${heading}`;
  return context.measureText(text).width;
}

/**
 * Greedy word wrap, tail cut with an ellipsis. A newline in `text` is a break
 * the author asked for: it always starts a row, and the row budget grows to
 * hold it. Text with no newlines wraps into `maxLines` rows, as it always has.
 */
export function wrapLines(text, fontSize, maxWidth, maxLines = MAX_LINES, weight = 'regular') {
  const paragraphs = String(text ?? '')
    .split('\n')
    .map((paragraph) => paragraph.trim().split(/\s+/).filter(Boolean));
  if (paragraphs.every((words) => words.length === 0)) return [''];

  const budget = Math.max(maxLines, paragraphs.length);
  // Every break the author typed keeps a row of its own; the rows left over are
  // what wrapping gets to spend, first paragraph first.
  let spare = budget - paragraphs.length;

  const rows = [];
  for (const words of paragraphs) {
    if (words.length === 0) {
      rows.push('');   // a deliberate blank row
      continue;
    }

    const wrapped = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && measure(candidate, fontSize, weight) > maxWidth) {
        wrapped.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    wrapped.push(line);

    const allowed = 1 + Math.min(spare, wrapped.length - 1);
    spare -= allowed - 1;
    rows.push(...wrapped.slice(0, allowed));
    if (allowed < wrapped.length) {
      // This paragraph outran its rows: fold the rest into the last and cut it.
      rows[rows.length - 1] = ellipsize(
        wrapped.slice(allowed - 1).join(' '), fontSize, maxWidth, weight);
    }
  }

  return rows;
}

function ellipsize(text, fontSize, maxWidth, weight = 'regular') {
  if (measure(text, fontSize, weight) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, fontSize, weight) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

// --- ink -------------------------------------------------------------------

function channels(hex) {
  const value = String(hex).trim().replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const number = Number.parseInt(full, 16);
  return Number.isNaN(number)
    ? [255, 255, 255]
    : [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

const luminance = ([r, g, b]) => {
  const linear = [r, g, b].map((v) => {
    const channel = v / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

/**
 * Black or white, whichever reads better on `fill` — the palette runs from pale
 * pink to mid green, so one fixed ink colour cannot serve all twelve.
 * `opacity` blends the fill onto `backdrop` first (domain blobs are see-through).
 */
export function inkOn(fill, opacity = 1, backdrop = '#fffdfa') {
  const front = channels(fill);
  const back = channels(backdrop);
  const blended = front.map((value, i) => value * opacity + back[i] * (1 - opacity));
  const l = luminance(blended);
  // Contrast ratio against black vs white, using the WCAG formula.
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? '#000' : '#fff';
}

/** The WCAG contrast ratio between two colours, 1 to 21. */
function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** What type needs against its ground to be read as type. */
export const READABLE = 4.5;

/** Three channels as the hex they are written as. */
const asHex = (rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`;

/* The page's two inks, as tokens.css has them: the dark one read on light
   paper and the light one read on dark. */
const INK_ON_LIGHT = '#282828';
const INK_ON_DARK = '#e7eae4';

/**
 * A colour as type: itself if it reads on `backdrop`, and otherwise mixed
 * towards `ink` by just as much as it takes. An area's title wears its border's
 * colour, and half the palette is too pale to be read as letters — so a blue
 * line keeps a blue title and a yellow one gets a dark olive, which still
 * belongs to its line and can still be read.
 *
 * Left unsaid, the ink is whichever of the page's two reads on that ground. On
 * dark paper it is the dim colours that cannot be read, and they are lifted
 * towards the light ink instead: mixed towards the dark one they would only
 * sink further into the paper.
 */
export function deepened(hex, backdrop = '#fffdfa', ink = null) {
  const from = channels(hex);
  const to = channels(ink ?? (inkOn(backdrop) === '#000' ? INK_ON_LIGHT : INK_ON_DARK));
  const back = channels(backdrop);
  const mixed = (share) => from.map((value, i) => Math.round(value + (to[i] - value) * share));

  if (contrast(from, back) >= READABLE) return asHex(from);
  // An ink that cannot be read on this ground either is as far as mixing goes.
  if (contrast(to, back) < READABLE) return asHex(to);

  let pale = 0;
  let dark = 1;
  for (let i = 0; i < 12; i++) {
    const middle = (pale + dark) / 2;
    if (contrast(mixed(middle), back) >= READABLE) dark = middle;
    else pale = middle;
  }
  return asHex(mixed(dark));
}

// --- the dark map ------------------------------------------------------------

// A map has one palette and two ways of being drawn in it. On dark paper the
// swatches as they stand are a row of lit windows: a pale pink or a yellow
// that sat quietly on white is the brightest thing on the screen. So a dark map
// draws each swatch's dark counterpart — and works it out from the swatch
// rather than keeping a second palette, so that a map whose palette has been
// edited, and a brand that recoloured the stock one before there was a dark
// theme, come out dark without either of them having to say anything.

/* How bright a fill may be on dark paper, as luminance. A colour keeps
   DARK_SHARE of its own brightness on top of DARK_FLOOR, so the pale end of a
   palette comes down by half and stays its pale end. The floor is where black
   type starts to read at 4.5 to 1: nothing that carried black type on the
   light map is taken below it, since a capability's title stays black. */
const DARK_FLOOR = 0.18;
const DARK_SHARE = 0.27;

/** What large type needs against its ground. A title on the map is never small. */
const READABLE_LARGE = 3;

/** One channel as light, and light as a channel: the two ends of the sRGB curve. */
const asLight = (value) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};
const asChannel = (light) => Math.round(
  255 * (light <= 0.0031308 ? light * 12.92 : 1.055 * light ** (1 / 2.4) - 0.055));

/**
 * A swatch as it is drawn on dark paper: the same colour in less light. Every
 * channel is dimmed by the same share, as light rather than as the number
 * written in the hex, so the hue and how saturated it is are exactly what they
 * were — a yellow becomes the same yellow in a darker room, not a brown picked
 * to stand in for it.
 *
 * It only ever dims. A swatch already deep enough for dark paper is left as it
 * is: lifted to match the rest, a dark red would be drawn paler on the dark map
 * than on the light one.
 */
export function darkCounterpart(hex) {
  const light = channels(hex).map(asLight);
  const brightness = 0.2126 * light[0] + 0.7152 * light[1] + 0.0722 * light[2];
  const wanted = DARK_FLOOR + DARK_SHARE * brightness;
  if (wanted >= brightness) return asHex(channels(hex));
  return asHex(light.map((value) => asChannel(value * (wanted / brightness))));
}

/* A stylesheet may name a swatch's dark counterpart itself, as --c1-dark …
   --c24-dark. None is named by the package: one that is, is a brand's choice. */
const NAMED_DARK = DEFAULT_PALETTE.map((_, i) => cssVar(`--c${i + 1}-dark`));

const sameColor = (a, b) => channels(a).join() === channels(b).join();

/** Whether the map is being drawn on dark paper. */
let darkMap = false;
export const isDarkMap = () => darkMap;

/**
 * The palette as it is drawn right now. What the stylesheet says of a swatch
 * holds for the stylesheet's swatch: once a map has made that swatch another
 * colour, the counterpart named for the old one is no longer its counterpart.
 */
function drawn() {
  if (!darkMap) return [...PALETTE];
  return PALETTE.map((color, i) => (NAMED_DARK[i] && sameColor(color, DEFAULT_PALETTE[i])
    ? NAMED_DARK[i]
    : darkCounterpart(color)));
}

/** Draw the map for dark paper, or for light. The palette is the same either way. */
export function setDarkMap(on) {
  darkMap = Boolean(on);
  COLORS = drawn();
}

/**
 * The ink of a capability's title on a dark map. Black, as on the light one,
 * for as long as black can be read: the dark counterparts are kept light enough
 * for it, so a label is the same label on every swatch. What black cannot be
 * read on is a shape made see-through, where the dark paper comes up through
 * the fill — an actor starts at half — and there the title turns white.
 */
export function darkMapInk(fill, opacity = 1, backdrop = '#141613') {
  const front = channels(fill);
  const back = channels(backdrop);
  const blended = front.map((value, i) => value * opacity + back[i] * (1 - opacity));
  return contrast(blended, [0, 0, 0]) >= READABLE_LARGE ? '#000' : '#fff';
}

// theme-first.js has said which theme the page is in before any module runs.
setDarkMap(document.documentElement.dataset?.theme === 'dark');

// --- capabilities ----------------------------------------------------------

/**
 * The text block of a shape: wrapped lines and the box they need. Shared by
 * capability ovals and domain titles, so both wrap the same way.
 */
function textBlock(title, fontSize, weight, maxWidth = fontSize * 8, maxLines = MAX_LINES) {
  const lineHeight = fontSize * 1.18;
  const lines = wrapLines(title, fontSize, maxWidth, maxLines, weight);
  return {
    lines,
    lineHeight,
    fontSize,
    fontWeight: weight,
    width: Math.max(...lines.map((l) => measure(l, fontSize, weight)), fontSize),
    height: lines.length * lineHeight,
  };
}

/**
 * An oval of two radii at one step of its lean: the long radius and the short
 * one move towards each other a step at a time, so round is the mean of the
 * two and the ends are the same oval a quarter turn apart. A value off the
 * scale is held to its nearer end.
 */
function leaning(long, short, stretch) {
  const tallest = OVAL_STRETCHES[0];
  const widest = OVAL_STRETCHES[OVAL_STRETCHES.length - 1];
  const held = Math.min(widest, Math.max(tallest, stretch));
  const wide = (held - tallest) / (widest - tallest); // 0 standing tall, 1 lying wide
  return {
    rx: short + (long - short) * wide,
    ry: long + (short - long) * wide,
  };
}

/** The radii of a capability's oval at 1x. `??` and not `||`, since round is 0. */
const ovalRadii = (stretch) => leaning(BASE_RX, BASE_RY, stretch ?? DEFAULT_STRETCH);

/** Which side of its title an icon sits on. Mirrors rules.js. */
export const ICON_PLACEMENTS = ['top', 'left', 'bottom', 'right'];
export const DEFAULT_ICON_PLACEMENT = 'top';

/**
 * Where the drawing is inside each icon's file, as the diagram has measured it.
 * Most icons are drawn with a margin round them, and a wide one in a square
 * file has a great deal over and under it. Laid out by the file, that margin
 * turns up on the map as a gap nobody asked for; laid out by the ink, the gap
 * is the one chosen here. Measuring takes a canvas, so it is the diagram's job —
 * this only keeps what it found, the way setPalette keeps the colours.
 */
const iconInks = new Map();

/** The whole file, square: what an icon is taken for until it has been measured. */
export const WHOLE_ICON = Object.freeze({ x: 0, y: 0, width: 1, height: 1, aspect: 1 });

/**
 * `ink` is the box the drawing covers, as shares of the picture, and `aspect`
 * the picture's own width over its height.
 */
export function setIconInk(name, ink) {
  iconInks.set(name, ink);
}

export const iconInkOf = (name) => iconInks.get(name) ?? WHOLE_ICON;

/** How far an SVG icon's lines may be thinned or thickened, as a multiple of the file's own. Mirrors rules.js. */
export const MIN_ICON_WEIGHT = 0.5;
export const MAX_ICON_WEIGHT = 4;
export const DEFAULT_ICON_WEIGHT = 1;

/** The weight a record draws its icon at. Only an SVG has lines to weigh. */
export const iconWeightOf = (record) =>
  (/\.svg$/i.test(record.icon ?? '') ? record.iconWeight || DEFAULT_ICON_WEIGHT : DEFAULT_ICON_WEIGHT);

/**
 * What an icon's ink is kept under. The same file drawn heavier covers a little
 * more of its picture, so each weight is measured as a drawing of its own.
 */
export const iconKeyOf = (record) => {
  const weight = iconWeightOf(record);
  return weight === DEFAULT_ICON_WEIGHT ? record.icon : `${record.icon}@${weight}`;
};

/**
 * How wide and how tall an icon's ink is drawn, as multiples of its nominal
 * size. A square drawing is that size both ways. Any other keeps its area, so a
 * wide one and a tall one weigh the same on the map, until its long side meets
 * ICON_LONG_SIDE; past that it is simply scaled to fit.
 */
function inkShares(ink) {
  const aspect = (ink.width * ink.aspect) / ink.height || 1;
  if (aspect >= 1) {
    const wide = Math.min(Math.sqrt(aspect), ICON_LONG_SIDE);
    return { wide, tall: wide / aspect };
  }
  const tall = Math.min(Math.sqrt(1 / aspect), ICON_LONG_SIDE);
  return { wide: tall * aspect, tall };
}

/**
 * Where to put an icon's <image> so that its ink lands on the box the layout
 * gave it: the picture is scaled until the drawing is the size wanted, and its
 * margin is left to hang outside, where it shows as nothing.
 */
export function iconImageBox(size, ink = WHOLE_ICON) {
  const width = size.iconWidth / ink.width;
  const height = width / ink.aspect;
  return {
    x: size.iconX - size.iconWidth / 2 - ink.x * width,
    y: size.iconY - size.iconHeight / 2 - ink.y * height,
    width,
    height,
  };
}

/**
 * How far a box may go inside a shape before its corners meet the rim: `up`
 * for a box so wide, from the middle towards the top or the foot, and `out`
 * for a box so tall, towards either side. In an oval a narrow box gets nearly
 * the whole radius and one as wide as the oval gets none; in a rectangle the
 * way is the same whatever the box.
 */
const reachIn = (rx, ry, curved = true) => ({
  up: (width) => (curved ? ry * Math.sqrt(Math.max(0, 1 - (width / 2 / rx) ** 2)) : ry),
  out: (height) => (curved ? rx * Math.sqrt(Math.max(0, 1 - (height / 2 / ry) ** 2)) : rx),
});

/**
 * The icon and the words along one axis, the icon first. `reach` is how far
 * from the middle the icon's outer edge may go; `earliest` and `latest` are the
 * bounds on where the words may start, from the shape they are in. The icon
 * takes what the words leave, between `least` and `full`, and `along` turns its
 * nominal size into its length on this axis.
 *
 * The pair straddles the middle for as long as it fits there. One too long for
 * that moves towards the icon's side, where the room is, and one too long for
 * the shape altogether is centred in the room there is, so it spills evenly.
 */
function settle({ reach, earliest, latest, extent, gap, along, full, least }) {
  const iconSize = Math.max(least, Math.min(full, (reach + latest - gap) / along));
  const length = iconSize * along;
  const soonest = Math.max(length + gap - reach, earliest);
  const centred = (length + gap - extent) / 2;
  const start = soonest > latest
    ? (soonest + latest) / 2
    : Math.min(Math.max(centred, soonest), latest);
  return { iconSize, iconAt: start - gap - length / 2, wordsAt: start + extent / 2 };
}

/**
 * An icon and a block of words, laid out as one. `roomX` by `roomY` is the box
 * the words wrap into, and `reach` how far a box may go in the shape — which is
 * what lets the pair use the shape rather than the box. An icon is small, so it
 * fits up in the crown of an oval or out in the end of one, where a row of
 * words never would; and a short row at the far end may sit further out than a
 * full one, which is room handed on to the icon.
 *
 * The words are wrapped first, into the room left by the smallest icon, and the
 * icon then takes what they leave, up to `full`. Adding an icon used to cost a
 * title a row outright — which sent people to a smaller font to get the row
 * back, and the icon, sized off the font, shrank with it.
 */
function iconStack({ title, fontSize, fontWeight, roomX, roomY, reach, full, least, placement, ink }) {
  const lineHeight = fontSize * 1.18;
  const pad = fontSize * ICON_PAD;
  const shares = inkShares(ink ?? WHOLE_ICON);
  const side = placement === 'left' || placement === 'right';
  // Right and bottom are left and top seen in a mirror: laid out the one way,
  // and turned round at the end.
  const turned = placement === 'right' || placement === 'bottom' ? -1 : 1;

  let block;
  let laid;
  if (side) {
    const gap = fontSize * ICON_SIDE_GAP;
    const edge = reach.out(full * shares.tall) - pad;
    const rows = Math.max(1, Math.min(MAX_CAPABILITY_LINES, Math.floor(roomY / lineHeight)));
    // The words give up the width the smallest icon needs, and no more.
    const wrapAt = Math.max(fontSize, edge + roomX / 2 - least * shares.wide - gap);
    block = textBlock(title, fontSize, fontWeight, wrapAt, rows);

    // Every row is centred on the same line, and each may run as far out as
    // the shape allows at the height it sits — further in the middle rows of an
    // oval than in the first and last.
    const widths = block.lines.map((line) => measure(line, fontSize, fontWeight));
    const limits = block.lines.map((line, row) => {
      const top = -block.height / 2 + row * lineHeight;
      const far = Math.max(Math.abs(top), Math.abs(top + lineHeight));
      return Math.max(roomX / 2, reach.out(far * 2) - fontSize * PAD_X);
    });
    laid = settle({
      reach: edge,
      earliest: Math.max(...limits.map((limit, row) => widths[row] / 2 - limit)) - block.width / 2,
      latest: Math.min(...limits.map((limit, row) => limit - widths[row] / 2)) - block.width / 2,
      extent: block.width,
      gap,
      along: shares.wide,
      full,
      least,
    });
  } else {
    // The gap is between ink and letters, so the air the row of type carries
    // on the icon's side of it is taken off.
    const inset = placement === 'bottom' ? TYPE_INSET_BOTTOM : TYPE_INSET_TOP;
    const gap = fontSize * (ICON_GAP - inset);
    const edge = reach.up(full * shares.wide) - pad;
    // Text that still will not fit is cut with an ellipsis, as it always was.
    const rows = Math.max(1, Math.min(
      MAX_CAPABILITY_LINES,
      Math.floor((edge + roomY / 2 - least * shares.tall - gap) / lineHeight),
    ));
    block = textBlock(title, fontSize, fontWeight, roomX, rows);

    // Where the words may start, row by row, counting from the icon: each
    // row's corners have to stay as clear of the rim as the box keeps them. A
    // row wider than the box has already spilt, and is held to the box rather
    // than pushed further out.
    const lines = placement === 'bottom' ? [...block.lines].reverse() : block.lines;
    const limits = lines.map((line) => Math.max(
      roomY / 2,
      reach.up(measure(line, fontSize, fontWeight) + fontSize * PAD_X * 2) - fontSize * PAD_Y,
    ));
    laid = settle({
      reach: edge,
      earliest: Math.max(...limits.map((limit, row) => -limit - row * lineHeight)),
      latest: Math.min(...limits.map((limit, row) => limit - (row + 1) * lineHeight)),
      extent: block.height,
      gap,
      along: shares.tall,
      full,
      least,
    });
  }

  // Everything is measured from the middle of the shape, to the middle of each.
  // `|| 0` because turning nothing round leaves a minus nought behind.
  const iconAt = laid.iconAt * turned || 0;
  const wordsAt = laid.wordsAt * turned || 0;
  return {
    block,
    iconSize: laid.iconSize,
    iconWidth: laid.iconSize * shares.wide,
    iconHeight: laid.iconSize * shares.tall,
    iconX: side ? iconAt : 0,
    iconY: side ? 0 : iconAt,
    textX: side ? wordsAt : 0,
    textY: side ? 0 : wordsAt,
  };
}

/** What a shape with no icon says about one: there is none, and the words have the middle. */
const NO_ICON = Object.freeze({
  iconSize: 0, iconWidth: 0, iconHeight: 0, iconX: 0, iconY: 0, textX: 0, textY: 0,
});

const placementOf = (record) =>
  (ICON_PLACEMENTS.includes(record.iconPlacement) ? record.iconPlacement : DEFAULT_ICON_PLACEMENT);

/**
 * Oval for a capability. `sizeScale` sets how big it is and `stretch` which
 * way it leans; the text wraps into it, and is free to spill outside.
 */
export function capabilitySize(capability) {
  const fontSize = capability.fontSize || DEFAULT_FONT_SIZE;
  const fontWeight = capability.fontWeight || DEFAULT_CAPABILITY_FONT_WEIGHT;
  const scale = capability.sizeScale || 1;

  // The oval comes from the scale and the stretch alone. Nothing the type does moves it.
  const radii = ovalRadii(capability.stretch);
  const rx = radii.rx * scale;
  const ry = radii.ry * scale;

  // The largest rectangle that fits inside an ellipse has sides the radii over
  // sqrt(2). That box, less its padding, is what the words have to live in.
  const roomX = Math.max(fontSize, (rx / Math.SQRT2) * 2 - fontSize * PAD_X * 2);
  const roomY = (ry / Math.SQRT2) * 2 - fontSize * PAD_Y * 2;

  if (!capability.icon) {
    const rows = Math.max(1, Math.min(MAX_CAPABILITY_LINES, Math.floor(roomY / (fontSize * 1.18))));
    const block = textBlock(capability.title, fontSize, fontWeight, roomX, rows);
    return { rx, ry, ...block, ...NO_ICON };
  }

  // The words still wrap into that box. The pair is not held to it: the icon
  // may go past the edge of the box, and a short row past the far one, for as
  // long as their corners stay clear of the rim.
  const { block, ...stack } = iconStack({
    title: capability.title,
    fontSize,
    fontWeight,
    roomX,
    roomY,
    reach: reachIn(rx, ry),
    full: fontSize * ICON_SHARE,
    least: fontSize * ICON_MIN_SHARE,
    placement: placementOf(capability),
    ink: iconInkOf(iconKeyOf(capability)),
  });
  return { rx, ry, ...block, ...stack };
}

// --- features ----------------------------------------------------------------

// A capability holds its features inside its own oval, and shows them once the
// map is zoomed in far enough to read them: the oval does not grow to make
// room, because where a capability sits and how big it is are the map's
// meaning, and a shape that swelled as it opened would push the terrain about.
// So the features are set as small as the room makes them, and it is the zoom
// that is asked to come closer — see zoom.js for when.

/** How many rows a feature's name may wrap into inside its bubble. */
export const MAX_FEATURE_LINES = 3;
/** Past this many rows of bubbles the rows are slivers, and more columns serve better. */
const MAX_FEATURE_ROWS = 7;
/** Where the capability's own name sits once it is open: up in the crown of the oval, as a share of its height. */
const HEADING_AT = -0.63;
/** The band of the oval the bubbles are packed into, top and bottom, as shares of its height. */
const FEATURES_TOP = -0.45;
const FEATURES_BOTTOM = 0.84;
/** The ground between two bubbles, as a share of a row's height. */
const FEATURE_GAP = 0.14;
/** How near the oval's rim a row of bubbles may come, as a share of the chord at that height. */
const FEATURE_INSET = 0.94;
/** A bubble is never more than this many times as wide as it is tall: past it, it reads as a bar. */
const FEATURE_LONGEST = 2.6;
/** Nor is a row of them taller than this share of the oval's shorter radius, however few there are. */
const FEATURE_TALLEST = 0.44;
/** The capability's name over its features, as a share of the oval's shorter radius. */
const HEADING_SIZE = 0.125;
/** The words keep this much of the box that fits inside a bubble. */
const FEATURE_ROOM = 0.9;
/** How many marks a closed capability wears for what it holds, at most. */
const MAX_PIPS = 7;
/** A pip's radius, how far down the oval the row sits — both as shares of the oval's shorter radius — and the step from one pip to the next, in radii. */
const PIP_SIZE = 0.045;
const PIP_DEPTH = 0.8;
const PIP_STEP = 3.2;

/** `total` shared out over rows by how wide each is, every row getting at least one. */
function shareOut(total, widths) {
  const sum = widths.reduce((a, b) => a + b, 0);
  const exact = widths.map((width) => (total * width) / sum);
  const counts = exact.map((value) => Math.max(1, Math.floor(value)));
  // Hand out what rounding down left over, widest remainder first; and take
  // back, from the fullest rows, what giving every row one overspent.
  const byRemainder = exact.map((value, row) => ({ row, left: value - Math.floor(value) }))
    .sort((a, b) => b.left - a.left || a.row - b.row);
  let spare = total - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; spare > 0; i = (i + 1) % counts.length, spare--) counts[byRemainder[i].row]++;
  while (spare < 0) {
    const fullest = counts.indexOf(Math.max(...counts));
    counts[fullest]--;
    spare++;
  }
  return counts;
}

/** The rows of bubbles `count` features make in `rows` rows of an oval, or null where a row has no room. */
function featureRows(rx, ry, count, rows) {
  // A row is as tall as the band shared out allows, and no taller than suits
  // the oval: one feature given the whole band is a second capability drawn
  // inside the first, and its name would be set larger than its capability's.
  // Rows that do not fill the band sit in the middle of it.
  const band = (FEATURES_BOTTOM - FEATURES_TOP) * ry;
  const height = Math.min(band / rows, Math.min(rx, ry) * FEATURE_TALLEST);
  const top = FEATURES_TOP * ry + (band - height * rows) / 2;
  const middles = Array.from({ length: rows }, (_, row) => top + (row + 0.5) * height);
  // A bubble is round at its ends, so it is the chord a little short of the
  // row's far edge that it has to fit, not the chord at the edge itself.
  const chords = middles.map((y) => {
    const far = Math.abs(y) + height * 0.36;
    return far >= ry ? 0 : rx * Math.sqrt(1 - (far / ry) ** 2) * FEATURE_INSET;
  });
  if (chords.some((chord) => chord <= 0)) return null;

  const gap = height * FEATURE_GAP;
  const counts = shareOut(count, chords);
  const laid = counts.map((inRow, row) => {
    const cell = (chords[row] * 2) / inRow;
    const tall = (height - gap) / 2;
    const wide = Math.min((cell - gap) / 2, tall * FEATURE_LONGEST);
    // A row whose bubbles were held short of their cells closes up round the
    // middle rather than spreading them out with holes between.
    const step = wide * 2 + gap < cell ? wide * 2 + gap : cell;
    return { y: middles[row], inRow, rx: wide, ry: tall, step };
  });
  if (laid.some((row) => row.rx <= 0 || row.ry <= 0)) return null;
  // What the tightest bubble could set its type at, near enough: a name is
  // wider than it is tall, so width counts for less than height.
  const room = Math.min(...laid.map((row) => Math.min(row.rx / 1.7, row.ry)));
  return { laid, room };
}

/** A title on one row: the breaks typed into it are for the shape it was typed on. */
const oneRow = (title) => String(title ?? '').replace(/\s*\n\s*/g, ' ');

/**
 * Where a feature that has been put somewhere by hand sits, or null for one
 * left in its row. Its place is kept in hundredths of the oval's radii, so it
 * holds through a resize of the capability, and is read back held inside the
 * oval by the bubble's own size: a place at the very rim is the bubble
 * touching the rim, not its middle on it.
 */
function featureSpot(size, bubble, feature) {
  if (feature.x == null && feature.y == null) return null;
  return heldInside(size, bubble, {
    x: ((feature.x ?? 0) / 100) * size.rx,
    y: ((feature.y ?? 0) / 100) * size.ry,
  });
}

/** A point brought back inside an oval far enough for a bubble centred on it to stay within the rim. */
function heldInside(size, bubble, point) {
  const roomX = Math.max(1, size.rx - bubble.rx);
  const roomY = Math.max(1, size.ry - bubble.ry);
  const reach = Math.hypot(point.x / roomX, point.y / roomY);
  return reach > 1 ? { x: point.x / reach, y: point.y / reach } : point;
}

/**
 * The radii of a feature's bubble, from the seat its row gives it and the way
 * it leans: on the scale a capability's oval leans on, from standing tall
 * through round to lying wide. A seat is the bubble lying wide, the shape a
 * feature has always had. A step at a time its two radii trade places, exactly
 * as a capability's do, so a feature stood up is the bubble it was, a quarter
 * turn round: as much of a shape as before, and taller than the row it sits
 * in.
 *
 * A seat already no wider than it is tall — a row crowded enough squeezes them
 * so — has no length to stand up on, and is left as it is.
 */
function bubbleRadii(seat, stretch) {
  if (seat.rx <= seat.ry) return { rx: seat.rx, ry: seat.ry };
  return leaning(seat.rx, seat.ry, stretch ?? DEFAULT_FEATURE_STRETCH);
}

/**
 * Where a bubble that leans sits when it is left in its row: in its seat,
 * moved only as far as keeps it in the band the bubbles have, clear of the
 * capability's name over them, and inside the rim. A bubble lying wide fits
 * its seat and is never moved.
 */
function seated(size, bubble) {
  const top = FEATURES_TOP * size.ry + bubble.ry;
  const foot = FEATURES_BOTTOM * size.ry - bubble.ry;
  const y = top > foot ? (top + foot) / 2 : Math.min(foot, Math.max(top, bubble.y));
  return heldInside(size, bubble, { x: bubble.x, y });
}

/**
 * The place to keep for a feature let go at `point`, measured from the middle
 * of its capability's oval: whole hundredths of the radii, as the file writes
 * them, for where the bubble actually comes to rest.
 */
export function featurePlace(size, bubble, point) {
  const held = heldInside(size, bubble, point);
  return { x: Math.round((held.x / size.rx) * 100), y: Math.round((held.y / size.ry) * 100) };
}

/** The largest type, from `start` down, at which a name wraps whole into a box. */
function fitType(title, weight, width, height, start) {
  let size = start;
  for (let step = 0; step < 14; step++, size *= 0.9) {
    const lines = wrapLines(title, size, width, 99, weight);
    const fits = lines.length <= MAX_FEATURE_LINES
      && lines.length * size * 1.18 <= height
      && lines.every((line) => measure(line, size, weight) <= width);
    if (fits) return size;
  }
  return size;
}

/**
 * A capability opened onto its features: its own name small in the crown of
 * the oval, and under it one bubble a feature, in the order the capability
 * holds them, in rows that follow the oval — longer through its middle than at
 * its top and foot. The number of rows is whichever leaves the tightest bubble
 * the most room, so three features sit side by side and thirty make a honeycomb.
 *
 * Every name in one capability is set at one size, the size its hardest name
 * to fit needs — one size is what makes them read as a list — though never
 * less than seven tenths of what a typical name there could take: one very long
 * name is cut with an ellipsis sooner than it shrinks all the others. That size
 * is worked out from the bubbles as their rows make them. One that has been
 * leaned is the exception to it, and the only one: its name is set no larger
 * than the rest, and smaller where the shape it was given has less width for
 * it — standing one feature up does not reset the type of its neighbours.
 *
 * @param size     the capability's oval, as capabilitySize gives it
 * @param features what it holds, in order, each with a title
 * @param title    the capability's own title
 * @returns `{ heading, bubbles, fontSize }`, all measured from the middle of
 *   the oval, or null for a capability that holds nothing
 */
export function layoutFeatures(size, features, title = '') {
  if (!features?.length) return null;
  const { rx, ry } = size;

  let best = null;
  for (let rows = 1; rows <= Math.min(features.length, MAX_FEATURE_ROWS); rows++) {
    const tried = featureRows(rx, ry, features.length, rows);
    if (tried && (!best || tried.room > best.room * 1.001)) best = tried;
  }
  if (!best) return null;

  const weight = DEFAULT_CAPABILITY_FONT_WEIGHT;
  // The largest box that fits inside an ellipse has sides its radii over sqrt(2).
  const roomIn = ({ rx, ry }) => ({ roomX: rx * Math.SQRT2 * FEATURE_ROOM, roomY: ry * Math.SQRT2 * FEATURE_ROOM });
  const seats = best.laid.flatMap((row) => Array.from({ length: row.inRow }, (_, at) => ({
    x: (at - (row.inRow - 1) / 2) * row.step,
    y: row.y,
    rx: row.rx,
    ry: row.ry,
    ...roomIn(row),
  })));

  const wanted = features.map((feature, at) =>
    fitType(feature.title, weight, seats[at].roomX, seats[at].roomY, seats[at].ry * 0.62));
  const typical = [...wanted].sort((a, b) => a - b)[Math.floor(wanted.length / 2)];
  const fontSize = Math.max(Math.min(...wanted), typical * 0.7);

  const bubbles = features.map((feature, at) => {
    const seat = seats[at];
    // The rows are made for bubbles lying wide, and a feature that leans takes
    // its seat's two radii and trades them: its neighbours are not moved for
    // it. A capability's are not either when its oval is stood up — what it
    // then lies across is for whoever stood it up to move.
    const radii = bubbleRadii(seat, feature.stretch);
    const leans = radii.rx !== seat.rx;
    const shape = leans ? { ...seat, ...radii, ...roomIn(radii) } : seat;
    const type = leans ? fitType(feature.title, weight, shape.roomX, shape.roomY, fontSize) : fontSize;
    const rows = Math.max(1, Math.min(MAX_FEATURE_LINES, Math.floor(shape.roomY / (type * 1.18))));
    // In the seat its order gives it, unless it has been put somewhere by
    // hand: then it is there, the size its seat would have made it.
    const place = featureSpot(size, shape, feature) ?? (leans ? seated(size, shape) : seat);
    return {
      item: feature,
      x: place.x,
      y: place.y,
      rx: shape.rx,
      ry: shape.ry,
      ...textBlock(feature.title, type, weight, shape.roomX, rows),
    };
  });

  // The capability's name, at a size that goes with the oval rather than with
  // the type it was set in closed: up here it is a label on what is below it.
  const headingSize = Math.min(rx, ry) * HEADING_SIZE;
  const headingRoom = rx * Math.sqrt(1 - (Math.abs(HEADING_AT) + 0.12) ** 2) * 2 * FEATURE_INSET;
  const heading = {
    ...textBlock(oneRow(title), headingSize, 'bold', headingRoom, 2),
    x: 0,
    y: HEADING_AT * ry,
  };

  return { heading, bubbles, fontSize };
}

/**
 * The marks a closed capability wears for the features inside it: a short row
 * of pips along the foot of the oval, one a feature up to a handful. They are
 * a count that can be read at the zoom the map is usually looked at from —
 * large enough to be seen there, and still gone from the helicopter view,
 * where a capability is a word and no more. None are drawn where the title or
 * its icon reaches down that far.
 *
 * The oval is narrow at its foot, and narrower still when it stands tall, so
 * a full row is drawn smaller there rather than let its ends cross the rim.
 *
 * @param size  the capability's oval and what is laid out in it
 * @param count how many features it holds
 */
export function featurePips(size, count) {
  if (!(count > 0)) return [];
  const shown = Math.min(count, MAX_PIPS);
  const y = size.ry * PIP_DEPTH;
  // How many radii the row is across, half of it: the pips' centres and the
  // outermost pip's own radius.
  const across = ((shown - 1) * PIP_STEP) / 2 + 1;
  // Half the oval's width where the lowest point of a pip would be, less a
  // little air, is all the room the row has.
  const full = size.ry * PIP_SIZE;
  const chord = size.rx * Math.sqrt(Math.max(0, 1 - (PIP_DEPTH + PIP_SIZE) ** 2));
  const r = Math.min(full, (chord * 0.85) / across);

  const wordsEnd = (size.textY ?? 0) + (size.height ?? 0) / 2;
  const iconEnd = size.iconSize > 0 ? size.iconY + size.iconHeight / 2 : -Infinity;
  if (Math.max(wordsEnd, iconEnd) > y - r * 2) return [];

  return Array.from({ length: shown }, (_, at) => ({ x: (at - (shown - 1) / 2) * r * PIP_STEP, y, r }));
}

// --- touchpoints and actors --------------------------------------------------

/** How round a touchpoint's corners are, as a share of its shorter half-side. */
export const TOUCHPOINT_RADIUS_SHARE = 0.34;

/**
 * A touchpoint is a rounded rectangle, sized the way a capability's oval is:
 * the same scale and the same lean, so the two read as the same family of
 * thing. The box the words live in is the rectangle itself, less its padding,
 * rather than the smaller one that fits inside an ellipse.
 */
export function touchpointSize(touchpoint) {
  const fontSize = touchpoint.fontSize || DEFAULT_FONT_SIZE;
  const fontWeight = touchpoint.fontWeight || DEFAULT_CAPABILITY_FONT_WEIGHT;
  const scale = touchpoint.sizeScale || 1;

  const radii = ovalRadii(touchpoint.stretch);
  const rx = radii.rx * scale;
  const ry = radii.ry * scale;

  const roomX = Math.max(fontSize, rx * 2 - fontSize * PAD_X * 2);
  const roomY = ry * 2 - fontSize * PAD_Y * 2;
  const shape = { shape: 'rect', rx, ry, corner: Math.min(rx, ry) * TOUCHPOINT_RADIUS_SHARE };

  if (!touchpoint.icon) {
    const rows = Math.max(1, Math.min(MAX_CAPABILITY_LINES, Math.floor(roomY / (fontSize * 1.18))));
    const block = textBlock(touchpoint.title, fontSize, fontWeight, roomX, rows);
    return { ...shape, ...block, ...NO_ICON };
  }

  // A box has no crown to go into: whatever the icon's size, the way to the
  // edge is the same, so the pair gets the room the words get and no more.
  const { block, ...stack } = iconStack({
    title: touchpoint.title,
    fontSize,
    fontWeight,
    roomX,
    roomY,
    reach: reachIn(rx, ry, false),
    full: fontSize * ICON_SHARE,
    least: fontSize * ICON_MIN_SHARE,
    placement: placementOf(touchpoint),
    ink: iconInkOf(iconKeyOf(touchpoint)),
  });
  return { ...shape, ...block, ...stack };
}

/* How much of an actor's circle the figure takes: what it is drawn at with room
   to spare, and what it gives way to when the name under it needs the rows. The
   figure is measured by its ink, not by the grid it was drawn on. */
const ACTOR_FIGURE_SHARE = 0.42;
const ACTOR_FIGURE_MIN_SHARE = 0.32;

/**
 * An actor is a circle with a figure in the top of it and its name under that.
 * One radius, so there is no stretch to set: a person on the map is a person
 * whichever way the map is laid out.
 */
export function actorSize(actor) {
  const fontSize = actor.fontSize || DEFAULT_FONT_SIZE;
  const fontWeight = actor.fontWeight || DEFAULT_CAPABILITY_FONT_WEIGHT;
  const scale = actor.sizeScale || 1;
  const r = BASE_RY * scale;

  // The words sit in the widest box that fits the circle, as they do in an oval,
  // and the figure goes out past it the way an oval's icon does.
  const roomX = Math.max(fontSize, (r / Math.SQRT2) * 2 - fontSize * PAD_X * 2);
  const { block, iconSize, iconX, iconY, textX, textY } = iconStack({
    title: actor.title,
    fontSize,
    fontWeight,
    roomX,
    roomY: (r / Math.SQRT2) * 2 - fontSize * PAD_Y * 2,
    reach: reachIn(r, r),
    full: r * ACTOR_FIGURE_SHARE,
    least: r * ACTOR_FIGURE_MIN_SHARE,
    placement: placementOf(actor),
  });

  return {
    shape: 'circle',
    rx: r,
    ry: r,
    ...block,
    figureSize: iconSize,
    figureX: iconX,
    figureY: iconY,
    textX,
    textY,
  };
}

/** How each kind of element is measured. Domains lay themselves out instead. */
export const sizeOf = (kind, record) => {
  if (kind === 'touchpoint') return touchpointSize(record);
  if (kind === 'actor') return actorSize(record);
  return capabilitySize(record);
};

// --- snap points -------------------------------------------------------------

/**
 * Where a ray leaving the middle at `angle` crosses a rectangle's edge. The
 * angles are the same twenty-four a capability uses, so a line moved between an
 * oval and a touchpoint lands on the point facing the same way.
 */
function onRectangle(rx, ry, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Whichever side the ray reaches first: the smaller of the two scale factors.
  const reach = Math.min(
    Math.abs(cos) < 1e-9 ? Infinity : rx / Math.abs(cos),
    Math.abs(sin) < 1e-9 ? Infinity : ry / Math.abs(sin),
  );
  return { x: cos * reach, y: sin * reach };
}

/**
 * The connection points, evenly spaced around the perimeter (0 = 3 o'clock).
 * Takes a size rather than two radii when the shape is not an ellipse, which is
 * why both callings are allowed: `snapPoints(size)` and `snapPoints(rx, ry)`.
 */
export function snapPoints(rxOrSize, maybeRy) {
  const size = typeof rxOrSize === 'object' && rxOrSize !== null
    ? rxOrSize
    : { rx: rxOrSize, ry: maybeRy };
  const { rx, ry, shape } = size;
  if (shape === 'blob') return blobSnaps(size.outline);

  return Array.from({ length: SNAP_COUNT }, (_, i) => {
    const angle = (i * 2 * Math.PI) / SNAP_COUNT;
    const at = shape === 'rect'
      ? onRectangle(rx, ry, angle)
      : { x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
    return { index: i, x: at.x, y: at.y };
  });
}

/** The snap points of each blob outline, kept for as long as the outline is: a line asks for them every frame. */
const blobSnapsOf = new WeakMap();

/**
 * The points a line may be hung off round a domain: where the same twenty-four
 * directions every shape uses leave its blob, seen from the middle of its body.
 * A blob is no oval, so the points are found on its outline rather than worked
 * out — and they keep the numbering, so a line moved from a capability to a
 * domain lands on the point facing the same way.
 */
function blobSnaps(outline) {
  if (!blobSnapsOf.has(outline)) {
    blobSnapsOf.set(outline, Array.from({ length: SNAP_COUNT }, (_, i) => {
      const at = rimPoint(outline, { x: 0, y: 0 }, (i * 360) / SNAP_COUNT);
      return { index: i, x: at.x, y: at.y };
    }));
  }
  return blobSnapsOf.get(outline);
}

/**
 * The way out of a snap point: square to the shape's edge where the line meets
 * it. The oval is stretched, so this is the gradient of its equation and not
 * simply the angle the snap point was placed at — on a wide, flat oval those
 * two part company badly. A rectangle has four flat faces instead, so the way
 * out is the axis of whichever face the point landed on.
 */
export function snapNormal(size, index) {
  const angle = (index * 2 * Math.PI) / SNAP_COUNT;

  // A blob's edge wanders, and a line leaving square to each wobble of it
  // would set off in directions nobody expects: it leaves the way it was
  // reached, straight out from the middle.
  if (size.shape === 'blob') return { x: Math.cos(angle), y: Math.sin(angle) };

  if (size.shape === 'rect') {
    const at = onRectangle(size.rx || 1, size.ry || 1, angle);
    // A corner belongs to both faces; the one it is further along wins.
    const onSide = Math.abs(Math.abs(at.x) - (size.rx || 1)) < 1e-6;
    const onTop = Math.abs(Math.abs(at.y) - (size.ry || 1)) < 1e-6;
    if (onSide && (!onTop || Math.abs(at.x) / (size.rx || 1) >= Math.abs(at.y) / (size.ry || 1)))
      return { x: Math.sign(at.x) || 1, y: 0 };
    return { x: 0, y: Math.sign(at.y) || 1 };
  }

  const [x, y] = unit(Math.cos(angle) / (size.rx || 1), Math.sin(angle) / (size.ry || 1));
  return { x, y };
}

/**
 * The pair of snap points that puts a connector's ends closest together — what
 * a line re-attaches to once either element has moved.
 */
export function closestSnapPair(fromPosition, fromSize, toPosition, toSize) {
  const from = snapPoints(fromSize);
  const to = snapPoints(toSize);
  let best = { fromPoint: 0, toPoint: 0, distance: Infinity };

  for (const a of from) {
    for (const b of to) {
      const dx = (fromPosition.x + a.x) - (toPosition.x + b.x);
      const dy = (fromPosition.y + a.y) - (toPosition.y + b.y);
      const distance = dx * dx + dy * dy;
      if (distance < best.distance) best = { fromPoint: a.index, toPoint: b.index, distance };
    }
  }
  return best;
}

/**
 * The snap point of a shape that lies nearest a point on the map, by how far
 * off it is. Round an oval that is the point facing it, near enough. Round a
 * blob it need not be: a blob's points are set out by direction from the
 * middle of its body, and the one facing a neighbour may be a lobe away from
 * the stretch of boundary that neighbour lies against.
 */
export function closestSnapTo(position, size, target) {
  let best = { point: 0, distance: Infinity };
  for (const snap of snapPoints(size)) {
    const distance = (position.x + snap.x - target.x) ** 2 + (position.y + snap.y - target.y) ** 2;
    if (distance < best.distance) best = { point: snap.index, distance };
  }
  return best.point;
}

/** A connector path: a straight chord, or one bowed sideways by a fixed share. */
/**
 * Where a curved line bends when nobody has shaped it: one point, offset from
 * the midpoint in the direction the two ends face between them.
 *
 * How far it goes is set by how much the two normals agree. Ends facing each
 * other cancel out and the line runs almost straight between them; ends facing
 * the same way push the bend out, so the line swings clear instead of doubling
 * back over the shape it just left.
 */
export function autoBendPoints(from, to, fromNormal, toNormal) {
  const sumX = fromNormal.x + toNormal.x;
  const sumY = fromNormal.y + toNormal.y;
  const agreement = Math.hypot(sumX, sumY) / 2;   // 0 facing each other, 1 facing alike
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  const reach = Math.min(span * BEND_SHARE, MAX_BEND_REACH) * agreement;
  const [outX, outY] = unit(sumX, sumY);
  return [{
    x: (from.x + to.x) / 2 + outX * reach,
    y: (from.y + to.y) / 2 + outY * reach,
  }];
}

/** How far a default bend swings out: a share of the run, and a hard ceiling. */
const BEND_SHARE = 0.45;
const MAX_BEND_REACH = 260;

/**
 * The direction the line travels at each point it passes through. The ends are
 * pinned to the shapes' normals so the line stands square to each edge where it
 * meets it; every point in between takes the run of its neighbours, which is
 * what carries the curve through a bend without a corner in it.
 */
function splineTangents(points, fromNormal, toNormal) {
  const last = points.length - 1;
  return points.map((point, i) => {
    if (i === 0) return fromNormal;
    // Arriving: the line travels *into* the far shape, against its normal.
    if (i === last) return { x: -toNormal.x, y: -toNormal.y };
    const [x, y] = unit(points[i + 1].x - points[i - 1].x, points[i + 1].y - points[i - 1].y);
    return { x, y };
  });
}

const round = (n) => Math.round(n * 100) / 100;

/**
 * A line from one snap point to another. Straight is a straight run. Curved is
 * a chain of cubics through every bend point, smooth across each one, leaving
 * and arriving square to the two shapes.
 *
 * `options` carries the bend points and the two normals; without normals it
 * falls back to the straight run between the ends, which is what a caller that
 * knows nothing of the shapes should get.
 */
export function connectorPath(from, to, style = 'straight', options = {}) {
  if (style !== 'curved') return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

  const [chordX, chordY] = unit(to.x - from.x, to.y - from.y);
  const fromNormal = options.fromNormal ?? { x: chordX, y: chordY };
  const toNormal = options.toNormal ?? { x: -chordX, y: -chordY };
  const bends = options.bendPoints?.length
    ? options.bendPoints
    : autoBendPoints(from, to, fromNormal, toNormal);

  const points = [from, ...bends, to];
  const tangents = splineTangents(points, fromNormal, toNormal);

  let d = `M ${round(from.x)} ${round(from.y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    // A third of the way along is the usual Catmull-Rom handle length; it keeps
    // the bulge in proportion to the segment however long or short it is.
    const pull = Math.hypot(b.x - a.x, b.y - a.y) / 3;
    const c1x = a.x + tangents[i].x * pull;
    const c1y = a.y + tangents[i].y * pull;
    const c2x = b.x - tangents[i + 1].x * pull;
    const c2y = b.y - tangents[i + 1].y * pull;
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(b.x)} ${round(b.y)}`;
  }
  return d;
}

// --- going round what is in the way ------------------------------------------

// A line says that two things are joined, and says it best over open ground.
// One drawn straight across a third shape reads as joined to that as well, or
// hides its name. So a line that would cross one is bent round it — a leaning,
// not a law: a shape too large to go round, or a gap too narrow to thread,
// and the line goes straight after all.

/** How far along a→b the two segments cross, 0 to 1, or null where they do not. */
function crossing(a, b, c, d) {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const across = rx * sy - ry * sx;
  if (Math.abs(across) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / across;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / across;
  return t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1 ? t : null;
}

/** The box that holds an outline, kept with it so a line is only tested against shapes near it. */
const boxOf = new WeakMap();
function boundsOf(outline) {
  if (!boxOf.has(outline)) {
    boxOf.set(outline, {
      minX: Math.min(...outline.map((p) => p.x)),
      maxX: Math.max(...outline.map((p) => p.x)),
      minY: Math.min(...outline.map((p) => p.y)),
      maxY: Math.max(...outline.map((p) => p.y)),
    });
  }
  return boxOf.get(outline);
}

/** The first outline the run from a to b enters, and how far along it does. */
function firstInTheWay(a, b, outlines) {
  let first = null;
  for (const outline of outlines) {
    const box = boundsOf(outline);
    if (Math.max(a.x, b.x) < box.minX || Math.min(a.x, b.x) > box.maxX
      || Math.max(a.y, b.y) < box.minY || Math.min(a.y, b.y) > box.maxY) continue;
    for (let i = 0; i < outline.length; i++) {
      const t = crossing(a, b, outline[i], outline[(i + 1) % outline.length]);
      if (t !== null && (!first || t < first.t)) first = { outline, t };
    }
  }
  return first;
}

/**
 * The point to go by, to pass an outline that the run from a to b crosses: out
 * to one side of the run, clear of the outline's furthest reach on that side,
 * level with where it reaches furthest. The nearer side is taken. Null where
 * going round would take the line further out of its way than it is long —
 * such a shape is not in the way so much as all around, and the line is better
 * left straight.
 */
function besides(a, b, outline, clearance) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length === 0) return null;
  const [ux, uy] = [(b.x - a.x) / length, (b.y - a.y) / length];
  // Each point of the outline as how far along the run it is, and how far off it.
  const seen = outline.map((p) => ({
    along: (p.x - a.x) * ux + (p.y - a.y) * uy,
    off: (p.y - a.y) * ux - (p.x - a.x) * uy,
  }));
  const left = seen.reduce((best, one) => (one.off > best.off ? one : best));
  const right = seen.reduce((best, one) => (one.off < best.off ? one : best));
  const by = Math.abs(left.off) <= Math.abs(right.off) ? left : right;
  const off = by.off + Math.sign(by.off || 1) * clearance;
  if (Math.abs(off) > length * 0.75) return null;
  // Not hard against either end: a line that turns the moment it leaves a
  // shape reads as leaving it sideways.
  const along = Math.min(length * 0.8, Math.max(length * 0.2, by.along));
  return { x: a.x + ux * along - uy * off, y: a.y + uy * along + ux * off };
}

/**
 * The bends that take a line from one point to another round the shapes in
 * its way, in order, or none where the straight run is clear. `outlines` are
 * the shapes to keep off, each a closed run of points — not the two the line
 * joins, nor anything that holds them, which it has to cross to get out.
 *
 * A bend is put beside the first shape crossed, and each half of the run is
 * then looked at again, a few turns deep: enough to thread between two or
 * three shapes, and few enough that a line never becomes a maze.
 *
 * @param options.clearance how far clear of a shape a bend is put
 * @param options.turns     how many times a run may be split
 */
export function routeAround(from, to, outlines, { clearance = 60, turns = 3 } = {}) {
  const route = (a, b, depth) => {
    if (depth === 0) return [];
    const blocked = firstInTheWay(a, b, outlines);
    if (!blocked) return [];
    const via = besides(a, b, blocked.outline, clearance);
    if (!via) return [];
    return [...route(a, via, depth - 1), via, ...route(via, b, depth - 1)];
  };
  return route(from, to, turns);
}

/**
 * Which segment of a line a point falls on, and how far along it — what a
 * shift-click needs to know to drop a new bend in the right place.
 */
export function nearestSegment(points, x, y) {
  let best = { index: 0, distance: Infinity };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const runX = b.x - a.x;
    const runY = b.y - a.y;
    const length = runX * runX + runY * runY;
    const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * runX + (y - a.y) * runY) / length));
    const distance = Math.hypot(a.x + runX * t - x, a.y + runY * t - y);
    if (distance < best.distance) best = { index: i, distance };
  }
  return best;
}

// --- blobs -----------------------------------------------------------------

const BLOB_STEPS = 96;   // the fewest points an outline is drawn through
const MOST_BLOB_STEPS = 200; // and the most, however long the outline runs
const BLOB_SPACING = 24; // about how far apart those points are, between the two
const SCAN_STEPS = 30;   // coarse pass looking for the outermost surface crossing
const REFINE_STEPS = 14; // bisections after it
const BLEND = 1.7;       // low, so neighbouring lobes read as one mass
const TRACE_SHARE = 6;   // a step along the outline is this share of the smallest lobe's radius
const TRACE_LIMIT = 4000; // steps before a walk that has not come back round is given up

/**
 * Where a lobe's middle is taken to be, seen from a point: its own middle, or —
 * for a lobe that trails, as a title's does when it hangs off the blob — the
 * place along its trail that brings it nearest. Such a lobe is the oval swept
 * from one end of the trail to the other, not an oval at either end.
 */
function middleAlong(lobe, x, y) {
  const dx = lobe.trail.x - lobe.x;
  const dy = lobe.trail.y - lobe.y;
  const span = (dx / lobe.rx) ** 2 + (dy / lobe.ry) ** 2;
  if (span === 0) return 0;
  const along = (((x - lobe.x) * dx) / lobe.rx ** 2 + ((y - lobe.y) * dy) / lobe.ry ** 2) / span;
  return Math.min(1, Math.max(0, along));
}

/**
 * A metaball field over the lobes: 1 exactly on a lone lobe's rim, more where
 * lobes overlap. Taking the surface at 1 fuses them into a single organic body —
 * a plain union would leave a crease, or a spike out to a distant lobe.
 */
function fieldAt(x, y, lobes) {
  let sum = 0;
  for (const lobe of lobes) {
    let cx = lobe.x;
    let cy = lobe.y;
    if (lobe.trail) {
      const t = middleAlong(lobe, x, y);
      cx += (lobe.trail.x - lobe.x) * t;
      cy += (lobe.trail.y - lobe.y) * t;
    }
    const q = ((x - cx) / lobe.rx) ** 2 + ((y - cy) / lobe.ry) ** 2;
    sum += Math.exp(-BLEND * (q - 1));
  }
  return sum;
}

/**
 * The field at a point and the way it rises there, as `[field, dx, dy]`. A
 * trailing lobe rises as the oval nearest the point does: the place along the
 * trail was chosen to be the best there is, so moving the point a little does
 * not change what that place is worth.
 */
function slopeAt(x, y, lobes) {
  let sum = 0;
  let gx = 0;
  let gy = 0;
  for (const lobe of lobes) {
    let cx = lobe.x;
    let cy = lobe.y;
    if (lobe.trail) {
      const t = middleAlong(lobe, x, y);
      cx += (lobe.trail.x - lobe.x) * t;
      cy += (lobe.trail.y - lobe.y) * t;
    }
    const ux = (x - cx) / lobe.rx;
    const uy = (y - cy) / lobe.ry;
    const here = Math.exp(-BLEND * (ux * ux + uy * uy - 1));
    sum += here;
    gx -= (here * 2 * BLEND * ux) / lobe.rx;
    gy -= (here * 2 * BLEND * uy) / lobe.ry;
  }
  return [sum, gx, gy];
}

/** How far the field reaches from the domain centre. */
function fieldReach(lobes) {
  return Math.max(...lobes.map((lobe) =>
    Math.hypot(lobe.x, lobe.y) + Math.max(lobe.rx, lobe.ry))) * 1.6;
}

/**
 * Where the surface sits along one ray: scan inward for the outermost crossing,
 * then bisect. The field is smooth, so the outline is too.
 */
function surfaceRadius(lobes, angle, reach) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const at = (r) => fieldAt(r * dx, r * dy, lobes);

  let inside = 0;
  let outside = reach;
  for (let i = SCAN_STEPS; i >= 1; i--) {
    const r = (reach * i) / SCAN_STEPS;
    if (at(r) >= 1) { inside = r; break; }
    outside = r;
  }
  if (inside === 0) return 0;

  for (let i = 0; i < REFINE_STEPS; i++) {
    const middle = (inside + outside) / 2;
    if (at(middle) >= 1) inside = middle;
    else outside = middle;
  }
  return inside;
}

/**
 * One step along the surface from a point on it, the blob kept on the same
 * hand all the way round: a step along the surface as it runs there, then back
 * onto the surface from wherever that landed. Back is found in the logarithm
 * of the field, which for one lobe is the plain quadratic the lobe was made
 * from, so the first correction lands close and the second lands on it. Null
 * where the field is flat and says nothing about which way the surface is.
 */
function stepAlong(lobes, at, step) {
  const [, rx, ry] = slopeAt(at.x, at.y, lobes);
  const rise = Math.hypot(rx, ry);
  if (!(rise > 1e-12)) return null;
  let x = at.x + (ry / rise) * step;
  let y = at.y - (rx / rise) * step;
  for (let fix = 0; fix < 6; fix++) {
    const [field, gx, gy] = slopeAt(x, y, lobes);
    const steep = gx * gx + gy * gy;
    if (!(field > 0) || !(steep > 1e-24)) return null;
    const off = (Math.log(field) * field) / steep;
    // Never further than the step itself: well off the surface the slope
    // here says little about where the surface is.
    const far = Math.sqrt(steep) * Math.abs(off);
    const held = far > step ? step / far : 1;
    x -= gx * off * held;
    y -= gy * off * held;
    if (Math.abs(Math.log(field)) < 1e-6) break;
  }
  return { x, y };
}

/** `count` points evenly spaced round a closed run of them, the first where the run starts. */
function evenly(run, count) {
  const next = (i) => run[(i + 1) % run.length];
  const lengths = run.map((p, i) => Math.hypot(next(i).x - p.x, next(i).y - p.y));
  const total = lengths.reduce((a, b) => a + b, 0);
  const points = [];
  let at = 0;
  let walked = 0;
  for (let k = 0; k < count; k++) {
    const wanted = (total * k) / count;
    while (at < run.length - 1 && walked + lengths[at] < wanted) walked += lengths[at++];
    const share = lengths[at] === 0 ? 0 : Math.min(1, (wanted - walked) / lengths[at]);
    points.push({
      x: run[at].x + (next(at).x - run[at].x) * share,
      y: run[at].y + (next(at).y - run[at].y) * share,
    });
  }
  return points;
}

/**
 * The outline walked: from where the surface is met going right from the
 * middle, step by step along the surface itself until the walk is back where
 * it began. It follows the surface wherever that goes — into a bay under the
 * end of a title, back out round the title — which rays from the middle cannot:
 * a ray that crosses the surface three times can report only one crossing, and
 * the outline it gave leapt from the far one to the near one along the ray,
 * leaving a blob with a bite taken out of it.
 *
 * Null where the walk fails — the field went flat under it, it did not come
 * back round, or what it went round was not the middle — and the outline is
 * then sampled along rays, as it always was.
 */
function walkedOutline(lobes, reach) {
  const first = surfaceRadius(lobes, 0, reach);
  if (!(first > 0)) return null;
  const step = Math.max(1, Math.min(...lobes.map((lobe) => Math.min(lobe.rx, lobe.ry))) / TRACE_SHARE);
  const start = { x: first, y: 0 };
  const run = [start];
  for (let at = start, taken = 0; ; taken++) {
    if (taken === TRACE_LIMIT) return null;
    at = stepAlong(lobes, at, step);
    if (!at) return null;
    // Back within a step of the start, a few steps out: the walk has closed.
    if (taken > 3 && Math.hypot(at.x - start.x, at.y - start.y) < step) break;
    run.push(at);
  }
  if (!insideOutline(run, 0, 0)) return null;

  const length = run.reduce((sum, p, i) => {
    const q = run[(i + 1) % run.length];
    return sum + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
  return evenly(run, Math.max(BLOB_STEPS, Math.min(MOST_BLOB_STEPS, Math.round(length / BLOB_SPACING))));
}

/** The outline sampled along rays out of the middle: the outermost crossing on each. */
function rayedOutline(lobes, reach) {
  return Array.from({ length: BLOB_STEPS }, (_, i) => {
    const angle = (i * 2 * Math.PI) / BLOB_STEPS;
    const radius = surfaceRadius(lobes, angle, reach);
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

/**
 * The outline, as the points it is drawn through, found from `centre`. That is
 * the middle of the body rather than the domain's own point: the lobes pull
 * the body off it, and the body's middle is the one place sure to be inside.
 */
function outlinePoints(shapes, centre) {
  const local = shapes.map((shape) => ({
    ...shape,
    x: shape.x - centre.x,
    y: shape.y - centre.y,
    trail: shape.trail ? { x: shape.trail.x - centre.x, y: shape.trail.y - centre.y } : null,
  }));
  const reach = fieldReach(local);
  return (walkedOutline(local, reach) ?? rayedOutline(local, reach))
    .map((p) => ({ x: centre.x + p.x, y: centre.y + p.y }));
}

/** How finely the way from the body out to a title is searched for where it leaves the blob. */
const TRAIL_SCAN = 24;

/**
 * Where the lobe of a title that hangs off the blob trails back to, or null
 * for a title whose middle is on the blob — which is every title until it is
 * dragged off, and those are drawn exactly as they were.
 *
 * A title may be put past the edge, and its lobe was then an oval joined to
 * the blob by however much of the two happened to overlap: a neck, with a bay
 * either side of it under the ends of the title, deeper the further out the
 * title went. So the lobe is swept instead, from the title back along the way
 * to the middle of the body, as far as the last place that is on the blob. The
 * title then stands on a shoulder as wide as itself, and the outline runs
 * round the pair of them without a bay to go into.
 */
function titleTrail(titleLobe, body, mass) {
  if (fieldAt(titleLobe.x, titleLobe.y, mass) >= 1) return null;
  const at = (t) => ({ x: body.x + (titleLobe.x - body.x) * t, y: body.y + (titleLobe.y - body.y) * t });
  const within = (t) => fieldAt(at(t).x, at(t).y, mass) >= 1;
  // The middle of the body is on the blob, so the search always has an end.
  let inside = 0;
  let outside = 1;
  for (let i = TRAIL_SCAN - 1; i >= 1; i--) {
    if (within(i / TRAIL_SCAN)) { inside = i / TRAIL_SCAN; outside = (i + 1) / TRAIL_SCAN; break; }
  }
  for (let i = 0; i < 12; i++) {
    const middle = (inside + outside) / 2;
    if (within(middle)) inside = middle; else outside = middle;
  }
  return at(inside);
}

/** Catmull-Rom through the samples, emitted as cubic beziers. */
function closedSpline(points) {
  const n = points.length;
  const at = (i) => points[(i + n) % n];
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return `${path} Z`;
}

// --- domain layout ---------------------------------------------------------

/** How much of the usual ring of blob a lobe may be given: from a sliver to room for a second capability beside the first. */
export const MIN_LOBE_SCALE = 0.25;
export const MAX_LOBE_SCALE = 12;

/** A capability's own say over its ring: a multiple of the usual one, held to what a lobe may be. */
export const lobeScaleOf = (capability) =>
  Math.min(MAX_LOBE_SCALE, Math.max(MIN_LOBE_SCALE, capability.lobeScale || 1));

/**
 * One capability, one lobe: the oval it holds plus a ring of padding. The ring
 * is the part a domain's boundary is made of, so it is the part that is
 * resized when the boundary is dragged: the capability stays the size it is.
 */
export function lobeSizeFor(capability) {
  const { rx, ry } = capabilitySize(capability);
  const pad = LOBE_PAD * lobeScaleOf(capability);
  return { rx: rx + pad, ry: ry + pad };
}

/**
 * The ring a lobe needs for its edge to pass through a point, as the multiple
 * `lobeScale` keeps: what dragging a domain's boundary sets. The point is
 * measured from the middle of the lobe. An oval's edge is not the same distance
 * out in every direction, so the ring is found on the ray the point lies on.
 */
export function lobeScaleThrough(capability, dx, dy) {
  const { rx, ry } = capabilitySize(capability);
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return MIN_LOBE_SCALE;
  const [ux, uy] = [dx / distance, dy / distance];
  // Where the ray leaves an oval of radii (rx + pad, ry + pad): solved for pad
  // by closing in on it, since pad is in both radii at once.
  let low = LOBE_PAD * MIN_LOBE_SCALE;
  let high = LOBE_PAD * MAX_LOBE_SCALE;
  for (let step = 0; step < 24; step++) {
    const pad = (low + high) / 2;
    const reach = 1 / Math.hypot(ux / (rx + pad), uy / (ry + pad));
    if (reach < distance) low = pad; else high = pad;
  }
  return Math.round((((low + high) / 2) / LOBE_PAD) * 100) / 100;
}

/** What a lobe measures before anything is put in it. */
export function defaultLobeSize() {
  return lobeSizeFor(CAPABILITY_SHAPE);
}

/** Points around an ellipse's rim — enough of them to test one shape against another. */
function rim(shape, steps = 16) {
  return Array.from({ length: steps }, (_, i) => {
    const angle = (i * 2 * Math.PI) / steps;
    return { x: shape.x + shape.rx * Math.cos(angle), y: shape.y + shape.ry * Math.sin(angle) };
  });
}

/** How far an ellipse reaches along a unit direction. */
const reachAlong = (shape, ux, uy) => Math.hypot(shape.rx * ux, shape.ry * uy);

const unit = (x, y) => {
  const length = Math.hypot(x, y);
  return length === 0 ? [0, -1] : [x / length, y / length];
};

/**
 * The body: one ovoid holding the lobes. Each of its four sides is set by the
 * lobes out on that side and nothing else, so moving a capability to the edge
 * pushes out that edge and leaves the other three where they were. It reaches
 * only part of the way across the outermost lobes, so each still swells the
 * outline instead of disappearing into a plain ellipse — and never pulls in
 * past the body an empty domain has, which keeps the domain's own middle, and
 * a title that has not been moved, inside it.
 */
function bodyFor(lobes) {
  const seed = defaultLobeSize();
  const home = { x: 0, y: 0, rx: seed.rx * BODY_ASPECT, ry: seed.ry };
  if (lobes.length === 0) return home;

  const left = Math.min(-home.rx, ...lobes.map((l) => l.x - l.rx * BODY_REACH));
  const right = Math.max(home.rx, ...lobes.map((l) => l.x + l.rx * BODY_REACH));
  const top = Math.min(-home.ry, ...lobes.map((l) => l.y - l.ry * BODY_REACH));
  const bottom = Math.max(home.ry, ...lobes.map((l) => l.y + l.ry * BODY_REACH));
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    rx: (right - left) / 2,
    ry: (bottom - top) / 2,
  };
}

/**
 * Where a new lobe goes: the first ring position that is clear of the ones
 * already there, walking outward until something fits.
 */
export function freeLobeSpot(taken, size = defaultLobeSize()) {
  if (taken.length === 0) return { x: 0, y: 0 };

  const clear = (x, y) => taken.every((lobe) =>
    Math.hypot((x - lobe.x) / (size.rx + lobe.rx), (y - lobe.y) / (size.ry + lobe.ry)) >= 1);

  // Walk outward and take the clear spot nearest the middle, so lobes pack
  // around the centre instead of trailing off in whichever direction was tried
  // first.
  const inner = Math.min(...taken.map((l) => Math.max(l.rx, l.ry)));
  let best = null;

  for (let ring = 0; ring < 14; ring++) {
    const radius = inner + size.rx * 0.5 + ring * size.rx * 0.35;
    for (let step = 0; step < 24; step++) {
      const angle = (step * 2 * Math.PI) / 24;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle) * 0.75;
      if (!clear(x, y)) continue;
      const distance = Math.hypot(x, y);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
    if (best) return { x: Math.round(best.x), y: Math.round(best.y) };
  }

  const far = Math.max(...taken.map((l) => Math.hypot(l.x, l.y) + Math.max(l.rx, l.ry)));
  return { x: Math.round(far + size.rx), y: 0 };
}

/**
 * Where the first capability in an empty domain goes: centred under the title
 * text, CAPABILITY_GAP clear of it. A title nobody has moved rides at the top
 * of the blob, and the lobe going in moves that top — so the spot is searched
 * for against the domain as it will be laid out with the capability in it.
 */
export function lobeUnderTitle(domain, capability = CAPABILITY_SHAPE) {
  const { ry } = capabilitySize(capability);
  const { title } = layoutDomain(domain, []);
  const x = title.x;

  // How far below its spot a lobe at `y` sits: under zero it is still in the
  // title's way, over zero it has room to come up.
  const excess = (y) => {
    const laid = layoutDomain(domain, [{ ...capability, lobeX: x, lobeY: y }]).title;
    return y - ry - (laid.y + laid.height / 2 + CAPABILITY_GAP);
  };

  const start = title.y + title.height / 2 + CAPABILITY_GAP + ry;
  let above = start;
  let below = start;
  for (let step = ry, i = 0; excess(above) > 0 && i < 12; step *= 2, i++) above -= step;
  for (let step = ry, i = 0; excess(below) < 0 && i < 12; step *= 2, i++) below += step;
  for (let i = 0; i < 20; i++) {
    const middle = (above + below) / 2;
    if (excess(middle) < 0) above = middle;
    else below = middle;
  }
  // Rounded down the page, so rounding never puts it back over the title.
  return { x: Math.round(x), y: Math.ceil(below) };
}

/**
 * Where a new capability goes in a domain: under the title if it is the first,
 * otherwise the first clear spot — with the title's own lobe counted as taken,
 * so a new capability never lands on the title.
 */
export function newLobeSpot(domain, children) {
  if (children.length === 0) return lobeUnderTitle(domain);
  const taken = children.map((c) => ({ x: c.lobeX ?? 0, y: c.lobeY ?? 0, ...lobeSizeFor(c) }));
  return freeLobeSpot([...taken, layoutDomain(domain, children).titleLobe]);
}

/**
 * What a domain holds while a capability is in hand. The one being dragged is
 * laid out wherever the pointer has it: the domain it is over reaches out to
 * receive it whether or not it was that domain's to begin with, and the one it
 * came from closes up behind it. `landing` is the drop target as it stands —
 * {domainId, lobeX, lobeY} — or null over open ground.
 */
export function childrenInHand(domainId, children, capability, landing) {
  const rest = children.filter((child) => child.id !== capability.id);
  if (landing?.domainId !== domainId) return rest;
  const arriving = { ...capability, lobeX: landing.lobeX, lobeY: landing.lobeY };
  // Its own keeps its place in the list; a stranger goes on the end.
  return rest.length === children.length
    ? [...children, arriving]
    : children.map((child) => (child.id === capability.id ? arriving : child));
}

/**
 * Lays a domain out. One ovoid body, one lobe per capability wherever it has
 * been put, and a lobe of its own for the title — which may hang off the edge.
 *
 * @param domain   the domain record
 * @param children capabilities inside it
 * @param moving   optional {id, x, y} for a lobe being dragged right now
 * @param ui       {editing} — edit mode draws the lobes it lets you move
 */
export function layoutDomain(domain, children, moving = null, ui = {}) {
  const editing = ui.editing === true;

  const lobes = children.map((child) => {
    const size = lobeSizeFor(child);
    const at = moving && moving.id === child.id ? moving : child;
    return {
      item: child,
      kind: 'capability',
      x: at.lobeX ?? at.x ?? 0,
      y: at.lobeY ?? at.y ?? 0,
      rx: size.rx,
      ry: size.ry,
    };
  });

  const body = bodyFor(lobes);

  // --- the title, and the kebab that hangs off it ----------------------------
  const titleSize = domain.fontSize || DEFAULT_DOMAIN_FONT_SIZE;
  const titleWeight = domain.fontWeight || DEFAULT_FONT_WEIGHT;
  const titleScale = domain.titleScale || 1;
  const wrapWidth = titleWidthOf(domain);
  const block = textBlock(domain.title, titleSize, titleWeight, wrapWidth);
  const kebabRadius = titleSize * 0.34;

  // The text area is drawn around the text itself, not around the width it is
  // allowed to wrap at, so a short title carries no empty box either side. It
  // follows the text: retype the title and the box re-fits on the next render.
  const areaWidth = block.width + titleSize * TITLE_PAD_X * 2;

  const title = {
    ...block,
    size: titleSize,
    weight: titleWeight,
    wrapWidth,
    areaWidth,
    boxWidth: (areaWidth / 2) * titleScale,
    boxHeight: (block.height / 2 + titleSize * PAD_Y) * titleScale,
  };

  const titleLobe = {
    kind: 'title',
    rx: (title.boxWidth + LOBE_PAD * 0.6) * Math.SQRT2 * 0.85,
    ry: (title.boxHeight + LOBE_PAD * 0.6) * Math.SQRT2,
  };

  const wanted = moving && moving.id === 'title' ? moving : domain;
  const placed = clampTitle(
    wanted.titleX ?? domain.titleX ?? 0,
    wanted.titleY ?? domain.titleY ?? defaultTitleY(body, titleLobe, lobes),
    titleLobe, body, lobes);
  titleLobe.x = placed.x;
  titleLobe.y = placed.y;
  title.x = placed.x;
  title.y = placed.y;

  const kebab = {
    x: title.x + measure(block.lines[block.lines.length - 1], titleSize, titleWeight) / 2 + kebabRadius * 1.4,
    y: title.y + ((block.lines.length - 1) * block.lineHeight) / 2,
    r: kebabRadius,
  };

  // --- outline ---------------------------------------------------------------
  const mass = [body, ...lobes];
  titleLobe.trail = titleTrail(titleLobe, body, mass);
  const outline = [...mass, titleLobe];
  const points = outlinePoints(outline, body);
  const extentWidth = Math.max(...points.map((p) => Math.abs(p.x)));
  const extentHeight = Math.max(...points.map((p) => Math.abs(p.y)));
  // The blob no longer sits evenly about the domain's point, so the extents
  // above only bound it; these are the edges themselves.
  const bounds = {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };

  const slots = lobes.map((lobe) => {
    const size = capabilitySize(lobe.item);
    return { kind: 'capability', item: lobe.item, x: lobe.x, y: lobe.y, rx: size.rx, ry: size.ry };
  });

  return {
    body,
    lobes,
    slots,
    title,
    titleLobe,
    kebab,
    editing,
    /** The outline as the points it was sampled at — what an area's band is drawn round. */
    outline: points,
    path: closedSpline(points),
    extentWidth,
    extentHeight,
    bounds,
    /** Is this point inside the blob? The field says so directly. */
    contains(x, y) {
      if (x === 0 && y === 0) return true;
      return fieldAt(x, y, outline) >= 1;
    },
    /** The lobe under a point, if any — what a drag picks up. */
    lobeAt(x, y) {
      return lobes.find((lobe) =>
        Math.hypot((x - lobe.x) / lobe.rx, (y - lobe.y) / lobe.ry) <= 1) ?? null;
    },
    /** Is a point on the title's own lobe? */
    onTitle(x, y) {
      return Math.hypot((x - titleLobe.x) / titleLobe.rx, (y - titleLobe.y) / titleLobe.ry) <= 1;
    },
  };
}

/**
 * Where the title sits before anyone moves it: clear of the top of the blob,
 * lobes included — the body alone stops short of them.
 */
/** The width a domain's title wraps at: what was dragged, or the default. */
export function titleWidthOf(domain) {
  const size = domain.fontSize || DEFAULT_DOMAIN_FONT_SIZE;
  const wanted = domain.titleWidth ?? size * TITLE_WIDTH_PER_EM;
  return Math.min(MAX_TITLE_WIDTH, Math.max(MIN_TITLE_WIDTH, wanted));
}

/**
 * Which snap point of an oval sits nearest (dx, dy), measured from its centre.
 * Undoing the ellipse's stretch first makes the nearest point the nearest
 * *angle*, which is what the eye reads when a line end is dragged around.
 */
export function nearestSnapIndex(size, dx, dy) {
  // A blob's points are set out by direction alone, not round a stretched oval.
  const angle = size.shape === 'blob'
    ? Math.atan2(dy, dx)
    : Math.atan2(dy / (size.ry || 1), dx / (size.rx || 1));
  const step = (2 * Math.PI) / SNAP_COUNT;
  return ((Math.round(angle / step) % SNAP_COUNT) + SNAP_COUNT) % SNAP_COUNT;
}

function defaultTitleY(body, titleLobe, lobes) {
  const top = Math.min(body.y - body.ry, ...lobes.map((lobe) => lobe.y - lobe.ry));
  return top + titleLobe.ry * 0.45;
}

/**
 * Keep the title attached. It may hang off the edge, but by no more than
 * TITLE_OVERHANG of its own diameter — beyond that it stops reading as part of
 * the same shape.
 */
function clampTitle(x, y, titleLobe, body, lobes) {
  const [ux, uy] = unit(x, y);
  const distance = Math.hypot(x, y);
  if (distance === 0) return { x, y };

  // How far the body reaches this way, lobes included. The lobes pull the body
  // off the domain's own point, so where its middle sits counts as well — and
  // counts against it too, or pushing out the bottom would let the title stray
  // further off the top.
  let surface = body.x * ux + body.y * uy + reachAlong(body, ux, uy);
  for (const lobe of lobes) {
    surface = Math.max(surface, Math.hypot(lobe.x, lobe.y) * dot(lobe, ux, uy) + reachAlong(lobe, ux, uy));
  }

  const reach = reachAlong(titleLobe, ux, uy);
  // The far edge may pass the surface by TITLE_OVERHANG of the diameter.
  const furthest = surface + TITLE_OVERHANG * 2 * reach - reach;
  const limited = Math.min(distance, Math.max(furthest, 0));
  return { x: ux * limited, y: uy * limited };
}

/** How much of a lobe's offset points the same way as a direction. */
function dot(lobe, ux, uy) {
  const length = Math.hypot(lobe.x, lobe.y);
  return length === 0 ? 0 : Math.max(0, (lobe.x * ux + lobe.y * uy) / length);
}

// --- areas -------------------------------------------------------------------

// An area has no size of its own. It is a band stretched round whatever it
// holds: the tightest convex line that takes in every member's real outline,
// stood off from them by a margin and rounded by it. That is the hull of their
// points grown by a disc, which is a shape with no surprises in it — it never
// spikes out to a far-off member the way a blob sampled from its middle does,
// however far apart a team's domains sit.

/**
 * How far past what it holds an area's band stands. Room enough that the line
 * reads as going round a team rather than as an outline of its shapes — at half
 * this it hugged every blob it passed. The price is paid on a tightly packed
 * map: this is most of DOMAIN_GAP, the room the app itself leaves between two
 * domains, so the bands of two teams side by side overlap in the gap.
 */
export const AREA_PAD = 64;
/** Half the run of an empty area's band, before its title asks for more. */
const EMPTY_AREA_HALF = 150;
/** The finest turn the band's corners are drawn in: fifteen to the right angle. */
const BAND_ARC_STEP = Math.PI / 30;
/* The break in the border behind the title, as a share of the type size: room
   either side of the words, and a little over and under them. */
const LEGEND_GAP_X = 0.4;
const LEGEND_GAP_Y = 0.1;
/** Straight up: where a title rides until it is slid somewhere else. */
export const DEFAULT_TITLE_ANGLE = 270;

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** The convex hull, by the monotone chain: its corners in order, with none on a straight run. */
function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((point, i, all) => i === 0 || point.x !== all[i - 1].x || point.y !== all[i - 1].y);
  if (sorted.length < 3) return sorted;

  const half = (list) => {
    const chain = [];
    for (const point of list) {
      while (chain.length >= 2 && cross(chain.at(-2), chain.at(-1), point) <= 0) chain.pop();
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/**
 * The band round a set of points: their hull, stood off by `pad` and rounded by
 * it, as the closed run of points it is drawn through. Each corner of the hull
 * becomes an arc between the two edges it joins; the edges themselves stay
 * straight. One point gives a circle and two a pill, by the same rule.
 */
export function bandRound(points, pad = AREA_PAD) {
  const corners = convexHull(points);
  if (corners.length === 0) return [];

  const arc = (centre, from, sweep) => {
    const steps = Math.max(1, Math.ceil(sweep / BAND_ARC_STEP));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const angle = from + (sweep * i) / steps;
      return { x: centre.x + pad * Math.cos(angle), y: centre.y + pad * Math.sin(angle) };
    });
  };
  if (corners.length === 1) return arc(corners[0], 0, 2 * Math.PI).slice(0, -1);

  // The way out of an edge, for corners taken in the hull's own order.
  const outward = (a, b) => Math.atan2(-(b.x - a.x), b.y - a.y);
  const n = corners.length;
  return corners.flatMap((corner, i) => {
    const from = outward(corners[(i + n - 1) % n], corner);
    const to = outward(corner, corners[(i + 1) % n]);
    const sweep = (((to - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return arc(corner, from, sweep);
  });
}

/** Whether a point is inside a closed run of points. Even-odd, so any outline will do. */
export function insideOutline(outline, x, y) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** How far past either end of a run of an outline a ray still counts as crossing it, as a share of the run. */
const RIM_SLACK = 1e-9;

/**
 * Where a ray leaving `centre` at `degrees` crosses an outline it is inside of —
 * clockwise from the right, as the screen has it, so 270 is straight up. The
 * furthest crossing, which for a band is the only one.
 *
 * A ray that leaves through a corner of the outline meets two of its runs, each
 * at its very end, and the arithmetic may put it a hair past the end of both.
 * Read strictly that is no crossing at all, and the point came back as the
 * centre itself — which on a domain, whose connection points lie on rays its
 * outline has corners on, drew a line into the middle of the blob. So the end
 * of a run counts with a little to spare.
 */
export function rimPoint(outline, centre, degrees) {
  const angle = (degrees * Math.PI) / 180;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);

  let reach = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const across = dx * ey - dy * ex;
    if (Math.abs(across) < 1e-9) continue;
    const t = ((a.x - centre.x) * ey - (a.y - centre.y) * ex) / across;
    const u = ((a.x - centre.x) * dy - (a.y - centre.y) * dx) / across;
    if (t > reach && u >= -RIM_SLACK && u <= 1 + RIM_SLACK) reach = t;
  }
  return { x: centre.x + dx * reach, y: centre.y + dy * reach };
}

/** The angle a point is seen at from `centre`, in whole tenths of a degree from 0 up to 360. */
export function angleFrom(centre, x, y) {
  const degrees = (Math.atan2(y - centre.y, x - centre.x) * 180) / Math.PI;
  return (Math.round(((degrees % 360) + 360) % 360 * 10) / 10) % 360;
}

/**
 * A closed outline with whatever lies inside `box` taken out of it, as the open
 * runs that are left — the border, broken behind its title. Each stretch is cut
 * where it meets the box rather than dropped whole, so the break is as wide as
 * the box and no wider.
 */
export function outlineOutside(outline, box) {
  const within = (p) => p.x > box.minX && p.x < box.maxX && p.y > box.minY && p.y < box.maxY;

  /** The share of a→b that lies inside the box, as [enter, leave], or null. Liang–Barsky. */
  const clipped = (a, b) => {
    let enter = 0;
    let leave = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    for (const [run, gap] of [
      [-dx, a.x - box.minX], [dx, box.maxX - a.x], [-dy, a.y - box.minY], [dy, box.maxY - a.y],
    ]) {
      if (run === 0) { if (gap < 0) return null; continue; }
      const at = gap / run;
      if (run < 0) enter = Math.max(enter, at);
      else leave = Math.min(leave, at);
      if (enter > leave) return null;
    }
    return [enter, leave];
  };
  const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

  // Start the walk on a point the box leaves alone, so no run is split across
  // the seam of the list. A box over all of them leaves nothing to draw.
  const first = outline.findIndex((p) => !within(p));
  if (first < 0) return [];
  const n = outline.length;
  const runs = [];
  let run = [outline[first]];

  for (let step = 0; step < n; step++) {
    const a = outline[(first + step) % n];
    const b = outline[(first + step + 1) % n];
    const cut = clipped(a, b);
    if (!cut || cut[0] >= cut[1]) { run.push(b); continue; }

    if (cut[0] > 0) run.push(along(a, b, cut[0]));
    if (run.length > 1) runs.push(run);
    run = cut[1] < 1 ? [along(a, b, cut[1]), b] : [];
  }
  // The walk ends where it began. Untouched, that run is the whole outline;
  // broken, its last run and its first are one run met at the seam.
  if (run.length > 1) runs.push(run);
  if (runs.length > 1 && runs.at(-1).at(-1) === runs[0][0]) runs[0] = [...runs.pop(), ...runs[0].slice(1)];
  return runs;
}

const written = (value) => value.toFixed(2);

/** A run of points as a path: closed for a fill, left open for a stroke with a break in it. */
export const pathThrough = (points, closed = false) =>
  (points.length === 0 ? '' : `M ${points.map((p) => `${written(p.x)} ${written(p.y)}`).join(' L ')}${closed ? ' Z' : ''}`);

/**
 * An area's title as it is drawn: a row for every break typed into it, and
 * nothing wrapped. A legend is as long as its words, so the break in the
 * border follows the longest row.
 */
const legendOf = (area) => {
  const fontSize = (area.fontSize || AREA_SHAPE.fontSize) * (area.titleScale || 1);
  const fontWeight = area.fontWeight || AREA_SHAPE.fontWeight;
  const rows = String(area.title ?? '').split('\n').map((row) => row.trim()).filter(Boolean);
  const lines = rows.length === 0 ? [''] : rows;
  const lineHeight = fontSize * 1.18;
  return {
    lines,
    lineHeight,
    fontSize,
    fontWeight,
    width: Math.max(...lines.map((row) => measure(row, fontSize, fontWeight)), fontSize),
    height: lines.length * lineHeight,
  };
};

/**
 * Lays an area out: the band round what it holds, and the title riding it.
 *
 * @param area      the area record
 * @param outlines  one run of points per member, in map coordinates — a
 *                  domain's sampled blob, the corners of a touchpoint, the rim
 *                  of a loose capability. Empty, the area is a pill at its own
 *                  position, long enough to carry its title.
 * @param sliding   optional {titleAngle} while the title is being slid round
 */
export function layoutArea(area, outlines, sliding = null) {
  const title = legendOf(area);
  const gapX = title.fontSize * LEGEND_GAP_X;
  const gapY = title.fontSize * LEGEND_GAP_Y;

  const held = outlines.flat();
  const empty = held.length === 0;
  const half = Math.max(EMPTY_AREA_HALF, title.width / 2 + gapX * 2);
  const band = bandRound(empty
    ? [{ x: (area.x ?? 0) - half, y: area.y ?? 0 }, { x: (area.x ?? 0) + half, y: area.y ?? 0 }]
    : held);

  const bounds = {
    minX: Math.min(...band.map((p) => p.x)),
    maxX: Math.max(...band.map((p) => p.x)),
    minY: Math.min(...band.map((p) => p.y)),
    maxY: Math.max(...band.map((p) => p.y)),
  };
  // The middle of the box round it: inside a convex band whatever its shape,
  // and it stays put while a member in the middle of the team is moved about.
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };

  const angle = sliding?.titleAngle ?? area.titleAngle ?? DEFAULT_TITLE_ANGLE;
  const at = rimPoint(band, centre, angle);
  // The rows stand outside the band, the nearest of them astride the line:
  // above it when the title rides the top, below it at the bottom. Rows stack
  // upright, so at either side there is no outside for them to stand in and
  // the block sits astride; between, it shades from one to the other with the
  // angle rather than jumping a row as the title crosses the middle. One row
  // is on the line wherever it rides, as it always was.
  const outward = Math.sin((angle * Math.PI) / 180);
  title.x = at.x;
  title.y = at.y + ((title.height - title.lineHeight) / 2) * outward;
  title.angle = angle;

  const gap = {
    minX: at.x - title.width / 2 - gapX,
    maxX: at.x + title.width / 2 + gapX,
    minY: at.y - title.height / 2 - gapY,
    maxY: at.y + title.height / 2 + gapY,
  };
  // The title hangs over the line, so what is drawn reaches past the band.
  const drawn = {
    minX: Math.min(bounds.minX, gap.minX),
    maxX: Math.max(bounds.maxX, gap.maxX),
    minY: Math.min(bounds.minY, gap.minY),
    maxY: Math.max(bounds.maxY, gap.maxY),
  };

  return {
    empty,
    band,
    centre,
    bounds: drawn,
    title,
    gap,
    /** The wash: the whole band, closed. */
    path: pathThrough(band, true),
    /** The border: the band with the stretch behind the title left out. */
    rim: outlineOutside(band, gap).map((run) => pathThrough(run)).join(' '),
    /** Is this point inside the line? What a drop asks. */
    contains: (x, y) => insideOutline(band, x, y),
  };
}

// --- role cards ---------------------------------------------------------------

// A person in a role has no shape, so the layer of their discipline hangs a
// card for them on each area and domain they own: a band in the layer's colour
// down its leading edge, their icon, and beside it their name with their role
// under it. A card is hung outside the
// shape, by its name, so that it covers nothing of the shape it is on — beyond
// a domain's edge where its title sits, beyond an area's title on the border —
// and several people on one shape stack away from it, the first the nearest.
// That is only where a card starts: it can be taken hold of and put anywhere,
// and from then on it stays where it was put, measured from its shape.

/**
 * How large a name on a card is, in the map's own units: between a
 * capability's title and a domain's, so that who leads a domain reads from the
 * helicopter view, where the domain itself does, and is still not louder than
 * the thing they lead.
 */
export const BADGE_FONT = 56;

/** How large the role under a name is, as a share of the name: the smaller of the two, since it is the name that is looked for. */
export const BADGE_ROLE_SHARE = 0.7;

/** The air between a name and the role under it, as a share of the name. */
const BADGE_LINE_GAP = 0.15;

/**
 * How wide the band down a card's leading edge is, as a share of the name. The
 * band is the colour of the layer the card is on: two people side by side, one
 * leading for product and one for engineering, are otherwise the same card.
 */
const BADGE_MARK = 0.18;

/**
 * How tall a person's icon is, as a multiple of their name: as tall as the
 * name, the role and the air between them together, so that the picture and
 * the two lines beside it are one block with one top and one foot.
 */
export const BADGE_ICON_SHARE = 1 + BADGE_LINE_GAP + BADGE_ROLE_SHARE;

/** A name or a role on a card, cut where a card would otherwise be wider than what it hangs on. */
export const MAX_BADGE_NAME = 32;

const badgeName = (name) => {
  const said = String(name ?? '').replace(/\s+/g, ' ').trim();
  return said.length > MAX_BADGE_NAME ? `${said.slice(0, MAX_BADGE_NAME - 1).trimEnd()}…` : said;
};

/**
 * Where a domain's cards hang: outside its edge, on the side its title sits,
 * growing away from the blob. `layout` is `layoutDomain`'s, in the domain's own
 * coordinates, and so is the answer. A title in the very middle of the body
 * points nowhere, and the cards go over the top, where a title starts.
 */
export function badgeAnchorOnBlob(layout) {
  const dx = layout.titleLobe.x - layout.body.x;
  const dy = layout.titleLobe.y - layout.body.y;
  const degrees = Math.hypot(dx, dy) < 1 ? DEFAULT_TITLE_ANGLE : (Math.atan2(dy, dx) * 180) / Math.PI;
  const at = rimPoint(layout.outline, layout.body, degrees);
  return { x: at.x, y: at.y, grows: at.y < layout.body.y ? -1 : 1 };
}

/**
 * Where an area's cards hang: beyond its title, on the side of it that is
 * outside the band — over a title that rides the top of the border, and under
 * one that rides anywhere else. `layout` is `layoutArea`'s.
 */
export function badgeAnchorOnBand(layout) {
  const outward = Math.sin((layout.title.angle * Math.PI) / 180);
  return outward < -0.3
    ? { x: layout.title.x, y: layout.gap.minY, grows: -1 }
    : { x: layout.title.x, y: layout.gap.maxY, grows: 1 };
}

/** What a card says and how much room that takes, before it is put anywhere. */
function badgeSized(person, fontSize) {
  const label = badgeName(person?.name);
  const role = badgeName(person?.role);
  const roleFontSize = fontSize * BADGE_ROLE_SHARE;
  const icon = fontSize * BADGE_ICON_SHARE;
  const pad = fontSize * 0.3;
  const between = fontSize * 0.35;
  const mark = fontSize * BADGE_MARK;
  const words = Math.max(measure(label, fontSize), role ? measure(role, roleFontSize) : 0);
  return {
    label, role, fontSize, roleFontSize, icon, pad, between, mark,
    // A little more air after the words than before the icon: a line of type
    // ends raggedly, and reads as nearer the edge than it is.
    width: mark + pad + icon + between + words + pad * 1.4,
    height: icon + pad * 2,
  };
}

/**
 * A sized card put where its top left corner is given, `width` wide. The name
 * and the role are each given by the middle of their left edge. Someone with
 * no role has their name in the middle of the card's height, beside the icon.
 */
function badgeLaid(sized, x, y, width = sized.width) {
  const { label, role, fontSize, roleFontSize, icon, pad, between, mark } = sized;
  const left = x + mark + pad + icon + between;
  const top = y + pad;
  return {
    label,
    role,
    x,
    y,
    width,
    height: sized.height,
    radius: fontSize * 0.3,
    mark,
    icon: { x: x + mark + pad, y: top, size: icon },
    text: { x: left, y: role ? top + fontSize / 2 : top + icon / 2 },
    roleText: role ? { x: left, y: top + icon - roleFontSize / 2 } : null,
    fontSize,
    roleFontSize,
  };
}

/**
 * The cards of one shape, laid out from where they hang: one under another,
 * centred on the anchor and stacked away from the shape, all as wide as the
 * widest so that the icons stand in one column. `people` is a list of `{ name,
 * role }`. Each card is `{ label, role, x, y, width, height, radius, icon: { x,
 * y, size }, text: { x, y }, roleText: { x, y } | null, fontSize, roleFontSize
 * }`: the card and the icon by their top left corners, and each line of type
 * by the middle of its left edge.
 */
export function badgeStack(anchor, people, fontSize = BADGE_FONT) {
  const apart = fontSize * 0.2;
  const clear = fontSize * 0.25;
  const grows = anchor.grows < 0 ? -1 : 1;
  const sized = people.map((person) => badgeSized(person, fontSize));
  const width = Math.max(0, ...sized.map((one) => one.width));

  return sized.map((one, index) => {
    const step = clear + index * (one.height + apart);
    const y = grows > 0 ? anchor.y + step : anchor.y - step - one.height;
    return badgeLaid(one, anchor.x - width / 2, y, width);
  });
}

/**
 * One card put where someone left it: its middle on `centre`, and as wide as
 * what it says, since it stands in no column.
 */
export function badgeAt(centre, person, fontSize = BADGE_FONT) {
  const sized = badgeSized(person, fontSize);
  return badgeLaid(sized, centre.x - sized.width / 2, centre.y - sized.height / 2);
}

/** A card moved by so much, with everything on it. */
export const badgeMovedBy = (badge, dx, dy) => ({
  ...badge,
  x: badge.x + dx,
  y: badge.y + dy,
  icon: { ...badge.icon, x: badge.icon.x + dx, y: badge.icon.y + dy },
  text: { x: badge.text.x + dx, y: badge.text.y + dy },
  roleText: badge.roleText ? { x: badge.roleText.x + dx, y: badge.roleText.y + dy } : null,
});

/**
 * The band down a card's leading edge, as a path: the part of the card that
 * lies within the band's width of its left side, so the band's outer corners
 * are the card's own rounded ones and it never shows past the rim.
 */
export function badgeMarkPath(badge) {
  const { x, y, height, radius: r } = badge;
  const w = badge.mark;
  const foot = y + height;
  if (w >= r) {
    return `M ${x + w} ${y} H ${x + r} A ${r} ${r} 0 0 0 ${x} ${y + r} V ${foot - r} A ${r} ${r} 0 0 0 ${x + r} ${foot} H ${x + w} Z`;
  }
  // Narrower than the corner is round: the band's own edge meets the corner
  // part of the way round it, this far short of where the corner would end.
  const short = r - Math.sqrt(r * r - (r - w) ** 2);
  return `M ${x + w} ${y + short} A ${r} ${r} 0 0 0 ${x} ${y + r} V ${foot - r} A ${r} ${r} 0 0 0 ${x + w} ${foot - short} Z`;
}

/** The middle of a card: what is remembered of one that has been put somewhere. */
export const badgeCentre = (badge) => ({ x: badge.x + badge.width / 2, y: badge.y + badge.height / 2 });

/**
 * Where to put a card's icon so that its drawing fills the square the card
 * keeps for it: the ink is fitted to the square whole, the longer side to the
 * edge, and the file's margin hangs outside as it does on a shape. Two icons
 * drawn with different margins are then two people of one size.
 */
export function badgeIconBox(box, ink = WHOLE_ICON) {
  const aspect = (ink.width * ink.aspect) / ink.height || 1;
  return iconImageBox({
    iconX: box.x + box.size / 2,
    iconY: box.y + box.size / 2,
    iconWidth: aspect >= 1 ? box.size : box.size * aspect,
    iconHeight: aspect >= 1 ? box.size / aspect : box.size,
  }, ink);
}

const boxesMeet = (a, b, air) =>
  a.x < b.x + b.width + air && b.x < a.x + a.width + air
  && a.y < b.y + b.height + air && b.y < a.y + a.height + air;

/**
 * The cards the map hangs by itself, moved clear of one another. Two shapes
 * that sit close hang their people in the same place, and a card is large
 * enough to land on its neighbour's — or on the name of the area the shape is
 * in, which rides the border just past a domain's edge. So each shape's cards,
 * in the order given, are moved further from their shape, the way they already
 * grow, until they stand clear of everything placed before them and of every
 * box in `taken`. Only ever further out: sideways would slide a card off the
 * side its shape's name is on, and often back over the shape. A card someone
 * has put somewhere is not in this at all — it is where it was put.
 *
 * `stacks` is a list of `{ grows, cards }`, the cards as `badgeStack` laid
 * them; the answer is the cards of each, in the same order. `taken` is boxes
 * as `{ x, y, width, height }`.
 */
export function badgesClear(stacks, taken = [], air = BADGE_FONT * 0.25) {
  const held = [...taken];
  return stacks.map(({ grows, badges }) => {
    const away = grows < 0 ? -1 : 1;
    let by = 0;
    // A step out clears at least one box for good, since a card never comes
    // back towards its shape, so there are no more steps than boxes.
    for (let step = 0; step <= held.length; step += 1) {
      let further = 0;
      for (const badge of badges) {
        const at = { x: badge.x, y: badge.y + by, width: badge.width, height: badge.height };
        for (const box of held) {
          if (!boxesMeet(at, box, air)) continue;
          further = Math.max(further, away < 0 ? at.y + at.height + air - box.y : box.y + box.height + air - at.y);
        }
      }
      if (further < 1e-6) break;
      by += away * further;
    }
    const placed = by === 0 ? badges : badges.map((badge) => badgeMovedBy(badge, 0, by));
    held.push(...placed);
    return placed;
  });
}
