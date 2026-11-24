// Names offered as they are typed: every box that names a person — an Owner,
// a person's Name, a cell of the Roles grid — offers the people it already
// knows, and once two letters are in, anyone in the organisation's directory
// whose name or address matches. The directory is far too large to send to
// the page whole, so it is asked a few letters at a time, after a pause in the
// typing, and each answer is kept for the rest of the visit.
//
// A box is a text field with a datalist behind it, so the browser does the
// offering; this only fills the list. A name picked is a name, as a typed one
// is: it gives that person nothing.

import { call } from './api.js';

/** How few letters are worth asking about, as the server counts them. */
const MIN_QUERY = 2;

/** How long the typing has to pause before the directory is asked. */
const PAUSE_MS = 250;

const answers = new Map();
/** Once the server says there is no directory, or that this person may not look, it is not asked again. */
let unavailable = false;

/** Whoever in the directory matches `query`, as `{ name, email }`; nobody where there is no directory. */
export async function lookUp(query) {
  const said = query.trim().toLowerCase();
  if (unavailable || said.replace(/\s/g, '').length < MIN_QUERY) return [];
  if (!answers.has(said)) {
    answers.set(said, call('GET', `api/people/directory?q=${encodeURIComponent(said)}`)
      .then((answer) => {
        if (answer?.enabled === false) unavailable = true;
        // A refusal is not kept: the next letters may find Graph willing again.
        if (answer?.error) answers.delete(said);
        return answer?.people ?? [];
      })
      .catch((error) => {
        answers.delete(said);
        if (error.status === 403) unavailable = true;
        return [];
      }));
  }
  return answers.get(said);
}

/**
 * Put `people` — `{ name, email, label }` — into the datalist `listId`, each
 * name once, beside it its `label` or else its address, where either says more
 * than the name.
 */
export function fillNames(listId, people) {
  const list = document.getElementById(listId);
  if (!list) return;
  const seen = new Set();
  const options = [];
  for (const person of people) {
    const name = String(person?.name ?? '').replace(/\s+/g, ' ').trim();
    const key = (person?.email || name).toLowerCase();
    if (!name || seen.has(key) || seen.has(name.toLowerCase())) continue;
    seen.add(key);
    seen.add(name.toLowerCase());
    const option = document.createElement('option');
    option.value = name;
    const beside = person.label || person.email;
    if (beside && beside !== name) option.label = beside;
    options.push(option);
  }
  list.replaceChildren(...options);
}

/**
 * Have the directory's matches offered in `input` as it is typed into. `known`
 * answers with the names the box offers anyway, which stay first; the
 * directory's are added after, each name once. An answer that comes back
 * after the box has moved on is not shown.
 */
export function offerAsTyped(input, listId, known) {
  let pause = null;
  input.addEventListener('input', (event) => {
    // A name picked from the list is a choice made, not more typing.
    if (event.inputType === 'insertReplacementText') return;
    clearTimeout(pause);
    pause = setTimeout(async () => {
      const asked = input.value;
      const found = await lookUp(asked);
      if (input.value !== asked || !input.isConnected) return;
      fillNames(listId, [...known(), ...found]);
    }, PAUSE_MS);
  });
}
