// People and roles, checked against the real server and a throwaway database:
// the administrator seeded from OWNER_EMAILS, who a sign-in turns out to be,
// what each role may do and how soon a change applies, a person added by
// email ahead of their first sign-in, more than one administrator and never
// none, someone taken off the list with their sandbox, the development bypass
// being whoever it says, and the script for the day every administrator has
// gone.
//   docker compose up -d postgres
//   node tests/people.test.mjs

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { seal } from '../scripts/auth.mjs';
import { atLeast, readOwners, roleOf } from '../scripts/roles.mjs';
import { throwawayDatabase } from './support/database.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const SESSION_SECRET = 'people-test-secret';

/** First on OWNER_EMAILS: the administrator. */
const ALICE = { source: 'entra', subject: 'oid-alice', name: 'Alice Example', username: 'alice@contoso.example', email: 'alice@contoso.example', method: 'microsoft' };
/** Second on it, and matched on the email claim, whatever its case, when the sign-in name is another address. */
const BOB = { source: 'entra', subject: 'oid-bob', name: 'Bob Builder', username: 'bob.upn@contoso.example', email: 'Bob@Contoso.example', method: 'microsoft' };
/** Not on the list: a contributor on arrival. */
const CAROL = { source: 'entra', subject: 'oid-carol', name: 'Carol Chen', username: 'carol@contoso.example', method: 'microsoft' };
const DAVE = { source: 'entra', subject: 'oid-dave', name: 'Dave Dunn', username: 'dave@contoso.example', method: 'microsoft' };
/** Added by the administrator before ever signing in; the sign-in name differs in case. */
const ERIN = { source: 'entra', subject: 'oid-erin', name: 'Erin Example', username: 'Erin@Contoso.example', method: 'microsoft' };
/** A session from before sessions said which door someone came in by. */
const OLD_SESSION = { name: 'Carol Chen', username: 'carol@contoso.example', method: 'microsoft' };

const seedText = await readFile(new URL('../seed/data/versions/v1.json', import.meta.url), 'utf8');

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

// --- the pieces on their own ---

check('each role holds everything the one below it does',
  atLeast('administrator', 'publisher') && atLeast('publisher', 'contributor') && atLeast('contributor', 'viewer')
  && !atLeast('contributor', 'publisher') && !atLeast('viewer', 'contributor') && !atLeast('nobody', 'viewer'));
check('OWNER_EMAILS reads in order, case-folded, without repeats',
  JSON.stringify(readOwners(' B@x.example, a@x.example;b@x.example ')) === '["b@x.example","a@x.example"]');
check('with sign-in off whoever is there is the administrator', roleOf(null, null, { required: false }) === 'administrator');
check('nobody signed in is a viewer', roleOf(null, null, { required: true }) === 'viewer');
check('a session with no row is a viewer', roleOf({ name: 'x' }, null, { required: true }) === 'viewer');
check('and a session with one has its role', roleOf({ name: 'x' }, { role: 'publisher' }, { required: true }) === 'publisher');

