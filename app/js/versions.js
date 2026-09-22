// The versions of the map, as the server keeps them: the ones in this person's
// sandbox, the shared ones every contributor sees, and the published one among
// those, which is the only one a viewer ever sees. A version is a name, a
// document, and who saved it when; `scope` says which list it is in, and
// `mine` whether a shared one is this person's to rename or delete.
//
// Every call answers with the server's JSON, or throws an Error carrying the
// server's own words, its status, and — for a save that lost a race — the
// version as it now stands.

import { call } from './api.js';

/** A shared version lives at `api/versions/<name>`, one in the sandbox at `api/drafts/<name>`. */
const path = (scope, name) => `api/${scope === 'sandbox' ? 'drafts' : 'versions'}/${encodeURIComponent(name)}`;

/** Every shared version, newest first, without their documents. Contributors only. */
export const listShared = async () => (await call('GET', 'api/versions')).versions;

/** Every version in this person's sandbox, newest first, without their documents. */
export const listDrafts = async () => (await call('GET', 'api/drafts')).versions;

/** One version with its document. A viewer may only read the published one. */
export const readVersion = (scope, name) => call('GET', path(scope, name));

/** The published version with its document, or null when nothing is published yet. */
export async function readPublished() {
  try {
    return await call('GET', 'api/published');
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

/** A new version in this person's sandbox: called `name` if the sandbox has it free, or numbered. */
export const createDraft = (document, name = null) => call('POST', 'api/drafts', { document, ...(name && { name }) });

/** Write over a sandbox version, unless it has been saved since `base`, its `updatedAt` when opened. */
export const saveDraft = (name, document, base) => call('PUT', path('sandbox', name), { document, base });

/** Give a version another name. The name is also its address, so old links to it stop working. */
export const renameVersion = (scope, name, to) => call('PATCH', path(scope, name), { name: to });

export const deleteVersion = (scope, name) => call('DELETE', path(scope, name));

/** A fixed copy of a sandbox version among the shared ones, under its own name or `as`. */
export const shareDraft = (name, as = null) => call('POST', `${path('sandbox', name)}/share`, as ? { name: as } : {});

/** A copy of a shared version in this person's sandbox, to work on. */
export const copyVersion = (name) => call('POST', `${path('shared', name)}/copy`, {});

/** Make a shared version the map everyone lands on. Publishers only. */
export const publishVersion = (name) => call('PUT', 'api/published', { name });
