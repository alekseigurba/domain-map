// The versions of the map, as the server keeps them. A version is a name, a
// document, and who saved it when; one of them is the published one, which is
// the only one a viewer ever sees.
//
// Every call answers with the server's JSON, or throws an Error carrying the
// server's own words, its status, and — for a save that lost a race — the
// version as it now stands.

import { signInAgain } from './identity.js';

const path = (name) => `api/versions/${encodeURIComponent(name)}`;

async function call(method, url, body) {
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

/** Every version, newest first, without their documents. Owners only. */
export const listVersions = async () => (await call('GET', 'api/versions')).versions;

/** One version with its document. A viewer may only read the published one. */
export const readVersion = (name) => call('GET', path(name));

/** The published version with its document, or null when nothing is published yet. */
export async function readPublished() {
  try {
    return await call('GET', 'api/published');
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/** A new version holding `document`; the server names it for today. */
export const createVersion = (document) => call('POST', 'api/versions', { document });

/** Write over `name`, unless it has been saved since `base`, its `updatedAt` when opened. */
export const saveVersion = (name, document, base) => call('PUT', path(name), { document, base });

export const deleteVersion = (name) => call('DELETE', path(name));

export const publishVersion = (name) => call('PUT', 'api/published', { name });
