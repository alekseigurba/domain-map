// What a person may do. Four roles, one to a person, each holding everything
// the one below it does: a viewer sees the published map; a contributor edits
// and saves versions; a publisher also chooses which version is the map
// everyone sees; the administrator also manages people and access, and there
// is exactly one. Roles are rows in Postgres (scripts/people-store.mjs), read
// on every request, so a change applies at the person's next click.
//
// OWNER_EMAILS is read once, into an empty people table at first boot: the
// first address becomes the administrator and the rest contributors. After
// that the table rules, and the variable is not looked at again.

export const VIEWER = 'viewer';
export const CONTRIBUTOR = 'contributor';
export const PUBLISHER = 'publisher';
export const ADMINISTRATOR = 'administrator';

/** Lowest first, so the index is the rank. */
export const ROLES = Object.freeze([VIEWER, CONTRIBUTOR, PUBLISHER, ADMINISTRATOR]);

export const isRole = (value) => ROLES.includes(value);

/** Whether `role` may do what `needed` may. */
export const atLeast = (role, needed) => ROLES.indexOf(role) >= ROLES.indexOf(needed);

/** "a@x.com, B@y.com" or an array of the same, as lower-cased addresses in the order given, without repeats. */
export function readOwners(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[\s,;]+/);
  return [...new Set(list.map((email) => String(email).trim().toLowerCase()).filter(Boolean))];
}

/**
 * The role of whoever made a request. With sign-in off there is nobody to tell
 * apart, and whoever is there may do everything, or nobody could work on a map
 * locally. Signed in, the role is the person's row; someone the table has no
 * row for -- an auth that could not say who they are -- is a viewer.
 */
export function roleOf(user, person, { required }) {
  if (!required) return ADMINISTRATOR;
  if (!user) return VIEWER;
  return isRole(person?.role) ? person.role : VIEWER;
}
