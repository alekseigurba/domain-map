// Export SVG: the map as a picture. It is the stage's own drawing, less
// everything that is there to be pressed rather than seen, cropped to the ink
// with a narrow margin. It carries its icons and its type inside it, because a
// file opened anywhere else has no server behind it to fetch them from.

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

/** Clear space left around the outermost ink, in map pixels. */
const MARGIN = 10;

/**
 * The map itself: every layer stack, exactly as the stage has them. A hidden
 * layer is not drawn on the stage, so it is not in here either, and a dimmed
 * one carries its opacity on the group — the picture is what is on screen.
 * Edit chrome, a line being drawn and the rename editor are not the map.
 */
const TERRAIN = ['layer-stacks'];

/** Targets, not ink: invisible on the stage, and no use in a picture. */
const CHROME = '.title-hit, .snaps, .connector__hit, .connector__rim, .slot';

/** Picked, hovered or held is the page's state, not the map's, and draws in the selection blue. */
const STATE = /--(selected|hover|dragging|swap)$/;

const SHAPES = 'path, ellipse, circle, rect, line, polyline, polygon, text, image';

const PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity'];
const STROKE_DETAIL = ['stroke-opacity', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray'];
const TYPE = ['font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline'];

/** What a reader assumes when an attribute is absent, so there is no need to write it. */
const INITIAL = {
  fill: 'rgb(0, 0, 0)',
  'fill-opacity': '1',
  stroke: 'none',
  'stroke-opacity': '1',
  'stroke-width': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-dasharray': 'none',
  opacity: '1',
  'font-weight': '400',
  'text-anchor': 'start',
  'dominant-baseline': 'auto',
};

/**
 * The diagram as a standalone SVG document, cropped to MARGIN around what is
 * drawn. Throws when there is nothing drawn to crop to.
 */
export async function diagramSvg(diagram, { title = '' } = {}) {
  const content = el('g');
  for (const id of TERRAIN) {
    const layer = diagram.querySelector(`#${id}`).cloneNode(true);
    layer.id = id.replace(/^layer-/, '');
    content.appendChild(layer);
  }
  for (const node of content.querySelectorAll(CHROME)) node.remove();

  // The look comes from the page's stylesheets, and can only be read off a copy
  // that is in the page: it goes in out of sight, and comes straight back out.
  const host = el('svg', { 'aria-hidden': 'true' });
  host.style.cssText = 'position: absolute; width: 0; height: 0; overflow: hidden; visibility: hidden';
  host.appendChild(content);
  document.body.appendChild(host);

  let box;
  try {
    for (const node of content.querySelectorAll('*')) {
      node.classList.remove(...[...node.classList].filter((name) => STATE.test(name)));
    }
    for (const node of content.querySelectorAll(SHAPES)) inlineStyle(node);
    for (const node of content.querySelectorAll('*')) {
      for (const name of node.getAttributeNames()) {
        // `opacity` on a layer group is how a dimmed layer is dimmed, so it
        // stays; class and data-* only ever meant something to the stage.
        if (name === 'class' || name.startsWith('data-')) node.removeAttribute(name);
      }
    }
    box = inkBounds(content);
  } finally {
    host.remove();
  }
  if (!box) throw new Error('There is nothing on the map to export.');

  const [fonts] = await Promise.all([embedFonts(content), embedIcons(content)]);

  const x = Math.floor(box.minX) - MARGIN;
  const y = Math.floor(box.minY) - MARGIN;
  const width = Math.ceil(box.maxX) + MARGIN - x;
  const height = Math.ceil(box.maxY) + MARGIN - y;

  const picture = el('svg', { width, height, viewBox: `${x} ${y} ${width} ${height}` });
  picture.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', XLINK_NS);
  if (title) picture.appendChild(el('title', {}, title));

  const defs = el('defs');
  if (fonts) defs.appendChild(el('style', {}, fonts));
  if (defs.hasChildNodes()) picture.appendChild(defs);

  // The domains are see-through, and their titles were inked for the paper
  // under them, so the paper comes too.
  const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#fff';
  picture.appendChild(el('rect', { x, y, width, height, fill: paper }));
  picture.append(...content.children);

  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(picture)}\n`;
}

function el(tag, attrs = {}, text = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

const round = (n) => Math.round(n * 1000) / 1000;

/** rgba() is CSS; an SVG reader wants the colour and how opaque it is as two attributes. */
function splitAlpha(color) {
  const match = /^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/.exec(color);
  return match
    ? { color: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, alpha: Number(match[4]) }
    : { color, alpha: 1 };
}

/** How a shape looks, read off the stylesheet and written onto the shape as attributes. */
function inlineStyle(node) {
  const style = getComputedStyle(node);
  const names = node.localName === 'text' ? [...PAINT, ...TYPE] : PAINT;
  const values = Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));

  for (const channel of ['fill', 'stroke']) {
    const { color, alpha } = splitAlpha(values[channel]);
    values[channel] = color;
    values[`${channel}-opacity`] = String(round(Number(values[`${channel}-opacity`]) * alpha));
  }
  if (values.fill === 'none') delete values['fill-opacity'];
  if (values.stroke === 'none') for (const name of STROKE_DETAIL) delete values[name];
  if (values['font-family'] && !/\b(serif|sans-serif|monospace)$/.test(values['font-family'])) {
    values['font-family'] += ', sans-serif';
  }

  for (const name of names) node.removeAttribute(name);
  for (const [name, value] of Object.entries(values)) {
    const plain = value.replace(/px\b/g, '');
    if (plain !== INITIAL[name]) node.setAttribute(name, plain);
  }
}

/**
 * The box the ink covers, in map space. getBBox() leaves strokes out, and a
 * capability's rim or a line's round end reaches half its stroke past that —
 * most of a 10px margin.
 */
function inkBounds(content) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const node of content.querySelectorAll(SHAPES)) {
    const local = node.getBBox();
    if (local.width === 0 && local.height === 0) continue;
    const reach = node.hasAttribute('stroke') ? Number(node.getAttribute('stroke-width') ?? 1) / 2 : 0;
    // The host has no viewBox, so the space it hands back is the map's own.
    const toMap = node.getCTM();
    for (const cornerX of [local.x - reach, local.x + local.width + reach]) {
      for (const cornerY of [local.y - reach, local.y + local.height + reach]) {
        const { x, y } = new DOMPoint(cornerX, cornerY).matrixTransform(toMap);
        box.minX = Math.min(box.minX, x);
        box.minY = Math.min(box.minY, y);
        box.maxX = Math.max(box.maxX, x);
        box.maxY = Math.max(box.maxY, y);
      }
    }
  }
  return box.minX <= box.maxX ? box : null;
}

async function dataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

/** Every icon, inside the file: the path it was drawn from only means something to this server. */
async function embedIcons(content) {
  const read = new Map();
  await Promise.all([...content.querySelectorAll('image')].map(async (image) => {
    const href = image.getAttribute('href');
    if (!read.has(href)) read.set(href, dataUrl(href).catch(() => null));
    const data = await read.get(href);
    // An icon the stage cannot fetch draws as nothing there, and so it does here.
    if (!data) {
      image.remove();
      return;
    }
    image.removeAttribute('href');
    image.setAttributeNS(XLINK_NS, 'xlink:href', data);
  }));
}

const unquote = (family) => family.trim().replace(/^["']|["']$/g, '');

/**
 * The faces the labels are set in, as @font-face rules with the font files
 * inside them. Lines were wrapped to fit their shapes in this face; set in
 * another one, they run past the edges.
 */
async function embedFonts(content) {
  const families = new Set();
  for (const text of content.querySelectorAll('text')) {
    for (const family of (text.getAttribute('font-family') ?? '').split(',')) {
      families.add(unquote(family).toLowerCase());
    }
  }

  const faces = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // another origin's stylesheet: not ours to read, and not where the map's type is
    }
    for (const rule of rules) {
      if (!(rule instanceof CSSFontFaceRule)) continue;
      const family = unquote(rule.style.getPropertyValue('font-family'));
      const source = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(rule.style.getPropertyValue('src'));
      if (!families.has(family.toLowerCase()) || !source) continue;

      const descriptors = ['font-style', 'font-weight', 'unicode-range']
        .map((name) => [name, rule.style.getPropertyValue(name)])
        .filter(([, value]) => value)
        .map(([name, value]) => `${name}: ${value}; `)
        .join('');
      faces.push(dataUrl(new URL(source[1], sheet.href ?? location.href).href)
        .then((data) => `@font-face { font-family: "${family}"; ${descriptors}src: url("${data}"); }`)
        .catch(() => null));
    }
  }
  return (await Promise.all(faces)).filter(Boolean).join('\n');
}
