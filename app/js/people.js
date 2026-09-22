// Users & access: who may open the map and what each may do. Everyone who
// works on the map can read the list — to see who the publishers are, and whom
// to ask — and only the administrator changes it: a role for each person, a
// person added by email ahead of their first sign-in, and the one
// administrator's role handed to someone else. The dialog's frame is in
// index.html; this fills its rows afresh each time it opens.

import { call } from './api.js';
import { ADMINISTRATOR, ROLE_NAMES, ROLE_SAYS, mayAs } from './identity.js';

/** Everyone on the list, by name. Contributors and above; a viewer is not shown it. */
export const listPeople = async () => (await call('GET', 'api/people')).people;
const addPerson = (fields) => call('POST', 'api/people', fields);
const setRole = (id, role) => call('PATCH', `api/people/${encodeURIComponent(id)}`, { role });
const makeAdministrator = (id) => call('PUT', 'api/administrator', { id });

/** The roles the administrator hands out: every one but their own, which is handed over. */
const GIVEN = ['viewer', 'contributor', 'publisher'];

const el = (id) => document.getElementById(id);

/** Who is looking: `{ id, role }`. Set before the dialog first opens. */
let me = { id: null, role: 'viewer' };
/** Told when the list has changed under the page, so the owner picker can read it again. */
let onChange = () => {};

function say(text, isError = false) {
  const note = el('people-note');
  note.textContent = text ?? '';
  note.hidden = !text;
  note.dataset.error = String(isError);
}

/** "Sep 18, 14:02", or that they have not been here yet. */
const seen = (iso) => (iso
  ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Not yet');

function cell(className, ...children) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.append(...children);
  return td;
}

/** Everything but Close is held down while a change is on its way, so a second press cannot start a second one. */
async function act(work) {
  for (const button of el('people-dialog').querySelectorAll('button, select')) button.disabled = true;
  try {
    await work();
    onChange();
  } catch (error) {
    say(error.message, true);
  }
  await refresh();
}

/** One row a person: who they are, what they may do, when they were last here, and what the administrator can do about it. */
function personRow(person) {
  const administrates = me.role === ADMINISTRATOR;
  const isMe = person.id === me.id;

  const who = document.createElement('div');
  who.className = 'roster__who';
  const name = document.createElement('span');
  name.className = 'roster__name';
  name.textContent = person.name;
  who.append(name);
  if (isMe) {
    const you = document.createElement('span');
    you.className = 'badge badge--quiet';
    you.textContent = 'You';
    who.append(you);
  }
  if (person.email && person.email !== person.name) {
    const email = document.createElement('span');
    email.className = 'roster__email';
    email.textContent = person.email;
    who.append(email);
  }

  // The administrator's row reads as it is: the role is handed over from
  // another row, never picked here. Everyone else's is a select for the
  // administrator and a word for everyone else.
  let role;
  if (administrates && person.role !== ADMINISTRATOR) {
    role = document.createElement('select');
    role.className = 'field__select roster__role';
    role.setAttribute('aria-label', `${person.name}'s role`);
    for (const value of GIVEN) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = ROLE_NAMES[value];
      option.title = ROLE_SAYS[value];
      option.selected = value === person.role;
      role.append(option);
    }
    role.addEventListener('change', () => act(() => setRole(person.id, role.value)));
  } else {
    role = document.createElement('span');
    role.textContent = ROLE_NAMES[person.role] ?? person.role;
    role.title = ROLE_SAYS[person.role] ?? '';
  }

  const actions = document.createElement('div');
  actions.className = 'versions__actions';
  if (administrates && person.role !== ADMINISTRATOR) {
    const hand = document.createElement('button');
    hand.type = 'button';
    hand.className = 'btn btn--chip';
    hand.textContent = 'Make administrator';
    hand.title = `Hand the administrator's role to ${person.name}; you become a publisher`;
    hand.addEventListener('click', () => {
      if (!confirm(`Make ${person.name} the administrator?\n\nYou become a publisher, and only they can change who may do what from then on.`)) return;
      act(() => makeAdministrator(person.id));
    });
    actions.append(hand);
  }

  // How many versions their sandbox holds, never what: a sandbox is private.
  const sandbox = person.drafts === 0 ? 'Empty' : `${person.drafts} version${person.drafts === 1 ? '' : 's'}`;

  const row = document.createElement('tr');
  row.dataset.open = String(isMe);
  row.append(cell(null, who), cell(null, role), cell('versions__when', sandbox),
    cell('versions__when', seen(person.lastSignedIn)), cell(null, actions));
  return row;
}

/** Read the list again and show it. */
async function refresh() {
  try {
    const list = await listPeople();
    el('people-rows').replaceChildren(...list.map(personRow));
    say(null);
  } catch (error) {
    say(`Could not read the list: ${error.message}`, true);
  }
  for (const button of el('people-dialog').querySelectorAll('button, select')) button.disabled = false;
}

/**
 * Wire the dialog to who is looking. main.js opens it from the button in the
 * profile popup; this is what happens then, and what the administrator's form
 * at the foot does.
 */
export function initPeople(who, { onChange: changed } = {}) {
  me = who;
  if (changed) onChange = changed;

  const opener = el('people');
  opener.hidden = !mayAs(me.role, 'contributor');
  opener.addEventListener('click', () => {
    el('profile-dialog').close();
    el('people-rows').replaceChildren();
    say('Reading the list…');
    refresh();
  });

  const form = el('people-add');
  form.hidden = me.role !== ADMINISTRATOR;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = {
      name: el('people-add-name').value,
      email: el('people-add-email').value,
      role: el('people-add-role').value,
    };
    act(async () => {
      await addPerson(fields);
      form.reset();
    });
  });
}
