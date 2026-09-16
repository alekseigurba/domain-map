// The page's one way to reach stored files: get, put and list objects by key.
// It mirrors the server's API exactly, and the server's API is deliberately
// plain, so the store behind it can become S3 or anything else that can do the
// same three things without this file changing.

import { signInAgain } from './identity.js';
import { ICON_EXTENSIONS, MAX_ICON_BYTES, extensionOf, looksExecutable, safeIconName } from './rules.js';

const API = 'api/files';

const ICONS_PREFIX = 'data/icons/';

const url = (key) => `${API}/${key.split('/').map(encodeURIComponent).join('/')}`;

/** What the server said went wrong, or something about why it could not say. */
async function complain(response) {
  // The session ended while the page was open: nothing here can be retried
  // until the person signs in again.
  if (response.status === 401) {
    signInAgain();
    return new Error('Your session has ended. Signing in again…');
  }
  const fallback = `The server answered ${response.status}.`;
  try {
    const body = await response.json();
    return new Error(body.error ?? fallback);
  } catch {
    return new Error(fallback);
  }
}

/** The object at `key`, or null when there is none. */
export async function getFile(key) {
  const response = await fetch(url(key), { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw await complain(response);
  return response;
}

export async function putFile(key, body, type = 'application/octet-stream') {
  const response = await fetch(url(key), {
    method: 'PUT',
    headers: { 'Content-Type': type },
    body,
  });
  if (!response.ok) throw await complain(response);
  return response.json();
}

/** Everything stored under `prefix`, as `{ key, size, lastModified }`. */
export async function listFiles(prefix) {
  const response = await fetch(`${API}?prefix=${encodeURIComponent(prefix)}`, { cache: 'no-store' });
  if (!response.ok) throw await complain(response);
  return (await response.json()).objects ?? [];
}

// --- icons -------------------------------------------------------------------

// Icons are files under `data/icons/`, and the map stores only the name — an
// exported map names its icons, it does not carry them.

/** Where the page points an <img> or an SVG <image> at an icon. */
export const iconUrl = (name) => url(`${ICONS_PREFIX}${name}`);

const isIcon = (name) => ICON_EXTENSIONS.includes(extensionOf(name));

export async function listIcons() {
  const objects = await listFiles(ICONS_PREFIX);
  return objects
    .map((object) => object.key.slice(ICONS_PREFIX.length))
    .filter((name) => name.length > 0 && !name.includes('/') && isIcon(name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** Store one icon and answer with the name the map should keep. */
export async function saveIcon(file) {
  if (file.size > MAX_ICON_BYTES) {
    throw new Error(`An icon must be under ${MAX_ICON_BYTES / 1024} KB.`);
  }

  const name = safeIconName(file.name);
  if (!name) throw new Error('That file name cannot be used.');

  const extension = extensionOf(name);
  if (!ICON_EXTENSIONS.includes(extension)) {
    throw new Error(`An icon must be one of ${ICON_EXTENSIONS.join(', ')}.`);
  }

  // An SVG is a document, and a document served from this origin could carry
  // script that runs as whoever opens it. Only take the drawing.
  let body = file;
  let type = file.type || 'application/octet-stream';
  if (extension === '.svg') {
    const markup = await file.text();
    if (looksExecutable(markup)) throw new Error('That SVG carries script, so it was not saved.');
    body = markup;
    type = 'image/svg+xml';
  }

  const saved = await freeName(name, await listIcons());
  await putFile(`${ICONS_PREFIX}${saved}`, body, type);
  return saved;
}

/** A name nothing else has, so an upload never overwrites an icon in use. */
function freeName(name, taken) {
  if (!taken.includes(name)) return name;

  const dot = name.lastIndexOf('.');
  const stem = dot < 0 ? name : name.slice(0, dot);
  const extension = dot < 0 ? '' : name.slice(dot);

  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem}-${n}${extension}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${stem}-${crypto.randomUUID()}${extension}`;
}
