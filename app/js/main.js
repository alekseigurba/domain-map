// Wiring: loads the map, keeps the three views in sync, turns diagram and
// sidebar intents into changes, and writes the file they add up to.

import {
  store, subscribe, setMap, select, find, childrenOf, slugFor, slugify, findBySlug,
  connectorLabel, oneLine,
  createDomain, updateDomain, deleteDomain,
  createCapability, updateCapability, deleteCapability,
  createConnector as addConnector, updateConnector, deleteConnector,
  restore, updateMap,
} from './store.js';
import { fromDocument, toDocument, stringify, validate } from './document.js';
import * as files from './files.js';
import { showIdentity, signingIn, whoAmI } from './identity.js';
import * as api from './versions.js';
import { diagramSvg } from './svg-export.js';
import {
  initDiagram, render, fitToScreen, zoomBy, centerOn, cancelDraft, viewportCenter, resolvedPoints,
  contentBounds, setEditing, isEditing, kebabAnchor, startRename, cancelRename,
  setEditMode as setDiagramEditMode,
} from './diagram.js';
import { renderMenu, collapseAll } from './menu.js';
import {
  initDetails, renderDetails, fitAreas, setEditMode as setDetailsEditMode,
} from './details.js';
import { initPalette, openPalette, renderPalette, paletteOpen } from './palette.js';
import { initTextDialog, textDialogOpen } from './text-dialogs.js';
import { loadIcons } from './icons.js';
import {
  CAPABILITY_FONT_SIZES, SIZE_SCALES, OVAL_STRETCHES, DEFAULT_FONT_SIZE, DEFAULT_FONT_WEIGHT,
  DEFAULT_CAPABILITY_FONT_WEIGHT, DEFAULT_STRETCH, DOMAIN_GAP,
  capabilitySize, layoutDomain, newLobeSpot, setPalette, swatchFor,
} from './geometry.js';
import { DOMAIN_SHAPE, CAPABILITY_SHAPE } from './defaults.js';
import * as undoStack from './history.js';

/** Branding is a stored file too, so it can be changed without a rebuild. */
const SETTINGS_KEY = 'data/settings.json';

const statusBar = document.getElementById('status');
const statsBar = document.getElementById('stats');
const hint = document.getElementById('hint');
const main = document.querySelector('.main');

let syncingHash = false;
let settings = {};

// --- plumbing ---------------------------------------------------------------

function status(message, isError = false) {
  statusBar.textContent = message;
  statusBar.style.color = isError ? '#8c2f18' : '';
  if (!isError && message) setTimeout(() => { if (statusBar.textContent === message) statusBar.textContent = ''; }, 1600);
}

/**
 * Changes are made in memory and cannot fail on the way there; what can fail is
 * the file, and that is reported by the save itself.
 */
async function run(label, work) {
  try {
    status(`${label}…`);
    return await work();
  } catch (error) {
    status(error.message ?? String(error), true);
    return null;
  }
}

// --- versions, and saving to them --------------------------------------------

// Editing happens in this page and nowhere else: changes are held in memory
// until Save is pressed, and then the whole map is written to the version that
// is open. The versions live on the server, and one of them is published: that
// is the map everyone lands on, and the only one a viewer ever sees.

/** What this person may do, 'owner' or 'viewer'. Nothing until the server has said. */
let role = null;
const isOwner = () => role === 'owner';

/**
 * The version on screen, as `{ name, updatedAt }` — the second is sent back
 * with a save, so the server can refuse it if somebody saved in between — and
 * whether it has changes it has not been given. No version at all when nothing
 * is published yet and an owner is starting from a blank map.
 */
let current = null;
let dirty = false;

/** Which version is published, as last heard from the server. */
let publishedName = null;
const isPublished = (name) => name != null && name === publishedName;

const saveButton = document.getElementById('save-map');
const editModeButton = document.getElementById('edit-mode-toggle');
const cancelButton = document.getElementById('cancel-edit');
const versionsButton = document.getElementById('versions');
const importButton = document.getElementById('import-map');

function showSaveState() {
  const name = current?.name ?? null;
  saveButton.dataset.dirty = String(dirty);
  saveButton.disabled = !current;
  if (!current) saveButton.title = 'Nothing to save over yet: Versions saves this map as a new one';
  else if (dirty) saveButton.title = `Unsaved changes — press to write them to "${name}"`;
  else saveButton.title = `Saved to "${name}"`;
  saveButton.hidden = !editMode;
  cancelButton.hidden = !editMode;
  editModeButton.hidden = editMode || !isOwner();

  // An owner's only: a viewer has one version, and nothing to put in it.
  versionsButton.hidden = !isOwner();
  importButton.hidden = !isOwner();
  document.getElementById('version-name').textContent = name ?? 'Not saved yet';
  document.getElementById('version-published').hidden = !isPublished(name);
}

function markDirty() {
  dirty = true;
  showSaveState();
  keepSession();
}

/** The address names the version open, unless it is the published one: that one keeps the clean URL. */
function showVersionInUrl() {
  const url = new URL(location.href);
  if (current && !isPublished(current.name)) url.searchParams.set('version', current.name);
  else url.searchParams.delete('version');
  if (url.href !== location.href) history.replaceState(null, '', url);
}

// --- view vs edit --------------------------------------------------------

// The map opens read-only: everything can be picked and inspected, but
// nothing on it moves or changes until Edit is pressed. A successful save is
// itself the "done" gesture, so it drops the page back into View mode; Cancel
// does the same by unwinding to the marker Edit dropped, instead.
let editMode = false;
const EDIT_MARK = 'view-edit-session';

function applyEditMode() {
  // Browsing has nothing for these to do, so the whole row leaves rather than
  // sitting there greyed out.
  document.getElementById('menu-actions').hidden = !editMode;
  document.getElementById('details-actions').hidden = !editMode;
  document.getElementById('import-map').disabled = !editMode;
  if (editMode) hint.textContent = 'Drag to pan · scroll to zoom · click a connection point to start a connector';
  else if (isOwner()) hint.textContent = 'Drag to pan · scroll to zoom · press Edit to make changes';
  else hint.textContent = 'Drag to pan · scroll to zoom';
  showSaveState();
  showSelectionActions();
}

function setEditMode(next) {
  if (editMode === next) return;
  editMode = next;
  if (editMode) undoStack.mark(EDIT_MARK);
  else closeKebab();
  setDiagramEditMode(editMode);
  setDetailsEditMode(editMode);
  applyEditMode();
  keepSession();
}

/** Cancel: unwind every change made since Edit was pressed, then leave. */
async function cancelEdit() {
  if (!editMode) return;
  if (dirty && !confirm('Discard the changes made since Edit was pressed?')) return;

  status('Discarding…');
  const undone = await undoStack.rewindTo(EDIT_MARK);
  // Undoing re-marks the map dirty at every step on the way back down, even
  // when the bottom it lands on is the one last saved: canUndo is what
  // actually knows whether anything is still unwritten below the marker (a
  // refresh mid-edit loses the marker itself, so this can land on more than
  // just what Cancel was pressed for).
  dirty = undoStack.canUndo();
  setEditMode(false);
  status(undone ? `Discarded ${undone} change${undone === 1 ? '' : 's'}` : 'Nothing to discard');
}

