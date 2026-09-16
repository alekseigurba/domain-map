// Sign-in: Entra ID, or a development bypass that has to be switched on
// deliberately. It happens on the server and lands in a signed cookie, so the
// browser never handles a token. Zero dependencies, like the rest of the
// server: the OpenID Connect code flow is two requests and one signature
// check, and node:crypto does all of it.
//
// Who may sign in is not decided here. The Entra enterprise application
// requires assignment, so Entra refuses a token to anyone who is not assigned
// to it, and the app accepts any token Entra issues for it. Managing that is in
// docs/EntraID-Authentication.MD.

import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';
import { posix } from 'node:path';

const SESSION_COOKIE = 'domainmap.auth';
/** The state, nonce and PKCE verifier of a sign-in on its way through Entra. */
const SIGNIN_COOKIE = 'domainmap.signin';
const SIGNIN_SECONDS = 10 * 60;
export const CALLBACK_PATH = '/signin-oidc';
const CLOCK_SKEW_SECONDS = 5 * 60;
const SCOPE = 'openid profile email';

/** What has to load before anyone has signed in: the sign-in page and what it is drawn with. */
const PUBLIC_FILES = new Set([
  '/login.html', '/js/login.js', '/css/fonts.css', '/css/tokens.css', '/css/login.css', '/favicon.svg',
]);
const PUBLIC_PREFIXES = ['/fonts/'];
/** The sign-in page wears the map's branding, and branding is stored. Read-only. */
const PUBLIC_OBJECTS = new Set(['/api/files/data/settings.json']);
const PUBLIC_OBJECT_PREFIXES = ['/api/files/data/brand/'];

// --- configuration -----------------------------------------------------------

const isOff = (value) => /^(0|false|no|off)$/i.test(value?.trim() ?? '');
const isOn = (value) => /^(1|true|yes|on)$/i.test(value?.trim() ?? '');

/** The settings, read from the environment, and what the log should say about them. */
export function readConfig(env) {
  const warnings = [];
  const config = {
    // Only an explicit "false" opens the door: a typo keeps it shut.
    enabled: !isOff(env.AUTH_ENABLED),
    bypass: isOn(env.AUTH_DEV_BYPASS),
    instance: (env.AUTH_INSTANCE?.trim() || 'https://login.microsoftonline.com').replace(/\/+$/, ''),
    tenantId: env.AUTH_TENANT_ID?.trim() ?? '',
    clientId: env.AUTH_CLIENT_ID?.trim() ?? '',
    clientSecret: env.AUTH_CLIENT_SECRET ?? '',
    sessionHours: Number(env.AUTH_SESSION_HOURS ?? 8),
    sessionSecret: env.AUTH_SESSION_SECRET ?? '',
  };

  // A bypass anywhere but a developer's machine is a back door, so it is
  // refused unless the process says it is one, whatever else is set.
  if (config.bypass && env.NODE_ENV !== 'development') {
    config.bypass = false;
    warnings.push('AUTH_DEV_BYPASS is ignored: the bypass only works with NODE_ENV=development.');
  }

  const entra = { AUTH_TENANT_ID: config.tenantId, AUTH_CLIENT_ID: config.clientId, AUTH_CLIENT_SECRET: config.clientSecret };
  const missing = Object.keys(entra).filter((name) => !entra[name]);
  config.microsoft = missing.length === 0;
  if (missing.length > 0 && missing.length < 3) {
    warnings.push(`Microsoft sign-in is off: ${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set.`);
  }
  config.authority = `${config.instance}/${config.tenantId}/v2.0`;

  if (!(config.sessionHours > 0)) {
    warnings.push(`AUTH_SESSION_HOURS must be a positive number; using 8.`);
    config.sessionHours = 8;
  }

  if (!config.sessionSecret) {
    config.sessionSecret = randomBytes(32).toString('base64url');
    if (config.enabled && config.microsoft) {
      warnings.push('AUTH_SESSION_SECRET is not set: everyone has to sign in again whenever the server restarts.');
    }
  }

  if (!config.enabled) {
    warnings.push('Sign-in is OFF (AUTH_ENABLED=false): anyone who can reach this server can change the map.');
  } else if (config.bypass) {
    warnings.push('The development sign-in bypass is ON: anyone who can reach this server can change the map.');
  } else if (!config.microsoft) {
    warnings.push('No sign-in method is configured, so nobody can open the map. See docs/EntraID-Authentication.MD.');
  }

  return { ...config, warnings };
}

// --- cookies -----------------------------------------------------------------

/** `payload` as a cookie value only this server could have written. */
export function seal(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

/** The payload of a sealed value, or null if it was tampered with or has expired. */
export function unseal(secret, value) {
  const [body, mac, ...rest] = (value ?? '').split('.');
  if (!body || !mac || rest.length > 0) return null;

  const expected = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function readCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0) cookies[part.slice(0, at).trim()] = part.slice(at + 1).trim();
  }
  return cookies;
}

