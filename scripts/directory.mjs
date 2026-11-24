// The directory behind the name boxes: anyone in the organisation, found by
// name as it is typed. The people list only knows who has been here — a row is
// made at a first sign-in — so a name box could never offer someone who had
// not, and a product manager could not be named on a capability before they
// had opened the map.
//
// For Entra ID this asks Microsoft Graph, as the application itself, with the
// client id and secret sign-in already uses, for the users whose name or
// address matches what was typed. It needs one application permission,
// granted with a tenant administrator's consent: User.ReadBasic.All, which
// reads a user's name and address and nothing else. That permission cannot
// read who is assigned to the app or who is in a group, so what is offered is
// everyone in the tenant, not only whoever may sign in. Without it Graph says
// 403, the warning says what to grant, and the name boxes offer the people
// list as they always have.
//
// A name is only offered, never given anything: being found here makes nobody
// a person on the list, and grants nothing.

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPE = 'https://graph.microsoft.com/.default';
const USER_FIELDS = 'id,displayName,mail,userPrincipalName';

/** How few letters are worth asking about: one matches half the organisation. */
export const DIRECTORY_MIN_QUERY = 2;

/** How many names one look-up offers: a list to pick from, not to read. */
export const DIRECTORY_MAX_RESULTS = 15;

/** How long an answer is kept, so a box typed into and back does not ask Graph twice. */
export const DIRECTORY_KEEP_MS = 5 * 60 * 1000;

/** How long to leave Graph alone after it refused, so a missing permission is not asked about on every letter. */
export const DIRECTORY_RETRY_MS = 5 * 60 * 1000;

const isOff = (value) => /^(0|false|no|off)$/i.test(value?.trim() ?? '');

/**
 * What was typed, as Graph's $search wants it: each word a term of its own, so
 * "jenny atm" finds "Atmer, Jenny" whichever way round it is written, and
 * nothing that could close the quotes it is put in.
 */
export function searchTerms(query) {
  const words = String(query ?? '').replace(/["\\]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 4);
  return words.map((word) => `("displayName:${word}" OR "mail:${word}" OR "userPrincipalName:${word}")`).join(' AND ');
}

/**
 * The directory for a server, from its sign-in settings. It is on wherever
 * Microsoft sign-in is configured, unless `AUTH_DIRECTORY=false` says not; on
 * anything else it is off and finds nobody.
 */
export function createDirectory(env, options = {}) {
  const tenantId = env.AUTH_TENANT_ID?.trim() ?? '';
  const clientId = env.AUTH_CLIENT_ID?.trim() ?? '';
  const clientSecret = env.AUTH_CLIENT_SECRET ?? '';
  const enabled = Boolean(tenantId && clientId && clientSecret) && !isOff(env.AUTH_DIRECTORY);
  const instance = (env.AUTH_INSTANCE?.trim() || 'https://login.microsoftonline.com').replace(/\/+$/, '');
  const graph = (options.graph ?? GRAPH).replace(/\/+$/, '');
  const get = options.fetch ?? fetch;
  const warn = options.warn ?? console.warn;
  const now = options.now ?? Date.now;

  let token = null;
  const answers = new Map();
  let refusedAt = null;
  let lastWarning = null;

  async function json(url, init) {
    const response = await get(url, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const said = body.error_description ?? body.error?.message ?? body.error ?? `${response.status}`;
      const error = new Error(typeof said === 'string' ? said : JSON.stringify(said));
      error.status = response.status;
      throw error;
    }
    return body;
  }

  /** A token for Graph as the application, kept until a minute before it runs out. */
  async function accessToken() {
    if (token && token.until > now()) return token.value;
    const body = await json(`${instance}/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId, client_secret: clientSecret, scope: SCOPE, grant_type: 'client_credentials',
      }),
    });
    token = { value: body.access_token, until: now() + (Number(body.expires_in ?? 3600) - 60) * 1000 };
    return token.value;
  }

  /** The users matching what was typed, as `{ subject, name, email }` by name. */
  async function lookUp(query) {
    const url = new URL(`${graph}/users`);
    url.search = new URLSearchParams({
      $search: searchTerms(query),
      $select: USER_FIELDS,
      $top: String(DIRECTORY_MAX_RESULTS),
    }).toString();
    // $search on users is an advanced query, which Graph answers only when told
    // an eventually consistent index will do.
    const page = await json(url.href, {
      headers: { Authorization: `Bearer ${await accessToken()}`, ConsistencyLevel: 'eventual' },
    });
    return (page.value ?? []).map((user) => {
      const email = user.mail || user.userPrincipalName || '';
      return { subject: user.id, name: (user.displayName || email).trim(), email };
    }).filter((person) => person.name).sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Everyone whose name or address matches `query`. An answer is kept for a
   * few minutes; a refusal from Graph is warned about once for as long as it
   * says the same thing, and Graph is left alone for a few minutes after it.
   */
  async function search(query) {
    const said = String(query ?? '').trim().toLowerCase();
    if (!enabled) return { enabled: false, people: [], error: null };
    if (said.replace(/\s/g, '').length < DIRECTORY_MIN_QUERY) return { enabled: true, people: [], error: null };
    if (refusedAt !== null && now() - refusedAt < (options.retry ?? DIRECTORY_RETRY_MS)) {
      return { enabled: true, people: [], error: lastWarning };
    }

    const kept = answers.get(said);
    if (kept && now() - kept.at < DIRECTORY_KEEP_MS) return { enabled: true, people: kept.people, error: null };

    try {
      const people = await lookUp(said);
      answers.set(said, { at: now(), people });
      // A few hundred queries is plenty to keep; the oldest go first.
      if (answers.size > 500) answers.delete(answers.keys().next().value);
      refusedAt = null;
      lastWarning = null;
      return { enabled: true, people, error: null };
    } catch (error) {
      const missing = error.status === 403 || error.status === 401
        ? ' Grant the app the application permission User.ReadBasic.All, with admin consent, or set AUTH_DIRECTORY=false.'
        : '';
      const warning = `Could not look people up in Microsoft Graph: ${error.message}.${missing}`;
      if (warning !== lastWarning) warn(warning);
      lastWarning = warning;
      refusedAt = now();
      return { enabled: true, people: [], error: error.message };
    }
  }

  return { enabled, search };
}