/** "Sep 18, 14:02", for when a version was saved. */
const savedAt = (iso) => new Date(iso)
  .toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const documentText = () => stringify(toDocument(store));

/** Written: `version` is the one on screen now, with nothing left unsaved in it. */
function saved(version) {
  current = { name: version.name, updatedAt: version.updatedAt };
  if (version.published) publishedName = version.name;
  dirty = false;
  showVersionInUrl();
  showSaveState();
  keepSession();
  undoStack.dropMark(EDIT_MARK); // kept, not undone: nothing left to cancel back to
  setEditMode(false);
}

/**
 * Write the map to the version that is open. Over the published one it asks
 * first, since everyone will see the change. And if somebody else saved the
 * version after this tab opened it, the server refuses, and a new version is
 * offered instead of writing over their work. Answers whether it saved.
 */
async function save({ ask = true } = {}) {
  if (!current) return false;
  const { name } = current;
  if (ask && isPublished(name)
      && !confirm(`"${name}" is the published version: everyone will see this change. Save it?`)) return false;

  status('Saving…');
  try {
    saved(await api.saveVersion(name, documentText(), current.updatedAt));
    status(`Saved to "${name}"`);
    return true;
  } catch (error) {
    if (error.status !== 409 || !error.version) {
      status(`Could not save: ${error.message}`, true);
      return false;
    }
    const who = error.version.updatedBy?.name ?? error.version.updatedBy?.email ?? 'Someone';
    const when = savedAt(error.version.updatedAt);
    status(`Not saved: ${who} saved "${name}" at ${when}, after you opened it.`, true);
    if (!confirm(`${who} saved "${name}" at ${when}, after you opened it, and saving now would write `
      + 'over their changes.\n\nSave your map as a new version instead?')) return false;
    return saveAsNew();
  }
}

/** The map as it stands, saved as a new version, one number past the last. That is the one open from then on. */
async function saveAsNew() {
  status('Saving…');
  try {
    const version = await api.createVersion(documentText());
    saved(version);
    status(`Saved as "${version.name}"`);
    return true;
  } catch (error) {
    status(`Could not save: ${error.message}`, true);
    return false;
  }
}

/** A version's document, read and checked. */
function readDocument(version) {
  let document_;
  try {
    document_ = JSON.parse(version.document);
  } catch (error) {
    throw new Error(`"${version.name}" is not valid JSON: ${error.message}`);
  }
  const error = validate(document_);
  if (error) throw new Error(`"${version.name}" is not a valid map: ${error}`);
  return document_;
}

/** Put a version on screen as a fresh start, with nothing in it to undo. */
function showVersion(version) {
  const document_ = readDocument(version);
  hideNotice();
  undoStack.clear(); // its inverse operations name records that are gone
  applyMap(fromDocument(document_));
  current = { name: version.name, updatedAt: version.updatedAt };
  if (version.published) publishedName = version.name;
  dirty = false;
  setEditMode(false); // a fresh version opens for browsing, not mid-edit
  showVersionInUrl();
  showSaveState();
  keepSession();
}

/** An empty map, with no version behind it until it is saved as a new one. */
function showBlank() {
  hideNotice();
  undoStack.clear();
  applyMap(fromDocument({ title: 'Domain map' }));
  current = null;
  dirty = false;
  setEditMode(false);
  showVersionInUrl();
  showSaveState();
}

/** Open a version in place of what is on screen. Answers whether it did. */
async function openVersion(name) {
  if (dirty && !confirm(`Open "${name}"? The changes made here have not been saved.`)) return false;

  status('Opening…');
  try {
    showVersion(await api.readVersion(name));
    select(null, null);
    fitToScreen();
    status(`Opened "${name}"`);
    return true;
  } catch (error) {
    status(`Could not open "${name}": ${error.message}`, true);
    return false;
  }
}

/** The published version, on screen; with nothing published, what this person can have instead. */
async function openPublished() {
  const version = await api.readPublished();
  if (version) {
    showVersion(version);
    select(null, null);
    fitToScreen();
    return;
  }

  publishedName = null;
  if (isOwner()) {
    showBlank();
    status('Nothing is published yet: make a map, save it from Versions and publish it there.');
  } else {
    showNotice('Nothing to see yet',
      'No version of this map has been published. It will be here once an owner publishes one.');
  }
}

/**
 * Make `name` the map everyone lands on. What is published is what is saved,
 * so the version open here is saved first if it has changes, or not published.
 */
async function publish(name) {
  if (name === current?.name && dirty) {
    if (!confirm(`"${name}" has changes that are not saved. Save them and publish it?`)) return;
    if (!await save({ ask: false })) return;
  } else if (!confirm(`Publish "${name}"? Everyone will see it the next time they open the map.`)) {
    return;
  }

  status('Publishing…');
  try {
    await api.publishVersion(name);
    publishedName = name;
    showVersionInUrl();
    showSaveState();
    status(`Published "${name}"`);
  } catch (error) {
    status(`Could not publish: ${error.message}`, true);
  }
}

/** Delete a version for good. When it is the one open here, the published one takes its place. */
async function removeVersion(name) {
  const open = name === current?.name;
  const question = open && dirty
    ? `Delete "${name}"? It is open here with changes that are not saved, and they go with it. This cannot be undone.`
    : `Delete "${name}"? This cannot be undone.`;
  if (!confirm(question)) return;

  status('Deleting…');
  try {
    await api.deleteVersion(name);
  } catch (error) {
    status(`Could not delete: ${error.message}`, true);
    return;
  }
  if (open) {
    dirty = false; // gone with the version, as the question said
    await openPublished();
  }
  status(`Deleted "${name}"`);
}

// --- the Versions dialog -----------------------------------------------------

const versionsDialog = document.getElementById('versions-dialog');
const versionsRows = document.getElementById('versions-rows');
const versionsNote = document.getElementById('versions-note');
const saveAsNewButton = document.getElementById('save-as-new');

function note(text, isError = false) {
  versionsNote.textContent = text ?? '';
  versionsNote.hidden = !text;
  versionsNote.dataset.error = String(isError);
}

function badge(text, quiet = false) {
  const tag = document.createElement('span');
  tag.className = quiet ? 'badge badge--quiet' : 'badge';
  tag.textContent = text;
  return tag;
}

function cell(className, ...children) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.append(...children);
  return td;
}

