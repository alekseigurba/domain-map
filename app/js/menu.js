// The hierarchy sidebar. Mirrors the diagram exactly — same items, same
// selection. A line hangs under the element it starts from, so the tree holds
// nothing but the shapes a map is drawn from and the lines that leave them.

import {
  store, select, childrenOf, orphans, find, connectorLabel, connectorTarget,
  stackedList, ownedBy, oneLine,
} from './store.js';
import { COLORS } from './geometry.js';

const tree = document.getElementById('tree');

/**
 * Sections standing open in the menu. Everything starts shut: the map is the
 * view, and the menu follows what is picked on it rather than laying the whole
 * hierarchy out at once. View state only — never sent to the server.
 */
const opened = new Set();

/** The selection the menu has already opened up for; see revealSelection. */
let openedFor = null;

const colorOf = (index) => COLORS[(index || 1) - 1] ?? COLORS[0];

function item(type, record, { depth = 0, text: caption, color, lead, hint, line }) {
  const button = document.createElement('button');
  button.className = `tree__item${depth ? ` tree__item--depth-${depth}` : ''}`
    + `${line ? ' tree__item--line' : ''}`;
  button.dataset.type = type;
  button.dataset.id = record.id;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-selected', String(store.selection.type === type && store.selection.id === record.id));
  // The row may say less than the thing is called — a line names only where it
  // goes. The full name is on the pointer, and on the row for a screen reader,
  // so nothing is only available by eye.
  if (hint) {
    button.title = hint;
    button.setAttribute('aria-label', hint);
  }

  const swatch = document.createElement('span');
  swatch.className = `tree__swatch tree__swatch--${type}`;
  // A line's swatch is drawn as a rule rather than a block, and an area's as
  // the border it is on the map, so for those the colour is the edge and not
  // the fill.
  const worn = { connector: 'borderTopColor', area: 'borderColor' }[type] ?? 'background';
  if (color) swatch.style[worn] = color;
  button.appendChild(swatch);

  // "to", in the quieter ink: a label on the value beside it, not part of it.
  if (lead) {
    const word = document.createElement('span');
    word.className = 'tree__lead';
    word.textContent = lead;
    button.appendChild(word);
  }

  const text = document.createElement('span');
  text.className = 'tree__label';
  text.textContent = caption;
  button.appendChild(text);

  button.addEventListener('click', () => select(type, record.id, 'menu'));
  return button;
}

/** A row with a caret column, so folding rows and plain ones line up. */
function row(node, toggle = null, depth = 0) {
  const wrapper = document.createElement('div');
  wrapper.className = `tree__row${depth ? ` tree__row--depth-${depth}` : ''}`;

  const caret = document.createElement('button');
  caret.className = 'tree__toggle';
  caret.textContent = '▾';
  if (toggle) {
    caret.setAttribute('aria-expanded', String(toggle.expanded));
    caret.title = toggle.expanded ? 'Collapse' : 'Expand';
    caret.addEventListener('click', toggle.onClick);
  } else {
    caret.disabled = true;
  }

  wrapper.append(caret, node);
  return wrapper;
}

const toggleFor = (key) => ({
  expanded: opened.has(key),
  onClick: () => {
    if (opened.has(key)) opened.delete(key);
    else opened.add(key);
    renderMenu();
  },
});

/** A folding heading for the sections that are not a single shape. */
function caption(key, text) {
  const heading = document.createElement('span');
  heading.className = 'tree__caption';
  heading.textContent = text;
  return row(heading, toggleFor(key));
}

/** Fold everything at once — a long map is easier to read from the top. */
export function collapseAll() {
  opened.clear();
  renderMenu();
}

/**
 * Picking something opens the part of the menu that holds it, so the menu and
 * the map always agree on what is being looked at.
 *
 * Only as the selection lands, though — not on every render. Opening it again
 * each time would nail the section holding the selection permanently open, and
 * its own caret would stop working.
 */
