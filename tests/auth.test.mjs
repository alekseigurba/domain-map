// Sign-in, checked against the real server: the gate, the development bypass,
// and the whole Entra ID code flow against a stand-in for Entra that issues
// signed ID tokens. No tenant needed, and nothing the project stores is touched.
//   node tests/auth.test.mjs

import { spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readConfig, safeReturnUrl, seal, unseal } from '../scripts/auth.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

// --- the pieces on their own ---

check('only an explicit false turns sign-in off',
  readConfig({ AUTH_ENABLED: 'false' }).enabled === false
  && readConfig({ AUTH_ENABLED: '' }).enabled === true
  && readConfig({ AUTH_ENABLED: 'flase' }).enabled === true);
check('the bypass needs NODE_ENV=development',
  readConfig({ AUTH_DEV_BYPASS: 'true' }).bypass === false
  && readConfig({ AUTH_DEV_BYPASS: 'true', NODE_ENV: 'production' }).bypass === false
  && readConfig({ AUTH_DEV_BYPASS: 'true', NODE_ENV: 'development' }).bypass === true);
const half = readConfig({ AUTH_TENANT_ID: 't', AUTH_CLIENT_ID: 'c' });
check('Microsoft sign-in needs the secret too, and says so',
  half.microsoft === false && half.warnings.some((w) => w.includes('AUTH_CLIENT_SECRET')), half.warnings.join(' | '));

const sealed = seal('secret', { name: 'A', exp: Date.now() + 60_000 });
check('a sealed value opens with its secret', unseal('secret', sealed)?.name === 'A');
check('and not with another', unseal('other', sealed) === null);
check('a tampered value does not open',
  unseal('secret', `${Buffer.from('{"name":"B","exp":9999999999999}').toString('base64url')}.${sealed.split('.')[1]}`) === null);
check('an expired value does not open', unseal('secret', seal('secret', { exp: Date.now() - 1 })) === null);
check('garbage does not open', unseal('secret', 'a.b.c') === null && unseal('secret', undefined) === null);

check('a path in this app is a return address', safeReturnUrl('/#/domain/x') === '/#/domain/x');
for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', null]) {
  check(`${bad} is not`, safeReturnUrl(bad) === '/');
}

// --- a stand-in for Entra ID ---

const TENANT = '11111111-2222-3333-4444-555555555555';
const CLIENT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CLIENT_SECRET = 'client-secret';
const SESSION_SECRET = 'session-secret';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const { privateKey: strangerKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });

const jwt = (claims, key) => {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT', kid: 'k1' })}.${part(claims)}`;
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), key).toString('base64url')}`;
};

/** Codes "issued" at the authorize step, which the test plays itself. */
const grants = new Map();
/** How the next token should be wrong, if at all. */
let tamper = null;
let entraBase = '';
let issuer = '';

const entra = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const json = (status, body) => {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(body));
  };

  if (url.pathname === `/${TENANT}/v2.0/.well-known/openid-configuration`) {
    return json(200, {
      issuer,
      authorization_endpoint: `${entraBase}/${TENANT}/oauth2/v2.0/authorize`,
      token_endpoint: `${entraBase}/${TENANT}/oauth2/v2.0/token`,
      jwks_uri: `${entraBase}/${TENANT}/discovery/v2.0/keys`,
    });
  }
  if (url.pathname === `/${TENANT}/discovery/v2.0/keys`) {
    return json(200, { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' }] });
  }
  if (url.pathname === `/${TENANT}/oauth2/v2.0/token` && request.method === 'POST') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const form = new URLSearchParams(body);
    const grant = grants.get(form.get('code'));
    grants.delete(form.get('code'));
    const challenge = createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url');
    if (!grant || form.get('client_id') !== CLIENT || form.get('client_secret') !== CLIENT_SECRET
        || form.get('redirect_uri') !== grant.redirectUri || challenge !== grant.challenge) {
      return json(400, { error: 'invalid_grant', error_description: 'AADSTS70008: The grant is not valid.' });
    }
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: issuer, aud: tamper === 'aud' ? 'another-app' : CLIENT, tid: TENANT,
      iat: now, nbf: now, exp: now + 3600, nonce: grant.nonce,
      name: 'Alice Example', preferred_username: 'alice@contoso.example',
    };
    return json(200, { token_type: 'Bearer', id_token: jwt(claims, tamper === 'signature' ? strangerKey : privateKey) });
  }
  json(404, {});
});
await new Promise((resolve) => entra.listen(0, resolve));
entraBase = `http://localhost:${entra.address().port}`;
issuer = `${entraBase}/${TENANT}/v2.0`;

