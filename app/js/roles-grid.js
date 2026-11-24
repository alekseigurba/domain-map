// Roles, as a grid: who leads every area, domain and capability, one
// discipline at a time. The map shows the same people as cards on the shapes
// they own, which reads well for a part of the map and badly for all of it;
// this is the whole of it at once — a row a shape, in the order the map holds
// them, and a column a role — so a gap is seen as an empty cell rather than
// as a card that is not there.
//
// It holds nothing of its own. A cell is the people of that role who own that
// shape, read from the store as it stands, and what is typed into it is the
// same change the details panel makes — through main.js, with the same undo —
// so the cards on the map and the grid are never two answers.

import { store, find, oneLine, typesFor, rolesOn, slideDeck, pathOf, listOf } from './store.js';
import { ROLE_KINDS } from './rules.js';
import { fillNames, offerAsTyped } from './name-lookup.js';

const el = (id) => document.getElementById(id);

let handlers = {};
let editMode = false;
/** Which discipline is on show: one of ROLE_KINDS. */
let showing = ROLE_KINDS[0];
let finding = '';
/** The names on the people list: whoever has signed in to the map, offered before anything is typed. */
let people = [];

/** What each discipline is called on its tab and in a sentence. */
const DISCIPLINE = {
  productRole: { tab: 'Product', says: 'product' },
  engineeringRole: { tab: 'Engineering', says: 'engineering' },
};

/** What stands over the people nobody has given a role yet. */
const NO_ROLE = 'No role yet';

export const rolesGridOpen = () => el('roles-dialog')?.open ?? false;

/**
 * The columns: the roles the map's owner has typed in for this discipline, in
 * their order, then any role someone holds that is no longer on the list, and
 * last — only while somebody is in it — the people with no role, so that
 * nobody named on the map is left out of the grid.
 */
function columns() {
  const people = listOf(showing);
  const roles = [...typesFor(showing)];
  for (const role of people) if (role.type && !roles.includes(role.type)) roles.push(role.type);
  if (people.some((role) => !role.type)) roles.push('');
  return roles;
}

/**
 * The rows: every area, domain and capability, in the order the slideshow
 * reads them — an area, its domains, their capabilities, then what is in no
 * area — each with how deep it sits, which indents it. Narrowed by what is
 * typed into Find, a row that matches keeps the rows it sits in, so a
 * capability found is still read under its domain.
 */
function rows() {
  const all = slideDeck().map(({ kind, id }) => {
    const record = find(kind, id);
    return record ? { kind, record, path: pathOf(kind, record) } : null;
  }).filter(Boolean);
  const wanted = finding.trim().toLowerCase();
  if (!wanted) return all;
  const kept = new Set();
  for (const row of all) {
    if (!oneLine(row.record.title).toLowerCase().includes(wanted)) continue;
    for (const step of row.path) kept.add(`${step.kind}:${step.record.id}`);
  }
  return all.filter((row) => kept.has(`${row.kind}:${row.record.id}`));
}

const cellKey = (kind, id, role) => `${kind}:${id}:${role}`;

/** A person in a cell: their name, and in Edit mode the × that takes this shape from them. */
function personChip(role, row) {
  const chip = document.createElement('span');
  chip.className = 'roster__member';
  chip.textContent = oneLine(role.title);
  if (role.description) chip.title = oneLine(role.description);
  if (!editMode) return chip;
  const out = document.createElement('button');
  out.type = 'button';
  out.className = 'roster__out';
  out.textContent = '×';
  out.title = `Take ${oneLine(row.record.title)} from ${oneLine(role.title)}`;
  out.setAttribute('aria-label', out.title);
  out.addEventListener('click', () => handlers.onRemove?.(showing, role.id, row.kind, row.record.id));
  chip.append(out);
  return chip;
}

/**
 * The box a name is typed into, in Edit mode. It has the names the map
 * already holds and the people list behind it, and anyone in the
 * organisation's directory who matches what is typed; it takes anyone: Enter, or a
 * name picked from the list, puts them in the cell. Someone already on the map
 * in that role is given the shape as well; anyone else is named on the map,
 * in that role.
 */
function nameBox(row, roleName) {
  const input = document.createElement('input');
  input.className = 'field__input roles-grid__add';
  input.maxLength = 200;
  input.setAttribute('list', 'roles-names');
  offerAsTyped(input, 'roles-names', knownNames);
  input.placeholder = 'Add…';
  input.dataset.cell = cellKey(row.kind, row.record.id, roleName);
  input.setAttribute('aria-label',
    `Name ${roleName ? `the ${roleName}` : 'someone with no role'} for ${oneLine(row.record.title)}`);
  const give = () => {
    const name = input.value.trim();
    if (!name) return;
    input.value = '';
    handlers.onName?.(showing, row.kind, row.record.id, name, roleName);
  };
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      give();
    }
  });
  // A name picked from the list arrives as one change, with no Enter after it.
  input.addEventListener('input', (event) => {
    if (event.inputType === 'insertReplacementText' || event.inputType === undefined) give();
  });
  return input;
}

function cell(row, roleName) {
  const td = document.createElement('td');
  td.className = 'roster__in';
  const here = rolesOn(showing, row.kind, row.record.id).filter((role) => (role.type || '') === roleName);
  const box = document.createElement('div');
  box.className = 'roster__members';
  box.append(...here.map((role) => personChip(role, row)));
  if (editMode) box.append(nameBox(row, roleName));
  td.append(box);
  return td;
}

