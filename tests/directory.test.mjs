// Headless check for the directory behind the name boxes: anyone in the
// organisation, looked up by name in Microsoft Graph as the app itself. Graph
// is a stand-in answering from a table, so nothing leaves the machine.
//   node tests/directory.test.mjs

import { createDirectory, searchTerms, DIRECTORY_KEEP_MS } from '../scripts/directory.mjs';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};
const show = (value) => JSON.stringify(value);

const ENV = { AUTH_TENANT_ID: 'tenant', AUTH_CLIENT_ID: 'client', AUTH_CLIENT_SECRET: 'secret' };
const GRAPH = 'https://graph.example';
const PEOPLE = [
  { id: 'u-jenny', displayName: 'Atmer, Jenny', mail: 'jenny.atmer@example.com' },
  { id: 'u-ola', displayName: 'Berg, Ola', mail: null, userPrincipalName: 'ola.berg@example.com' },
  { id: 'u-jens', displayName: 'Jensen, Kari', mail: 'kari.jensen@example.com' },
];

/** A stand-in Graph: a token endpoint, and /users answering a $search the way Graph reads one. */
function standIn({ refuse = false } = {}) {
  const asked = [];
  const fetch = async (url, init = {}) => {
    asked.push({ url, init });
    const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
    if (url.startsWith('https://login.microsoftonline.com/tenant/oauth2/v2.0/token')) {
      const form = new URLSearchParams(init.body);
      return form.get('grant_type') === 'client_credentials' && form.get('scope') === 'https://graph.microsoft.com/.default'
        ? reply(200, { access_token: 'token', expires_in: 3600 })
        : reply(400, { error: 'invalid_request' });
    }
    if (init.headers?.Authorization !== 'Bearer token') return reply(401, { error: { message: 'No token' } });
    if (refuse) return reply(403, { error: { message: 'Insufficient privileges to complete the operation' } });
    const at = new URL(url);
    if (at.origin + at.pathname !== `${GRAPH}/users`) return reply(404, { error: { message: 'Nothing there' } });
    if (init.headers?.ConsistencyLevel !== 'eventual') return reply(400, { error: { message: 'Request with $search requires ConsistencyLevel eventual' } });
    // Every word has to start the name or the address, or a word in either.
    const words = [...at.searchParams.get('$search').matchAll(/"displayName:([^"]+)"/g)].map((m) => m[1].toLowerCase());
    const starts = (text, word) => {
      const said = String(text ?? '').toLowerCase();
      return said.startsWith(word) || said.split(/[\s,.@]+/).some((part) => part.startsWith(word));
    };
    const value = PEOPLE.filter((user) => words.every((word) =>
      starts(user.displayName, word) || starts(user.mail, word) || starts(user.userPrincipalName, word)));
    return reply(200, { value: value.slice(0, Number(at.searchParams.get('$top'))) });
  };
  return { fetch, asked };
}

// --- what is asked ---
check('each word typed is a term of its own, matched against the name and both addresses',
  searchTerms('jenny atm') === '("displayName:jenny" OR "mail:jenny" OR "userPrincipalName:jenny") AND '
    + '("displayName:atm" OR "mail:atm" OR "userPrincipalName:atm")', searchTerms('jenny atm'));
check('nothing typed can close the quotes it is put in', !searchTerms('a"b\\c').includes('a"b') && searchTerms('a"b').includes('"displayName:a"'));

// --- on and off ---
check('without Microsoft sign-in there is no directory', createDirectory({}).enabled === false);
check('AUTH_DIRECTORY=false turns it off where sign-in is set up', createDirectory({ ...ENV, AUTH_DIRECTORY: 'false' }).enabled === false);
check('and it is on by itself where it is', createDirectory(ENV).enabled === true);
const off = await createDirectory({}).search('jenny');
check('one that is off finds nobody, and says so', off.enabled === false && off.people.length === 0);

// --- looking someone up ---
let clock = 1_000_000;
const graph = standIn();
const warned = [];
const directory = createDirectory(ENV, { graph: GRAPH, fetch: graph.fetch, warn: (line) => warned.push(line), now: () => clock });
const jen = await directory.search('Jen');
check('a few letters find everyone whose name starts a word with them, by name',
  show(jen.people.map((one) => one.name)) === show(['Atmer, Jenny', 'Jensen, Kari']), show(jen.people));
check('each with their address, and the id Entra knows them by',
  jen.people[0].email === 'jenny.atmer@example.com' && jen.people[0].subject === 'u-jenny');
const ola = await directory.search('ola.berg');
check('an address finds them too, and is their sign-in name where they have no mail',
  ola.people.length === 1 && ola.people[0].email === 'ola.berg@example.com', show(ola.people));
check('two words narrow it, in either order', show((await directory.search('jenny atmer')).people.map((one) => one.name)) === show(['Atmer, Jenny']));
const searched = graph.asked.filter(({ url }) => url.includes('/users'));
check('Graph is told an eventually consistent index will do, as $search needs',
  searched.every(({ init }) => init.headers.ConsistencyLevel === 'eventual'));
check('and asked for a short list of names and addresses only',
  searched.every(({ url }) => new URL(url).searchParams.get('$top') === '15'
    && new URL(url).searchParams.get('$select') === 'id,displayName,mail,userPrincipalName'));

const asked = graph.asked.length;
await directory.search('JEN');
check('the same letters asked again are answered from what was found', graph.asked.length === asked);
clock += DIRECTORY_KEEP_MS + 1;
await directory.search('jen');
check('until a few minutes have passed', graph.asked.length > asked);
check('one token serves every look-up until it runs out',
  graph.asked.filter(({ url }) => url.includes('/oauth2/')).length === 1);

const tooShort = await directory.search('j ');
check('one letter is not asked about', tooShort.people.length === 0 && !graph.asked.some(({ url }) => url.includes('displayName%3Aj%22')));
check('nothing went wrong, and nothing was warned about', jen.error === null && warned.length === 0);

// --- refused ---
const refusing = standIn({ refuse: true });
const refusedWarnings = [];
let later = 0;
const refused = createDirectory(ENV, { graph: GRAPH, fetch: refusing.fetch, warn: (line) => refusedWarnings.push(line), now: () => later });
const nobody = await refused.search('jenny');
check('Graph refusing finds nobody rather than failing the page', nobody.enabled === true && nobody.people.length === 0);
check('and says what went wrong', /Insufficient privileges/.test(nobody.error ?? ''), nobody.error);
check('the warning names the permission to grant',
  refusedWarnings.length === 1 && refusedWarnings[0].includes('User.ReadBasic.All') && refusedWarnings[0].includes('application permission'),
  refusedWarnings[0]);
const triedOnce = refusing.asked.length;
await refused.search('jenny a');
await refused.search('ola');
check('it leaves Graph alone for a while after a refusal, however much is typed', refusing.asked.length === triedOnce);
later += 6 * 60 * 1000;
await refused.search('ola');
check('and asks again five minutes on, without warning twice about the same thing',
  refusing.asked.length > triedOnce && refusedWarnings.length === 1);

console.log(failures === 0 ? '\nAll directory checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
