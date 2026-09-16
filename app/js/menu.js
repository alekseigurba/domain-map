// The hierarchy sidebar. Mirrors the diagram exactly — same items, same
// selection. Lines that stay inside a domain are listed under it; only the ones
// that cross a boundary get a section of their own.

import {
  store, select, childrenOf, orphans, find, internalConnectors, publicConnectors, connectorLabel,
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

function item(type, record, { depth = 0, text: caption, color }) {
  const button = document.createElement('button');
  button.className = `tree__item${depth ? ` tree__item--depth-${depth}` : ''}`;
  button.dataset.type = type;
  button.dataset.id = record.id;
  button.setAttribute('role', 'option');
  button.setAttribute('aria-selected', String(store.selection.type === type && store.selection.id === record.id));

  const swatch = document.createElement('span');
  swatch.className = `tree__swatch tree__swatch--${type}`;
  if (color) swatch.style.background = color;
  button.appendChild(swatch);

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
function caption(key, text, depth = 0) {
  const heading = document.createElement('span');
  heading.className = 'tree__caption';
  heading.textContent = text;
  return row(heading, toggleFor(key), depth);
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
  if (type === 'domain') {
    opened.add(id);
    return;
  }
  if (type === 'connector') {
    const record = find('connector', id);
    const from = record && find('capability', record.fromCapabilityId);
    const to = record && find('capability', record.toCapabilityId);
    if (from && to && from.domainId && from.domainId === to.domainId) {
      opened.add(from.domainId);
      opened.add(`${from.domainId}:internal`);
    } else {
      opened.add('connectors');
    }
  }
}

export function renderMenu() {
  revealSelection();
  const nodes = [];

  for (const domain of store.domains) {
    const children = childrenOf(domain.id);
    const internal = internalConnectors(domain.id);
    const expanded = opened.has(domain.id);

    const group = document.createElement('div');
    group.className = 'tree__group';
    group.appendChild(row(
      item('domain', domain, { text: domain.title, color: colorOf(domain.colorIndex) }),
      children.length === 0 && internal.length === 0 ? null : toggleFor(domain.id),
    ));

    if (expanded) {
      for (const capability of children) {
        group.appendChild(row(item('capability', capability, {
          depth: 1,
          text: capability.title,
          color: colorOf(capability.colorIndex),
        }), null, 1));
      }

      // Plumbing that never leaves this domain belongs to this domain.
      if (internal.length > 0) {
        const key = `${domain.id}:internal`;
        group.appendChild(caption(key, 'Domain Connectors', 1));
        if (opened.has(key)) {
          for (const connector of internal) {
            group.appendChild(row(item('connector', connector, { depth: 2, text: connectorLabel(connector) }), null, 2));
          }
        }
      }
    }
    nodes.push(group);
  }

  const loose = orphans();
  if (loose.length > 0) {
    nodes.push(caption('unassigned', 'Unassigned Capabilities'));
    if (opened.has('unassigned')) {
      const group = document.createElement('div');
      group.className = 'tree__group';
      for (const capability of loose) {
        group.appendChild(row(item('capability', capability, {
          text: capability.title,
          color: colorOf(capability.colorIndex),
        })));
      }
      nodes.push(group);
    }
  }

  const crossing = publicConnectors();
  if (crossing.length > 0) {
    nodes.push(caption('connectors', 'Connectors'));
    if (opened.has('connectors')) {
      const group = document.createElement('div');
      group.className = 'tree__group';
      for (const connector of crossing) {
        group.appendChild(row(item('connector', connector, { text: connectorLabel(connector) })));
      }
      nodes.push(group);
    }
  }

  tree.replaceChildren(...nodes);

  const selectedNode = tree.querySelector('[aria-selected="true"]');
  selectedNode?.scrollIntoView({ block: 'nearest' });
}
