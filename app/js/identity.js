// Who is signed in, named in the header next to the way out; and what the page
// does when its session ends underneath it.

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

/** Name the person signed in and offer Sign out. `report` shows what went wrong. */
export async function showIdentity(report) {
  let state;
  try {
    const response = await fetch('auth/me', { cache: 'no-store', headers: { accept: 'application/json' } });
    state = await response.json();
  } catch {
    return; // nothing to name; a request that needs a session will say so itself
  }

  if (!state.required) return; // no gate on this server, so nobody to name
  if (!state.authenticated) return signInAgain();

  const who = document.getElementById('who');
  who.textContent = state.name ?? 'Signed in';
  if (state.username) who.title = state.username;
  if (state.method) who.dataset.method = state.method;
  who.hidden = false;

  const out = document.getElementById('sign-out');
  out.hidden = false;
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