// --- the real server ---

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startServer({ storage, databaseUrl, env = {} }) {
  const port = await freePort();
  const child = spawn(process.execPath, ['scripts/serve.mjs', 'app', String(port)], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      STORAGE_DIR: storage,
      PORT: String(port),
      AUTH_SESSION_SECRET: SESSION_SECRET,
      OWNER_EMAILS: 'alice@contoso.example, bob@contoso.example',
      DATABASE_URL: databaseUrl,
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

/** A request as `user` — or with a ready-made `cookie` — answering with `{ status, body, cookie }`. */
async function as(app, user, method, path, body, { cookie } = {}) {
  const response = await fetch(`${app.base}${path}`, {
    method,
    headers: {
      ...(cookie ? { cookie } : user && { cookie: cookieFor(user) }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  const set = response.headers.getSetCookie().find((one) => one.startsWith('domainmap.auth='));
  return { status: response.status, body: parsed, cookie: set?.split(';')[0] ?? null };
}

/** The script, run the way the owner would, answering with what it printed and its exit code. */
function makeAdministrator(databaseUrl, ...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/make-administrator.mjs', ...args], {
      cwd: root,
      env: { PATH: process.env.PATH, ...(databaseUrl && { DATABASE_URL: databaseUrl }) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('exit', (code) => resolve({ code, out }));
  });
}

/** One query straight at the database, for what the API rightly does not say. */
async function inDatabase(url, text, values) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query(text, values);
  } finally {
    await client.end();
  }
}

const cleanup = [];

try {
  const storage = await mkdtemp(join(tmpdir(), 'domain-map-people-'));
  const database = await throwawayDatabase('people');
  cleanup.push(() => rm(storage, { recursive: true, force: true }), () => database.drop());
  const app = await startServer({ storage, databaseUrl: database.url });
  cleanup.push(() => app.stop());

  // --- seeded from OWNER_EMAILS ---
  check('the first address is seeded as the administrator, the rest as contributors',
    app.log().includes('Seeded 2 people from OWNER_EMAILS: alice@contoso.example is the administrator, the rest are contributors'), app.log());

  const alice = await as(app, ALICE, 'GET', '/api/me');
  check('the first address signs in as the administrator, with the provider\'s name',
    alice.body.role === 'administrator' && alice.body.name === 'Alice Example' && typeof alice.body.id === 'string', JSON.stringify(alice.body));

  const seeded = (await as(app, ALICE, 'GET', '/api/people')).body.people;
  const bobRow = seeded.find((person) => person.email === 'bob@contoso.example');
  check('the list has the two, the one not signed in yet named by address and with no login',
    seeded.length === 2 && bobRow?.name === 'bob@contoso.example' && bobRow.sources.length === 0 && bobRow.lastSignedIn === null,
    JSON.stringify(seeded));
  check('and the one who has, with the door they came in by',
    seeded.find((person) => person.id === alice.body.id)?.sources.join() === 'entra');

  const bob = await as(app, BOB, 'GET', '/api/me');
  check('the second address signs in to the same row, matched on the email claim whatever its case',
    bob.body.role === 'contributor' && bob.body.id === bobRow.id && bob.body.name === 'Bob Builder', JSON.stringify(bob.body));
  await as(app, BOB, 'POST', '/api/drafts', { document: seedText });
  const counted = (await as(app, ALICE, 'GET', '/api/people')).body.people;
  check('the list says how many versions a sandbox holds, and never what',
    counted.find((person) => person.id === bob.body.id)?.drafts === 1 && counted.find((person) => person.id === alice.body.id)?.drafts === 0
    && counted.every((person) => !('versions' in person)), JSON.stringify(counted.map((person) => [person.name, person.drafts])));

  // --- who a sign-in turns out to be ---
  const carol = await as(app, CAROL, 'GET', '/api/me');
  check('someone not on the list is a contributor', carol.body.role === 'contributor' && carol.body.name === 'Carol Chen', JSON.stringify(carol.body));
  check('a session from before sessions named a door is sent to sign in again',
    (await as(app, OLD_SESSION, 'GET', '/api/me')).status === 401);

  const seen = await as(app, CAROL, 'GET', '/api/people');
  check('a contributor sees the list, by name',
    seen.status === 200 && seen.body.people.map((person) => person.name).join('|') === 'Alice Example|Bob Builder|Carol Chen',
    JSON.stringify(seen.body));
  check('but cannot change a role', (await as(app, CAROL, 'PATCH', `/api/people/${bob.body.id}`, { role: 'viewer' })).status === 403);
  check('nor add anyone', (await as(app, CAROL, 'POST', '/api/people', { email: 'x@contoso.example' })).status === 403);
  check('nor take anyone off it', (await as(app, CAROL, 'DELETE', `/api/people/${bob.body.id}`)).status === 403);

  // --- what each role may do, and how soon ---
  const toViewer = await as(app, ALICE, 'PATCH', `/api/people/${carol.body.id}`, { role: 'viewer' });
  check('the administrator makes a contributor a viewer', toViewer.status === 200 && toViewer.body.role === 'viewer', JSON.stringify(toViewer.body));
  check('which takes at once, on the session they already have', (await as(app, CAROL, 'GET', '/api/me')).body.role === 'viewer');
  check('a viewer is not shown the list', (await as(app, CAROL, 'GET', '/api/people')).status === 403);
  check('nor the versions', (await as(app, CAROL, 'GET', '/api/versions')).status === 403);
  check('but sees the published map', (await as(app, CAROL, 'GET', '/api/published')).status === 200);

  const toPublisher = await as(app, ALICE, 'PATCH', `/api/people/${bob.body.id}`, { role: 'publisher' });
  check('and makes a contributor a publisher', toPublisher.body.role === 'publisher', JSON.stringify(toPublisher.body));
  check('who can publish', (await as(app, BOB, 'PUT', '/api/published', { name: 'v1' })).status === 200);
  const dave = await as(app, DAVE, 'PUT', '/api/published', { name: 'v1' });
  check('where a contributor cannot', dave.status === 403 && /publisher/.test(dave.body.error), JSON.stringify(dave.body));
  check('the administrator can', (await as(app, ALICE, 'PUT', '/api/published', { name: 'v1' })).status === 200);

  // --- someone added ahead of their first sign-in ---
  const added = await as(app, ALICE, 'POST', '/api/people', { name: 'Erin', email: 'erin@contoso.example', role: 'publisher' });
  check('the administrator adds someone by email, with a role',
    added.status === 201 && added.body.role === 'publisher' && added.body.sources.length === 0, JSON.stringify(added.body));
  const erin = await as(app, ERIN, 'GET', '/api/me');
  check('and their first sign-in finds them, whatever the case of the address, with the provider\'s name',
    erin.body.id === added.body.id && erin.body.role === 'publisher' && erin.body.name === 'Erin Example', JSON.stringify(erin.body));
  check('the same address twice is refused', (await as(app, ALICE, 'POST', '/api/people', { email: 'ERIN@contoso.example' })).status === 409);
  check('and so is one that is no address', (await as(app, ALICE, 'POST', '/api/people', { email: 'erin' })).status === 400);
  check('nobody is set to a role that is not one', (await as(app, ALICE, 'PATCH', `/api/people/${erin.body.id}`, { role: 'boss' })).status === 400);
  const own = await as(app, ALICE, 'PATCH', `/api/people/${alice.body.id}`, { role: 'viewer' });
  check('nobody changes their own role', own.status === 409 && /another administrator/.test(own.body.error), JSON.stringify(own.body));
  check('someone who is not there is a 404',
    (await as(app, ALICE, 'PATCH', '/api/people/00000000-0000-0000-0000-000000000000', { role: 'viewer' })).status === 404
    && (await as(app, ALICE, 'PATCH', '/api/people/not-an-id', { role: 'viewer' })).status === 404);

  const frank = await as(app, ALICE, 'POST', '/api/people', { email: 'frnak@contoso.example' });
  check('someone added with no name is named by their address', frank.body.name === 'frnak@contoso.example' && frank.body.role === 'contributor');
  const corrected = await as(app, ALICE, 'PATCH', `/api/people/${frank.body.id}`, { name: 'Frank Fox', email: 'frank@contoso.example' });
  check('a typo is corrected until they have signed in', corrected.status === 200 && corrected.body.email === 'frank@contoso.example' && corrected.body.name === 'Frank Fox');
  check('after that the name and address are the sign-in\'s', (await as(app, ALICE, 'PATCH', `/api/people/${erin.body.id}`, { name: 'E' })).status === 409);

  // --- more than one administrator ---
  const second = await as(app, ALICE, 'PATCH', `/api/people/${bob.body.id}`, { role: 'administrator' });
  check('the administrator makes someone else an administrator, and stays one',
    second.status === 200 && second.body.role === 'administrator'
    && (await as(app, ALICE, 'GET', '/api/me')).body.role === 'administrator', JSON.stringify(second.body));
  check('and the new one changes a role', (await as(app, BOB, 'PATCH', `/api/people/${carol.body.id}`, { role: 'contributor' })).body.role === 'contributor');
  const newcomerAdded = await as(app, ALICE, 'POST', '/api/people', { email: 'gail@contoso.example', role: 'administrator' });
  check('someone can be added as an administrator ahead of their first sign-in',
    newcomerAdded.status === 201 && newcomerAdded.body.role === 'administrator', JSON.stringify(newcomerAdded.body));
  const stepped = await as(app, BOB, 'PATCH', `/api/people/${alice.body.id}`, { role: 'publisher' });
  check('one administrator takes another down', stepped.body.role === 'publisher', JSON.stringify(stepped.body));
  check('who from then on cannot change a role', (await as(app, ALICE, 'PATCH', `/api/people/${carol.body.id}`, { role: 'viewer' })).status === 403);
  await as(app, BOB, 'DELETE', `/api/people/${newcomerAdded.body.id}`);
  const [upOne, upTwo] = await Promise.all([
    as(app, BOB, 'PATCH', `/api/people/${alice.body.id}`, { role: 'administrator' }),
    as(app, BOB, 'PATCH', `/api/people/${erin.body.id}`, { role: 'publisher' }),
  ]);
  check('two changes at once both go through when neither is about an administrator going', upOne.status === 200 && upTwo.status === 200);
  const [down, up] = await Promise.all([
    as(app, ALICE, 'PATCH', `/api/people/${bob.body.id}`, { role: 'publisher' }),
    as(app, BOB, 'PATCH', `/api/people/${alice.body.id}`, { role: 'publisher' }),
  ]);
  const left = (await as(app, down.status === 200 ? ALICE : BOB, 'GET', '/api/people')).body.people
    .filter((person) => person.role === 'administrator');
  // The loser is refused by the store, which sees the other gone, or — when
  // the winner was quicker still — at the door, as no longer an administrator.
  check('two administrators taking each other down at once leave one of them',
    [down.status, up.status].filter((status) => status === 200).length === 1
    && [down.status, up.status].every((status) => [200, 403, 409].includes(status)) && left.length === 1,
    JSON.stringify([down.body, up.body]));
  const survivor = down.status === 200 ? ALICE : BOB;
  const other = down.status === 200 ? bob.body.id : alice.body.id;
  await as(app, survivor, 'PATCH', `/api/people/${other}`, { role: 'administrator' });
  check('and the one left makes the other an administrator again',
    (await as(app, ALICE, 'GET', '/api/me')).body.role === 'administrator' && (await as(app, BOB, 'GET', '/api/me')).body.role === 'administrator');

  // --- taking someone off the list ---
  const drafted = await as(app, CAROL, 'POST', '/api/drafts', { document: seedText });
  await as(app, CAROL, 'POST', `/api/drafts/${encodeURIComponent(drafted.body.name)}/share`, { name: 'Carol shares' });
  const before = (await as(app, ALICE, 'GET', '/api/people')).body.people.find((person) => person.id === carol.body.id);
  check('a contributor who has signed in has a sandbox with something in it', before?.drafts === 1 && before.sources.length === 1, JSON.stringify(before));
  const removed = await as(app, ALICE, 'DELETE', `/api/people/${carol.body.id}`);
  const afterRemoval = (await as(app, ALICE, 'GET', '/api/people')).body.people;
  check('an administrator takes them off the list', removed.status === 204 && !afterRemoval.some((person) => person.id === carol.body.id));
  const sandboxLeft = await inDatabase(database.url, 'select count(*)::int as count from versions where sandbox_of = $1', [carol.body.id]);
  check('and their sandbox with them', sandboxLeft.rows[0].count === 0, JSON.stringify(sandboxLeft.rows));
  const kept = (await as(app, ALICE, 'GET', '/api/versions')).body.versions?.find((version) => version.name === 'Carol shares');
  check('what they shared stays shared, with nobody as its sharer', Boolean(kept) && !kept.mine, JSON.stringify(kept));
  const back = await as(app, CAROL, 'GET', '/api/me');
  check('a sign-in they can still make comes back as someone new: a contributor, with an empty sandbox',
    back.status === 200 && back.body.id !== carol.body.id && back.body.role === 'contributor'
    && (await as(app, CAROL, 'GET', '/api/drafts')).body.versions.length === 0, JSON.stringify(back.body));
  check('someone added who never signed in is taken off as easily', (await as(app, ALICE, 'DELETE', `/api/people/${frank.body.id}`)).status === 204);
  const self = await as(app, ALICE, 'DELETE', `/api/people/${alice.body.id}`);
  check('nobody takes themselves off', self.status === 409 && /another administrator/.test(self.body.error), JSON.stringify(self.body));
  check('someone who is not there cannot be taken off', (await as(app, ALICE, 'DELETE', `/api/people/${frank.body.id}`)).status === 404);

  // --- the script, for the day every administrator has gone ---
  const rescued = await makeAdministrator(database.url, 'erin@contoso.example');
  check('the script makes someone an administrator', rescued.code === 0 && /Erin Example <erin@contoso.example> is an administrator now/.test(rescued.out), rescued.out);
  check('and they are, at their next request, with nobody else\'s role changed', (await as(app, ERIN, 'GET', '/api/me')).body.role === 'administrator'
    && (await as(app, ALICE, 'GET', '/api/me')).body.role === 'administrator');
  const again = await makeAdministrator(database.url, 'ERIN@contoso.example');
  check('running it again says so', again.code === 0 && /is an administrator already/.test(again.out), again.out);
  const newcomer = await makeAdministrator(database.url, 'zoe@contoso.example');
  check('someone not on the list is added, to sign in to the role', newcomer.code === 0 && /zoe@contoso.example <zoe@contoso.example> is an administrator now/.test(newcomer.out), newcomer.out);
  check('the script wants an address', (await makeAdministrator(database.url)).code === 2);
  check('and a database', (await makeAdministrator(null, 'zoe@contoso.example')).code === 2);

  // --- sign-in off ---
  const open = await startServer({ storage, databaseUrl: database.url, env: { AUTH_ENABLED: 'false' } });
  const local = await as(open, null, 'GET', '/api/me');
  check('with sign-in off, whoever is there is the administrator, with nobody to name and one sandbox between them',
    local.body.role === 'administrator' && local.body.name === null && typeof local.body.id === 'string', JSON.stringify(local.body));
  const listed = await as(open, null, 'GET', '/api/people');
  check('and the list still reads', listed.status === 200);
  // Whoever is there is an administrator by the config, not by a row, so the
  // rows can be taken down to the last administrator — and no further.
  const administrators = listed.body.people.filter((person) => person.role === 'administrator');
  const answers = [];
  for (const person of administrators) {
    answers.push(await as(open, null, 'PATCH', `/api/people/${person.id}`, { role: 'publisher' }));
  }
  check('the last administrator on the list stays one',
    administrators.length > 1 && answers.slice(0, -1).every((answer) => answer.status === 200)
    && answers.at(-1).status === 409 && /only administrator/.test(answers.at(-1).body.error), JSON.stringify(answers.map((answer) => answer.body)));
  check('and is not taken off the list either',
    (await as(open, null, 'DELETE', `/api/people/${administrators.at(-1).id}`)).status === 409);
  await open.stop();

  // --- the development bypass, on an empty list ---
  const fresh = await throwawayDatabase('bypass');
  cleanup.push(() => fresh.drop());
  const dev = await startServer({ storage, databaseUrl: fresh.url, env: { NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true', OWNER_EMAILS: '' } });
  cleanup.push(() => dev.stop());
  check('with nobody listed, the server says at startup that nobody is the administrator yet',
    dev.log().includes('Nobody is the administrator yet'), dev.log());

  const pat = await as(dev, null, 'POST', '/auth/login/dev', { name: 'Pat', role: 'viewer' });
  const patMe = await as(dev, null, 'GET', '/api/me', undefined, { cookie: pat.cookie });
  check('the first person through the bypass is the administrator, whatever role they asked for',
    pat.status === 200 && patMe.body.role === 'administrator' && patMe.body.name === 'Pat', JSON.stringify(patMe.body));
  const sam = await as(dev, null, 'POST', '/auth/login/dev', { name: 'Sam', role: 'publisher' });
  const samMe = await as(dev, null, 'GET', '/api/me', undefined, { cookie: sam.cookie });
  check('the next is whoever they say, with the role they ask for', samMe.body.role === 'publisher' && samMe.body.name === 'Sam', JSON.stringify(samMe.body));
  const samAgain = await as(dev, null, 'POST', '/auth/login/dev', { name: 'Sam', role: 'administrator' });
  check('the same name signs in as the same person, and asking to administer makes them an administrator too',
    (await as(dev, null, 'GET', '/api/me', undefined, { cookie: samAgain.cookie })).body.id === samMe.body.id
    && (await as(dev, null, 'GET', '/api/me', undefined, { cookie: samAgain.cookie })).body.role === 'administrator'
    && (await as(dev, null, 'GET', '/api/me', undefined, { cookie: pat.cookie })).body.role === 'administrator');
  const patAgain = await as(dev, null, 'POST', '/auth/login/dev', { name: 'Pat', role: 'viewer' });
  check('with another administrator there, asking for less is having it',
    (await as(dev, null, 'GET', '/api/me', undefined, { cookie: patAgain.cookie })).body.role === 'viewer');
  const plain = await as(dev, null, 'POST', '/auth/login/dev');
  const plainMe = await as(dev, null, 'GET', '/api/me', undefined, { cookie: plain.cookie });
  check('with nothing said, the bypass is the stock developer, a contributor',
    plainMe.body.name === 'Developer (bypass)' && plainMe.body.role === 'contributor', JSON.stringify(plainMe.body));
} finally {
  for (const step of cleanup.reverse()) await step().catch((error) => console.error(error.message));
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
