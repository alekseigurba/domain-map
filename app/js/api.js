// One call to the server's JSON API, as every client module makes it. It
// answers with the server's JSON, or throws an Error carrying the server's own
// words, its status, and — for a save that lost a race — the version as it now
// stands. A session that has ended is sent to sign in again rather than
// retried, since nothing can succeed until it has.

import { signInAgain } from './identity.js';

export async function call(method, url, body) {
  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    /* no body worth reading */
  }
  if (response.ok) return payload;

  // The session ended while the page was open: nothing here can be retried
  // until the person signs in again.
  if (response.status === 401) {
    signInAgain();
    throw Object.assign(new Error('Your session has ended. Signing in again…'), { status: 401 });
  }
  throw Object.assign(new Error(payload?.error ?? `The server answered ${response.status}.`), {
    status: response.status,
    version: payload?.version ?? null,
  });
}
