// What a repo built on the package is promised in BRANDING.md, checked against
// the real server: pages of its own through the brand directory, routes of its
// own behind the same sign-in, and the modules it may import by name. A
// throwaway database and a scratch store, as the other server tests have.
//   docker compose up -d postgres
//   node tests/consumer.test.mjs

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { seal } from '../scripts/auth.mjs';
import { createDomainMapServer } from '../scripts/server.mjs';
import { throwawayDatabase } from './support/database.mjs';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const SESSION_SECRET = 'session-secret';
const OLIVIA = { source: 'entra', subject: 'oid-olivia', name: 'Olivia Owner', username: 'olivia@contoso.example', method: 'microsoft' };
const VICTOR = { source: 'entra', subject: 'oid-victor', name: 'Victor Viewer', username: 'victor@contoso.example', method: 'microsoft' };
const cookieFor = (user) =>
  `domainmap.auth=${seal(SESSION_SECRET, { ...user, iat: Date.now(), exp: Date.now() + 3_600_000 })}`;

const listening = (server) => new Promise((resolve) => { server.listen(0, () => resolve(server.address().port)); });

// --- the modules a consumer imports by name ---

const byName = await import('domain-map/auth');
check('the package\'s own sign-in is importable as domain-map/auth', typeof byName.createAuth === 'function');
const roles = await import('domain-map/roles');
check('and the roles as domain-map/roles, lowest first',
  roles.ROLES.join() === 'viewer,contributor,publisher,administrator' && roles.atLeast('publisher', 'contributor'));
const viewport = await import('domain-map/app/js/viewport.js');
check('and the pan and zoom maths through app/*', typeof viewport.fitBox === 'function');

// --- a routes option that is not one ---

let refused = null;
try {
  createDomainMapServer({ routes: ['not a function'], databaseUrl: 'postgres://nowhere/none', log: () => {}, warn: () => {} });
} catch (error) {
  refused = error;
}
check('routes that are not functions are refused when the server is made, not on a request',
  refused instanceof TypeError && refused.message.includes('routes'), refused?.message);

const cleanup = [];
try {
  const database = await throwawayDatabase('consumer');
  const storage = await mkdtemp(join(tmpdir(), 'domain-map-consumer-'));
  const brand = await mkdtemp(join(tmpdir(), 'domain-map-consumer-brand-'));
  cleanup.push(() => rm(storage, { recursive: true, force: true }), () => rm(brand, { recursive: true, force: true }),
    () => database.drop());

  // A page the package has never heard of, and a script of its own beside it.
  await mkdir(join(brand, 'js', 'pipelines'), { recursive: true });
  await writeFile(join(brand, 'pipelines.html'), '<!doctype html><title>Pipelines</title>');
  await writeFile(join(brand, 'js', 'pipelines', 'board.js'), 'export const board = true;');

  const offered = [];
  const routes = [
    // One that only watches, and passes everything on.
    (request, response, { url }) => { offered.push(url.pathname); return false; },
    async (request, response, { url, user, who, may, json, readJson, failure }) => {
      if (url.pathname === '/api/pipelines') {
        const { person, role } = await who();
        json(response, 200, { user: user?.name ?? null, person: person?.name ?? null, role });
        return true;
      }
      if (url.pathname === '/api/pipelines/run') {
        if (!(await may('publisher'))) throw failure(403, 'Only a publisher can run a pipeline.');
        const { name } = await readJson(request);
        json(response, 201, { ran: name });
        return true;
      }
      if (url.pathname === '/api/pipelines/broken') throw failure(418, 'A teapot, not a pipeline.');
      return false;
    },
  ];

  const boot = async (env) => {
    const server = createDomainMapServer({
      databaseUrl: database.url, storageDir: storage, brandDir: brand, routes,
      env: { AUTH_SESSION_SECRET: SESSION_SECRET, OWNER_EMAILS: 'olivia@contoso.example', ...env },
      log: () => {}, warn: () => {},
    });
    const port = await listening(server);
    cleanup.push(() => new Promise((resolve) => { server.close(resolve); }));
    return (user, method, path, body) => fetch(`http://localhost:${port}${path}`, {
      method,
      redirect: 'manual',
      headers: { ...(user && { cookie: cookieFor(user) }), ...(body && { 'Content-Type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const as = await boot({});

  // --- pages of its own ---
  const page = await as(OLIVIA, 'GET', '/pipelines.html');
  check('a page only the brand carries is served', page.status === 200 && (await page.text()).includes('Pipelines'));
  const script = await as(OLIVIA, 'GET', '/js/pipelines/board.js');
  check('and so is a script of its own, as a module',
    script.status === 200 && script.headers.get('content-type').startsWith('application/javascript'));
  check('beside the package\'s own scripts, which the page can import from the same origin',
    (await as(OLIVIA, 'GET', '/js/viewport.js')).status === 200);
  const stranger = await as(null, 'GET', '/pipelines.html');
  check('a page of its own is behind sign-in like the map',
    stranger.status === 302 && stranger.headers.get('location') === '/login.html?returnUrl=%2Fpipelines.html',
    stranger.headers.get('location'));

  // --- routes of its own ---
  const mine = await as(OLIVIA, 'GET', '/api/pipelines');
  const said = await mine.json();
  check('a route answers with who is asking and what they may do',
    mine.status === 200 && said.user === 'Olivia Owner' && said.person === 'Olivia Owner' && said.role === 'administrator',
    JSON.stringify(said));
  const viewer = await (await as(VICTOR, 'GET', '/api/pipelines')).json();
  check('someone the list does not know yet is entered, as the map would, and is a contributor', viewer.role === 'contributor',
    JSON.stringify(viewer));

  offered.length = 0;
  const outsider = await as(null, 'GET', '/api/pipelines');
  check('a route is behind the same sign-in: a stranger gets the 401 the API gives', outsider.status === 401);
  check('and the route is never offered the request', offered.length === 0, JSON.stringify(offered));
  await as(null, 'GET', '/health');
  check('nor is the health probe', offered.length === 0, JSON.stringify(offered));

  const ran = await as(OLIVIA, 'POST', '/api/pipelines/run', { name: 'nightly' });
  check('a route reads a body and answers', ran.status === 201 && (await ran.json()).ran === 'nightly');
  const denied = await as(VICTOR, 'POST', '/api/pipelines/run', { name: 'nightly' });
  check('may() says no to a role below the one asked for, and a thrown failure answers with its status',
    denied.status === 403 && (await denied.json()).error.includes('publisher'));
  const teapot = await as(OLIVIA, 'GET', '/api/pipelines/broken');
  check('a failure thrown from a route is JSON with its own status',
    teapot.status === 418 && (await teapot.json()).error === 'A teapot, not a pipeline.');

  const me = await as(OLIVIA, 'GET', '/api/me');
  check('a request no route answers carries on to the package\'s own API', me.status === 200
    && (await me.json()).role === 'administrator');
  check('and to the map\'s own page', (await as(OLIVIA, 'GET', '/')).status === 200);

  // --- sign-in off ---
  const open = await boot({ AUTH_ENABLED: 'false' });
  const local = await (await open(null, 'GET', '/api/pipelines')).json();
  check('with sign-in off a route has no user, and whoever is there may do everything',
    local.user === null && local.role === 'administrator', JSON.stringify(local));
} finally {
  for (const step of cleanup.reverse()) await step().catch(() => {});
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exitCode = failures ? 1 : 0;