function rowButton(label, title, onClick, { disabled = false, danger = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = danger ? 'btn btn--chip btn--danger' : 'btn btn--chip';
  button.textContent = label;
  button.title = title;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

/** One row a version: its name, when and by whom it was last saved, and what can be done with it. */
function versionRow(version) {
  const open = version.name === current?.name;
  const { published } = version;

  const name = document.createElement('span');
  name.className = 'versions__name';
  name.append(version.name);
  if (published) name.append(badge('Published'));
  if (open) name.append(badge('Open', true));

  const by = cell('versions__by', version.updatedBy?.name ?? version.updatedBy?.email ?? '—');
  if (version.updatedBy?.email) by.title = version.updatedBy.email;

  const actions = document.createElement('div');
  actions.className = 'versions__actions';
  actions.append(
    rowButton('Open', open ? 'This is the version open here' : `Open "${version.name}"`,
      () => act(() => openVersion(version.name), { close: true }), { disabled: open }),
    rowButton('Publish', published ? 'This is the published version' : `Make "${version.name}" the map everyone sees`,
      () => act(() => publish(version.name)), { disabled: published }),
    // The published version stays until another takes its place, so the map
    // everyone lands on can never be deleted out from under them.
    rowButton('Delete', published ? 'Publish another version before deleting this one' : `Delete "${version.name}" for good`,
      () => act(() => removeVersion(version.name)), { disabled: published, danger: true }),
  );

  const row = document.createElement('tr');
  row.dataset.open = String(open);
  row.append(cell(null, name), cell('versions__when', savedAt(version.updatedAt)), by, cell(null, actions));
  return row;
}

/** Read the versions again and show them. */
async function refreshVersions() {
  try {
    const list = await api.listVersions();
    publishedName = list.find((version) => version.published)?.name ?? null;
    showVersionInUrl();
    showSaveState(); // the header's Published tag follows
    versionsRows.replaceChildren(...list.map(versionRow));
    note(list.length === 0 ? 'There are no versions yet. Save this map as the first one.' : null);
  } catch (error) {
    note(`Could not read the versions: ${error.message}`, true);
  }
}

/**
 * One of the dialog's actions, with its buttons held down while it runs so a
 * second press cannot start a second request; then the list as it now stands.
 * An Open that went through closes the dialog: the map is what was wanted.
 */
async function act(work, { close = false } = {}) {
  for (const button of versionsDialog.querySelectorAll('button:not(#versions-close)')) button.disabled = true;
  let done;
  try {
    done = await work();
  } finally {
    saveAsNewButton.disabled = false;
  }
  if (close && done) versionsDialog.close();
  else await refreshVersions();
}

// --- when there is no map to show ---------------------------------------------

const notice = document.getElementById('notice');

/** Say why the stage is empty. `link` offers the way to the published map. */
function showNotice(title, text, { link = false } = {}) {
  document.getElementById('notice-title').textContent = title;
  document.getElementById('notice-text').textContent = text;
  const anchor = document.getElementById('notice-link');
  anchor.hidden = !link;
  anchor.href = location.pathname; // the clean address, which is the published map
  notice.hidden = false;
}

function hideNotice() {
  notice.hidden = true;
}

// --- loading -----------------------------------------------------------------

/** Point the shapes at the map's colours and name the map, then hand it over. */
function applyMap(state) {
  setPalette(state.palette ?? []);
  // The stored settings win over the map's own title; without one, the map names itself.
  if (!settings.title) document.getElementById('map-title').textContent = state.title;
  setMap(state);
}

/**
 * For an owner: what this tab had before a refresh, or the version the address
 * names, or the published one. Unsaved changes come back whatever the server
 * holds now, since this tab is the only place they exist.
 *
 * For a viewer: the published version, and nothing else. A link to any other
 * is turned away rather than quietly swapped for the published one, so nobody
 * mistakes one for the other.
 */
async function loadMap() {
  const wanted = new URL(location.href).searchParams.get('version');

  if (!isOwner()) {
    if (!wanted) return openPublished();
    try {
      showVersion(await api.readVersion(wanted)); // only the published one is open to a viewer
    } catch (error) {
      if (error.status !== 403 && error.status !== 404) throw error;
      showNotice('This version is not open to you',
        `Only an owner can open "${wanted}". Everyone else sees the published map.`, { link: true });
    }
    return;
  }

  const session = readSession();
  const published = await api.readPublished();
  publishedName = published?.name ?? null;

  if (session?.dirty) {
    // A session kept before saves carried a base has none: the version as it
    // is now is the nearest thing, and a save still says if it moves on again.
    let base = session.base;
    if (!base) base = (await api.readVersion(session.version).catch(() => null))?.updatedAt ?? null;
    resume(session, base);
    status(`Restored the unsaved changes to "${session.version}"`);
    return;
  }

  let version = null;
  const name = wanted ?? session?.version ?? null;
  if (name && name !== published?.name) {
    try {
      version = await api.readVersion(name);
    } catch (error) {
      if (error.status !== 404) throw error;
      // The address asked for it, so say it is not there; a session's version
      // that has since been deleted just gives way to the published one.
      if (wanted) status(`There is no version "${wanted}", so this is the published one.`, true);
    }
  }
  version ??= published;
  if (!version) return openPublished();

  // A clean session is this same version under the ids its history names, so
  // the history comes back with it. Unless somebody has saved over it since:
  // then the server's copy is the map, and the history belongs to one that is gone.
  if (session?.version === version.name && stringify(toDocument(session.map)) === version.document.trimEnd()) {
    resume(session, version.updatedAt);
    return;
  }
  showVersion(version);
}

// --- surviving a refresh -----------------------------------------------------

// Unsaved changes and the undo history live in the page, so a refresh used to
// lose both. The session is written down after every change and read back on
// load. Session storage rather than local: it lasts through a refresh but
// belongs to this tab, so a second tab open on the same map cannot overwrite it.

const SESSION = 'domain-map:session';

let sessionPending = false;

/**
 * Write the session down once the change in progress is done. A reset or a
 * restack is a run of writes, and this makes them one; it also lands after the
 * render that settles connector points, so what is kept is what is drawn.
 */
function keepSession() {
  if (sessionPending) return;
  sessionPending = true;
  setTimeout(() => {
    sessionPending = false;
    if (!current) return; // still loading, or a blank map: nothing of this tab's to keep yet
    try {
      sessionStorage.setItem(SESSION, JSON.stringify({
        version: current.name,
        // When the version was saved as this tab has it, for the save to send back.
        base: current.updatedAt,
        dirty,
        editMode,
        // The records, ids and all, rather than the document: ids are what the
        // history names, and a document read back is given new ones.
        map: {
          title: store.title,
          palette: store.palette,
          domains: store.domains,
          capabilities: store.capabilities,
          connectors: store.connectors,
        },
        history: undoStack.kept(),
      }));
    } catch {
      /* full, or switched off: the page carries on, and a refresh starts from the saved version */
    }
  });
}

/** The session this tab kept, if the app can still open it. */
function readSession() {
  let session;
  try {
    session = JSON.parse(sessionStorage.getItem(SESSION));
  } catch {
    return null;
  }
  if (!session?.version || !session.map) return null;
  // Kept before the versions moved into the database, it names a file.
  session.version = session.version.replace(/^data\/versions\//, '').replace(/\.json$/, '');

  // The code may have moved on since it was written. A map that no longer
  // passes is refused, the way a file would be.
  let error;
  try {
    error = validate(toDocument(session.map));
  } catch (thrown) {
    error = thrown.message;
  }
  if (!error) return session;

  if (session.dirty) status(`The unsaved changes could not be restored: ${error}`, true);
  return null;
}

/** Carry on where the tab left off: the same records, ids and history. */
function resume(session, updatedAt) {
  hideNotice();
  undoStack.load(session.history);
  applyMap(session.map);
  current = { name: session.version, updatedAt };
  dirty = session.dirty === true;
  setEditMode(session.editMode === true);
  showVersionInUrl();
  showSaveState();
}

// --- branding ----------------------------------------------------------------

const DEFAULT_SETTINGS = {
  logo: '◈',
  logoSrc: null,
  logoAlt: '',
  title: 'Domain map',
  footer: '',
};

/** The stub mark, for when there is no logo file to show. An explicit "" means
 *  the header wants no mark at all; a missing or null one gets the default. */
function showGlyph(logo) {
  logo.textContent = settings.logo ?? DEFAULT_SETTINGS.logo;
  logo.setAttribute('aria-hidden', 'true');
}

/** Header logo, header title and footer text, all read from the stored settings. */
async function applySettings() {
  try {
    const response = await files.getFile(SETTINGS_KEY);
    settings = response ? { ...DEFAULT_SETTINGS, ...(await response.json()) } : { ...DEFAULT_SETTINGS };
  } catch {
    settings = { ...DEFAULT_SETTINGS }; // missing or malformed: fall back, never blank
  }

  const logo = document.getElementById('logo');
  if (settings.logoSrc) {
    const image = document.createElement('img');
    image.src = settings.logoSrc;
    image.alt = settings.logoAlt ?? '';
    // The mark is a stored file now, so it can be absent -- an empty volume, or
    // a store whose settings still name the old path the app shipped. A broken
    // image in the header is worse than no image: fall back to the glyph.
    image.addEventListener('error', () => showGlyph(logo), { once: true });
    logo.replaceChildren(image);
    logo.removeAttribute('aria-hidden');
  } else {
    showGlyph(logo);
  }

  if (settings.title) {
    document.getElementById('map-title').textContent = settings.title;
    document.title = settings.title;
  }
  document.getElementById('footer-text').textContent = settings.footer ?? '';
}

const writerFor = {
  capability: updateCapability,
  domain: updateDomain,
  connector: updateConnector,
};

const removerFor = {
  capability: deleteCapability,
  domain: deleteDomain,
  connector: deleteConnector,
};

// --- undo, as data -----------------------------------------------------------

// An undo step is a list of plain calls into the store rather than a function,
// so the history can be written down with the rest of the session.

const undoUpdate = (type, id, fields) => ({ op: 'update', type, id, fields });
const undoDelete = (type, id) => ({ op: 'delete', type, id });

/** Carry out the calls of one undo step, in order. */
function applyUndo(calls) {
  for (const call of calls) {
    if (call.op === 'update') writerFor[call.type]?.(call.id, call.fields);
    else if (call.op === 'delete') removerFor[call.type]?.(call.id);
    else if (call.op === 'restore') restore(call.removed);
    else if (call.op === 'palette') usePalette(call.palette);
  }
}

/** The values a change is about to replace, so that undo can put them back. */
const valuesOf = (record, changes) =>
  Object.fromEntries(Object.keys(changes).map((key) => [key, record[key]]));

/** Apply a partial update, remembering the values it replaced so Ctrl-Z works. */
function patch(type, id, body, label = 'Saving') {
  const write = writerFor[type];
  if (!write) return null;

  const before = find(type, id);
  if (before) undoStack.record(label, [undoUpdate(type, id, valuesOf(before, body))]);
  return run(label, () => write(id, body));
}

// --- placing new shapes ------------------------------------------------------

/**
 * Where a new shape lands: clear of the right-hand edge of everything already
 * on the map, level with the middle of it. Dropping one into the middle of the
 * view put it on top of whatever was already there, so the first thing every
 * new shape needed was dragging out of the pile.
 *
 * An empty map has no edge to sit beside, so the first shape goes where the
 * user is looking.
 *
 * @param halfWidth how far the new shape reaches from its own centre
 */
function freeSpot(halfWidth = 0, gap = DOMAIN_GAP) {
  if (store.domains.length === 0 && store.capabilities.length === 0) return viewportCenter();

  const bounds = contentBounds();
  return {
    x: Math.round(bounds.maxX + gap + halfWidth),
    y: Math.round((bounds.minY + bounds.maxY) / 2),
  };
}

// --- actions ----------------------------------------------------------------

/**
 * How a shape looks out of the box: sizes, type and colour, from defaults.js.
 * The colour is a hex there and a swatch on a shape, so it is matched against
 * the palette the map wears now.
 */
const domainLook = () => ({
  colorIndex: swatchFor(DOMAIN_SHAPE.color),
  opacity: DOMAIN_SHAPE.opacity,
  fontSize: DOMAIN_SHAPE.fontSize,
  fontWeight: DOMAIN_SHAPE.fontWeight,
  titleScale: DOMAIN_SHAPE.titleScale,
});

const capabilityLook = () => ({
  colorIndex: swatchFor(CAPABILITY_SHAPE.color),
  fontSize: CAPABILITY_SHAPE.fontSize,
  fontWeight: CAPABILITY_SHAPE.fontWeight,
  sizeScale: CAPABILITY_SHAPE.sizeScale,
  stretch: CAPABILITY_SHAPE.stretch,
});

async function addDomain() {
  // How wide an empty domain draws, so it sits *beside* the map rather than
  // with its left half over it.
  const { extentWidth } = layoutDomain(DOMAIN_SHAPE, []);
  const spot = freeSpot(extentWidth);
  const created = await run('Adding domain', () => createDomain({
    title: DOMAIN_SHAPE.title,
    ...domainLook(),
    x: spot.x,
    y: spot.y,
  }));
  if (created) {
    undoStack.record('Adding domain', [undoDelete('domain', created.id)]);
    select('domain', created.id);
    centerOn('domain', created.id);
  }
}

/** How far a capability added over the selected one sits from it: right and down, like a shadow. */
const SHADOW_OFFSET = 20;

/**
 * Where a new capability goes. Over another, it lands on top of that one and
 * just off it, in the same domain; into an empty domain, it goes under the
 * title; into one with capabilities already, it gets a lobe in the first spot
 * clear of them and the title; on its own, clear of everything on the map.
 */
function placeCapability(domainId, over) {
  if (over?.domainId) {
    return {
      domainId: over.domainId,
      lobeX: (over.lobeX ?? 0) + SHADOW_OFFSET,
      lobeY: (over.lobeY ?? 0) + SHADOW_OFFSET,
    };
  }
  if (over) return { domainId: null, x: over.x + SHADOW_OFFSET, y: over.y + SHADOW_OFFSET };
  if (domainId) {
    const lobe = newLobeSpot(find('domain', domainId), childrenOf(domainId));
    return { domainId, lobeX: lobe.x, lobeY: lobe.y };
  }
  const spot = freeSpot(capabilitySize(CAPABILITY_SHAPE).rx);
  return { domainId: null, x: spot.x, y: spot.y };
}

/**
 * A new capability gets a lobe of its own, dropped into the first clear spot in
 * the domain — or, given one to go over, a place on top of that one. One that
 * lands in a domain starts out in the domain's colour; from then on the colour
 * is its own, to change like any other. During an edit session the domain keeps
 * the selection — losing it would shut the kebab, and with it the Save and
 * Cancel the session still needs.
 */
async function addCapability(domainId = null, { keepSelection = false, over = null } = {}) {
  const place = placeCapability(domainId, over);
  const home = place.domainId ? find('domain', place.domainId) : null;
  const created = await run('Adding capability', () => createCapability({
    title: CAPABILITY_SHAPE.title,
    ...capabilityLook(),
    ...(home ? { colorIndex: home.colorIndex } : {}),
    ...place,
  }));
  if (created) {
    undoStack.record('Adding capability', [undoDelete('capability', created.id)]);
    if (keepSelection) return;
    select('capability', created.id);
    // Loose on the map it may have landed out of sight; anywhere else it is
    // right beside what was selected.
    if (!created.domainId && !over) centerOn('capability', created.id);
  }
}

/** Add a capability follows the selection: into a domain, over a capability, or onto open ground. */
function addCapabilityHere() {
  const { type, id } = store.selection;
  if (type === 'domain') return addCapability(id);
  if (type === 'capability') return addCapability(null, { over: find('capability', id) });
  return addCapability(null);
}

async function dropCapability(id, info) {
  const was = find('capability', id);
  const before = {
    domainId: was.domainId,
    lobeX: was.lobeX,
    lobeY: was.lobeY,
    x: was.x,
    y: was.y,
  };

  const swapped = info.swapWith ? find('capability', info.swapWith) : null;
  const partner = swapped && {
    id: swapped.id,
    domainId: swapped.domainId,
    lobeX: swapped.lobeX,
    lobeY: swapped.lobeY,
    x: swapped.x,
    y: swapped.y,
  };

  const undo = [undoUpdate('capability', id, { ...before, clearDomain: before.domainId === null })];
  if (partner) {
    const { id: partnerId, ...fields } = partner;
    undo.push(undoUpdate('capability', partnerId, { ...fields, clearDomain: partner.domainId === null }));
  }
  undoStack.record('Moving', undo);

  await run('Moving', () => {
    if (info.swapWith) {
      // Dropped on top of another capability: the two trade places outright.
      updateCapability(id, {
        domainId: swapped.domainId,
        lobeX: swapped.lobeX,
        lobeY: swapped.lobeY,
      });
      updateCapability(swapped.id, {
        domainId: was.domainId ?? undefined,
        clearDomain: was.domainId === null,
        lobeX: was.lobeX,
        lobeY: was.lobeY,
        x: was.x,
        y: was.y,
      });
    } else if (info.domainId) {
      updateCapability(id, { domainId: info.domainId, lobeX: info.lobeX, lobeY: info.lobeY });
    } else {
      updateCapability(id, { clearDomain: true, x: info.x, y: info.y });
    }
  });
}

/**
 * Connectors are drawn between whichever ends sit closest, so once shapes have
 * moved the stored points are stale. Write the new ones back, quietly — this
 * runs inside a render, so it changes the records without announcing it.
 *
 * It does not mark the map unsaved: this is the app agreeing with itself, not
 * an edit, and a page that opened as "unsaved" would cry wolf. The corrected
 * points are in memory either way, so they go out with the next save.
 */
function syncConnectors() {
  for (const connector of store.connectors) {
    const points = resolvedPoints(connector);
    if (!points) continue;
    Object.assign(connector, points);
  }
}

async function deleteSelection() {
  const { type, id } = store.selection;
  const record = find(type, id);
  if (!record) return;

  if (type === 'domain') {
    const children = childrenOf(id);
    const question = children.length
      ? `Delete "${record.title}" with its ${children.length} capabilit${children.length === 1 ? 'y' : 'ies'} and their connectors?`
      : `Delete "${record.title}"?`;
    if (!confirm(question)) return;
  }

  const removed = await run('Deleting', () => removerFor[type](id));
  // What a delete took comes back exactly as it was, ids included, so the lines
  // that hung off it are the same lines afterwards.
  if (removed) undoStack.record('Deleting', [{ op: 'restore', removed }]);
  select(null, null);
}

// --- restyling a domain all at once -------------------------------------------

/**
 * The same changes to every capability in a domain, and to the domain too when
 * given some, as one step: one status line, one undo.
 */
async function restyleDomain(label, domainId, { domain: domainChanges = null, capabilities: changes }) {
  const domain = find('domain', domainId);
  if (!domain) return;
  const children = childrenOf(domainId);
  if (!domainChanges && children.length === 0) {
    status('This domain has no capabilities yet.');
    return;
  }

  undoStack.record(label, [
    ...(domainChanges ? [undoUpdate('domain', domainId, valuesOf(domain, domainChanges))] : []),
    ...children.map((capability) => undoUpdate('capability', capability.id, valuesOf(capability, changes))),
  ]);
  await run(label, () => {
    if (domainChanges) updateDomain(domainId, domainChanges);
    for (const capability of children) updateCapability(capability.id, changes);
  });
}

/**
 * Reset shapes: the domain and every capability in it back to the look in
 * defaults.js — sizes, type and colours. Titles, icons and positions say what
 * the map is rather than how it is drawn, so they stay.
 */
const resetShapes = (domainId) =>
  restyleDomain('Resetting shapes', domainId, { domain: domainLook(), capabilities: capabilityLook() });

/** Reset colors: every capability in the domain in the domain's own colour. */
const resetCapabilityColors = (domainId) =>
  restyleDomain('Recoloring capabilities', domainId, {
    capabilities: { colorIndex: find('domain', domainId)?.colorIndex },
  });

// --- the kebab, and the edit session it opens --------------------------------

const KEBAB_MARK = 'edit-session';
const kebabMenu = document.getElementById('kebab-menu');

/** Open a domain's title for editing, from the kebab or from a double-click. */
function beginRename(domainId) {
  startRename(domainId);
  status('Enter saves, Shift-Enter or Ctrl-Enter breaks the line, Esc cancels');
}

function closeKebab() {
  kebabMenu.hidden = true;
  kebabMenu.replaceChildren();
}

function kebabButton(label, onClick) {
  const button = document.createElement('button');
  button.className = 'btn btn--chip';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * idle → Edit → editing → Save (keep) or Cancel (unwind to the marker).
 * While editing, the domain shows a "+" on every free seat around its core.
 */
function openKebab(domainId) {
  const anchor = kebabAnchor(domainId);
  if (!anchor) return;

  const rename = kebabButton('Rename', () => {
    closeKebab();
    beginRename(domainId);
  });

  const buttons = isEditing(domainId)
    ? [
      rename,
      kebabButton('Add lobe', async () => {
        closeKebab();
        await addCapability(domainId, { keepSelection: true });
        status('Lobe added — drag it where you want it');
      }),
      kebabButton('Save', async () => {
        undoStack.dropMark(KEBAB_MARK);
        setEditing(null);
        closeKebab();
        status('Saved');
      }),
      kebabButton('Cancel', async () => {
        closeKebab();
        setEditing(null);
        const undone = await undoStack.rewindTo(KEBAB_MARK);
        status(undone ? `Reverted ${undone} change${undone === 1 ? '' : 's'}` : 'Nothing to revert');
      }),
    ]
    : [
      rename,
      kebabButton('Edit', () => {
        undoStack.mark(KEBAB_MARK);
        setEditing({ domainId, activeLobe: 0 });
        closeKebab();
        status('Editing — pick a + to add a capability');
      }),
    ];

  kebabMenu.replaceChildren(...buttons);
  kebabMenu.hidden = false;
  const stage = document.getElementById('stage').getBoundingClientRect();
  kebabMenu.style.left = `${Math.round(anchor.x - stage.left)}px`;
  kebabMenu.style.top = `${Math.round(anchor.y - stage.top)}px`;
}

// --- permalinks --------------------------------------------------------------

/** `#/capability/payment-authorization` — the title, normalized, not the id. */
function parseHash() {
  const match = /^#\/(domain|capability|connector)\/([a-z0-9-]+)$/.exec(location.hash);
  return match ? { type: match[1], slug: match[2] } : null;
}

function hashFor(type, id) {
  const slug = slugFor(type, id);
  return type && slug ? `#/${type}/${slug}` : '';
}

// Captured before the first render: renderAll writes the hash, which would
// otherwise erase the very link we were asked to open.
const linkedSelection = parseHash();

function applySelection(target) {
  if (!target) return;
  const record = findBySlug(target.type, target.slug);
  if (!record) {
    status('That link points at something that is no longer on the map.', true);
    return;
  }
  syncingHash = true;
  select(target.type, record.id, 'hash');
  syncingHash = false;
  centerOn(target.type, record.id);
}

function writeHash() {
  if (syncingHash) return;
  const { type, id } = store.selection;
  const next = hashFor(type, id);
  if (location.hash !== next) history.replaceState(null, '', `${location.pathname}${location.search}${next}`);
}

// --- boot --------------------------------------------------------------------

let lastSelectionId = null;

const DELETE_LABELS = {
  domain: 'Delete domain',
  capability: 'Delete capability',
  connector: 'Delete connector',
};

const resetShapesButton = document.getElementById('reset-shapes');
const resetColorsButton = document.getElementById('reset-capability-colors');
const deleteButton = document.getElementById('delete-selected');
const detailsBarName = document.getElementById('details-bar-name');

/**
 * The actions under the details panel follow the selection. Delete names what
 * it would delete, so nothing goes by mistake; the two resets are there for a
 * domain. Edit palette is the one that stays with nothing selected: the palette
 * belongs to the map, not to anything on it.
 */
function showSelectionActions() {
  const { type } = store.selection;
  const record = type ? find(type, store.selection.id) : null;

  // On a phone the sheet's bar is all of this panel that shows while it is shut,
  // so it carries the name of what is selected — the same words the panel heads
  // its fields with, and the same sentence it shows when there is nothing.
  detailsBarName.textContent = record
    ? (('title' in record) ? oneLine(record.title) : connectorLabel(record))
    : 'Nothing selected';

  resetShapesButton.hidden = type !== 'domain';
  resetColorsButton.hidden = type !== 'domain';
  deleteButton.hidden = !record;
  if (!record) return;

  const caption = DELETE_LABELS[type] ?? 'Delete';
  document.getElementById('delete-label').textContent = caption;
  deleteButton.title = `${caption}: ${'title' in record ? record.title : 'the selected line'}`;
  deleteButton.setAttribute('aria-label', deleteButton.title);
}

function renderAll(reason) {
  if (store.selection.id !== lastSelectionId) {
    lastSelectionId = store.selection.id;
    closeKebab();
    // Moving a lobe selects the capability it belongs to, and that must not end
    // the session the move is part of. Only a selection outside the domain
    // being edited closes it.
    const owner = store.selection.type === 'capability'
      ? find('capability', store.selection.id)?.domainId
      : null;
    if (!isEditing(store.selection.id) && !(owner && isEditing(owner))) setEditing(null);
  }
  render();
  syncConnectors(); // render() resolved the positions this reads
  renderMenu();
  if (reason !== 'live') renderDetails();
  renderPalette();
  statsBar.textContent =
    `${store.domains.length} domains · ${store.capabilities.length} capabilities · ${store.connectors.length} connectors`;
  showSelectionActions();
  writeHash();
}

// --- the panels --------------------------------------------------------------

/** Which panels are folded away: a preference, so the browser keeps it, not the tab. */
const PANELS = 'domain-map:panels';

const panels = {
  menu: { button: document.getElementById('toggle-menu'), label: 'domains' },
  // On a phone this panel is a sheet at the foot of the screen, and its bar is a
  // second switch on the same state — see layout.css.
  details: {
    button: document.getElementById('toggle-details'),
    label: 'details',
    bar: document.getElementById('details-bar'),
  },
};

/**
 * The phone layout, as the stylesheet decides it: the breakpoint is written down
 * once, in layout.css, which hands the answer over in --phone.
 */
const onPhone = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--phone').trim() === '1';

/** aria-pressed drives the CSS: it also decides which way the chevron points. */
function showPanel(side, collapsed) {
  const { button, label, bar } = panels[side];
  main.dataset[side] = collapsed ? 'collapsed' : 'open';
  button.setAttribute('aria-pressed', String(!collapsed));
  button.title = `${collapsed ? 'Expand' : 'Collapse'} the ${label} panel`;
  bar?.setAttribute('aria-expanded', String(!collapsed));
}

function togglePanel(side) {
  showPanel(side, main.dataset[side] !== 'collapsed');
  try {
    localStorage.setItem(PANELS, JSON.stringify(
      Object.fromEntries(Object.keys(panels).map((name) => [name, main.dataset[name] === 'collapsed']))));
  } catch {
    /* the panel still folds; the next visit just opens with it out */
  }
  // Folded, the fields are display:none and a text area has no height to be
  // measured against; opening the panel is the first chance to size them.
  if (side === 'details' && main.dataset.details !== 'collapsed') fitAreas();
  render();
}

/** Fold the panels the way they were left, before the stage is first laid out. */
function restorePanels() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PANELS));
  } catch {
    /* nothing remembered: both open, as the markup has them */
  }
  for (const side of Object.keys(panels)) {
    if (saved?.[side] === true) showPanel(side, true);
  }
  // What is remembered is how the panels were left beside a map on a wide
  // screen, which says nothing about how much of a phone's screen the fields
  // should cover on arrival: a sheet arrives shut, whatever a desktop decided.
  if (onPhone()) showPanel('details', true);
}

