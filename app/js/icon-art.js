// An icon as the map draws it: the picture to point an <image> at, and where in
// that picture the drawing actually is. Both take the page — a fetch, a canvas —
// so they are worked out here and handed to geometry.js, which stays pure and
// only keeps what was found.

import { WHOLE_ICON, DEFAULT_ICON_WEIGHT, iconKeyOf, iconWeightOf, setIconInk } from './geometry.js';

/** The longer side of the canvas an icon is measured on. Enough for a hairline to register. */
const SAMPLE = 192;
/** How opaque a pixel has to be to count as drawn: anti-aliasing fades out well under this. */
const DRAWN = 12;

/** Ready art by key, which is the file name and the weight it is drawn at. */
const ready = new Map();
const pending = new Set();
/** The last art shown for a file at any weight, to draw while the next one is prepared. */
const lastShown = new Map();

/**
 * The art for a record's icon: `{ href, ink }`, or null the first time a file is
 * asked for, while it is being prepared. `urlOf` names the file on the server
 * and `onReady` is called once there is something new to draw.
 *
 * An <image> is a document of its own, which no stylesheet here can reach, so a
 * heavier line is not a style: it is another drawing, made from the file with
 * every stroke width multiplied, and pointed at in place of the file.
 */
export function iconArt(record, urlOf, onReady) {
  const key = iconKeyOf(record);
  if (ready.has(key)) {
    lastShown.set(record.icon, ready.get(key));
    return ready.get(key);
  }

  if (!pending.has(key)) {
    pending.add(key);
    prepare(urlOf(record.icon), iconWeightOf(record))
      // A file that cannot be read or measured is drawn as it is, whole: an
      // icon laid out by its file is a worse layout, not a missing icon.
      .catch(() => ({ href: urlOf(record.icon), ink: WHOLE_ICON }))
      .then((art) => {
        ready.set(key, art);
        setIconInk(key, art.ink);
        pending.delete(key);
        onReady();
      });
  }
  return lastShown.get(record.icon) ?? null;
}

async function prepare(url, weight) {
  const href = weight === DEFAULT_ICON_WEIGHT ? url : await weighed(url, weight);
  return { href, ink: await inkOf(href) };
}

/** The file at `url` with its lines `weight` times as heavy, as a URL of its own. */
async function weighed(url, weight) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} answered ${response.status}.`);

  // Parsed, never put in the page: nothing in it runs, here or as an <image>.
  const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
  const root = parsed.documentElement;
  if (root.localName !== 'svg') throw new Error(`${url} is not an SVG.`);

  let heaviest = 0;
  const heavier = (width) => width.replace(/^\s*[\d.]+/, (number) => {
    heaviest = Math.max(heaviest, Number(number));
    return String(Number(number) * weight);
  });
  const inStyle = (css) => css.replace(/(stroke-width\s*:)\s*([\d.]+)/g,
    (_, name, number) => `${name}${heavier(number)}`);

  for (const node of [root, ...root.querySelectorAll('*')]) {
    if (node.hasAttribute('stroke-width')) node.setAttribute('stroke-width', heavier(node.getAttribute('stroke-width')));
    if (node.hasAttribute('style')) node.setAttribute('style', inStyle(node.getAttribute('style')));
    if (node.localName === 'style') node.textContent = inStyle(node.textContent);
  }
  // A line that names no width is 1 wide, and takes this one from the root.
  if (!root.hasAttribute('stroke-width')) {
    heaviest = Math.max(heaviest, 1);
    root.setAttribute('stroke-width', String(weight));
  }

  // A heavier line reaches further out, and a drawing that ran close to the
  // edge of its file would be clipped by it. The file grows by what the lines
  // gained; the map lays an icon out by its ink, so the wider margin costs nothing.
  const box = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const gained = (heaviest * Math.max(0, weight - 1)) / 2;
  if (box.length === 4 && box.every(Number.isFinite) && gained > 0) {
    const [x, y, width, height] = box;
    root.setAttribute('viewBox', `${x - gained} ${y - gained} ${width + gained * 2} ${height + gained * 2}`);
    for (const [name, side] of [['width', width], ['height', height]]) {
      const size = parseFloat(root.getAttribute(name));
      if (Number.isFinite(size)) root.setAttribute(name, String(size * ((side + gained * 2) / side)));
    }
  }

  const markup = new XMLSerializer().serializeToString(root);
  return URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
}

/**
 * The box the drawing covers in a picture, as shares of it, found by drawing it
 * small and looking for what is not transparent. A picture with no transparency
 * — a photograph — is all ink, which is the right answer for it.
 */
async function inkOf(href) {
  const image = new Image();
  image.src = href;
  await image.decode();

  const natural = { width: image.naturalWidth || 1, height: image.naturalHeight || 1 };
  const scale = SAMPLE / Math.max(natural.width, natural.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(natural.width * scale));
  canvas.height = Math.max(1, Math.round(natural.height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

  const found = { left: canvas.width, top: canvas.height, right: -1, bottom: -1 };
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] < DRAWN) continue;
      found.left = Math.min(found.left, x);
      found.right = Math.max(found.right, x);
      found.top = Math.min(found.top, y);
      found.bottom = Math.max(found.bottom, y);
    }
  }

  const aspect = natural.width / natural.height;
  if (found.right < 0) return { ...WHOLE_ICON, aspect };
  return {
    x: found.left / canvas.width,
    y: found.top / canvas.height,
    width: (found.right - found.left + 1) / canvas.width,
    height: (found.bottom - found.top + 1) / canvas.height,
    aspect,
  };
}