/** TLS usually ends at the platform's ingress, which says so in a header. */
function isHttps(request) {
  return Boolean(request.socket.encrypted)
    || request.headers['x-forwarded-proto']?.split(',')[0].trim() === 'https';
}

function setCookie(request, response, name, value, maxAgeSeconds) {
  const cookie = [
    `${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`,
    ...(isHttps(request) ? ['Secure'] : []),
  ].join('; ');
  const already = response.getHeader('Set-Cookie') ?? [];
  response.setHeader('Set-Cookie', [...[already].flat(), cookie]);
}

// --- small pieces ------------------------------------------------------------

/** Only ever come back to this app, never to somewhere a link says. */
export function safeReturnUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  // Read it the way a browser would: `//host` and a backslash variant of it
  // both leave the app, and only a URL that stays on this origin comes back.
  const base = 'http://domain-map.invalid';
  try {
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}

/** Whether `path` (already decoded and normalized) loads without a session. */
export function isPublic(method, path) {
  if (PUBLIC_FILES.has(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (method !== 'GET') return false;
  return PUBLIC_OBJECTS.has(path) || PUBLIC_OBJECT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

const random = () => randomBytes(32).toString('base64url');

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function redirect(response, location) {
  response.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  response.end();
}

/** Back to the sign-in page with a reason it knows how to word. No free text: a link could carry any. */
function toLogin(response, error, code) {
  const query = new URLSearchParams({ error, ...(code && { code }) });
  redirect(response, `/login.html?${query}`);
}

// --- Entra ID ----------------------------------------------------------------

/** The OpenID Connect side: where to send people, and how to trust what comes back. */
function createEntra(config) {
  let metadata = null;
  let keys = new Map();
  let keysFetchedAt = 0;

  async function getJson(url, init) {
    const response = await fetch(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error_description ?? body.error ?? `${url} answered ${response.status}.`);
    }
    return body;
  }

  async function discover() {
    metadata ??= await getJson(`${config.authority}/.well-known/openid-configuration`);
    return metadata;
  }

  /** Entra rolls its keys, so an unknown key id fetches them again -- at most once a minute. */
  async function signingKey(kid) {
    if (!keys.has(kid) && Date.now() - keysFetchedAt > 60_000) {
      const { jwks_uri: jwksUri } = await discover();
      const { keys: published = [] } = await getJson(jwksUri);
      keys = new Map(published
        .filter((key) => key.kty === 'RSA' && key.kid)
        .map((key) => [key.kid, createPublicKey({ key: { kty: 'RSA', n: key.n, e: key.e }, format: 'jwk' })]));
      keysFetchedAt = Date.now();
    }
    return keys.get(kid);
  }

  async function authorizeUrl({ redirectUri, state, nonce, verifier, prompt }) {
    const { authorization_endpoint: endpoint } = await discover();
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      response_mode: 'query',
      redirect_uri: redirectUri,
      scope: SCOPE,
      state,
      nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      ...(prompt && { prompt }),
    });
    return url.href;
  }

  /** The ID token is checked in full even though it came straight from Entra over TLS. */
  async function verifyIdToken(token, { issuer, nonce }) {
    const [head, body, signature] = token.split('.');
    const header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
    if (header.alg !== 'RS256') throw new Error(`The ID token is signed with ${header.alg}, not RS256.`);

    const key = await signingKey(header.kid);
    const signed = key && verify('RSA-SHA256', Buffer.from(`${head}.${body}`), key, Buffer.from(signature ?? '', 'base64url'));
    if (!signed) throw new Error('The ID token signature does not check out.');

    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    const now = Date.now() / 1000;
    if (claims.iss !== issuer) throw new Error(`The ID token is from ${claims.iss}, not ${issuer}.`);
    if (claims.aud !== config.clientId) throw new Error('The ID token is for another application.');
    if (!(claims.exp > now - CLOCK_SKEW_SECONDS)) throw new Error('The ID token has expired.');
    if (claims.nbf > now + CLOCK_SKEW_SECONDS) throw new Error('The ID token is not valid yet.');
    if (claims.nonce !== nonce) throw new Error('The ID token belongs to another sign-in.');
    return claims;
  }

  /** Trade the code for an ID token, and answer with what it says about the person. */
  async function redeem({ code, redirectUri, verifier, nonce }) {
    const { token_endpoint: endpoint, issuer } = await discover();
    const tokens = await getJson(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: SCOPE,
      }),
    });
    if (!tokens.id_token) throw new Error('Entra ID answered without an ID token.');
    return verifyIdToken(tokens.id_token, { issuer, nonce });
  }

  return { authorizeUrl, redeem };
}

// --- the gate ----------------------------------------------------------------

/**
 * `handle` answers the sign-in routes, and turns away anything else that needs
 * a session and has none. It returns true when it has answered the request, and
 * false when the request should carry on to the files or the API.
 */