// Undo steps are data; this is what carries them out, and what keeps a copy of
// the stack whenever it moves.
undoStack.init({ apply: applyUndo, onChange: keepSession });

initDetails({
  onPatch: patch,
  onLive: () => { render(); renderMenu(); },
  onStatus: status,
  onIcons: files.listIcons,
  onIconUpload: files.saveIcon,
  iconUrl: files.iconUrl,
});

initPalette({
  // The palette belongs to the map, not to the shape that happens to be
  // selected while it is being edited.
  onPalette: async (palette) => {
    const before = [...(store.palette ?? [])];
    undoStack.record('Recoloring', [{ op: 'palette', palette: before }]);
    await run('Recoloring', () => usePalette(palette));
  },
});

// It opens on the swatch the selected shape wears, which is most often the one
// about to be changed.
document.getElementById('edit-palette').addEventListener('click', () => {
  const record = find(store.selection.type, store.selection.id);
  openPalette(record?.colorIndex ? record.colorIndex - 1 : null);
});

initTextDialog('getting-around');
initTextDialog('about');
initTextDialog('profile');
initTextDialog('versions');

/**
 * The colours live in two places: the map, and the geometry that draws it. The
 * geometry goes first. The map announces the change, and everything redrawn on
 * hearing it reads the geometry's colours — set them second and every view
 * repaints in the old ones, so the colour just picked looks as if it was lost.
 */
