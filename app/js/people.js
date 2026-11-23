// Users & access: who may open the map and what each may do. Everyone who
// works on the map can read the list — to see who the publishers are, and whom
// to ask — and only an administrator changes it: a role for each person, a
// person added by email ahead of their first sign-in, a person taken off the
// list, and everyone who has not been back for a while taken off at once.
// Nobody does any of it to their own row, so whoever changes a role is still an
// administrator afterwards. The dialog's frame is in index.html; this reads the
// list afresh each time it opens.
//
// Beside the people are the groups made from them: a name and its members,
// which is what a version is shared with when it is not shared with everyone.
// Everyone who can open the dialog reads them, and an administrator makes one,
// names it and says who is in it. They are the dialog's other view rather than
// a dialog of their own, since a group is put together looking at the list.
//
// The list only grows — everyone who signs in once is on it — so it is shown a
// page at a time, and narrowed by a name or an address, by role, and by when
// someone was last here. All of that is done here, on the list as it was read:
// it is a few hundred rows of a name and a date, and the owner picker reads the
// whole of it anyway.

import { call } from './api.js';
import { ADMINISTRATOR, ROLE_NAMES, ROLE_SAYS, mayAs } from './identity.js';

/** Everyone on the list, by name. Contributors and above; a viewer is not shown it. */
export const listPeople = async () => (await call('GET', 'api/people')).people;
const addPerson = (fields) => call('POST', 'api/people', fields);
const setRole = (id, role) => call('PATCH', `api/people/${encodeURIComponent(id)}`, { role });
const removePerson = (id) => call('DELETE', `api/people/${encodeURIComponent(id)}`);
/** Who a clear-out would take, as the server counts them: `{ people }`. */
const whoIsAway = (since, role) => call('GET',
  `api/people/inactive?notSeenSince=${encodeURIComponent(since.toISOString())}${role ? `&role=${encodeURIComponent(role)}` : ''}`);
/** Remove the people a clear-out was shown to take, and nobody else. */
const clearOut = ({ since, role, people: shown }) => call('POST', 'api/people/inactive',
  { notSeenSince: since.toISOString(), role: role || null, ids: shown.map((person) => person.id) });

/** Every group, by name, each with its members. Contributors and above. */
export const listGroups = async () => (await call('GET', 'api/groups')).groups;
const group = (id, rest = '') => `api/groups/${encodeURIComponent(id)}${rest}`;
const addGroup = (name) => call('POST', 'api/groups', { name });
const renameGroup = (id, name) => call('PATCH', group(id), { name });
const removeGroup = (id) => call('DELETE', group(id));
const addMember = (id, personId) => call('PUT', group(id, `/members/${encodeURIComponent(personId)}`));
const removeMember = (id, personId) => call('DELETE', group(id, `/members/${encodeURIComponent(personId)}`));

/** How many rows a page holds: what the dialog shows without the list running off the screen. */
const PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The least a clear-out may reach back, as scripts/people-store.mjs has it: the server refuses anything nearer. */
const LEAST_INACTIVE_DAYS = 30;

/** Lowest first, as the key reads: each role up the ladder says what it adds. */
const ROLES = ['viewer', 'contributor', 'publisher', 'administrator'];

const el = (id) => document.getElementById(id);

/** Who is looking: `{ id, role }`. Set before the dialog first opens. */
let me = { id: null, role: 'viewer' };
/** Everyone on the list, as last read. */
let everyone = [];
/** Every group, as last read. */
let groups = [];
/** Which of the dialog's two views is on show: the people, or the groups. */
let view = 'people';
/** Which page of those found is on show, from 0. */
let page = 0;
/**
 * A clear-out being looked over, as `{ since, role, people }`, or null. While
 * there is one the rows are those people and nobody else: what is on the page
 * is who would go.
 */
let preview = null;
/** Told when the list has changed under the page, so the owner picker can read it again. */
let onChange = () => {};

