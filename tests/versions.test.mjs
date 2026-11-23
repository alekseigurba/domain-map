// Versions and roles, checked against the real server and a throwaway database:
// what a contributor, a publisher and a viewer may each do, a sandbox of one's
// own and the shared versions, how a new version is named, a save that lost a
// race, sharing and taking a copy, the published version's guard, the old
// versions folder in the file store, and a store from before versions moved
// into Postgres.
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
// The first address on OWNER_EMAILS: the administrator, who may do everything a publisher and a contributor may.
const OWNER = { source: 'entra', subject: 'oid-olivia', name: 'Olivia Owner', username: 'olivia@contoso.example', method: 'microsoft' };
// The second, matched on the email claim when the sign-in name is something else: a contributor.
const OWNER_BY_EMAIL = { source: 'entra', subject: 'oid-oscar', name: 'Oscar', username: 'oscar.upn@contoso.example', email: 'Oscar@Contoso.example', method: 'microsoft' };
// Not on the list at all: a contributor on arrival, and a viewer once the administrator says so.
const VIEWER = { source: 'entra', subject: 'oid-victor', name: 'Victor Viewer', username: 'victor@contoso.example', method: 'microsoft' };

// A seed of the tests' own: one small version, `v1`. The examples the package
// ships in `seed/` are for whoever starts it, and change — a second example
// there is a second version imported and, being the newer file, the published
// one — where every check below needs to know exactly what a fresh database
// holds.
const SEED_DIR = fileURLToPath(new URL('./support/seed', import.meta.url));
const seedText = await readFile(join(SEED_DIR, 'data/versions/v1.json'), 'utf8');
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
      SEED_DIR,
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

const names = (list) => (list ?? []).map((version) => version.name);

const cleanup = [];