// --- the real server ---

async function freePort() {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function startServer(env) {
  const port = await freePort();
  const storage = await mkdtemp(join(tmpdir(), 'domain-map-auth-'));
  const child = spawn(process.execPath, ['scripts/serve.mjs', 'app', String(port)], {
    cwd: root,
    env: { PATH: process.env.PATH, STORAGE_DIR: storage, PORT: String(port), ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The server did not start:\n${log}`)), 10_000);
    const listen = (chunk) => {
      log += chunk;
      if (log.includes('Serving')) { clearTimeout(timer); resolve(); }
    };
    child.stdout.on('data', listen);
    child.stderr.on('data', listen);
    child.on('exit', (code) => reject(new Error(`The server exited with ${code}:\n${log}`)));
  });
  return {
    base: `http://localhost:${port}`,
    port,
    log: () => log,
    async stop() {
      child.kill();
      await rm(storage, { recursive: true, force: true });
    },
  };
}

/** The cookies a response set, as a Cookie header; cleared ones left out. */
const cookiesFrom = (response) => response.headers.getSetCookie()
  .map((cookie) => cookie.split(';')[0])
  .filter((pair) => !pair.endsWith('='))
  .join('; ');

const get = (app, path, headers = {}) => fetch(`${app.base}${path}`, { redirect: 'manual', headers });
const post = (app, path, headers = {}) => fetch(`${app.base}${path}`, { method: 'POST', redirect: 'manual', headers });

/** Start a Microsoft sign-in and play Entra's part up to handing back a code. */
async function authorize(app, returnUrl = '/', headers = {}) {
  const start = await get(app, `/auth/login/microsoft?returnUrl=${encodeURIComponent(returnUrl)}`, headers);
  const location = new URL(start.headers.get('location'));
  const code = randomUUID();
  grants.set(code, {
    nonce: location.searchParams.get('nonce'),
    challenge: location.searchParams.get('code_challenge'),
    redirectUri: location.searchParams.get('redirect_uri'),
  });
  return { start, location, code, state: location.searchParams.get('state'), cookie: cookiesFrom(start) };
}

const callback = (app, cookie, query) => get(app, `/signin-oidc?${new URLSearchParams(query)}`, { cookie });

const apps = [];
try {
  // --- Entra ID configured, in production, with a bypass someone tried to switch on ---
  const app = await startServer({
    NODE_ENV: 'production',
    AUTH_DEV_BYPASS: 'true',
    AUTH_INSTANCE: entraBase,
    AUTH_TENANT_ID: TENANT,
    AUTH_CLIENT_ID: CLIENT,
    AUTH_CLIENT_SECRET: CLIENT_SECRET,
    AUTH_SESSION_SECRET: SESSION_SECRET,
  });
  apps.push(app);

  check('the log says the bypass was refused', app.log().includes('AUTH_DEV_BYPASS is ignored'), app.log());
  check('/health answers without a session', (await get(app, '/health')).status === 200);

  const page = await get(app, '/');
  check('the page sends a stranger to sign in',
    page.status === 302 && page.headers.get('location') === '/login.html?returnUrl=%2F', page.headers.get('location'));
  const api = await get(app, '/api/files?prefix=data/');
  check('the API answers a stranger with 401', api.status === 401 && (await api.json()).error);
  check('so does a stored map', (await get(app, '/api/files/data/versions/bnpl-example.json')).status === 401);
  check('and the app\'s own scripts', (await get(app, '/js/main.js')).status === 302);

  for (const path of ['/login.html', '/js/login.js', '/css/login.css', '/css/tokens.css', '/css/fonts.css',
    '/fonts/poppins-400-latin.woff2', '/favicon.svg', '/api/files/data/settings.json']) {
    check(`${path} loads before signing in`, (await get(app, path)).status === 200);
  }
  check('the stored branding cannot be written without a session',
    (await fetch(`${app.base}/api/files/data/settings.json`, { method: 'PUT', body: '{}' })).status === 401);
  check('a public prefix does not open a private file by ..',
    (await get(app, '/fonts/..%2Findex.html')).status === 302
    && (await get(app, '/api/files/data/brand/..%2Fversions%2Fbnpl-example.json')).status === 401);

  const anonymous = await (await get(app, '/auth/me')).json();
  check('/auth/me offers Microsoft and not the bypass',
    anonymous.required && !anonymous.authenticated && anonymous.options.microsoft && !anonymous.options.bypass,
    JSON.stringify(anonymous));
  check('the bypass endpoint refuses', (await post(app, '/auth/login/dev')).status === 400);

  const signIn = await authorize(app, '/#/domain/invoicing');
  check('sign-in goes to Entra with PKCE',
    signIn.start.status === 302
    && signIn.location.href.startsWith(`${entraBase}/${TENANT}/oauth2/v2.0/authorize`)
    && signIn.location.searchParams.get('client_id') === CLIENT
    && signIn.location.searchParams.get('code_challenge_method') === 'S256'
    && signIn.location.searchParams.get('response_type') === 'code'
    && signIn.location.searchParams.get('redirect_uri') === `${app.base}/signin-oidc`,
    signIn.location.href);
  check('and remembers it in a cookie', signIn.cookie.startsWith('domainmap.signin='));

  const wrongState = await callback(app, signIn.cookie, { code: signIn.code, state: 'forged' });
  check('a callback with another state is refused',
    wrongState.headers.get('location') === '/login.html?error=expired', wrongState.headers.get('location'));

  const retry = await authorize(app, '/#/domain/invoicing');
  const done = await callback(app, retry.cookie, { code: retry.code, state: retry.state });
  const session = cookiesFrom(done);
  const setCookie = done.headers.getSetCookie().find((cookie) => cookie.startsWith('domainmap.auth='));
  check('a good callback lands back where it started',
    done.status === 302 && done.headers.get('location') === '/#/domain/invoicing', done.headers.get('location'));
  check('with an HttpOnly, SameSite session cookie',
    /HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie) && !/Secure/.test(setCookie), setCookie);

  check('signed in, the page loads', (await get(app, '/', { cookie: session })).status === 200);
  check('signed in, the API answers', (await get(app, '/api/files?prefix=data/', { cookie: session })).status === 200);
  const me = await (await get(app, '/auth/me', { cookie: session })).json();
  check('/auth/me names the person',
    me.authenticated && me.name === 'Alice Example' && me.username === 'alice@contoso.example' && me.method === 'microsoft',
    JSON.stringify(me));

  const [body, mac] = session.split('=')[1].split('.');
  const forged = `domainmap.auth=${Buffer.from(JSON.stringify({ name: 'Mallory', method: 'microsoft', exp: Date.now() + 1e7 })).toString('base64url')}.${mac}`;
  check('a forged session is turned away', (await get(app, '/', { cookie: forged })).status === 302 && body);

  const ageing = `domainmap.auth=${seal(SESSION_SECRET, { name: 'Alice', method: 'microsoft', exp: Date.now() + 60_000 })}`;
  const used = await get(app, '/', { cookie: ageing });
  check('a session sealed with the server\'s secret opens the map', used.status === 200);
  check('using a session does not extend it, so removed access ends with it', cookiesFrom(used) === '');
  const expired = `domainmap.auth=${seal(SESSION_SECRET, { name: 'Alice', method: 'microsoft', exp: Date.now() - 1 })}`;
  check('an expired session is sent to sign in', (await get(app, '/', { cookie: expired })).status === 302);

  tamper = 'aud';
  const forOther = await authorize(app);
  const otherAudience = await callback(app, forOther.cookie, { code: forOther.code, state: forOther.state });
  check('a token for another app is refused', otherAudience.headers.get('location') === '/login.html?error=failed'
    && cookiesFrom(otherAudience) === '', otherAudience.headers.get('location'));

  tamper = 'signature';
  const unsigned = await authorize(app);
  const badSignature = await callback(app, unsigned.cookie, { code: unsigned.code, state: unsigned.state });
  check('a token signed by someone else is refused',
    badSignature.headers.get('location') === '/login.html?error=failed', badSignature.headers.get('location'));
  tamper = null;

  const replay = await callback(app, retry.cookie, { code: retry.code, state: retry.state });
  check('a used code does not sign in again', replay.headers.get('location').startsWith('/login.html?error='));

  const denied = await authorize(app);
  const refused = await callback(app, denied.cookie, {
    error: 'access_denied', state: denied.state,
    error_description: 'AADSTS50105: Your administrator has configured the application to block users unless they are specifically granted access.',
  });
  check('Entra\'s refusal reaches the sign-in page as a code, not as text',
    refused.headers.get('location') === '/login.html?error=refused&code=AADSTS50105', refused.headers.get('location'));

  // fetch will not send a Host of our choosing, so the proxy's header stands in for it.
  const secure = await authorize(app, '/', { 'X-Forwarded-Proto': 'https', 'X-Forwarded-Host': 'domains.example' });
  check('behind TLS at the ingress, cookies are Secure and the callback is https',
    secure.start.headers.getSetCookie().every((cookie) => /; Secure/.test(cookie))
    && secure.location.searchParams.get('redirect_uri') === 'https://domains.example/signin-oidc',
    secure.location.searchParams.get('redirect_uri'));

  const out = await post(app, '/auth/logout', { cookie: session });
  check('signing out clears the session',
    (await out.json()).returnUrl === '/login.html?signedOut=1'
    && out.headers.getSetCookie().some((cookie) => cookie.startsWith('domainmap.auth=;') && /Max-Age=0/.test(cookie)));

  // --- a developer's machine ---
  const dev = await startServer({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true' });
  apps.push(dev);

  const devMe = await (await get(dev, '/auth/me')).json();
  check('the bypass is offered, Microsoft is not', devMe.options.bypass && !devMe.options.microsoft, JSON.stringify(devMe));
  check('the log says the server is open', dev.log().includes('bypass is ON'));
  check('Microsoft sign-in explains it is not configured',
    (await get(dev, '/auth/login/microsoft')).headers.get('location') === '/login.html?error=unconfigured');

  const bypass = await post(dev, '/auth/login/dev?returnUrl=%2F%2Fevil.example');
  const devSession = cookiesFrom(bypass);
  check('the bypass signs in, and only returns inside the app',
    bypass.status === 200 && (await bypass.json()).returnUrl === '/' && devSession.startsWith('domainmap.auth='));
  check('the bypass session opens the API', (await get(dev, '/api/files?prefix=data/', { cookie: devSession })).status === 200);
  const devWho = await (await get(dev, '/auth/me', { cookie: devSession })).json();
  check('and says it is the bypass', devWho.method === 'bypass' && devWho.name === 'Developer (bypass)');

  // --- sign-in switched off ---
  const open = await startServer({ AUTH_ENABLED: 'false' });
  apps.push(open);
  check('with sign-in off, the page and API load', (await get(open, '/')).status === 200
    && (await get(open, '/api/files?prefix=data/')).status === 200);
  const openMe = await (await get(open, '/auth/me')).json();
  check('and /auth/me says no sign-in is required', openMe.required === false && openMe.authenticated === true);
} finally {
  await Promise.all(apps.map((app) => app.stop()));
  entra.close();
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