function usePalette(palette) {
  setPalette(palette);
  updateMap({ palette });
}

initDiagram({
  iconUrl: files.iconUrl,
  moveDomain: (id, x, y) => patch('domain', id, { x, y }, 'Moving'),
  dropCapability,
  moveTitle: (id, titleX, titleY) => patch('domain', id, { titleX, titleY }, 'Moving the title'),
  beginRename,
  renameDomain: (id, title) => patch('domain', id, { title }, 'Renaming'),
  setTitleWidth: (id, titleWidth) => patch('domain', id, { titleWidth }, 'Resizing the title'),
  // Moved by hand, so the line keeps the point it was put on.
  // An end carries its capability with it when it is dropped on another shape;
  // a null id leaves it on the one it was already on.
  moveConnectorEnd: (id, end, index, capabilityId) => patch(
    'connector',
    id,
    end === 'from'
      ? { fromPoint: index, fromCapabilityId: capabilityId ?? undefined, anchored: true }
      : { toPoint: index, toCapabilityId: capabilityId ?? undefined, anchored: true },
    'Moving the line end'),
  // Shaped by hand, so the line keeps the bends it was given.
  shapeConnector: (id, bendPoints) => patch(
    'connector', id, { bendPoints, anchored: true }, 'Bending the line'),
  openKebab,
  createConnector: async (fromId, fromPoint, toId, toPoint) => {
    // A line inside one domain is short and reads better straight; one that
    // crosses a boundary has ground to cover, so it bows out of the way.
    const from = find('capability', fromId);
    const to = find('capability', toId);
    const internal = from?.domainId && from.domainId === to?.domainId;

    const created = await run('Connecting', () => addConnector({
      fromCapabilityId: fromId,
      fromPoint,
      toCapabilityId: toId,
      toPoint,
      lineStyle: internal ? 'straight' : 'curved',
    }));
    if (created) undoStack.record('Connecting', [undoDelete('connector', created.id)]);
  },
});

