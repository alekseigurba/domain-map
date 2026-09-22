// The versions of the map, as the server keeps them. A version is a name, a
// document, and who saved it when; one of them is the published one, which is
// the only one a viewer ever sees.
//
// Every call answers with the server's JSON, or throws an Error carrying the
// server's own words, its status, and — for a save that lost a race — the
// version as it now stands.

import { call } from './api.js';

const path = (name) => `api/versions/${encodeURIComponent(name)}`;

/** Every version, newest first, without their documents. Contributors only. */
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

/** Give `name` another name. The name is also its address, so old links to it stop working. */
export const renameVersion = (name, to) => call('PATCH', path(name), { name: to });

export const deleteVersion = (name) => call('DELETE', path(name));

export const publishVersion = (name) => call('PUT', 'api/published', { name });