function shapeCell(row) {
  const th = document.createElement('th');
  th.scope = 'row';
  th.className = `roles-grid__shape roles-grid__shape--${row.kind}`;
  th.style.setProperty('--depth', String(row.path.length - 1));
  const name = document.createElement('span');
  name.className = 'roles-grid__name';
  name.textContent = oneLine(row.record.title);
  const kind = document.createElement('span');
  kind.className = 'roles-grid__kind';
  kind.textContent = row.kind;
  th.append(name, kind);
  return th;
}

/** The head: the shapes' column, a column a role, and in Edit mode a box to type a new role into. */
function head(roles) {
  const tr = document.createElement('tr');
  const first = document.createElement('th');
  first.scope = 'col';
  first.textContent = 'Area, domain or capability';
  tr.append(first);
  for (const roleName of roles) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = roleName || NO_ROLE;
    tr.append(th);
  }
  if (editMode) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.className = 'roles-grid__new';
    const input = document.createElement('input');
    input.className = 'field__input roles-grid__add';
    input.maxLength = 80;
    input.placeholder = 'Add a role…';
    input.dataset.cell = 'new-role';
    input.setAttribute('aria-label', `Add a ${DISCIPLINE[showing].says} role, as a column`);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const wanted = input.value.trim();
      if (wanted) handlers.onAddRole?.(showing, wanted);
      input.value = '';
    });
    th.append(input);
    tr.append(th);
  }
  return tr;
}

/**
 * Every name worth offering before anything is typed: the people of both
 * disciplines already on the map, with the role they hold, then the people
 * list. The directory's matches are added as a name is typed.
 */
function knownNames() {
  const onMap = ROLE_KINDS.flatMap((kind) => listOf(kind).map((role) => ({ name: oneLine(role.title), label: role.type })));
  return [...onMap, ...people];
}

/** Fill the grid from the map as it stands. Nothing is drawn while it is shut. */
export function renderRolesGrid() {
  if (!rolesGridOpen()) return;

  for (const tab of el('roles-tabs').querySelectorAll('[data-kind]')) {
    const on = tab.dataset.kind === showing;
    tab.setAttribute('aria-pressed', String(on));
    tab.setAttribute('aria-selected', String(on));
  }
  const mayEdit = handlers.mayEdit?.() ?? false;
  el('roles-edit').hidden = !mayEdit || editMode;
  const note = el('roles-note');
  note.textContent = editMode
    ? 'Type a name into a cell and press Enter. Someone already on the map in that role is given the shape too; anyone else is added to the map.'
    : mayEdit ? 'Press Edit to change who leads what.' : '';
  note.hidden = !note.textContent;

  // A cell rebuilt while it had the focus would leave the focus nowhere and
  // throw away what was half typed, so both are carried over to its new box.
  const active = document.activeElement?.closest?.('#roles-grid') ? document.activeElement : null;
  const keep = active?.dataset.cell ? { cell: active.dataset.cell, value: active.value } : null;

  fillNames('roles-names', knownNames());
  const roles = columns();
  const shown = rows();
  const table = el('roles-grid');
  const thead = document.createElement('thead');
  thead.append(head(roles));
  const tbody = document.createElement('tbody');
  for (const row of shown) {
    const tr = document.createElement('tr');
    tr.dataset.kind = row.kind;
    tr.append(shapeCell(row), ...roles.map((roleName) => cell(row, roleName)));
    if (editMode) tr.append(document.createElement('td'));
    tbody.append(tr);
  }
  if (shown.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'versions__empty';
    td.colSpan = roles.length + (editMode ? 2 : 1);
    td.textContent = finding.trim() ? 'Nothing on the map is called that.' : 'The map has no areas, domains or capabilities yet.';
    tr.append(td);
    tbody.append(tr);
  }
  table.replaceChildren(thead, tbody);

  if (keep) {
    const again = [...table.querySelectorAll('[data-cell]')].find((one) => one.dataset.cell === keep.cell);
    if (again) {
      again.value = keep.value;
      again.focus();
    }
  }
}

export async function openRolesGrid() {
  const dialog = el('roles-dialog');
  if (!dialog.open) dialog.showModal();
  renderRolesGrid();
  // The people list is read once for the page, and may not have been yet.
  people = await handlers.people?.().catch(() => []) ?? [];
  renderRolesGrid();
}

/** The page has gone into Edit mode or out of it: the cells are boxes to type into, or names to read. */
export function setRolesGridEditMode(next) {
  editMode = next;
  renderRolesGrid();
}

/**
 * Wire the grid. `mayEdit` says whether whoever is looking may edit the map
 * at all; `onEdit` asks the page to go into Edit mode; `people` reads the
 * people list; `onName`, `onRemove` and `onAddRole` are changes to the map,
 * made as every other is.
 */
export function initRolesGrid(callbacks) {
  handlers = callbacks;
  el('roles-toggle').addEventListener('click', openRolesGrid);
  el('roles-close').addEventListener('click', () => el('roles-dialog').close());
  el('roles-edit').addEventListener('click', () => handlers.onEdit?.());
  el('roles-tabs').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-kind]');
    if (!tab || tab.dataset.kind === showing) return;
    showing = tab.dataset.kind;
    renderRolesGrid();
  });
  el('roles-find').addEventListener('input', (event) => {
    finding = event.target.value;
    renderRolesGrid();
  });
}
