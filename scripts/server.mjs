// The server as a library: static files for the app, a file API for everything
// the app saves, and sign-in in front of both. `scripts/serve.mjs` is the CLI
// over this; another repo installs the package and calls it directly.
//
// Everything a consumer is meant to change is a parameter. `brandDir` shadows
// the app's own files, `seedDir` decides what a fresh store starts life with,
// and `store` and `auth` can be replaced outright. Crucially, the defaults that
// belong to the package resolve against this module rather than the working
// directory, so an install under node_modules still finds its own `app/` and
// `seed/` — see BRANDING.md for which of these a consumer is expected to set.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAuth } from './auth.mjs';
import { fileStore } from './file-store.mjs';
import { seedStore } from './seed.mjs';

/** A path inside the package, wherever the package has been installed. */
const packagePath = (path) => fileURLToPath(new URL(path, import.meta.url));

/** Generous, and only about memory: what counts as a sane icon is rules.js's. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

const API_PREFIX = '/api/files';

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
 * @param {object}   [options.store]      A `{ read, write, list }` of your own — S3, say.
 * @param {object}   [options.auth]       A `{ handle, warnings }` of your own, for a provider
 *                                        that is not Entra ID.
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

  // Where a static request is looked for, in order: the brand's copy of a file
  // wins over the app's own, and a brand that has nothing to say about a file
  // simply does not carry it.
  const bases = brandDir ? [brandDir, root] : [root];

  async function handleApi(request, response, url) {
    const key = decodeURIComponent(url.pathname.slice(API_PREFIX.length).replace(/^\//, ''));

    if (request.method === 'GET' && key === '') {
      sendJson(response, 200, { objects: await store.list(url.searchParams.get('prefix') ?? '') });
      return;
    }

    if (request.method === 'GET') {
      const object = await store.read(key);
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
      if (key === '') return sendJson(response, 400, { error: 'A key is needed to write to.' });
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

  // Seeding is a read and a few writes. It is started here and awaited by the
  // first request rather than making this function async, so that a consumer
  // can write `createDomainMapServer({...}).listen(8000)` and still never have
  // a request served out of an unseeded store.
  let seedFailure = null;
  const ready = seedStore(store, seedDir)
    .then((seeded) => { for (const what of seeded) log(`Seeded ${what} into ${storageDir}`); })
    .catch((error) => { seedFailure = error; });

  for (const warning of auth.warnings) warn(`WARNING: ${warning}`);

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
        await handleApi(request, response, url);
      } else {
        await handleStatic(request, response, url);
      }
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
  });

  // What the server settled on, for a CLI that wants to print it or a test that
  // wants to assert on it.
  server.config = { root, brandDir, seedDir, storageDir };
  return server;
}
