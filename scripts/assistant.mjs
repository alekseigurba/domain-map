// The model behind the Assistant, when there is one. Two variables connect it —
// ASSISTANT_API_URL and ASSISTANT_API_KEY — and without both the Assistant is
// what it was before: a prompt to copy and a reply to paste.
//
// The server is only ever a relay. The page writes the prompt, because the page
// is where the map and the skills are; this posts it on with a key the browser
// never sees, and hands the answer back as text. Nothing here changes a map.
//
// Two request shapes cover what is out there. `openai` is chat completions, the
// one nearly everything answers: OpenAI, Azure OpenAI, Azure AI Foundry, a
// LiteLLM or API Management gateway, OpenRouter, Groq, Ollama. `anthropic` is
// the Messages API. Plain fetch for both, so `pg` stays the only dependency
// every consumer repo installs. Anything else is `options.assistant`, a
// `{ chat, host, model }` of the consumer's own.

/** Long enough for a model to review a whole map, short of the 240s an Azure ingress allows. */
const TIMEOUT_MS = 120_000;

/** What a reply may run to. Sixteen thousand tokens is thirty cards with their reasoning. */
const MAX_REPLY_TOKENS = 16_000;

/** The Messages API wants a model named; a chat-completions URL often has it in the path. */
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';

const ANTHROPIC_HOST = 'api.anthropic.com';

/**
 * What a model is called there: a full id, not the family's name. Said in an
 * error rather than mapped from "haiku" in code, because a table of nicknames
 * would go on meaning last year's model after this year's had shipped.
 */
const ANTHROPIC_IDS = 'claude-haiku-4-5, claude-sonnet-5 or claude-opus-5';

/** Worth one more try: rate limits, and a server having a bad moment. 529 is Anthropic's "overloaded". */
const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

const failure = (status, message) => Object.assign(new Error(message), { status });

/** A pipeline variable nobody has filled in yet arrives as the placeholder it was created with. */
const given = (value) => {
  const text = value?.trim() ?? '';
  return text === '' || /^(paste-me|changeme|todo)$/i.test(text) || text.startsWith('$(') ? '' : text;
};

/** Which shape a URL speaks, when nobody has said: Anthropic's host, or a path ending in /messages. */
function styleOf(url) {
  const { hostname, pathname } = new URL(url);
  return hostname.includes('anthropic') || /\/messages\/?$/.test(pathname) ? 'anthropic' : 'openai';
}

function openaiRequest({ key, model }, { system, messages }) {
  return {
    // A gateway wants one header and Azure wants the other; neither minds the spare.
    headers: { Authorization: `Bearer ${key}`, 'api-key': key },
    body: {
      ...(model ? { model } : {}),
      messages: [{ role: 'system', content: system }, ...messages],
    },
    read(answer) {
      const choice = answer.choices?.[0];
      const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';
      if (choice?.message?.refusal) return `The model declined: ${choice.message.refusal}`;
      if (text === '') throw failure(502, 'The model answered with nothing.');
      return choice.finish_reason === 'length' ? `${text}\n\n(The reply was cut off at the model's length limit.)` : text;
    },
  };
}