export function createAuth(env = process.env) {
  const config = readConfig(env);
  const entra = config.microsoft ? createEntra(config) : null;
  const sessionMs = config.sessionHours * 3_600_000;

  function startSession(request, response, user) {
    const now = Date.now();
    const value = seal(config.sessionSecret, { ...user, iat: now, exp: now + sessionMs });
    setCookie(request, response, SESSION_COOKIE, value, Math.floor(sessionMs / 1000));
  }

  const origin = (request) => {
    const host = (request.headers['x-forwarded-host'] ?? request.headers.host ?? '').split(',')[0].trim();
    return `${isHttps(request) ? 'https' : 'http'}://${host}`;
  };

  async function startMicrosoft(request, response, url) {
    if (!entra) return toLogin(response, 'unconfigured');

    const pending = {
      state: random(),
      nonce: random(),
      verifier: random(),
      returnUrl: safeReturnUrl(url.searchParams.get('returnUrl')),
      exp: Date.now() + SIGNIN_SECONDS * 1000,
    };
    try {
      const location = await entra.authorizeUrl({
        ...pending,
        redirectUri: `${origin(request)}${CALLBACK_PATH}`,
        // After signing out, let the next person pick their own account.
        prompt: url.searchParams.get('prompt') === 'select_account' ? 'select_account' : undefined,
      });
      setCookie(request, response, SIGNIN_COOKIE, seal(config.sessionSecret, pending), SIGNIN_SECONDS);
      redirect(response, location);
    } catch (error) {
      console.error(`Could not start Microsoft sign-in: ${error.message}`);
      toLogin(response, 'unreachable');
    }
  }

  async function finishMicrosoft(request, response, url) {
    const pending = unseal(config.sessionSecret, readCookies(request.headers.cookie)[SIGNIN_COOKIE]);
    setCookie(request, response, SIGNIN_COOKIE, '', 0);

    const refused = url.searchParams.get('error');
    if (refused) {
      const description = url.searchParams.get('error_description') ?? '';
      console.error(`Entra ID refused a sign-in: ${refused} ${description}`);
      return toLogin(response, 'refused', description.match(/AADSTS\d+/)?.[0]);
    }
    if (!entra) return toLogin(response, 'unconfigured');
    if (!pending || pending.state !== url.searchParams.get('state')) return toLogin(response, 'expired');

    try {
      const claims = await entra.redeem({
        code: url.searchParams.get('code') ?? '',
        redirectUri: `${origin(request)}${CALLBACK_PATH}`,
        verifier: pending.verifier,
        nonce: pending.nonce,
      });
      startSession(request, response, {
        name: claims.name ?? claims.preferred_username ?? 'Signed in',
        username: claims.preferred_username ?? claims.email ?? null,
        method: 'microsoft',
      });
      redirect(response, safeReturnUrl(pending.returnUrl));
    } catch (error) {
      console.error(`Microsoft sign-in failed: ${error.message}`);
      toLogin(response, 'failed', error.message.match(/AADSTS\d+/)?.[0]);
    }
  }

  async function handle(request, response, url) {
    const path = posix.normalize(decodeURIComponent(url.pathname));
    const route = `${request.method} ${path}`;
    const user = config.enabled ? unseal(config.sessionSecret, readCookies(request.headers.cookie)[SESSION_COOKIE]) : null;

    if (route === 'GET /auth/me') {
      sendJson(response, 200, {
        required: config.enabled,
        authenticated: !config.enabled || Boolean(user),
        name: user?.name ?? null,
        username: user?.username ?? null,
        method: user?.method ?? null,
        options: { microsoft: config.microsoft, bypass: config.bypass },
      });
      return true;
    }
    if (route === 'GET /auth/login/microsoft') {
      await startMicrosoft(request, response, url);
      return true;
    }
    if (route === `GET ${CALLBACK_PATH}`) {
      await finishMicrosoft(request, response, url);
      return true;
    }
    if (route === 'POST /auth/login/dev') {
      if (!config.bypass) {
        sendJson(response, 400, { error: 'The development bypass is switched off on this server.' });
        return true;
      }
      startSession(request, response, { name: 'Developer (bypass)', username: null, method: 'bypass' });
      sendJson(response, 200, { returnUrl: safeReturnUrl(url.searchParams.get('returnUrl')) });
      return true;
    }
    if (route === 'POST /auth/logout') {
      // Only this app's session ends. Signing out of Entra as well would sign
      // the person out of every Microsoft app in the browser.
      setCookie(request, response, SESSION_COOKIE, '', 0);
      sendJson(response, 200, { returnUrl: '/login.html?signedOut=1' });
      return true;
    }

    if (!config.enabled || isPublic(request.method, path)) return false;

    // Using a session does not extend it: however busy someone is, they go back
    // through Entra within AUTH_SESSION_HOURS, and that is where removed access
    // takes effect. Entra usually signs them straight back in.
    if (user) return false;

    if (path === '/api' || path.startsWith('/api/')) {
      sendJson(response, 401, { error: 'Sign in to use this map.' });
    } else {
      redirect(response, `/login.html?returnUrl=${encodeURIComponent(url.pathname + url.search)}`);
    }
    return true;
  }

  return { warnings: config.warnings, handle };
}
