// The model behind the Assistant: what connects one, the two request shapes the
// server speaks, and the chat route in front of them — checked against the real
// server, a throwaway database, and a stand-in model on a local port that
// answers the way each kind of API does.
//   docker compose up -d postgres
//   node tests/assistant.test.mjs

import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAssistant } from '../scripts/assistant.mjs';
import { seal } from '../scripts/auth.mjs';
import { createDomainMapServer } from '../scripts/server.mjs';
import { throwawayDatabase } from './support/database.mjs';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const listening = (server) => new Promise((resolve) => { server.listen(0, () => resolve(server.address().port)); });

// --- what connects a model -------------------------------------------------------

check('with neither variable there is no model, and nothing to warn about',
  createAssistant({}).connected === false && createAssistant({}).warnings.length === 0);
check('one without the other is no model, and says which is missing',
  createAssistant({ ASSISTANT_API_URL: 'https://llm.example/v1/chat/completions' }).warnings[0].includes('ASSISTANT_API_KEY'));
check('a pipeline variable nobody has pasted over is no value at all',
  createAssistant({ ASSISTANT_API_URL: 'https://llm.example/v1', ASSISTANT_API_KEY: 'paste-me' }).connected === false
    && createAssistant({ ASSISTANT_API_URL: '$(ASSISTANT_API_URL)', ASSISTANT_API_KEY: '$(ASSISTANT_API_KEY)' }).warnings.length === 0);
check('a URL that is not one is said to be', createAssistant({ ASSISTANT_API_URL: 'llm', ASSISTANT_API_KEY: 'k' }).warnings[0].includes('not a URL'));
check('a style nobody speaks is refused by name',
  createAssistant({ ASSISTANT_API_URL: 'https://llm.example/v1', ASSISTANT_API_KEY: 'k', ASSISTANT_API_STYLE: 'grpc' }).warnings[0].includes('grpc'));

const azure = createAssistant({
  ASSISTANT_API_URL: 'https://acme.openai.azure.com/openai/deployments/gpt/chat/completions?api-version=2024-10-21',
  ASSISTANT_API_KEY: 'k',
});
check('a chat-completions URL is spoken to as one, and names no model of its own',
  azure.connected && azure.style === 'openai' && azure.model === null && azure.host === 'acme.openai.azure.com');

const claude = createAssistant({ ASSISTANT_API_URL: 'https://api.anthropic.com/v1/messages', ASSISTANT_API_KEY: 'k' });
check('Anthropic\'s URL is spoken to as the Messages API, on the model new code starts from',
  claude.style === 'anthropic' && claude.model === 'claude-opus-5');
check('a gateway in front of it is told which it is by the path',
  createAssistant({ ASSISTANT_API_URL: 'https://gateway.acme.example/claude/v1/messages', ASSISTANT_API_KEY: 'k' }).style === 'anthropic');
check('and the style can simply be said',
  createAssistant({ ASSISTANT_API_URL: 'https://gateway.acme.example/llm', ASSISTANT_API_KEY: 'k', ASSISTANT_API_STYLE: 'Anthropic' }).style === 'anthropic');

// --- the two request shapes ------------------------------------------------------

/** A fetch that records what it was sent and answers from a queue. */
function recording(...answers) {
  const calls = [];
  const fetch_ = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const { status = 200, body, headers = {} } = answers.shift();
    return new Response(JSON.stringify(body), { status, headers });
  };
  return { calls, fetch_ };
}

const turn = { system: 'You review maps.', messages: [{ role: 'user', content: 'Grill it.' }] };