function anthropicRequest({ key, model, host }, { system, messages }) {
  // A declined request is re-run on the model Anthropic recommends for that kind
  // of refusal, inside the same call. First-party only, and only for the models
  // that have it: a gateway, or another model, rejects the parameter outright.
  const fallbacks = host === ANTHROPIC_HOST && /^claude-(opus-5|fable-5)/.test(model);
  return {
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      ...(fallbacks ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
    },
    body: {
      model,
      max_tokens: MAX_REPLY_TOKENS,
      system,
      messages,
      ...(fallbacks ? { fallbacks: 'default' } : {}),
    },
    read(answer) {
      // Checked before the content is read: a refusal is a 200 with nothing in it.
      if (answer.stop_reason === 'refusal') {
        return `The model declined to answer${answer.stop_details?.explanation ? `: ${answer.stop_details.explanation}` : '.'}`;
      }
      const text = (answer.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      if (text === '') throw failure(502, 'The model answered with nothing.');
      return answer.stop_reason === 'max_tokens' ? `${text}\n\n(The reply was cut off at ${MAX_REPLY_TOKENS} tokens.)` : text;
    },
  };
}

/** Why the API said no, in its own words: both shapes put a message under `error`. */
async function reasonOf(response) {
  const text = await response.text().catch(() => '');
  try {
    const body = JSON.parse(text);
    return body.error?.message ?? body.message ?? text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * What the Assistant is connected to, from the environment.
 *
 * @returns `{ connected, host, model, style, chat, warnings }`. `chat` takes
 *   `{ system, messages }` and answers with the model's text; unconnected, there
 *   is none.
 */
export function createAssistant(env = process.env, { fetch: fetch_ = fetch } = {}) {
  const url = given(env.ASSISTANT_API_URL);
  const key = given(env.ASSISTANT_API_KEY);
  const unconnected = (warnings = []) => ({ connected: false, host: null, model: null, style: null, warnings });

  if (!url && !key) return unconnected();
  if (!url || !key) {
    return unconnected([`ASSISTANT_API_${url ? 'KEY' : 'URL'} is not set, so the Assistant has no model: it takes both.`]);
  }

  let host;
  try {
    ({ host } = new URL(url));
  } catch {
    return unconnected(['ASSISTANT_API_URL is not a URL, so the Assistant has no model.']);
  }

  const named = given(env.ASSISTANT_API_STYLE).toLowerCase();
  if (named && named !== 'openai' && named !== 'anthropic') {
    return unconnected([`ASSISTANT_API_STYLE is "${named}"; it is openai or anthropic. The Assistant has no model.`]);
  }
  const style = named || styleOf(url);
  const model = given(env.ASSISTANT_MODEL) || (style === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : null);
  const shape = style === 'anthropic' ? anthropicRequest : openaiRequest;

  // Still connected: the API is the judge of what it serves, and says so on the
  // first message. But whoever set the variable is reading the startup lines now.
  const warnings = style === 'anthropic' && host === ANTHROPIC_HOST && !model.startsWith('claude-')
    ? [`ASSISTANT_MODEL is "${model}", and Anthropic's API takes a full model id, such as ${ANTHROPIC_IDS}.`]
    : [];

  async function chat(conversation, { signal } = {}) {
    const request = shape({ key, model, host }, conversation);
    const send = () => fetch_(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...request.headers },
      body: JSON.stringify(request.body),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
    });

    let response;
    try {
      response = await send();
      if (RETRYABLE.has(response.status)) {
        // Once, after as long as the server asks for, within reason.
        const asked = Number(response.headers.get('retry-after'));
        await wait(Math.min(Number.isFinite(asked) && asked > 0 ? asked * 1000 : 2000, 20_000));
        response = await send();
      }
    } catch (error) {
      if (error.name === 'TimeoutError') throw failure(504, `The model did not answer within ${TIMEOUT_MS / 1000} seconds.`);
      throw failure(502, `The model at ${host} could not be reached: ${error.message}`);
    }

    if (!response.ok) {
      const reason = await reasonOf(response);
      // The key is the deployment's, not the owner's, so a 401 is not theirs to fix.
      // Both APIs answer an unknown model with a 404 that names it, which reads
      // as though the address were wrong. It is the setting that is.
      if (response.status === 404 && model && reason.includes(model)) {
        throw failure(502, `${host} has no model called "${model}". ASSISTANT_MODEL takes the API's own id for one`
          + `${style === 'anthropic' ? `, such as ${ANTHROPIC_IDS}` : ''}.`);
      }
      const what = response.status === 401 || response.status === 403
        ? `The model at ${host} refused the key it was given`
        : `The model at ${host} answered ${response.status}`;
      throw failure(502, `${what}${reason ? `: ${reason}` : '.'}`);
    }
    return request.read(await response.json());
  }

  return { connected: true, host, model, style, chat, warnings };
}