subscribe(renderAll);
subscribe((reason) => { if (reason === 'data') markDirty(); });

// Nothing is written until Save is pressed. A refresh keeps the changes (see
// keepSession) but closing the tab does not, and the page cannot tell which of
// the two is coming — so it asks either way. Leaving to sign in again is a
// navigation within the tab, which keeps the changes too, so that does not ask.
window.addEventListener('beforeunload', (event) => {
  if (dirty && !signingIn) event.preventDefault();
});

document.getElementById('add-domain').addEventListener('click', addDomain);
document.getElementById('collapse-all').addEventListener('click', () => collapseAll());
document.getElementById('add-capability').addEventListener('click', addCapabilityHere);
document.getElementById('delete-selected').addEventListener('click', deleteSelection);
resetShapesButton.addEventListener('click', () => {
  if (store.selection.type === 'domain') resetShapes(store.selection.id);
});
resetColorsButton.addEventListener('click', () => {
  if (store.selection.type === 'domain') resetCapabilityColors(store.selection.id);
});
document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.2));
document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
document.getElementById('zoom-fit').addEventListener('click', fitToScreen);
saveButton.addEventListener('click', () => save());
editModeButton.addEventListener('click', () => {
  if (isOwner()) setEditMode(true);
});
cancelButton.addEventListener('click', cancelEdit);

