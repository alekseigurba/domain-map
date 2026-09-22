// Users & access: who may open the map and what each may do. Everyone who
// works on the map can read the list — to see who the publishers are, and whom
// to ask — and only an administrator changes it: a role for each person, a
// person added by email ahead of their first sign-in, and a person taken off
// the list. Nobody does either to their own row, so whoever changes a role is
// still an administrator afterwards. The dialog's frame is in index.html; this
// fills its rows afresh each time it opens.

import { call } from './api.js';
import { ADMINISTRATOR, ROLE_NAMES, ROLE_SAYS, mayAs } from './identity.js';

/** Everyone on the list, by name. Contributors and above; a viewer is not shown it. */
export const listPeople = async () => (await call('GET', 'api/people')).people;
const addPerson = (fields) => call('POST', 'api/people', fields);
const setRole = (id, role) => call('PATCH', `api/people/${encodeURIComponent(id)}`, { role });
const removePerson = (id) => call('DELETE', `api/people/${encodeURIComponent(id)}`);

/** Lowest first, as the key reads: each role up the ladder says what it adds. */
const ROLES = ['viewer', 'contributor', 'publisher', 'administrator'];

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

/** "3 versions", "1 version". */
const versions = (count) => `${count} version${count === 1 ? '' : 's'}`;

/**
 * Making someone an administrator gives them everything, taking you off the
 * list included, and a select changes on an arrow key; so it asks. Anything
 * else is undone from the same select.
 */
function changeRole(person, select) {
  if (select.value === ADMINISTRATOR
    && !confirm(`Make ${person.name} an administrator?\n\nThey can then change anyone's role, and add and remove people, as you can.`)) {
    select.value = person.role;
    return;
  }
  act(() => setRole(person.id, select.value));
}

/**
 * Someone who has signed in is asked about, since their sandbox goes with
 * them and they may yet come back; someone added who never came is a line on
 * a list, and goes at once.
 */
function removeRow(person) {
  if (person.sources.length > 0) {
    const sandbox = person.drafts > 0
      ? `Their sandbox goes with them: the ${versions(person.drafts)} in it ${person.drafts === 1 ? 'is' : 'are'} deleted for good. What they shared stays shared.`
      : 'Their sandbox is empty. What they shared stays shared.';
    const back = 'If they can still sign in, they come back as a contributor, as anyone new does.';
    if (!confirm(`Remove ${person.name} from the list?\n\n${sandbox}\n\n${back}`)) return;
  }
  act(() => removePerson(person.id));
}

/** One row a person: who they are, what they may do, when they were last here, and what an administrator can do about it. */
function personRow(person) {
  const isMe = person.id === me.id;
  // Nobody changes their own row: another administrator does.
  const manages = me.role === ADMINISTRATOR && !isMe;

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

  // A select for an administrator, a word for everyone else, and what the
  // role does on the pointer either way.
  let role;
  if (manages) {
    role = document.createElement('select');
    role.className = 'field__select roster__role';
    role.setAttribute('aria-label', `${person.name}'s role`);
    for (const value of ROLES) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = ROLE_NAMES[value];
      option.title = ROLE_SAYS[value];
      option.selected = value === person.role;
      role.append(option);
    }
    role.addEventListener('change', () => changeRole(person, role));
  } else {
    role = document.createElement('span');
    role.textContent = ROLE_NAMES[person.role] ?? person.role;
  }
  role.title = ROLE_SAYS[person.role] ?? '';

  const actions = document.createElement('div');
  actions.className = 'versions__actions';
  if (manages) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--chip btn--danger';
    remove.textContent = 'Remove';
    remove.title = person.drafts > 0
      ? `Take ${person.name} off the list, with the ${versions(person.drafts)} in their sandbox`
      : `Take ${person.name} off the list`;
    remove.addEventListener('click', () => removeRow(person));
    actions.append(remove);
  }

  // How many versions their sandbox holds, never what: a sandbox is private.
  const sandbox = person.drafts === 0 ? 'Empty' : versions(person.drafts);

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

/** The key at the head of the dialog: each role and what it may do, lowest first. */
function showKey() {
  el('people-key').replaceChildren(...ROLES.flatMap((role) => {
    const term = document.createElement('dt');
    term.textContent = ROLE_NAMES[role];
    const says = document.createElement('dd');
    says.textContent = ROLE_SAYS[role];
    return [term, says];
  }));
}

/**
 * Wire the dialog to who is looking. main.js opens it from the button in the
 * profile popup; this is what happens then, and what an administrator's form
 * at the foot does.
 */
export function initPeople(who, { onChange: changed } = {}) {
  me = who;
  if (changed) onChange = changed;
  showKey();

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
