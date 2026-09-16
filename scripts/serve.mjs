// The whole backend: static files for the app, and a file API for everything
// the app saves. Zero dependencies — Node's own http module serves `.mjs` with
// a JavaScript MIME type, which Python's http.server does not, and which the
// module scripts this app is built from will not run without.
//
// The API is deliberately dumb: get, put and list objects by key. It knows
// nothing about maps, versions or icons — those are naming conventions the
// frontend layers on top — so the storage behind it can be swapped for S3 or
// anything else that can do the same three things.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

import { createAuth } from './auth.mjs';
import { listObjects, readObject, writeObject } from './file-store.mjs';
import { seedStore } from './seed.mjs';

const root = resolve(process.argv[2] ?? 'app');
const storageDir = resolve(process.env.STORAGE_DIR ?? 'storage');
// What a fresh store starts life with. Not served — only copied in, once.
const seedDir = resolve(process.env.SEED_DIR ?? 'seed');
const port = Number(process.env.PORT ?? process.argv[3] ?? 8000);

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

async function handleApi(request, response, url) {
  const key = decodeURIComponent(url.pathname.slice(API_PREFIX.length).replace(/^\//, ''));

  if (request.method === 'GET' && key === '') {
    const objects = await listObjects(storageDir, url.searchParams.get('prefix') ?? '');
    sendJson(response, 200, { objects });
    return;
  }

  if (request.method === 'GET') {
    const object = await readObject(storageDir, key);
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
    sendJson(response, 200, await writeObject(storageDir, key, body));
    return;
  }

  response.writeHead(405, { Allow: 'GET, PUT' });
  response.end();
}

async function handleStatic(request, response, url) {
  const path = decodeURIComponent(url.pathname).endsWith('/')
    ? `${url.pathname}index.html`
    : url.pathname;
  const filePath = resolve(join(root, path));

  if (filePath !== root && !filePath.startsWith(root + sep)) {
    response.writeHead(400).end('Bad request');
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentType(filePath) });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

const seeded = await seedStore(storageDir, seedDir);
for (const what of seeded) console.log(`Seeded ${what} into ${storageDir}`);

// Sign-in sits in front of the files as well as the API: the page is a file,
// and the map is no more private than the page that shows it.
const auth = createAuth(process.env);
for (const warning of auth.warnings) console.warn(`WARNING: ${warning}`);

createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  try {
    // For probes, which have no session: `/` answers with a redirect to sign in.
    if (url.pathname === '/health') {
      sendJson(response, 200, { status: 'ok' });
    } else if (await auth.handle(request, response, url)) {
      // answered: a sign-in route, or someone who has to sign in first
    } else if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
      await handleApi(request, response, url);
    } else {
      await handleStatic(request, response, url);
    }
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
}).listen(port, () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
  console.log(`Storing files in ${storageDir}`);
});