// initTextDialog opens it; this fills it, afresh each time.
versionsButton.addEventListener('click', () => {
  versionsRows.replaceChildren();
  note('Reading the versions…');
  refreshVersions();
});
saveAsNewButton.addEventListener('click', () => act(saveAsNew));

panels.menu.button.addEventListener('click', () => togglePanel('menu'));
panels.details.button.addEventListener('click', () => togglePanel('details'));
panels.details.bar.addEventListener('click', () => togglePanel('details'));

// --- import / export ---------------------------------------------------------

/** Hand a file to the browser as a download. */
function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * `<title>-<shortdate>-v<n>.<extension>`, so every export lands in the same
 * Downloads folder under its own name instead of the browser silently appending
 * "(1)", "(2)"… to a repeated one. The version counts exports of either kind
 * made on the same day and is kept in localStorage, since there is nowhere else
 * to keep it.
 */
function exportFileName(title, extension = 'json') {
  const shortDate = new Date().toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
  const key = `domain-map:export:${shortDate}`;
  const version = Number(localStorage.getItem(key) ?? '0') + 1;
  try {
    localStorage.setItem(key, String(version));
  } catch {
    /* the export still goes out; the count just may repeat from v1 */
  }
  return `${slugify(title)}-${shortDate}-v${version}.${extension}`;
}

document.getElementById('export-map').addEventListener('click', () => {
  try {
    status('Exporting…');
    download(exportFileName(store.title), stringify(toDocument(store)));
    status('Exported');
  } catch (error) {
    status(`Could not export: ${error.message}`, true);
  }
});

// The map as it is drawn, not as it is stored: a picture to put in a document.
document.getElementById('export-svg').addEventListener('click', async () => {
  try {
    status('Exporting…');
    const svg = await diagramSvg(document.getElementById('diagram'), { title: store.title });
    download(exportFileName(store.title, 'svg'), svg, 'image/svg+xml');
    status('Exported SVG');
  } catch (error) {
    status(`Could not export: ${error.message}`, true);
  }
});

const importFile = document.getElementById('import-file');
document.getElementById('import-map').addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const [file] = importFile.files ?? [];
  importFile.value = ''; // so picking the same file twice still fires
  if (!file) return;
  if (!confirm(`Replace everything on this map with "${file.name}"?`)) return;

  status('Importing…');
  let document_;
  try {
    document_ = JSON.parse(await file.text());
  } catch (error) {
    status(`Could not import: that file is not valid JSON (${error.message}).`, true);
    return;
  }

  // Nothing is applied until the whole file has passed, so a bad one leaves the
  // map exactly as it was.
  const error = validate(document_);
  if (error) {
    status(`Could not import: ${error}`, true);
    return;
  }

  undoStack.clear(); // its inverse operations name records that are gone
  applyMap(fromDocument(document_));
  select(null, null);
  fitToScreen();
  markDirty(); // an import is a change like any other: it lands when you save
  status('Imported — press Save to keep it');
});

