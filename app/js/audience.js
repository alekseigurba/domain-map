// Who a shared version is shared with: everyone who works on the map, or the
// people and the groups picked here. One dialog for both times it is asked —
// when a version is shared from a sandbox, and when a shared one's audience is
// changed — so that sharing with a few is the same gesture as sharing at all,
// not a setting found afterwards.
//
// It answers with what the server takes: `{ everyone: true }`, or
// `{ people, groups }` as ids. Shut without choosing, it answers null and
// nothing is shared or changed. The frame is in index.html.

import { listGroups, listPeople } from './people.js';

const el = (id) => document.getElementById(id);
const dialog = el('audience-dialog');

/** Whoever is asking: resolved once, when the dialog shuts. */
let settle = null;
/** What is picked, kept apart from the rows: the look-up hides rows, and a row hidden is still picked. */
const picked = { people: new Set(), groups: new Set() };
let everyone = true;
let people = [];
let groups = [];

const counted = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** What is picked, in words, and who sees the version whatever is picked. */
function summary() {
  const parts = [
    ...(picked.groups.size ? [counted(picked.groups.size, 'group', 'groups')] : []),
    ...(picked.people.size ? [counted(picked.people.size, 'person', 'people')] : []),
  ];
  return parts.length
    ? `${parts.join(' and ')}. You and the administrators see it as well.`
    : 'Nobody else: only you and the administrators will see it.';
}

/** A row to tick: a name, and under it what tells this one from another of the same name. */
function row(kind, id, name, detail, title = '') {
  const label = document.createElement('label');
  label.className = 'audience__row';
  if (title) label.title = title;
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'field__check';
  box.checked = picked[kind].has(id);
  box.addEventListener('change', () => {
    if (box.checked) picked[kind].add(id); else picked[kind].delete(id);
    el('audience-count').textContent = summary();
  });
  const words = document.createElement('span');
  words.className = 'audience__who';
  const called = document.createElement('span');
  called.className = 'audience__name';
  called.textContent = name;
  words.append(called);
  if (detail) {
    const more = document.createElement('span');
    more.className = 'audience__detail';
    more.textContent = detail;
    words.append(more);
  }
  label.append(box, words);
  return label;
}

function empty(text) {
  const note = document.createElement('p');
  note.className = 'audience__empty';
  note.textContent = text;
  return note;
}

function showGroups() {
  el('audience-groups').replaceChildren(...(groups.length
    ? groups.map((group) => row('groups', group.id, group.name,
      group.members.length ? counted(group.members.length, 'person', 'people') : 'Nobody in it yet',
      group.members.map((member) => member.name).join(', ')))
    : [empty('There are no groups yet. An administrator makes them in Users & access.')]));
}

function showPeople() {
  const words = el('audience-find').value.trim().toLowerCase();
  const found = people.filter((person) => !words || `${person.name} ${person.email ?? ''}`.toLowerCase().includes(words));
  el('audience-people').replaceChildren(...(found.length
    ? found.map((person) => row('people', person.id, person.name, person.email && person.email !== person.name ? person.email : ''))
    : [empty(people.length ? 'Nobody on the list matches.' : 'There is nobody else on the list yet.')]));
}

function show() {
  for (const chip of el('audience-with').querySelectorAll('[data-with]')) {
    chip.setAttribute('aria-pressed', String((chip.dataset.with === 'everyone') === everyone));
  }
  el('audience-pick').hidden = everyone;
  el('audience-count').textContent = summary();
}

function shut(answer) {
  const done = settle;
  settle = null;
  if (dialog.open) dialog.close();
  done?.(answer);
}

/**
 * Ask who a version is shared with.
 *
 * @param title   what is being shared, as the dialog's heading
 * @param says    a sentence on what pressing the button does
 * @param action  what the button says: "Share", "Share again", "Save"
 * @param current who it is shared with now: null for everyone, or
 *                `{ people: [{ id }], groups: [{ id }] }`
 * @param me      the id of whoever is asking, who is not offered themselves
 * @returns `{ everyone: true }`, `{ people, groups }`, or null if it was shut
 */
export function chooseAudience({ title, says, action = 'Share', current = null, me = null }) {
  // One question at a time: a second asked while the first is open answers the first with nothing.
  shut(null);

  everyone = current === null;
  picked.people = new Set((current?.people ?? []).map((one) => one.id));
  picked.groups = new Set((current?.groups ?? []).map((one) => one.id));
  people = [];
  groups = [];
  el('audience-title').textContent = title;
  el('audience-says').textContent = says;
  el('audience-ok').textContent = action;
  el('audience-find').value = '';
  el('audience-note').hidden = true;
  el('audience-groups').replaceChildren(empty('Reading the groups…'));
  el('audience-people').replaceChildren(empty('Reading the list…'));
  show();
  dialog.showModal();

  // The lists arrive after the dialog is up: it opens at once, and on Everyone
  // — what most shares are — there is nothing to wait for.
  Promise.all([listGroups(), listPeople()]).then(([allGroups, allPeople]) => {
    groups = allGroups;
    // A viewer sees the published map and nothing else, so sharing with one
    // would show them nothing; and whoever is asking sees it anyway.
    people = allPeople.filter((person) => person.role !== 'viewer' && person.id !== me);
    showGroups();
    showPeople();
  }).catch((error) => {
    el('audience-note').textContent = `Could not read who there is: ${error.message}`;
    el('audience-note').hidden = false;
    el('audience-note').dataset.error = 'true';
  });

  return new Promise((resolve) => { settle = resolve; });
}

for (const chip of el('audience-with').querySelectorAll('[data-with]')) {
  chip.addEventListener('click', () => {
    everyone = chip.dataset.with === 'everyone';
    show();
  });
}
el('audience-find').addEventListener('input', showPeople);
el('audience-cancel').addEventListener('click', () => shut(null));
el('audience-form').addEventListener('submit', (event) => {
  event.preventDefault();
  shut(everyone ? { everyone: true } : { people: [...picked.people], groups: [...picked.groups] });
});
// Esc, and whatever else shuts a dialog without an answer.
dialog.addEventListener('close', () => shut(null));
// A press on the backdrop shuts it, if it began there too, as with the other dialogs.
let pressedBackdrop = false;
dialog.addEventListener('pointerdown', (event) => { pressedBackdrop = event.target === dialog; });
dialog.addEventListener('click', (event) => { if (pressedBackdrop && event.target === dialog) shut(null); });

/**
 * Who a version is shared with, in a few words for a row: "Everyone", or the
 * names — groups first, since a group is the larger thing said — cut after two
 * with how many more there are. The whole of it is for a tooltip.
 */
export function audienceSays(audience, { mine = false } = {}) {
  if (!audience) return { short: 'Everyone', full: 'Everyone who works on the map' };
  const names = [...audience.groups.map((group) => group.name), ...audience.people.map((person) => person.name)];
  if (names.length === 0) {
    return mine
      ? { short: 'Only you', full: 'Only you and the administrators' }
      : { short: 'Nobody else', full: 'Only whoever shared it and the administrators' };
  }
  const more = names.length - 2;
  return {
    short: `${names.slice(0, 2).join(', ')}${more > 0 ? ` +${more}` : ''}`,
    full: `${names.join(', ')} — and whoever shared it, and the administrators`,
  };
}
