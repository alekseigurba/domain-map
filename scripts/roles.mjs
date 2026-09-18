// Who may change the map. There are two roles for the whole site: an owner can
// open any version, edit, save, delete and publish; a viewer sees the published
// version and nothing else. Owners are a list of email addresses, read from
// OWNER_EMAILS — nothing about roles is asked of Entra ID yet.

export const OWNER = 'owner';
export const VIEWER = 'viewer';

/** "a@x.com, B@y.com" or an array of the same, as a set of lower-cased addresses. */
export function readOwners(value) {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[\s,;]+/);
  return new Set(list.map((email) => String(email).trim().toLowerCase()).filter(Boolean));
}

/**
 * The role of whoever made a request. With sign-in off there is nobody to tell
 * apart, and the development bypass is somebody at their own machine: both get
 * to edit, or nobody could work on a map locally.
 */
export function roleOf(user, { required, owners }) {
  if (!required) return OWNER;
  if (!user) return VIEWER;
  if (user.method === 'bypass') return OWNER;
  const names = [user.username, user.email].filter(Boolean).map((name) => name.toLowerCase());
  return names.some((name) => owners.has(name)) ? OWNER : VIEWER;
}
