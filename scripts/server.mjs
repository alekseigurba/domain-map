// The server as a library: static files for the app, a file API for icons and
// settings, the versions of the map in Postgres, and sign-in in front of all of
// it. `scripts/serve.mjs` is the CLI over this; another repo installs the
// package and calls it directly.
//
// Everything a consumer is meant to change is a parameter. `brandDir` shadows
// the app's own files, `seedDir` decides what a fresh store starts life with,
// and `store` and `auth` can be replaced outright. Crucially, the defaults that
// belong to the package resolve against this module rather than the working
// directory, so an install under node_modules still finds its own `app/` and
// `seed/` — see BRANDING.md for which of these a consumer is expected to set.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validate } from '../app/js/document.js';
import { validateVersionName } from '../app/js/rules.js';
import { createAssistant } from './assistant.mjs';
import { createAuth } from './auth.mjs';
import { describeDatabase, migrate, openDatabase, waitForDatabase, withLock } from './database.mjs';
import { fileStore } from './file-store.mjs';
import { OWNER, readOwners, roleOf } from './roles.mjs';
import { readSeedVersions, seedStore } from './seed.mjs';
import { versionStore } from './version-store.mjs';

/** A path inside the package, wherever the package has been installed. */
const packagePath = (path) => fileURLToPath(new URL(path, import.meta.url));

/** Generous, and only about memory: what counts as a sane icon is rules.js's. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

const API_PREFIX = '/api/files';

/**
 * Where the versions were files, before they moved to Postgres. A store that
 * still has them keeps them, as a backup, but the file API no longer hands
 * them out: a viewer may only see the published one.
 */
const VERSIONS_PREFIX = 'data/versions/';

