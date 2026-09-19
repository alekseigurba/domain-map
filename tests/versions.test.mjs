// Versions and roles, checked against the real server and a throwaway database:
// what an owner and a viewer may each do, how a new version is named, a save
// that lost a race, the published version's guard, the old versions folder in
// the file store, and a store from before versions moved into Postgres.
//   docker compose up -d postgres
//   node tests/versions.test.mjs

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { seal } from '../scripts/auth.mjs';
import { throwawayDatabase } from './support/database.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const SESSION_SECRET = 'versions-test-secret';
const OWNER = { name: 'Olivia Owner', username: 'olivia@contoso.example', method: 'microsoft' };
// Owners are matched on the email claim too, when the sign-in name is something else.
const OWNER_BY_EMAIL = { name: 'Oscar', username: 'oscar.upn@contoso.example', email: 'Oscar@Contoso.example', method: 'microsoft' };
const VIEWER = { name: 'Victor Viewer', username: 'victor@contoso.example', method: 'microsoft' };

const seedText = await readFile(new URL('../seed/data/versions/v1.json', import.meta.url), 'utf8');
const seedMap = JSON.parse(seedText);
/** A map the app would open, and a variation on it, so two saves differ. */
const mapText = (title = 'A map') => `${JSON.stringify({ ...seedMap, title }, null, 2)}\n`;

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