function revealSelection() {
  const { type, id } = store.selection;
  const landed = `${type ?? ''}:${id ?? ''}`;
  if (landed === openedFor) return;
  openedFor = landed;
  if (!id) return;

  if (type === 'capability') {
    const record = find('capability', id);
    if (record) opened.add(record.domainId ?? 'unassigned');
    return;
  }
  if (type === 'touchpoint' || type === 'actor' || type === 'area') {
    opened.add(`${type}s`);
    return;
  }
  if (type === 'domain') {
    opened.add(id);
    return;
  }
  if (type === 'connector') {
    const record = find('connector', id);
    if (!record) return;

    // A line hangs under the element it starts from, so opening up to it means
    // opening that element — and whatever holds the element in turn.
    if (record.fromKind === 'capability') {
      opened.add(find('capability', record.fromId)?.domainId ?? 'unassigned');
    } else {
      opened.add(`${record.fromKind}s`);
    }
    opened.add(record.fromId);
  }
}

/**
 * An element's row, and directly beneath it the lines that leave it. One rule
 * for every kind: a line belongs to the end it starts from, so a domain
 * connector hangs under the capability it leaves and an interaction under the
 * actor. There is no heading in between and nothing lists a line twice.
 */
function branch(kind, record, depth = 0) {
  const own = ownedBy(kind, record.id);
  const rows = [row(
    item(kind, record, { depth, text: record.title, color: colorOf(record.colorIndex) }),
    own.length === 0 ? null : toggleFor(record.id),
    depth,
  )];

  if (own.length === 0 || !opened.has(record.id)) return rows;
  for (const connector of own) {
    // Where the line comes from is the row above it, so the row says only where
    // it goes. Not a direction on the line — a line has none — but a direction
    // read from where the eye already is.
    const target = connectorTarget(connector);
    rows.push(row(item('connector', connector, {
      depth: depth + 1,
      text: oneLine(target?.title ?? 'unknown'),
      color: target ? colorOf(target.colorIndex) : null,
      lead: 'to',
      hint: oneLine(connectorLabel(connector)),
      line: true,
    }), null, depth + 1));
  }
  return rows;
}

export function renderMenu() {
  revealSelection();
  const nodes = [];

  for (const domain of store.domains) {
    const children = childrenOf(domain.id);

    const group = document.createElement('div');
    group.className = 'tree__group';
    group.appendChild(row(
      item('domain', domain, { text: domain.title, color: colorOf(domain.colorIndex) }),
      children.length === 0 ? null : toggleFor(domain.id),
    ));

    if (opened.has(domain.id)) {
      for (const capability of children) group.append(...branch('capability', capability, 1));
    }
    nodes.push(group);
  }

  const loose = orphans();
  if (loose.length > 0) {
    nodes.push(caption('unassigned', 'Unassigned Capabilities'));
    if (opened.has('unassigned')) {
      const group = document.createElement('div');
      group.className = 'tree__group';
      for (const capability of loose) group.append(...branch('capability', capability));
      nodes.push(group);
    }
  }

  // Touchpoints and actors belong to no domain, so each kind is one flat list
  // of its own. The layer each one is on is what its row says instead. Areas
  // come last and flat as well: every shape keeps the one row it has above, and
  // what an area holds is read in its details rather than listed here twice.
  for (const [kind, heading] of [
    ['touchpoint', 'Touchpoints'], ['actor', 'Actors'], ['area', 'Product Areas'],
  ]) {
    const list = kind === 'area' ? store.areas : stackedList(kind);
    if (list.length === 0) continue;

    nodes.push(caption(`${kind}s`, heading));
    if (!opened.has(`${kind}s`)) continue;

    const group = document.createElement('div');
    group.className = 'tree__group';
    for (const record of list) group.append(...branch(kind, record));
    nodes.push(group);
  }

  tree.replaceChildren(...nodes);

  const selectedNode = tree.querySelector('[aria-selected="true"]');
  selectedNode?.scrollIntoView({ block: 'nearest' });
}
