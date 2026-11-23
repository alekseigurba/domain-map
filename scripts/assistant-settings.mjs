// What an administrator has said about the Assistant's model from inside the
// app: whether it is switched on, and a key of the app's own for it. One row in
// Postgres, read on every request that needs it, so a change applies at the
// next message anyone sends.
//
// The key is a secret, and is treated as one all the way through. It comes in
// once, over the connection the administrator is signed in on; it is sealed
// before it is written; and the only way back out is `read`, which the server
// calls to talk to the model and for nothing else. No route answers with it,
// no log line carries it, and what the app shows of it is that it is there.
//
// Sealed means encrypted with AES-256-GCM under a key derived from the
// server's own secret, AUTH_SESSION_SECRET, which lives in the deployment and
// not in the database. A copy of the table — a backup, a dump handed to
// someone — holds nothing that can be used. A server with no secret of its own
// has nothing to seal with, and refuses to keep a key rather than keep one in
// the clear. Change the secret and a kept key can no longer be opened: the app
// says so, and an administrator sets it again.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

const failure = (status, message) => Object.assign(new Error(message), { status });

/** The form a sealed key is written in, so that another can follow it and both be told apart. */
const SEAL = 'v1';

/** A key is what a provider issued: one run of printable characters, of a length any of them use. */
const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 4096;

/** What a pipeline variable nobody filled in holds. Kept as a key it would be a model that refuses every message. */
const PLACEHOLDER = /^(paste-me|changeme|todo)$/i;

/**
 * What seals a key and opens it again, from the server's secret — or null
 * where the server has none. The secret is not used as it stands: the key is
 * derived from it for this one purpose, so that nothing sealed here could be
 * opened by something else the secret is used for, or the other way round.
 */
function sealerFrom(secret) {
  if (typeof secret !== 'string' || secret === '') return null;
  const key = Buffer.from(hkdfSync('sha256', secret, 'domain-map', 'the assistant\'s api key', 32));
  return {
    seal(text) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return [SEAL, nonce, cipher.getAuthTag(), body]
        .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
        .join('.');
    },
    /** The key that was sealed, or null for anything this secret did not seal. */
    open(sealed) {
      const [form, nonce, tag, body, ...rest] = String(sealed ?? '').split('.');
      if (form !== SEAL || !nonce || !tag || !body || rest.length > 0) return null;
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
        decipher.setAuthTag(Buffer.from(tag, 'base64url'));
        return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
      } catch {
        return null;
      }
    },
  };
}

/** A key as it is kept: what was pasted, without the blank or the line break a paste brings with it. */
function checkedKey(value) {
  if (typeof value !== 'string') throw failure(400, 'A key is text.');
  const key = value.trim();
  if (key.length < MIN_KEY_LENGTH || key.length > MAX_KEY_LENGTH) {
    throw failure(400, `A key is ${MIN_KEY_LENGTH} to ${MAX_KEY_LENGTH} characters.`);
  }
  // A space or a line break in the middle is two things pasted as one.
  if (!/^[\x21-\x7e]+$/.test(key)) throw failure(400, 'A key is one run of letters, digits and punctuation, with no spaces in it.');
  if (PLACEHOLDER.test(key) || key.startsWith('$(')) throw failure(400, 'That is a placeholder, not a key.');
  return key;
}

export function assistantSettings(pool, { secret } = {}) {
  const sealer = sealerFrom(secret);

  /**
   * The settings as the server uses them, the key included. For talking to
   * the model and nothing else: what a person is shown is made from this by
   * the caller, and leaves the key out.
   *
   * `kept` says a key is stored; `key` is that key, or null where there is
   * none or where it cannot be opened — sealed under a secret the server no
   * longer has.
   */
  async function read() {
    const { rows } = await pool.query(`select s.enabled, s.api_key, s.key_set_at, p.name as key_set_by
      from assistant_settings s left join people p on p.id = s.key_set_by`);
    const row = rows[0];
    return {
      enabled: row?.enabled ?? true,
      kept: row?.api_key != null,
      key: row?.api_key != null ? sealer?.open(row.api_key) ?? null : null,
      keySetAt: row?.key_set_at?.toISOString() ?? null,
      keySetBy: row?.key_set_by ?? null,
    };
  }

  async function setEnabled(enabled) {
    if (typeof enabled !== 'boolean') throw failure(400, 'The model is switched on or off: true or false.');
    await pool.query('update assistant_settings set enabled = $1', [enabled]);
  }

  /** Keep a new key, sealed, in place of whatever was kept. `by` is the person setting it. */
  async function setKey(value, by) {
    const key = checkedKey(value);
    if (!sealer) {
      throw failure(409, 'This server has no secret to seal a key with, so it will not keep one. '
        + 'Set AUTH_SESSION_SECRET in its environment — any long random text — and start it again.');
    }
    await pool.query('update assistant_settings set api_key = $1, key_set_at = now(), key_set_by = $2',
      [sealer.seal(key), by?.id ?? null]);
  }

  /** Let go of the kept key. The model goes back to the deployment's own, if it has one. */
  async function forgetKey() {
    await pool.query('update assistant_settings set api_key = null, key_set_at = null, key_set_by = null');
  }

  return { read, setEnabled, setKey, forgetKey, seals: sealer !== null };
}