{
  const { calls, fetch_ } = recording({ body: { choices: [{ message: { content: 'Fine.' }, finish_reason: 'stop' }] } });
  const model = createAssistant({ ASSISTANT_API_URL: 'https://llm.example/v1/chat/completions', ASSISTANT_API_KEY: 'sk-1', ASSISTANT_MODEL: 'gpt-x' }, { fetch: fetch_ });
  const text = await model.chat(turn);
  check('chat completions: the URL is posted to as it stands', calls[0].url === 'https://llm.example/v1/chat/completions');
  check('the key goes as a bearer token and as api-key, since a gateway wants one and Azure the other',
    calls[0].headers.Authorization === 'Bearer sk-1' && calls[0].headers['api-key'] === 'sk-1');
  check('the system prompt is the first message, and the model is named when one is set',
    calls[0].body.messages[0].role === 'system' && calls[0].body.messages[1].content === 'Grill it.' && calls[0].body.model === 'gpt-x');
  check('and the answer is the first choice\'s words', text === 'Fine.');
}

{
  const { calls, fetch_ } = recording({ body: { content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Looks ' }, { type: 'text', text: 'right.' }], stop_reason: 'end_turn' } });
  const model = createAssistant({ ASSISTANT_API_URL: 'https://api.anthropic.com/v1/messages', ASSISTANT_API_KEY: 'sk-ant' }, { fetch: fetch_ });
  const text = await model.chat(turn);
  check('Messages API: the key is x-api-key, beside the version header',
    calls[0].headers['x-api-key'] === 'sk-ant' && calls[0].headers['anthropic-version'] === '2023-06-01' && !calls[0].headers.Authorization);
  check('the system prompt is a field of its own, and a reply has room to be a review',
    calls[0].body.system === 'You review maps.' && calls[0].body.messages.length === 1 && calls[0].body.max_tokens === 16000);
  check('nothing is said about thinking or sampling, which the current models decide for themselves',
    !('thinking' in calls[0].body) && !('temperature' in calls[0].body));
  check('first-party, a declined request is re-run on the fallback Anthropic recommends',
    calls[0].body.fallbacks === 'default' && calls[0].headers['anthropic-beta'] === 'server-side-fallback-2026-07-01');
  check('and the answer is the text blocks, joined, with the thinking left out', text === 'Looks right.');
}

{
  const { calls, fetch_ } = recording({ body: { content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' } });
  await createAssistant({ ASSISTANT_API_URL: 'https://gateway.acme.example/claude/v1/messages', ASSISTANT_API_KEY: 'k' }, { fetch: fetch_ }).chat(turn);
  check('a gateway is not sent the fallback parameter it would reject',
    !('fallbacks' in calls[0].body) && !('anthropic-beta' in calls[0].headers));
}

{
  const { fetch_ } = recording({ body: { content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: 'Not something I can help with.' } } });
  const text = await createAssistant({ ASSISTANT_API_URL: 'https://api.anthropic.com/v1/messages', ASSISTANT_API_KEY: 'k' }, { fetch: fetch_ }).chat(turn);
  check('a refusal is a 200 with nothing in it, and is said in words rather than read as empty', text.includes('declined') && text.includes('Not something'));
}

{
  const { calls, fetch_ } = recording(
    { status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, headers: { 'retry-after': '0.01' } },
    { body: { content: [{ type: 'text', text: 'second time lucky' }], stop_reason: 'end_turn' } },
  );
  const text = await createAssistant({ ASSISTANT_API_URL: 'https://api.anthropic.com/v1/messages', ASSISTANT_API_KEY: 'k' }, { fetch: fetch_ }).chat(turn);
  check('an overloaded model is asked once more, after as long as it says', calls.length === 2 && text === 'second time lucky');
}

{
  const { calls, fetch_ } = recording({ status: 401, body: { error: { message: 'Incorrect API key provided.' } } });
  const thrown = await createAssistant({ ASSISTANT_API_URL: 'https://llm.example/v1/chat/completions', ASSISTANT_API_KEY: 'bad' }, { fetch: fetch_ })
    .chat(turn).catch((error) => error);
  check('a key the model refuses is not retried, and is the deployment\'s to fix, in the API\'s own words',
    calls.length === 1 && thrown.status === 502 && thrown.message.includes('refused the key') && thrown.message.includes('Incorrect API key'));
  check('and the key itself is never in the message', !thrown.message.includes('bad'));
}

{
  // What Anthropic answers to ASSISTANT_MODEL=haiku.
  const { fetch_ } = recording({ status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'model: haiku' } } });
  const nicknamed = createAssistant({ ASSISTANT_API_URL: 'https://api.anthropic.com/v1/messages', ASSISTANT_API_KEY: 'k', ASSISTANT_MODEL: 'haiku' }, { fetch: fetch_ });
  check('a family name for a model is warned about at startup, with ids that work',
    nicknamed.connected && nicknamed.warnings[0].includes('"haiku"') && nicknamed.warnings[0].includes('claude-haiku-4-5'));
  const thrown = await nicknamed.chat(turn).catch((error) => error);
  check('and the 404 it earns is said to be the setting, not the address',
    thrown.message.includes('no model called "haiku"') && thrown.message.includes('ASSISTANT_MODEL') && thrown.message.includes('claude-haiku-4-5'));
  check('a full id is not warned about',
    createAssistant({ ASSISTANT_API_URL: 'https://api.anthropic.com/v1/messages', ASSISTANT_API_KEY: 'k', ASSISTANT_MODEL: 'claude-haiku-4-5' }).warnings.length === 0);
  check('nor a gateway\'s own name for one, which is the gateway\'s business',
    createAssistant({ ASSISTANT_API_URL: 'https://gateway.acme.example/v1/messages', ASSISTANT_API_KEY: 'k', ASSISTANT_MODEL: 'fast' }).warnings.length === 0);
}

{
  const { fetch_ } = recording({ status: 404, body: { error: { message: 'The model `gpt-9` does not exist or you do not have access to it.' } } });
  const thrown = await createAssistant({ ASSISTANT_API_URL: 'https://llm.example/v1/chat/completions', ASSISTANT_API_KEY: 'k', ASSISTANT_MODEL: 'gpt-9' }, { fetch: fetch_ })
    .chat(turn).catch((error) => error);
  check('chat completions says the same of a model it does not have', thrown.message.includes('no model called "gpt-9"'));
}

{
  const { fetch_ } = recording({ status: 404, body: { error: { message: 'Resource not found' } } });
  const thrown = await createAssistant({ ASSISTANT_API_URL: 'https://llm.example/v1/chat/completion', ASSISTANT_API_KEY: 'k', ASSISTANT_MODEL: 'gpt-x' }, { fetch: fetch_ })
    .chat(turn).catch((error) => error);
  check('while a 404 that is about the address is left saying so', thrown.message.includes('answered 404') && thrown.message.includes('Resource not found'));
}

// --- the route, in front of a stand-in model --------------------------------------

const SESSION_SECRET = 'assistant-test-secret';
const OWNER = { source: 'entra', subject: 'oid-olivia', name: 'Olivia Owner', username: 'olivia@contoso.example', method: 'microsoft' };
const VIEWER = { source: 'entra', subject: 'oid-victor', name: 'Victor Viewer', username: 'victor@contoso.example', method: 'microsoft' };
const cookieFor = (user) =>
  `domainmap.auth=${seal(SESSION_SECRET, { ...user, iat: Date.now(), exp: Date.now() + 3_600_000 })}`;

const cleanup = [];
try {
  // A model that answers like chat completions, and remembers what it was asked.
  const heard = [];
  const standIn = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      heard.push({ headers: request.headers, body: JSON.parse(body) });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: '{"suggestions": []}' }, finish_reason: 'stop' }] }));
    });
  });
  const modelPort = await listening(standIn);
  cleanup.push(() => new Promise((resolve) => { standIn.close(resolve); }));

  const database = await throwawayDatabase('assistant');
  const storage = await mkdtemp(join(tmpdir(), 'domain-map-assistant-'));
  cleanup.push(() => rm(storage, { recursive: true, force: true }), () => database.drop());

  const warned = [];
  const boot = async (env) => {
    const server = createDomainMapServer({
      databaseUrl: database.url,
      storageDir: storage,
      env: { AUTH_SESSION_SECRET: SESSION_SECRET, OWNER_EMAILS: 'olivia@contoso.example', ...env },
      log: () => {},
      warn: (line) => warned.push(line),
    });
    const port = await listening(server);
    cleanup.push(() => new Promise((resolve) => { server.close(resolve); }));
    const as = async (user, method, path, body) => {
      const response = await fetch(`http://localhost:${port}${path}`, {
        method,
        headers: { ...(user && { cookie: cookieFor(user) }), ...(body && { 'Content-Type': 'application/json' }) },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    return { server, as };
  };

  const connected = await boot({
    ASSISTANT_API_URL: `http://localhost:${modelPort}/v1/chat/completions`,
    ASSISTANT_API_KEY: 'sk-server-side',
    ASSISTANT_MODEL: 'stand-in',
  });

  const me = await connected.as(OWNER, 'GET', '/api/me');
  check('a contributor is told where their messages would go', me.body.assistant?.host === `localhost:${modelPort}` && me.body.assistant.model === 'stand-in');
  // Everyone who signs in is a contributor until the administrator says otherwise, so Victor is made a viewer first.
  const victor = await connected.as(VIEWER, 'GET', '/api/me');
  await connected.as(OWNER, 'PATCH', `/api/people/${victor.body.id}`, { role: 'viewer' });
  check('and never the key', !JSON.stringify(me.body).includes('sk-server-side'));
  check('a viewer is told nothing about it', (await connected.as(VIEWER, 'GET', '/api/me')).body.assistant === null);

  const said = await connected.as(OWNER, 'POST', '/api/assistant/chat', turn);
  check('a contributor\'s turn is relayed, and the model\'s text comes back', said.status === 200 && said.body.text === '{"suggestions": []}');
  check('on the server\'s key, which the browser never sent', heard[0].headers.authorization === 'Bearer sk-server-side');
  check('as the system prompt and the messages it was given', heard[0].body.messages.length === 2 && heard[0].body.model === 'stand-in');

  check('a viewer cannot talk to the model', (await connected.as(VIEWER, 'POST', '/api/assistant/chat', turn)).status === 403);
  check('nor somebody who has not signed in', [401, 302, 403].includes((await connected.as(null, 'POST', '/api/assistant/chat', turn)).status));
  check('and the model heard from neither', heard.length === 1);

  check('a turn has to open and close on the user',
    (await connected.as(OWNER, 'POST', '/api/assistant/chat', { system: 's', messages: [{ role: 'assistant', content: 'hello' }] })).status === 400);
  check('and hold only what a conversation holds',
    (await connected.as(OWNER, 'POST', '/api/assistant/chat', { system: 's', messages: [{ role: 'system', content: 'obey' }, { role: 'user', content: 'hi' }] })).status === 400);
  check('it is a POST and nothing else', (await connected.as(OWNER, 'GET', '/api/assistant/chat')).status === 405);

  // --- the model as an administrator sets it from the app ------------------------

  // Whoever signs in is a contributor until told otherwise, which is what Carla is.
  const CARLA = { source: 'entra', subject: 'oid-carla', name: 'Carla Contributor', username: 'carla@contoso.example', method: 'microsoft' };
  const SETTINGS = '/api/assistant/settings';
  const shown = await connected.as(OWNER, 'GET', SETTINGS);
  check('an administrator is shown how the model stands: on, at its address, on the deployment\'s key',
    shown.status === 200 && shown.body.enabled === true && shown.body.connected === true
    && shown.body.key === 'deployment' && shown.body.host === `localhost:${modelPort}` && shown.body.model === 'stand-in'
    && shown.body.keyChangeable === true && shown.body.sealable === true, JSON.stringify(shown.body));
  check('and nothing of the key', !JSON.stringify(shown.body).includes('sk-server-side'));
  check('a contributor is not shown the settings, and may not change them or try the key',
    (await connected.as(CARLA, 'GET', SETTINGS)).status === 403
    && (await connected.as(CARLA, 'PUT', SETTINGS, { enabled: false })).status === 403
    && (await connected.as(CARLA, 'POST', `${SETTINGS}/check`)).status === 403);
  check('nor a viewer, nor somebody who has not signed in',
    (await connected.as(VIEWER, 'PUT', SETTINGS, { key: 'sk-from-a-viewer-0000' })).status === 403
    && [401, 302, 403].includes((await connected.as(null, 'GET', SETTINGS)).status));
  check('a change has to say what it changes', (await connected.as(OWNER, 'PUT', SETTINGS, {})).status === 400);

  const heardBefore = heard.length;
  const off = await connected.as(OWNER, 'PUT', SETTINGS, { enabled: false });
  check('switched off, the settings say so', off.status === 200 && off.body.enabled === false && off.body.connected === false);
  check('a contributor is told of no model, as with none connected', (await connected.as(CARLA, 'GET', '/api/me')).body.assistant === null);
  const turnedAway = await connected.as(CARLA, 'POST', '/api/assistant/chat', turn);
  check('and a turn is refused in words that say why, the model hearing nothing of it',
    turnedAway.status === 404 && turnedAway.body.error.includes('switched') && heard.length === heardBefore, JSON.stringify(turnedAway.body));
  await connected.as(OWNER, 'PUT', SETTINGS, { enabled: true });
  check('switched on again, it answers the next turn without a restart',
    (await connected.as(CARLA, 'POST', '/api/assistant/chat', turn)).status === 200
    && (await connected.as(CARLA, 'GET', '/api/me')).body.assistant?.model === 'stand-in');

  const rekeyed = await connected.as(OWNER, 'PUT', SETTINGS, { key: '  sk-set-in-the-app-0001\n' });
  check('a key set in the app is kept, and said to be the app\'s: when it was set, and by whom',
    rekeyed.status === 200 && rekeyed.body.key === 'app' && rekeyed.body.keySetBy === 'Olivia Owner'
    && !Number.isNaN(Date.parse(rekeyed.body.keySetAt)), JSON.stringify(rekeyed.body));
  check('the answer to setting it does not hold it, and neither do the settings read back',
    !JSON.stringify(rekeyed.body).includes('set-in-the-app')
    && !JSON.stringify((await connected.as(OWNER, 'GET', SETTINGS)).body).includes('set-in-the-app'));
  await connected.as(CARLA, 'POST', '/api/assistant/chat', turn);
  check('the next turn goes out on the new key, with what a paste brought round it trimmed off',
    heard.at(-1).headers.authorization === 'Bearer sk-set-in-the-app-0001');
  {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: database.url });
    await client.connect();
    const { rows } = await client.query('select api_key from assistant_settings');
    await client.end();
    const [form, , , body] = rows[0].api_key.split('.');
    check('in the database the key is sealed: the row holds nothing a reader could use',
      rows.length === 1 && form === 'v1' && !rows[0].api_key.includes('sk-set')
      && !Buffer.from(body, 'base64url').toString('latin1').includes('sk-set'));
  }
  const tried = await connected.as(OWNER, 'POST', `${SETTINGS}/check`);
  check('the key can be tried out, with the fewest words that make a turn',
    tried.status === 200 && tried.body.ok === true && heard.at(-1).body.messages.at(-1).content === 'OK?'
    && heard.at(-1).headers.authorization === 'Bearer sk-set-in-the-app-0001');

  for (const [why, bad] of [['too short to be one', 'short'], ['two things pasted as one', 'sk-with a space in it'],
    ['a placeholder nobody pasted over', 'changeme'], ['not text', 42]]) {
    const refused = await connected.as(OWNER, 'PUT', SETTINGS, { key: bad });
    check(`a key that is ${why} is refused, and the one kept stays`,
      refused.status === 400 && (await connected.as(OWNER, 'GET', SETTINGS)).body.key === 'app', JSON.stringify(refused.body));
  }

  // The same database behind a server whose secret is another one: a move, or a secret rotated.
  const OTHER_SECRET = 'a-secret-the-key-was-not-sealed-under';
  const moved = await boot({
    AUTH_SESSION_SECRET: OTHER_SECRET,
    ASSISTANT_API_URL: `http://localhost:${modelPort}/v1/chat/completions`,
    ASSISTANT_API_KEY: 'sk-server-side',
  });
  const movedView = await fetch(`http://localhost:${moved.server.address().port}${SETTINGS}`, {
    headers: { cookie: `domainmap.auth=${seal(OTHER_SECRET, { ...OWNER, iat: Date.now(), exp: Date.now() + 3_600_000 })}` },
  }).then((response) => response.json());
  check('a server whose secret has changed cannot open the key: it says so, and runs on the deployment\'s',
    movedView.keyUnreadable === true && movedView.key === 'deployment' && movedView.connected === true, JSON.stringify(movedView));

  const forgotten = await connected.as(OWNER, 'PUT', SETTINGS, { key: null });
  await connected.as(CARLA, 'POST', '/api/assistant/chat', turn);
  check('the app\'s key can be let go of, and the model is back on the deployment\'s',
    forgotten.body.key === 'deployment' && forgotten.body.keySetAt === null && forgotten.body.keySetBy === null
    && heard.at(-1).headers.authorization === 'Bearer sk-server-side');

  // An address and no key: the deployment never had one, or was given a placeholder.
  const keyless = await boot({ ASSISTANT_API_URL: `http://localhost:${modelPort}/v1/chat/completions`, ASSISTANT_API_KEY: 'paste-me' });
  const waiting = await keyless.as(OWNER, 'GET', SETTINGS);
  check('with an address and no key there is no model, and the settings say a key is what it wants',
    waiting.body.connected === false && waiting.body.key === 'none' && waiting.body.reachable === true
    && waiting.body.keyChangeable === true && (await keyless.as(OWNER, 'GET', '/api/me')).body.assistant === null);
  check('trying it says there is nothing to try', (await keyless.as(OWNER, 'POST', `${SETTINGS}/check`)).body.ok === false);
  const supplied = await keyless.as(OWNER, 'PUT', SETTINGS, { key: 'sk-the-only-key-it-has' });
  await keyless.as(OWNER, 'POST', '/api/assistant/chat', turn);
  check('a key set in the app is all it takes to connect it',
    supplied.body.connected === true && supplied.body.key === 'app'
    && heard.at(-1).headers.authorization === 'Bearer sk-the-only-key-it-has');
  await keyless.as(OWNER, 'PUT', SETTINGS, { key: null });

  // A model that refuses the key, quoting it back the way some do.
  const fussy = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(401, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: `Incorrect API key provided: sk-expi***********ired. Was it ${request.headers.authorization}?` } }));
    });
  });
  const fussyPort = await listening(fussy);
  cleanup.push(() => new Promise((resolve) => { fussy.close(resolve); }));
  const expired = await boot({ ASSISTANT_API_URL: `http://localhost:${fussyPort}/v1/chat/completions`, ASSISTANT_API_KEY: 'sk-expired-long-ago-and-retired' });
  const failed = await expired.as(OWNER, 'POST', `${SETTINGS}/check`);
  check('a key the model refuses is said to be refused, in the model\'s words',
    failed.status === 200 && failed.body.ok === false && failed.body.reason.includes('refused the key'), JSON.stringify(failed.body));
  check('with the key taken out of them, whole or starred',
    !failed.body.reason.includes('sk-expired-long-ago-and-retired') && !failed.body.reason.includes('sk-expi') && !failed.body.reason.includes('ired.'));

  // No secret, no sealing: sign-in off and nothing set.
  const unsealed = await boot({ AUTH_ENABLED: 'false', AUTH_SESSION_SECRET: '', ASSISTANT_API_URL: `http://localhost:${modelPort}/v1/chat/completions`, ASSISTANT_API_KEY: 'sk-server-side' });
  const noSecret = await unsealed.as(null, 'PUT', SETTINGS, { key: 'sk-nowhere-safe-to-keep' });
  check('a server with no secret to seal with will not keep a key, and says what to set',
    noSecret.status === 409 && noSecret.body.error.includes('AUTH_SESSION_SECRET')
    && (await unsealed.as(null, 'GET', SETTINGS)).body.sealable === false, JSON.stringify(noSecret.body));
  check('though it can still be switched off and on',
    (await unsealed.as(null, 'PUT', SETTINGS, { enabled: false })).body.connected === false
    && (await unsealed.as(null, 'PUT', SETTINGS, { enabled: true })).body.connected === true);

  const bare = await boot({});
  check('with no address a key has nowhere to be used, and is not taken',
    (await bare.as(OWNER, 'PUT', SETTINGS, { key: 'sk-with-nowhere-to-go' })).status === 409
    && (await bare.as(OWNER, 'GET', SETTINGS)).body.reachable === false);
  check('with no model connected an owner is told so', (await bare.as(OWNER, 'GET', '/api/me')).body.assistant === null);
  check('and the route is simply not there', (await bare.as(OWNER, 'POST', '/api/assistant/chat', turn)).status === 404);

  // Sign-in off makes whoever is there the administrator, who can spend the key.
  warned.length = 0;
  await boot({ AUTH_ENABLED: 'false', ASSISTANT_API_URL: `http://localhost:${modelPort}/v1`, ASSISTANT_API_KEY: 'k' });
  check('a connected model with sign-in off is warned about at startup',
    warned.some((line) => line.includes('The Assistant is connected') && line.includes('who can reach this server')));

  // A model of the consumer's own, in place of either shape.
  const custom = createDomainMapServer({
    databaseUrl: database.url, storageDir: storage, log: () => {}, warn: () => {},
    env: { AUTH_SESSION_SECRET: SESSION_SECRET, OWNER_EMAILS: 'olivia@contoso.example' },
    assistant: { host: 'in-house', model: 'ours', chat: async ({ messages }) => `heard: ${messages.at(-1).content}` },
  });
  const customPort = await listening(custom);
  cleanup.push(() => new Promise((resolve) => { custom.close(resolve); }));
  const answer = await fetch(`http://localhost:${customPort}/api/assistant/chat`, {
    method: 'POST', headers: { cookie: cookieFor(OWNER), 'Content-Type': 'application/json' }, body: JSON.stringify(turn),
  }).then((response) => response.json());
  check('options.assistant replaces the adapter outright', answer.text === 'heard: Grill it.');
  const own = (method, path, body) => fetch(`http://localhost:${customPort}${path}`, {
    method, headers: { cookie: cookieFor(OWNER), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  }).then(async (response) => ({ status: response.status, body: await response.json().catch(() => null) }));
  check('a model of the consumer\'s own brings its own key: there is none to change, and the settings say so',
    (await own('PUT', SETTINGS, { key: 'sk-not-for-this-model' })).status === 409
    && (await own('GET', SETTINGS)).body.keyChangeable === false);
  await own('PUT', SETTINGS, { enabled: false });
  check('but the switch is the app\'s all the same', (await own('POST', '/api/assistant/chat', turn)).status === 404);
  await own('PUT', SETTINGS, { enabled: true });
} finally {
  for (const step of cleanup.reverse()) await step().catch(() => {});
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exitCode = failures ? 1 : 0;
