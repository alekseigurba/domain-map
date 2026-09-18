// Who is looking, and what they may do: the avatar in the header, the profile
// popup it opens, and what the page does when its session ends underneath it.

/** True while the page is leaving to sign in again, so it does not ask whether to leave. */
export let signingIn = false;

/**
 * The session has gone: sign in, then come back here. Unsaved changes are kept
 * in this tab (see keepSession in main.js), so they are there on the way back.
 */
export function signInAgain() {
  if (signingIn) return;
  signingIn = true;
  const here = location.pathname + location.search + location.hash;
  location.assign(`login.html?returnUrl=${encodeURIComponent(here)}`);
}

/**
 * `{ required, name, username, email, method, role }`, where the role is
 * 'owner' or 'viewer'. With sign-in off there is nobody to name, and everyone
 * is an owner.
 */
export async function whoAmI() {
  const response = await fetch('api/me', { cache: 'no-store', headers: { accept: 'application/json' } });
  if (response.status === 401) {
    signInAgain();
    throw new Error('Your session has ended. Signing in again…');
  }
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  return response.json();
}

/** "Alice van Example" -> "AE": the first letters of the first and last words. */
export function initialsOf(name) {
  const words = (name ?? '').trim().split(/\s+/).filter((word) => /\p{L}/u.test(word));
  if (words.length === 0) return '';
  const first = [...words[0]].find((c) => /\p{L}/u.test(c));
  const last = words.length > 1 ? [...words.at(-1)].find((c) => /\p{L}/u.test(c)) : '';
  return `${first}${last ?? ''}`.toUpperCase();
}

const ROLE_TEXT = {
  owner: 'Owner — can open any version, edit and publish',
  viewer: 'Viewer — sees the published map',
};

/**
 * The avatar in the header, and the popup it opens: who this is, what they may
 * do, and the way out. `report` shows what went wrong.
 */
export function showIdentity(me, report) {
  const initials = initialsOf(me.name);
  const bypass = me.method === 'bypass';

  for (const avatar of document.querySelectorAll('[data-avatar]')) {
    // Nobody to name — sign-in is off — leaves the silhouette the markup carries.
    if (initials) avatar.querySelector('.avatar__initials').textContent = initials;
    avatar.dataset.named = String(Boolean(initials));
    if (bypass) avatar.dataset.method = 'bypass';
  }

  const button = document.getElementById('profile');
  const who = me.required ? (me.name ?? 'Signed in') : 'Sign-in is off';
  button.title = `${who} — profile, help and sign-out`;
  button.setAttribute('aria-label', `${who}: profile`);

  document.getElementById('profile-name').textContent = who;
  const email = me.email ?? me.username ?? '';
  const emailLine = document.getElementById('profile-email');
  emailLine.textContent = email;
  emailLine.hidden = !email;
  document.getElementById('profile-role').textContent = ROLE_TEXT[me.role] ?? me.role;
  document.getElementById('profile-bypass').hidden = !bypass;

  // With no gate there is nothing to sign out of.
  const out = document.getElementById('sign-out');
  out.hidden = !me.required;
  out.addEventListener('click', async () => {
    try {
      const response = await fetch('auth/logout', { method: 'POST', headers: { accept: 'application/json' } });
      const payload = await response.json().catch(() => null);
      location.assign(payload?.returnUrl ?? 'login.html?signedOut=1');
    } catch (error) {
      report(`Could not sign out: ${error.message}`);
    }
  });
}