/** Case-folded, since a store on macOS or Windows would open data/Versions/ too. */
const isVersionKey = (key) => {
  const normal = `${posix.normalize(`/${key}`).slice(1).toLowerCase()}/`;
  return normal.startsWith(VERSIONS_PREFIX);
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const contentType = (path) => MIME_TYPES[extname(path)] ?? 'application/octet-stream';

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

const failure = (status, message) => Object.assign(new Error(message), { status });

/** The body as one buffer, or null once it has grown past what we will hold. */
function readBody(request) {
  return new Promise((resolve_, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.destroy();
        resolve_(null);
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve_(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

/**
 * An http.Server that has not been listened on yet. Every option has a default,
 * so `createDomainMapServer().listen(8000)` serves the stock app.
 *
 * @param {object}   [options]
 * @param {string}   [options.root]       The app's static files. Defaults to the package's own.
 * @param {string}   [options.brandDir]   Files here shadow `root`, so a consumer can replace
 *                                        any of them without forking. Defaults to `$BRAND_DIR`.
 * @param {string}   [options.seedDir]    What a fresh store is filled from, replacing rather
 *                                        than merging with the package's. Defaults to `$SEED_DIR`.
 * @param {string}   [options.storageDir] Where the store writes. Defaults to `$STORAGE_DIR`.
 * @param {object}   [options.store]      A `{ read, write, list }` of your own — S3, say. Holds
 *                                        icons, the logo and settings; versions are in Postgres.
 * @param {string}   [options.databaseUrl] The Postgres the versions live in. Defaults to
 *                                        `$DATABASE_URL`, and the server does not start without one.
 * @param {string|string[]} [options.owners] Who may edit and publish, by email. Defaults to
 *                                        `$OWNER_EMAILS`, comma-separated. Empty, everyone who
 *                                        signs in may.
 * @param {object}   [options.auth]       A `{ handle, user, required, warnings }` of your own, for
 *                                        a provider that is not Entra ID. `user(request)` answers
 *                                        with `{ name, username, email }` or null.
 * @param {object}   [options.assistant]  A `{ chat, host, model }` of your own, for a model that
 *                                        speaks neither chat completions nor Anthropic's Messages
 *                                        API. `chat({ system, messages }, { signal })` answers with
 *                                        the model's text. Defaults to what `$ASSISTANT_API_URL`,
 *                                        `$ASSISTANT_API_KEY`, `$ASSISTANT_MODEL` and
 *                                        `$ASSISTANT_API_STYLE` describe; without the first two the
 *                                        Assistant writes prompts to copy and has no model.
 * @param {object}   [options.env]        Read instead of `process.env`.
 * @param {Function} [options.log]        Where the startup lines go. `() => {}` to quieten it.
 */
export function createDomainMapServer(options = {}) {
  const env = options.env ?? process.env;
  const log = options.log ?? console.log;
  const warn = options.warn ?? console.warn;

  // Package-owned. These ship inside the package, so they resolve against this
  // module — resolving them against the working directory is what breaks an
  // install in another repo, where the working directory holds no `app/`.
  const root = options.root ? resolve(options.root) : packagePath('../app');
  const seedDir = options.seedDir ?? env.SEED_DIR
    ? resolve(options.seedDir ?? env.SEED_DIR)
    : packagePath('../seed');

  // Consumer-owned. The store is the consumer's data and the brand is their
  // look, so the working directory is the right thing to resolve them against.
  const storageDir = resolve(options.storageDir ?? env.STORAGE_DIR ?? 'storage');
  const brandDir = options.brandDir ?? env.BRAND_DIR
    ? resolve(options.brandDir ?? env.BRAND_DIR)
    : null;

  const store = options.store ?? fileStore(storageDir);
  const auth = options.auth ?? createAuth(env);

  const databaseUrl = options.databaseUrl ?? env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set: the versions of the map live in Postgres. '
      + 'For a local one, run `docker compose up -d postgres`.');
  }
  const pool = openDatabase(databaseUrl);
  const versions = versionStore(pool);

  // The model behind the Assistant, if there is one. One of the consumer's own
  // is connected by being given; the environment's says so itself.
  const assistant = options.assistant
    ? { connected: typeof options.assistant.chat === 'function', warnings: [], ...options.assistant }
    : createAssistant(env);

  const owners = readOwners(options.owners ?? env.OWNER_EMAILS);
  // An auth that cannot say who is asking leaves nobody to make an owner of.
  const required = auth.required !== false;
  const warnings = [...auth.warnings];
  if (required && typeof auth.user !== 'function') {
    warnings.push('The auth given has no user(request), so nobody can be told apart: everyone is a viewer.');
  } else if (required && owners.size === 0) {
    warnings.push('OWNER_EMAILS is empty: everyone who signs in is an owner, and can edit and publish the map.');
  }
  warnings.push(...assistant.warnings);
  // Every message an owner sends is paid for by whoever owns the key.
  if (assistant.connected && (!required || owners.size === 0)) {
    warnings.push(`The Assistant is connected to ${assistant.host} and everyone ${required ? 'who signs in' : 'who can reach this server'} `
      + 'is an owner: any of them can send the map to it, on the key this server holds.');
  }

  /** Who is asking, and what they may do. */
  function identify(request) {
    const user = required ? auth.user?.(request) ?? null : null;
    return { user, role: roleOf(user, { required, owners }) };
  }

  // Where a static request is looked for, in order: the brand's copy of a file
  // wins over the app's own, and a brand that has nothing to say about a file
  // simply does not carry it.
  const bases = brandDir ? [brandDir, root] : [root];

  async function handleFiles(request, response, url, who) {
    const key = decodeURIComponent(url.pathname.slice(API_PREFIX.length).replace(/^\//, ''));

    if (request.method === 'GET' && key === '') {
      const objects = await store.list(url.searchParams.get('prefix') ?? '');
      sendJson(response, 200, { objects: objects.filter((object) => !isVersionKey(object.key)) });
      return;
    }

    if (request.method === 'GET') {
      const object = isVersionKey(key) ? null : await store.read(key);
      if (!object) return sendJson(response, 404, { error: `No object at ${key}.` });
      response.writeHead(200, {
        'Content-Type': contentType(key),
        'Last-Modified': new Date(object.lastModified).toUTCString(),
        'Cache-Control': 'no-store',
      });
      response.end(object.body);
      return;
    }

    if (request.method === 'PUT') {
      if (who.role !== OWNER) return sendJson(response, 403, { error: 'Only an owner can change the map.' });
      if (key === '') return sendJson(response, 400, { error: 'A key is needed to write to.' });
      if (isVersionKey(key)) return sendJson(response, 403, { error: 'Versions are saved to /api/versions now.' });
      const body = await readBody(request);
      if (body === null) {
        return sendJson(response, 413, { error: `An object must be under ${MAX_BODY_BYTES / 1024 / 1024} MB.` });
      }
      sendJson(response, 200, await store.write(key, body));
      return;
    }

    response.writeHead(405, { Allow: 'GET, PUT' });
    response.end();
  }

  /** A JSON body, or a 4xx that says why not. */
  async function readJson(request) {
    const body = await readBody(request);
    if (body === null) throw failure(413, `A request must be under ${MAX_BODY_BYTES / 1024 / 1024} MB.`);
    try {
      return JSON.parse(body.toString('utf8') || 'null') ?? {};
    } catch {
      throw failure(400, 'The request is not valid JSON.');
    }
  }

  /** A document the app could open, or a 400 in the words the app would use. */
  /** A version's name as the client asked for it, trimmed and checked. */
  function checkVersionName(name) {
    const problem = validateVersionName(name);
    if (problem) throw failure(400, problem);
    return name.trim();
  }

  function checkDocument(text) {
    if (typeof text !== 'string') throw failure(400, 'A version needs a document.');
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      throw failure(400, `That map is not valid JSON: ${error.message}`);
    }
    const problem = validate(parsed);
    if (problem) throw failure(400, `That map cannot be opened: ${problem}`);
    return text;
  }

  // Versions: every owner sees them all, and a viewer only ever the published
  // one. Saving, deleting and publishing are an owner's.
  async function handleVersions(request, response, url, who) {
    const { method } = request;
    const path = url.pathname;
    const isOwner = who.role === OWNER;
    const by = who.user
      ? { name: who.user.name ?? null, email: who.user.email ?? who.user.username ?? null }
      : null;
    const ownersOnly = () => sendJson(response, 403, { error: 'Only an owner can do that.' });
    const notAllowed = (allow) => {
      response.writeHead(405, { Allow: allow });
      response.end();
    };

    if (path === '/api/me') {
      if (method !== 'GET') return notAllowed('GET');
      return sendJson(response, 200, {
        required,
        name: who.user?.name ?? null,
        username: who.user?.username ?? null,
        email: who.user?.email ?? null,
        method: who.user?.method ?? null,
        role: who.role,
        // Where an owner's messages would go, so the page can say so before one
        // is sent. A viewer has no chat, and is told nothing about it.
        assistant: isOwner && assistant.connected
          ? { host: assistant.host ?? null, model: assistant.model ?? null }
          : null,
      });
    }

    if (path === '/api/published') {
      if (method === 'GET') {
        const version = await versions.published();
        return version
          ? sendJson(response, 200, version)
          : sendJson(response, 404, { error: 'Nothing has been published yet.' });
      }
      if (method === 'PUT') {
        if (!isOwner) return ownersOnly();
        const { name } = await readJson(request);
        if (typeof name !== 'string' || !name) throw failure(400, 'Say which version to publish.');
        return sendJson(response, 200, await versions.publish(name));
      }
      return notAllowed('GET, PUT');
    }

    if (path === '/api/versions') {
      if (method === 'GET') {
        if (!isOwner) return ownersOnly();
        return sendJson(response, 200, { versions: await versions.list() });
      }
      if (method === 'POST') {
        if (!isOwner) return ownersOnly();
        const { document } = await readJson(request);
        return sendJson(response, 201, await versions.create(checkDocument(document), by));
      }
      return notAllowed('GET, POST');
    }

    const name = decodeURIComponent(path.slice('/api/versions/'.length));
    if (!path.startsWith('/api/versions/') || name === '' || name.includes('/')) {
      return sendJson(response, 404, { error: `Nothing at ${path}.` });
    }

    if (method === 'GET') {
      const version = await versions.read(name);
      // The same answer whether or not the version exists: a viewer is not told
      // which drafts there are.
      if (!isOwner && !version?.published) {
        return sendJson(response, 403, { error: 'Only the published version is open to viewers.' });
      }
      return version
        ? sendJson(response, 200, version)
        : sendJson(response, 404, { error: `There is no version "${name}".` });
    }
    if (method === 'PUT') {
      if (!isOwner) return ownersOnly();
      const { document, base } = await readJson(request);
      if (typeof base !== 'string' || Number.isNaN(Date.parse(base))) {
        throw failure(400, 'A save has to say when the version it changes was last saved.');
      }
      return sendJson(response, 200, await versions.save(name, checkDocument(document), base, by));
    }
    // Renaming is not saving, so it does not carry a `base`: it changes what
    // the version is called and nothing about what is in it.
    if (method === 'PATCH') {
      if (!isOwner) return ownersOnly();
      const { name: wanted } = await readJson(request);
      return sendJson(response, 200, await versions.rename(name, checkVersionName(wanted)));
    }
    if (method === 'DELETE') {
      if (!isOwner) return ownersOnly();
      await versions.remove(name);
      response.writeHead(204).end();
      return;
    }
    return notAllowed('GET, PUT, PATCH, DELETE');
  }

  /** How much one turn may carry: a prompt is the two formats and the map, a few tens of kilobytes. */
  const MAX_CHAT_BYTES = 1024 * 1024;
  const MAX_CHAT_MESSAGES = 40;

  // The Assistant's chat: an owner's messages relayed to the model, and the
  // model's text relayed back. The page wrote the prompt and will check the
  // reply; all this adds is a key the browser never holds.
  async function handleAssistant(request, response, url, who) {
    if (url.pathname !== '/api/assistant/chat') {
      return sendJson(response, 404, { error: `Nothing at ${url.pathname}.` });
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST' });
      return response.end();
    }
    if (who.role !== OWNER) return sendJson(response, 403, { error: 'Only an owner can talk to the Assistant\'s model.' });
    if (!assistant.connected) return sendJson(response, 404, { error: 'No model is connected to the Assistant.' });

    const body = await readBody(request);
    if (body === null || body.length > MAX_CHAT_BYTES) {
      throw failure(413, `A message to the Assistant must be under ${MAX_CHAT_BYTES / 1024} KB.`);
    }
    let turn;
    try {
      turn = JSON.parse(body.toString('utf8'));
    } catch {
      throw failure(400, 'The request is not valid JSON.');
    }

    const { system, messages } = turn ?? {};
    const said = (message) => message && (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string' && message.content.trim() !== '';
    if (typeof system !== 'string' || !Array.isArray(messages) || messages.length === 0
        || messages.length > MAX_CHAT_MESSAGES || !messages.every(said)
        || messages[0].role !== 'user' || messages.at(-1).role !== 'user') {
      throw failure(400, 'A turn is a system prompt and a list of user and assistant messages, opening and closing on the user.');
    }

    // Nobody is left to read the answer once the tab has gone, so stop paying for it.
    const gone = new AbortController();
    response.on('close', () => { if (!response.writableEnded) gone.abort(); });

    const text = await assistant.chat(
      { system, messages: messages.map(({ role, content }) => ({ role, content })) },
      { signal: gone.signal },
    );
    sendJson(response, 200, { text });
  }

  /**
   * What an empty versions table starts with: the version files an older store
   * kept, so an upgrade carries its maps over; failing those, the seed's. One
   * that the app could not open is left out, and said so.
   */
  async function versionsToImport() {
    const kept = (await store.list(VERSIONS_PREFIX)).filter((object) =>
      object.key.endsWith('.json') && !object.key.slice(VERSIONS_PREFIX.length).includes('/'));

    const found = kept.length > 0
      ? await Promise.all(kept.map(async (object) => ({
        name: object.key.slice(VERSIONS_PREFIX.length, -'.json'.length),
        document: (await store.read(object.key)).body.toString('utf8'),
        lastModified: new Date(object.lastModified),
      })))
      : await readSeedVersions(seedDir, VERSIONS_PREFIX);

    return found.filter((version) => {
      try {
        checkDocument(version.document);
        return true;
      } catch (error) {
        warn(`WARNING: not importing version "${version.name}": ${error.message}`);
        return false;
      }
    });
  }

  async function handleStatic(request, response, url) {
    const path = decodeURIComponent(url.pathname).endsWith('/')
      ? `${url.pathname}index.html`
      : url.pathname;

    for (const base of bases) {
      const filePath = resolve(join(base, path));
      // A traversal is checked per base, so `..` cannot climb out of either one.
      if (filePath !== base && !filePath.startsWith(base + sep)) continue;
      try {
        const body = await readFile(filePath);
        response.writeHead(200, { 'Content-Type': contentType(filePath) });
        response.end(body);
        return;
      } catch {
        // Not in this one. A brand carries only what it overrides, so falling
        // through to the app's own copy is the ordinary case, not an error.
      }
    }

    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }

  // Seeding, then the database: waiting for it, bringing its schema up to date
  // and filling an empty versions table. It is started here and awaited by the
  // first request rather than making this function async, so that a consumer
  // can write `createDomainMapServer({...}).listen(8000)` and still never have
  // a request served out of an unprepared store.
  let seedFailure = null;
  const ready = (async () => {
    const seeded = await seedStore(store, seedDir, { skip: [VERSIONS_PREFIX] });
    for (const what of seeded) log(`Seeded ${what} into ${storageDir}`);

    await waitForDatabase(pool, { log });
    const { applied, imported } = await withLock(pool, async (client) => ({
      applied: await migrate(client),
      imported: await versions.importIfEmpty(client, versionsToImport),
    }));
    for (const name of applied) log(`Applied migration ${name}`);
    if (imported.length > 0) log(`Imported ${imported.length} version${imported.length === 1 ? '' : 's'}: ${imported.join(', ')}`);
  })().catch((error) => {
    seedFailure = error;
    warn(`ERROR: ${error.message}`);
  });

  for (const warning of warnings) warn(`WARNING: ${warning}`);

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    try {
      // For probes, which have no session: `/` answers with a redirect to sign in.
      if (url.pathname === '/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }

      await ready;
      if (seedFailure) throw seedFailure;

      if (await auth.handle(request, response, url)) {
        // answered: a sign-in route, or someone who has to sign in first
      } else if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
        await handleFiles(request, response, url, identify(request));
      } else if (url.pathname.startsWith('/api/assistant/')) {
        await handleAssistant(request, response, url, identify(request));
      } else if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        await handleVersions(request, response, url, identify(request));
      } else {
        await handleStatic(request, response, url);
      }
    } catch (error) {
      if (!error.status) console.error(error);
      sendJson(response, error.status ?? 400, { error: error.message, ...(error.version && { version: error.version }) });
    }
  });

  server.on('close', () => { pool.end().catch(() => {}); });

  // What the server settled on, for a CLI that wants to print it or a test that
  // wants to assert on it.
  server.config = {
    root, brandDir, seedDir, storageDir, database: describeDatabase(databaseUrl),
    assistant: assistant.connected ? { host: assistant.host ?? null, model: assistant.model ?? null } : null,
  };
  return server;
}