function say(text, isError = false) {
  const note = el('people-note');
  note.textContent = text ?? '';
  note.hidden = !text;
  note.dataset.error = String(isError);
}

/**
 * "Sep 18, 14:02" for a day this year, "Oct 19, 2025" for one before it, or
 * that they have not been here yet. A day from another year says which year:
 * without it, someone last here thirteen months ago reads as here last month,
 * on the very list that is looked at to see who has been away.
 */
function seen(iso) {
  if (!iso) return 'Not yet';
  const day = new Date(iso);
  return day.getFullYear() === new Date().getFullYear()
    ? day.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : day.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function cell(className, ...children) {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.append(...children);
  return td;
}

/**
 * Everything but Close is held down while a change is on its way, so a second
 * press cannot start a second one. `done` says what happened, from what the
 * change answered with, once the list has been read again.
 */
async function act(work, done) {
  for (const control of el('people-dialog').querySelectorAll('button, select, input')) control.disabled = true;
  let said = null;
  let failed = false;
  try {
    const answer = await work();
    onChange();
    said = done?.(answer) ?? null;
  } catch (error) {
    said = error.message;
    failed = true;
  }
  await refresh();
  if (said) say(said, failed);
}

/** When someone was last here, for telling who is away: their last sign-in, or the day they were added if they never came. */
const lastHere = (person) => Date.parse(person.lastSignedIn ?? person.createdAt);

/** The people the look-up and the two filters leave, in the order the list came in — or, looking a clear-out over, who it would take. */
function found() {
  if (preview) return preview.people;
  const words = el('people-find').value.trim().toLowerCase();
  const role = el('people-role').value;
  const [when, days] = el('people-seen').value.split(':');
  const edge = Date.now() - Number(days) * DAY_MS;
  return everyone.filter((person) => {
    if (words && !`${person.name} ${person.email ?? ''}`.toLowerCase().includes(words)) return false;
    if (role && person.role !== role) return false;
    if (when === 'never') return person.lastSignedIn === null;
    if (when === 'within') return person.lastSignedIn !== null && Date.parse(person.lastSignedIn) >= edge;
    // Away, as the clear-out counts it: someone added lately who has yet to come is not.
    if (when === 'before') return lastHere(person) < edge;
    return true;
  });
}

const narrowed = () => el('people-find').value.trim() !== '' || el('people-role').value !== '' || el('people-seen').value !== '';
const people = (count) => `${count} ${count === 1 ? 'person' : 'people'}`;

/** The day a clear-out reaches back to: so many days ago, or the start of the day picked. */
function sweepSince() {
  const age = el('people-sweep-age').value;
  if (age !== 'day') return new Date(Date.now() - Number(age) * DAY_MS);
  const day = el('people-sweep-day').value;
  return day ? new Date(`${day}T00:00:00`) : null;
}

/** Who a clear-out would take: away since then, of the role asked for if one is, and neither an administrator nor whoever is asking. */
function sweepable(since) {
  if (!since || Number.isNaN(since.getTime())) return [];
  const role = el('people-sweep-role').value;
  return everyone.filter((person) => person.role !== ADMINISTRATOR && person.id !== me.id
    && (!role || person.role === role) && lastHere(person) < since.getTime());
}

const draftsOf = (list) => list.reduce((sum, person) => sum + person.drafts, 0);

/**
 * The clear-out as it stands: being set, with how many people it would take
 * counted off the list on the page as its three controls are changed; or being
 * looked over, with the people the server says it would take as the rows, and
 * the bar that removes them or leaves them.
 */
function showSweep() {
  const administers = me.role === ADMINISTRATOR;
  el('people-sweep').hidden = !administers || preview !== null;
  el('people-add').hidden = !administers || preview !== null;
  el('people-find-row').hidden = preview !== null;
  el('people-sweep-confirm').hidden = preview === null;

  if (preview) {
    const { since, role, people: going } = preview;
    const day = since.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    const drafts = draftsOf(going);
    el('people-sweep-says').textContent = `${going.length === 1 ? 'This person has' : `These ${going.length} people have`} not signed in since ${day}`
      + `${role ? ` — ${ROLE_NAMES[role].toLowerCase()}s only` : ''}. Removing them takes their sandboxes too: `
      + `${drafts > 0 ? `${versions(drafts)} ${drafts === 1 ? 'is' : 'are'} deleted for good` : 'all of them are empty'}, and what they shared stays shared. `
      + 'Anyone who can still sign in comes back as a contributor.';
    el('people-sweep-remove').textContent = `Remove ${people(going.length)}`;
    return;
  }

  el('people-sweep-day').hidden = el('people-sweep-age').value !== 'day';
  const going = sweepable(sweepSince());
  const drafts = draftsOf(going);
  el('people-sweep-count').textContent = going.length === 0
    ? 'Nobody.'
    : `${people(going.length)}${drafts > 0 ? `, with ${versions(drafts)} in their sandboxes` : ''}.`;
  el('people-sweep-go').disabled = going.length === 0;
}

/** Show the page of the list that the look-up, the filters and the pager leave. */
function render() {
  const list = found();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  page = Math.min(Math.max(0, page), pages - 1);
  const from = page * PAGE_SIZE;
  const shown = list.slice(from, from + PAGE_SIZE);

  if (shown.length > 0) {
    el('people-rows').replaceChildren(...shown.map(personRow));
  } else {
    // Said where the rows would be, as an empty list of versions says it.
    const none = cell('versions__empty', everyone.length === 0 ? 'Nobody is on the list.' : 'Nobody on the list matches.');
    none.colSpan = 5;
    const row = document.createElement('tr');
    row.append(none);
    el('people-rows').replaceChildren(row);
  }

  const range = list.length > PAGE_SIZE ? `${from + 1}–${from + shown.length} of ` : '';
  el('people-count').textContent = preview
    ? `${range}${people(list.length)} to remove, of ${everyone.length}`
    : narrowed()
      ? `${range}${people(list.length)} found, of ${everyone.length}`
      : `${range}${people(list.length)}`;
  el('people-prev').hidden = pages === 1;
  el('people-next').hidden = pages === 1;
  el('people-prev').disabled = page === 0;
  el('people-next').disabled = page === pages - 1;
  showSweep();
  showGroups();
  showView();
}

/** Show the view that was asked for, and say which it is on the toggle. */
function showView() {
  el('people-panel').hidden = view !== 'people';
  el('groups-panel').hidden = view !== 'groups';
  for (const chip of el('people-views').querySelectorAll('[data-view]')) {
    chip.setAttribute('aria-pressed', String(chip.dataset.view === view));
  }
}

/**
 * One row a group: what it is called and how many are in it, who they are, and
 * what an administrator can do about it. A member is a chip with a way out of
 * the group on it; after the last one, a list of everyone not in the group
 * yet, which puts whoever is picked into it.
 */
function groupRow(one) {
  const administers = me.role === ADMINISTRATOR;

  const what = document.createElement('div');
  what.className = 'roster__who';
  const name = document.createElement('span');
  name.className = 'roster__name';
  name.textContent = one.name;
  const count = document.createElement('span');
  count.className = 'roster__email';
  count.textContent = one.members.length === 0 ? 'Nobody in it yet' : people(one.members.length);
  what.append(name, count);

  const members = document.createElement('div');
  members.className = 'roster__members';
  for (const member of one.members) {
    const chip = document.createElement('span');
    chip.className = 'roster__member';
    chip.textContent = member.name;
    if (member.email && member.email !== member.name) chip.title = member.email;
    if (administers) {
      const out = document.createElement('button');
      out.type = 'button';
      out.className = 'roster__out';
      out.textContent = '×';
      out.title = `Take ${member.name} out of ${one.name}`;
      out.setAttribute('aria-label', out.title);
      out.addEventListener('click', () => act(() => removeMember(one.id, member.id)));
      chip.append(out);
    }
    members.append(chip);
  }
  if (administers) {
    const inIt = new Set(one.members.map((member) => member.id));
    const others = everyone.filter((person) => !inIt.has(person.id));
    const join = document.createElement('select');
    join.className = 'field__select roster__join';
    join.setAttribute('aria-label', `Put someone in ${one.name}`);
    const first = document.createElement('option');
    first.value = '';
    first.textContent = others.length ? 'Add someone…' : 'Everyone is in it';
    join.append(first);
    for (const person of others) {
      const option = document.createElement('option');
      option.value = person.id;
      option.textContent = person.email && person.email !== person.name ? `${person.name} — ${person.email}` : person.name;
      join.append(option);
    }
    join.disabled = others.length === 0;
    join.addEventListener('change', () => { if (join.value) act(() => addMember(one.id, join.value)); });
    members.append(join);
  }

  const actions = document.createElement('div');
  actions.className = 'versions__actions';
  if (administers) {
    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'btn btn--chip';
    rename.textContent = 'Rename';
    rename.title = `Give "${one.name}" another name`;
    rename.addEventListener('click', () => {
      const wanted = prompt(`Rename the group "${one.name}" to what?`, one.name);
      const to = wanted?.trim();
      if (!to || to === one.name) return;
      act(() => renameGroup(one.id, to));
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--chip btn--danger';
    remove.textContent = 'Delete';
    remove.title = `Delete the group "${one.name}"`;
    remove.addEventListener('click', () => {
      // Said before it is done: the one thing about deleting a group that is not obvious.
      const question = `Delete the group "${one.name}"?\n\nWhatever was shared with it is no longer shared with its members through it. `
        + 'Nothing falls open to everyone: a version shared with this group alone is then seen by whoever shared it, and by the administrators.';
      if (confirm(question)) act(() => removeGroup(one.id));
    });
    actions.append(rename, remove);
  }

  const row = document.createElement('tr');
  row.append(cell(null, what), cell('roster__in', members), cell(null, actions));
  return row;
}

/** The groups, a row each, or that there are none and who makes them. */
function showGroups() {
  const administers = me.role === ADMINISTRATOR;
  el('groups-add').hidden = !administers;
  if (groups.length > 0) {
    el('groups-rows').replaceChildren(...groups.map(groupRow));
    return;
  }
  const none = cell('versions__empty', administers
    ? 'There are no groups yet. Name one below, then put people in it.'
    : 'There are no groups yet. An administrator makes them.');
  none.colSpan = 3;
  const row = document.createElement('tr');
  row.append(none);
  el('groups-rows').replaceChildren(row);
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
  // Nobody changes their own row: another administrator does. And a clear-out
  // being looked over is a list to read: a role changed there would be a row
  // that no longer says what was asked about.
  const manages = me.role === ADMINISTRATOR && !isMe && preview === null;

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
    [everyone, groups] = await Promise.all([listPeople(), listGroups()]);
    say(null);
  } catch (error) {
    say(`Could not read the list: ${error.message}`, true);
  }
  for (const control of el('people-dialog').querySelectorAll('button, select, input')) control.disabled = false;
  // After the controls are let go: which of them a page or an empty sweep holds down is the render's to say.
  render();
}

/**
 * Look a clear-out over before it is done: it takes sandboxes with it and
 * cannot be undone, so nobody is removed from a count. The server is asked who
 * it would take, and those people become the rows — every one of them, a page
 * at a time, with their roles, their sandboxes and when they were last here —
 * under a bar that removes them or leaves them.
 */
async function previewSweep() {
  const since = sweepSince();
  const role = el('people-sweep-role').value;
  if (!since || Number.isNaN(since.getTime())) return;
  const held = [...el('people-dialog').querySelectorAll('button, select, input')];
  for (const control of held) control.disabled = true;
  say('Finding who that is…');
  try {
    const { people: going } = await whoIsAway(since, role);
    if (going.length === 0) {
      say('Nobody: everyone that would cover has been here since.');
    } else {
      preview = { since, role, people: going };
      page = 0;
      say(null);
    }
  } catch (error) {
    say(error.message, true);
  }
  for (const control of held) control.disabled = false;
  render();
}

/** Leave a clear-out that was being looked over, with nobody removed. */
function leavePreview() {
  preview = null;
  page = 0;
  say(null);
  render();
}

/**
 * Remove the people on show. The server is handed their ids with the day and
 * the role, and takes only those of them who are still away: someone who has
 * signed in since the list was shown is spared, and nobody who was not shown
 * goes.
 */
function removePreviewed() {
  const asked = preview;
  if (!asked) return;
  preview = null;
  page = 0;
  act(() => clearOut(asked), ({ removed }) => {
    const spared = asked.people.length - removed.length;
    if (removed.length === 0) return 'Nobody was removed: everyone shown has been here since.';
    return `Removed ${people(removed.length)}: ${removed.slice(0, 8).map((person) => person.name).join(', ')}`
      + `${removed.length > 8 ? ', and others' : ''}.${spared > 0 ? ` ${people(spared)} had been here since, and stayed.` : ''}`;
  });
}

/** The key at the foot of the dialog: each role and what it may do, lowest first. */
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
 * Wire the dialog to who is looking. main.js opens it from the button in
 * Settings; this is what happens then, and what an administrator's form at the
 * foot does.
 */
export function initPeople(who, { onChange: changed } = {}) {
  me = who;
  if (changed) onChange = changed;
  showKey();

  const opener = el('people');
  opener.hidden = !mayAs(me.role, 'contributor');
  opener.addEventListener('click', () => {
    el('settings-dialog').close();
    // Opened afresh: the whole list, from its first page.
    el('people-find').value = '';
    el('people-role').value = '';
    el('people-seen').value = '';
    page = 0;
    preview = null;
    view = 'people';
    everyone = [];
    groups = [];
    el('people-rows').replaceChildren();
    el('groups-rows').replaceChildren();
    el('people-count').textContent = '';
    say('Reading the list…');
    refresh();
  });

  // Narrowing the list starts it again from its first page: page three of
  // everyone is nowhere in particular among the publishers.
  for (const [id, event] of [['people-find', 'input'], ['people-role', 'change'], ['people-seen', 'change']]) {
    el(id).addEventListener(event, () => { page = 0; render(); });
  }
  for (const chip of el('people-views').querySelectorAll('[data-view]')) {
    chip.addEventListener('click', () => {
      view = chip.dataset.view;
      say(null);
      showView();
    });
  }
  el('groups-add').addEventListener('submit', (event) => {
    event.preventDefault();
    const box = el('groups-add-name');
    const name = box.value;
    act(async () => {
      await addGroup(name);
      box.value = '';
    });
  });
  el('people-prev').addEventListener('click', () => { page -= 1; render(); });
  el('people-next').addEventListener('click', () => { page += 1; render(); });

  const sweepForm = el('people-sweep');
  sweepForm.hidden = me.role !== ADMINISTRATOR;
  // A day picked may be no nearer than the server will take, and starts where the lengths on offer do.
  const dayBox = el('people-sweep-day');
  const asDay = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  dayBox.max = asDay(new Date(Date.now() - LEAST_INACTIVE_DAYS * DAY_MS));
  dayBox.value = asDay(new Date(Date.now() - 90 * DAY_MS));
  el('people-sweep-age').addEventListener('change', showSweep);
  el('people-sweep-role').addEventListener('change', showSweep);
  dayBox.addEventListener('input', showSweep);
  sweepForm.addEventListener('submit', (event) => {
    event.preventDefault();
    previewSweep();
  });
  el('people-sweep-cancel').addEventListener('click', leavePreview);
  el('people-sweep-remove').addEventListener('click', removePreviewed);

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