/** The server on `storage` and `databaseUrl`, answering once it has finished starting up. */
async function startServer({ storage, databaseUrl, env = {} }) {
  const port = await freePort();
  const child = spawn(process.execPath, ['scripts/serve.mjs', 'app', String(port)], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      STORAGE_DIR: storage,
      PORT: String(port),
      AUTH_SESSION_SECRET: SESSION_SECRET,
      OWNER_EMAILS: 'olivia@contoso.example, oscar@contoso.example',
      ...(databaseUrl && { DATABASE_URL: databaseUrl }),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  const exited = new Promise((resolve) => child.on('exit', resolve));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The server did not start:\n${log}`)), 10_000);
    const listen = (chunk) => {
      log += chunk;
      if (log.includes('Serving')) { clearTimeout(timer); resolve(); }
    };
    child.stdout.on('data', listen);
    child.stderr.on('data', listen);
    child.on('exit', (code) => { clearTimeout(timer); reject(Object.assign(new Error(`exited with ${code}`), { log })); });
  });
  const base = `http://localhost:${port}`;
  // Startup finishes on the first request: seeding, migrations, the import.
  await fetch(`${base}/health`);
  await fetch(`${base}/login.html`);
  return {
    base,
    log: () => log,
    async stop() {
      child.kill();
      await exited;
    },
  };
}

const cookieFor = (user) =>
  `domainmap.auth=${seal(SESSION_SECRET, { ...user, iat: Date.now(), exp: Date.now() + 3_600_000 })}`;

/** A request as `user`, answering with `{ status, body }`. */
async function as(app, user, method, path, body) {
  const response = await fetch(`${app.base}${path}`, {
    method,
    headers: {
      ...(user && { cookie: cookieFor(user) }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, body: parsed };
}

const cleanup = [];

try {
  // --- a fresh store and an empty database ---
  const storage = await mkdtemp(join(tmpdir(), 'domain-map-versions-'));
  const database = await throwawayDatabase('versions');
  cleanup.push(() => rm(storage, { recursive: true, force: true }), () => database.drop());
  let app = await startServer({ storage, databaseUrl: database.url });

  check('the schema is applied on first start', app.log().includes('Applied migration 001-versions.sql'), app.log());
  check('and the seed map is imported into it', app.log().includes('Imported 1 version: v1'), app.log());

  const stranger = await as(app, null, 'GET', '/api/published');
  check('nobody signed in gets nothing', stranger.status === 401);

  const ownerMe = await as(app, OWNER, 'GET', '/api/me');
  const emailMe = await as(app, OWNER_BY_EMAIL, 'GET', '/api/me');
  const viewerMe = await as(app, VIEWER, 'GET', '/api/me');
  check('an address on OWNER_EMAILS is an owner', ownerMe.body.role === 'owner', JSON.stringify(ownerMe.body));
  check('so is an email claim on it, whatever its case', emailMe.body.role === 'owner', JSON.stringify(emailMe.body));
  check('anyone else is a viewer', viewerMe.body.role === 'viewer' && viewerMe.body.name === 'Victor Viewer');

  const published = await as(app, VIEWER, 'GET', '/api/published');
  check('a viewer sees the published version',
    published.status === 200 && published.body.name === 'v1' && published.body.published === true);
  check('word for word as the seed has it', published.body.document === seedText);

  // --- what a viewer may not do ---
  check('a viewer cannot list the versions', (await as(app, VIEWER, 'GET', '/api/versions')).status === 403);
  check('a viewer can open the published one by name',
    (await as(app, VIEWER, 'GET', '/api/versions/v1')).status === 200);
  check('but is not told whether any other exists',
    (await as(app, VIEWER, 'GET', '/api/versions/no-such-version')).status === 403);
  check('a viewer cannot save a new version',
    (await as(app, VIEWER, 'POST', '/api/versions', { document: mapText() })).status === 403);
  check('nor save over one', (await as(app, VIEWER, 'PUT', '/api/versions/v1',
    { document: mapText(), base: published.body.updatedAt })).status === 403);
  check('nor rename one', (await as(app, VIEWER, 'PATCH', '/api/versions/v1', { name: 'mine' })).status === 403);
  check('nor delete one', (await as(app, VIEWER, 'DELETE', '/api/versions/v1')).status === 403);
  check('nor publish one', (await as(app, VIEWER, 'PUT', '/api/published', { name: 'v1' })).status === 403);
  check('nor write to the file store', (await as(app, VIEWER, 'PUT', '/api/files/data/settings.json', '{}')).status === 403);

  // --- the old versions folder in the file store ---
  const listing = await as(app, OWNER, 'GET', '/api/files?prefix=data/');
  check('the file store lists no versions',
    listing.status === 200 && !listing.body.objects.some((object) => object.key.startsWith('data/versions/')),
    JSON.stringify(listing.body));
  check('the seed put none there either', !(await stat(join(storage, 'data', 'versions')).catch(() => null)));
  await mkdir(join(storage, 'data', 'versions'), { recursive: true });
  await writeFile(join(storage, 'data', 'versions', 'draft.json'), mapText('A draft'));
  check('an old version file is not served, even to an owner',
    (await as(app, OWNER, 'GET', '/api/files/data/versions/draft.json')).status === 404);
  check('not by another case of the folder', (await as(app, OWNER, 'GET', '/api/files/data/Versions/draft.json')).status === 404);
  check('nor by climbing into it', (await as(app, OWNER, 'GET', '/api/files/data/icons/..%2Fversions%2Fdraft.json')).status === 404);
  check('and one cannot be written there',
    (await as(app, OWNER, 'PUT', '/api/files/data/versions/draft.json', mapText())).status === 403);

  // --- an owner's versions ---
  const first = await as(app, OWNER, 'POST', '/api/versions', { document: mapText('First') });
  check('Save as new takes the next number after the seed\'s v1',
    first.status === 201 && first.body.name === 'v2', JSON.stringify(first.body).slice(0, 200));
  check('and says who saved it',
    first.body.createdBy?.name === 'Olivia Owner' && first.body.updatedBy?.email === 'olivia@contoso.example');

  const racing = await Promise.all([1, 2, 3].map((n) => as(app, OWNER, 'POST', '/api/versions', { document: mapText(`Race ${n}`) })));
  const raced = racing.map((result) => result.body.name).sort();
  check('three at once get three names', racing.every((result) => result.status === 201)
    && JSON.stringify(raced) === JSON.stringify(['v3', 'v4', 'v5']), JSON.stringify(raced));

  check('a map the app could not open is refused',
    (await as(app, OWNER, 'POST', '/api/versions', { document: '{"domains":[{"key":""}]}' })).status === 400);
  check('and so is one that is not JSON', (await as(app, OWNER, 'POST', '/api/versions', { document: '{' })).status === 400);

  const list = await as(app, OWNER, 'GET', '/api/versions');
  check('an owner sees every version, newest first',
    list.status === 200 && list.body.versions.length === 5 && list.body.versions.at(-1).name === 'v1'
    && list.body.versions.every((version) => version.document === undefined),
    JSON.stringify(list.body.versions?.map((version) => version.name)));

  // --- saving over a version ---
  const saved = await as(app, OWNER, 'PUT', '/api/versions/v2', { document: mapText('First, again'), base: first.body.updatedAt });
  check('a save sent with the version it began from goes through',
    saved.status === 200 && saved.body.updatedAt !== first.body.updatedAt, JSON.stringify(saved.body).slice(0, 200));
  const stale = await as(app, OWNER_BY_EMAIL, 'PUT', '/api/versions/v2', { document: mapText('Oscar'), base: first.body.updatedAt });
  check('one begun from before that save is refused, saying who saved since',
    stale.status === 409 && stale.body.version?.updatedBy?.name === 'Olivia Owner'
    && stale.body.version.updatedAt === saved.body.updatedAt, JSON.stringify(stale.body));
  const kept = await as(app, OWNER, 'GET', '/api/versions/v2');
  check('and leaves the version as it was', kept.body.document === mapText('First, again'));
  check('a save has to say what it began from',
    (await as(app, OWNER, 'PUT', '/api/versions/v2', { document: mapText() })).status === 400);
  check('saving over a version that is not there is a 404', (await as(app, OWNER, 'PUT', '/api/versions/gone',
    { document: mapText(), base: first.body.updatedAt })).status === 404);

  // --- renaming ---
  // A version's name is also its address, so renaming moves it: the old name
  // stops answering and the new one starts. Nothing in the document changes,
  // and neither does when it was last saved.
  const was = list.body.versions.find((version) => version.name === 'v5');
  const renamed = await as(app, OWNER, 'PATCH', '/api/versions/v5', { name: '  Q3 planning  ' });
  check('an owner renames a version, and the name is trimmed',
    renamed.status === 200 && renamed.body.name === 'Q3 planning', JSON.stringify(renamed.body));
  check('renaming is not saving, so it leaves the times alone',
    renamed.body.updatedAt === was.updatedAt && renamed.body.createdAt === was.createdAt);
  const moved = await as(app, OWNER, 'GET', '/api/versions/Q3%20planning');
  check('it answers to the new name, document and all',
    moved.status === 200 && moved.body.document !== undefined);
  check('and the old name is gone', (await as(app, OWNER, 'GET', '/api/versions/v5')).status === 404);
  check('a name another version already has is refused',
    (await as(app, OWNER, 'PATCH', '/api/versions/Q3%20planning', { name: 'v2' })).status === 409);
  check('a blank name is refused',
    (await as(app, OWNER, 'PATCH', '/api/versions/Q3%20planning', { name: '   ' })).status === 400);
  check('and one with a slash in it, which would read as a path',
    (await as(app, OWNER, 'PATCH', '/api/versions/Q3%20planning', { name: 'drafts/q3' })).status === 400);
  check('renaming a version that is not there is a 404',
    (await as(app, OWNER, 'PATCH', '/api/versions/gone', { name: 'x' })).status === 404);
  check('and it can be named back',
    (await as(app, OWNER, 'PATCH', '/api/versions/Q3%20planning', { name: 'v5' })).body.name === 'v5');

  // --- publishing, and the published version's guard ---
  const refused = await as(app, OWNER, 'DELETE', '/api/versions/v1');
  check('the published version cannot be deleted', refused.status === 409 && /published/.test(refused.body.error), JSON.stringify(refused.body));
  const publish = await as(app, OWNER, 'PUT', '/api/published', { name: 'v2' });
  check('an owner publishes another', publish.status === 200 && publish.body.published === true);
  // The site points at the row, not at the name, so a rename cannot unpublish.
  check('renaming the published version leaves it published',
    (await as(app, OWNER, 'PATCH', '/api/versions/v2', { name: 'live' })).body.published === true);
  check('and a viewer still lands on it',
    (await as(app, VIEWER, 'GET', '/api/published')).body.name === 'live');
  await as(app, OWNER, 'PATCH', '/api/versions/live', { name: 'v2' });
  check('which is what a viewer now sees',
    (await as(app, VIEWER, 'GET', '/api/published')).body.name === 'v2');
  check('and the one before is closed to them',
    (await as(app, VIEWER, 'GET', '/api/versions/v1')).status === 403);
  check('publishing a version that is not there is a 404',
    (await as(app, OWNER, 'PUT', '/api/published', { name: 'nope' })).status === 404);
  check('once it is not published, it can be deleted',
    (await as(app, OWNER, 'DELETE', '/api/versions/v1')).status === 204);
  check('and is gone', (await as(app, OWNER, 'GET', '/api/versions/v1')).status === 404);
  check('deleting it twice is a 404', (await as(app, OWNER, 'DELETE', '/api/versions/v1')).status === 404);

  // --- a restart ---
  await app.stop();
  app = await startServer({ storage, databaseUrl: database.url });
  check('a restart applies nothing twice', !app.log().includes('Applied migration'), app.log());
  check('nor imports anything, though the store has a version file in it', !app.log().includes('Imported'), app.log());
  check('and the versions are as they were', (await as(app, OWNER, 'GET', '/api/versions')).body.versions.length === 4);
  await app.stop();

  // --- sign-in off ---
  const open = await startServer({ storage, databaseUrl: database.url, env: { AUTH_ENABLED: 'false' } });
  check('with sign-in off, everyone is an owner', (await as(open, null, 'GET', '/api/me')).body.role === 'owner');
  check('and can list the versions', (await as(open, null, 'GET', '/api/versions')).status === 200);
  const anonymous = await as(open, null, 'POST', '/api/versions', { document: mapText() });
  check('a version saved with nobody signed in has nobody to name', anonymous.status === 201 && anonymous.body.createdBy === null);
  await open.stop();

  // --- no owners named ---
  const unnamed = await startServer({ storage, databaseUrl: database.url, env: { OWNER_EMAILS: '' } });
  check('with OWNER_EMAILS empty, everyone who signs in is an owner',
    (await as(unnamed, VIEWER, 'GET', '/api/me')).body.role === 'owner');
  check('and can list the versions', (await as(unnamed, VIEWER, 'GET', '/api/versions')).status === 200);
  check('nobody signed in still gets nothing', (await as(unnamed, null, 'GET', '/api/published')).status === 401);
  check('and the server says so at startup', unnamed.log().includes('everyone who signs in is an owner'), unnamed.log());
  await unnamed.stop();

  // --- a store from before versions moved into Postgres ---
  const oldStore = await mkdtemp(join(tmpdir(), 'domain-map-upgrade-'));
  const upgraded = await throwawayDatabase('upgrade');
  cleanup.push(() => rm(oldStore, { recursive: true, force: true }), () => upgraded.drop());
  await mkdir(join(oldStore, 'data', 'versions'), { recursive: true });
  const older = join(oldStore, 'data', 'versions', 'first-draft.json');
  const newer = join(oldStore, 'data', 'versions', 'team-review.json');
  await writeFile(older, mapText('First draft'));
  await writeFile(newer, mapText('Team review'));
  await writeFile(join(oldStore, 'data', 'versions', 'broken.json'), '{ not json');
  await utimes(older, new Date('2026-01-01T10:00:00Z'), new Date('2026-01-01T10:00:00Z'));
  await utimes(newer, new Date('2026-03-01T10:00:00Z'), new Date('2026-03-01T10:00:00Z'));

  const upgrade = await startServer({ storage: oldStore, databaseUrl: upgraded.url });
  const imported = (await as(upgrade, OWNER, 'GET', '/api/versions')).body.versions ?? [];
  check('an upgrade imports the store\'s versions rather than the seed\'s',
    JSON.stringify(imported.map((version) => version.name).sort()) === '["first-draft","team-review"]',
    JSON.stringify(imported.map((version) => version.name)));
  check('keeping when each was saved', imported.find((version) => version.name === 'first-draft')?.updatedAt === '2026-01-01T10:00:00.000Z');
  check('and publishes the newest', (await as(upgrade, VIEWER, 'GET', '/api/published')).body.name === 'team-review');
  check('it says which it could not open', /not importing version "broken"/.test(upgrade.log()), upgrade.log());
  check('and leaves the files where they were', Boolean(await stat(older).catch(() => null)));
  const numbered = await as(upgrade, OWNER, 'POST', '/api/versions', { document: mapText('Next') });
  check('names that are not numbers are counted out, so the first new one is v1',
    numbered.status === 201 && numbered.body.name === 'v1', JSON.stringify(numbered.body).slice(0, 120));
  await upgrade.stop();

  // --- no database ---
  try {
    await startServer({ storage, databaseUrl: null, env: { DATABASE_URL: '' } });
    check('without DATABASE_URL the server does not start', false);
  } catch (error) {
    check('without DATABASE_URL the server does not start, and says why',
      /DATABASE_URL is not set/.test(error.log ?? error.message), error.log ?? error.message);
  }
} finally {
  for (const step of cleanup.reverse()) await step().catch((error) => console.error(error.message));
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