try {
  // --- a fresh store and an empty database ---
  const storage = await mkdtemp(join(tmpdir(), 'domain-map-versions-'));
  const database = await throwawayDatabase('versions');
  cleanup.push(() => rm(storage, { recursive: true, force: true }), () => database.drop());
  let app = await startServer({ storage, databaseUrl: database.url });

  check('the schema is applied on first start',
    ['001-versions.sql', '002-people.sql', '003-sandboxes.sql'].every((name) => app.log().includes(`Applied migration ${name}`)), app.log());
  check('and the seed map is imported into it', app.log().includes('Imported 1 version: v1'), app.log());

  const stranger = await as(app, null, 'GET', '/api/published');
  check('nobody signed in gets nothing', stranger.status === 401);

  const ownerMe = await as(app, OWNER, 'GET', '/api/me');
  const emailMe = await as(app, OWNER_BY_EMAIL, 'GET', '/api/me');
  const viewerMe = await as(app, VIEWER, 'GET', '/api/me');
  check('the first address on OWNER_EMAILS is the administrator', ownerMe.body.role === 'administrator', JSON.stringify(ownerMe.body));
  check('the second a contributor, matched on the email claim whatever its case', emailMe.body.role === 'contributor', JSON.stringify(emailMe.body));
  check('anyone else who signs in is a contributor too',
    viewerMe.body.role === 'contributor' && viewerMe.body.name === 'Victor Viewer', JSON.stringify(viewerMe.body));
  const demoted = await as(app, OWNER, 'PATCH', `/api/people/${viewerMe.body.id}`, { role: 'viewer' });
  check('until the administrator makes them a viewer', demoted.status === 200 && demoted.body.role === 'viewer', JSON.stringify(demoted.body));
  check('which takes at once, on the session they already have', (await as(app, VIEWER, 'GET', '/api/me')).body.role === 'viewer');

  const published = await as(app, VIEWER, 'GET', '/api/published');
  check('a viewer sees the published version',
    published.status === 200 && published.body.name === 'v1' && published.body.published === true && published.body.scope === 'shared');
  check('word for word as the seed has it', published.body.document === seedText);

  // --- what a viewer may not do ---
  check('a viewer cannot list the shared versions', (await as(app, VIEWER, 'GET', '/api/versions')).status === 403);
  check('nor a sandbox', (await as(app, VIEWER, 'GET', '/api/drafts')).status === 403);
  check('a viewer can open the published one by name',
    (await as(app, VIEWER, 'GET', '/api/versions/v1')).status === 200);
  check('but is not told whether any other exists',
    (await as(app, VIEWER, 'GET', '/api/versions/no-such-version')).status === 403);
  check('a viewer cannot save a new version',
    (await as(app, VIEWER, 'POST', '/api/drafts', { document: mapText() })).status === 403);
  check('nor save over one', (await as(app, VIEWER, 'PUT', '/api/drafts/v1',
    { document: mapText(), base: published.body.updatedAt })).status === 403);
  check('nor rename one', (await as(app, VIEWER, 'PATCH', '/api/versions/v1', { name: 'mine' })).status === 403);
  check('nor delete one', (await as(app, VIEWER, 'DELETE', '/api/versions/v1')).status === 403);
  check('nor take a copy', (await as(app, VIEWER, 'POST', '/api/versions/v1/copy', {})).status === 403);
  check('nor publish one', (await as(app, VIEWER, 'PUT', '/api/published', { name: 'v1' })).status === 403);
  check('nor write to the file store', (await as(app, VIEWER, 'PUT', '/api/files/data/settings.json', '{}')).status === 403);
  check('a contributor cannot publish either', (await as(app, OWNER_BY_EMAIL, 'PUT', '/api/published', { name: 'v1' })).status === 403);

  // --- the old versions folder in the file store ---
  const listing = await as(app, OWNER, 'GET', '/api/files?prefix=data/');
  check('the file store lists no versions',
    listing.status === 200 && !listing.body.objects.some((object) => object.key.startsWith('data/versions/')),
    JSON.stringify(listing.body));
  check('the seed put none there either', !(await stat(join(storage, 'data', 'versions')).catch(() => null)));
  await mkdir(join(storage, 'data', 'versions'), { recursive: true });
  await writeFile(join(storage, 'data', 'versions', 'draft.json'), mapText('A draft'));
  check('an old version file is not served, even to the administrator',
    (await as(app, OWNER, 'GET', '/api/files/data/versions/draft.json')).status === 404);
  check('not by another case of the folder', (await as(app, OWNER, 'GET', '/api/files/data/Versions/draft.json')).status === 404);
  check('nor by climbing into it', (await as(app, OWNER, 'GET', '/api/files/data/icons/..%2Fversions%2Fdraft.json')).status === 404);
  check('and one cannot be written there',
    (await as(app, OWNER, 'PUT', '/api/files/data/versions/draft.json', mapText())).status === 403);

  // --- a sandbox of one's own ---
  const oscarFirst = await as(app, OWNER_BY_EMAIL, 'POST', '/api/drafts', { document: mapText('Oscar') });
  check('Save as new goes to the sandbox, which counts its own: the first is v1 whatever is shared',
    oscarFirst.status === 201 && oscarFirst.body.name === 'v1' && oscarFirst.body.scope === 'sandbox', JSON.stringify(oscarFirst.body).slice(0, 200));
  check('and says who saved it, as the list names them',
    oscarFirst.body.createdBy?.name === 'Oscar' && oscarFirst.body.updatedBy?.email === 'oscar@contoso.example', JSON.stringify(oscarFirst.body.createdBy));
  const first = await as(app, OWNER, 'POST', '/api/drafts', { document: mapText('First') });
  check('the same name sits in two sandboxes', first.status === 201 && first.body.name === 'v1');

  const racing = await Promise.all([1, 2, 3].map((n) => as(app, OWNER, 'POST', '/api/drafts', { document: mapText(`Race ${n}`) })));
  const raced = racing.map((result) => result.body.name).sort();
  check('three at once get three names', racing.every((result) => result.status === 201)
    && JSON.stringify(raced) === JSON.stringify(['v2', 'v3', 'v4']), JSON.stringify(raced));

  const named = await as(app, OWNER, 'POST', '/api/drafts', { document: mapText('Plan'), name: 'Q3 planning' });
  const namedAgain = await as(app, OWNER, 'POST', '/api/drafts', { document: mapText('Plan again'), name: 'Q3 planning' });
  check('a new version asked for by name takes it, and the next the name with a number after it',
    named.body.name === 'Q3 planning' && namedAgain.body.name === 'Q3 planning (2)', JSON.stringify([named.body.name, namedAgain.body.name]));
  check('a map the app could not open is refused',
    (await as(app, OWNER, 'POST', '/api/drafts', { document: '{"domains":[{"key":""}]}' })).status === 400);
  check('and so is one that is not JSON', (await as(app, OWNER, 'POST', '/api/drafts', { document: '{' })).status === 400);

  // A person's card that was moved is written beside the shape it is on, as
  // `{ key, x, y }` where a bare key stood: the server has to read that as the
  // page writes it, or a map with one moved card cannot be saved at all.
  const led = (owned) => `${JSON.stringify({
    ...seedMap,
    title: 'Led',
    version: 6,
    productRoles: [{ key: 'ada-example', title: 'Ada Example', type: 'Product lead', domains: [owned] }],
  }, null, 2)}\n`;
  const domainKey = seedMap.domains[0].key;
  const hung = await as(app, OWNER, 'POST', '/api/drafts', { document: led(domainKey), name: 'Led, hung' });
  check('a map that says who leads a domain is saved', hung.status === 201, JSON.stringify(hung.body));
  const put = await as(app, OWNER, 'POST', '/api/drafts', { document: led({ key: domainKey, x: 818, y: -89 }), name: 'Led, put' });
  check('and so is one in which their card was put somewhere', put.status === 201, JSON.stringify(put.body));
  const far = await as(app, OWNER, 'POST', '/api/drafts', { document: led({ key: domainKey, x: 9e9, y: 0 }) });
  check('one whose card is put out of reach of its shape is refused, in words that name the card',
    far.status === 400 && /ada-example/.test(far.body.error) && /within/.test(far.body.error), JSON.stringify(far.body));
  const lost = await as(app, OWNER, 'POST', '/api/drafts', { document: led({ key: 'nowhere', x: 1, y: 2 }) });
  check('and one whose card is on a domain the file does not have says which, by its key',
    lost.status === 400 && /owns domain 'nowhere'/.test(lost.body.error), JSON.stringify(lost.body));
  for (const name of ['Led, hung', 'Led, put']) await as(app, OWNER, 'DELETE', `/api/drafts/${encodeURIComponent(name)}`);
  check('and a name with a slash in it, which would read as a path',
    (await as(app, OWNER, 'POST', '/api/drafts', { document: mapText(), name: 'drafts/q3' })).status === 400);

  const mine = await as(app, OWNER, 'GET', '/api/drafts');
  check('a contributor sees their own sandbox, newest first, without the documents',
    mine.status === 200 && mine.body.versions.length === 6 && mine.body.versions.at(-1).name === 'v1'
    && mine.body.versions.every((version) => version.document === undefined && version.scope === 'sandbox'),
    JSON.stringify(names(mine.body.versions)));
  check('and nobody else\'s: a sandbox is private',
    JSON.stringify(names((await as(app, OWNER_BY_EMAIL, 'GET', '/api/drafts')).body.versions)) === '["v1"]'
    && (await as(app, OWNER_BY_EMAIL, 'GET', '/api/drafts/v2')).status === 404);
  check('the shared list is still the seed alone',
    JSON.stringify(names((await as(app, OWNER, 'GET', '/api/versions')).body.versions)) === '["v1"]');
  check('a shared version is not saved over',
    (await as(app, OWNER, 'PUT', '/api/versions/v1', { document: mapText(), base: published.body.updatedAt })).status === 405);
  check('nor is a new one saved straight into the open', (await as(app, OWNER, 'POST', '/api/versions', { document: mapText() })).status === 405);

  // --- saving over a sandbox version ---
  const saved = await as(app, OWNER, 'PUT', '/api/drafts/v1', { document: mapText('First, again'), base: first.body.updatedAt });
  check('a save sent with the version it began from goes through',
    saved.status === 200 && saved.body.updatedAt !== first.body.updatedAt, JSON.stringify(saved.body).slice(0, 200));
  const stale = await as(app, OWNER, 'PUT', '/api/drafts/v1', { document: mapText('Another tab'), base: first.body.updatedAt });
  check('one begun from before that save is refused, saying when it was saved since',
    stale.status === 409 && stale.body.version?.updatedAt === saved.body.updatedAt, JSON.stringify(stale.body));
  const kept = await as(app, OWNER, 'GET', '/api/drafts/v1');
  check('and leaves the version as it was', kept.body.document === mapText('First, again'));
  check('a save has to say what it began from',
    (await as(app, OWNER, 'PUT', '/api/drafts/v1', { document: mapText() })).status === 400);
  check('saving over a version that is not there is a 404', (await as(app, OWNER, 'PUT', '/api/drafts/gone',
    { document: mapText(), base: first.body.updatedAt })).status === 404);

  // --- renaming ---
  // A version's name is also its address, so renaming moves it: the old name
  // stops answering and the new one starts. Nothing in the document changes,
  // and neither does when it was last saved.
  const was = mine.body.versions.find((version) => version.name === 'v4');
  const renamed = await as(app, OWNER, 'PATCH', '/api/drafts/v4', { name: '  Team review  ' });
  check('a contributor renames a sandbox version, and the name is trimmed',
    renamed.status === 200 && renamed.body.name === 'Team review', JSON.stringify(renamed.body));
  check('renaming is not saving, so it leaves the times alone',
    renamed.body.updatedAt === was.updatedAt && renamed.body.createdAt === was.createdAt);
  const moved = await as(app, OWNER, 'GET', '/api/drafts/Team%20review');
  check('it answers to the new name, document and all',
    moved.status === 200 && moved.body.document !== undefined);
  check('and the old name is gone', (await as(app, OWNER, 'GET', '/api/drafts/v4')).status === 404);
  check('a name another version in the sandbox has is refused',
    (await as(app, OWNER, 'PATCH', '/api/drafts/Team%20review', { name: 'v2' })).status === 409);
  check('but the same name in another sandbox is fine',
    (await as(app, OWNER_BY_EMAIL, 'PATCH', '/api/drafts/v1', { name: 'Team review' })).body.name === 'Team review');
  check('a blank name is refused',
    (await as(app, OWNER, 'PATCH', '/api/drafts/Team%20review', { name: '   ' })).status === 400);
  check('and one with a slash in it, which would read as a path',
    (await as(app, OWNER, 'PATCH', '/api/drafts/Team%20review', { name: 'drafts/q3' })).status === 400);
  check('renaming a version that is not there is a 404',
    (await as(app, OWNER, 'PATCH', '/api/drafts/gone', { name: 'x' })).status === 404);

  // --- sharing ---
  const shared = await as(app, OWNER, 'POST', '/api/drafts/v2/share', {});
  check('a contributor shares a sandbox version: a copy among the shared ones, theirs to manage',
    shared.status === 200 && shared.body.scope === 'shared' && shared.body.name === 'v2' && shared.body.mine === true
    && shared.body.createdBy?.name === 'Olivia Owner', JSON.stringify(shared.body).slice(0, 300));
  check('the sandbox version is still there', (await as(app, OWNER, 'GET', '/api/drafts/v2')).status === 200);
  check('and the copy is what the sandbox held',
    (await as(app, OWNER, 'GET', '/api/versions/v2')).body.document === (await as(app, OWNER, 'GET', '/api/drafts/v2')).body.document);
  const before = (await as(app, OWNER, 'GET', '/api/drafts/v2')).body.updatedAt;
  await as(app, OWNER, 'PUT', '/api/drafts/v2', { document: mapText('Race 2, fixed'), base: before });
  const again = await as(app, OWNER, 'POST', '/api/drafts/v2/share', {});
  check('sharing again under the same name writes one\'s own share over',
    again.status === 200 && again.body.updatedAt !== shared.body.updatedAt
    && (await as(app, OWNER, 'GET', '/api/versions/v2')).body.document === mapText('Race 2, fixed')
    && names((await as(app, OWNER, 'GET', '/api/versions')).body.versions).filter((name) => name === 'v2').length === 1);
  const taken = await as(app, OWNER_BY_EMAIL, 'POST', '/api/drafts/Team%20review/share', { name: 'v2' });
  check('a name somebody else shared under is refused, with their name',
    taken.status === 409 && /Olivia Owner/.test(taken.body.error), JSON.stringify(taken.body));
  const asPublished = await as(app, OWNER_BY_EMAIL, 'POST', '/api/drafts/Team%20review/share', { name: 'v1' });
  check('and so is the published one\'s', asPublished.status === 409 && /published/.test(asPublished.body.error), JSON.stringify(asPublished.body));
  const under = await as(app, OWNER_BY_EMAIL, 'POST', '/api/drafts/Team%20review/share', { name: 'oscar-review' });
  check('sharing under another name is fine', under.status === 200 && under.body.name === 'oscar-review' && under.body.mine === true);
  check('sharing what is not in the sandbox is a 404', (await as(app, OWNER, 'POST', '/api/drafts/gone/share', {})).status === 404);
  const seen = (await as(app, OWNER_BY_EMAIL, 'GET', '/api/versions')).body.versions;
  check('every contributor sees the shared versions, and which are theirs',
    JSON.stringify(names(seen)) === '["oscar-review","v2","v1"]'
    && seen.find((version) => version.name === 'v2').mine === false
    && seen.find((version) => version.name === 'oscar-review').mine === true, JSON.stringify(seen.map((v) => [v.name, v.mine])));

  // --- taking a copy ---
  const copied = await as(app, OWNER_BY_EMAIL, 'POST', '/api/versions/v2/copy', {});
  check('a copy of a shared version lands in the sandbox under its name',
    copied.status === 201 && copied.body.scope === 'sandbox' && copied.body.name === 'v2'
    && copied.body.document === mapText('Race 2, fixed'), JSON.stringify(copied.body).slice(0, 200));
  check('and the next copy after it', (await as(app, OWNER_BY_EMAIL, 'POST', '/api/versions/v2/copy', {})).body.name === 'v2 (2)');
  check('a copy of nothing is a 404', (await as(app, OWNER_BY_EMAIL, 'POST', '/api/versions/gone/copy', {})).status === 404);

  // --- whose a shared version is to rename or delete ---
  check('a contributor cannot rename what somebody else shared',
    (await as(app, OWNER_BY_EMAIL, 'PATCH', '/api/versions/v2', { name: 'mine now' })).status === 403);
  check('nor delete it', (await as(app, OWNER_BY_EMAIL, 'DELETE', '/api/versions/v2')).status === 403);
  check('but renames their own', (await as(app, OWNER_BY_EMAIL, 'PATCH', '/api/versions/oscar-review', { name: 'oscar-final' })).body.name === 'oscar-final');
  check('a publisher renames anyone\'s', (await as(app, OWNER, 'PATCH', '/api/versions/oscar-final', { name: 'review' })).body.name === 'review');
  check('a name another shared version has is refused', (await as(app, OWNER, 'PATCH', '/api/versions/v2', { name: 'v1' })).status === 409);
  check('and one that is not there is a 404', (await as(app, OWNER, 'PATCH', '/api/versions/gone', { name: 'x' })).status === 404);

  // --- publishing, and the published version's guard ---
  const refused = await as(app, OWNER, 'DELETE', '/api/versions/v1');
  check('the published version cannot be deleted', refused.status === 409 && /published/.test(refused.body.error), JSON.stringify(refused.body));
  const publish = await as(app, OWNER, 'PUT', '/api/published', { name: 'review' });
  check('a publisher publishes a shared version', publish.status === 200 && publish.body.published === true);
  check('and only a shared one: a sandbox name is nothing to publish',
    (await as(app, OWNER, 'PUT', '/api/published', { name: 'Q3 planning' })).status === 404);
  // The site points at the row, not at the name, so a rename cannot unpublish.
  check('renaming the published version leaves it published',
    (await as(app, OWNER, 'PATCH', '/api/versions/review', { name: 'live' })).body.published === true);
  check('and a viewer still lands on it',
    (await as(app, VIEWER, 'GET', '/api/published')).body.name === 'live');
  check('and the one before is closed to them',
    (await as(app, VIEWER, 'GET', '/api/versions/v1')).status === 403);
  check('whoever shared the published version cannot delete it either',
    (await as(app, OWNER_BY_EMAIL, 'DELETE', '/api/versions/live')).status === 409);
  check('publishing a version that is not there is a 404',
    (await as(app, OWNER, 'PUT', '/api/published', { name: 'nope' })).status === 404);
  check('once it is not published, it can be deleted',
    (await as(app, OWNER, 'DELETE', '/api/versions/v1')).status === 204);
  check('and is gone', (await as(app, OWNER, 'GET', '/api/versions/v1')).status === 404);
  check('deleting it twice is a 404', (await as(app, OWNER, 'DELETE', '/api/versions/v1')).status === 404);
  check('a sandbox version is deleted by its owner alone',
    (await as(app, OWNER, 'DELETE', '/api/drafts/v2%20(2)')).status === 404
    && (await as(app, OWNER_BY_EMAIL, 'DELETE', '/api/drafts/v2%20(2)')).status === 204);

  // --- groups, and a version shared with fewer than everyone ---
  // In a scope of its own: the checks above have taken the short names.
  {
  const PAULA = { source: 'entra', subject: 'oid-paula', name: 'Paula Publisher', username: 'paula@contoso.example', method: 'microsoft' };
  const CARLA = { source: 'entra', subject: 'oid-carla', name: 'Carla Contributor', username: 'carla@contoso.example', method: 'microsoft' };
  const DAN = { source: 'entra', subject: 'oid-dan', name: 'Dan Draftsman', username: 'dan@contoso.example', method: 'microsoft' };
  const paula = (await as(app, PAULA, 'GET', '/api/me')).body;
  const carla = (await as(app, CARLA, 'GET', '/api/me')).body;
  const dan = (await as(app, DAN, 'GET', '/api/me')).body;
  await as(app, OWNER, 'PATCH', `/api/people/${paula.id}`, { role: 'publisher' });

  check('a contributor cannot make a group', (await as(app, OWNER_BY_EMAIL, 'POST', '/api/groups', { name: 'Reviewers' })).status === 403);
  const made = await as(app, OWNER, 'POST', '/api/groups', { name: '  Reviewers ' });
  check('an administrator makes one, by name, with nobody in it yet',
    made.status === 201 && made.body.name === 'Reviewers' && made.body.members.length === 0 && typeof made.body.id === 'string', JSON.stringify(made.body));
  const reviewers = made.body.id;
  check('one group to a name, whatever its case', (await as(app, OWNER, 'POST', '/api/groups', { name: 'reviewers' })).status === 409);
  check('and a group has to be called something', (await as(app, OWNER, 'POST', '/api/groups', { name: '   ' })).status === 400);
  const joined = await as(app, OWNER, 'PUT', `/api/groups/${reviewers}/members/${carla.id}`);
  check('an administrator puts someone from the list in it',
    joined.status === 200 && joined.body.members.map((one) => one.name).join() === 'Carla Contributor', JSON.stringify(joined.body));
  check('asked twice, they are in it once',
    (await as(app, OWNER, 'PUT', `/api/groups/${reviewers}/members/${carla.id}`)).body.members.length === 1);
  check('someone who is not on the list cannot be put in one',
    (await as(app, OWNER, 'PUT', `/api/groups/${reviewers}/members/00000000-0000-4000-8000-000000000000`)).status === 404
    && (await as(app, OWNER, 'PUT', `/api/groups/${reviewers}/members/not-an-id`)).status === 404);
  check('nor anyone into a group that is not there',
    (await as(app, OWNER, 'PUT', `/api/groups/00000000-0000-4000-8000-000000000000/members/${carla.id}`)).status === 404);
  check('a contributor cannot rename a group, fill it, empty it or delete it',
    (await as(app, CARLA, 'PATCH', `/api/groups/${reviewers}`, { name: 'Mine' })).status === 403
    && (await as(app, CARLA, 'PUT', `/api/groups/${reviewers}/members/${dan.id}`)).status === 403
    && (await as(app, CARLA, 'DELETE', `/api/groups/${reviewers}/members/${carla.id}`)).status === 403
    && (await as(app, CARLA, 'DELETE', `/api/groups/${reviewers}`)).status === 403);
  const listed = await as(app, DAN, 'GET', '/api/groups');
  check('but everyone who works on the map sees the groups and who is in each',
    listed.status === 200 && listed.body.groups.length === 1 && listed.body.groups[0].members[0].id === carla.id, JSON.stringify(listed.body));
  check('a viewer does not', (await as(app, VIEWER, 'GET', '/api/groups')).status === 403);

  const REWORK = '/api/versions/Pricing%20rework';
  await as(app, OWNER_BY_EMAIL, 'POST', '/api/drafts', { document: mapText('Pricing rework'), name: 'Pricing rework' });
  const narrow = await as(app, OWNER_BY_EMAIL, 'POST', '/api/drafts/Pricing%20rework/share', { audience: { groups: [reviewers] } });
  check('a version is shared with a group and nobody else, and says with whom',
    narrow.status === 200 && narrow.body.mine === true && narrow.body.audience?.groups[0]?.name === 'Reviewers'
    && narrow.body.audience.people.length === 0, JSON.stringify(narrow.body).slice(0, 300));
  check('one shared with everyone says so by saying nothing',
    (await as(app, OWNER, 'GET', '/api/versions/v2')).body.audience === null);
  const sees = async (user) => names((await as(app, user, 'GET', '/api/versions')).body.versions).includes('Pricing rework');
  check('someone in the group sees it, opens it and may take a copy',
    await sees(CARLA) && (await as(app, CARLA, 'GET', REWORK)).body.document === mapText('Pricing rework')
    && (await as(app, CARLA, 'POST', `${REWORK}/copy`, {})).status === 201);
  await as(app, CARLA, 'DELETE', '/api/drafts/Pricing%20rework');
  check('whoever shared it sees it', await sees(OWNER_BY_EMAIL));
  check('to someone it is not shared with it is not there: not in the list, not at its name, not to copy',
    !(await sees(DAN)) && (await as(app, DAN, 'GET', REWORK)).status === 404
    && (await as(app, DAN, 'POST', `${REWORK}/copy`, {})).status === 404);
  check('nor to a publisher, who cannot rename, delete or publish what they are not shown',
    !(await sees(PAULA)) && (await as(app, PAULA, 'GET', REWORK)).status === 404
    && (await as(app, PAULA, 'PATCH', REWORK, { name: 'Seen' })).status === 404
    && (await as(app, PAULA, 'DELETE', REWORK)).status === 404
    && (await as(app, PAULA, 'PUT', '/api/published', { name: 'Pricing rework' })).status === 404);
  check('an administrator sees every shared version, whoever it is shared with',
    await sees(OWNER) && (await as(app, OWNER, 'GET', REWORK)).status === 200);
  check('a viewer is told what a viewer is always told', (await as(app, VIEWER, 'GET', REWORK)).status === 403);

  const toDan = await as(app, OWNER_BY_EMAIL, 'PUT', `${REWORK}/audience`, { people: [dan.id] });
  check('whoever shared it says who it is shared with: a person, by name',
    toDan.status === 200 && toDan.body.audience.people[0].name === 'Dan Draftsman' && toDan.body.audience.groups.length === 0, JSON.stringify(toDan.body.audience));
  check('which takes at once: the one named sees it, and the group no longer does', await sees(DAN) && !(await sees(CARLA)));
  check('someone it is shared with cannot share it further',
    (await as(app, DAN, 'PUT', `${REWORK}/audience`, { everyone: true })).status === 403);
  check('nor can someone who cannot see it, who is told only that it is not there',
    (await as(app, PAULA, 'PUT', `${REWORK}/audience`, { everyone: true })).status === 404);
  check('who it is shared with has to be said in a form that can be read',
    (await as(app, OWNER_BY_EMAIL, 'PUT', `${REWORK}/audience`, {})).status === 400
    && (await as(app, OWNER_BY_EMAIL, 'PUT', `${REWORK}/audience`, { people: ['dan'] })).status === 400
    && (await as(app, OWNER_BY_EMAIL, 'PUT', `${REWORK}/audience`, { everyone: false })).status === 400);
  const stale = await as(app, OWNER_BY_EMAIL, 'PUT', `${REWORK}/audience`, { people: ['00000000-0000-4000-8000-000000000000'] });
  check('naming someone who is not on the list changes nothing', stale.status === 409 && await sees(DAN), JSON.stringify(stale.body));
  const both = await as(app, OWNER, 'PUT', `${REWORK}/audience`, { people: [dan.id, paula.id], groups: [reviewers] });
  check('an administrator may say it too: people and groups together',
    both.status === 200 && both.body.audience.people.length === 2 && both.body.audience.groups.length === 1
    && await sees(CARLA) && await sees(DAN) && await sees(PAULA));

  const draftNow = (await as(app, OWNER_BY_EMAIL, 'GET', '/api/drafts/Pricing%20rework')).body;
  await as(app, OWNER_BY_EMAIL, 'PUT', '/api/drafts/Pricing%20rework', { document: mapText('Pricing rework, fixed'), base: draftNow.updatedAt });
  const fixed = await as(app, OWNER_BY_EMAIL, 'POST', '/api/drafts/Pricing%20rework/share', {});
  check('shared again, a version keeps who it was shared with: a fix does not open it to everyone',
    fixed.status === 200 && fixed.body.audience?.people.length === 2 && fixed.body.audience.groups.length === 1
    && (await as(app, CARLA, 'GET', REWORK)).body.document === mapText('Pricing rework, fixed'), JSON.stringify(fixed.body.audience));
  check('unless sharing it again says otherwise',
    (await as(app, OWNER_BY_EMAIL, 'POST', '/api/drafts/Pricing%20rework/share', { audience: { groups: [reviewers] } })).body.audience.people.length === 0
    && !(await sees(DAN)));

  await as(app, OWNER, 'PUT', `${REWORK}/audience`, { people: [paula.id] });
  const held = await as(app, PAULA, 'PUT', '/api/published', { name: 'Pricing rework' });
  check('a publisher it is shared with still cannot publish it: the published map is everyone\'s',
    held.status === 409 && /everyone/.test(held.body.error) && (await as(app, VIEWER, 'GET', '/api/published')).body.name === 'live', JSON.stringify(held.body));
  const opened = await as(app, OWNER_BY_EMAIL, 'PUT', `${REWORK}/audience`, { everyone: true });
  check('shared with everyone again, everyone sees it', opened.body.audience === null && await sees(DAN) && await sees(CARLA));
  check('and it can be published', (await as(app, PAULA, 'PUT', '/api/published', { name: 'Pricing rework' })).status === 200);
  const closing = await as(app, OWNER_BY_EMAIL, 'PUT', `${REWORK}/audience`, { groups: [reviewers] });
  check('the published version cannot then be shared with fewer people',
    closing.status === 409 && /published/.test(closing.body.error) && (await as(app, DAN, 'GET', REWORK)).status === 200, JSON.stringify(closing.body));
  await as(app, OWNER, 'PUT', '/api/published', { name: 'live' });

  await as(app, OWNER_BY_EMAIL, 'PUT', `${REWORK}/audience`, { groups: [reviewers] });
  check('a group renamed is the same group, under its new name',
    (await as(app, OWNER, 'PATCH', `/api/groups/${reviewers}`, { name: 'Pricing reviewers' })).body.name === 'Pricing reviewers'
    && (await as(app, CARLA, 'GET', REWORK)).body.audience.groups[0].name === 'Pricing reviewers');
  check('someone taken out of a group no longer sees what was shared with it',
    (await as(app, OWNER, 'DELETE', `/api/groups/${reviewers}/members/${carla.id}`)).body.members.length === 0 && !(await sees(CARLA)));
  await as(app, OWNER, 'PUT', `/api/groups/${reviewers}/members/${carla.id}`);
  check('a deleted group is gone', (await as(app, OWNER, 'DELETE', `/api/groups/${reviewers}`)).status === 204
    && (await as(app, OWNER, 'GET', '/api/groups')).body.groups.length === 0);
  const orphaned = (await as(app, OWNER_BY_EMAIL, 'GET', REWORK)).body;
  check('and what was shared with it alone does not fall open to everyone: it is its sharer\'s and the administrators\'',
    orphaned.audience && orphaned.audience.groups.length === 0 && orphaned.audience.people.length === 0
    && !(await sees(CARLA)) && !(await sees(DAN)) && !(await sees(PAULA)) && await sees(OWNER), JSON.stringify(orphaned.audience));

  await as(app, OWNER_BY_EMAIL, 'PUT', `${REWORK}/audience`, { people: [dan.id] });
  await as(app, OWNER, 'DELETE', `/api/people/${dan.id}`);
  check('someone taken off the list is taken off what was shared with them',
    (await as(app, OWNER_BY_EMAIL, 'GET', REWORK)).body.audience.people.length === 0);
  check('and coming back as someone new, they are not shown it', !(await sees(DAN)));
  // Left as it was found: the lists below are counted.
  await as(app, OWNER_BY_EMAIL, 'DELETE', REWORK);
  await as(app, OWNER_BY_EMAIL, 'DELETE', '/api/drafts/Pricing%20rework');
  }

  // --- a restart ---
  await app.stop();
  app = await startServer({ storage, databaseUrl: database.url });
  check('a restart applies nothing twice', !app.log().includes('Applied migration'), app.log());
  check('nor imports anything, though the store has a version file in it', !app.log().includes('Imported'), app.log());
  check('and the versions are as they were',
    JSON.stringify(names((await as(app, OWNER, 'GET', '/api/versions')).body.versions)) === '["live","v2"]'
    && (await as(app, OWNER, 'GET', '/api/drafts')).body.versions.length === 6);
  await app.stop();

  // --- sign-in off ---
  const open = await startServer({ storage, databaseUrl: database.url, env: { AUTH_ENABLED: 'false' } });
  check('with sign-in off, whoever is there is the administrator', (await as(open, null, 'GET', '/api/me')).body.role === 'administrator');
  check('and can list the shared versions', (await as(open, null, 'GET', '/api/versions')).status === 200);
  const anonymous = await as(open, null, 'POST', '/api/drafts', { document: mapText() });
  check('a version saved with nobody signed in goes to the one local sandbox',
    anonymous.status === 201 && anonymous.body.name === 'v1' && anonymous.body.createdBy?.name === 'Local', JSON.stringify(anonymous.body).slice(0, 200));
  await open.stop();

  // --- no owners named ---
  const fresh = await throwawayDatabase('unnamed');
  cleanup.push(() => fresh.drop());
  const unnamed = await startServer({ storage, databaseUrl: fresh.url, env: { OWNER_EMAILS: '' } });
  check('with OWNER_EMAILS empty, the server says at startup that nobody is the administrator yet',
    unnamed.log().includes('Nobody is the administrator yet'), unnamed.log());
  check('and the first person to sign in becomes one', (await as(unnamed, VIEWER, 'GET', '/api/me')).body.role === 'administrator');
  check('the next a contributor', (await as(unnamed, OWNER, 'GET', '/api/me')).body.role === 'contributor');
  check('who can list the versions', (await as(unnamed, OWNER, 'GET', '/api/versions')).status === 200);
  check('nobody signed in still gets nothing', (await as(unnamed, null, 'GET', '/api/published')).status === 401);
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
  check('an upgrade imports the store\'s versions rather than the seed\'s, as shared versions of nobody\'s',
    JSON.stringify(names(imported).sort()) === '["first-draft","team-review"]'
    && imported.every((version) => version.scope === 'shared' && version.mine === false),
    JSON.stringify(imported.map((version) => [version.name, version.scope, version.mine])));
  check('keeping when each was saved', imported.find((version) => version.name === 'first-draft')?.updatedAt === '2026-01-01T10:00:00.000Z');
  check('and publishes the newest', (await as(upgrade, VIEWER, 'GET', '/api/published')).body.name === 'team-review');
  check('it says which it could not open', /not importing version "broken"/.test(upgrade.log()), upgrade.log());
  check('and leaves the files where they were', Boolean(await stat(older).catch(() => null)));
  check('a contributor cannot delete what nobody shared', (await as(upgrade, OWNER_BY_EMAIL, 'DELETE', '/api/versions/first-draft')).status === 403);
  check('a publisher can', (await as(upgrade, OWNER, 'DELETE', '/api/versions/first-draft')).status === 204);
  const numbered = await as(upgrade, OWNER, 'POST', '/api/drafts', { document: mapText('Next') });
  check('a sandbox counts its own names, so the first new one is v1',
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