window.addEventListener('keydown', async (event) => {
  const typing = event.target instanceof HTMLInputElement
    || event.target instanceof HTMLSelectElement
    || event.target instanceof HTMLTextAreaElement;

  // Ctrl-Z works even mid-sentence: the browser's own undo covers the caret,
  // ours covers the map, and only one of them owns a focused field.
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !typing) {
    event.preventDefault();
    if (!editMode) return status(isOwner() ? 'Press Edit to make changes' : 'This map is read-only', true);
    if (!undoStack.canUndo()) return status('Nothing to undo');
    status('Undoing…');
    const label = await undoStack.undo();
    status(label ? `Undid: ${label.toLowerCase()}` : 'Nothing to undo');
    return;
  }

  // Behind the palette editor, Getting around or About the map takes no keys
  // but undo: Esc belongs to the dialog, and Delete must not reach a selection
  // that cannot be seen.
  if (paletteOpen() || textDialogOpen()) return;

  if (event.key === 'Escape') {
    closeKebab();
    if (!cancelRename() && !cancelDraft()) select(null, null);
    return;
  }
  if (typing) return;
  if (!editMode) return; // browsing only: no keyboard edits outside Edit mode
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault();
    deleteSelection();
    return;
  }

  const { type, id } = store.selection;
  const record = type ? find(type, id) : null;

  // Cmd/Ctrl-B, the way it works everywhere else.
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    if (type !== 'domain' && type !== 'capability') return status('Pick a shape first.', true);
    const fallback = type === 'capability' ? DEFAULT_CAPABILITY_FONT_WEIGHT : DEFAULT_FONT_WEIGHT;
    const bold = (record.fontWeight ?? fallback) === 'bold';
    patch(type, id, { fontWeight: bold ? 'regular' : 'bold' }, bold ? 'Unbolding' : 'Bolding');
    return;
  }

  // Ctrl with plus or minus steps a capability through its own type scale.
  if ((event.metaKey || event.ctrlKey) && ['+', '=', '-', '_'].includes(event.key)) {
    event.preventDefault();
    if (type !== 'capability') return status('Pick a capability first.', true);
    stepFontSize(record, event.key === '-' || event.key === '_' ? -1 : 1);
    return;
  }

  // Shift with plus or minus does the same for the oval the type sits in. On
  // most layouts those keys *are* Shift-equals and Shift-minus, so '+' and '_'
  // are what actually arrive; the other two cover the layouts where they do not.
  if (event.shiftKey && !event.altKey && ['+', '=', '-', '_'].includes(event.key)) {
    event.preventDefault();
    if (type !== 'capability') return status('Pick a capability first.', true);
    stepSizeScale(record, event.key === '-' || event.key === '_' ? -1 : 1);
    return;
  }

  // Ctrl with < or > narrows or widens the oval, in five steps from standing
  // tall through round to lying wide. A layout with a key of its own for the
  // two sends them as they are; where they sit over comma and full stop, the
  // physical keys count too, with or without Shift, so a layout that prints
  // other letters there still reaches the shortcut.
  const lean = { '<': -1, '>': 1 }[event.key] ?? { Comma: -1, Period: 1 }[event.code];
  if ((event.metaKey || event.ctrlKey) && lean) {
    event.preventDefault();
    if (type !== 'capability') return status('Pick a capability first.', true);
    stepStretch(record, lean);
    return;
  }

  // Square brackets move a capability through the stack, the way a drawing
  // program does it: plain for the ends, with Cmd or Ctrl for one step. Matched
  // on the physical key first, so a layout that prints something else on those
  // two keys — or puts the brackets behind AltGr, as Windows layouts often do —
  // still reaches the shortcut; `key` covers whatever reports no `code`.
  const bracket = event.code === 'BracketLeft' || event.code === 'BracketRight'
    ? event.code
    : { '[': 'BracketLeft', ']': 'BracketRight' }[event.key];
  // AltGr arrives as Ctrl+Alt, which is a bracket being typed, not a modifier.
  if (bracket && !event.altKey) {
    event.preventDefault();
    if (type !== 'capability') return status('Pick a capability first.', true);
    restack(record, bracket === 'BracketRight', event.metaKey || event.ctrlKey);
  }
});

/** One step along the capability type scale, stopping at either end. */
function stepFontSize(capability, direction) {
  const sizes = CAPABILITY_FONT_SIZES;
  const now = sizes.indexOf(capability.fontSize ?? DEFAULT_FONT_SIZE);
  const next = sizes[Math.min(sizes.length - 1, Math.max(0, (now < 0 ? 1 : now) + direction))];
  if (next === capability.fontSize) return status(direction > 0 ? 'Largest already' : 'Smallest already');
  patch('capability', capability.id, { fontSize: next }, 'Resizing the type');
}

/** One step along the shape scale — the oval itself, not the type in it. */
function stepSizeScale(capability, direction) {
  const now = SIZE_SCALES.indexOf(capability.sizeScale ?? 1);
  const next = SIZE_SCALES[Math.min(SIZE_SCALES.length - 1, Math.max(0, (now < 0 ? 0 : now) + direction))];
  if (next === capability.sizeScale) return status(direction > 0 ? 'Largest already' : 'Smallest already');
  patch('capability', capability.id, { sizeScale: next }, 'Resizing the shape');
}

/** One step between tall and wide — which way the oval leans, not how big it is. */
function stepStretch(capability, direction) {
  const at = OVAL_STRETCHES.indexOf(capability.stretch ?? DEFAULT_STRETCH);
  const now = at < 0 ? OVAL_STRETCHES.indexOf(DEFAULT_STRETCH) : at;
  const next = Math.min(OVAL_STRETCHES.length - 1, Math.max(0, now + direction));
  if (next === now) return status(direction > 0 ? 'Widest already' : 'Tallest already');
  patch('capability', capability.id, { stretch: OVAL_STRETCHES[next] },
    direction > 0 ? 'Widening the shape' : 'Narrowing the shape');
}

/**
 * Where a capability sits in the stack, among the others in its domain. Order
 * is what the map is drawn in, so moving one is a matter of renumbering the
 * whole domain and writing back only what actually changed.
 */
function restack(capability, forward, oneStep) {
  const siblings = store.capabilities
    .filter((c) => c.domainId === capability.domainId)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
  if (siblings.length < 2) return status('Nothing to stack it against.');

  const from = siblings.findIndex((c) => c.id === capability.id);
  const to = oneStep
    ? Math.min(siblings.length - 1, Math.max(0, from + (forward ? 1 : -1)))
    : (forward ? siblings.length - 1 : 0);
  if (to === from) return status(forward ? 'Already at the front' : 'Already at the back');

  const order = [...siblings];
  order.splice(to, 0, ...order.splice(from, 1));

  const moved = order
    .map((c, index) => ({ c, index }))
    .filter(({ c, index }) => (c.sortIndex ?? 0) !== index);

  const label = oneStep
    ? (forward ? 'Bringing forward' : 'Sending backward')
    : (forward ? 'Bringing to front' : 'Sending to back');

  undoStack.record(label, moved.map(({ c }) => undoUpdate('capability', c.id, { sortIndex: c.sortIndex ?? 0 })));

  run(label, () => {
    for (const { c, index } of moved) updateCapability(c.id, { sortIndex: index });
  });
}

window.addEventListener('hashchange', () => applySelection(parseHash()));

loadIcons().catch((error) => console.error('Could not load an icon', error));

restorePanels();
applyEditMode();

// Who is looking decides which map loads, and which controls there are.
Promise.all([applySettings(), whoAmI()])
  .then(async ([, me]) => {
    role = me.role;
    showIdentity(me, (message) => status(message, true));
    applyEditMode();
    await loadMap();
    fitToScreen();
    applySelection(linkedSelection);
  })
  .catch((error) => status(`Could not load the map: ${error.message}`, true));
